/**
 * Trading Signals API
 * Simple, robust implementation that returns live signals
 */

import { NextRequest, NextResponse } from "next/server";

// Type exports for frontend
export type SignalAction = "BUY" | "SELL" | "HOLD" | "WATCH";

export interface AssetSignal {
  symbol: string;
  name: string;
  action: SignalAction;
  confidence: number;
  price: number;
  priceStr: string;
  change: number;
  changePercent: number;
  entryZone: string;
  target: string;
  stopLoss: string;
  timeframe: string;
  rationale: string;
  indicators: Record<string, any>;
  updatedAt: string;
}

export interface SignalsPayload {
  signals: Record<string, AssetSignal>;
  updatedAt: string;
  source?: string;
}

// In-memory cache
let cachedSignals: Record<string, AssetSignal> = {};
let lastUpdate = new Date().toISOString();

/**
 * GET: Fetch live signals
 */
export async function GET(request: NextRequest): Promise<NextResponse<SignalsPayload>> {
  try {
    // Try to fetch prices and generate signals
    const liveSignals = await generateLiveSignals();

    // Merge live signals with manually posted signals (live takes priority)
    const mergedSignals = { ...cachedSignals, ...liveSignals };

    if (Object.keys(mergedSignals).length > 0) {
      cachedSignals = mergedSignals;
      lastUpdate = new Date().toISOString();

      return NextResponse.json({
        signals: mergedSignals,
        updatedAt: lastUpdate,
        source: Object.keys(liveSignals).length > 0 ? "live" : "cached",
      });
    }

    // Fallback to cached signals
    return NextResponse.json({
      signals: cachedSignals,
      updatedAt: lastUpdate,
      source: "cached",
    });
  } catch (error) {
    // Return cached or empty signals on error
    return NextResponse.json({
      signals: cachedSignals,
      updatedAt: lastUpdate,
      source: "cached",
    });
  }
}

/**
 * POST: Accept manual signal updates (for testing only - not persisted in serverless)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.signals) {
      // Merge with existing cached signals
      cachedSignals = { ...cachedSignals, ...body.signals };
      lastUpdate = new Date().toISOString();
    }

    // Return current state (live + cached)
    const liveSignals = await generateLiveSignals();
    const mergedSignals = { ...cachedSignals, ...liveSignals };

    return NextResponse.json({
      success: true,
      updatedAt: lastUpdate,
      count: Object.keys(mergedSignals).length,
      source: "merged",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}

/**
 * Generate live signals from market data
 */
async function generateLiveSignals(): Promise<Record<string, AssetSignal>> {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    // Fetch prices
    const pricesRes = await fetch(`${baseUrl}/api/prices`, {
      cache: "no-store",
      headers: { "Accept": "application/json" },
    });

    if (!pricesRes.ok) {
      return {};
    }

    const pricesData = await pricesRes.json();
    const prices = pricesData.prices || [];

    // Generate signals from prices
    const signals: Record<string, AssetSignal> = {};

    for (const price of prices) {
      if (!price.symbol || !price.price || !price.history) continue;

      const signal = createSignal(price);
      if (signal) {
        signals[signal.symbol] = signal;
      }
    }

    return signals;
  } catch (error) {
    console.error("Error generating signals:", error);
    return {};
  }
}

/**
 * Create a single signal from price data
 */
function createSignal(price: any): AssetSignal | null {
  try {
    const history = price.history || [];
    if (history.length < 20) return null;

    const closes = history.map((h: any) => h.v || 0).filter((v: number) => v > 0);
    if (closes.length < 20) return null;

    // Simple analysis: RSI-inspired logic
    const rsi = calculateSimpleRSI(closes);
    const trend = calculateTrend(closes);
    const momentum = price.changePercent || 0;

    // Generate signal
    let action: SignalAction = "HOLD";
    let confidence = 60;
    let rationale = "";

    if (rsi < 30 && momentum < -1) {
      action = "BUY";
      confidence = 75;
      rationale = "Oversold conditions with downward momentum";
    } else if (rsi > 70 && momentum > 1) {
      action = "SELL";
      confidence = 72;
      rationale = "Overbought conditions with upward momentum";
    } else if (trend === "UP" && rsi > 40 && rsi < 70) {
      action = "BUY";
      confidence = 68;
      rationale = "Uptrend with bullish momentum";
    } else if (trend === "DOWN" && rsi < 60 && rsi > 30) {
      action = "SELL";
      confidence = 65;
      rationale = "Downtrend with bearish momentum";
    }

    // Calculate price levels
    const range = price.price * 0.02;
    const entryZone = `${(price.price - range).toFixed(2)} - ${(price.price + range).toFixed(2)}`;
    const target = (action === "BUY"
      ? price.price * 1.03
      : price.price * 0.97
    ).toFixed(2);
    const stopLoss = (action === "BUY"
      ? price.price * 0.98
      : price.price * 1.02
    ).toFixed(2);

    return {
      symbol: price.symbol,
      name: price.name || price.symbol,
      action,
      confidence,
      price: price.price,
      priceStr: price.price.toFixed(2),
      change: price.change || 0,
      changePercent: price.changePercent || 0,
      entryZone,
      target,
      stopLoss,
      timeframe: "1D",
      rationale,
      indicators: {
        rsi: rsi.toFixed(1),
        trend,
        momentum: momentum.toFixed(2),
      },
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return null;
  }
}

/**
 * Simple RSI calculation
 */
function calculateSimpleRSI(prices: number[]): number {
  if (prices.length < 14) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = Math.max(0, prices.length - 14); i < prices.length; i++) {
    const change = prices[i] - (prices[i - 1] || prices[i]);
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / 14;
  const avgLoss = losses / 14;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Simple trend calculation
 */
function calculateTrend(prices: number[]): "UP" | "DOWN" | "SIDEWAYS" {
  if (prices.length < 3) return "SIDEWAYS";

  const recent = prices[prices.length - 1];
  const old = prices[Math.max(0, prices.length - 20)];

  if (recent > old * 1.02) return "UP";
  if (recent < old * 0.98) return "DOWN";
  return "SIDEWAYS";
}
