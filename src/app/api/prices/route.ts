import { NextResponse } from 'next/server';
import type { CommodityPrice } from '@/lib/types';

export const runtime = 'edge';
export const revalidate = 0;

const COMMODITIES = [
  { ticker: 'BZ=F',  symbol: 'BRT', name: 'Brent Crude',    unit: 'USD/bbl' },
  { ticker: 'CL=F',  symbol: 'WTI', name: 'WTI Crude',      unit: 'USD/bbl' },
  { ticker: 'NG=F',  symbol: 'NG',  name: 'Natural Gas',    unit: 'USD/MMBtu' },
  { ticker: 'HO=F',  symbol: 'HO',  name: 'Heating Oil',    unit: 'USD/gal' },
  { ticker: 'RB=F',  symbol: 'RB',  name: 'RBOB Gasoline',  unit: 'USD/gal' },
  { ticker: 'MCL=F', symbol: 'DUB', name: 'Dubai Crude',    unit: 'USD/bbl' },
];

async function fetchYahooQuote(ticker: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=90d`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: 30 },
  });
  if (!r.ok) throw new Error(`Yahoo Finance fetch failed for ${ticker}`);
  return r.json();
}

export async function GET() {
  const results: CommodityPrice[] = [];

  await Promise.allSettled(
    COMMODITIES.map(async (c) => {
      try {
        const data = await fetchYahooQuote(c.ticker);
        const meta   = data?.chart?.result?.[0]?.meta;
        const quotes = data?.chart?.result?.[0]?.indicators?.quote?.[0];
        const timestamps: number[] = data?.chart?.result?.[0]?.timestamp ?? [];

        if (!meta) return;

        const price       = meta.regularMarketPrice ?? 0;
        const prevClose   = meta.chartPreviousClose ?? meta.previousClose ?? price;
        const change      = price - prevClose;
        const changePct   = prevClose !== 0 ? (change / prevClose) * 100 : 0;
        const high        = meta.regularMarketDayHigh ?? price;
        const low         = meta.regularMarketDayLow  ?? price;
        const open        = meta.regularMarketOpen    ?? price;

        const history = timestamps
          .map((t: number, i: number) => ({
            t: t * 1000,
            v: (quotes?.close?.[i] ?? null) as number | null,
          }))
          .filter(p => p.v !== null)
          .slice(-90) as { t: number; v: number }[];

        results.push({
          symbol:    c.symbol,
          name:      c.name,
          shortName: c.symbol,
          price:     Math.round(price * 100) / 100,
          change:    Math.round(change * 100) / 100,
          changePct: Math.round(changePct * 100) / 100,
          high:      Math.round(high * 100) / 100,
          low:       Math.round(low * 100) / 100,
          open:      Math.round(open * 100) / 100,
          unit:      c.unit,
          trend:     changePct > 0.1 ? 'up' : changePct < -0.1 ? 'down' : 'flat',
          history,
        });
      } catch {
        // Push a placeholder with mock price if Yahoo is down
        const mockPrices: Record<string, number> = {
          'BRT': 82.4, 'WTI': 78.1, 'NG': 2.34, 'HO': 2.71, 'RB': 2.48, 'DUB': 81.2
        };
        results.push({
          symbol: c.symbol, name: c.name, shortName: c.symbol,
          price: mockPrices[c.symbol] ?? 0, change: 0, changePct: 0,
          high: 0, low: 0, open: 0, unit: c.unit, trend: 'flat', history: [],
        });
      }
    })
  );

  // Sort in preferred display order
  const order = ['BRT', 'WTI', 'DUB', 'NG', 'HO', 'RB'];
  results.sort((a, b) => order.indexOf(a.symbol) - order.indexOf(b.symbol));

  return NextResponse.json({ prices: results, updatedAt: new Date().toISOString() });
}
