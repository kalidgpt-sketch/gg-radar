import http from 'node:http';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const API_BASE = 'https://api.brawlstars.com/v1';
const TAG_RE = /^[0289PYLQGRJCUV]{3,20}$/;

function intEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function parseOrigins(value) {
  return new Set(String(value || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean));
}

export function normalizeTag(value) {
  if (value == null) return '';
  let tag = String(value).trim().toUpperCase();
  if (tag.startsWith('%23')) tag = tag.slice(3);
  if (tag.startsWith('#')) tag = tag.slice(1);
  // Supercell tags use zero, never the letter O. This makes manual entry friendlier.
  return tag.replaceAll('O', '0');
}

export function validatePlayerTag(value) {
  const tag = normalizeTag(value);
  if (!tag) {
    return { ok: false, code: 'MISSING_PLAYER_TAG', message: 'Falta el Player Tag.' };
  }
  if (!TAG_RE.test(tag)) {
    return {
      ok: false,
      code: 'INVALID_PLAYER_TAG',
      message: 'El Player Tag no es válido. Usa solo 0, 2, 8, 9, P, Y, L, Q, G, R, J, C, U y V.'
    };
  }
  return { ok: true, tag };
}

export function safePlayer(data = {}) {
  return {
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    name: typeof data.name === 'string' ? data.name : undefined,
    nameColor: typeof data.nameColor === 'string' ? data.nameColor : undefined,
    icon: data.icon && Number.isFinite(Number(data.icon.id)) ? { id: Number(data.icon.id) } : undefined,
    trophies: Number.isFinite(Number(data.trophies)) ? Number(data.trophies) : 0,
    highestTrophies: Number.isFinite(Number(data.highestTrophies)) ? Number(data.highestTrophies) : 0,
    expLevel: Number.isFinite(Number(data.expLevel)) ? Number(data.expLevel) : undefined,
    expPoints: Number.isFinite(Number(data.expPoints)) ? Number(data.expPoints) : undefined,
    soloVictories: Number.isFinite(Number(data.soloVictories)) ? Number(data.soloVictories) : undefined,
    duoVictories: Number.isFinite(Number(data.duoVictories)) ? Number(data.duoVictories) : undefined,
    '3vs3Victories': Number.isFinite(Number(data['3vs3Victories'])) ? Number(data['3vs3Victories']) : undefined,
    club: data.club && typeof data.club === 'object'
      ? {
          tag: typeof data.club.tag === 'string' ? data.club.tag : undefined,
          name: typeof data.club.name === 'string' ? data.club.name : undefined
        }
      : undefined,
    brawlers: Array.isArray(data.brawlers)
      ? data.brawlers.map((b) => ({
          id: Number.isFinite(Number(b.id)) ? Number(b.id) : undefined,
          name: typeof b.name === 'string' ? b.name : undefined,
          power: Number.isFinite(Number(b.power)) ? Number(b.power) : 0,
          rank: Number.isFinite(Number(b.rank)) ? Number(b.rank) : 0,
          trophies: Number.isFinite(Number(b.trophies)) ? Number(b.trophies) : 0,
          highestTrophies: Number.isFinite(Number(b.highestTrophies)) ? Number(b.highestTrophies) : 0,
          gadgets: Array.isArray(b.gadgets)
            ? b.gadgets.map((x) => ({ id: x.id, name: x.name })).filter((x) => x.name)
            : [],
          starPowers: Array.isArray(b.starPowers)
            ? b.starPowers.map((x) => ({ id: x.id, name: x.name })).filter((x) => x.name)
            : [],
          gears: Array.isArray(b.gears)
            ? b.gears.map((x) => ({ id: x.id, name: x.name, level: x.level })).filter((x) => x.name)
            : []
        }))
      : []
  };
}

class HttpError extends Error {
  constructor(status, code, message, options = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.retryAfter = options.retryAfter;
    this.upstreamStatus = options.upstreamStatus;
    this.cacheStatus = options.cacheStatus;
  }
}

function readRetryAfter(response) {
  const raw = response.headers.get('retry-after');
  if (!raw) return undefined;
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 300) : undefined;
}

