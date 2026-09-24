import http from 'node:http';

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.BRAWL_API_TOKEN || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://kalidgpt-sketch.github.io';
const API_BASE = 'https://api.brawlstars.com/v1';
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 45;
const CACHE_TTL_MS = 120_000;

const rateBuckets = new Map();
const cache = new Map();

function setSecurityHeaders(res, origin) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (origin && origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
}

function json(res, status, body, origin, cacheControl = 'no-store') {
  setSecurityHeaders(res, origin);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl);
  res.end(JSON.stringify(body));
}

function clientIp(req) {
  const fly = req.headers['fly-client-ip'];
  if (typeof fly === 'string' && fly) return fly;
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function requestOrigin(req) {
  const origin = req.headers.origin;
  return typeof origin === 'string' ? origin : '';
}

function rateLimit(req) {
  const ip = clientIp(req);
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    bucket = { startedAt: now, count: 0 };
  }
  bucket.count += 1;
  rateBuckets.set(ip, bucket);
  if (rateBuckets.size > 5000) {
    for (const [key, value] of rateBuckets) {
      if (now - value.startedAt >= RATE_WINDOW_MS * 2) rateBuckets.delete(key);
    }
  }
  return bucket.count <= RATE_MAX;
}

function normalizeTag(value = '') {
  return String(value).trim().toUpperCase().replace(/^#/, '');
}

function isValidTag(tag) {
  return /^[0289PYLQGRJCUV]{3,14}$/.test(tag);
}

function safePlayer(data) {
  return {
    tag: data.tag,
    name: data.name,
    nameColor: data.nameColor,
    icon: data.icon ? { id: data.icon.id } : undefined,
    trophies: data.trophies,
    highestTrophies: data.highestTrophies,
    expLevel: data.expLevel,
    expPoints: data.expPoints,
    soloVictories: data.soloVictories,
    duoVictories: data.duoVictories,
    '3vs3Victories': data['3vs3Victories'],
    club: data.club ? { tag: data.club.tag, name: data.club.name } : undefined,
    brawlers: Array.isArray(data.brawlers) ? data.brawlers.map((b) => ({
      id: b.id,
      name: b.name,
      power: b.power,
      rank: b.rank,
      trophies: b.trophies,
      highestTrophies: b.highestTrophies,
      gadgets: Array.isArray(b.gadgets) ? b.gadgets.map((x) => ({ id: x.id, name: x.name })) : [],
      starPowers: Array.isArray(b.starPowers) ? b.starPowers.map((x) => ({ id: x.id, name: x.name })) : [],
      gears: Array.isArray(b.gears) ? b.gears.map((x) => ({ id: x.id, name: x.name, level: x.level })) : []
    })) : []
  };
}

async function fetchPlayer(tag) {
  const cached = cache.get(tag);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(`${API_BASE}/players/%23${encodeURIComponent(tag)}`, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/json',
        'User-Agent': 'GG-Radar/1.0'
      },
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.message || 'Brawl Stars API error');
      error.status = response.status;
      throw error;
    }
    const value = safePlayer(body);
    cache.set(tag, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    if (cache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of cache) if (value.expiresAt <= now) cache.delete(key);
    }
    return value;
  } finally {
    clearTimeout(timeout);
  }
}

const server = http.createServer(async (req, res) => {
  const origin = requestOrigin(req);
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    if (origin !== ALLOWED_ORIGIN) return json(res, 403, { message: 'Origen no permitido.' }, origin);
    setSecurityHeaders(res, origin);
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Accept');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.end();
  }

  if (req.method !== 'GET') return json(res, 405, { message: 'Método no permitido.' }, origin);

  if (url.pathname === '/health') {
    return json(res, 200, { ok: true, apiConfigured: Boolean(TOKEN) }, origin);
  }

  if (url.pathname !== '/api/player') return json(res, 404, { message: 'No encontrado.' }, origin);
  if (origin && origin !== ALLOWED_ORIGIN) return json(res, 403, { message: 'Origen no permitido.' }, origin);
  if (!rateLimit(req)) return json(res, 429, { message: 'Demasiadas consultas. Prueba de nuevo en un minuto.' }, origin);

  const tag = normalizeTag(url.searchParams.get('tag'));
  if (!tag) return json(res, 400, { message: 'Falta el Player Tag.' }, origin);
  if (!isValidTag(tag)) return json(res, 400, { message: 'El Player Tag no parece válido.' }, origin);
  if (!TOKEN) return json(res, 503, { message: 'Backend configurado, pero falta BRAWL_API_TOKEN.' }, origin);

  try {
    const player = await fetchPlayer(tag);
    return json(res, 200, player, origin, 'public, max-age=60, s-maxage=120');
  } catch (error) {
    if (error?.name === 'AbortError') return json(res, 504, { message: 'La API de Brawl Stars tardó demasiado en responder.' }, origin);
    if (error?.status === 404) return json(res, 404, { message: 'No se encontró ese Player Tag.' }, origin);
    if (error?.status === 429) return json(res, 503, { message: 'La API oficial está limitando temporalmente las consultas.' }, origin);
    if (error?.status === 403) return json(res, 502, { message: 'La clave de Brawl Stars no está autorizada para la IP de este servidor.' }, origin);
    console.error('Upstream error:', error?.status || error?.name || 'unknown');
    return json(res, 502, { message: 'No se pudo consultar la API oficial de Brawl Stars.' }, origin);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`GG Radar API escuchando en 0.0.0.0:${PORT}`);
});
