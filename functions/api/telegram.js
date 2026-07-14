// Cloudflare Pages Telegram capture. It is deliberately local-first: messages
// become reviewable notes in the hub and are never sent to an LLM.
export async function onRequest(context) {
  const { request, env } = context;
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Bot-Api-Secret-Token",
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (env.TELEGRAM_SECRET && secret !== env.TELEGRAM_SECRET) return json({ error: "Unauthorized" }, 401);

  let update;
  try { update = await request.json(); } catch { return json({ ok: true }); }
  const message = update.message || update.edited_message;
  if (!message) return json({ ok: true });
  const chatId = String(message.chat?.id || "");
  if (env.TELEGRAM_CHAT_ID && chatId !== env.TELEGRAM_CHAT_ID) return json({ ok: true });

  const text = (message.text || message.caption || "").trim();
  if (!text || text === "/start" || text === "/help") {
    await telegram(env.TELEGRAM_BOT_TOKEN, chatId, "Send a note, then open the link to review and import it into Headspace.");
    return json({ ok: true });
  }

  const item = {
    type: "note",
    summary: text.slice(0, 60),
    data: { text },
    raw: text,
    receivedAt: new Date().toISOString(),
    id: `tg_${Date.now()}`,
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(item))));
  const siteUrl = (env.SITE_URL || "https://vivisheadspace.pages.dev").replace(/\/$/, "");
  await telegram(env.TELEGRAM_BOT_TOKEN, chatId, `Note saved for review.\n\n[Open Headspace to import](${siteUrl}/#inbox:${encoded})`);
  return json({ ok: true });
}

async function telegram(token, chatId, text) {
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true }),
  });
}
