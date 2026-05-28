// functions/api/claude.js — Cloudflare Pages Function
// GET  ?ping=1  → {ok:true, configured:true/false}
// POST — two formats accepted:
//   Format A (simple):         {message:"...", context:"system", max_tokens:N}
//   Format B (Anthropic-style):{messages:[{role,content}], system:"...", max_tokens:N}
// Response always includes BOTH:
//   {reply:"...", content:[{type:"text",text:"..."}], ok:true}

export async function onRequest(context) {
  const { request, env } = context;

  const origin = request.headers.get('Origin') || '';
  const cors = {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const OPENROUTER_KEY = env.OPENROUTER_API_KEY || '';
  const GEMINI_KEY     = env.GEMINI_API_KEY || '';
  const GROQ_KEY       = env.GROQ_API_KEY || '';
  const MISTRAL_KEY    = env.MISTRAL_API_KEY || '';
  const COHERE_KEY     = env.COHERE_API_KEY || '';
  const configured = !!(OPENROUTER_KEY || GEMINI_KEY || GROQ_KEY || MISTRAL_KEY || COHERE_KEY);

  const respond = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  // ── Ping ──
  if (request.method === 'GET' && new URL(request.url).searchParams.get('ping') === '1') {
    return respond({ ok: true, configured });
  }

  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  if (!configured) return respond({ error: 'No API key configured. Add OPENROUTER_API_KEY (or GEMINI/GROQ/MISTRAL/COHERE) to Cloudflare Pages → Settings → Environment variables.' }, 503);

  let body;
  try { body = await request.json(); } catch { return respond({ error: 'Invalid JSON body' }, 400); }

  // ── Normalise both request formats ──
  let messages, systemPrompt, maxTokens;

  if (Array.isArray(body.messages) && body.messages.length > 0) {
    // Format B — Anthropic-style (used by postClaude / stock analyser / radar)
    messages     = body.messages;
    systemPrompt = body.system || 'You are a helpful assistant.';
    maxTokens    = Math.min(body.max_tokens || 4000, 8000);
  } else if (body.message || body.prompt) {
    // Format A — simple (used by AI debrief, link analyser, budget debrief)
    messages     = [{ role: 'user', content: body.message || body.prompt }];
    systemPrompt = body.context || body.system || 'You are a helpful assistant.';
    maxTokens    = Math.min(body.max_tokens || 2048, 8000);
  } else {
    return respond({ error: 'No message provided' }, 400);
  }

  let reply = null, lastError = null;

  // ── 1. OpenRouter — best for complex JSON tasks, routes to Claude 3.5 Haiku ──
  if (!reply && OPENROUTER_KEY) {
    try {
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
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        reply = data?.choices?.[0]?.message?.content?.trim() || null;
        if (!reply) lastError = `OpenRouter: empty response (finish_reason: ${data?.choices?.[0]?.finish_reason})`;
      } else {
        const errText = await res.text();
        lastError = `OpenRouter ${res.status}: ${errText.slice(0, 200)}`;
      }
    } catch (e) { lastError = `OpenRouter: ${e.message}`; }
  }

  // ── 2. Gemini 1.5 Flash ──
  if (!reply && GEMINI_KEY) {
    try {
      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
      }));
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
        if (!reply) lastError = `Gemini: empty (reason: ${data?.candidates?.[0]?.finishReason})`;
      } else { lastError = `Gemini ${res.status}`; }
    } catch (e) { lastError = `Gemini: ${e.message}`; }
  }

  // ── 3. Groq — llama-3.3-70b for better JSON quality ──
  if (!reply && GROQ_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          max_tokens: Math.min(maxTokens, 8000),
          temperature: 0.3,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        reply = data?.choices?.[0]?.message?.content?.trim() || null;
        if (!reply) lastError = `Groq: empty (finish_reason: ${data?.choices?.[0]?.finish_reason})`;
      } else { lastError = `Groq ${res.status}: ${await res.text().then(t => t.slice(0,150))}`; }
    } catch (e) { lastError = `Groq: ${e.message}`; }
  }

  // ── 4. Mistral ──
  if (!reply && MISTRAL_KEY) {
    try {
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MISTRAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        reply = data?.choices?.[0]?.message?.content?.trim() || null;
      } else { lastError = `Mistral ${res.status}`; }
    } catch (e) { lastError = `Mistral: ${e.message}`; }
  }

  // ── 5. Cohere ──
  if (!reply && COHERE_KEY) {
    try {
      const lastMsg = messages[messages.length - 1];
      const chatHistory = messages.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'CHATBOT' : 'USER',
        message: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }));
      const res = await fetch('https://api.cohere.com/v1/chat', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${COHERE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'command-r-plus',
          preamble: systemPrompt,
          chat_history: chatHistory,
          message: typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content),
          max_tokens: maxTokens,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        reply = data?.text?.trim() || null;
      } else { lastError = `Cohere ${res.status}`; }
    } catch (e) { lastError = `Cohere: ${e.message}`; }
  }

  if (!reply) {
    return respond({ error: `All providers failed. Last error: ${lastError || 'unknown'}` }, 502);
  }

  // Return in BOTH formats so all callers work
  return respond({
    ok: true,
    reply,                                    // Format A callers read this
    content: [{ type: 'text', text: reply }], // Format B callers (postClaude) read this
  });
}
