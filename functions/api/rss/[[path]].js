/**
 * Cloudflare Pages Function: RSS news proxy
 * File path: functions/api/rss/[[path]].js
 * Routes:    /api/rss/* (e.g. /api/rss/rss/2.0/headline?s=AAPL,NVDA)
 *
 * Forwards to https://feeds.finance.yahoo.com/<path>?<query>
 */

export async function onRequest(context) {
  const { request, params } = context;
  const url = new URL(request.url);

  // Reassemble the path that follows /api/rss/
  const segments = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  const path = segments.join('/');
  const qs = url.search; // includes leading '?' if present, else ''

  const upstreamUrl = `https://feeds.finance.yahoo.com/${path}${qs}`;

  try {
    const r = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CelHeadspace/1.0)',
        'Accept': 'application/rss+xml, text/xml, */*',
      },
    });

    const xml = await r.text();
    return new Response(xml, {
      status: r.ok ? 200 : 502,
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err) {
    return new Response(
      `<!-- RSS fetch failed: ${err.message} | url: ${upstreamUrl} -->`,
      {
        status: 502,
        headers: {
          'Content-Type': 'application/rss+xml; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
