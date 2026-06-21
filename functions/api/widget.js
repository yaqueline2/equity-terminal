// functions/api/widget.js — Cloudflare Pages Function
// Tiny snapshot store for the iOS Scriptable home-screen widget.
// The hub PUTs a small snapshot (cards due, to-dos, etc.); the widget GETs it.
// Backed by the same KV namespace as flashcard sync (binding: FLASHCARDS).
//
// GET  /api/widget?token=PHRASE  -> { ok:true, data:<snapshot|null> }
// PUT  /api/widget?token=PHRASE  body -> { ok:true }

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
  const key = 'widget:' + token;

  if (request.method === 'GET') {
    const v = await KV.get(key);
    return json({ ok: true, data: v ? JSON.parse(v) : null }, 200, cors);
  }
  if (request.method === 'PUT' || request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'invalid JSON' }, 400, cors); }
    const str = JSON.stringify(body);
    if (str.length > 64 * 1024) return json({ ok: false, error: 'payload too large' }, 413, cors);
    await KV.put(key, str);
    return json({ ok: true }, 200, cors);
  }
  return json({ ok: false, error: 'method not allowed' }, 405, cors);
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
