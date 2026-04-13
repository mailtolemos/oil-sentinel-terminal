'use client';
import { useEffect, useState, useRef } from 'react';
import type { RecapPayload } from '@/app/api/recap/route';

function timeAgo(isoStr: string): string {
  try {
    const mins = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ${mins % 60}m ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return ''; }
}

function nextIn(isoStr: string): string {
  try {
    const elapsedMin = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000);
    const remaining  = Math.max(0, 120 - elapsedMin);
    if (remaining <= 0) return 'imminent';
    if (remaining < 60) return `${remaining} min`;
    return `${Math.floor(remaining / 60)}h ${remaining % 60}m`;
  } catch { return '—'; }
}

export default function RecapPanel() {
  const [recap,    setRecap]    = useState<RecapPayload | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [tick,     setTick]     = useState(0);
  const ivRef = useRef<NodeJS.Timeout | null>(null);

  const fetchRecap = async () => {
    try {
      const r = await fetch('/api/recap');
      const d = await r.json();
      setRecap(d);
    } catch { /* stale */ } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchRecap();
    // Re-check every 5 minutes — new recaps are generated every 2h server-side
    const iv = setInterval(fetchRecap, 5 * 60_000);
    // Tick every 30s to update time-ago label
    ivRef.current = setInterval(() => setTick(t => t + 1), 30_000);
    return () => { clearInterval(iv); if (ivRef.current) clearInterval(ivRef.current); };
  }, []);

  const sectionIcons: Record<string, string> = {
    '💹 COMMODITY PRICES':     '💹',
    '📰 TOP MARKET HEADLINES': '📰',
    '🌍 GEOPOLITICAL THREATS': '🌍',
    '🔮 PRICE OUTLOOK':        '🔮',
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-terminal-panel transition-colors duration-300">

      {/* ── Header ──────────────────────────────────── */}
      <div className="section-header">
        <div className="dot" />
        <span>AI INTEL BRIEF</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[8px] text-terminal-dim font-['Orbitron']">2H AUTO</span>
          <div className="w-1.5 h-1.5 rounded-full bg-terminal-amber animate-pulse" />
        </div>
      </div>

      {/* ── Loading skeleton ─────────────────────────── */}
      {loading && (
        <div className="flex flex-col gap-3 p-3 flex-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse space-y-2">
              <div className="h-2.5 bg-terminal-muted rounded w-3/5" />
              <div className="h-2 bg-terminal-muted/50 rounded w-4/5" />
              <div className="h-2 bg-terminal-muted/50 rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {/* ── No recap yet ─────────────────────────────── */}
      {!loading && !recap && (
        <div className="flex-1 flex items-center justify-center text-terminal-dim text-[10px] text-center px-4">
          First recap generates on next 2h cycle
        </div>
      )}

      {/* ── Recap content ────────────────────────────── */}
      {!loading && recap && (
        <div className="flex-1 overflow-y-auto">

          {/* Meta bar */}
          <div className="px-3 py-2 bg-terminal-surface border-b border-terminal-border flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-terminal-green shrink-0" />
              <span className="text-[9px] text-terminal-dim">Generated</span>
              <span className="text-[9px] text-terminal-bright font-medium">{timeAgo(recap.generatedAt)}</span>
            </div>
            <span className="w-px h-3 bg-terminal-border" />
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-terminal-dim">Next in</span>
              <span className="text-[9px] text-terminal-blue font-medium">{nextIn(recap.generatedAt)}</span>
            </div>
            {recap.sentToTg && (
              <>
                <span className="w-px h-3 bg-terminal-border" />
                <span className="text-[8px] text-terminal-green font-bold">✓ TG</span>
              </>
            )}
          </div>

          {/* Price line banner */}
          <div className="px-3 py-2 bg-terminal-accent-blue border-b border-terminal-border">
            <div className="text-[9px] text-terminal-blue font-medium font-['Orbitron'] tracking-wide">
              {recap.priceLine}
            </div>
          </div>

          {/* Sections as expandable cards */}
          <div className="p-2 flex flex-col gap-2">
            {recap.sections.map((section, idx) => {
              const isOpen = expanded === idx;
              return (
                <div key={idx}
                  className={`rounded border transition-all ${
                    isOpen
                      ? 'border-terminal-blue/50 bg-terminal-accent-blue'
                      : 'border-terminal-border bg-terminal-surface hover:border-terminal-dim'
                  }`}
                >
                  <button
                    onClick={() => setExpanded(isOpen ? null : idx)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left"
                  >
                    <span className="text-[13px] shrink-0">{Object.values(sectionIcons)[idx] ?? '📌'}</span>
                    <span className={`text-[9px] font-bold font-['Orbitron'] tracking-wider flex-1 ${
                      isOpen ? 'text-terminal-blue' : 'text-terminal-bright'
                    }`}>
                      {section.heading.replace(/^[^\s]+\s/, '')}
                    </span>
                    <span className={`text-[10px] text-terminal-dim transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3">
                      <div className="border-t border-terminal-border/50 mb-2" />
                      <div className="text-[10px] text-terminal-text leading-relaxed whitespace-pre-wrap">
                        {section.body}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Outlook summary (always visible at bottom) */}
          {recap.outlook && (
            <div className="mx-2 mb-2 px-3 py-2.5 rounded border border-terminal-amber/30 bg-terminal-amber/5">
              <div className="text-[8px] font-['Orbitron'] text-terminal-amber font-bold tracking-widest mb-1.5">
                ANALYST TAKE
              </div>
              <div className="text-[10px] text-terminal-text leading-relaxed">
                {recap.outlook.split('\n\n').pop()}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Footer ───────────────────────────────────── */}
      <div className="shrink-0 border-t border-terminal-border bg-terminal-surface px-3 py-2 flex items-center gap-2">
        <button
          onClick={fetchRecap}
          className="text-[8px] px-2 py-1 border border-terminal-border text-terminal-dim rounded hover:border-terminal-blue hover:text-terminal-blue transition-all font-['Orbitron'] tracking-wider uppercase"
        >
          Refresh
        </button>
        <span className="text-[8px] text-terminal-dim ml-auto">OIL SENTINEL AI</span>
        <div className="w-1.5 h-1.5 rounded-full bg-terminal-amber" />
      </div>
    </div>
  );
}
