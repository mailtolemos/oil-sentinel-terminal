'use client';
import { useEffect, useState, useRef } from 'react';
import type { NewsItem } from '@/lib/types';

const DIRECTION_COLORS = {
  bullish: { text: 'text-terminal-green', bg: 'bg-terminal-green/10', border: 'border-terminal-green/30', icon: '▲' },
  bearish: { text: 'text-terminal-red',   bg: 'bg-terminal-red/10',   border: 'border-terminal-red/30',   icon: '▼' },
  mixed:   { text: 'text-terminal-amber', bg: 'bg-terminal-amber/10', border: 'border-terminal-amber/30', icon: '◆' },
  neutral: { text: 'text-terminal-dim',   bg: 'bg-terminal-muted/20', border: 'border-terminal-border',   icon: '●' },
};

const TIER_BADGES: Record<string, string> = {
  flash:    'badge-flash',
  analysis: 'badge-analysis',
  digest:   'badge-digest',
  none:     'badge-none',
};

function tierFromScore(score: number) {
  return score >= 70 ? 'flash' : score >= 40 ? 'analysis' : score >= 20 ? 'digest' : 'none';
}

function timeAgo(dateStr: string) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return ''; }
}

export default function NewsFeed() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'bullish' | 'bearish' | 'flash'>('all');
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchNews = async () => {
    try {
      const r = await fetch('/api/news');
      const d = await r.json();
      setNews(d.news ?? []);
    } catch { /* keep stale */ }
    finally { setLoading(false); }
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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="section-header shrink-0">
        <div className="dot" />
        <span>MARKET INTELLIGENCE</span>
        <span className="ml-auto text-terminal-blue text-[8px]">{news.length} ITEMS</span>
      </div>

      {/* Breaking badge */}
      {breaking.length > 0 && (
        <div className="shrink-0 px-2 py-1 border-b border-terminal-border bg-terminal-red/5 flex items-center gap-2">
          <div className="badge-flash text-[7px] px-1.5 py-0.5 rounded font-bold animate-pulse">
            🚨 BREAKING
          </div>
          <span className="text-terminal-red text-[9px] truncate">{breaking[0].title}</span>
        </div>
      )}

      {/* Filters */}
      <div className="shrink-0 flex gap-1 px-2 py-1.5 border-b border-terminal-border">
        {(['all', 'flash', 'bullish', 'bearish'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[8px] px-2 py-0.5 rounded border transition-colors uppercase tracking-wider
              ${filter === f
                ? 'bg-terminal-blue/20 border-terminal-blue text-terminal-blue'
                : 'border-terminal-border text-terminal-dim hover:border-terminal-dim'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Detail pane */}
      {selected && (
        <div className="shrink-0 p-2 border-b border-terminal-amber/30 bg-terminal-amber/5 text-[9px]">
          <div className="flex items-start justify-between gap-1">
            <span className="text-terminal-bright font-bold leading-tight flex-1">{selected.title}</span>
            <button onClick={() => setSelected(null)} className="text-terminal-dim hover:text-terminal-text shrink-0 text-[10px]">✕</button>
          </div>
          <div className="text-terminal-dim mt-1 leading-relaxed">{selected.summary || 'No summary available.'}</div>
          <div className="flex gap-2 mt-1.5 flex-wrap">
            {selected.drivers.map(d => (
              <span key={d} className="text-[7px] px-1 py-0.5 border border-terminal-muted text-terminal-dim rounded">
                {d.replace('_', ' ')}
              </span>
            ))}
          </div>
          {selected.url && (
            <a href={selected.url} target="_blank" rel="noopener noreferrer"
               className="text-terminal-blue text-[8px] mt-1 inline-block hover:underline">
              → Read full article
            </a>
          )}
        </div>
      )}

      {/* News list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex flex-col gap-2 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse space-y-1">
                <div className="h-2 bg-terminal-muted rounded w-3/4" />
                <div className="h-1.5 bg-terminal-muted/50 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}
        {!loading && filtered.map(item => {
          const dc   = DIRECTION_COLORS[item.direction];
          const tier = tierFromScore(item.impactScore);
          return (
            <button
              key={item.id}
              onClick={() => setSelected(selected?.id === item.id ? null : item)}
              className={`w-full text-left px-2 py-2 border-b border-terminal-border/50 hover:bg-terminal-muted/20
                         transition-colors ${selected?.id === item.id ? 'bg-terminal-muted/30' : ''}`}
            >
              {/* Top row */}
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`text-[8px] font-bold ${dc.text}`}>{dc.icon}</span>
                <span className={`text-[7px] px-1 py-0.5 rounded ${TIER_BADGES[tier]}`}>
                  {tier === 'flash' ? '🚨' : tier === 'analysis' ? '📊' : '📋'}
                  {' '}{item.impactScore}
                </span>
                <span className="text-terminal-dim text-[7px] ml-auto shrink-0">{item.source}</span>
                <span className="text-terminal-dim text-[7px] shrink-0">{timeAgo(item.publishedAt)}</span>
              </div>

              {/* Title */}
              <div className={`text-[9px] leading-snug ${selected?.id === item.id ? 'text-terminal-bright' : 'text-terminal-text'}`}>
                {item.title}
              </div>

              {/* Score bar */}
              <div className="mt-1 progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${item.impactScore}%`,
                    background: item.impactScore >= 70 ? '#ff3344'
                              : item.impactScore >= 40 ? '#ffaa00'
                              : '#00d4ff',
                  }}
                />
              </div>
            </button>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div className="text-terminal-dim text-[9px] p-4 text-center">
            No items match current filter
          </div>
        )}
      </div>

      {/* Sentiment summary */}
      <div className="shrink-0 border-t border-terminal-border px-2 py-1.5 grid grid-cols-4 gap-1">
        {(['bullish', 'bearish', 'mixed', 'neutral'] as const).map(d => {
          const count = news.filter(n => n.direction === d).length;
          const pct   = news.length ? Math.round((count / news.length) * 100) : 0;
          const dc    = DIRECTION_COLORS[d];
          return (
            <div key={d} className="text-center">
              <div className={`text-[10px] font-bold ${dc.text}`}>{pct}%</div>
              <div className="text-[7px] text-terminal-dim uppercase">{d}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
