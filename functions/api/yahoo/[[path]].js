/**
 * Cloudflare Pages Function: Yahoo Finance price proxy
 * File path: functions/api/yahoo/[[path]].js
 * Routes:    /api/yahoo/* (e.g. /api/yahoo/v8/finance/chart/AAPL?range=1d&interval=1d)
 *
 * params.path is the array of segments after /api/yahoo/
 *   e.g. ['v8','finance','chart','AAPL']
 */

export async function onRequest(context) {
  const { request, params } = context;
  const url = new URL(request.url);

  // Last path segment = ticker
  const segments = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  const ticker = segments[segments.length - 1];

  if (!ticker || ticker.length < 1 || ticker.length > 20 || !/^[A-Za-z0-9.\-=^]+$/.test(ticker)) {
    return jsonResponse({ error: 'Invalid or missing ticker' }, 400);
  }

  // Validated query params with safe defaults
  const rangeParam    = url.searchParams.get('range');
  const intervalParam = url.searchParams.get('interval');
  const range    = /^(1d|5d|1mo|3mo|6mo|1y|2y|5y)$/.test(rangeParam || '')                                    ? rangeParam    : '1d';
  const interval = /^(1m|2m|5m|15m|30m|60m|90m|1h|1d|5d|1wk|1mo)$/.test(intervalParam || '') ? intervalParam : '1d';

  const upstreamUrl =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?range=${range}&interval=${interval}&includePrePost=false`;

  try {
    const r = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CelHeadspace/1.0)',
        'Accept': 'application/json',
      },
      // fetch() in Workers follows redirects by default
    });

    if (!r.ok) {
      const text = await r.text();
      return jsonResponse({ error: 'Upstream HTTP ' + r.status, detail: text.slice(0, 200), ticker }, 502);
    }

    const data = await r.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    return jsonResponse({ error: 'Upstream fetch failed', detail: err.message, ticker }, 502);
  }
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
