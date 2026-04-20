/**
 * Technical Indicators Library
 * Calculates RSI, MACD, and Moving Averages from price data
 */

export interface PricePoint {
  close: number;
  high: number;
  low: number;
  volume: number;
  timestamp?: string;
}

export interface IndicatorValues {
  rsi?: number;
  macd?: {
    line: number;
    signal: number;
    histogram: number;
  };
  sma?: {
    ma20: number;
    ma50: number;
    ma200: number;
  };
  ema?: {
    ema12: number;
    ema26: number;
  };
}

/**
 * Calculate Relative Strength Index (RSI)
 * @param prices Array of closing prices
 * @param period RSI period (default: 14)
 * @returns RSI value (0-100)
 */
export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) {
    return 50; // Return neutral if insufficient data
  }

  let gains = 0;
  let losses = 0;

  // Calculate initial average gains and losses
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Calculate subsequent RSI values for more accuracy
  for (let i = prices.length - period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const currentGain = change > 0 ? change : 0;
    const currentLoss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
  }

  if (avgLoss === 0) {
    return avgGain === 0 ? 50 : 100;
  }

  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  return rsi;
}

/**
 * Calculate Exponential Moving Average (EMA)
 * @param prices Array of prices
 * @param period EMA period
 * @returns EMA value
 */
export function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) {
    return prices[prices.length - 1]; // Return last price if insufficient data
  }

  // Calculate SMA as starting point
  let sma = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    sma += prices[i];
  }
  sma /= period;

  const multiplier = 2 / (period + 1);
  let ema = sma;

  // Calculate EMA from the next price onwards
  for (let i = prices.length - period + 1; i < prices.length; i++) {
    ema = prices[i] * multiplier + ema * (1 - multiplier);
  }

  return ema;
}

/**
 * Calculate Simple Moving Average (SMA)
 * @param prices Array of prices
 * @param period SMA period
 * @returns SMA value
 */
export function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) {
    const sum = prices.reduce((a, b) => a + b, 0);
    return sum / prices.length;
  }

  let sum = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    sum += prices[i];
  }

  return sum / period;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * @param prices Array of closing prices
 * @returns MACD line, Signal line, and Histogram
 */
export function calculateMACD(prices: number[]): { line: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macdLine = ema12 - ema26;

  // Calculate signal line (9-period EMA of MACD line)
  // For simplicity, we'll use a simplified approach
  const signalLine = calculateEMA([macdLine], 9);
  const histogram = macdLine - signalLine;

  return {
    line: macdLine,
    signal: signalLine,
    histogram: histogram,
  };
}

/**
 * Get all technical indicators for a given price series
 * @param pricePoints Array of price points with OHLCV data
 * @returns Object containing all calculated indicators
 */
export function getIndicators(pricePoints: PricePoint[]): IndicatorValues {
  if (pricePoints.length === 0) {
    return {};
  }

  const closingPrices = pricePoints.map((p) => p.close);

  return {
    rsi: calculateRSI(closingPrices, 14),
    macd: calculateMACD(closingPrices),
    sma: {
      ma20: calculateSMA(closingPrices, 20),
      ma50: calculateSMA(closingPrices, 50),
      ma200: calculateSMA(closingPrices, 200),
    },
    ema: {
      ema12: calculateEMA(closingPrices, 12),
      ema26: calculateEMA(closingPrices, 26),
    },
  };
}

/**
 * Analyze trend based on moving average alignment
 * @param prices Array of closing prices
 * @returns "UPTREND" | "DOWNTREND" | "SIDEWAYS"
 */
export function analyzeTrend(prices: number[]): "UPTREND" | "DOWNTREND" | "SIDEWAYS" {
  if (prices.length < 200) {
    return "SIDEWAYS";
  }

  const ma20 = calculateSMA(prices, 20);
  const ma50 = calculateSMA(prices, 50);
  const ma200 = calculateSMA(prices, 200);
  const currentPrice = prices[prices.length - 1];

  // Uptrend: price above all moving averages, short-term > medium > long-term
  if (currentPrice > ma20 && ma20 > ma50 && ma50 > ma200) {
    return "UPTREND";
  }

  // Downtrend: price below all moving averages, short-term < medium < long-term
  if (currentPrice < ma20 && ma20 < ma50 && ma50 < ma200) {
    return "DOWNTREND";
  }

  return "SIDEWAYS";
}
