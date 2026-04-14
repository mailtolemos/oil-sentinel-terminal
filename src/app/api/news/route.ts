import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import type { NewsItem } from '@/lib/types';

export const runtime = 'nodejs';
export const revalidate = 0;

// Module-level cache — prevents hammering 30+ RSS feeds on every page load
interface NewsCache { news: NewsItem[]; articles: NewsItem[]; updatedAt: string; sourceCount: number; }
let cachedNews: NewsCache | null = null;
let newsCacheTime = 0;
const NEWS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─────────────────────────────────────────────────────────────────────────────
// FEED REGISTRY
// Priority tiers: 1 = premium/direct source, 2 = aggregated
// topic: used for additional scoring boost
// ─────────────────────────────────────────────────────────────────────────────
const RSS_FEEDS = [
  // ── Direct oil/energy publishers ───────────────────────────────────────────
  { url: 'https://oilprice.com/rss/main',
    source: 'OilPrice.com', tier: 1, topic: 'energy' },
  { url: 'https://www.eia.gov/rss/todayinenergy.xml',
    source: 'EIA', tier: 1, topic: 'inventory' },
  { url: 'https://www.rigzone.com/news/rss/rigzone_latest.aspx',
    source: 'Rigzone', tier: 1, topic: 'energy' },

  // ── Reuters / global news ───────────────────────────────────────────────────
  { url: 'https://feeds.reuters.com/reuters/businessNews',
    source: 'Reuters Business', tier: 1, topic: 'macro' },
  { url: 'https://feeds.reuters.com/reuters/worldNews',
    source: 'Reuters World', tier: 1, topic: 'geopolitical' },

  // ── BBC Middle East & World ─────────────────────────────────────────────────
  { url: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml',
    source: 'BBC Middle East', tier: 1, topic: 'iran_conflict' },
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    source: 'BBC World', tier: 1, topic: 'geopolitical' },

  // ── Al Jazeera ──────────────────────────────────────────────────────────────
  { url: 'https://www.aljazeera.com/xml/rss/all.xml',
    source: 'Al Jazeera', tier: 1, topic: 'iran_conflict' },

  // ── Google News: Iran war / conflict ───────────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=Iran+war+conflict+oil+nuclear+military+2025&hl=en-US&gl=US&ceid=US:en',
    source: 'Iran Conflict', tier: 1, topic: 'iran_conflict' },
  { url: 'https://news.google.com/rss/search?q=Iran+Israel+strike+attack+airstrike+missile&hl=en-US&gl=US&ceid=US:en',
    source: 'Iran-Israel', tier: 1, topic: 'iran_conflict' },
  { url: 'https://news.google.com/rss/search?q=Iran+IRGC+tanker+seizure+Hormuz+oil+sanctions&hl=en-US&gl=US&ceid=US:en',
    source: 'Iran Sanctions', tier: 1, topic: 'iran_conflict' },

  // ── Google News: Red Sea / Houthi ──────────────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=Houthi+Red+Sea+tanker+attack+shipping+Yemen&hl=en-US&gl=US&ceid=US:en',
    source: 'Red Sea Crisis', tier: 1, topic: 'chokepoints' },
  { url: 'https://news.google.com/rss/search?q=Strait+Hormuz+Bab+el-Mandeb+Suez+Canal+oil+tanker&hl=en-US&gl=US&ceid=US:en',
    source: 'Chokepoint News', tier: 1, topic: 'chokepoints' },

  // ── Google News: OPEC+ ─────────────────────────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=OPEC+production+cut+output+quota+Saudi+Arabia+UAE&hl=en-US&gl=US&ceid=US:en',
    source: 'OPEC News', tier: 1, topic: 'opec' },
  { url: 'https://news.google.com/rss/search?q=Saudi+Arabia+Aramco+oil+production+output+barrel&hl=en-US&gl=US&ceid=US:en',
    source: 'Saudi Arabia', tier: 1, topic: 'opec' },

  // ── Google News: Russia-Ukraine sanctions ──────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=Russia+oil+sanction+price+cap+shadow+fleet+Ukraine&hl=en-US&gl=US&ceid=US:en',
    source: 'Russia Oil', tier: 1, topic: 'sanctions' },
  { url: 'https://news.google.com/rss/search?q=Russia+Ukraine+war+pipeline+energy+G7&hl=en-US&gl=US&ceid=US:en',
    source: 'Russia-Ukraine', tier: 1, topic: 'sanctions' },

  // ── Google News: Iraq / Libya / Nigeria supply ─────────────────────────────
  { url: 'https://news.google.com/rss/search?q=Iraq+oil+Basra+production+pipeline+attack+disruption&hl=en-US&gl=US&ceid=US:en',
    source: 'Iraq Oil', tier: 2, topic: 'supply' },
  { url: 'https://news.google.com/rss/search?q=Libya+oil+field+Sharara+shutdown+blockade+output&hl=en-US&gl=US&ceid=US:en',
    source: 'Libya Oil', tier: 2, topic: 'supply' },
  { url: 'https://news.google.com/rss/search?q=Nigeria+oil+pipeline+Niger+Delta+NNPC+Bonny&hl=en-US&gl=US&ceid=US:en',
    source: 'Nigeria Oil', tier: 2, topic: 'supply' },

  // ── Google News: China demand ──────────────────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=China+oil+import+demand+refinery+teapot+2025&hl=en-US&gl=US&ceid=US:en',
    source: 'China Demand', tier: 1, topic: 'demand' },

  // ── Google News: US supply & inventory ────────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=EIA+crude+inventory+weekly+petroleum+status+stockpile&hl=en-US&gl=US&ceid=US:en',
    source: 'EIA Inventory', tier: 1, topic: 'inventory' },
  { url: 'https://news.google.com/rss/search?q=Permian+shale+rig+count+Baker+Hughes+US+oil+production&hl=en-US&gl=US&ceid=US:en',
    source: 'US Supply', tier: 2, topic: 'us_supply' },

  // ── Google News: Brent/WTI price ───────────────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=Brent+crude+oil+price+WTI+futures+market&hl=en-US&gl=US&ceid=US:en',
    source: 'Price Action', tier: 1, topic: 'price' },

  // ── Google News: Macro / global risk ──────────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=Federal+Reserve+rate+dollar+inflation+oil+demand+macro&hl=en-US&gl=US&ceid=US:en',
    source: 'Macro Risk', tier: 2, topic: 'macro' },
  { url: 'https://news.google.com/rss/search?q=global+conflict+war+oil+supply+disruption+geopolitical+risk&hl=en-US&gl=US&ceid=US:en',
    source: 'Geopolitical Risk', tier: 1, topic: 'geopolitical' },

  // ── Google News: Supply shortage countries ─────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=Venezuela+PDVSA+oil+production+shortage+sanctions+Maduro&hl=en-US&gl=US&ceid=US:en',
    source: 'Venezuela Oil', tier: 2, topic: 'shortage' },
  { url: 'https://news.google.com/rss/search?q=Sudan+civil+war+oil+pipeline+disruption+conflict&hl=en-US&gl=US&ceid=US:en',
    source: 'Sudan Crisis', tier: 2, topic: 'shortage' },
  { url: 'https://news.google.com/rss/search?q=Kazakhstan+CPC+pipeline+oil+export+disruption+Caspian&hl=en-US&gl=US&ceid=US:en',
    source: 'CPC Pipeline', tier: 2, topic: 'shortage' },
  { url: 'https://news.google.com/rss/search?q=Mexico+Pemex+oil+production+decline+output+shortage&hl=en-US&gl=US&ceid=US:en',
    source: 'Mexico Pemex', tier: 2, topic: 'shortage' },
  { url: 'https://news.google.com/rss/search?q=Ecuador+oil+indigenous+protest+Amazon+production+block&hl=en-US&gl=US&ceid=US:en',
    source: 'Ecuador Oil', tier: 2, topic: 'shortage' },

  // ── Asia fuel shortages (new) ─────────────────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=Pakistan+fuel+diesel+petrol+shortage+crisis+IMF+OGRA&hl=en-US&gl=US&ceid=US:en',
    source: 'Pakistan Fuel', tier: 2, topic: 'shortage' },
  { url: 'https://news.google.com/rss/search?q=Sri+Lanka+Bangladesh+Myanmar+Nepal+fuel+shortage+rationing&hl=en-US&gl=US&ceid=US:en',
    source: 'Asia Fuel Crisis', tier: 2, topic: 'shortage' },
  { url: 'https://news.google.com/rss/search?q=India+China+oil+demand+import+consumption+growth+barrel&hl=en-US&gl=US&ceid=US:en',
    source: 'Asia Oil Demand', tier: 1, topic: 'demand' },

  // ── LNG / natural gas (new) ───────────────────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=LNG+liquefied+natural+gas+export+terminal+price+cargo&hl=en-US&gl=US&ceid=US:en',
    source: 'LNG News', tier: 2, topic: 'gas' },
  { url: 'https://news.google.com/rss/search?q=TTF+Henry+Hub+natural+gas+price+European+Asian+LNG&hl=en-US&gl=US&ceid=US:en',
    source: 'Gas Prices', tier: 2, topic: 'gas' },

  // ── Shipping / tanker rates (new) ─────────────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=tanker+freight+rates+Baltic+dirty+VLCC+Aframax+worldscale&hl=en-US&gl=US&ceid=US:en',
    source: 'Tanker Rates', tier: 2, topic: 'shipping' },

  // ── CFTC positioning (new) ────────────────────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=CFTC+oil+positioning+speculative+net+long+short+COT+report&hl=en-US&gl=US&ceid=US:en',
    source: 'CFTC Positioning', tier: 2, topic: 'positioning' },

  // ── Official reports (new) ────────────────────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=IEA+oil+market+report+demand+forecast+monthly+2025&hl=en-US&gl=US&ceid=US:en',
    source: 'IEA Report', tier: 1, topic: 'report' },
  { url: 'https://news.google.com/rss/search?q=OPEC+monthly+oil+market+report+MOMR+forecast+production&hl=en-US&gl=US&ceid=US:en',
    source: 'OPEC MOMR', tier: 1, topic: 'report' },
  { url: 'https://news.google.com/rss/search?q=EIA+STEO+short-term+energy+outlook+forecast+crude+price&hl=en-US&gl=US&ceid=US:en',
    source: 'EIA STEO', tier: 1, topic: 'report' },

  // ── API inventories (new) ─────────────────────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=API+weekly+inventory+crude+oil+draw+build+petroleum&hl=en-US&gl=US&ceid=US:en',
    source: 'API Inventory', tier: 1, topic: 'inventory' },

  // ── Baker Hughes / US rigs (new) ──────────────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=Baker+Hughes+rig+count+weekly+drilling+active+US+oil&hl=en-US&gl=US&ceid=US:en',
    source: 'Baker Hughes', tier: 2, topic: 'us_supply' },

  // ── SPR / strategic reserve (new) ────────────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=US+strategic+petroleum+reserve+SPR+release+refill+emergency&hl=en-US&gl=US&ceid=US:en',
    source: 'SPR News', tier: 2, topic: 'inventory' },

  // ── Refining / crack spread (new) ────────────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=refinery+crack+spread+diesel+gasoline+margin+outage+turnaround&hl=en-US&gl=US&ceid=US:en',
    source: 'Refining', tier: 2, topic: 'supply' },

  // ── Dedicated energy outlets (new) ───────────────────────────────────────
  { url: 'https://www.worldoil.com/rss/news',
    source: 'World Oil', tier: 1, topic: 'energy' },
  { url: 'https://www.lngworldnews.com/feed/',
    source: 'LNG World News', tier: 1, topic: 'gas' },
  { url: 'https://www.arabianbusiness.com/rss/latest-news',
    source: 'Arabian Business', tier: 1, topic: 'opec' },
  { url: 'https://upstreamonline.com/rss',
    source: 'Upstream Online', tier: 1, topic: 'supply' },
];

