import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const revalidate = 0;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Recommendation {
  commodity: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD' | 'WATCH';
  currentPrice: number;
  entryZone: string;
  target: string;
  stopLoss: string;
  timeframe: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  rationale: string;
  risks: string[];
}

export interface AnalysisResult {
  type: 'oil' | 'minerals';
  generatedAt: string;
  nextUpdateAt: string;
  outlookLabel: string;
  outlookScore: number;
  executiveSummary: string;
  recommendations: Recommendation[];
  keyLevels: { label: string; price: string; significance: string }[];
  catalysts: { date: string; event: string; impact: string }[];
  disclaimer: string;
}

// ── In-memory cache (1 hour per type) ────────────────────────────────────────
const cache: Record<string, { result: AnalysisResult; ts: number }> = {};
const CACHE_TTL = 60 * 60 * 1_000; // 1 hour

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// ── Pyth: fetch spot prices directly ─────────────────────────────────────────
const PYTH_OIL: Record<string, string> = {
  WTI: '925ca92ff005ae943c158e3563f59698ce7e75c5a8c8dd43303a0a154887b3e6',
  BRT: '27f0d5e09a830083e5491795cac9ca521399c8f7fd56240d09484b14e614d57a',
};
const PYTH_METALS: Record<string, string> = {
  XAU: '765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2',
  XAG: 'f2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e',
  XPT: '398e4bbc7cbf89d6648c21e08019d878967677753b3096799595c78f805a34e5',
};

async function fetchPyth(feedMap: Record<string, string>): Promise<Record<string, number>> {
  try {
    const ids = Object.values(feedMap).map(id => `ids[]=${id}`).join('&');
    const url  = `https://hermes.pyth.network/v2/updates/price/latest?${ids}`;
    const r    = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(7000) });
    if (!r.ok) return {};
    const data = await r.json();
    const idToSym = Object.fromEntries(Object.entries(feedMap).map(([s, id]) => [id, s]));
    const out: Record<string, number> = {};
    for (const item of data?.parsed ?? []) {
      const sym = idToSym[item.id];
      if (!sym) continue;
      const expo  = parseInt(item.price.expo, 10);
      const price = parseInt(item.price.price, 10) * Math.pow(10, expo);
      if (price > 0) out[sym] = price;
    }
    return out;
  } catch { return {}; }
}

// ── Stooq: fetch single quote ─────────────────────────────────────────────────
async function fetchStooq(sym: string): Promise<number> {
  try {
    const url   = `https://stooq.com/q/l/?s=${sym}&f=sd2t2ohlcv&h&e=csv`;
    const r     = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(7000) });
    if (!r.ok) return 0;
    const text  = await r.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) return 0;
    const parts = lines[1].split(',');
    return parseFloat(parts[6] ?? '0') || 0;
  } catch { return 0; }
}

// ── RSS fetch: grab a handful of headlines ────────────────────────────────────
async function fetchRssHeadlines(url: string, limit = 5): Promise<string[]> {
  try {
    const r    = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return [];
    const text = await r.text();
    const titles: string[] = [];
    const re   = /<title>(.*?)<\/title>/gi;
    let m;
    let count  = 0;
    while ((m = re.exec(text)) !== null && count < limit) {
      const raw = m[1];
    const t = raw.replace(/<!\[CDATA\[[\s\S]*?\]\]>/, (c: string) => c.slice(9, c.length - 3)).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#\d+;/g,'').trim();
      if (t && t.length > 10) { titles.push(t); count++; }
    }
    return titles;
  } catch { return []; }
}

