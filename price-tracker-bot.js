/**
 * Price Tracking Bot - Run this with: node price-tracker-bot.js
 * Monitors assets for >0.75% moves in past 5 minutes and sends Telegram alerts
 *
 * Set environment variables:
 * - API_URL: http://localhost:3000 or https://your-deployed-url.vercel.app
 * - TELEGRAM_BOT_TOKEN: 8257832519:AAHZ8X_gsOpkUs-HVzhuvC_AWLOsdwU-tUs
 * - TELEGRAM_CHAT_ID: Your Telegram chat ID (get from @userinfobot)
 */

const fetch = require('node-fetch');

const API_URL = process.env.API_URL || 'https://pablo-intel-alexs-projects-1bd9e873.vercel.app';
const TELEGRAM_BOT_TOKEN = '8257832519:AAHZ8X_gsOpkUs-HVzhuvC_AWLOsdwU-tUs';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const TRACKED_ASSETS = ['BTC', 'ETH', 'HYPE', 'SOL', 'PYTH', 'FOGO', 'GOLD', 'SP500', 'BRENT', 'WTI'];
const MOVE_THRESHOLD = 0.75; // %
const CHECK_INTERVAL = 60000; // 1 minute

// Store price history
const priceHistory = {};

async function sendTelegramAlert(message) {
  if (!TELEGRAM_CHAT_ID) {
    console.log('⚠️  No TELEGRAM_CHAT_ID set. Set it with: export TELEGRAM_CHAT_ID=your_chat_id');
    console.log('Get your chat ID from: https://t.me/userinfobot');
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      console.error(`❌ Telegram error: ${response.statusText}`);
    }
  } catch (error) {
    console.error('❌ Failed to send Telegram alert:', error.message);
  }
}

async function getPrices() {
  try {
    const response = await fetch(`${API_URL}/api/prices`);
    const data = await response.json();
    const prices = {};

    if (data.prices) {
      data.prices.forEach(p => {
        const symbol = p.symbol?.toUpperCase();
        if (TRACKED_ASSETS.includes(symbol)) {
          prices[symbol] = p.price;
        }
      });
    }

    return prices;
  } catch (error) {
    console.error('❌ Failed to fetch prices:', error.message);
    return {};
  }
}

function calculateChange(oldPrice, newPrice) {
  if (!oldPrice || oldPrice === 0) return 0;
  return ((newPrice - oldPrice) / oldPrice) * 100;
}

async function checkPrices() {
  const now = Date.now();
  const fiveMinutesAgo = now - 5 * 60 * 1000;

  const prices = await getPrices();
  console.log(`\n⏰ Check at ${new Date().toLocaleTimeString()}`);

  if (Object.keys(prices).length === 0) {
    console.log('⚠️  No prices fetched');
    return;
  }

  // Store current prices
  for (const [symbol, price] of Object.entries(prices)) {
    if (!priceHistory[symbol]) {
      priceHistory[symbol] = [];
    }
    priceHistory[symbol].push({ price, timestamp: now });

    // Keep only last 10 minutes of data
    priceHistory[symbol] = priceHistory[symbol].filter(
      p => p.timestamp > now - 10 * 60 * 1000
    );
  }

  // Check for moves > 0.75%
  for (const symbol of TRACKED_ASSETS) {
    const history = priceHistory[symbol] || [];
    if (history.length < 2) continue;

    // Find price from 5 minutes ago
    const oldestPrice = history
      .filter(p => p.timestamp <= fiveMinutesAgo)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    const currentPrice = prices[symbol];

    if (!oldestPrice || !currentPrice) continue;

    const change = calculateChange(oldestPrice.price, currentPrice);
    const absChange = Math.abs(change);

    if (absChange > MOVE_THRESHOLD) {
      const direction = change > 0 ? '📈 UP' : '📉 DOWN';
      const emoji = change > 0 ? '🟢' : '🔴';
      const message = `${emoji} <b>${direction} ${symbol}</b>\n<b>${absChange.toFixed(2)}%</b> in 5min\n$${oldestPrice.price.toFixed(2)} → $${currentPrice.toFixed(2)}`;

      console.log(`${emoji} ALERT: ${symbol} ${direction} ${absChange.toFixed(2)}%`);
      await sendTelegramAlert(message);
    } else {
      console.log(`${symbol}: ${change > 0 ? '↑' : '↓'} ${absChange.toFixed(2)}%`);
    }
  }
}

async function start() {
  console.log('🚀 Price Tracking Bot Started');
  console.log(`📍 API URL: ${API_URL}`);
  console.log(`📍 Watching: ${TRACKED_ASSETS.join(', ')}`);
  console.log(`⚠️  Alert threshold: ${MOVE_THRESHOLD}% in 5 minutes`);

  if (!TELEGRAM_CHAT_ID) {
    console.log('\n⚠️  TELEGRAM_CHAT_ID not set!');
    console.log('To enable Telegram alerts:');
    console.log('1. Get your chat ID from https://t.me/userinfobot');
    console.log('2. Set environment variable: export TELEGRAM_CHAT_ID=your_id');
    console.log('3. Restart the bot\n');
  } else {
    console.log(`✅ Telegram alerts enabled for chat: ${TELEGRAM_CHAT_ID}\n`);
  }

  // Initial check
  await checkPrices();

  // Check every minute
  setInterval(checkPrices, CHECK_INTERVAL);
}

start();
