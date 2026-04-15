'use client';
import { useEffect, useState, useCallback } from 'react';
import type { AnalysisResult, Recommendation } from '@/app/api/analysis/route';

const ACTION_STYLE: Record<string, { bg: string; border: string; color: string }> = {
  BUY:   { bg: 'rgba(0,232,122,0.10)',  border: 'rgba(0,232,122,0.50)',  color: 'var(--green)' },
  SELL:  { bg: 'rgba(255,51,85,0.10)',  border: 'rgba(255,51,85,0.50)',  color: 'var(--red)'   },
  HOLD:  { bg: 'rgba(0,200,240,0.08)',  border: 'rgba(0,200,240,0.35)',  color: 'var(--blue)'  },
  WATCH: { bg: 'rgba(255,179,0,0.09)',  border: 'rgba(255,179,0,0.45)',  color: 'var(--amber)' },
};

const CONF_COLOR: Record<string, string> = {
  HIGH:   'var(--green)',
  MEDIUM: 'var(--amber)',
  LOW:    'var(--dim)',
};

function scoreToColor(score: number): string {
  if (score >= 40)  return 'var(--green)';
  if (score >= 10)  return 'var(--blue)';
  if (score >= -10) return 'var(--dim)';
  if (score >= -40) return 'var(--amber)';
  return 'var(--red)';
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'refreshing…';
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  if (m > 0)   return `${m}m ${s}s`;
  return `${s}s`;
}

