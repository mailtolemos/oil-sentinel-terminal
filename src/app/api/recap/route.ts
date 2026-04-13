import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const revalidate = 0;

const BOT_TOKEN = '8765231096:AAHpncIbzIu2c9-i7ZQ9l5AwoKvdX1LxfV4';
const TG_BASE   = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Module-level cache (lives as long as the Edge instance)
let cachedRecap: RecapPayload | null = null;
let cacheTime   = 0;
const CACHE_TTL = 110 * 60 * 1000; // 110 minutes

export interface RecapPayload {
  generatedAt: string;
  title:       string;
  sections:    { heading: string; body: string }[];
  outlook:     string;
  priceLine:   string;
  sentToTg:    boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getTgChatIds(): Promise<string[]> {
  try {
    const r = await fetch(`${TG_BASE}/getUpdates?limit=100&offset=-100`);
    if (!r.ok) return [];
    const d = await r.json();
    const ids = new Set<string>();
    for (const u of d.result ?? []) {
      const chatId =
        u.message?.chat?.id ??
        u.channel_post?.chat?.id ??
        u.my_chat_member?.chat?.id;
      if (chatId) ids.add(String(chatId));
    }
    return Array.from(ids);
  } catch { return []; }
}

async function sendTelegram(text: string): Promise<boolean> {
  const ids = await getTgChatIds();
  if (ids.length === 0) return false;
  let ok = false;
  for (const chatId of ids) {
    try {
      const r = await fetch(`${TG_BASE}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id:    chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      if (r.ok) ok = true;
    } catch { /* skip */ }
  }
  return ok;
}

// ── Price data fetch ──────────────────────────────────────────────────────────

async function fetchPrices(baseUrl: string) {
  try {
    const r = await fetch(`${baseUrl}/api/prices`, { cache: 'no-store' });
    const d = await r.json();
    return (d.prices ?? []) as {
      symbol: string; name: string; price: number;
      change: number; changePct: number; trend: string;
    }[];
  } catch { return []; }
}

// ── News fetch ────────────────────────────────────────────────────────────────

async function fetchNews(baseUrl: string) {
  try {
    const r = await fetch(`${baseUrl}/api/news`, { cache: 'no-store' });
    const d = await r.json();
    return (d.news ?? []) as {
      title: string; summary: string; source: string;
      direction: string; impactScore: number;
      drivers: string[]; publishedAt: string;
    }[];
  } catch { return []; }
}

// ── Ships/threats fetch ───────────────────────────────────────────────────────

async function fetchShips(baseUrl: string) {
  try {
    const r = await fetch(`${baseUrl}/api/ships`, { cache: 'no-store' });
    const d = await r.json();
    return d as {
      chokepoints?: { id: string; name: string; status: string; riskLevel: number; dailyFlow?: string }[];
      threats?:     { id: string; region: string; type: string; severity: string; description: string }[];
    };
  } catch { return {}; }
}

// ── Projection fetch ──────────────────────────────────────────────────────────

async function fetchProjection(baseUrl: string) {
  try {
    const r = await fetch(`${baseUrl}/api/projection?symbol=BZ%3DF`, { cache: 'no-store' });
    const d = await r.json();
    if (d.error) return null;
    return d as { bias: string; currentPrice: number; projections?: { price: number; low: number; high: number }[] };
  } catch { return null; }
}

// ── Recap builder ─────────────────────────────────────────────────────────────

function buildRecap(
  prices:     ReturnType<typeof fetchPrices> extends Promise<infer T> ? T : never,
  news:       Awaited<ReturnType<typeof fetchNews>>,
  shipsData:  Awaited<ReturnType<typeof fetchShips>>,
  projection: Awaited<ReturnType<typeof fetchProjection>>,
): RecapPayload {
  const now = new Date();

  // ── 1. Price summary ────────────────────────────────────────────────────────
  const brent = prices.find(p => p.symbol === 'BRT');
  const wti   = prices.find(p => p.symbol === 'WTI');
  const ng    = prices.find(p => p.symbol === 'NG');

  const brentStr = brent
    ? `$${brent.price.toFixed(2)}/bbl (${brent.changePct >= 0 ? '+' : ''}${brent.changePct.toFixed(2)}%)`
    : 'N/A';
  const wtiStr = wti
    ? `$${wti.price.toFixed(2)}/bbl (${wti.changePct >= 0 ? '+' : ''}${wti.changePct.toFixed(2)}%)`
    : 'N/A';
  const ngStr = ng
    ? `$${ng.price.toFixed(4)}/MMBtu`
    : 'N/A';

  const movers = prices
    .filter(p => Math.abs(p.changePct) > 0.5)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

  const priceLine = brent ? `Brent ${brentStr} · WTI ${wtiStr} · NG ${ngStr}` : 'Prices unavailable';

  let priceBody = `Brent Crude: ${brentStr}\nWTI Crude: ${wtiStr}\nNatural Gas: ${ngStr}`;
  if (movers.length > 0) {
    priceBody += '\n\nTop movers: ' + movers.slice(0, 3).map(p =>
      `${p.symbol} ${p.changePct >= 0 ? '▲' : '▼'} ${Math.abs(p.changePct).toFixed(2)}%`
    ).join(', ');
  }

  // ── 2. Top news ─────────────────────────────────────────────────────────────
  const topNews = news
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, 6);

  const bullishCount = news.filter(n => n.direction === 'bullish').length;
  const bearishCount = news.filter(n => n.direction === 'bearish').length;
  const totalNews    = news.length;
  const sentimentPct = totalNews > 0
    ? `${Math.round((bullishCount / totalNews) * 100)}% bullish · ${Math.round((bearishCount / totalNews) * 100)}% bearish`
    : 'N/A';

  const newsBody = topNews.length > 0
    ? topNews.map((n, i) => {
        const dir = n.direction === 'bullish' ? '▲' : n.direction === 'bearish' ? '▼' : '◆';
        return `${i + 1}. ${dir} [${n.impactScore}] ${n.title} (${n.source})`;
      }).join('\n') + `\n\nSentiment: ${sentimentPct} across ${totalNews} headlines`
    : 'No recent headlines available.';

  // ── 3. Chokepoints & threats ────────────────────────────────────────────────
  const chokepoints = shipsData.chokepoints ?? [];
  const threats     = shipsData.threats ?? [];
  const critCps     = chokepoints.filter(c => c.status === 'critical' || c.status === 'disrupted');
  const highThreats = threats.filter(t => t.severity === 'high' || t.severity === 'critical');

  let geoBody = '';
  if (critCps.length > 0) {
    geoBody += 'Critical chokepoints:\n' + critCps.map(c =>
      `• ${c.name}: ${c.status.toUpperCase()} — ${c.dailyFlow ?? 'N/A'} at risk`
    ).join('\n');
  }
  if (highThreats.length > 0) {
    if (geoBody) geoBody += '\n\n';
    geoBody += 'Active threats:\n' + highThreats.slice(0, 4).map(t =>
      `• ${t.region}: ${t.description}`
    ).join('\n');
  }
  if (!geoBody) geoBody = 'No critical geopolitical disruptions at this time.';

  // ── 4. Outlook / Price projection ────────────────────────────────────────────
  let outlookBody = '';
  if (projection) {
    const bias   = projection.bias ?? 'neutral';
    const proj7d = projection.projections?.[0];
    const biasLbl =
      bias === 'strongly_bullish' ? '▲▲ STRONG BULLISH' :
      bias === 'bullish'          ? '▲  BULLISH' :
      bias === 'bearish'          ? '▼  BEARISH' :
      bias === 'strongly_bearish' ? '▼▼ STRONG BEARISH' : '◆  NEUTRAL';

    outlookBody = `Algorithmic bias: ${biasLbl}\n`;
    if (proj7d) {
      outlookBody += `7-day Brent target: $${proj7d.price.toFixed(2)} (range $${proj7d.low.toFixed(2)}–$${proj7d.high.toFixed(2)})`;
    }
  }

  // Analyst narrative based on signals
  const bullishSignals = news.filter(n => n.direction === 'bullish').length;
  const bearishSignals = news.filter(n => n.direction === 'bearish').length;
  const iranNews       = news.filter(n => /iran|irgc|tehran|nuclear|jcpoa|hormuz/i.test(n.title + n.summary));
  const opecNews       = news.filter(n => /opec|saudi|cut|quota/i.test(n.title + n.summary));
  const russiaSanc     = news.filter(n => /russia|sanctions|price cap|urals/i.test(n.title + n.summary));

  let narrative = '';
  if (iranNews.length >= 2) {
    narrative += 'Iran-related tensions remain elevated, supporting a geopolitical risk premium of $3–5/bbl on Brent. ';
  }
  if (opecNews.length >= 2) {
    narrative += 'OPEC+ supply discipline is being actively monitored — any production surprise would sharply re-price the forward curve. ';
  }
  if (russiaSanc.length >= 2) {
    narrative += 'Russian oil flows remain under G7 price cap pressure; shadow fleet activity continues but enforcement risk is rising. ';
  }
  if (bullishSignals > bearishSignals * 1.5) {
    narrative += 'The current news flow is decisively bullish — expect upward pressure in the near term unless demand data disappoints.';
  } else if (bearishSignals > bullishSignals * 1.5) {
    narrative += 'Bearish headline weight dominates — macro concerns and demand uncertainty may cap rallies.';
  } else {
    narrative += 'Mixed signals in the market — the tape is balanced between supply risk support and macro demand headwinds.';
  }

  const outlookFull = outlookBody
    ? `${outlookBody}\n\n${narrative}`
    : narrative;

  // ── 5. Title ─────────────────────────────────────────────────────────────────
  const brentDir = brent ? (brent.changePct >= 0 ? '▲' : '▼') : '';
  const title    = `OIL SENTINEL RECAP — ${now.toUTCString().slice(0, 16)} ${brentDir} Brent ${brent ? brentStr : ''}`;

  return {
    generatedAt: now.toISOString(),
    title,
    sections: [
      { heading: '💹 COMMODITY PRICES',     body: priceBody },
      { heading: '📰 TOP MARKET HEADLINES', body: newsBody  },
      { heading: '🌍 GEOPOLITICAL THREATS', body: geoBody   },
      { heading: '🔮 PRICE OUTLOOK',        body: outlookFull },
    ],
    outlook:   outlookFull,
    priceLine,
    sentToTg:  false,
  };
}

// ── Telegram message formatter ────────────────────────────────────────────────

function formatTelegramMessage(recap: RecapPayload): string {
  const header = `<b>🛢️ OIL SENTINEL — 2H INTEL BRIEF</b>\n<i>${new Date(recap.generatedAt).toUTCString().slice(0, 22)} UTC</i>\n\n`;
  const sections = recap.sections.map(s =>
    `<b>${s.heading}</b>\n${s.body}`
  ).join('\n\n');
  const footer = '\n\n<i>Powered by Oil Sentinel Terminal — oil-sentinel-terminal.vercel.app</i>';
  return header + sections + footer;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const isCron  = req.nextUrl.searchParams.get('cron') === 'true';
  const force   = req.nextUrl.searchParams.get('force') === 'true';
  const now     = Date.now();

  // Serve cache unless stale, forced, or cron trigger
  if (cachedRecap && !force && !isCron && (now - cacheTime) < CACHE_TTL) {
    return NextResponse.json(cachedRecap);
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  // Fetch all data in parallel
  const [prices, news, shipsData, projection] = await Promise.all([
    fetchPrices(baseUrl),
    fetchNews(baseUrl),
    fetchShips(baseUrl),
    fetchProjection(baseUrl),
  ]);

  const recap = buildRecap(prices, news, shipsData, projection);

  // Send to Telegram (cron or forced)
  if (isCron || force) {
    const msg  = formatTelegramMessage(recap);
    recap.sentToTg = await sendTelegram(msg);
  }

  cachedRecap = recap;
  cacheTime   = now;

  return NextResponse.json(recap);
}
