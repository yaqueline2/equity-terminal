/**
 * Cloudflare Pages Function: AI proxy with multi-provider fallback
 * File path: functions/api/claude.js
 * Route:     /api/claude
 *
 * GET  /api/claude?ping=1   → { configured: true/false, providers: [...] }
 * POST /api/claude          → { content: [{ type:'text', text:'...' }] }
 *
 * Body (POST):
 *   { messages: [{role, content}], system?: string, max_tokens?: number }
 *
 * Provider chain (tries in order, skips if no key or on error):
 *   1. Gemini    — GEMINI_API_KEY
 *   2. Groq      — GROQ_API_KEY
 *   3. OpenRouter — OPENROUTER_API_KEY
 *   4. Mistral   — MISTRAL_API_KEY
 *   5. Cohere    — COHERE_API_KEY
 */

// ── Helpers ───────────────────────────────────────────────────────────────

/** Merge consecutive messages with the same role (Gemini requirement) */
function mergeConsecutive(msgs, roleMap) {
  const out = [];
  for (const msg of msgs) {
    const role = roleMap ? (roleMap[msg.role] || msg.role) : msg.role;
    const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    if (out.length && out[out.length - 1].role === role) {
      out[out.length - 1].text += '\n\n' + text;
    } else {
      out.push({ role, text });
    }
  }
  return out;
}

// ── Provider definitions ──────────────────────────────────────────────────
const PROVIDERS = [
  {
    name: 'gemini',
    envKey: 'GEMINI_API_KEY',
    model: 'gemini-2.5-flash',
    buildRequest: (messages, system, maxTokens, apiKey) => {
      const allMsgs = system
        ? [{ role: 'user', content: system }, { role: 'assistant', content: 'Understood.' }, ...messages]
        : messages;
      const merged = mergeConsecutive(allMsgs, { assistant: 'model', user: 'user' });
      const contents = merged.map(m => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.text }],
      }));
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        headers: {},
        body: {
          contents,
          generationConfig: { maxOutputTokens: Math.min(maxTokens, 8192), temperature: 0.3 },
        },
      };
    },
    extractText: (data) => {
      const parts = data?.candidates?.[0]?.content?.parts || [];
      return parts.map(p => p.text || '').join('');
    },
    extractUsage: (data) => ({
      input_tokens: data?.usageMetadata?.promptTokenCount || 0,
      output_tokens: data?.usageMetadata?.candidatesTokenCount || 0,
    }),
  },
  {
    name: 'groq',
    envKey: 'GROQ_API_KEY',
    model: 'llama-3.3-70b-versatile',
    buildRequest: (messages, system, maxTokens, apiKey) => {
      const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
      return {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: {
          model: 'llama-3.3-70b-versatile',
          messages: msgs,
          max_tokens: Math.min(maxTokens, 8192),
          temperature: 0.3,
        },
      };
    },
    extractText: (data) => data?.choices?.[0]?.message?.content || '',
    extractUsage: (data) => ({
      input_tokens: data?.usage?.prompt_tokens || 0,
      output_tokens: data?.usage?.completion_tokens || 0,
    }),
  },
  {
    name: 'openrouter',
    envKey: 'OPENROUTER_API_KEY',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    buildRequest: (messages, system, maxTokens, apiKey, refererUrl) => {
      const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
      return {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          // Update SITE_URL env var (or fallback below) to your new Cloudflare Pages URL
          'HTTP-Referer': refererUrl || 'https://equity-terminal.pages.dev',
          'X-Title': 'Equity Terminal',
        },
        body: {
          model: 'meta-llama/llama-3.3-70b-instruct:free',
          messages: msgs,
          max_tokens: Math.min(maxTokens, 8192),
          temperature: 0.3,
        },
      };
    },
    extractText: (data) => data?.choices?.[0]?.message?.content || '',
    extractUsage: (data) => ({
      input_tokens: data?.usage?.prompt_tokens || 0,
      output_tokens: data?.usage?.completion_tokens || 0,
    }),
  },
  {
    name: 'mistral',
    envKey: 'MISTRAL_API_KEY',
    model: 'mistral-small-latest',
    buildRequest: (messages, system, maxTokens, apiKey) => {
      const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
      return {
        url: 'https://api.mistral.ai/v1/chat/completions',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: {
          model: 'mistral-small-latest',
          messages: msgs,
          max_tokens: Math.min(maxTokens, 8192),
          temperature: 0.3,
        },
      };
    },
    extractText: (data) => data?.choices?.[0]?.message?.content || '',
    extractUsage: (data) => ({
      input_tokens: data?.usage?.prompt_tokens || 0,
      output_tokens: data?.usage?.completion_tokens || 0,
    }),
  },
  {
    name: 'cohere',
    envKey: 'COHERE_API_KEY',
    model: 'command-r-plus',
    buildRequest: (messages, system, maxTokens, apiKey) => {
      const chatHistory = [];
      const msgsCopy = [...messages];

      let lastUserMsg = '';
      for (let i = msgsCopy.length - 1; i >= 0; i--) {
        if (msgsCopy[i].role === 'user') {
          lastUserMsg = typeof msgsCopy[i].content === 'string'
            ? msgsCopy[i].content
            : JSON.stringify(msgsCopy[i].content);
          msgsCopy.splice(i, 1);
          break;
        }
      }

      for (const msg of msgsCopy) {
        chatHistory.push({
          role: msg.role === 'assistant' ? 'CHATBOT' : 'USER',
          message: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      }

      const body = {
        model: 'command-r-plus',
        message: lastUserMsg,
        chat_history: chatHistory,
        max_tokens: Math.min(maxTokens, 4096),
        temperature: 0.3,
      };
      if (system) body.preamble = system;

      return {
        url: 'https://api.cohere.com/v1/chat',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body,
      };
    },
    extractText: (data) => data?.text || '',
    extractUsage: (data) => ({
      input_tokens: data?.meta?.tokens?.input_tokens || 0,
      output_tokens: data?.meta?.tokens?.output_tokens || 0,
    }),
  },
];

// ── Try a single provider ─────────────────────────────────────────────────
async function tryProvider(provider, messages, system, maxTokens, env) {
  const apiKey = env[provider.envKey];
  if (!apiKey) return { ok: false, error: `${provider.name}: no API key`, skip: true };

  const refererUrl = env.SITE_URL; // optional override for OpenRouter HTTP-Referer
  const req = provider.buildRequest(messages, system, maxTokens, apiKey, refererUrl);

  let response;
  try {
    response = await fetch(req.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...req.headers },
      body: JSON.stringify(req.body),
    });
  } catch (e) {
    return { ok: false, error: `${provider.name}: ${e.message}` };
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    return { ok: false, error: `${provider.name}: bad JSON response` };
  }

  if (!response.ok) {
    const msg = data?.error?.message || data?.message || `HTTP ${response.status}`;
    return { ok: false, error: `${provider.name} (${response.status}): ${msg}` };
  }

  const text = provider.extractText(data);
  const usage = provider.extractUsage(data);
  return { ok: true, text, model: provider.model, provider: provider.name, usage };
}

