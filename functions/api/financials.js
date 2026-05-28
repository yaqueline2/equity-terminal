/**
 * Cloudflare Pages Function: Yahoo Finance quoteSummary proxy
 * File path: functions/api/financials.js
 * Route:     /api/financials?ticker=AAPL  (or ?ticker=1155.KL, ?ticker=D05.SI)
 *
 * Fetches structured financials for AI analysis: price, valuation, financials,
 * income/balance/cashflow history, earnings estimates, analyst ratings, profile.
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7';

// Yahoo ticker normalisation (matches frontend yahooTicker())
function toYahooTicker(t) {
  return (t || '')
    .toUpperCase()
    .replace(/\.MY$/, '.KL')
    .replace(/\.SG$/, '.SI');
}

// ── Crumb + cookie cache ─────────────────────────────────────────────────
// NOTE: Module-level state in Workers is per-isolate. Each isolate caches its
// own crumb. For a personal dashboard with low traffic this is fine; you may
// see occasional re-fetches when traffic hits a fresh isolate.
let _crumbCache = { crumb: null, cookie: null, ts: 0 };
const CRUMB_TTL = 25 * 60 * 1000; // 25 minutes

async function getCrumbAndCookie() {
  if (_crumbCache.crumb && (Date.now() - _crumbCache.ts) < CRUMB_TTL) {
    return _crumbCache;
  }

  try {
    // Step 1: hit consent endpoint to collect cookies
    const consentRes = await fetch('https://fc.yahoo.com/', {
      headers: { 'User-Agent': UA, 'Accept': ACCEPT },
    });

    // Workers exposes Set-Cookie via getSetCookie() (modern) or get() (collapsed)
    let setCookies = [];
    if (typeof consentRes.headers.getSetCookie === 'function') {
      setCookies = consentRes.headers.getSetCookie();
    } else {
      const raw = consentRes.headers.get('set-cookie');
      if (raw) setCookies = raw.split(/,(?=[^;]+=)/); // best-effort split
    }
    const cookieStr = setCookies.map(c => c.split(';')[0]).join('; ');

    // Step 2: fetch the crumb using those cookies
    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': UA,
        'Accept': ACCEPT,
        'Cookie': cookieStr,
        'Origin': 'https://finance.yahoo.com',
        'Referer': 'https://finance.yahoo.com/',
      },
    });

    const crumbBody = (await crumbRes.text()).trim();
    if (crumbRes.status === 200 && crumbBody && crumbBody.length < 50) {
      _crumbCache = { crumb: crumbBody, cookie: cookieStr, ts: Date.now() };
      return _crumbCache;
    }
  } catch (e) {
    console.warn('[financials] Crumb fetch failed:', e.message);
  }

  // Fallback: empty crumb (still works for some regions/tickers)
  return { crumb: '', cookie: '' };
}

// ── Fetch quoteSummary with crumb ────────────────────────────────────────
async function fetchQuoteSummary(ticker, modules) {
  let { crumb, cookie } = await getCrumbAndCookie();
  const hosts = ['query2.finance.yahoo.com', 'query1.finance.yahoo.com'];

  for (const host of hosts) {
    const url = `https://${host}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': ACCEPT,
          'Cookie': cookie,
          'Origin': 'https://finance.yahoo.com',
          'Referer': 'https://finance.yahoo.com/',
        },
      });

      if (res.status === 200) {
        const parsed = await res.json();
        const result = parsed?.quoteSummary?.result?.[0];
        if (result) return result;
      }

      // Stale crumb? Bust cache and retry once on this host
      if (res.status === 401 || res.status === 403) {
        _crumbCache = { crumb: null, cookie: null, ts: 0 };
        const fresh = await getCrumbAndCookie();
        crumb = fresh.crumb;
        cookie = fresh.cookie;
        const retryUrl = `https://${host}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
        const retry = await fetch(retryUrl, {
          headers: {
            'User-Agent': UA,
            'Accept': ACCEPT,
            'Cookie': cookie,
            'Origin': 'https://finance.yahoo.com',
            'Referer': 'https://finance.yahoo.com/',
          },
        });
        if (retry.status === 200) {
          const parsed2 = await retry.json();
          const result2 = parsed2?.quoteSummary?.result?.[0];
          if (result2) return result2;
        }
      }
    } catch (e) {
      console.warn(`[financials] ${host} failed:`, e.message);
    }
  }

  return null;
}

// ── Helpers: pull .raw / .fmt from Yahoo value objects ───────────────────
function val(obj) {
  if (obj == null) return null;
  if (typeof obj === 'number') return obj;
  if (typeof obj === 'object') return obj.raw != null ? obj.raw : (obj.fmt || null);
  return obj;
}

function fmt(obj, decimals) {
  const v = val(obj);
  if (v == null) return null;
  if (typeof v === 'number') {
    if (Math.abs(v) >= 1e12) return (v / 1e12).toFixed(1) + 'T';
    if (Math.abs(v) >= 1e9)  return (v / 1e9).toFixed(1) + 'B';
    if (Math.abs(v) >= 1e6)  return (v / 1e6).toFixed(1) + 'M';
    return v.toFixed(decimals != null ? decimals : 2);
  }
  return String(v);
}

function pct(obj) {
  const v = val(obj);
  return v != null ? (v * 100).toFixed(1) + '%' : null;
}

// ── Main handler ─────────────────────────────────────────────────────────
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300',
  };

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response('', {
      status: 204,
      headers: {
        ...headers,
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const ticker = url.searchParams.get('ticker') || '';
  if (!ticker) {
    return new Response(JSON.stringify({ error: 'ticker param required' }), {
      status: 400, headers,
    });
  }

  const yt = toYahooTicker(ticker);

  const modules = [
    'financialData',
    'defaultKeyStatistics',
    'summaryDetail',
    'earningsTrend',
    'recommendationTrend',
    'upgradeDowngradeHistory',
    'calendarEvents',
    'summaryProfile',
    'incomeStatementHistory',
    'balanceSheetHistory',
    'cashflowStatementHistory',
    'price',
  ].join(',');

  let raw;
  try {
    raw = await fetchQuoteSummary(yt, modules);
    if (!raw) {
      return new Response(JSON.stringify({ error: 'No data found for ticker: ' + yt }), {
        status: 404, headers,
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 502, headers });
  }

  // ── Extract & structure ────────────────────────────────────────────────
  const fd  = raw.financialData          || {};
  const ks  = raw.defaultKeyStatistics   || {};
  const sd  = raw.summaryDetail          || {};
  const sp  = raw.summaryProfile         || {};
  const pr  = raw.price                  || {};
  const cal = raw.calendarEvents         || {};
  const rt  = raw.recommendationTrend    || {};
  const et  = raw.earningsTrend          || {};
  const udh = raw.upgradeDowngradeHistory || {};
  const ish = raw.incomeStatementHistory  || {};
  const bsh = raw.balanceSheetHistory     || {};
  const cfh = raw.cashflowStatementHistory || {};

  const price = {
    current:   val(pr.regularMarketPrice),
    currency:  pr.currency || sd.currency,
    marketCap: fmt(pr.marketCap || sd.marketCap),
    '52wHigh': fmt(sd.fiftyTwoWeekHigh, 2),
    '52wLow':  fmt(sd.fiftyTwoWeekLow, 2),
    avgVolume: fmt(sd.averageVolume),
    beta:      fmt(ks.beta, 2),
  };

  const valuation = {
    trailingPE:      fmt(sd.trailingPE || ks.trailingPE, 2),
    forwardPE:       fmt(ks.forwardPE, 2),
    pegRatio:        fmt(ks.pegRatio, 2),
    priceToSales:    fmt(ks.priceToSalesTrailing12Months, 2),
    priceToBook:     fmt(ks.priceToBook, 2),
    evToEbitda:      fmt(ks.enterpriseToEbitda, 2),
    evToRevenue:     fmt(ks.enterpriseToRevenue, 2),
    enterpriseValue: fmt(ks.enterpriseValue),
    shortRatio:      fmt(ks.shortRatio, 2),
    dividendYield:   pct(sd.dividendYield),
    payoutRatio:     pct(sd.payoutRatio),
    '52wChange':     pct(ks['52WeekChange']),
  };

  const financials = {
    revenue:               fmt(fd.totalRevenue),
    revenueGrowthYoY:      pct(fd.revenueGrowth),
    grossMargin:           pct(fd.grossMargins),
    operatingMargin:       pct(fd.operatingMargins),
    netProfitMargin:       pct(fd.profitMargins),
    ebitda:                fmt(fd.ebitda),
    freeCashFlow:          fmt(fd.freeCashflow),
    operatingCashFlow:     fmt(fd.operatingCashflow),
    totalDebt:             fmt(fd.totalDebt),
    totalCash:             fmt(fd.totalCash),
    debtToEquity:          fd.debtToEquity ? (val(fd.debtToEquity) / 100).toFixed(2) : null,
    currentRatio:          fmt(fd.currentRatio, 2),
    quickRatio:            fmt(fd.quickRatio, 2),
    roe:                   pct(fd.returnOnEquity),
    roa:                   pct(fd.returnOnAssets),
    earningsGrowthYoY:     pct(fd.earningsGrowth),
    targetMeanPrice:       fmt(fd.targetMeanPrice, 2),
    targetHighPrice:       fmt(fd.targetHighPrice, 2),
    targetLowPrice:        fmt(fd.targetLowPrice, 2),
    analystRecommendation: fd.recommendationKey || null,
    numberOfAnalysts:      val(fd.numberOfAnalystOpinions),
  };

  const incomeHistory = (ish.incomeStatementHistory || []).slice(0, 3).map(stmt => ({
    year:        stmt.endDate ? new Date(val(stmt.endDate) * 1000).getFullYear() : null,
    revenue:     fmt(stmt.totalRevenue),
    grossProfit: fmt(stmt.grossProfit),
    netIncome:   fmt(stmt.netIncome),
    eps:         fmt(stmt.dilutedEps, 2),
  }));

  const balanceHistory = (bsh.balanceSheetStatements || []).slice(0, 3).map(stmt => ({
    year:        stmt.endDate ? new Date(val(stmt.endDate) * 1000).getFullYear() : null,
    totalAssets: fmt(stmt.totalAssets),
    totalDebt:   fmt(stmt.longTermDebt || stmt.totalLiab),
    cash:        fmt(stmt.cash),
    equity:      fmt(stmt.totalStockholderEquity),
  }));

  const cashflowHistory = (cfh.cashflowStatements || []).slice(0, 3).map(stmt => ({
    year:              stmt.endDate ? new Date(val(stmt.endDate) * 1000).getFullYear() : null,
    operatingCashFlow: fmt(stmt.totalCashFromOperatingActivities),
    capex:             fmt(stmt.capitalExpenditures),
    freeCashFlow:      stmt.totalCashFromOperatingActivities && stmt.capitalExpenditures
                         ? fmt({ raw: val(stmt.totalCashFromOperatingActivities) + val(stmt.capitalExpenditures) })
                         : null,
  }));

  const earningsEstimates = (et.trend || []).slice(0, 4).map(item => ({
    period:          item.period,
    endDate:         item.endDate ? val(item.endDate) : null,
    epsEstimate:     fmt(item.earningsEstimate?.avg, 2),
    epsLow:          fmt(item.earningsEstimate?.low, 2),
    epsHigh:         fmt(item.earningsEstimate?.high, 2),
    revenueEstimate: fmt(item.revenueEstimate?.avg),
    epsGrowth:       pct(item.earningsEstimate?.growth),
  }));

  const recommendations = (rt.trend || []).slice(0, 2).map(r => ({
    period:     r.period,
    strongBuy:  r.strongBuy,
    buy:        r.buy,
    hold:       r.hold,
    sell:       r.sell,
    strongSell: r.strongSell,
  }));

  const ratingChanges = (udh.history || []).slice(0, 8).map(u => ({
    date:      u.epochGradeDate ? new Date(u.epochGradeDate * 1000).toISOString().slice(0, 10) : null,
    firm:      u.firm,
    toGrade:   u.toGrade,
    fromGrade: u.fromGrade,
    action:    u.action,
  }));

  const profile = {
    name:        pr.shortName || pr.longName,
    sector:      sp.sector || pr.sector,
    industry:    sp.industry,
    employees:   val(sp.fullTimeEmployees),
    description: (sp.longBusinessSummary || '').slice(0, 600),
    website:     sp.website,
    country:     sp.country,
  };

  const earningsDates = cal.earnings?.earningsDate;
  const nextEarnings = Array.isArray(earningsDates) && earningsDates.length
    ? new Date(val(earningsDates[0]) * 1000).toISOString().slice(0, 10)
    : null;

  const result = {
    ticker: yt,
    fetchedAt: new Date().toISOString(),
    profile,
    price,
    valuation,
    financials,
    incomeHistory,
    balanceHistory,
    cashflowHistory,
    earningsEstimates,
    recommendations,
    ratingChanges,
    nextEarnings,
  };

  return new Response(JSON.stringify(result), { status: 200, headers });
}