function RecoCard({ r }: { r: Recommendation }) {
  const style = ACTION_STYLE[r.action] ?? ACTION_STYLE.WATCH;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded border transition-colors duration-200 cursor-pointer select-none"
      style={{ background: style.bg, borderColor: style.border }}
      onClick={() => setExpanded(e => !e)}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Action badge */}
        <div className="shrink-0 w-12 text-center py-0.5 rounded text-[10px] font-['Orbitron'] font-black tracking-wider"
          style={{ background: style.border, color: '#000' }}>
          {r.action}
        </div>

        {/* Commodity */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold text-terminal-bright font-['Orbitron'] tracking-wider truncate">{r.commodity}</div>
          <div className="text-[9px] text-terminal-dim tabular-nums">
            Current: <span className="text-terminal-text font-semibold">${typeof r.currentPrice === 'number' ? r.currentPrice.toFixed(2) : r.currentPrice}</span>
            {r.entryZone && r.entryZone !== 'current' && (
              <> · Entry: <span style={{ color: style.color }} className="font-semibold">{r.entryZone}</span></>
            )}
          </div>
        </div>

        {/* Confidence + timeframe */}
        <div className="shrink-0 text-right">
          <div className="text-[9px] font-bold font-['Orbitron']" style={{ color: CONF_COLOR[r.confidence] ?? 'var(--dim)' }}>
            {r.confidence}
          </div>
          <div className="text-[8px] text-terminal-dim">{r.timeframe}</div>
        </div>

        {/* Expand chevron */}
        <div className="shrink-0 text-terminal-dim text-[10px]">{expanded ? '▲' : '▼'}</div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-terminal-border/50">
          <p className="text-[9px] text-terminal-text leading-relaxed pt-2">{r.rationale}</p>

          {/* Targets */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-terminal-bg/50 rounded px-2 py-1.5">
              <div className="text-[7px] font-['Orbitron'] text-terminal-dim tracking-widest mb-0.5">TARGET</div>
              <div className="text-[13px] font-bold" style={{ color: 'var(--green)' }}>{r.target}</div>
            </div>
            <div className="bg-terminal-bg/50 rounded px-2 py-1.5">
              <div className="text-[7px] font-['Orbitron'] text-terminal-dim tracking-widest mb-0.5">STOP LOSS</div>
              <div className="text-[13px] font-bold" style={{ color: 'var(--red)' }}>{r.stopLoss}</div>
            </div>
          </div>

          {/* Risks */}
          {r.risks?.length > 0 && (
            <div className="space-y-1">
              <div className="text-[7px] font-['Orbitron'] text-terminal-dim tracking-widest uppercase">Key Risks</div>
              {r.risks.map((risk, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="text-terminal-amber text-[8px] mt-0.5 shrink-0">⚠</span>
                  <span className="text-[9px] text-terminal-dim leading-snug">{risk}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  type: 'oil' | 'minerals';
  accentColor?: string;
}

export default function AnalysisPanel({ type, accentColor = 'var(--blue)' }: Props) {
  const [analysis, setAnalysis]   = useState<AnalysisResult | null>(null);
  const [loading,  setLoading]    = useState(true);
  const [error,    setError]      = useState<string | null>(null);
  const [msLeft,   setMsLeft]     = useState(0);
  const [tab,      setTab]        = useState<'signals' | 'levels' | 'catalysts'>('signals');
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalysis = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    try {
      const url = `/api/analysis?type=${type}${force ? '&force=1' : ''}`;
      const r   = await fetch(url, { cache: 'no-store' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail ?? d.error ?? `HTTP ${r.status}`);
      }
      const d: AnalysisResult = await r.json();
      setAnalysis(d);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [type]);

  // Initial fetch
  useEffect(() => { fetchAnalysis(); }, [fetchAnalysis]);

  // Countdown + auto-refresh
  useEffect(() => {
    const tick = () => {
      if (!analysis) return;
      const next = new Date(analysis.nextUpdateAt).getTime();
      const left = Math.max(0, next - Date.now());
      setMsLeft(left);
      if (left === 0) fetchAnalysis();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [analysis, fetchAnalysis]);

  const scoreColor = analysis ? scoreToColor(analysis.outlookScore) : 'var(--dim)';

  return (
    <div className="flex flex-col h-full overflow-hidden bg-terminal-panel">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="section-header shrink-0 flex items-center">
        <div className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: accentColor }} />
        <span className="ml-2 font-['Orbitron'] text-[10px] tracking-widest font-bold" style={{ color: accentColor }}>
          AI SIGNALS
        </span>
        <span className="ml-1.5 text-[9px] text-terminal-dim font-['Orbitron']">· PABLO INTEL ANALYSIS</span>

        {/* Update countdown */}
        <div className="ml-auto flex items-center gap-2">
          {analysis && !loading && (
            <span className="text-[8px] font-['Orbitron'] text-terminal-dim tabular-nums">
              ↻ {fmtCountdown(msLeft)}
            </span>
          )}
          <button
            onClick={() => fetchAnalysis(true)}
            disabled={refreshing}
            className="text-[8px] font-['Orbitron'] px-2 py-0.5 rounded border transition-all"
            style={{
              borderColor: accentColor,
              color: refreshing ? 'var(--dim)' : accentColor,
              background: refreshing ? 'transparent' : `${accentColor}15`,
            }}>
            {refreshing ? '…' : 'REFRESH'}
          </button>
        </div>
      </div>

      {/* ── Outlook banner ──────────────────────────────────────────── */}
      {analysis && (
        <div className="shrink-0 mx-3 mt-2 mb-1 rounded border px-3 py-2.5"
          style={{
            background: `${scoreColor}0d`,
            borderColor: `${scoreColor}55`,
          }}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div className="text-[11px] font-['Orbitron'] font-black tracking-widest" style={{ color: scoreColor }}>
                {analysis.outlookLabel}
              </div>
              {/* Score bar */}
              <div className="w-20 h-2 bg-terminal-border rounded overflow-hidden">
                <div className="h-full rounded transition-all duration-700"
                  style={{
                    width:      `${Math.abs(analysis.outlookScore)}%`,
                    marginLeft: analysis.outlookScore < 0 ? `${50 - Math.abs(analysis.outlookScore / 2)}%` : '50%',
                    background: scoreColor,
                  }} />
              </div>
            </div>
            <span className="text-[8px] font-['Orbitron'] text-terminal-dim">
              {new Date(analysis.generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })} UTC
            </span>
          </div>
          <p className="text-[9px] text-terminal-text leading-relaxed">{analysis.executiveSummary}</p>
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      {analysis && (
        <div className="shrink-0 flex border-b border-terminal-border mx-3">
          {([
            { id: 'signals',   label: 'SIGNALS' },
            { id: 'levels',    label: 'KEY LEVELS' },
            { id: 'catalysts', label: 'CATALYSTS' },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-3 py-1.5 text-[8px] font-['Orbitron'] font-bold tracking-wider transition-all border-b-2"
              style={{
                borderColor: tab === t.id ? accentColor : 'transparent',
                color:       tab === t.id ? accentColor : 'var(--dim)',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-terminal-dim">
            <div className="w-6 h-6 border-2 border-terminal-dim border-t-transparent rounded-full animate-spin" />
            <div className="text-[9px] font-['Orbitron'] tracking-widest">GENERATING ANALYSIS…</div>
            <div className="text-[8px] text-terminal-dim opacity-60">Fetching live data · Running AI model</div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="p-4 space-y-2">
            <div className="text-[10px] font-['Orbitron'] text-terminal-red">ANALYSIS UNAVAILABLE</div>
            <div className="text-[9px] text-terminal-dim leading-relaxed">{error}</div>
            {error.includes('ANTHROPIC_API_KEY') && (
              <div className="mt-2 text-[9px] text-terminal-amber leading-relaxed">
                Add <code className="font-mono bg-terminal-surface px-1 rounded">ANTHROPIC_API_KEY</code> in your Vercel environment variables to enable AI analysis.
              </div>
            )}
          </div>
        )}

        {/* Signals tab */}
        {analysis && !loading && tab === 'signals' && (
          <div className="p-3 space-y-2">
            <div className="text-[7px] font-['Orbitron'] text-terminal-dim tracking-widest uppercase mb-1">
              Click any signal to expand rationale, targets & risks
            </div>
            {analysis.recommendations.map((r, i) => (
              <RecoCard key={i} r={r} />
            ))}
          </div>
        )}

        {/* Key levels tab */}
        {analysis && !loading && tab === 'levels' && (
          <div className="p-3 space-y-2">
            {analysis.keyLevels.map((kl, i) => (
              <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded border border-terminal-border bg-terminal-surface">
                <div className="shrink-0 text-[13px] font-bold tabular-nums" style={{ color: accentColor }}>
                  {kl.price}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] font-bold text-terminal-bright font-['Orbitron'] truncate">{kl.label}</div>
                  <div className="text-[9px] text-terminal-dim leading-snug mt-0.5">{kl.significance}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Catalysts tab */}
        {analysis && !loading && tab === 'catalysts' && (
          <div className="p-3 space-y-2">
            {analysis.catalysts.map((c, i) => (
              <div key={i} className="px-3 py-2.5 rounded border border-terminal-border bg-terminal-surface">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[8px] font-bold font-['Orbitron']" style={{ color: accentColor }}>{c.date}</span>
                  <span className="text-[9px] font-semibold text-terminal-bright">{c.event}</span>
                </div>
                <div className="text-[9px] text-terminal-dim leading-snug">{c.impact}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Disclaimer ───────────────────────────────────────────────── */}
      {analysis && !loading && (
        <div className="shrink-0 px-3 py-1.5 border-t border-terminal-border bg-terminal-surface">
          <p className="text-[7px] text-terminal-dim opacity-70 leading-snug">
            ⚠ {analysis.disclaimer}
          </p>
        </div>
      )}
    </div>
  );
}
