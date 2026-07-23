// Protected, single-user finance sync for Headspace.
// FINANCE_SYNC_TOKEN is a Cloudflare Pages secret; FLASHCARDS is the existing
// private KV binding. Neither the token nor finance values belong in source.

const STORE_KEY = 'finance:primary:v1';
const MAX_BYTES = 1024 * 1024;

export async function onRequest({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  };
  if (!env.FLASHCARDS) return reply({ ok: false, error: 'finance store unavailable' }, 503, headers);
  if (!env.FINANCE_SYNC_TOKEN || !authorized(request, env.FINANCE_SYNC_TOKEN)) {
    return reply({ ok: false, error: 'unauthorized' }, 401, headers);
  }

  if (request.method === 'GET') {
    const saved = await env.FLASHCARDS.get(STORE_KEY, 'json');
    return reply({ ok: true, data: saved?.payload || null, updatedAt: saved?.updatedAt || null }, 200, headers);
  }

  if (request.method === 'PUT') {
    const length = Number(request.headers.get('Content-Length') || 0);
    if (length > MAX_BYTES) return reply({ ok: false, error: 'payload too large' }, 413, headers);
    let payload;
    try { payload = await request.json(); }
    catch { return reply({ ok: false, error: 'invalid JSON' }, 400, headers); }
    const encoded = JSON.stringify(payload);
    if (encoded.length > MAX_BYTES) return reply({ ok: false, error: 'payload too large' }, 413, headers);
    if (!validFinancePayload(payload)) return reply({ ok: false, error: 'invalid finance payload' }, 400, headers);
    const updatedAt = new Date().toISOString();
    await env.FLASHCARDS.put(STORE_KEY, JSON.stringify({ payload, updatedAt }));
    return reply({ ok: true, updatedAt }, 200, headers);
  }

  return reply({ ok: false, error: 'method not allowed' }, 405, headers);
}

function authorized(request, expected) {
  const value = request.headers.get('Authorization') || '';
  const supplied = value.startsWith('Bearer ') ? value.slice(7) : '';
  if (supplied.length !== expected.length || supplied.length < 32) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= supplied.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}

function validFinancePayload(value) {
  return value
    && value.kind === 'cel-headspace-finance'
    && value.version === 1
    && value.data
    && typeof value.data === 'object'
    && !Array.isArray(value.data);
}

function reply(value, status, headers) {
  return new Response(JSON.stringify(value), { status, headers });
}
