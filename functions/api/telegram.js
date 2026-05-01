// functions/api/telegram.js — Cloudflare Pages Function
// Telegram bot webhook + inbox KV store
//
// ENV VARS needed in Cloudflare Pages:
//   TELEGRAM_BOT_TOKEN   — from BotFather
//   TELEGRAM_CHAT_ID     — your personal chat ID (get from @userinfobot)
//   TELEGRAM_SECRET      — any random string, set as webhook secret header
//   OPENROUTER_API_KEY   — (or any other AI key, reuses your existing ones)
//
// KV NAMESPACE needed:
//   CEL_INBOX            — bind a KV namespace called CEL_INBOX in Pages settings
//
// Routes:
//   POST /api/telegram          — Telegram webhook (receives messages from bot)
//   GET  /api/telegram?inbox=1  — Dashboard polls this to fetch pending items
//   POST /api/telegram?approve  — Dashboard approves/rejects an item
//   POST /api/telegram?clear    — Dashboard clears all approved items

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Bot-Api-Secret-Token',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

  const KV = env.CEL_INBOX;
  if (!KV) return json({ error: 'CEL_INBOX KV namespace not bound' }, 503);

  // ── Dashboard: fetch inbox ──
  if (request.method === 'GET' && url.searchParams.get('inbox') === '1') {
    const raw = await KV.get('inbox', 'json') || [];
    return json({ items: raw });
  }

  // ── Dashboard: approve / reject / edit ──
  if (request.method === 'POST' && url.searchParams.has('approve')) {
    const body = await request.json();
    // body = { id, action: 'approve'|'reject', data?: {...edited fields} }
    const items = await KV.get('inbox', 'json') || [];
    if (body.action === 'reject') {
      const updated = items.filter(i => i.id !== body.id);
      await KV.put('inbox', JSON.stringify(updated));
      return json({ ok: true });
    }
    if (body.action === 'approve') {
      // Move item to approved list, remove from inbox
      const item = items.find(i => i.id === body.id);
      if (!item) return json({ error: 'Item not found' }, 404);
      const updatedItem = { ...item, ...(body.data || {}), approvedAt: new Date().toISOString() };
      const approved = await KV.get('approved', 'json') || [];
      approved.push(updatedItem);
      await KV.put('approved', JSON.stringify(approved.slice(-200))); // keep last 200
      const updated = items.filter(i => i.id !== body.id);
      await KV.put('inbox', JSON.stringify(updated));
      return json({ ok: true, item: updatedItem });
    }
    return json({ error: 'Unknown action' }, 400);
  }

  // ── Dashboard: fetch approved (for merging into localStorage) ──
  if (request.method === 'GET' && url.searchParams.get('approved') === '1') {
    const since = url.searchParams.get('since') || '1970-01-01';
    const all = await KV.get('approved', 'json') || [];
    const filtered = all.filter(i => (i.approvedAt || '') > since);
    return json({ items: filtered });
  }

  // ── Telegram webhook ──
  if (request.method === 'POST') {
    // Verify secret
    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (env.TELEGRAM_SECRET && secret !== env.TELEGRAM_SECRET) {
      return json({ error: 'Unauthorized' }, 401);
    }

    let update;
    try { update = await request.json(); } catch { return json({ ok: true }); }

    const msg = update.message || update.edited_message;
    if (!msg) return json({ ok: true });

    // Only accept messages from your own chat ID
    const chatId = String(msg.chat?.id || '');
    if (env.TELEGRAM_CHAT_ID && chatId !== env.TELEGRAM_CHAT_ID) {
      await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, '❌ Unauthorized. This bot only accepts messages from its owner.');
      return json({ ok: true });
    }

    const text = msg.text || msg.caption || '';
    const hasDoc = msg.document?.file_name?.endsWith('.csv');

    if (!text && !hasDoc) {
      await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, '🤔 I only understand text messages and CSV files right now.');
      return json({ ok: true });
    }

    // Send typing indicator
    await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, null, 'typing');

    try {
      let parsed;

      if (hasDoc) {
        // CSV file → stocks category
        parsed = {
          type: 'stocks_csv',
          summary: `CSV file: ${msg.document.file_name}`,
          data: {
            fileName: msg.document.file_name,
            fileId: msg.document.file_id,
            note: 'Download and import this CSV to update your stock holdings.'
          }
        };
      } else {
        // Use AI to parse the text
        parsed = await parseWithAI(text, env);
      }

      // Save to inbox KV
      const items = await KV.get('inbox', 'json') || [];
      const newItem = {
        id: `tg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        receivedAt: new Date().toISOString(),
        raw: text || `[${msg.document?.file_name}]`,
        ...parsed
      };
      items.push(newItem);
      await KV.put('inbox', JSON.stringify(items.slice(-50))); // keep last 50 pending

      // Reply to Telegram
      const typeEmoji = {
        expense: '💸', pilates: '🪷', book: '📚', show: '📺',
        link: '🔗', habit: '✅', savings: '💰', note: '📝', stocks_csv: '📊'
      }[parsed.type] || '📝';

      const reply = `${typeEmoji} Got it! Saved to your inbox as:\n\n*${parsed.summary}*\n\nOpen your headspace hub to review and approve.`;
      await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, reply);

    } catch (e) {
      await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ Couldn't parse that: ${e.message}\n\nTry again or be more specific.`);
    }

    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}

