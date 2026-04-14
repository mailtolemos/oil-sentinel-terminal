import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Cache for 10 minutes — live stream IDs don't change often
let cachedId:   string | null = null;
let cachedTime = 0;
const TTL = 10 * 60 * 1000;

// Primary live stream ID (user-verified working)
const PRIMARY_ID = 'gCNeDWCI0vo';

// Fallback IDs if scrape fails
const KNOWN_FALLBACK_IDS = [
  PRIMARY_ID,
  'tudkuJBe-I4',
];

async function scrapeChannelLiveId(handle: string): Promise<string | null> {
  const urls = [
    `https://www.youtube.com/@${handle}/live`,
    `https://www.youtube.com/c/${handle}/live`,
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(8000),
        redirect: 'follow',
      });
      if (!r.ok) continue;
      const html = await r.text();

      // Multiple extraction patterns — YouTube changes their page structure
      const patterns = [
        /"videoId":"([a-zA-Z0-9_-]{11})"/,
        /watch\?v=([a-zA-Z0-9_-]{11})/,
        /"VIDEO_ID":"([a-zA-Z0-9_-]{11})"/,
        /youtu\.be\/([a-zA-Z0-9_-]{11})/,
        /"liveStreamabilityRenderer".*?"videoId":"([a-zA-Z0-9_-]{11})"/,
      ];

      for (const pat of patterns) {
        const m = html.match(pat);
        if (m?.[1]) return m[1];
      }
    } catch { /* try next */ }
  }
  return null;
}

export async function GET() {
  // Return cache if fresh
  if (cachedId && Date.now() - cachedTime < TTL) {
    return NextResponse.json({ videoId: cachedId, source: 'cache' });
  }

  // Always start with the user-verified primary ID
  let videoId: string = PRIMARY_ID;
  let source  = 'primary';

  // Try scraping for a more current live stream ID (non-blocking best-effort)
  try {
    const scraped = await scrapeChannelLiveId('AJEnglish');
    if (scraped && scraped !== PRIMARY_ID) {
      videoId = scraped;
      source  = 'live';
    }
  } catch { /* keep primary */ }

  cachedId   = videoId;
  cachedTime = Date.now();
  return NextResponse.json({ videoId, source });
}
