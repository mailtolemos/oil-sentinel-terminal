'use client';
import { useEffect, useState } from 'react';
import type { NewsItem } from '@/lib/types';

const DIR = {
  bullish: { text: 'text-terminal-green', bg: 'bg-terminal-green/10', border: 'border-terminal-green/30', icon: '▲', label: 'BULL' },
  bearish: { text: 'text-terminal-red',   bg: 'bg-terminal-red/10',   border: 'border-terminal-red/30',   icon: '▼', label: 'BEAR' },
  mixed:   { text: 'text-terminal-amber', bg: 'bg-terminal-amber/10', border: 'border-terminal-amber/30', icon: '◆', label: 'MIX'  },
  neutral: { text: 'text-terminal-dim',   bg: 'bg-terminal-muted/20', border: 'border-terminal-border',   icon: '●', label: 'NEUT' },
};

const TIER_BADGE: Record<string, string> = {
  flash: 'badge-flash', analysis: 'badge-analysis', digest: 'badge-digest', none: 'badge-none',
};

function tier(score: number) {
  return score >= 70 ? 'flash' : score >= 40 ? 'analysis' : score >= 20 ? 'digest' : 'none';
}

function timeAgo(dateStr: string) {
  try {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return ''; }
}

type FilterKey = 'all' | 'bullish' | 'bearish' | 'flash';

export default function NewsFeed() {
  const [news,     setNews]     = useState<NewsItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<FilterKey>('all');
  const [selected, setSelected] = useState<NewsItem | null>(null);

  const fetchNews = async () => {
    try {
      const r = await fetch('/api/news');
      const d = await r.json();
      setNews(d.news ?? []);
    } catch { /* stale */ } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchNews();
    const iv = setInterval(fetchNews, 60_000);
    return () => clearInterval(iv);
  }, []);

  const filtered = news.filter(n => {
    if (filter === 'bullish') return n.direction === 'bullish';
    if (filter === 'bearish') return n.direction === 'bearish';
    if (filter === 'flash')   return n.impactScore >= 70;
    return true;
  });

  const breaking = news.filter(n => n.isBreaking || n.impactScore >= 70);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-terminal-panel transition-colors duration-300">

      {/* ── Header ──────────────────────── */}
      <div className="section-header">
        <div className="dot" />
        <span>MARKET INTELLIGENCE</span>
        <span className="ml-auto text-terminal-blue font-bold">{news.length}</span>
      </div>

      {/* ── Breaking alert ──────────────── */}
      {breaking.length > 0 && (
        <div className="shrink-0 px-3 py-2 border-b border-terminal-border bg-terminal-red/5">
          <div className="flex items-start gap-2">
            <span className="badge-flash text-[8px] px-1.5 py-0.5 rounded font-bold animate-pulse shrink-0 whitespace-nowrap">
              🚨 FLASH
            </span>
            <span className="text-terminal-red text-[10px] font-medium leading-snug">{breaking[0].title}</span>
          </div>
        </div>
      )}

      {/* ── Filter tabs ─────────────────── */}
      <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 border-b border-terminal-border bg-terminal-surface">
        {(['all', 'flash', 'bullish', 'bearish'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[9px] px-2.5 py-1 rounded border transition-all uppercase tracking-wider font-bold font-['Orbitron']
              ${filter === f
                ? 'bg-terminal-blue/15 border-terminal-blue text-terminal-blue'
                : 'border-terminal-border text-terminal-dim hover:border-terminal-dim hover:text-terminal-text bg-transparent'}`}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-terminal-dim text-[9px]">{filtered.length}</span>
      </div>

      {/* ── Detail pane ─────────────────── */}
      {selected && (
        <div className="shrink-0 px-3 py-3 border-b-2 border-terminal-amber/40 bg-terminal-amber/5">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-terminal-bright text-[11px] font-semibold leading-snug flex-1">{selected.title}</span>
            <button onClick={() => setSelected(null)} className="close-btn shrink-0 mt-0.5">✕</button>
          </div>
          <div className="text-terminal-text text-[10px] leading-relaxed">
            {selected.summary || 'No summary available.'}
          </div>
          {selected.drivers.length > 0 && (
            <div className="flex gap-1.5 mt-2.5 flex-wrap">
              {selected.drivers.map(d => (
                <span key={d}
                  className="text-[8px] px-1.5 py-0.5 border border-terminal-border text-terminal-dim rounded bg-terminal-surface">
                  {d.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
          {selected.url && (
            <a href={selected.url} target="_blank" rel="noopener noreferrer"
               className="text-terminal-blue text-[9px] mt-2 inline-block hover:underline font-medium">
              → Read full article ↗
            </a>
          )}
        </div>
      )}

      {/* ── News list ───────────────────── */}
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

        {!loading && filtered.map(item => {
          const dc      = DIR[item.direction];
          const t       = tier(item.impactScore);
          const isActive = selected?.id === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setSelected(isActive ? null : item)}
              className={`w-full text-left px-3 py-2.5 border-b border-terminal-border/70 transition-colors
                hover:bg-terminal-surface
                ${isActive ? 'bg-terminal-surface border-l-2 border-l-terminal-amber' : 'border-l-2 border-l-transparent'}`}
            >
              {/* Meta row */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className={`text-[9px] font-bold ${dc.text}`}>{dc.icon} {dc.label}</span>
                <span className={`text-[8px] px-1.5 py-0.5 rounded ${TIER_BADGE[t]}`}>
                  {t === 'flash' ? '🚨' : t === 'analysis' ? '📊' : '📋'} {item.impactScore}
                </span>
                <span className="ml-auto text-terminal-text text-[9px] truncate max-w-[70px]">{item.source}</span>
                <span className="text-terminal-dim text-[8px] shrink-0">{timeAgo(item.publishedAt)}</span>
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

      {/* ── Sentiment footer ────────────── */}
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
