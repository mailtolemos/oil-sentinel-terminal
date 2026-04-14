import { NextResponse } from 'next/server';
import type { CommodityPrice } from '@/lib/types';

export const runtime = 'nodejs';
export const revalidate = 0;

let cachedPrices: CommodityPrice[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 12_000;

const COMMODITIES = [
  { ticker: 'BZ=F',  symbol: 'BRT', name: 'Brent Crude',   unit: 'USD/bbl'   },
  { ticker: 'CL=F',  symbol: 'WTI', name: 'WTI Crude',     unit: 'USD/bbl'   },
  { ticker: 'NG=F',  symbol: 'HH',  name: 'Henry Hub Gas', unit: 'USD/MMBtu' },
  { ticker: 'HO=F',  symbol: 'GO',  name: 'ICE Gasoil',    unit: 'USD/t'     },
  { ticker: 'RB=F',  symbol: 'RB',  name: 'RBOB Gasoline', unit: 'USD/gal'   },
];

// Loose bounds — only reject truly garbage values
const PRICE_BOUNDS: Record<string, [number, number]> = {
  BRT: [20, 300], WTI: [20, 300], HH: [0.5, 50],
  GO:  [300, 3000], RB: [0.5, 10], DUB: [20, 300],
};

function inBounds(price: number, symbol: string) {
  const b = PRICE_BOUNDS[symbol];
  if (!b) return price > 0;
  return price >= b[0] && price <= b[1];
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
  'Origin':  'https://finance.yahoo.com',
};

// v8 chart — meta.regularMarketPrice is the live price
async function fetchV8(ticker: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d&includePrePost=false`;
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`v8 HTTP ${r.status}`);
  return r.json();
}

// v8 daily — for 90-day sparkline history
async function fetchHistory(ticker: string): Promise<{ t: number; v: number }[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=90d`;
    const r   = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const data = await r.json();
    const ts: number[]         = data?.chart?.result?.[0]?.timestamp ?? [];
    const cl: (number | null)[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    return ts.map((t, i) => ({ t: t * 1000, v: cl[i] as number })).filter(p => p.v != null && p.v > 0);
  } catch { return []; }
}

export async function GET() {
  if (cachedPrices && Date.now() - cacheTime < CACHE_TTL) {
    return NextResponse.json({ prices: cachedPrices, updatedAt: new Date(cacheTime).toISOString(), cached: true });
  }

  const results: CommodityPrice[] = [];

  await Promise.allSettled(COMMODITIES.map(async (c) => {
    let price = 0, change = 0, changePct = 0, high = 0, low = 0, open = 0;

    try {
      const data  = await fetchV8(c.ticker);
      const meta  = data?.chart?.result?.[0]?.meta;
      if (!meta) throw new Error('no meta');

      price = meta.regularMarketPrice ?? 0;
      if (!inBounds(price, c.symbol)) throw new Error(`out-of-bounds: ${price}`);

      const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
      change    = +(price - prev).toFixed(4);
      changePct = prev !== 0 ? +((change / prev) * 100).toFixed(4) : 0;
      high      = meta.regularMarketDayHigh  ?? price;
      low       = meta.regularMarketDayLow   ?? price;
      open      = meta.regularMarketOpen     ?? price;
    } catch (err) {
      console.error(`[prices] ${c.ticker} failed:`, err);
      // Leave price=0 so UI shows "--" rather than wrong number
    }

    const history = await fetchHistory(c.ticker);

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
  }));

  // Derive Dubai Crude from Brent
  const brt = results.find(p => p.symbol === 'BRT');
  if (brt && brt.price > 0) {
    const d = (n: number) => Math.round((n - 0.92) * 100) / 100;
    results.push({
      symbol: 'DUB', name: 'Dubai Crude', shortName: 'DUB',
      price: d(brt.price), change: brt.change, changePct: brt.changePct,
      high:  d(brt.high),  low:   d(brt.low),  open:   d(brt.open),
      unit:  'USD/bbl',    trend: brt.trend,
      history: brt.history.map(h => ({ ...h, v: d(h.v) })),
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
