import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import type { NewsItem } from '@/lib/types';

export const runtime = 'edge';
export const revalidate = 0;

const RSS_FEEDS = [
  { url: 'https://oilprice.com/rss/main',         source: 'OilPrice.com',   tier: 1 },
  { url: 'https://www.eia.gov/rss/todayinenergy.xml', source: 'EIA',        tier: 1 },
  { url: 'https://news.google.com/rss/search?q=crude+oil+Brent+WTI+price&hl=en-US&gl=US&ceid=US:en',
                                                   source: 'Reuters/Misc',  tier: 2 },
  { url: 'https://news.google.com/rss/search?q=OPEC+production+oil+output&hl=en-US&gl=US&ceid=US:en',
                                                   source: 'OPEC News',     tier: 2 },
  { url: 'https://news.google.com/rss/search?q=oil+sanctions+embargo+Iran+Russia&hl=en-US&gl=US&ceid=US:en',
                                                   source: 'Sanctions News', tier: 2 },
  { url: 'https://news.google.com/rss/search?q=Strait+Hormuz+Red+Sea+tanker+oil&hl=en-US&gl=US&ceid=US:en',
                                                   source: 'Chokepoint News', tier: 1 },
];

const BULLISH_WORDS = ['surge', 'spike', 'soar', 'jump', 'rally', 'shortage', 'disruption',
  'attack', 'blockade', 'closure', 'cut', 'sanction', 'embargo', 'draw', 'deficit', 'tight', 'escalat'];
const BEARISH_WORDS = ['crash', 'plunge', 'drop', 'fall', 'surplus', 'glut', 'oversupply',
  'build', 'increase output', 'ramp', 'ease', 'ceasefire', 'peace', 'recession', 'demand destroy'];
const DRIVER_MAP: Record<string, string> = {
  'hormuz|persian gulf|iran navy': 'strait_hormuz',
  'opec|production cut|output cut|quota|barrel': 'opec',
  'sanction|embargo|price cap|shadow fleet': 'sanctions',
  'suez|red sea|houthi|bab el-mandeb': 'chokepoints',
  'inventory|stockpile|cushing|eia weekly|api report': 'inventory',
  'war|military|strike|attack|airstrike|missile': 'war_conflict',
  'china|chinese|pmi|teapot|beijing': 'china_demand',
  'hurricane|tropical|gulf of mexico|freeze|polar': 'weather',
  'shale|permian|bakken|rig count|baker hughes': 'us_supply',
  'federal reserve|fed rate|interest rate|fomc': 'macro',
};

function scoreArticle(title: string, summary: string): { score: number; direction: 'bullish' | 'bearish' | 'mixed' | 'neutral'; drivers: string[]; category: string } {
  const text = `${title} ${summary}`.toLowerCase();
  let bullish = 0, bearish = 0;
  for (const w of BULLISH_WORDS) if (text.includes(w)) bullish++;
  for (const w of BEARISH_WORDS) if (text.includes(w)) bearish++;

  const drivers: string[] = [];
  const categories: string[] = [];
  for (const [pattern, driver] of Object.entries(DRIVER_MAP)) {
    if (pattern.split('|').some(p => text.includes(p))) {
      drivers.push(driver);
      const cat = driver === 'strait_hormuz' || driver === 'war_conflict' || driver === 'sanctions' || driver === 'chokepoints' ? 'geopolitical'
                : driver === 'opec' ? 'opec'
                : driver === 'inventory' ? 'inventory'
                : driver === 'china_demand' ? 'demand'
                : driver === 'weather' ? 'weather'
                : driver === 'us_supply' ? 'supply'
                : 'macro';
      if (!categories.includes(cat)) categories.push(cat);
    }
  }

  const driverWeight = drivers.length;
  const multiBonus = driverWeight >= 3 ? 20 : driverWeight === 2 ? 10 : 0;
  const urgencyBonus = /breaking|urgent|flash|just in|developing/.test(text) ? 10 : 0;
  const geoBonus = categories.includes('geopolitical') ? 15 : categories.includes('opec') ? 10 : 0;

  const baseSentiment = (bullish + bearish > 0) ? Math.abs(bullish - bearish) / (bullish + bearish) * 30 : 5;
  const score = Math.min(100, baseSentiment + driverWeight * 8 + multiBonus + urgencyBonus + geoBonus);

  const direction: 'bullish' | 'bearish' | 'mixed' | 'neutral' =
    bullish > bearish * 1.5 ? 'bullish' :
    bearish > bullish * 1.5 ? 'bearish' :
    bullish + bearish > 0 ? 'mixed' : 'neutral';

  return { score, direction, drivers, category: categories[0] ?? 'general' };
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

async function fetchFeed(feedUrl: string, source: string) {
  const r = await fetch(feedUrl, {
    headers: { 'User-Agent': 'OilSentinel/1.0' },
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error('fetch failed');
  const xml = await r.text();
  const parser = new XMLParser({ ignoreAttributes: false, htmlEntities: true });
  const parsed = parser.parse(xml);
  const items = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
  const arr = Array.isArray(items) ? items : [items];

  return arr.slice(0, 8).map((item: Record<string, unknown>, i: number) => {
    const title   = String(item.title ?? '');
    const link    = String(item.link ?? item.guid ?? '');
    const rawSum  = String(item.description ?? item.summary ?? item.content ?? '');
    const summary = stripHtml(rawSum);
    const pubDate = String(item.pubDate ?? item.published ?? item.updated ?? '');

    const { score, direction, drivers, category } = scoreArticle(title, summary);
    const id = `${source}-${i}-${title.slice(0, 20).replace(/\W/g, '')}`;

    return {
      id, title, source, url: link, publishedAt: pubDate,
      summary, impactScore: Math.round(score), direction, drivers, category,
      isBreaking: score >= 70 || /breaking|urgent|flash/i.test(title),
    } as NewsItem;
  });
}

export async function GET() {
  const allItems: NewsItem[] = [];
  const seen = new Set<string>();

  await Promise.allSettled(
    RSS_FEEDS.map(async f => {
      try {
        const items = await fetchFeed(f.url, f.source);
        for (const item of items) {
          const key = item.title.slice(0, 60);
          if (!seen.has(key)) { seen.add(key); allItems.push(item); }
        }
      } catch { /* skip failed feeds */ }
    })
  );

  allItems.sort((a, b) => b.impactScore - a.impactScore);

  return NextResponse.json({ news: allItems.slice(0, 40), updatedAt: new Date().toISOString() });
}
