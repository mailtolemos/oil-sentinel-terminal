import { NextRequest, NextResponse } from "next/server";

// Store price history (in-memory, resets on deploy)
const priceHistory: Record<string, { price: number; timestamp: number }[]> = {};

// Assets to track
const TRACKED_ASSETS = ["BTC", "ETH", "HYPE", "SOL", "PYTH", "FOGO", "GOLD", "SP500", "BRENT", "WTI"];

// Telegram bot config
const TELEGRAM_BOT_TOKEN = "8257832519:AAHZ8X_gsOpkUs-HVzhuvC_AWLOsdwU-tUs";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID; // Will need to be set

async function sendTelegramAlert(message: string) {
  if (!TELEGRAM_CHAT_ID) {
    console.log("No TELEGRAM_CHAT_ID set, skipping alert");
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    });
  } catch (error) {
    console.error("Failed to send Telegram alert:", error);
  }
}

async function getPrices(): Promise<Record<string, number>> {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    const r = await fetch(`${baseUrl}/api/prices`, { cache: "no-store" });
    const data = await r.json();
    const prices: Record<string, number> = {};

    // Map prices to our tracked assets
    if (data.prices) {
      data.prices.forEach((p: any) => {
        const symbol = p.symbol?.toUpperCase();
        if (TRACKED_ASSETS.includes(symbol)) {
          prices[symbol] = p.price;
        }
      });
    }

    return prices;
  } catch (error) {
    console.error("Failed to fetch prices:", error);
    return {};
  }
}

function calculateChange(oldPrice: number, newPrice: number): number {
  if (!oldPrice || oldPrice === 0) return 0;
  return ((newPrice - oldPrice) / oldPrice) * 100;
}

export async function GET(request: NextRequest) {
  try {
    const prices = await getPrices();
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    // Store current prices
    for (const [symbol, price] of Object.entries(prices)) {
      if (!priceHistory[symbol]) {
        priceHistory[symbol] = [];
      }
      priceHistory[symbol].push({ price, timestamp: now });

      // Keep only last 10 minutes of data
      priceHistory[symbol] = priceHistory[symbol].filter(
        (p) => p.timestamp > now - 10 * 60 * 1000
      );
    }

    // Check for moves > 0.75%
    const alerts: string[] = [];

    for (const symbol of TRACKED_ASSETS) {
      const history = priceHistory[symbol] || [];
      if (history.length < 2) continue;

      // Find price from 5 minutes ago
      const oldestPrice = history
        .filter((p) => p.timestamp <= fiveMinutesAgo)
        .sort((a, b) => b.timestamp - a.timestamp)[0];

      const currentPrice = prices[symbol];

      if (!oldestPrice || !currentPrice) continue;

      const change = calculateChange(oldestPrice.price, currentPrice);
      const absChange = Math.abs(change);

      if (absChange > 0.75) {
        const direction = change > 0 ? "📈 UP" : "📉 DOWN";
        const message = `<b>${direction} ${symbol}</b>\n${absChange.toFixed(2)}% in 5min\n$${oldestPrice.price.toFixed(2)} → $${currentPrice.toFixed(2)}`;
        alerts.push(message);
        await sendTelegramAlert(message);
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      alerts,
      pricesTracked: Object.keys(prices).length,
    });
  } catch (error) {
    console.error("Price tracker error:", error);
    return NextResponse.json(
      { error: "Failed to track prices" },
      { status: 500 }
    );
  }
}
