import { NextResponse } from 'next/server';
import type { PriceProjection } from '@/lib/types';

export const runtime = 'edge';
export const revalidate = 0;

async function fetchHistory(ticker: string): Promise<{ t: number; v: number }[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=180d`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 } });
  if (!r.ok) throw new Error('fetch failed');
  const data = await r.json();
  const timestamps: number[] = data?.chart?.result?.[0]?.timestamp ?? [];
  const closes: (number | null)[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  return timestamps.map((t, i) => ({ t: t * 1000, v: closes[i] ?? 0 })).filter(p => p.v > 0);
}

function ema(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    result.push(prices[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function linearRegression(y: number[]): { slope: number; intercept: number; r2: number } {
  const n = y.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const sumX  = x.reduce((a, b) => a + b, 0);
  const sumY  = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, v, i) => a + v * y[i], 0);
  const sumX2 = x.reduce((a, v) => a + v * v, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX ** 2);
  const intercept = (sumY - slope * sumX) / n;
  const yMean = sumY / n;
  const ssTot = y.reduce((a, v) => a + (v - yMean) ** 2, 0);
  const ssRes = y.reduce((a, v, i) => a + (v - (slope * i + intercept)) ** 2, 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

function stdDev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
}

async function fetchNewsSentiment(): Promise<number> {
  try {
    const url = `https://news.google.com/rss/search?q=crude+oil+price+OPEC+supply&hl=en-US&gl=US&ceid=US:en`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(4000) });
    const text = await r.text();
    const bullish = (text.match(/surge|spike|soar|shortage|disruption|cut|blockade|sanction/gi) ?? []).length;
    const bearish = (text.match(/crash|drop|glut|surplus|peace|ceasefire|ease|increase output/gi) ?? []).length;
    const total = bullish + bearish;
    if (total === 0) return 0;
    return Math.round(((bullish - bearish) / total) * 60);
  } catch { return 0; }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol') ?? 'BZ=F';

  try {
    const [history, sentiment] = await Promise.all([
      fetchHistory(symbol),
      fetchNewsSentiment(),
    ]);

    if (history.length < 30) throw new Error('insufficient history');

    const prices = history.map(p => p.v);
    const current = prices[prices.length - 1];

    // Technical indicators
    const ema20  = ema(prices, 20);
    const ema50  = ema(prices, 50);
    const sma20Last = ema20[ema20.length - 1];
    const sma50Last = ema50[ema50.length - 1];

    // Regression on last 30 days
    const recent30 = prices.slice(-30);
    const reg = linearRegression(recent30);
    const vol = stdDev(recent30);

    // Sentiment adjustment (±5% max)
    const sentimentAdj = (sentiment / 100) * current * 0.05;

    // Generate projections
    const projectionDays = [7, 14, 30];
    const projections = projectionDays.map(days => {
      const trendPrice = current + reg.slope * days + sentimentAdj;
      // Confidence narrows with R² strength, widens with time
      const confidenceMult = Math.sqrt(days);
      const ci = vol * confidenceMult * (1 - reg.r2 * 0.5);

      return {
        label: days === 7 ? '1 Week' : days === 14 ? '2 Weeks' : '1 Month',
        days,
        price: Math.round(trendPrice * 100) / 100,
        low: Math.round((trendPrice - ci * 1.645) * 100) / 100,
        high: Math.round((trendPrice + ci * 1.645) * 100) / 100,
        confidence: Math.round(Math.max(50, Math.min(92, reg.r2 * 100))),
      };
    });

    // Build signals
    const signals = [
      {
        name: 'EMA20 vs EMA50',
        value: sma20Last > sma50Last ? 'Bullish Cross' : 'Bearish Cross',
        direction: (sma20Last > sma50Last ? 'bullish' : 'bearish') as 'bullish' | 'bearish' | 'neutral',
      },
      {
        name: '30d Trend',
        value: reg.slope > 0.1 ? `+$${reg.slope.toFixed(2)}/day` : reg.slope < -0.1 ? `$${reg.slope.toFixed(2)}/day` : 'Flat',
        direction: (reg.slope > 0.1 ? 'bullish' : reg.slope < -0.1 ? 'bearish' : 'neutral') as 'bullish' | 'bearish' | 'neutral',
      },
      {
        name: 'News Sentiment',
        value: sentiment > 20 ? 'Strongly Bullish' : sentiment > 0 ? 'Bullish' : sentiment < -20 ? 'Strongly Bearish' : sentiment < 0 ? 'Bearish' : 'Neutral',
        direction: (sentiment > 0 ? 'bullish' : sentiment < 0 ? 'bearish' : 'neutral') as 'bullish' | 'bearish' | 'neutral',
      },
      {
        name: 'Volatility (σ)',
        value: `$${vol.toFixed(2)}/day`,
        direction: 'neutral' as const,
      },
      {
        name: 'Regression R²',
        value: `${(reg.r2 * 100).toFixed(0)}% fit`,
        direction: 'neutral' as const,
      },
    ];

    const bias: PriceProjection['bias'] =
      sentiment > 30 ? 'strongly_bullish' :
      sentiment > 10 ? 'bullish' :
      sentiment < -30 ? 'strongly_bearish' :
      sentiment < -10 ? 'bearish' : 'neutral';

    // Chart data: last 60 days actual + 30 days projected
    const chartActual = history.slice(-60).map(p => ({
      date: new Date(p.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      actual: Math.round(p.v * 100) / 100,
    }));

    const chartProjected = Array.from({ length: 30 }, (_, i) => {
      const d = i + 1;
      const proj = current + reg.slope * d + sentimentAdj;
      const ci = vol * Math.sqrt(d) * (1 - reg.r2 * 0.5);
      const futureDate = new Date(Date.now() + d * 86400000);
      return {
        date: futureDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        projected: Math.round(proj * 100) / 100,
        low: Math.round((proj - ci * 1.645) * 100) / 100,
        high: Math.round((proj + ci * 1.645) * 100) / 100,
      };
    });

    const chartData = [...chartActual, ...chartProjected];

    const result: PriceProjection = {
      symbol, currentPrice: Math.round(current * 100) / 100,
      projections, signals, sentimentScore: sentiment, bias, chartData,
    };

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Projection unavailable' }, { status: 503 });
  }
}
