'use client';
import { useEffect, useState, useRef } from 'react';
import type { NewsItem } from '@/lib/types';

const DIR = {
  bullish: { text: 'text-terminal-green', icon: '▲', label: 'BULL' },
  bearish: { text: 'text-terminal-red',   icon: '▼', label: 'BEAR' },
  mixed:   { text: 'text-terminal-amber', icon: '◆', label: 'MIX'  },
  neutral: { text: 'text-terminal-dim',   icon: '●', label: 'NEUT' },
};

const TIER_BADGE: Record<string, string> = {
  flash: 'badge-flash', analysis: 'badge-analysis', digest: 'badge-digest', none: 'badge-none',
};

function tier(score: number) {
  return score >= 70 ? 'flash' : score >= 40 ? 'analysis' : score >= 20 ? 'digest' : 'none';
}

function timeAgo(dateStr: string): { label: string; isRecent: boolean } {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { label: '', isRecent: false };
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 0) return { label: 'just now', isRecent: true };
    if (mins < 5)  return { label: `${mins}m ago`, isRecent: true };
    if (mins < 60) return { label: `${mins}m ago`, isRecent: false };
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return { label: `${hrs}h ago`, isRecent: false };
    return { label: `${Math.floor(hrs / 24)}d ago`, isRecent: false };
  } catch { return { label: '', isRecent: false }; }
}

function freshnessDot(dateStr: string) {
  try {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 30)  return { color: 'bg-terminal-green', pulse: true,  title: 'Published < 30 min ago' };
    if (mins < 120) return { color: 'bg-terminal-amber', pulse: false, title: 'Published < 2h ago' };
    return null;
  } catch { return null; }
}

type FilterKey = 'all' | 'bullish' | 'bearish' | 'flash' | 'iran';