// ─────────────────────────────────────────────────────────────────────────────
// SCORING KEYWORDS
// ─────────────────────────────────────────────────────────────────────────────
const BULLISH_WORDS = [
  'surge', 'spike', 'soar', 'jump', 'rally', 'shortage', 'disruption',
  'attack', 'blockade', 'closure', 'cut', 'sanction', 'embargo', 'draw',
  'deficit', 'tight', 'escalat', 'airstrike', 'missile', 'explosion',
  'seized', 'seized tanker', 'naval', 'conflict', 'war', 'offensive',
  'shutdown', 'outage', 'sabotage', 'halt', 'force majeure',
];

const BEARISH_WORDS = [
  'crash', 'plunge', 'drop', 'fall', 'surplus', 'glut', 'oversupply',
  'build', 'increase output', 'ramp', 'ease', 'ceasefire', 'peace',
  'recession', 'demand destroy', 'slump', 'weak demand', 'slowdown',
  'relief', 'nuclear deal', 'JCPOA', 'sanctions lifted', 'deal reached',
];

const HIGH_URGENCY = [
  'breaking', 'urgent', 'flash', 'just in', 'developing', 'exclusive',
  'alert', 'update', 'latest', 'war declared', 'shots fired', 'attack',
];

const DRIVER_MAP: Record<string, string> = {
  'hormuz|persian gulf|iran navy|irgc|iran strait': 'strait_hormuz',
  'opec|production cut|output cut|quota|barrel|aramco': 'opec',
  'sanction|embargo|price cap|shadow fleet|ofac|treasury': 'sanctions',
  'suez|red sea|houthi|bab el-mandeb|aden|yemen': 'chokepoints',
  'inventory|stockpile|cushing|eia weekly|api report|crude draw|crude build': 'inventory',
  'war|military|strike|attack|airstrike|missile|conflict|rocket|drone|explosion': 'war_conflict',
  'iran|irgc|khamenei|tehran|nuclear|jcpoa|enrichment': 'iran',
  'china|chinese|pmi|teapot|beijing|sinopec|cnooc': 'china_demand',
  'hurricane|tropical|gulf of mexico|freeze|polar|pipeline freeze': 'weather',
  'shale|permian|bakken|rig count|baker hughes|fracking': 'us_supply',
  'federal reserve|fed rate|interest rate|fomc|dollar|dxy': 'macro',
  'russia|urals|espo|moscow|novatek|lukoil|rosneft': 'russia',
  'libya|nigeria|iraq|venezuela|angola|kazakh|azerbaij': 'supply_disruption',
  'pdvsa|maracaibo|orinoco|chevron venezuela': 'supply_disruption',
  'cpc pipeline|tengiz|kashagan|aktau|caspian': 'supply_disruption',
  'pemex|cantarell|chicontepec|campeche': 'supply_disruption',
  'sudan|south sudan|nile|khartoum|rsf|saf conflict': 'supply_disruption',
  'shortage|deficit|supply gap|output curtail|force majeure|outage': 'supply_disruption',
};

