// functions/api/claude.js — Cloudflare Pages Function
// Supports: OpenRouter, Gemini, Groq, Mistral, Cohere
// GET  ?ping=1  → health check {ok:true, configured:true/false}
// POST accepts TWO formats:
//   Format A (simple):  {message: "...", context: "system prompt"}
//   Format B (Anthropic-style): {messages: [{role,content}], system: "...", max_tokens: N}

export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

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

  // GET ping
  const url = new URL(request.url);
  if (request.method === 'GET' && url.searchParams.get('ping') === '1') {
    return json({ ok: true, configured });
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!configured) return json({ error: 'No API key configured.' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  // ── Normalise both request formats into: messages[], systemPrompt, maxTokens ──
  let messages, systemPrompt, maxTokens;

  if (Array.isArray(body.messages)) {
    // Format B — Anthropic-style (sent by postClaude in the dashboard)
    messages     = body.messages;
    systemPrompt = body.system || 'You are a helpful assistant.';
    maxTokens    = body.max_tokens || 4000;
  } else if (body.message || body.prompt) {
    // Format A — simple {message, context} (sent by AI debrief, link analyser etc.)
    messages     = [{ role: 'user', content: body.message || body.prompt }];
    systemPrompt = body.context || body.system || 'You are a helpful assistant.';
    maxTokens    = body.max_tokens || 2048;
  } else {
    return json({ error: 'No message provided' }, 400);
  }

  if (!messages.length) return json({ error: 'No message provided' }, 400);

  let reply = null, lastError = null;

  // 1. OpenRouter → returns Anthropic-style {choices[0].message.content}
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
        }),
      });
      if (res.ok) {
        const data = await res.json();
        reply = data?.choices?.[0]?.message?.content?.trim() || null;
      } else { lastError = `OpenRouter ${res.status}: ${await res.text()}`; }
    } catch (e) { lastError = `OpenRouter: ${e.message}`; }
  }

  // 2. Gemini
  if (!reply && GEMINI_KEY) {
    try {
      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: { maxOutputTokens: maxTokens },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
      } else { lastError = `Gemini ${res.status}`; }
    } catch (e) { lastError = `Gemini: ${e.message}`; }
  }

  // 3. Groq
  if (!reply && GROQ_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          max_tokens: Math.min(maxTokens, 8000),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        reply = data?.choices?.[0]?.message?.content?.trim() || null;
      } else { lastError = `Groq ${res.status}`; }
    } catch (e) { lastError = `Groq: ${e.message}`; }
  }

  // 4. Mistral
  if (!reply && MISTRAL_KEY) {
    try {
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MISTRAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          max_tokens: maxTokens,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        reply = data?.choices?.[0]?.message?.content?.trim() || null;
      } else { lastError = `Mistral ${res.status}`; }
    } catch (e) { lastError = `Mistral: ${e.message}`; }
  }

  // 5. Cohere
  if (!reply && COHERE_KEY) {
    try {
      const lastMsg = messages[messages.length - 1].content;
      const chatHistory = messages.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'CHATBOT' : 'USER',
        message: m.content,
      }));
      const res = await fetch('https://api.cohere.com/v1/chat', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${COHERE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'command-r',
          preamble: systemPrompt,
          chat_history: chatHistory,
          message: lastMsg,
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
    return json({ error: `All providers failed. Last: ${lastError || 'unknown'}` }, 502);
  }

  // ── Return in both formats so both callers work ──
  // postClaude expects: {content: [{type:'text', text:'...'}]}
  // Simple callers expect: {reply: '...'}
  return json({
    reply,
    ok: true,
    content: [{ type: 'text', text: reply }],
  });
}
