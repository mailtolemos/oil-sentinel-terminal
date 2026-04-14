'use client';
import { useEffect, useState } from 'react';

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
  urgency:   'flash' | 'act' | 'watch';
  label:     string;
  action:    string;
  rationale: string;
  direction: 'long' | 'short' | 'neutral';
}

function deriveAction(item: NewsItem): ActionItem {
  const { impactScore: score, direction: dir } = item;
  if (score >= 70 && dir === 'bullish') return {
    urgency: 'flash', label: '⚡ ACT NOW — LONG',
    action:  'BUY BRT/WTI front-month | Add crude exposure',
    rationale: item.title.slice(0, 80), direction: 'long',
  };
  if (score >= 70 && dir === 'bearish') return {
    urgency: 'flash', label: '⚡ ACT NOW — SHORT',
    action:  'SELL BRT/WTI | Reduce crude longs | Consider puts',
    rationale: item.title.slice(0, 80), direction: 'short',
  };
  if (score >= 50 && dir === 'bullish') return {
    urgency: 'act', label: '📊 CONSIDER LONG',
    action:  'Add BRT/WTI exposure on dips | Watch for confirmation',
    rationale: item.title.slice(0, 80), direction: 'long',
  };
  if (score >= 50 && dir === 'bearish') return {
    urgency: 'act', label: '📊 CONSIDER SHORT',
    action:  'Trim crude longs | Tighten stops | Watch OPEC response',
    rationale: item.title.slice(0, 80), direction: 'short',
  };
  return {
    urgency: 'watch', label: '👁 MONITOR',
    action:  'Track for escalation — no immediate action',
    rationale: item.title.slice(0, 80), direction: 'neutral',
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

// ── Live Video component ──────────────────────────────────────────────────────
function LiveVideo() {
  const [videoId, setVideoId]   = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [iframeErr, setIframeErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch('/api/live-stream');
        const d = await r.json();
        if (!cancelled && d.videoId) setVideoId(d.videoId);
      } catch { /* ignore */ } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-black">
        <div className="w-4 h-4 border-2 border-terminal-red border-t-transparent rounded-full animate-spin" />
        <span className="text-[8px] text-terminal-dim font-['Orbitron'] tracking-wider">FETCHING LIVE FEED…</span>
      </div>
    );
  }

  if (!videoId || iframeErr) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-terminal-surface">
        <div className="text-[22px]">📺</div>
        <div className="text-terminal-text text-[9px] text-center px-4">Al Jazeera Live — stream unavailable</div>
        <a href="https://www.aljazeera.com/live/" target="_blank" rel="noopener noreferrer"
           className="text-[9px] text-terminal-blue underline font-['Orbitron'] tracking-wider">
          OPEN AJ LIVE ↗
        </a>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=1&rel=0&modestbranding=1&playsinline=1`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full border-0"
        title="Al Jazeera English Live"
        onError={() => setIframeErr(true)}
      />
      {/* Live badge overlay */}
      <div className="absolute top-1.5 left-1.5 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm px-2 py-1 rounded pointer-events-none">
        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        <span className="text-white text-[8px] font-['Orbitron'] tracking-wider font-bold">AJ ENGLISH</span>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
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
    <div className="flex flex-col h-full overflow-hidden bg-terminal-panel">

      {/* Header */}
      <div className="section-header shrink-0">
        <div className="w-2 h-2 rounded-full bg-terminal-red animate-pulse" />
        <span>AL JAZEERA LIVE</span>
        <span className="ml-auto text-[8px] text-terminal-red font-bold font-['Orbitron'] animate-pulse">● LIVE</span>
      </div>

      {/* Video */}
      <div className="shrink-0 relative bg-black" style={{ aspectRatio: '16/9' }}>
        <LiveVideo />
      </div>

      {/* Divider */}
      <div className="shrink-0 px-2.5 pt-2 pb-1">
        <div className="text-[8px] font-['Orbitron'] text-terminal-dim uppercase tracking-widest flex items-center gap-2">
          <div className="h-px flex-1 bg-terminal-border" />
          <span>BROADCAST INTEL</span>
          <div className="h-px flex-1 bg-terminal-border" />
        </div>
      </div>

      {/* Actionable signals */}
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
            <div key={i} className={`rounded border px-2.5 py-2 ${URGENCY_STYLE[item.urgency]}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[8px] font-bold font-['Orbitron'] tracking-wider">{item.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] font-bold">
                    {item.direction === 'long' ? '▲ LONG' : item.direction === 'short' ? '▼ SHORT' : '■ WATCH'}
                  </span>
                  <span className="text-[7px] text-terminal-dim">{timeAgo(item.news.pubDate)}</span>
                </div>
              </div>
              <div className="text-[8px] font-semibold text-terminal-bright mb-1">→ {item.action}</div>
              <div className="text-[8px] text-terminal-text opacity-80 leading-snug line-clamp-2">{item.rationale}</div>
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