function mapUpstreamError(status, message, retryAfter) {
  if (status === 404) {
    return new HttpError(404, 'PLAYER_NOT_FOUND', 'No se encontró ese Player Tag.', { upstreamStatus: status });
  }
  if (status === 400) {
    return new HttpError(400, 'INVALID_PLAYER_TAG', 'La API oficial rechazó el Player Tag.', { upstreamStatus: status });
  }
  if (status === 401 || status === 403) {
    return new HttpError(
      503,
      'UPSTREAM_AUTH_FAILED',
      'La conexión con la API oficial de Brawl Stars todavía no está autorizada.',
      { upstreamStatus: status }
    );
  }
  if (status === 429) {
    return new HttpError(
      503,
      'UPSTREAM_RATE_LIMITED',
      'La API oficial está limitando temporalmente las consultas.',
      { upstreamStatus: status, retryAfter: retryAfter || 60 }
    );
  }
  if (status >= 500) {
    return new HttpError(
      502,
      'UPSTREAM_UNAVAILABLE',
      'La API oficial de Brawl Stars no está disponible temporalmente.',
      { upstreamStatus: status }
    );
  }
  return new HttpError(
    502,
    'UPSTREAM_ERROR',
    'No se pudo consultar la API oficial de Brawl Stars.',
    { upstreamStatus: status }
  );
}

function isStaleEligible(error) {
  return ['UPSTREAM_RATE_LIMITED', 'UPSTREAM_UNAVAILABLE', 'UPSTREAM_TIMEOUT', 'UPSTREAM_NETWORK'].includes(error?.code);
}

function createRateLimiter({ windowMs, max }) {
  const buckets = new Map();

  function prune(now) {
    if (buckets.size < 5000) return;
    for (const [key, value] of buckets) {
      if (now - value.startedAt >= windowMs * 2) buckets.delete(key);
    }
  }

  return function consume(ip) {
    const now = Date.now();
    let bucket = buckets.get(ip);
    if (!bucket || now - bucket.startedAt >= windowMs) {
      bucket = { startedAt: now, count: 0 };
    }
    bucket.count += 1;
    buckets.set(ip, bucket);
    prune(now);

    const remaining = Math.max(0, max - bucket.count);
    const resetSeconds = Math.max(1, Math.ceil((bucket.startedAt + windowMs - now) / 1000));
    return {
      allowed: bucket.count <= max,
      limit: max,
      remaining,
      resetSeconds
    };
  };
}

function clientIp(req, trustForwardedFor = false) {
  const fly = req.headers['fly-client-ip'];
  if (typeof fly === 'string' && fly.trim()) return fly.trim();

  if (trustForwardedFor) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  }

  return req.socket.remoteAddress || 'unknown';
}

function requestOrigin(req) {
  const origin = req.headers.origin;
  return typeof origin === 'string' ? origin : '';
}

function setSecurityHeaders(res, origin, allowedOrigins, requestId) {
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
}

function json(res, status, body, context, options = {}) {
  setSecurityHeaders(res, context.origin, context.allowedOrigins, context.requestId);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', options.cacheControl || 'no-store');
  if (options.cacheStatus) res.setHeader('X-Cache', options.cacheStatus);
  if (options.retryAfter) res.setHeader('Retry-After', String(options.retryAfter));
  if (options.rate) {
    res.setHeader('RateLimit-Limit', String(options.rate.limit));
    res.setHeader('RateLimit-Remaining', String(options.rate.remaining));
    res.setHeader('RateLimit-Reset', String(options.rate.resetSeconds));
  }
  res.end(JSON.stringify(body));
}

function publicErrorBody(error, requestId) {
  return {
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'Error interno.'
    },
    requestId
  };
}

