'use client';
import { useEffect, useState, useRef } from 'react';
import type { NewsItem } from '@/lib/types';

const DIRECTION_COLORS = {
  bullish: { text: 'text-terminal-green', bg: 'bg-terminal-green/10', border: 'border-terminal-green/30', icon: '▲', label: 'BULL' },
  bearish: { text: 'text-terminal-red',   bg: 'bg-terminal-red/10',   border: 'border-terminal-red/30',   icon: '▼', label: 'BEAR' },
  mixed:   { text: 'text-terminal-amber', bg: 'bg-terminal-amber/10', border: 'border-terminal-amber/30', icon: '◆', label: 'MIX' },
  neutral: { text: 'text-terminal-dim',   bg: 'bg-terminal-muted/20', border: 'border-terminal-border',   icon: '●', label: 'NEUT' },
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
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  } catch { return ''; }
}

export default function NewsFeed() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'bullish' | 'bearish' | 'flash'>('all');
  const [selected, setSelected] = useState<NewsItem | null>(null);

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
        <span className="ml-auto text-terminal-blue">{news.length}</span>
      </div>

      {/* Breaking alert */}
      {breaking.length > 0 && (
        <div className="shrink-0 px-2.5 py-1.5 border-b border-terminal-border bg-terminal-red/5">
          <div className="flex items-start gap-2">
            <span className="badge-flash text-[8px] px-1.5 py-0.5 rounded font-bold animate-pulse shrink-0">🚨 FLASH</span>
            <span className="text-terminal-red text-[10px] leading-snug">{breaking[0].title}</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="shrink-0 flex gap-1 px-2.5 py-2 border-b border-terminal-border">
        {(['all', 'flash', 'bullish', 'bearish'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[9px] px-2 py-1 rounded border transition-colors uppercase tracking-wider font-medium
              ${filter === f
                ? 'bg-terminal-blue/20 border-terminal-blue text-terminal-blue'
                : 'border-terminal-border text-terminal-dim hover:border-terminal-dim hover:text-terminal-text'}`}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-terminal-dim text-[9px] self-center">{filtered.length} items</span>
      </div>

      {/* Detail pane */}
      {selected && (
        <div className="shrink-0 px-3 py-2.5 border-b border-terminal-amber/30 bg-terminal-amber/5">
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="text-terminal-bright text-[11px] font-semibold leading-snug flex-1">{selected.title}</span>
            <button onClick={() => setSelected(null)} className="close-btn shrink-0">✕</button>
          </div>
          <div className="text-terminal-text text-[10px] leading-relaxed">
            {selected.summary || 'No summary available.'}
          </div>
          {selected.drivers.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {selected.drivers.map(d => (
                <span key={d} className="text-[8px] px-1.5 py-0.5 border border-terminal-border text-terminal-dim rounded">
                  {d.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
          {selected.url && (
            <a href={selected.url} target="_blank" rel="noopener noreferrer"
               className="text-terminal-blue text-[9px] mt-1.5 inline-block hover:underline">
              → Read full article ↗
            </a>
          )}
        </div>
      )}

      {/* News list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex flex-col gap-3 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse space-y-1.5">
                <div className="h-2.5 bg-terminal-muted rounded w-4/5" />
                <div className="h-2 bg-terminal-muted/50 rounded w-2/5" />
              </div>
            ))}
          </div>
        )}
        {!loading && filtered.map(item => {
          const dc   = DIRECTION_COLORS[item.direction];
          const tier = tierFromScore(item.impactScore);
          const isActive = selected?.id === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setSelected(isActive ? null : item)}
              className={`w-full text-left px-2.5 py-2.5 border-b border-terminal-border/60
                         hover:bg-terminal-muted/25 transition-colors
                         ${isActive ? 'bg-terminal-muted/30 border-l-2 border-l-terminal-amber' : ''}`}
            >
              {/* Meta row */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className={`text-[9px] font-bold ${dc.text}`}>{dc.icon} {dc.label}</span>
                <span className={`text-[8px] px-1 py-0.5 rounded ${TIER_BADGES[tier]}`}>
                  {tier === 'flash' ? '🚨' : tier === 'analysis' ? '📊' : '📋'} {item.impactScore}
                </span>
                <span className="text-terminal-text text-[8px] ml-auto truncate max-w-[70px]">{item.source}</span>
                <span className="text-terminal-text text-[8px] shrink-0">{timeAgo(item.publishedAt)}</span>
              </div>

              {/* Title */}
              <div className={`text-[10px] leading-snug ${isActive ? 'text-terminal-bright' : 'text-terminal-text'}`}>
                {item.title}
              </div>

              {/* Impact bar */}
              <div className="mt-1.5 progress-bar">
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
          <div className="text-terminal-dim text-[10px] p-5 text-center">
            No items match current filter
          </div>
        )}
      </div>

      {/* Sentiment summary */}
      <div className="shrink-0 border-t border-terminal-border px-2 py-2 grid grid-cols-4 gap-1">
        {(['bullish', 'bearish', 'mixed', 'neutral'] as const).map(d => {
          const count = news.filter(n => n.direction === d).length;
          const pct   = news.length ? Math.round((count / news.length) * 100) : 0;
          const dc    = DIRECTION_COLORS[d];
          return (
            <div key={d} className="text-center">
              <div className={`text-[12px] font-bold tabular-nums ${dc.text}`}>{pct}%</div>
              <div className="text-[8px] text-terminal-dim uppercase tracking-wider">{d}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
