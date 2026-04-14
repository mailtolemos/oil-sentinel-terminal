import { NextResponse } from 'next/server';
import type { CommodityPrice } from '@/lib/types';

export const runtime = 'nodejs';
export const revalidate = 0;

let cachedPrices: CommodityPrice[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 10_000;

// ── Pyth Network feed IDs for energy spot prices ─────────────────────────────
// Source: hermes.pyth.network/v2/price_feeds?asset_type=commodities
const PYTH_FEEDS = {
  WTI: '925ca92ff005ae943c158e3563f59698ce7e75c5a8c8dd43303a0a154887b3e6', // WTI Light Sweet Crude CFD
  BRT: '27f0d5e09a830083e5491795cac9ca521399c8f7fd56240d09484b14e614d57a', // Brent Crude Oil CFD
};

// ── Stooq symbols for OHLCV and instruments not on Pyth ─────────────────────
const STOOQ_COMMODITIES = [
  { stooq: 'cl.f', symbol: 'WTI', name: 'WTI Crude',     unit: 'USD/bbl'   },
  { stooq: 'cb.f', symbol: 'BRT', name: 'Brent Crude',   unit: 'USD/bbl'   },
  { stooq: 'ng.f', symbol: 'HH',  name: 'Henry Hub Gas', unit: 'USD/MMBtu' },
  { stooq: 'ho.f', symbol: 'GO',  name: 'Heating Oil',   unit: 'USD/gal'   },
  { stooq: 'rb.f', symbol: 'RB',  name: 'RBOB Gasoline', unit: 'USD/gal'   },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Pyth Hermes: batch fetch spot prices ─────────────────────────────────────
interface PythPrice { price: number; conf: number; publishTime: number; }

async function fetchPythPrices(): Promise<Record<string, PythPrice>> {
  const apiKey = process.env.PYTH_API_KEY;
  const ids = Object.values(PYTH_FEEDS).map(id => `ids[]=${id}`).join('&');
  const url  = `https://hermes.pyth.network/v2/updates/price/latest?${ids}${apiKey ? `&api-key=${apiKey}` : ''}`;

  const r = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`Pyth HTTP ${r.status}`);
  const data = await r.json();

  const result: Record<string, PythPrice> = {};
  const idToSymbol = Object.fromEntries(Object.entries(PYTH_FEEDS).map(([sym, id]) => [id, sym]));

  for (const item of data?.parsed ?? []) {
    const sym = idToSymbol[item.id];
    if (!sym) continue;
    const p     = item.price;
    const expo  = parseInt(p.expo, 10);
    const price = parseInt(p.price, 10) * Math.pow(10, expo);
    const conf  = parseInt(p.conf,  10) * Math.pow(10, expo);
    if (price > 0) result[sym] = { price, conf, publishTime: p.publish_time };
  }
  return result;
}

// ── Stooq: OHLCV quote for a single symbol ───────────────────────────────────
interface StooqQuote { price: number; open: number; high: number; low: number; }

async function fetchStooq(sym: string): Promise<StooqQuote> {
  const url = `https://stooq.com/q/l/?s=${sym}&f=sd2t2ohlcv&h&e=csv`;
  const r   = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error(`Stooq HTTP ${r.status}`);
  const text  = await r.text();
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('Stooq: empty');
  const [, , , open, high, low, close] = lines[1].split(',');
  return {
    price: parseFloat(close),
    open:  parseFloat(open),
    high:  parseFloat(high),
    low:   parseFloat(low),
  };
}

// ── Yahoo v8: 90-day sparkline history ───────────────────────────────────────
const YAHOO_MAP: Record<string, string> = {
  WTI: 'CL=F', BRT: 'BZ=F', HH: 'NG=F', GO: 'HO=F', RB: 'RB=F',
};

async function fetchHistory(symbol: string): Promise<{ t: number; v: number }[]> {
  const ticker = YAHOO_MAP[symbol];
  if (!ticker) return [];
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=90d`;
    const r   = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://finance.yahoo.com/' }, signal: AbortSignal.timeout(7000) });
    if (!r.ok) return [];
    const data = await r.json();
    const ts:  number[]         = data?.chart?.result?.[0]?.timestamp ?? [];
    const cls: (number | null)[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    return ts.map((t, i) => ({ t: t * 1000, v: cls[i] as number })).filter(p => p.v != null && p.v > 0);
  } catch { return []; }
}

export async function GET() {
  if (cachedPrices && Date.now() - cacheTime < CACHE_TTL) {
    return NextResponse.json({ prices: cachedPrices, updatedAt: new Date(cacheTime).toISOString(), cached: true });
  }

  // ── Fetch Pyth spot prices (WTI, BRT) and all Stooq OHLCV in parallel ──────
  const [pythPrices, stooqResults, ...histories] = await Promise.allSettled([
    fetchPythPrices(),
    Promise.allSettled(STOOQ_COMMODITIES.map(async c => ({ symbol: c.symbol, quote: await fetchStooq(c.stooq) }))),
    ...STOOQ_COMMODITIES.map(c => fetchHistory(c.symbol)),
  ]);

  const pyth: Record<string, PythPrice> = pythPrices.status === 'fulfilled' ? pythPrices.value : {};
  const stooqMap: Record<string, StooqQuote> = {};
  if (stooqResults.status === 'fulfilled') {
    for (const r of stooqResults.value) {
      if (r.status === 'fulfilled') stooqMap[r.value.symbol] = r.value.quote;
    }
  }
  const historyMap: Record<string, { t: number; v: number }[]> = {};
  STOOQ_COMMODITIES.forEach((c, i) => {
    const h = histories[i];
    historyMap[c.symbol] = h.status === 'fulfilled' ? h.value : [];
  });

  const results: CommodityPrice[] = [];

  for (const c of STOOQ_COMMODITIES) {
    const stooq = stooqMap[c.symbol];
    const pyth_ = pyth[c.symbol];

    // Use Pyth spot price if available and plausible; else fall back to Stooq
    const price = (pyth_ && pyth_.price > 0) ? pyth_.price : (stooq?.price ?? 0);
    const open  = stooq?.open  ?? price;
    const high  = stooq?.high  ?? price;
    const low   = stooq?.low   ?? price;

    const change    = +(price - open).toFixed(4);
    const changePct = open !== 0 ? +((change / open) * 100).toFixed(4) : 0;

    results.push({
      symbol:    c.symbol,
      name:      c.name,
      shortName: c.symbol,
      price:     Math.round(price     * 10000) / 10000,
      change:    Math.round(change    * 100)   / 100,
      changePct: Math.round(changePct * 100)   / 100,
      high:      Math.round(high      * 100)   / 100,
      low:       Math.round(low       * 100)   / 100,
      open:      Math.round(open      * 100)   / 100,
      unit:      c.unit,
      trend:     changePct > 0.05 ? 'up' : changePct < -0.05 ? 'down' : 'flat',
      history:   historyMap[c.symbol] ?? [],
      source:    (pyth_ && pyth_.price > 0) ? 'pyth' : 'stooq',
    } as CommodityPrice & { source: string });
  }

  // ── Dubai Crude = Brent − $0.92 spread ────────────────────────────────────
  const brt = results.find(p => p.symbol === 'BRT');
  if (brt && brt.price > 0) {
    const d = (n: number) => Math.round((n - 0.92) * 100) / 100;
    results.splice(2, 0, {
      symbol: 'DUB', name: 'Dubai Crude', shortName: 'DUB',
      price: d(brt.price), change: brt.change, changePct: brt.changePct,
      high:  d(brt.high),  low:   d(brt.low),  open:     d(brt.open),
      unit:  'USD/bbl',    trend: brt.trend,
      history: brt.history.map(h => ({ ...h, v: d(h.v) })),
    });
  }

  if (results.some(r => r.price > 0)) {
    cachedPrices = results;
    cacheTime    = Date.now();
  }

  return NextResponse.json({ prices: results, updatedAt: new Date().toISOString() });
}