// ── Build oil context ─────────────────────────────────────────────────────────
async function buildOilContext(): Promise<string> {
  // Fetch prices in parallel
  const [pyth, wtiStooq, brtStooq, hhStooq, goStooq, rbStooq, reutersHeads, oilpriceHeads] = await Promise.all([
    fetchPyth(PYTH_OIL),
    fetchStooq('cl.f'),
    fetchStooq('cb.f'),
    fetchStooq('ng.f'),
    fetchStooq('ho.f'),
    fetchStooq('rb.f'),
    fetchRssHeadlines('https://feeds.reuters.com/reuters/businessNews', 6),
    fetchRssHeadlines('https://oilprice.com/rss/main', 6),
  ]);

  const brt = pyth['BRT'] || brtStooq || 0;
  const wti = pyth['WTI'] || wtiStooq || 0;
  const hh  = hhStooq || 0;
  const go  = goStooq || 0;
  const rb  = rbStooq || 0;

  const spread = brt && wti ? (brt - wti).toFixed(2) : 'N/A';
  const crack  = rb && go && wti
    ? ((2 * rb * 42 + go * 42 - 3 * wti) / 3).toFixed(2)
    : 'N/A';

  const headlines = [...reutersHeads, ...oilpriceHeads]
    .filter(Boolean)
    .slice(0, 10)
    .map(h => `• ${h}`)
    .join('\n');

  return `
=== OIL MARKET DATA SNAPSHOT (${new Date().toUTCString()}) ===

CURRENT PRICES (sources: Pyth Network spot + Stooq futures):
• Brent Crude (BRT): $${brt > 0 ? brt.toFixed(2) : 'N/A'}/bbl   [${pyth['BRT'] ? 'Pyth live' : 'Stooq futures'}]
• WTI Crude (WTI):   $${wti > 0 ? wti.toFixed(2) : 'N/A'}/bbl   [${pyth['WTI'] ? 'Pyth live' : 'Stooq futures'}]
• Henry Hub (HH):    $${hh  > 0 ? hh.toFixed(3) : 'N/A'}/MMBtu  [Stooq futures]
• RBOB Gasoline:     $${rb  > 0 ? rb.toFixed(4)  : 'N/A'}/gal   [Stooq futures]
• Heating Oil:       $${go  > 0 ? go.toFixed(4)  : 'N/A'}/gal   [Stooq futures]

DERIVED METRICS:
• Brent–WTI spread:  $${spread}/bbl (>$3 = wide; <$1 = tight)
• 3-2-1 Crack spread: $${crack}/bbl (>$25 = strong margins; <$15 = compressed)
• OPEC+ spare capacity: ~3.2 Mb/d (historically tight — bullish structural support)
• US Strategic Petroleum Reserve: ~360 Mb (near 40-year low)
• US Dollar Index: elevated — headwind for USD-priced commodities

GEOPOLITICAL CONTEXT:
• Strait of Hormuz: elevated tension — 21 Mb/d (20% global supply) at risk
• Red Sea: Houthi disruptions ongoing — tankers rerouting via Cape (+10 days, +$1–2M/voyage)
• Russia: ~3.5 Mb/d under G7 price cap — sanctions compliance uncertain
• Libya: Sharara field sporadically disrupted (~0.3 Mb/d)
• Iran: nuclear negotiations status — sanctions risk premium embedded
• OPEC+ next scheduled meeting: policy unchanged, voluntary cuts maintained

RECENT MARKET HEADLINES:
${headlines || '• No headlines retrieved'}
`.trim();
}