// ─────────────────────────────────────────────────────────────────────────────
// SCORING
// ─────────────────────────────────────────────────────────────────────────────
function scoreArticle(
  title: string,
  summary: string,
  topic: string,
): {
  score: number;
  direction: 'bullish' | 'bearish' | 'mixed' | 'neutral';
  drivers: string[];
  category: string;
  isBreaking: boolean;
} {
  const text = `${title} ${summary}`.toLowerCase();
  let bullish = 0, bearish = 0;
  for (const w of BULLISH_WORDS) if (text.includes(w)) bullish++;
  for (const w of BEARISH_WORDS) if (text.includes(w)) bearish++;

  // Urgency detection
  const urgencyHit = HIGH_URGENCY.some(u => text.includes(u));
  const urgencyBonus = urgencyHit ? 15 : 0;

  // Driver matching
  const drivers: string[] = [];
  const categories: string[] = [];
  for (const [pattern, driver] of Object.entries(DRIVER_MAP)) {
    if (pattern.split('|').some(p => text.includes(p))) {
      drivers.push(driver);
      const cat =
        ['strait_hormuz', 'war_conflict', 'sanctions', 'chokepoints', 'iran', 'russia'].includes(driver) ? 'geopolitical'
        : driver === 'opec' ? 'opec'
        : driver === 'inventory' ? 'inventory'
        : driver === 'china_demand' ? 'demand'
        : driver === 'weather' ? 'weather'
        : driver === 'us_supply' ? 'supply'
        : driver === 'supply_disruption' ? 'supply'
        : 'macro';
      if (!categories.includes(cat)) categories.push(cat);
    }
  }

  // Topic bonus (feed-level topic relevance)
  const topicBonus =
    topic === 'iran_conflict' ? 20
    : topic === 'chokepoints' ? 18
    : topic === 'sanctions' ? 15
    : topic === 'opec' ? 12
    : topic === 'inventory' ? 10
    : topic === 'geopolitical' ? 12
    : topic === 'shortage' ? 14
    : topic === 'report' ? 10
    : topic === 'positioning' ? 8
    : topic === 'shipping' ? 8
    : topic === 'gas' ? 7
    : 0;

  const driverWeight = drivers.length;
  const multiBonus = driverWeight >= 4 ? 25 : driverWeight >= 3 ? 18 : driverWeight === 2 ? 10 : 0;
  const geoBonus = categories.includes('geopolitical') ? 18 : categories.includes('opec') ? 12 : 0;
  const baseSentiment = (bullish + bearish > 0) ? Math.abs(bullish - bearish) / (bullish + bearish) * 25 : 5;

  const score = Math.min(100, baseSentiment + driverWeight * 8 + multiBonus + urgencyBonus + geoBonus + topicBonus);

  const direction: 'bullish' | 'bearish' | 'mixed' | 'neutral' =
    bullish > bearish * 1.5  ? 'bullish'
    : bearish > bullish * 1.5 ? 'bearish'
    : bullish + bearish > 0   ? 'mixed'
    : 'neutral';

  const isBreaking = score >= 68 || urgencyHit || /breaking|urgent|flash/i.test(title);

  return { score, direction, drivers, category: categories[0] ?? 'general', isBreaking };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 320);
}

