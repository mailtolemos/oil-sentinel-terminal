import { NextResponse } from 'next/server';
import type { CommodityPrice } from '@/lib/types';

export const runtime = 'nodejs';
export const revalidate = 0;

// Cache TTL: 12s — prices refresh fast, client polls every 12s
let cachedPrices: CommodityPrice[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 12_000;

// Sane price ranges [min, max] for validation — reject Yahoo garbage data
const PRICE_BOUNDS: Record<string, [number, number]> = {
  BRT: [20, 200], WTI: [20, 200], HH: [0.5, 30],
  GO: [400, 2000], RB: [0.5, 6], DUB: [20, 200],
};

// Fallback prices (April 2026 approximate levels)
const FALLBACK: Record<string, { price: number; change: number; changePct: number }> = {
  BRT: { price: 64.82, change: -0.41, changePct: -0.63 },
  WTI: { price: 61.53, change: -0.38, changePct: -0.61 },
  HH:  { price: 3.18,  change:  0.04, changePct:  1.27 },
  GO:  { price: 578.0, change: -4.20, changePct: -0.72 },
  RB:  { price: 2.11,  change: -0.02, changePct: -0.94 },
  DUB: { price: 63.90, change: -0.35, changePct: -0.55 },
};

const COMMODITIES = [
  { ticker: 'BZ=F',  symbol: 'BRT', name: 'Brent Crude',      unit: 'USD/bbl'  },
  { ticker: 'CL=F',  symbol: 'WTI', name: 'WTI Crude',        unit: 'USD/bbl'  },
  { ticker: 'NG=F',  symbol: 'HH',  name: 'Henry Hub Gas',    unit: 'USD/MMBtu' },
  { ticker: 'HO=F',  symbol: 'GO',  name: 'ICE Gasoil',       unit: 'USD/t'    },
  { ticker: 'RB=F',  symbol: 'RB',  name: 'RBOB Gasoline',    unit: 'USD/gal'  },
];

async function fetchYahoo(ticker: string) {
  // Use 5m interval for intraday real-time data, fall back to 1d for history
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=5m&range=5d`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchYahooDaily(ticker: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=90d`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function validate(price: number, symbol: string): boolean {
  const bounds = PRICE_BOUNDS[symbol];
  if (!bounds) return price > 0;
  return price >= bounds[0] && price <= bounds[1];
}

export async function GET() {
  if (cachedPrices && Date.now() - cacheTime < CACHE_TTL) {
    return NextResponse.json({
      prices: cachedPrices,
      updatedAt: new Date(cacheTime).toISOString(),
      cached: true,
    });
  }

  const results: CommodityPrice[] = [];

  await Promise.allSettled(
    COMMODITIES.map(async (c) => {
      let price = 0, change = 0, changePct = 0, high = 0, low = 0, open = 0;
      let history: { t: number; v: number }[] = [];

      try {
        // Fetch intraday for current price
        const intraday = await fetchYahoo(c.ticker);
        const meta  = intraday?.chart?.result?.[0]?.meta;
        const q     = intraday?.chart?.result?.[0]?.indicators?.quote?.[0];
        const ts: number[] = intraday?.chart?.result?.[0]?.timestamp ?? [];

        if (!meta) throw new Error('no meta');

        price     = meta.regularMarketPrice     ?? 0;
        const prev = meta.chartPreviousClose    ?? meta.previousClose ?? price;
        change    = +(price - prev).toFixed(4);
        changePct = prev !== 0 ? +((change / prev) * 100).toFixed(4) : 0;
        high      = meta.regularMarketDayHigh   ?? price;
        low       = meta.regularMarketDayLow    ?? price;
        open      = meta.regularMarketOpen      ?? price;

        // Validate the price makes sense
        if (!validate(price, c.symbol)) throw new Error(`Out-of-range: ${price}`);

        // Build intraday history (for chart sparklines) from 5m bars
        history = ts
          .map((t: number, i: number) => ({ t: t * 1000, v: (q?.close?.[i] ?? null) as number | null }))
          .filter((p): p is { t: number; v: number } => p.v !== null && validate(p.v, c.symbol))
          .slice(-60); // last 5 hours of 5m bars

        // Also fetch daily data for the 90-day chart
        try {
          const daily = await fetchYahooDaily(c.ticker);
          const dMeta   = daily?.chart?.result?.[0]?.meta;
          const dQ      = daily?.chart?.result?.[0]?.indicators?.quote?.[0];
          const dTs: number[] = daily?.chart?.result?.[0]?.timestamp ?? [];

          const dailyHistory = dTs
            .map((t: number, i: number) => ({ t: t * 1000, v: (dQ?.close?.[i] ?? null) as number | null }))
            .filter((p): p is { t: number; v: number } => p.v !== null && validate(p.v, c.symbol))
            .slice(-90);

          if (dailyHistory.length > 0) history = dailyHistory;

          // Use daily data for high/low if missing
          if (dMeta && (!high || !low)) {
            high = dMeta.regularMarketDayHigh ?? high;
            low  = dMeta.regularMarketDayLow  ?? low;
          }
        } catch { /* intraday is enough */ }

      } catch {
        // Use fallback data
        const fb = FALLBACK[c.symbol] ?? { price: 0, change: 0, changePct: 0 };
        price = fb.price; change = fb.change; changePct = fb.changePct;
        high = +(price * 1.012).toFixed(2);
        low  = +(price * 0.988).toFixed(2);
        open = +(price - change).toFixed(2);
      }

      results.push({
        symbol:    c.symbol,
        name:      c.name,
        shortName: c.symbol,
        price:     Math.round(price    * 100) / 100,
        change:    Math.round(change   * 100) / 100,
        changePct: Math.round(changePct * 100) / 100,
        high:      Math.round(high     * 100) / 100,
        low:       Math.round(low      * 100) / 100,
        open:      Math.round(open     * 100) / 100,
        unit:      c.unit,
        trend:     changePct > 0.05 ? 'up' : changePct < -0.05 ? 'down' : 'flat',
        history,
      });
    })
  );

  // Derive Dubai Crude = Brent − ~1.0 spread (Dubai historically ~$0.5–2 below Brent)
  const brt = results.find(p => p.symbol === 'BRT');
  if (brt) {
    const fb = FALLBACK['DUB'];
    const dubPrice = +(brt.price - 0.92).toFixed(2);
    results.push({
      symbol:    'DUB',
      name:      'Dubai Crude',
      shortName: 'DUB',
      price:     dubPrice,
      change:    brt.change,
      changePct: brt.changePct,
      high:      +(brt.high - 0.92).toFixed(2),
      low:       +(brt.low - 0.92).toFixed(2),
      open:      +(brt.open - 0.92).toFixed(2),
      unit:      'USD/bbl',
      trend:     brt.trend,
      history:   brt.history.map(h => ({ ...h, v: +(h.v - 0.92).toFixed(2) })),
    });
  }

  const order = ['BRT', 'WTI', 'DUB', 'HH', 'GO', 'RB'];
  results.sort((a, b) => order.indexOf(a.symbol) - order.indexOf(b.symbol));

  if (results.length > 0) {
    cachedPrices = results;
    cacheTime    = Date.now();
  }

  return NextResponse.json({ prices: results, updatedAt: new Date().toISOString() });
}