export default function NewsFeed() {
  const [news,     setNews]     = useState<NewsItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<FilterKey>('all');
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const [lastSync, setLastSync] = useState<string>('');
  const [srcCount, setSrcCount] = useState<number>(0);
  const tickRef = useRef<NodeJS.Timeout | null>(null);

  const fetchNews = async () => {
    try {
      const r = await fetch('/api/news');
      const d = await r.json();
      setNews(d.news ?? []);
      setLastSync(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
      if (d.sourceCount) setSrcCount(d.sourceCount);
    } catch { /* stale */ } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchNews();
    // Refresh every 60s
    const iv = setInterval(fetchNews, 60_000);
    // Force re-render for freshness dots every 30s
    tickRef.current = setInterval(() => setLastSync(t => t), 30_000);
    return () => { clearInterval(iv); if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  const filtered = news.filter(n => {
    if (filter === 'bullish') return n.direction === 'bullish';
    if (filter === 'bearish') return n.direction === 'bearish';
    if (filter === 'flash')   return n.impactScore >= 70;
    if (filter === 'iran')    return /iran|irgc|tehran|nuclear|jcpoa|hormuz|khamenei/i.test(n.title + n.summary);
    return true;
  });

  const breaking = news.filter(n => n.isBreaking);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-terminal-panel transition-colors duration-300">

      {/* ── Header ──────────────────────────────── */}
      <div className="section-header">
        <div className="dot" />
        <span>MARKET INTELLIGENCE</span>
        <div className="ml-auto flex items-center gap-2">
          {srcCount > 0 && (
            <span className="text-[8px] text-terminal-dim font-['Orbitron']">{srcCount} FEEDS</span>
          )}
          <span className="text-terminal-blue font-bold text-[11px]">{news.length}</span>
        </div>
      </div>

      {/* ── Last sync bar ────────────────────────── */}
      {lastSync && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1 bg-terminal-surface border-b border-terminal-border">
          <div className="w-1.5 h-1.5 rounded-full bg-terminal-green animate-pulse shrink-0" />
          <span className="text-[8px] text-terminal-dim">Synced {lastSync}</span>
          <span className="text-[8px] text-terminal-dim ml-auto">Newest first</span>
        </div>
      )}

      {/* ── Breaking alert ──────────────────────── */}
      {breaking.length > 0 && (
        <div className="shrink-0 px-3 py-2 border-b border-terminal-border bg-terminal-red/5">
          <div className="flex items-start gap-2">
            <span className="badge-flash text-[8px] px-1.5 py-0.5 rounded font-bold animate-pulse shrink-0">
              🚨 FLASH
            </span>
            <span className="text-terminal-red text-[10px] font-medium leading-snug">{breaking[0].title}</span>
          </div>
        </div>
      )}

      {/* ── Filter tabs ─────────────────────────── */}
      <div className="shrink-0 flex items-center gap-1 px-2.5 py-2 border-b border-terminal-border bg-terminal-surface overflow-x-auto">
        {(['all', 'iran', 'flash', 'bullish', 'bearish'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[8px] px-2 py-1 rounded border transition-all uppercase tracking-wider font-bold font-['Orbitron'] shrink-0
              ${filter === f
                ? f === 'iran'
                  ? 'bg-terminal-red/15 border-terminal-red text-terminal-red'
                  : 'bg-terminal-blue/15 border-terminal-blue text-terminal-blue'
                : 'border-terminal-border text-terminal-dim hover:border-terminal-dim hover:text-terminal-text bg-transparent'}`}
          >
            {f === 'iran' ? '🇮🇷 IRAN' : f}
          </button>
        ))}
        <span className="ml-auto text-terminal-dim text-[9px] shrink-0 pl-1">{filtered.length}</span>
      </div>

      {/* ── Detail pane ─────────────────────────── */}
      {selected && (
        <div className="shrink-0 px-3 py-3 border-b-2 border-terminal-amber/40 bg-terminal-amber/5">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-terminal-bright text-[11px] font-semibold leading-snug flex-1">{selected.title}</span>
            <button onClick={() => setSelected(null)} className="close-btn shrink-0 mt-0.5">✕</button>
          </div>
          <div className="text-terminal-text text-[10px] leading-relaxed mb-2">
            {selected.summary || 'No summary available.'}
          </div>
          {selected.drivers.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-2">
              {selected.drivers.map(d => (
                <span key={d} className="text-[8px] px-1.5 py-0.5 border border-terminal-border text-terminal-dim rounded bg-terminal-surface">
                  {d.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
          {selected.url && (
            <a href={selected.url} target="_blank" rel="noopener noreferrer"
               className="text-terminal-blue text-[9px] inline-block hover:underline font-medium">
              → Read full article ↗
            </a>
          )}
        </div>
      )}

      {/* ── News list ───────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex flex-col gap-3 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse space-y-2">
                <div className="h-2.5 bg-terminal-muted rounded w-4/5" />
                <div className="h-2 bg-terminal-muted/50 rounded w-2/5" />
              </div>
            ))}
          </div>
        )}

        {!loading && filtered.map((item, idx) => {
          const dc       = DIR[item.direction];
          const t        = tier(item.impactScore);
          const isActive = selected?.id === item.id;
          const fresh    = freshnessDot(item.publishedAt);
          const ago      = timeAgo(item.publishedAt);
          const isFirst  = idx === 0;

          return (
            <button
              key={item.id}
              onClick={() => setSelected(isActive ? null : item)}
              className={`w-full text-left px-3 py-2.5 border-b border-terminal-border/70 transition-colors
                hover:bg-terminal-surface
                ${isActive
                  ? 'bg-terminal-surface border-l-2 border-l-terminal-amber'
                  : isFirst
                    ? 'bg-terminal-surface/50 border-l-2 border-l-terminal-blue'
                    : 'border-l-2 border-l-transparent'}`}
            >
              {/* Meta row */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className={`text-[9px] font-bold ${dc.text} shrink-0`}>{dc.icon} {dc.label}</span>
                <span className={`text-[8px] px-1.5 py-0.5 rounded ${TIER_BADGE[t]} shrink-0`}>
                  {t === 'flash' ? '🚨' : t === 'analysis' ? '📊' : '📋'} {item.impactScore}
                </span>
                {fresh && (
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${fresh.color} ${fresh.pulse ? 'animate-pulse' : ''}`}
                       title={fresh.title} />
                )}
                <span className="ml-auto text-terminal-text text-[8px] truncate max-w-[65px]">{item.source}</span>
                <span className={`text-[8px] shrink-0 font-medium ${ago.isRecent ? 'text-terminal-green' : 'text-terminal-dim'}`}>
                  {ago.label}
                </span>
              </div>

              {/* Title */}
              <div className={`text-[10px] leading-snug font-medium ${isActive ? 'text-terminal-bright' : 'text-terminal-text'}`}>
                {item.title}
              </div>

              {/* Impact bar */}
              <div className="mt-2 progress-bar">
                <div className="progress-fill" style={{
                  width: `${item.impactScore}%`,
                  background: item.impactScore >= 70 ? 'var(--red)' : item.impactScore >= 40 ? 'var(--amber)' : 'var(--blue)',
                }} />
              </div>
            </button>
          );
        })}

        {!loading && filtered.length === 0 && (
          <div className="text-terminal-dim text-[10px] p-6 text-center">
            No items match current filter
          </div>
        )}
      </div>

      {/* ── Sentiment footer ────────────────────── */}
      <div className="shrink-0 border-t border-terminal-border bg-terminal-surface px-2 py-2">
        <div className="text-[8px] font-['Orbitron'] text-terminal-dim uppercase tracking-widest mb-2 text-center">
          Sentiment Distribution
        </div>
        <div className="grid grid-cols-4 gap-1">
          {(['bullish', 'bearish', 'mixed', 'neutral'] as const).map(d => {
            const count = news.filter(n => n.direction === d).length;
            const pct   = news.length ? Math.round((count / news.length) * 100) : 0;
            const dc    = DIR[d];
            return (
              <div key={d} className="text-center panel px-1 py-1.5">
                <div className={`text-[13px] font-bold tabular-nums ${dc.text}`}>{pct}%</div>
                <div className="text-[8px] text-terminal-dim uppercase tracking-wider mt-0.5">{d}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
