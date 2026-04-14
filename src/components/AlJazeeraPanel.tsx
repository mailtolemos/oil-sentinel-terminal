'use client';
import { useEffect, useState, useRef } from 'react';

interface NewsItem {
  title:       string;
  summary:     string;
  impactScore: number;
  direction:   'bullish' | 'bearish' | 'neutral';
  source:      string;
  pubDate:     string;
  url?:        string;
  topic:       string;
}

interface ActionItem {
  urgency:  'flash' | 'act' | 'watch';
  label:    string;
  action:   string;
  rationale: string;
  direction: 'long' | 'short' | 'neutral';
}

function deriveAction(item: NewsItem): ActionItem {
  const score = item.impactScore;
  const dir   = item.direction;

  if (score >= 70 && dir === 'bullish') return {
    urgency: 'flash', label: '⚡ ACT NOW — LONG',
    action:  'BUY BRT/WTI front-month | Add crude exposure',
    rationale: item.title.slice(0, 80),
    direction: 'long',
  };
  if (score >= 70 && dir === 'bearish') return {
    urgency: 'flash', label: '⚡ ACT NOW — SHORT',
    action:  'SELL BRT/WTI | Reduce crude longs | Consider puts',
    rationale: item.title.slice(0, 80),
    direction: 'short',
  };
  if (score >= 50 && dir === 'bullish') return {
    urgency: 'act',   label: '📊 CONSIDER LONG',
    action:  'Add BRT/WTI exposure on dips | Watch for confirmation',
    rationale: item.title.slice(0, 80),
    direction: 'long',
  };
  if (score >= 50 && dir === 'bearish') return {
    urgency: 'act',   label: '📊 CONSIDER SHORT',
    action:  'Trim crude longs | Tighten stops | Watch OPEC response',
    rationale: item.title.slice(0, 80),
    direction: 'short',
  };
  return {
    urgency: 'watch', label: '👁 MONITOR',
    action:  'Track for escalation — no immediate action',
    rationale: item.title.slice(0, 80),
    direction: 'neutral',
  };
}

const URGENCY_STYLE: Record<string, string> = {
  flash: 'bg-terminal-red/15 border-terminal-red/40 text-terminal-red',
  act:   'bg-terminal-amber/15 border-terminal-amber/40 text-terminal-amber',
  watch: 'bg-terminal-blue/10 border-terminal-blue/30 text-terminal-blue',
};

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)   return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}

// AJ English HLS stream URL
const AJE_HLS_URL = 'https://live-hls-web-aje.getaj.net/AJE/01.m3u8';

function LiveVideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoState, setVideoState] = useState<'loading' | 'playing' | 'error'>('loading');
  const hlsRef = useRef<unknown>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let destroyed = false;

    const initHls = async () => {
      try {
        // Dynamically import hls.js from CDN
        if (typeof window === 'undefined') return;

        // Check if hls.js is already loaded
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let Hls = (window as any).Hls;

        if (!Hls) {
          // Load hls.js from CDN
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load hls.js'));
            document.head.appendChild(script);
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Hls = (window as any).Hls;
        }

        if (destroyed) return;

        if (Hls && Hls.isSupported()) {
          const hls = new Hls({
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 10,
            maxBufferLength: 30,
            enableWorker: true,
          });
          hlsRef.current = hls;

          hls.loadSource(AJE_HLS_URL);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!destroyed) {
              video.play().catch(() => {});
              setVideoState('playing');
            }
          });

          hls.on(Hls.Events.ERROR, (_event: unknown, data: { fatal: boolean; type: string }) => {
            if (data.fatal) {
              if (data.type === 'networkError') {
                hls.startLoad();
              } else {
                setVideoState('error');
              }
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Native HLS support (Safari/iOS)
          video.src = AJE_HLS_URL;
          video.addEventListener('loadedmetadata', () => {
            if (!destroyed) {
              video.play().catch(() => {});
              setVideoState('playing');
            }
          });
          video.addEventListener('error', () => {
            if (!destroyed) setVideoState('error');
          });
        } else {
          setVideoState('error');
        }
      } catch {
        if (!destroyed) setVideoState('error');
      }
    };

    initHls();

    return () => {
      destroyed = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hls = hlsRef.current as any;
      if (hls) {
        hls.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  if (videoState === 'error') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-terminal-surface">
        <div className="text-terminal-red text-[22px]">📺</div>
        <div className="text-terminal-text text-[10px] text-center px-4">
          Al Jazeera Live stream unavailable
        </div>
        <a href="https://www.aljazeera.com/live/" target="_blank" rel="noopener noreferrer"
           className="text-[9px] text-terminal-blue underline font-['Orbitron'] tracking-wider">
          OPEN AJ LIVE ↗
        </a>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black">
      {videoState === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="w-4 h-4 border-2 border-terminal-red border-t-transparent rounded-full animate-spin" />
            <span className="text-[8px] text-terminal-dim font-['Orbitron'] tracking-wider">CONNECTING TO LIVE FEED…</span>
          </div>
        </div>
      )}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        muted
        playsInline
        controls
        style={{ display: 'block' }}
      />
      {/* Live badge */}
      <div className="absolute top-1.5 left-1.5 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm px-2 py-1 rounded text-[8px] pointer-events-none">
        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        <span className="text-white font-['Orbitron'] tracking-wider font-bold">AJ ENGLISH</span>
      </div>
      {videoState === 'playing' && (
        <div className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-sm px-2 py-1 rounded pointer-events-none">
          <span className="text-[7px] text-terminal-green font-['Orbitron'] tracking-wider font-bold">● HLS LIVE</span>
        </div>
      )}
    </div>
  );
}

