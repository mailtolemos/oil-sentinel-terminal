import { NextResponse } from 'next/server';
import type { CommodityPrice } from '@/lib/types';

export const runtime = 'nodejs';
export const revalidate = 0;

// Cache TTL: 10s — client polls every 12s
let cachedPrices: CommodityPrice[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 10_000;

// ── Commodity map ────────────────────────────────────────────────────────────
const COMMODITIES = [
  { ticker: 'BZ=F',  symbol: 'BRT', name: 'Brent Crude',   unit: 'USD/bbl'   },
  { ticker: 'CL=F',  symbol: 'WTI', name: 'WTI Crude',     unit: 'USD/bbl'   },
  { ticker: 'NG=F',  symbol: 'HH',  name: 'Henry Hub Gas', unit: 'USD/MMBtu' },
  { ticker: 'HO=F',  symbol: 'GO',  name: 'ICE Gasoil',    unit: 'USD/t'     },
  { ticker: 'RB=F',  symbol: 'RB',  name: 'RBOB Gasoline', unit: 'USD/gal'   },
];

// ── Price sanity bounds ──────────────────────────────────────────────────────
const PRICE_BOUNDS: Record<string, [number, number]> = {
  BRT: [30, 200], WTI: [30, 200], HH: [0.5, 30],
  GO:  [400, 2000], RB: [0.5, 6], DUB: [30, 200],
};

function inBounds(price: number, symbol: string) {
  const b = PRICE_BOUNDS[symbol];
  return b ? price >= b[0] && price <= b[1] : price > 0;
}

// ── Yahoo Finance v7 quote (most accurate current price) ─────────────────────
async function fetchYahooQuote(tickers: string[]) {
  const syms = tickers.map(encodeURIComponent).join(',');
  const url  = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketDayHigh,regularMarketDayLow,regularMarketOpen,chartPreviousClose`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(7000),
  });
  if (!r.ok) throw new Error(`Yahoo quote HTTP ${r.status}`);
  const data = await r.json();
  const quotes: Record<string, unknown>[] = data?.quoteResponse?.result ?? [];
  return Object.fromEntries(quotes.map((q) => [q.symbol as string, q]));
}

// ── Yahoo Finance v8 chart — for historical sparkline data ───────────────────
async function fetchYahooHistory(ticker: string): Promise<{ t: number; v: number }[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=90d`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) return [];
  const data = await r.json();
  const ts: number[]  = data?.chart?.result?.[0]?.timestamp ?? [];
  const closes: (number | null)[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  return ts
    .map((t: number, i: number) => ({ t: t * 1000, v: closes[i] as number }))
    .filter(p => p.v != null && p.v > 0);
}

export async function GET() {
  if (cachedPrices && Date.now() - cacheTime < CACHE_TTL) {
    return NextResponse.json({ prices: cachedPrices, updatedAt: new Date(cacheTime).toISOString(), cached: true });
  }

  const results: CommodityPrice[] = [];

  // ── Step 1: Batch-fetch all quotes in one request ──────────────────────────
  let quoteMap: Record<string, Record<string, unknown>> = {};
  try {
    quoteMap = await fetchYahooQuote(COMMODITIES.map(c => c.ticker));
  } catch (err) {
    console.error('Yahoo quote batch failed:', err);
  }

  // ── Step 2: Build prices + historical sparkline ───────────────────────────
  await Promise.allSettled(
    COMMODITIES.map(async (c) => {
      const q = quoteMap[c.ticker] as Record<string, number> | undefined;

      let price = 0, change = 0, changePct = 0, high = 0, low = 0, open = 0;

      if (q && typeof q.regularMarketPrice === 'number' && inBounds(q.regularMarketPrice, c.symbol)) {
        price     = q.regularMarketPrice;
        change    = q.regularMarketChange            ?? 0;
        changePct = q.regularMarketChangePercent     ?? 0;
        high      = q.regularMarketDayHigh           ?? price;
        low       = q.regularMarketDayLow            ?? price;
        open      = q.regularMarketOpen              ?? price;
      } else {
        // Hard fallback — log so we can debug
        console.warn(`[prices] Bad/missing quote for ${c.ticker}: ${JSON.stringify(q?.regularMarketPrice)}`);
        // No static fallback — just skip price shows 0
        price = 0; change = 0; changePct = 0;
      }

      // Historical sparkline (non-blocking)
      let history: { t: number; v: number }[] = [];
      try {
        history = await fetchYahooHistory(c.ticker);
      } catch { /* sparkline optional */ }

      results.push({
        symbol:    c.symbol,
        name:      c.name,
        shortName: c.symbol,
        price:     Math.round(price     * 100) / 100,
        change:    Math.round(change    * 100) / 100,
        changePct: Math.round(changePct * 100) / 100,
        high:      Math.round(high      * 100) / 100,
        low:       Math.round(low       * 100) / 100,
        open:      Math.round(open      * 100) / 100,
        unit:      c.unit,
        trend:     changePct > 0.05 ? 'up' : changePct < -0.05 ? 'down' : 'flat',
        history,
      });
    })
  );

  // ── Step 3: Derive Dubai Crude = Brent − $0.92 spread ────────────────────
  const brt = results.find(p => p.symbol === 'BRT');
  if (brt && brt.price > 0) {
    const d = (n: number) => Math.round((n - 0.92) * 100) / 100;
    results.push({
      symbol:    'DUB',
      name:      'Dubai Crude',
      shortName: 'DUB',
      price:     d(brt.price),
      change:    brt.change,
      changePct: brt.changePct,
      high:      d(brt.high),
      low:       d(brt.low),
      open:      d(brt.open),
      unit:      'USD/bbl',
      trend:     brt.trend,
      history:   brt.history.map(h => ({ ...h, v: d(h.v) })),
    });
  }

  const ORDER = ['BRT', 'WTI', 'DUB', 'HH', 'GO', 'RB'];
  results.sort((a, b) => ORDER.indexOf(a.symbol) - ORDER.indexOf(b.symbol));

  if (results.length > 0) {
    cachedPrices = results;
    cacheTime    = Date.now();
  }

  return NextResponse.json({ prices: results, updatedAt: new Date().toISOString() });
}
