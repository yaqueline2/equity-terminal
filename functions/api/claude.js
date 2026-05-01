// functions/api/claude.js — Cloudflare Pages Function
// Supports: OpenRouter, Gemini, Groq, Mistral, Cohere
// GET  ?ping=1        → health check, returns {ok:true, configured:true/false}
// POST {message, context?, history?} → returns {reply: "..."}

export async function onRequest(context) {
  const { request, env } = context;

  // ── CORS headers (allow same-origin + pages.dev) ──
  const origin = request.headers.get('Origin') || '';
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ── Detect which key is available ──
  const OPENROUTER_KEY = env.OPENROUTER_API_KEY || '';
  const GEMINI_KEY     = env.GEMINI_API_KEY || '';
  const GROQ_KEY       = env.GROQ_API_KEY || '';
  const MISTRAL_KEY    = env.MISTRAL_API_KEY || '';
  const COHERE_KEY     = env.COHERE_API_KEY || '';

  const configured = !!(OPENROUTER_KEY || GEMINI_KEY || GROQ_KEY || MISTRAL_KEY || COHERE_KEY);

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  // ── GET ping ──
  const url = new URL(request.url);
  if (request.method === 'GET' && url.searchParams.get('ping') === '1') {
    return json({ ok: true, configured });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (!configured) {
    return json({ error: 'No API key configured. Add OPENROUTER_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, or COHERE_API_KEY to Cloudflare Pages → Settings → Environment variables.' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const userMessage  = body.message || body.prompt || '';
  const systemPrompt = body.context || body.system || 'You are a helpful assistant.';
  const history      = Array.isArray(body.history) ? body.history : [];

  if (!userMessage) return json({ error: 'No message provided' }, 400);

  // ── Try providers in priority order ──
  let reply = null;
  let lastError = null;

  // 1. OpenRouter (most flexible — routes to Claude, GPT, etc.)
  if (!reply && OPENROUTER_KEY) {
    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage },
      ];
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': env.SITE_URL || 'https://celsheadspace.pages.dev',
          'X-Title': "cel's headspace",
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3.5-haiku',
          messages,
          max_tokens: 2048,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        reply = data?.choices?.[0]?.message?.content?.trim() || null;
      } else {
        lastError = `OpenRouter ${res.status}`;
      }
    } catch (e) { lastError = `OpenRouter: ${e.message}`; }
  }

  // 2. Gemini
  if (!reply && GEMINI_KEY) {
    try {
      const contents = [
        ...history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        { role: 'user', parts: [{ text: userMessage }] },
      ];
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: { maxOutputTokens: 2048 },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
      } else {
        lastError = `Gemini ${res.status}`;
      }
    } catch (e) { lastError = `Gemini: ${e.message}`; }
  }

  // 3. Groq (fast, free tier)
  if (!reply && GROQ_KEY) {
    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage },
      ];
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages, max_tokens: 2048 }),
      });
      if (res.ok) {
        const data = await res.json();
        reply = data?.choices?.[0]?.message?.content?.trim() || null;
      } else {
        lastError = `Groq ${res.status}`;
      }
    } catch (e) { lastError = `Groq: ${e.message}`; }
  }

  // 4. Mistral
  if (!reply && MISTRAL_KEY) {
    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage },
      ];
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MISTRAL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'mistral-small-latest', messages, max_tokens: 2048 }),
      });
      if (res.ok) {
        const data = await res.json();
        reply = data?.choices?.[0]?.message?.content?.trim() || null;
      } else {
        lastError = `Mistral ${res.status}`;
      }
    } catch (e) { lastError = `Mistral: ${e.message}`; }
  }

  // 5. Cohere
  if (!reply && COHERE_KEY) {
    try {
      const chatHistory = history.map(m => ({
        role: m.role === 'assistant' ? 'CHATBOT' : 'USER',
        message: m.content,
      }));
      const res = await fetch('https://api.cohere.com/v1/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${COHERE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'command-r',
          preamble: systemPrompt,
          chat_history: chatHistory,
          message: userMessage,
          max_tokens: 2048,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        reply = data?.text?.trim() || null;
      } else {
        lastError = `Cohere ${res.status}`;
      }
    } catch (e) { lastError = `Cohere: ${e.message}`; }
  }

  if (!reply) {
    return json({ error: `All providers failed. Last error: ${lastError || 'unknown'}` }, 502);
  }

  return json({ reply, ok: true });
}
