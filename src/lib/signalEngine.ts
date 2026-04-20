/**
 * Signal Generation Engine
 * Generates trading signals based on technical indicators
 */

import { IndicatorValues, PricePoint, getIndicators, analyzeTrend } from "./indicators";

export type SignalAction = "BUY" | "SELL" | "HOLD" | "WATCH";
export type Timeframe = "1H" | "4H" | "1D" | "1W";

export interface TradeSignal {
  symbol: string;
  name: string;
  action: SignalAction;
  confidence: number; // 0-100
  price: number;
  priceStr: string;
  change: number;
  changePercent: number;
  entryZone: string;
  target: string;
  stopLoss: string;
  timeframe: Timeframe;
  rationale: string;
  indicators: IndicatorValues;
  updatedAt: string;
}

export interface SignalConfig {
  symbol: string;
  name: string;
  rsiOverbought?: number; // Default: 70
  rsiOversold?: number; // Default: 30
  macdThreshold?: number; // Default: 0.0001
  trendWeight?: number; // Weight of trend analysis 0-1
  timeframe?: Timeframe;
}

/**
 * Generate trading signal based on technical indicators
 */
export function generateSignal(
  symbol: string,
  name: string,
  currentPrice: number,
  priceChange: number,
  priceChangePercent: number,
  pricePoints: PricePoint[],
  config: Partial<SignalConfig> = {}
): TradeSignal {
  // Merge with defaults
  const cfg: Required<SignalConfig> = {
    symbol,
    name,
    rsiOverbought: config.rsiOverbought ?? 70,
    rsiOversold: config.rsiOversold ?? 30,
    macdThreshold: config.macdThreshold ?? 0.0001,
    trendWeight: config.trendWeight ?? 0.3,
    timeframe: config.timeframe ?? "1D",
  };

  // Calculate indicators
  const indicators = getIndicators(pricePoints);
  const trend = analyzeTrend(pricePoints.map((p) => p.close));

  // Generate signal based on indicators
  const { action, confidence, rationale } = generateSignalLogic(
    indicators,
    trend,
    cfg,
    currentPrice,
    priceChangePercent
  );

  // Calculate entry, target, and stop loss zones
  const { entryZone, target, stopLoss } = calculatePriceLevels(
    currentPrice,
    action,
    priceChangePercent,
    indicators.rsi
  );

  return {
    symbol: cfg.symbol,
    name: cfg.name,
    action,
    confidence,
    price: currentPrice,
    priceStr: currentPrice.toFixed(2),
    change: priceChange,
    changePercent: priceChangePercent,
    entryZone,
    target,
    stopLoss,
    timeframe: cfg.timeframe,
    rationale,
    indicators,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Core signal generation logic based on technical indicators
 */
function generateSignalLogic(
  indicators: IndicatorValues,
  trend: string,
  config: Required<SignalConfig>,
  currentPrice: number,
  priceChangePercent: number
): {
  action: SignalAction;
  confidence: number;
  rationale: string;
} {
  let score = 50; // Neutral starting point
  let signalReasons: string[] = [];

  // RSI Analysis (Weight: 30%)
  if (indicators.rsi !== undefined) {
    const rsi = indicators.rsi;
    if (rsi > config.rsiOverbought) {
      score -= 15;
      signalReasons.push(`RSI overbought (${rsi.toFixed(1)})`);
    } else if (rsi < config.rsiOversold) {
      score += 15;
      signalReasons.push(`RSI oversold (${rsi.toFixed(1)})`);
    } else if (rsi > 60) {
      score += 5;
      signalReasons.push(`RSI bullish (${rsi.toFixed(1)})`);
    } else if (rsi < 40) {
      score -= 5;
      signalReasons.push(`RSI bearish (${rsi.toFixed(1)})`);
    }
  }

  // MACD Analysis (Weight: 30%)
  if (indicators.macd) {
    const { line, signal, histogram } = indicators.macd;

    if (histogram > 0 && line > signal) {
      score += 12;
      signalReasons.push("MACD positive crossover");
    } else if (histogram < 0 && line < signal) {
      score -= 12;
      signalReasons.push("MACD negative crossover");
    } else if (histogram > config.macdThreshold) {
      score += 6;
      signalReasons.push("MACD bullish momentum");
    } else if (histogram < -config.macdThreshold) {
      score -= 6;
      signalReasons.push("MACD bearish momentum");
    }
  }

  // Moving Average Analysis (Weight: 20%)
  if (indicators.sma) {
    const { ma20, ma50, ma200 } = indicators.sma;
    const currentPrice_val = currentPrice;

    if (currentPrice_val > ma20 && ma20 > ma50 && ma50 > ma200) {
      score += 10;
      signalReasons.push("MA alignment bullish");
    } else if (currentPrice_val < ma20 && ma20 < ma50 && ma50 < ma200) {
      score -= 10;
      signalReasons.push("MA alignment bearish");
    }

    // Golden cross / Death cross indicators
    if (ma20 > ma50 && ma50 > ma200) {
      score += 5;
    } else if (ma20 < ma50 && ma50 < ma200) {
      score -= 5;
    }
  }

  // Trend Analysis (Weight: 20%)
  if (trend === "UPTREND") {
    score += 10;
    signalReasons.push(`Long-term ${trend}`);
  } else if (trend === "DOWNTREND") {
    score -= 10;
    signalReasons.push(`Long-term ${trend}`);
  }

  // Price momentum (Weight: bonus)
  if (priceChangePercent > 2) {
    score += 3;
    signalReasons.push("Strong upward momentum");
  } else if (priceChangePercent < -2) {
    score -= 3;
    signalReasons.push("Strong downward momentum");
  }

  // Determine action and confidence
  let action: SignalAction;
  let confidence: number;

  if (score >= 65) {
    action = "BUY";
    confidence = Math.min(100, 50 + (score - 50) * 1.5);
  } else if (score >= 55) {
    action = "BUY";
    confidence = Math.min(95, 40 + (score - 50) * 1.2);
  } else if (score >= 45) {
    action = "HOLD";
    confidence = Math.min(90, 30 + Math.abs(score - 50));
  } else if (score >= 35) {
    action = "SELL";
    confidence = Math.min(95, 40 + (50 - score) * 1.2);
  } else if (score <= 25) {
    action = "SELL";
    confidence = Math.min(100, 50 + (50 - score) * 1.5);
  } else {
    action = "HOLD";
    confidence = Math.min(90, 30 + Math.abs(score - 50));
  }

  // Ensure confidence is between 50 and 100
  confidence = Math.max(50, Math.min(100, confidence));

  const rationale = signalReasons.length > 0
    ? signalReasons.join("; ")
    : `Score-based signal (${action})`;

  return { action, confidence, rationale };
}

/**
 * Calculate entry zones, targets, and stop loss levels
 */
function calculatePriceLevels(
  currentPrice: number,
  action: SignalAction,
  priceChangePercent: number,
  rsi?: number
): {
  entryZone: string;
  target: string;
  stopLoss: string;
} {
  const volatility = Math.abs(priceChangePercent) > 0.5 ? 0.03 : 0.02; // 2-3% volatility adjustment

  if (action === "BUY") {
    // For BUY signals, entry is near current price with slight dip
    const entryLow = currentPrice * 0.98;
    const entryHigh = currentPrice * 1.01;

    // Target: 3-5% gain
    const targetPrice = currentPrice * (1 + (rsi && rsi > 50 ? 0.05 : 0.03));

    // Stop loss: 2% below entry
    const stopLossPrice = currentPrice * 0.98;

    return {
      entryZone: `${entryLow.toFixed(2)} - ${entryHigh.toFixed(2)}`,
      target: targetPrice.toFixed(2),
      stopLoss: stopLossPrice.toFixed(2),
    };
  } else if (action === "SELL") {
    // For SELL signals, entry is near current price with slight uptick
    const entryLow = currentPrice * 0.99;
    const entryHigh = currentPrice * 1.02;

    // Target: 3-5% decline
    const targetPrice = currentPrice * (1 - (rsi && rsi < 50 ? 0.05 : 0.03));

    // Stop loss: 2% above entry
    const stopLossPrice = currentPrice * 1.02;

    return {
      entryZone: `${entryLow.toFixed(2)} - ${entryHigh.toFixed(2)}`,
      target: targetPrice.toFixed(2),
      stopLoss: stopLossPrice.toFixed(2),
    };
  } else {
    // HOLD/WATCH signals
    const range = currentPrice * 0.01;
    return {
      entryZone: `${(currentPrice - range).toFixed(2)} - ${(currentPrice + range).toFixed(2)}`,
      target: (currentPrice * 1.02).toFixed(2),
      stopLoss: (currentPrice * 0.98).toFixed(2),
    };
  }
}

/**
 * Generate signals for multiple symbols from price data
 */
export function generateSignalsFromPrices(
  pricesData: Array<{
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    historicalData?: Array<{ close: number; high: number; low: number; volume: number }>;
  }>,
  configMap: Record<string, Partial<SignalConfig>> = {}
): TradeSignal[] {
  return pricesData
    .filter((p) => p.historicalData && p.historicalData.length > 0)
    .map((p) => {
      const config = configMap[p.symbol] || {};
      return generateSignal(
        p.symbol,
        p.name,
        p.price,
        p.change,
        p.changePercent,
        p.historicalData || [],
        config
      );
    });
}