// ── Build minerals context ────────────────────────────────────────────────────
async function buildMineralsContext(): Promise<string> {
  const [pyth, xpdStooq, cuStooq, kitcoHeads, miningHeads] = await Promise.all([
    fetchPyth(PYTH_METALS),
    fetchStooq('pa.f'),
    fetchStooq('hg.f'),
    fetchRssHeadlines('https://www.kitco.com/rss/kitconews.xml', 6),
    fetchRssHeadlines('https://www.mining.com/feed/', 6),
  ]);

  const xau = pyth['XAU'] || 0;
  const xag = pyth['XAG'] || 0;
  const xpt = pyth['XPT'] || 0;
  const xpd = xpdStooq || 0;
  const cu  = cuStooq || 0;

  const gsRatio  = xau && xag ? (xau / xag).toFixed(1) : 'N/A';
  const ptPdSprd = xpt && xpd ? (xpt - xpd).toFixed(0) : 'N/A';

  const headlines = [...kitcoHeads, ...miningHeads]
    .filter(Boolean)
    .slice(0, 10)
    .map(h => `• ${h}`)
    .join('\n');

  return `
=== MINERALS & METALS DATA SNAPSHOT (${new Date().toUTCString()}) ===

CURRENT PRICES (sources: Pyth Network spot + Stooq futures):
• Gold (XAU):      $${xau > 0 ? xau.toFixed(2) : 'N/A'}/oz   [${pyth['XAU'] ? 'Pyth live' : 'unavailable'}]
• Silver (XAG):    $${xag > 0 ? xag.toFixed(3) : 'N/A'}/oz   [${pyth['XAG'] ? 'Pyth live' : 'unavailable'}]
• Platinum (XPT):  $${xpt > 0 ? xpt.toFixed(2) : 'N/A'}/oz   [${pyth['XPT'] ? 'Pyth live' : 'unavailable'}]
• Palladium (XPD): $${xpd > 0 ? xpd.toFixed(2) : 'N/A'}/oz   [Stooq futures]
• Copper (CU):     $${cu  > 0 ? cu.toFixed(4)  : 'N/A'}/lb   [Stooq futures — multiply by 2204 for $/tonne]

KEY RATIOS:
• Gold/Silver ratio: ${gsRatio}x
  - Historical mean: ~67x | >90x = silver cheap vs gold | <60x = silver expensive
• Platinum–Palladium spread: $${ptPdSprd}
  - Positive = Pt trading at premium; negative = Pd at premium
  - EV transition is bearish for Pd (less catalytic converter demand), neutral-bullish for Pt

STRUCTURAL SUPPLY DISRUPTIONS:
• China REE controls: gallium, germanium, graphite export restrictions ACTIVE since Aug 2023
• DRC Cobalt: 70% global share — political instability risk elevated
• South Africa PGMs: Eskom load shedding reducing smelter output (Stage 4–6)
• Russia Palladium: 40% global supply — G7 sanctions creating supply uncertainty
• Chile Copper: 27% global share — royalty bill risk, water scarcity pressuring costs
• Indonesia Nickel: export ban reshaping global supply chain dynamics
• Kazatomprom: 45% global uranium production — strategic leverage

MACRO CONTEXT:
• Fed rate trajectory: elevated rates = stronger USD = headwind for metals
• Central bank gold buying: >1,000 tonnes/year — structural floor for XAU
• Battery metals demand: LFP adoption reducing cobalt/nickel intensity per EV

RECENT MARKET HEADLINES:
${headlines || '• No headlines retrieved'}
`.trim();
}

// ── Claude analysis prompt ────────────────────────────────────────────────────
function buildPrompt(type: 'oil' | 'minerals', context: string): string {
  const assetList = type === 'oil'
    ? 'Brent Crude (BRT), WTI Crude (WTI), Henry Hub Natural Gas (HH)'
    : 'Gold (XAU), Silver (XAG), Platinum (XPT), Palladium (XPD), Copper (CU)';

  return `You are a senior commodities analyst at an institutional trading desk with 20 years of experience. You have just received the following live market data.

${context}

Based ONLY on this real data, produce a direct, actionable market analysis for traders. Be specific with numbers. Do not hedge with "may" or "could" unless genuinely uncertain. Reference actual prices from the data.

Assets to cover: ${assetList}

Return ONLY a valid JSON object. No markdown. No explanation outside the JSON. No code fences. Start directly with { and end with }.

Schema:
{
  "outlookLabel": "one of: STRONGLY BEARISH, BEARISH, CAUTIOUSLY BEARISH, NEUTRAL, CAUTIOUSLY BULLISH, BULLISH, STRONGLY BULLISH",
  "outlookScore": integer from -100 to 100,
  "executiveSummary": "3-4 sentences: current market state, primary driver, main risk, actionable bottom line. Be specific.",
  "recommendations": [
    {
      "commodity": "full name e.g. Brent Crude",
      "symbol": "BRT",
      "action": "BUY or SELL or HOLD or WATCH",
      "currentPrice": number (use exact price from data, 0 if unavailable),
      "entryZone": "specific price range like $78.00-$79.50 or 'at market' if already at entry",
      "target": "specific price like $85.00",
      "stopLoss": "specific price like $75.50",
      "timeframe": "e.g. 1-2 WEEKS or 1-3 MONTHS",
      "confidence": "HIGH or MEDIUM or LOW",
      "rationale": "2-3 sentences with specific numbers from the data. Explain WHY now.",
      "risks": ["specific risk 1", "specific risk 2"]
    }
  ],
  "keyLevels": [
    { "label": "e.g. Brent key support", "price": "$78.50", "significance": "one sentence explaining why this level matters" }
  ],
  "catalysts": [
    { "date": "e.g. Wed 15:30 UTC", "event": "EIA Crude Inventory", "impact": "one sentence on expected market reaction" }
  ],
  "disclaimer": "one sentence risk disclaimer"
}

Rules:
- Include a recommendation for EVERY asset listed above
- Use prices from the data for currentPrice (use 0 if price shows as N/A)
- Entry zones should be slightly below current for BUY, above for SELL, based on support/resistance inference
- Rationale MUST cite at least one specific number from the data
- Keep rationale under 55 words
- Maximum 4 keyLevels, maximum 4 catalysts`;
}