export default function AlJazeeraPanel() {
  const [news, setNews]       = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNews = async () => {
    try {
      const r = await fetch('/api/news');
      const d = await r.json();
      setNews((d.articles ?? []).slice(0, 8));
    } catch { /* stale */ } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchNews();
    const iv = setInterval(fetchNews, 90_000);
    return () => clearInterval(iv);
  }, []);

  const topActions = news
    .filter(n => n.impactScore >= 45)
    .slice(0, 5)
    .map(n => ({ ...deriveAction(n), news: n }));

  return (
    <div className="flex flex-col h-full overflow-hidden bg-terminal-panel transition-colors duration-300">

      {/* ── Header ──────────────────────────────── */}
      <div className="section-header shrink-0">
        <div className="w-2 h-2 rounded-full bg-terminal-red animate-pulse" />
        <span>AL JAZEERA LIVE</span>
        <span className="ml-auto text-[8px] text-terminal-red font-bold font-['Orbitron'] animate-pulse">● LIVE</span>
      </div>

      {/* ── HLS Video Player ─────────────────────── */}
      <div className="shrink-0 relative bg-black" style={{ aspectRatio: '16/9' }}>
        <LiveVideoPlayer />
      </div>

      {/* ── Broadcast Intel ─────────────────────── */}
      <div className="shrink-0 px-2.5 pt-2 pb-1">
        <div className="text-[8px] font-['Orbitron'] text-terminal-dim uppercase tracking-widest flex items-center gap-2">
          <div className="h-px flex-1 bg-terminal-border" />
          <span>BROADCAST INTEL</span>
          <div className="h-px flex-1 bg-terminal-border" />
        </div>
      </div>

      {/* ── Actionable items ────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-1.5">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse h-10 bg-terminal-muted rounded" />
          ))
        ) : topActions.length === 0 ? (
          <div className="text-center text-terminal-dim text-[9px] py-4">
            No high-impact signals in last cycle
          </div>
        ) : (
          topActions.map((item, i) => (
            <div key={i}
                 className={`rounded border px-2.5 py-2 ${URGENCY_STYLE[item.urgency]}`}>
              {/* Label + direction */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-[8px] font-bold font-['Orbitron'] tracking-wider">{item.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] font-bold">
                    {item.direction === 'long' ? '▲ LONG' : item.direction === 'short' ? '▼ SHORT' : '■ WATCH'}
                  </span>
                  <span className="text-[7px] text-terminal-dim">{timeAgo(item.news.pubDate)}</span>
                </div>
              </div>

              {/* Action */}
              <div className="text-[8px] font-semibold text-terminal-bright mb-1">→ {item.action}</div>

              {/* Rationale */}
              <div className="text-[8px] text-terminal-text opacity-80 leading-snug line-clamp-2">
                {item.rationale}
              </div>

              {/* Source + score */}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[7px] text-terminal-dim">{item.news.source}</span>
                <div className="flex-1 h-px bg-current opacity-20" />
                <span className="text-[7px] font-bold">SCORE {item.news.impactScore}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