// ── Main handler ──────────────────────────────────────────────────────────
export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response('', {
      status: 204,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'GET,POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // ── Ping / health check ─────────────────────────────────────────────
  if (request.method === 'GET') {
    const hasAnyKey = PROVIDERS.some(p => !!env[p.envKey]);
    const active = PROVIDERS.filter(p => !!env[p.envKey]).map(p => p.name);
    return new Response(JSON.stringify({ configured: hasAnyKey, providers: active }), {
      status: 200,
      headers: corsHeaders,
    });
  }

  // ── POST: run inference with fallback chain ─────────────────────────
  const hasAnyKey = PROVIDERS.some(p => !!env[p.envKey]);
  if (!hasAnyKey) {
    return new Response(JSON.stringify({
      error: { message: 'No API keys configured. Add at least one of: GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, MISTRAL_API_KEY, COHERE_API_KEY in Cloudflare Pages environment variables.' }
    }), { status: 503, headers: corsHeaders });
  }

  let reqBody;
  try {
    reqBody = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: { message: 'Invalid JSON body' } }), {
      status: 400, headers: corsHeaders,
    });
  }

  const { messages = [], system = '', max_tokens = 4000 } = reqBody;

  if (!messages.length) {
    return new Response(JSON.stringify({ error: { message: 'messages array is required' } }), {
      status: 400, headers: corsHeaders,
    });
  }

  // Try each provider — all errors fall through to the next one
  const errors = [];
  for (const provider of PROVIDERS) {
    const result = await tryProvider(provider, messages, system, max_tokens, env);

    if (result.ok) {
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: result.text }],
        model: result.model,
        provider: result.provider,
        usage: result.usage,
      }), { status: 200, headers: corsHeaders });
    }

    if (!result.skip) errors.push(result.error);
  }

  return new Response(JSON.stringify({
    error: { message: 'All AI providers failed. Errors: ' + errors.join(' | ') }
  }), { status: 502, headers: corsHeaders });
}
