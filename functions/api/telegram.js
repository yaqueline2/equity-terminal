// functions/api/telegram.js — Cloudflare Pages Function
// NO KV needed. Bot parses your message, sends back a tap-to-import link.
//
// ENV VARS (Cloudflare Pages → Settings → Environment variables):
//   TELEGRAM_BOT_TOKEN   — from @BotFather
//   TELEGRAM_CHAT_ID     — your Telegram user ID (from @userinfobot)
//   TELEGRAM_SECRET      — any random string (e.g. cel2026secret)
//   SITE_URL             — https://celsheadspace.pages.dev

export async function onRequest(context) {
  const { request, env } = context;
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Bot-Api-Secret-Token',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const json = (d, s = 200) => new Response(JSON.stringify(d), {
    status: s, headers: { ...cors, 'Content-Type': 'application/json' }
  });

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Verify webhook secret
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (env.TELEGRAM_SECRET && secret !== env.TELEGRAM_SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let update;
  try { update = await request.json(); } catch { return json({ ok: true }); }

  const msg = update.message || update.edited_message;
  if (!msg) return json({ ok: true });

  const chatId = String(msg.chat?.id || '');

  // Only accept from your own chat
  if (env.TELEGRAM_CHAT_ID && chatId !== env.TELEGRAM_CHAT_ID) {
    await tg(env.TELEGRAM_BOT_TOKEN, chatId, '❌ Unauthorized.');
    return json({ ok: true });
  }

  const text = (msg.text || msg.caption || '').trim();

  // Help message on /start or empty
  if (!text || text === '/start' || text === '/help') {
    await tg(env.TELEGRAM_BOT_TOKEN, chatId,
      '👋 *cel\'s headspace bot*\n\nSend me anything and I\'ll parse it for your dashboard:\n\n' +
      '💸 _spent RM45 on lunch, want_\n' +
      '🪷 _did reformer at Retune, 50 mins, felt strong_\n' +
      '📚 _started reading Atomic Habits_\n' +
      '📺 _watching Apothecary Diaries on Netflix_\n' +
      '💰 _saved RM500 to MooMoo_\n' +
      '✅ _done with water and reading today_\n' +
      '🔗 _https://substack.com/..._\n\n' +
      'I\'ll reply with a link — tap it to open your hub and approve the entry.'
    );
    return json({ ok: true });
  }

  // Show typing indicator
  await tgAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing');

  try {
    const parsed = await parseWithAI(text, env);
    const siteUrl = (env.SITE_URL || 'https://vivisheadspace.pages.dev').replace(/\/$/, '');

    // Encode the full parsed item as base64
    const item = { ...parsed, raw: text, receivedAt: new Date().toISOString(), id: `tg_${Date.now()}` };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(item))));
    const deepLink = `${siteUrl}/#inbox:${encoded}`;

    const typeEmoji = { expense:'💸', pilates:'🪷', book:'📚', show:'📺', link:'🔗', habit:'✅', savings:'💰', note:'📝' }[parsed.type] || '📝';
    const typeLabel = { expense:'Expense', pilates:'Pilates session', book:'Book', show:'Show / Movie', link:'Link saved', habit:'Habit check-in', savings:'Savings', note:'Note' }[parsed.type] || 'Entry';

    const reply =
      `${typeEmoji} *${typeLabel}*\n` +
      `${formatDetails(parsed)}\n\n` +
      `[→ Open hub to approve](${deepLink})`;

    await tg(env.TELEGRAM_BOT_TOKEN, chatId, reply);

  } catch (e) {
    await tg(env.TELEGRAM_BOT_TOKEN, chatId,
      `⚠️ Couldn\'t parse that: ${e.message}\n\nTry being more specific, e.g.\n_"spent RM50 on lunch at Kenny Hills"_`
    );
  }

  return json({ ok: true });
}