// ── Extract JSON from Claude response (handles any wrapping) ─────────────────
function extractJSON(raw: string): string {
  // Try to find JSON between first { and last }
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response');
  return raw.slice(start, end + 1);
}

// ── Parse and validate Claude response ───────────────────────────────────────
function parseAnalysis(raw: string, type: 'oil' | 'minerals'): AnalysisResult {
  const json   = extractJSON(raw);
  const parsed = JSON.parse(json);

  const now    = new Date();
  const nextHr = new Date(now.getTime() + CACHE_TTL);

  return {
    type,
    generatedAt:      now.toISOString(),
    nextUpdateAt:     nextHr.toISOString(),
    outlookLabel:     String(parsed.outlookLabel     ?? 'NEUTRAL'),
    outlookScore:     Number(parsed.outlookScore     ?? 0),
    executiveSummary: String(parsed.executiveSummary ?? ''),
    recommendations:  Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    keyLevels:        Array.isArray(parsed.keyLevels)        ? parsed.keyLevels : [],
    catalysts:        Array.isArray(parsed.catalysts)        ? parsed.catalysts : [],
    disclaimer:       String(parsed.disclaimer ?? 'All recommendations are for informational purposes only. Not financial advice.'),
  };
}

// ── Main handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const type = (req.nextUrl.searchParams.get('type') ?? 'oil') as 'oil' | 'minerals';

  // Return cache unless force-refreshed
  const cached = cache[type];
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ ...cached.result, cached: true });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not set', detail: 'Add ANTHROPIC_API_KEY to Vercel environment variables (project settings → Environment Variables)' },
      { status: 503 }
    );
  }

  let context = '';
  try {
    context = type === 'oil'
      ? await buildOilContext()
      : await buildMineralsContext();
  } catch (ctxErr) {
    return NextResponse.json(
      { error: 'Data fetch failed', detail: `Could not gather market data: ${String(ctxErr)}` },
      { status: 500 }
    );
  }

  const prompt = buildPrompt(type, context);

  let raw = '';
  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages:   [{ role: 'user', content: prompt }],
    });
    raw = (message.content[0] as { type: string; text: string }).text ?? '';
  } catch (aiErr) {
    return NextResponse.json(
      { error: 'Claude API call failed', detail: String(aiErr) },
      { status: 500 }
    );
  }

  let result: AnalysisResult;
  try {
    result = parseAnalysis(raw, type);
  } catch (parseErr) {
    return NextResponse.json(
      { error: 'Response parse failed', detail: `Could not parse AI response: ${String(parseErr)}. Raw (first 300 chars): ${raw.slice(0, 300)}` },
      { status: 500 }
    );
  }

  cache[type] = { result, ts: Date.now() };
  return NextResponse.json(result);
}
