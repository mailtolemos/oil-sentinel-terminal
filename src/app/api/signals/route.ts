/**
 * API Route for Trading Signals
 * GET: Returns current signals (fetched and calculated)
 * POST: Manual signal updates (with optional auth)
 *
 * File location: src/app/api/signals/route.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { generateSignalsFromPrices, SignalConfig, TradeSignal } from "@/lib/signalEngine";

// Type exports for frontend components
export type AssetSignal = TradeSignal;
export interface SignalsPayload {
  signals: Record<string, AssetSignal>;
  updatedAt: string;
  source?: string;
}

// In-memory store for manual signals (fallback/manual overrides)
let signalsStore: Record<string, any> = {};
let storeLastUpdate: string = new Date().toISOString();

/**
 * GET: Fetch and calculate signals based on live market data
 */
export async function GET(request: NextRequest) {
  let pricesData: any = null;
  let signalInputs: any[] = [];

  try {
    // Fetch current prices from the prices API
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}`;

    const pricesResponse = await fetch(`${baseUrl}/api/prices`, {
      cache: "no-store",
    });

    if (!pricesResponse.ok) {
      console.warn(`Prices API returned ${pricesResponse.status}, using stored signals`);
      // Fallback to stored signals if prices API fails
      return NextResponse.json(
        {
          signals: signalsStore,
          updatedAt: storeLastUpdate,
          source: "stored",
        },
        { status: 200 }
      );
    }

    pricesData = await pricesResponse.json();
    console.log("Prices data received, item count:", pricesData.prices?.length || 0);

    // Transform prices data to signal generation format
    signalInputs = transformPricesToSignalInputs(pricesData);
    console.log("Signal inputs created:", signalInputs.length);

    // Signal configuration per symbol (customize as needed)
    const signalConfigs: Record<string, Partial<SignalConfig>> = {
      WTI: {
        rsiOverbought: 75,
        rsiOversold: 25,
        timeframe: "1D",
        trendWeight: 0.4,
      },
      BRENT: {
        rsiOverbought: 75,
        rsiOversold: 25,
        timeframe: "1D",
        trendWeight: 0.4,
      },
      "HEATING OIL": {
        rsiOverbought: 70,
        rsiOversold: 30,
        timeframe: "4H",
      },
      "HENRY HUB GAS": {
        rsiOverbought: 70,
        rsiOversold: 30,
        timeframe: "4H",
        macdThreshold: 0.00005,
      },
      RBOB: {
        rsiOverbought: 70,
        rsiOversold: 30,
        timeframe: "4H",
      },
      BTC: {
        rsiOverbought: 70,
        rsiOversold: 30,
        timeframe: "1D",
        trendWeight: 0.5,
      },
      ETH: {
        rsiOverbought: 70,
        rsiOversold: 30,
        timeframe: "1D",
        trendWeight: 0.5,
      },
      GOLD: {
        rsiOverbought: 70,
        rsiOversold: 30,
        timeframe: "1D",
        trendWeight: 0.3,
      },
      SILVER: {
        rsiOverbought: 75,
        rsiOversold: 25,
        timeframe: "1D",
        macdThreshold: 0.0002,
      },
      COPPER: {
        rsiOverbought: 70,
        rsiOversold: 30,
        timeframe: "1D",
      },
    };

    // Generate signals
    console.log("Attempting to generate signals from", signalInputs.length, "inputs");
    const signals = generateSignalsFromPrices(signalInputs, signalConfigs);
    console.log("Signals generated:", signals.length);

    // Convert to keyed format for response
    const signalsResponse: Record<string, any> = {};
    signals.forEach((signal) => {
      signalsResponse[signal.symbol] = {
        symbol: signal.symbol,
        name: signal.name,
        action: signal.action,
        confidence: signal.confidence,
        price: signal.price,
        priceStr: signal.priceStr,
        change: signal.change,
        changePercent: signal.changePercent,
        entryZone: signal.entryZone,
        target: signal.target,
        stopLoss: signal.stopLoss,
        timeframe: signal.timeframe,
        rationale: signal.rationale,
        indicators: signal.indicators,
        updatedAt: signal.updatedAt,
      };
    });

    // Update store with calculated signals
    signalsStore = signalsResponse;
    storeLastUpdate = new Date().toISOString();

    return NextResponse.json(
      {
        signals: signalsResponse,
        updatedAt: storeLastUpdate,
        source: "calculated",
        count: Object.keys(signalsResponse).length,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error("Error generating signals:", errorMsg);
    console.error("Stack:", error instanceof Error ? error.stack : "no stack");

    // Return error details so we can debug
    return NextResponse.json(
      {
        signals: signalsStore,
        updatedAt: storeLastUpdate,
        source: "error",
        error: errorMsg,
        debug: {
          pricesDataReceived: !!pricesData,
          pricesDataKeys: pricesData ? Object.keys(pricesData) : [],
          pricesCount: (pricesData?.prices || []).length,
          signalInputsCount: signalInputs?.length || 0,
        },
      },
      { status: 200 }
    );
  }
}

/**
 * POST: Manual signal updates with optional authentication
 */
export async function POST(request: NextRequest) {
  try {
    // Validate authorization if SIGNALS_SECRET is set
    const signalsSecret = process.env.SIGNALS_SECRET;
    if (signalsSecret) {
      const authHeader = request.headers.get("authorization");
      if (!authHeader || authHeader !== `Bearer ${signalsSecret}`) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    const body = await request.json();

    // Handle single signal update
    if (body.signal) {
      const signal = body.signal;
      signalsStore[signal.symbol] = signal;
    }

    // Handle batch signal updates
    if (body.signals) {
      Object.assign(signalsStore, body.signals);
    }

    storeLastUpdate = new Date().toISOString();

    return NextResponse.json(
      {
        success: true,
        updatedAt: storeLastUpdate,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating signals:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Transform prices data into signal generation input format
 */
function transformPricesToSignalInputs(
  pricesData: any
): Array<{
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  historicalData?: Array<{ close: number; high: number; low: number; volume: number }>;
}> {
  if (!pricesData) {
    return [];
  }

  // Handle both old format (commodities) and new format (prices)
  const pricesArray = pricesData.prices || pricesData.commodities || [];

  return pricesArray
    .map((item: any) => {
      // Extract historical data from history array (contains {t, v} objects)
      let historicalData: Array<{ close: number; high: number; low: number; volume: number }> = [];

      if (item.history && Array.isArray(item.history)) {
        historicalData = item.history.map((point: any) => ({
          close: point.v || 0,
          high: (point.v || 0) * 1.01,
          low: (point.v || 0) * 0.99,
          volume: 1000000,
        }));
      } else if (item.sparkline && Array.isArray(item.sparkline)) {
        // Fallback for old sparkline format
        historicalData = item.sparkline.map((price: number) => ({
          close: price,
          high: price * 1.01,
          low: price * 0.99,
          volume: 1000000,
        }));
      }

      return {
        symbol: item.symbol || item.name?.toUpperCase(),
        name: item.name || item.symbol,
        price: item.price || 0,
        change: item.change || item.changePct || 0,
        changePercent: item.changePct || item.change || 0,
        historicalData,
      };
    })
    .filter((input: any) => input.historicalData.length > 0);
}