// ── AI parser ──
async function parseWithAI(text, env) {
  const OPENROUTER_KEY = env.OPENROUTER_API_KEY || '';
  const GEMINI_KEY = env.GEMINI_API_KEY || '';
  const GROQ_KEY = env.GROQ_API_KEY || '';

  const systemPrompt = `You are a personal dashboard assistant for Celine. Parse her Telegram message and classify it.

Categories and their data shapes:

expense — spending money on something
  { type:"expense", summary:"RM X on Y", data:{ date:"DD/MM/YYYY", cat:"restaurants|travel|groceries|personal care|fitness|clothing|healthcare|work|gifts|misc|subscriptions|hangouts|car maintenance", desc:"description", nw:"N" or "W" (Need/Want), amount:number } }

pilates — a workout/exercise session
  { type:"pilates", summary:"X mins at Y studio", data:{ date:"DD/MM/YYYY", type:"Reformer|Mat|Tower|Barre|Yoga|Hot Yoga|HIIT|Other", duration:number (mins), studio:"studio name or unknown", mood:"good|strong|neutral|sore", note:"optional note" } }

book — reading a book
  { type:"book", summary:"Book: Title by Author", data:{ title:"title", author:"author or unknown", status:"Reading|Want to Read|Done", rating:0, page:"" } }

show — watching a show/movie
  { type:"show", summary:"Show: Title", data:{ title:"title", author:"platform or unknown", status:"Watching|Want to Watch|Done", rating:0, page:"Ep 1 or similar" } }

link — a URL to save to Brain Fog/Substack
  { type:"link", summary:"Link: URL", data:{ url:"the url", section:"substack|glowup|refs|learning" } }

habit — marking habits as done
  { type:"habit", summary:"Habits: X, Y, Z", data:{ habits:["habit name 1", "habit name 2"], date:"DD/MM/YYYY" } }

savings — depositing to a savings pot
  { type:"savings", summary:"RM X to Pot Name", data:{ pot:"pot name", amount:number, date:"DD/MM/YYYY" } }

note — anything else, just save as a note
  { type:"note", summary:"brief summary", data:{ text:"the original message" } }

Today's date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}.
Use today's date if no date is mentioned.
Currency is Malaysian Ringgit (RM). If she says "spent 50" assume RM 50.
Return ONLY valid JSON, no markdown.`;

  const userMsg = `Parse this message: "${text}"`;

  // Try providers
  if (OPENROUTER_KEY) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://celsheadspace.pages.dev' },
      body: JSON.stringify({ model: 'anthropic/claude-3.5-haiku', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }], max_tokens: 500, temperature: 0.1 }),
    });
    if (res.ok) {
      const d = await res.json();
      const txt = d?.choices?.[0]?.message?.content?.trim();
      if (txt) return JSON.parse(txt.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim());
    }
  }

  if (GEMINI_KEY) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: userMsg }] }], generationConfig: { maxOutputTokens: 500, temperature: 0.1 } }),
    });
    if (res.ok) {
      const d = await res.json();
      const txt = d?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (txt) return JSON.parse(txt.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim());
    }
  }

  if (GROQ_KEY) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }], max_tokens: 500, temperature: 0.1 }),
    });
    if (res.ok) {
      const d = await res.json();
      const txt = d?.choices?.[0]?.message?.content?.trim();
      if (txt) return JSON.parse(txt.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim());
    }
  }

  // Fallback: save as note
  return { type: 'note', summary: text.slice(0, 60), data: { text } };
}

// ── Send Telegram message ──
async function sendTelegram(token, chatId, text, action) {
  if (!token) return;
  if (action === 'typing') {
    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    });
    return;
  }
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}
