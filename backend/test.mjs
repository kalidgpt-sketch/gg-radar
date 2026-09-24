import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApiServer, normalizeTag, validatePlayerTag, safePlayer } from './server.mjs';

async function withServer(options, fn) {
  const server = createApiServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

test('normalizeTag handles missing hash, whitespace and O -> 0', () => {
  assert.equal(normalizeTag(null), '');
  assert.equal(normalizeTag('  #2pqrO9  '), '2PQR09');
  assert.equal(normalizeTag('%232PQRV9'), '2PQRV9');
});

test('validatePlayerTag accepts the Supercell alphabet and rejects invalid characters', () => {
  assert.deepEqual(validatePlayerTag('#2PQRV9'), { ok: true, tag: '2PQRV9' });
  assert.equal(validatePlayerTag('').code, 'MISSING_PLAYER_TAG');
  assert.equal(validatePlayerTag('#ABC123').code, 'INVALID_PLAYER_TAG');
  assert.equal(validatePlayerTag('#22').code, 'INVALID_PLAYER_TAG');
});

test('safePlayer exposes only the fields GG Radar needs', () => {
  const player = safePlayer({
    tag: '#2PQRV9',
    name: 'Test',
    trophies: 1234,
    highestTrophies: 1500,
    unknownSecretField: 'do-not-expose',
    brawlers: [{ id: 1, name: 'SHELLY', power: 11, trophies: 900, highestTrophies: 950, extra: 'x' }]
  });
  assert.equal(player.name, 'Test');
  assert.equal(player.trophies, 1234);
  assert.equal('unknownSecretField' in player, false);
  assert.equal('extra' in player.brawlers[0], false);
});

test('missing tag returns a stable 400 error code', async () => {
  await withServer({ token: 'test', allowedOrigins: new Set(['https://example.com']) }, async (base) => {
    const response = await fetch(`${base}/api/player`);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'MISSING_PLAYER_TAG');
    assert.ok(body.requestId);
  });
});

test('disallowed browser origin is rejected before upstream access', async () => {
  let calls = 0;
  await withServer({
    token: 'test',
    allowedOrigins: new Set(['https://allowed.example']),
    fetchImpl: async () => { calls += 1; return jsonResponse({}); }
  }, async (base) => {
    const response = await fetch(`${base}/api/player?tag=2PQRV9`, {
      headers: { Origin: 'https://evil.example' }
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'ORIGIN_NOT_ALLOWED');
    assert.equal(calls, 0);
  });
});

test('token is sent upstream and never returned to the client', async () => {
  const token = 'super-secret-token';
  let authHeader = '';
  await withServer({
    token,
    allowedOrigins: new Set(),
    fetchImpl: async (_url, init) => {
      authHeader = init.headers.Authorization;
      return jsonResponse({
        tag: '#2PQRV9',
        name: 'Jugador',
        trophies: 1000,
        highestTrophies: 1100,
        brawlers: []
      });
    }
  }, async (base) => {
    const response = await fetch(`${base}/api/player?tag=2PQRV9`);
    assert.equal(response.status, 200);
    assert.equal(authHeader, `Bearer ${token}`);
    const text = await response.text();
    assert.equal(text.includes(token), false);
  });
});

test('successful player lookups are cached', async () => {
  let calls = 0;
  await withServer({
    token: 'test',
    allowedOrigins: new Set(),
    cacheTtlMs: 60_000,
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({
        tag: '#2PQRV9',
        name: 'Cache Test',
        trophies: 100,
        highestTrophies: 120,
        brawlers: []
      });
    }
  }, async (base) => {
    const first = await fetch(`${base}/api/player?tag=2PQRV9`);
    const second = await fetch(`${base}/api/player?tag=2PQRV9`);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.headers.get('x-cache'), 'MISS');
    assert.equal(second.headers.get('x-cache'), 'HIT');
    assert.equal(calls, 1);
  });
});

test('simultaneous requests for the same tag are coalesced', async () => {
  let calls = 0;
  await withServer({
    token: 'test',
    allowedOrigins: new Set(),
    fetchImpl: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return jsonResponse({
        tag: '#2PQRV9',
        name: 'Coalesce',
        trophies: 100,
        highestTrophies: 100,
        brawlers: []
      });
    }
  }, async (base) => {
    const [a, b] = await Promise.all([
      fetch(`${base}/api/player?tag=2PQRV9`),
      fetch(`${base}/api/player?tag=2PQRV9`)
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(calls, 1);
    assert.ok(['MISS', 'COALESCED'].includes(a.headers.get('x-cache')));
    assert.ok(['MISS', 'COALESCED'].includes(b.headers.get('x-cache')));
  });
});

test('404 responses are negative-cached', async () => {
  let calls = 0;
  await withServer({
    token: 'test',
    allowedOrigins: new Set(),
    negativeCacheTtlMs: 60_000,
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ reason: 'notFound', message: 'Not found' }, 404);
    }
  }, async (base) => {
    const first = await fetch(`${base}/api/player?tag=2PQRV9`);
    const second = await fetch(`${base}/api/player?tag=2PQRV9`);
    assert.equal(first.status, 404);
    assert.equal(second.status, 404);
    assert.equal((await first.json()).error.code, 'PLAYER_NOT_FOUND');
    assert.equal((await second.json()).error.code, 'PLAYER_NOT_FOUND');
    assert.equal(calls, 1);
  });
});

test('missing production token returns 503 without calling upstream', async () => {
  let calls = 0;
  await withServer({
    token: '',
    allowedOrigins: new Set(),
    fetchImpl: async () => { calls += 1; return jsonResponse({}); }
  }, async (base) => {
    const response = await fetch(`${base}/api/player?tag=2PQRV9`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'API_NOT_CONFIGURED');
    assert.equal(calls, 0);
  });
});

test('rate limiting returns 429 and Retry-After', async () => {
  await withServer({
    token: 'test',
    allowedOrigins: new Set(),
    rateMax: 1,
    rateWindowMs: 60_000,
    fetchImpl: async () => jsonResponse({
      tag: '#2PQRV9',
      name: 'Rate',
      trophies: 1,
      highestTrophies: 1,
      brawlers: []
    })
  }, async (base) => {
    const first = await fetch(`${base}/api/player?tag=2PQRV9`);
    const second = await fetch(`${base}/api/player?tag=2PQRV9`);
    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
    assert.equal((await second.json()).error.code, 'RATE_LIMITED');
    assert.ok(Number(second.headers.get('retry-after')) >= 1);
  });
});
