/**
 * Cloudflare Pages Function: Yahoo Finance symbol search proxy
 * Route: /api/search?q=apple   ->  { quotes:[{symbol,name,exch,type}] }
 *
 * Powers the stock-search autocomplete in the portfolio AI analysis pane.
 */
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  const cors = {
    'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 1 || q.length > 60) return json({ quotes: [] }, 200, cors);

  const upstream =
    'https://query1.finance.yahoo.com/v1/finance/search' +
    '?q=' + encodeURIComponent(q) +
    '&quotesCount=8&newsCount=0&listsCount=0&enableFuzzyQuery=true';

  try {
    const r = await fetch(upstream, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });
    if (!r.ok) return json({ quotes: [], error: 'upstream ' + r.status }, 200, cors);
    const data = await r.json();
    const quotes = (data.quotes || [])
      .filter(x => x.symbol && (x.quoteType === 'EQUITY' || x.quoteType === 'ETF' || x.quoteType === 'MUTUALFUND' || x.quoteType === 'INDEX'))
      .slice(0, 8)
      .map(x => ({
        symbol: x.symbol,
        name: x.shortname || x.longname || x.symbol,
        exch: x.exchDisp || x.exchange || '',
        type: x.typeDisp || x.quoteType || '',
      }));
    return json({ quotes }, 200, cors);
  } catch (e) {
    return json({ quotes: [], error: String(e && e.message || e) }, 200, cors);
  }
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
  });
}