function createPlayerService({
  token,
  fetchImpl,
  cacheTtlMs,
  negativeCacheTtlMs,
  staleTtlMs,
  cacheMaxEntries,
  upstreamTimeoutMs
}) {
  const cache = new Map();
  const negativeCache = new Map();
  const inFlight = new Map();

  function prune() {
    const now = Date.now();

    for (const [key, entry] of negativeCache) {
      if (entry.expiresAt <= now) negativeCache.delete(key);
    }

    for (const [key, entry] of cache) {
      if (entry.staleUntil <= now) cache.delete(key);
    }

    while (cache.size > cacheMaxEntries) {
      cache.delete(cache.keys().next().value);
    }
    while (negativeCache.size > Math.max(100, Math.floor(cacheMaxEntries / 4))) {
      negativeCache.delete(negativeCache.keys().next().value);
    }
  }

  async function upstreamFetch(tag) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), upstreamTimeoutMs);

    try {
      const response = await fetchImpl(`${API_BASE}/players/${encodeURIComponent('#' + tag)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'User-Agent': 'GG-Radar/1.0'
        },
        signal: controller.signal
      });

      const retryAfter = readRetryAfter(response);
      const text = await response.text();
      let body = {};
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          if (response.ok) {
            throw new HttpError(502, 'UPSTREAM_INVALID_RESPONSE', 'La API oficial devolvió una respuesta no válida.');
          }
        }
      }

      if (!response.ok) {
        throw mapUpstreamError(response.status, body?.message, retryAfter);
      }

      return safePlayer(body);
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new HttpError(504, 'UPSTREAM_TIMEOUT', 'La API de Brawl Stars tardó demasiado en responder.');
      }
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, 'UPSTREAM_NETWORK', 'No se pudo conectar con la API oficial de Brawl Stars.');
    } finally {
      clearTimeout(timeout);
    }
  }

  async function load(tag) {
    const now = Date.now();
    const fresh = cache.get(tag);
    if (fresh && fresh.freshUntil > now) {
      return { value: fresh.value, cacheStatus: 'HIT' };
    }

    const negative = negativeCache.get(tag);
    if (negative && negative.expiresAt > now) {
      throw new HttpError(404, 'PLAYER_NOT_FOUND', 'No se encontró ese Player Tag.', { cacheStatus: 'HIT' });
    }

    if (inFlight.has(tag)) {
      const result = await inFlight.get(tag);
      return { ...result, cacheStatus: 'COALESCED' };
    }

    const stale = fresh && fresh.staleUntil > now ? fresh.value : null;

    const promise = (async () => {
      try {
        const value = await upstreamFetch(tag);
        const storedAt = Date.now();
        cache.delete(tag);
        cache.set(tag, {
          value,
          freshUntil: storedAt + cacheTtlMs,
          staleUntil: storedAt + cacheTtlMs + staleTtlMs
        });
        negativeCache.delete(tag);
        prune();
        return { value, cacheStatus: 'MISS' };
      } catch (error) {
        if (error?.code === 'PLAYER_NOT_FOUND') {
          negativeCache.set(tag, { expiresAt: Date.now() + negativeCacheTtlMs });
          prune();
        }
        if (stale && isStaleEligible(error)) {
          return { value: stale, cacheStatus: 'STALE' };
        }
        throw error;
      }
    })();

    inFlight.set(tag, promise);
    try {
      return await promise;
    } finally {
      inFlight.delete(tag);
    }
  }

  return { load };
}

export function createApiServer(options = {}) {
  const token = String(options.token ?? process.env.BRAWL_API_TOKEN ?? '').trim();
  const allowedOrigins = options.allowedOrigins || parseOrigins(
    process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || 'https://kalidgpt-sketch.github.io'
  );
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const trustForwardedFor = options.trustForwardedFor ?? process.env.TRUST_X_FORWARDED_FOR === 'true';

  const rateWindowMs = options.rateWindowMs ?? intEnv('RATE_WINDOW_MS', 60_000, 1_000, 3_600_000);
  const rateMax = options.rateMax ?? intEnv('RATE_MAX', 45, 1, 10_000);
  const cacheTtlMs = options.cacheTtlMs ?? intEnv('CACHE_TTL_MS', 120_000, 5_000, 3_600_000);
  const negativeCacheTtlMs = options.negativeCacheTtlMs ?? intEnv('NEGATIVE_CACHE_TTL_MS', 30_000, 1_000, 600_000);
  const staleTtlMs = options.staleTtlMs ?? intEnv('STALE_TTL_MS', 300_000, 0, 3_600_000);
  const cacheMaxEntries = options.cacheMaxEntries ?? intEnv('CACHE_MAX_ENTRIES', 1000, 10, 100_000);
  const upstreamTimeoutMs = options.upstreamTimeoutMs ?? intEnv('UPSTREAM_TIMEOUT_MS', 6500, 1000, 30_000);

  const consumeRate = createRateLimiter({ windowMs: rateWindowMs, max: rateMax });
  const players = createPlayerService({
    token,
    fetchImpl,
    cacheTtlMs,
    negativeCacheTtlMs,
    staleTtlMs,
    cacheMaxEntries,
    upstreamTimeoutMs
  });

  return http.createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    const origin = requestOrigin(req);
    const context = { origin, allowedOrigins, requestId };

    let url;
    try {
      url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    } catch {
      return json(res, 400, publicErrorBody(new HttpError(400, 'BAD_REQUEST', 'Solicitud no válida.'), requestId), context);
    }

    if (req.method === 'OPTIONS') {
      if (!origin || !allowedOrigins.has(origin)) {
        return json(res, 403, publicErrorBody(new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'Origen no permitido.'), requestId), context);
      }
      setSecurityHeaders(res, origin, allowedOrigins, requestId);
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Accept');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.end();
    }

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS');
      return json(res, 405, publicErrorBody(new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método no permitido.'), requestId), context);
    }

    if (url.pathname === '/health') {
      return json(res, 200, { ok: true, apiConfigured: Boolean(token) }, context);
    }

    if (url.pathname === '/ready') {
      if (!token) {
        return json(
          res,
          503,
          publicErrorBody(new HttpError(503, 'API_NOT_CONFIGURED', 'Falta configurar la API oficial.'), requestId),
          context
        );
      }
      return json(res, 200, { ok: true }, context);
    }

    if (url.pathname !== '/api/player') {
      return json(res, 404, publicErrorBody(new HttpError(404, 'NOT_FOUND', 'No encontrado.'), requestId), context);
    }

    if (origin && !allowedOrigins.has(origin)) {
      return json(res, 403, publicErrorBody(new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'Origen no permitido.'), requestId), context);
    }

    const rate = consumeRate(clientIp(req, trustForwardedFor));
    if (!rate.allowed) {
      return json(
        res,
        429,
        publicErrorBody(new HttpError(429, 'RATE_LIMITED', 'Demasiadas consultas. Prueba de nuevo en un minuto.'), requestId),
        context,
        { rate, retryAfter: rate.resetSeconds }
      );
    }

    const tagParams = url.searchParams.getAll('tag');
    if (tagParams.length !== 1) {
      const error = tagParams.length === 0
        ? new HttpError(400, 'MISSING_PLAYER_TAG', 'Falta el Player Tag.')
        : new HttpError(400, 'INVALID_PLAYER_TAG', 'Envía un único Player Tag.');
      return json(res, 400, publicErrorBody(error, requestId), context, { rate });
    }

    const validation = validatePlayerTag(tagParams[0]);
    if (!validation.ok) {
      return json(
        res,
        400,
        publicErrorBody(new HttpError(400, validation.code, validation.message), requestId),
        context,
        { rate }
      );
    }

    if (!token) {
      return json(
        res,
        503,
        publicErrorBody(new HttpError(503, 'API_NOT_CONFIGURED', 'Backend listo, pero falta conectar la clave oficial.'), requestId),
        context,
        { rate }
      );
    }

    try {
      const result = await players.load(validation.tag);
      return json(res, 200, result.value, context, {
        rate,
        cacheStatus: result.cacheStatus,
        cacheControl: 'private, max-age=30'
      });
    } catch (error) {
      const safe = error instanceof HttpError
        ? error
        : new HttpError(500, 'INTERNAL_ERROR', 'Error interno.');

      if (safe.upstreamStatus || safe.code === 'UPSTREAM_NETWORK' || safe.code === 'UPSTREAM_TIMEOUT') {
        console.error(JSON.stringify({
          level: 'error',
          requestId,
          code: safe.code,
          upstreamStatus: safe.upstreamStatus || null
        }));
      }

      return json(res, safe.status || 500, publicErrorBody(safe, requestId), context, {
        rate,
        retryAfter: safe.retryAfter,
        cacheStatus: safe.cacheStatus
      });
    }
  });
}

export function startServer() {
  const port = intEnv('PORT', 8080, 1, 65535);
  const server = createApiServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`GG Radar API escuchando en 0.0.0.0:${port}`);
  });
  return server;
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) startServer();
