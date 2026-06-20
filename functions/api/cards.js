// functions/api/cards.js — Cloudflare Pages Function
// Cross-device sync for flashcard SRS progress, backed by a KV namespace.
//
// Binding required: KV namespace bound as `FLASHCARDS` (see dashboard steps).
//
// GET  /api/cards?token=PHRASE        -> { ok:true, data:<blob|null> }
// PUT  /api/cards?token=PHRASE  body  -> { ok:true }
// The `token` is a user passphrase; the SAME phrase on every device shares one
// store. It doubles as namespace + light auth (personal, low-stakes data).

export async function onRequest(context) {
  const { request, env } = context;

  const origin = request.headers.get('Origin') || '';
  const cors = {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const KV = env.FLASHCARDS;
  if (!KV) return json({ ok: false, error: 'KV namespace FLASHCARDS not bound' }, 501, cors);

  const url = new URL(request.url);
  const token = (url.searchParams.get('token') || '').trim();
  if (token.length < 4) return json({ ok: false, error: 'token too short' }, 400, cors);
  const key = 'srs:' + token;

  if (request.method === 'GET') {
    const v = await KV.get(key);
    return json({ ok: true, data: v ? JSON.parse(v) : null }, 200, cors);
  }

  if (request.method === 'PUT' || request.method === 'POST') {
    let body;
    try { body = await request.json(); }
    catch (e) { return json({ ok: false, error: 'invalid JSON body' }, 400, cors); }
    // guard against runaway payloads
    const str = JSON.stringify(body);
    if (str.length > 4 * 1024 * 1024) return json({ ok: false, error: 'payload too large' }, 413, cors);
    await KV.put(key, str);
    return json({ ok: true }, 200, cors);
  }

  return json({ ok: false, error: 'method not allowed' }, 405, cors);
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
