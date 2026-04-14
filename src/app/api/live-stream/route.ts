import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Cache for 10 minutes — live stream IDs don't change often
let cachedId:   string | null = null;
let cachedTime = 0;
const TTL = 10 * 60 * 1000;

// Known AJ English YouTube live stream IDs to try if scrape fails
// These are historical fallback IDs — AJ maintains persistent live streams
const KNOWN_FALLBACK_IDS = [
  'tudkuJBe-I4',  // AJ English Live persistent
  'coYnMTkj0KI',  // backup
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

  // Try scraping the live URL
  let videoId = await scrapeChannelLiveId('AJEnglish');

  // If scrape didn't yield a usable ID, try the known fallbacks
  if (!videoId) {
    videoId = KNOWN_FALLBACK_IDS[0];
  }

  if (videoId) {
    cachedId   = videoId;
    cachedTime = Date.now();
    return NextResponse.json({ videoId, source: videoId === KNOWN_FALLBACK_IDS[0] ? 'fallback' : 'live' });
  }

  return NextResponse.json({ videoId: null }, { status: 404 });
}