function parseDate(str: string): Date {
  if (!str) return new Date(0);
  try {
    const d = new Date(str);
    return isNaN(d.getTime()) ? new Date(0) : d;
  } catch {
    return new Date(0);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OIL RELEVANCE FILTER
// Blocks non-oil stories from general feeds (sports, entertainment, etc.)
// Ghana footballer, celebrity news, etc. should NEVER appear here.
// ─────────────────────────────────────────────────────────────────────────────

// Strong signal: any single term confirms oil/energy relevance
const OIL_STRONG_TERMS = [
  'crude', 'brent', 'wti', 'petroleum', 'opec', 'aramco', 'lng', 'tanker',
  'refinery', 'refining', 'barrel', 'mb/d', 'mbpd', 'pdvsa', 'pemex', 'rosneft',
  'novatek', 'lukoil', 'nnpc', 'adnoc', 'noc libya', 'cpc pipeline',
  'gasoline', 'diesel fuel', 'fuel oil', 'heating oil', 'gasoil',
  'shale', 'permian', 'bakken', 'eagle ford', 'fracking', 'hydraulic fracturing',
  'wellhead', 'upstream', 'downstream', 'midstream', 'exploration drilling',
  'oil field', 'oil well', 'oil price', 'oil production', 'oil output',
  'oil export', 'oil import', 'oil supply', 'oil demand', 'oil reserve',
  'oil market', 'oil sector', 'oil industry', 'oil company', 'oil minister',
  'oil sanction', 'oil embargo', 'energy sanction',
  'exxon', 'chevron', 'totalenergies', 'bp plc', 'shell oil', 'conocophillips',
  'natural gas price', 'gas pipeline', 'gas export', 'gas import', 'gas supply',
  'hormuz', 'bab el-mandeb', 'suez canal oil', 'oil tanker',
  'eia weekly', 'eia inventory', 'api inventory', 'baker hughes',
  'iea oil', 'opec report', 'energy outlook', 'steo',
  'price cap oil', 'shadow fleet',
];

// Weak signal: need 2+ or combined with a general energy word to confirm
const OIL_WEAK_TERMS = [
  'oil', 'fuel', 'energy crisis', 'energy security', 'energy market',
  'pipeline', 'gas station', 'pump price', 'petrol price', 'fuel price',
  'sanctions russia', 'iran nuclear', 'houthi', 'red sea attack',
  'saudi arabia oil', 'russia oil', 'iraq oil', 'libya oil',
  'venezuela oil', 'nigeria oil', 'angola oil',
];

// Topics that come from oil-specific feeds — always pass, no check needed
const ALWAYS_PASS_TOPICS = new Set([
  'iran_conflict', 'chokepoints', 'opec', 'inventory', 'shortage',
  'sanctions', 'us_supply', 'report', 'positioning', 'gas', 'shipping',
]);

function isOilRelevant(title: string, summary: string, topic: string): boolean {
  // Feeds with oil-specific topics are pre-filtered at source — always pass
  if (ALWAYS_PASS_TOPICS.has(topic)) return true;

  const text = (title + ' ' + summary).toLowerCase();
  const titleLower = title.toLowerCase();

  // Any single strong oil term in title → pass immediately
  if (OIL_STRONG_TERMS.some(t => titleLower.includes(t))) return true;

  // Any strong term in full text → pass
  if (OIL_STRONG_TERMS.some(t => text.includes(t))) return true;

  // 2+ weak terms in title → pass
  const weakTitleHits = OIL_WEAK_TERMS.filter(t => titleLower.includes(t)).length;
  if (weakTitleHits >= 2) return true;

  // 2+ weak terms in full text → pass
  const weakTextHits = OIL_WEAK_TERMS.filter(t => text.includes(t)).length;
  if (weakTextHits >= 2) return true;

  // Single "oil" in title + anything geopolitical = pass
  if (titleLower.includes('oil') && (
    text.includes('war') || text.includes('sanction') || text.includes('strike') ||
    text.includes('attack') || text.includes('iran') || text.includes('russia') ||
    text.includes('opec') || text.includes('saudi') || text.includes('price')
  )) return true;

  return false;
}

async function fetchFeed(feedUrl: string, source: string, topic: string): Promise<NewsItem[]> {
  const r = await fetch(feedUrl, {
    headers: {
      'User-Agent': 'OilSentinel/2.0 (crude oil market intelligence)',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    },
    signal: AbortSignal.timeout(4500), // 4.5s — reduced from 7s to cap slow feeds
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const xml = await r.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    htmlEntities: true,
    parseAttributeValue: true,
    trimValues: true,
  });
  const parsed = parser.parse(xml);

  // Support RSS 2.0, RSS 1.0, Atom
  const items =
    parsed?.rss?.channel?.item ??
    parsed?.feed?.entry ??
    parsed?.['rdf:RDF']?.item ??
    [];
  const arr = Array.isArray(items) ? items : [items];

  const results: NewsItem[] = [];
  for (const item of arr.slice(0, 15)) {
    const title   = String((item as Record<string, unknown>).title ?? '').replace(/^<!\[CDATA\[|\]\]>$/g, '').trim();
    if (!title || title.length < 10) continue;

    const rawLink = (item as Record<string, unknown>).link ?? (item as Record<string, unknown>).guid ?? (item as Record<string, unknown>).id ?? '';
    const link    = typeof rawLink === 'string' ? rawLink
                  : (rawLink as Record<string, string>)?.['@_href'] ?? String(rawLink);
    const rawSum  = String((item as Record<string, unknown>).description ?? (item as Record<string, unknown>).summary ?? (item as Record<string, unknown>)['content:encoded'] ?? (item as Record<string, unknown>).content ?? '');
    const summary = stripHtml(rawSum);
    const pubDate = String((item as Record<string, unknown>).pubDate ?? (item as Record<string, unknown>).published ?? (item as Record<string, unknown>).updated ?? (item as Record<string, unknown>)['dc:date'] ?? '');

    // ── Oil relevance gate — blocks sports, entertainment, unrelated news ──
    if (!isOilRelevant(title, summary, topic)) continue;

    const { score, direction, drivers, category, isBreaking } = scoreArticle(title, summary, topic);
    const id = `${source}-${results.length}-${title.slice(0, 24).replace(/\W/g, '')}`;

    results.push({
      id, title, source, url: link, publishedAt: pubDate,
      summary, impactScore: Math.round(score), direction, drivers, category, isBreaking,
    } as NewsItem);
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  // Serve from cache if fresh — avoids fetching 30+ RSS feeds on every load
  if (cachedNews && Date.now() - newsCacheTime < NEWS_CACHE_TTL) {
    return NextResponse.json({ ...cachedNews, cached: true });
  }

  const allItems: NewsItem[] = [];
  const seen = new Set<string>();
  const now = Date.now();
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  await Promise.allSettled(
    RSS_FEEDS.map(async f => {
      try {
        const items = await fetchFeed(f.url, f.source, f.topic);
        for (const item of items) {
          const key = item.title.slice(0, 70).toLowerCase();
          if (!seen.has(key) && item.title.length > 10) {
            seen.add(key);
            // Filter stale items
            const age = now - parseDate(item.publishedAt).getTime();
            if (age < MAX_AGE_MS) allItems.push(item);
          }
        }
      } catch { /* skip failed feeds silently */ }
    })
  );

  // ── Sort: newest first (primary), impact score (secondary within same hour bucket)
  allItems.sort((a, b) => {
    const ta = parseDate(a.publishedAt).getTime();
    const tb = parseDate(b.publishedAt).getTime();

    // Bucket by 2-hour windows, then by impact score within window
    const bucketA = Math.floor(ta / (2 * 60 * 60 * 1000));
    const bucketB = Math.floor(tb / (2 * 60 * 60 * 1000));

    if (bucketA !== bucketB) return bucketB - bucketA; // newest bucket first
    return b.impactScore - a.impactScore; // within same bucket, highest impact first
  });

  // Breaking items bubble to very top (if within last 12h)
  const cutoff12h = now - 12 * 60 * 60 * 1000;
  const breaking  = allItems.filter(i => i.isBreaking && parseDate(i.publishedAt).getTime() > cutoff12h);
  const rest      = allItems.filter(i => !(i.isBreaking && parseDate(i.publishedAt).getTime() > cutoff12h));
  breaking.sort((a, b) => parseDate(b.publishedAt).getTime() - parseDate(a.publishedAt).getTime());

  const final = [...breaking, ...rest];

  const payload: NewsCache = {
    news: final.slice(0, 60),
    articles: final.slice(0, 60),   // alias — component reads 'articles'
    updatedAt: new Date().toISOString(),
    sourceCount: RSS_FEEDS.length,
  };

  // Store in module-level cache
  if (payload.news.length > 0) {
    cachedNews = payload;
    newsCacheTime = Date.now();
  }

  return NextResponse.json(payload);
}