function formatDetails(parsed) {
  const d = parsed.data || {};
  switch (parsed.type) {
    case 'expense':  return `RM ${d.amount} · ${d.desc || ''} · ${d.cat || ''} · ${d.nw === 'N' ? 'Need' : 'Want'}`;
    case 'pilates':  return `${d.duration} mins · ${d.type || 'Reformer'} · ${d.studio || 'unknown'} · felt ${d.mood || 'good'}`;
    case 'book':     return `_${d.title}_ by ${d.author || 'unknown'} · ${d.status || 'Reading'}`;
    case 'show':     return `_${d.title}_ on ${d.author || 'unknown'} · ${d.status || 'Watching'}`;
    case 'link':     return `${(d.url || '').slice(0, 55)} → ${d.section || 'substack'}`;
    case 'habit':    return (d.habits || []).join(', ');
    case 'savings':  return `RM ${d.amount} → ${d.pot || 'unknown pot'}`;
    default:         return parsed.summary || '';
  }
}

async function parseWithAI(text, env) {
  const today = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' });

  const system =
    `You are a personal dashboard assistant for Celine, a Malaysian law student. ` +
    `Parse her Telegram message. Today is ${today}. Currency is RM. Use today if no date mentioned. ` +
    `Return ONLY valid JSON matching one of these shapes:\n\n` +

    `expense — {"type":"expense","summary":"RM X on Y","data":{"date":"DD/MM/YYYY","cat":"restaurants|travel|groceries|personal care|fitness|clothing|healthcare|work|gifts|misc|subscriptions|hangouts|car maintenance","desc":"description","nw":"N or W","amount":number}}\n\n` +

    `pilates — {"type":"pilates","summary":"X mins at Y","data":{"date":"DD/MM/YYYY","type":"Reformer|Mat|Tower|Barre|Yoga|Hot Yoga|Aerial Yoga|HIIT|Other","duration":number,"studio":"name or unknown","mood":"good|strong|neutral|sore","note":""}}\n\n` +

    `book — {"type":"book","summary":"Book: Title","data":{"title":"","author":"","status":"Reading|Want to Read|Done","rating":0,"page":""}}\n\n` +

    `show — {"type":"show","summary":"Show: Title","data":{"title":"","author":"platform","status":"Watching|Want to Watch|Done","rating":0,"page":""}}\n\n` +

    `link — {"type":"link","summary":"Link: domain","data":{"url":"full url","section":"substack|glowup|refs|learning"}}\n\n` +

    `habit — {"type":"habit","summary":"Habits: X, Y","data":{"habits":["name1","name2"],"date":"DD/MM/YYYY"}}\n\n` +

    `savings — {"type":"savings","summary":"RM X to Pot","data":{"pot":"pot name","amount":number,"date":"DD/MM/YYYY"}}\n\n` +

    `note — {"type":"note","summary":"brief summary","data":{"text":"original message"}}`;

  const tryProviders = [
    async () => {
      if (!env.OPENROUTER_API_KEY) return null;
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': env.SITE_URL || 'https://vivisheadspace.pages.dev' },
        body: JSON.stringify({ model: 'anthropic/claude-3.5-haiku', messages: [{ role:'system', content:system }, { role:'user', content:text }], max_tokens: 300, temperature: 0.1 }),
      });
      if (!r.ok) return null;
      return (await r.json())?.choices?.[0]?.message?.content?.trim();
    },
    async () => {
      if (!env.GEMINI_API_KEY) return null;
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction:{ parts:[{ text:system }] }, contents:[{ role:'user', parts:[{ text }] }], generationConfig:{ maxOutputTokens:300, temperature:0.1 } }),
      });
      if (!r.ok) return null;
      return (await r.json())?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    },
    async () => {
      if (!env.GROQ_API_KEY) return null;
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model:'llama-3.3-70b-versatile', messages:[{ role:'system', content:system }, { role:'user', content:text }], max_tokens:300, temperature:0.1 }),
      });
      if (!r.ok) return null;
      return (await r.json())?.choices?.[0]?.message?.content?.trim();
    },
  ];

  for (const fn of tryProviders) {
    try {
      const raw = await fn();
      if (!raw) continue;
      const clean = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
      return JSON.parse(clean);
    } catch { continue; }
  }

  return { type:'note', summary:text.slice(0, 60), data:{ text } };
}

async function tg(token, chatId, text) {
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
  });
}

async function tgAction(token, chatId, action) {
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  });
}
