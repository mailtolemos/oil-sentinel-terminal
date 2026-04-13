'use client';
import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import type { PriceProjection } from '@/lib/types';

type BiasKey = 'strongly_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strongly_bearish';

const BIAS: Record<BiasKey, { text: string; label: string; bg: string }> = {
  strongly_bullish: { text: 'text-terminal-green', label: '▲▲ STRONGLY BULLISH', bg: 'bg-terminal-green/10 border-terminal-green/30' },
  bullish:          { text: 'text-terminal-green', label: '▲  BULLISH',           bg: 'bg-terminal-green/10 border-terminal-green/30' },
  neutral:          { text: 'text-terminal-amber', label: '◆  NEUTRAL',           bg: 'bg-terminal-amber/10 border-terminal-amber/30' },
  bearish:          { text: 'text-terminal-red',   label: '▼  BEARISH',           bg: 'bg-terminal-red/10   border-terminal-red/30'   },
  strongly_bearish: { text: 'text-terminal-red',   label: '▼▼ STRONGLY BEARISH',  bg: 'bg-terminal-red/10   border-terminal-red/30'   },
};

const SIG_COLOR = {
  bullish: 'text-terminal-green',
  bearish: 'text-terminal-red',
  neutral: 'text-terminal-dim',
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel px-3 py-2 text-[9px] border border-terminal-border z-50 shadow-lg">
      <div className="text-terminal-dim mb-1 font-bold font-['Orbitron']">{label}</div>
      {payload.map((p: any) =>
        p.value != null && (
          <div key={p.dataKey} style={{ color: p.color }} className="flex gap-4 justify-between">
            <span>{p.name}:</span>
            <span className="font-bold tabular-nums">${Number(p.value).toFixed(2)}</span>
          </div>
        )
      )}
    </div>
  );
}

export default function PriceChart() {
  const [proj,         setProj]         = useState<PriceProjection | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [activeSymbol, setActiveSymbol] = useState<'BRT' | 'WTI'>('BRT');

  const fetchProjection = async () => {
    try {
      const ticker = activeSymbol === 'BRT' ? 'BZ%3DF' : 'CL%3DF';
      const r = await fetch(`/api/projection?symbol=${ticker}`);
      const d = await r.json();
      setProj(d);
    } catch { /* stale */ } finally { setLoading(false); }
  };

  useEffect(() => {
    setLoading(true);
    fetchProjection();
    const iv = setInterval(fetchProjection, 120_000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol]);

  const bias      = (proj?.bias ?? 'neutral') as BiasKey;
  const bc        = BIAS[bias] ?? BIAS.neutral;
  const chartData = proj?.chartData ?? [];
  const splitDate = chartData.find(d => d.projected != null)?.date;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-terminal-panel transition-colors duration-300">

      {/* ── Header ─────────────────── */}
      <div className="section-header">
        <div className="dot" />
        <span>PRICE PROJECTION</span>
        <div className="ml-auto flex gap-1">
          {(['BRT', 'WTI'] as const).map(s => (
            <button key={s} onClick={() => setActiveSymbol(s)}
              className={`text-[9px] px-2.5 py-1 rounded border transition-all font-['Orbitron'] font-bold uppercase
                ${activeSymbol === s
                  ? 'bg-terminal-blue/15 border-terminal-blue text-terminal-blue'
                  : 'border-terminal-border text-terminal-dim hover:text-terminal-text hover:border-terminal-dim bg-transparent'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Bias banner ────────────── */}
      {proj && (
        <div className={`shrink-0 flex items-center gap-3 px-3 py-2 border-b border-terminal-border ${bc.bg}`}>
          <span className={`text-[11px] font-bold ${bc.text} font-['Orbitron'] tracking-wide`}>
            {bc.label}
          </span>
          <span className="text-terminal-text text-[9px]">
            SENTIMENT {proj.sentimentScore > 0 ? '+' : ''}{proj.sentimentScore}
          </span>
          <span className="ml-auto text-terminal-bright text-[13px] font-bold tabular-nums">
            ${proj.currentPrice.toFixed(2)}
          </span>
        </div>
      )}

      {/* ── Chart ──────────────────── */}
      <div className="flex-1 min-h-0 px-2 pt-2 pb-1">
        {loading ? (
          <div className="flex items-center justify-center h-full text-terminal-dim text-[10px]">
            <span className="animate-pulse font-['Orbitron'] tracking-wider">LOADING PROJECTION…</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 2, left: -10 }}>
              <defs>
                <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#00e87a" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#00e87a" stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#00c8f0" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#00c8f0" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" opacity={0.6} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: 'var(--dim)' }}
                interval={Math.floor(chartData.length / 6)}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
              />
              <YAxis
                tick={{ fontSize: 9, fill: 'var(--dim)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `$${v}`}
                width={38}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area dataKey="high" fill="rgba(0,200,240,0.06)" stroke="none" name="CI High" legendType="none" />
              <Area dataKey="low"  fill="var(--panel)"          stroke="none" name="CI Low"  legendType="none" />
              <Area dataKey="actual"    stroke="#00e87a" strokeWidth={1.8} fill="url(#actualGrad)" dot={false} name="Actual"    connectNulls={false} />
              <Line  dataKey="projected" stroke="#00c8f0" strokeWidth={1.8} dot={false} strokeDasharray="4 2"  name="Projected" connectNulls={false} />
              {splitDate && (
                <ReferenceLine
                  x={splitDate}
                  stroke="var(--dim)"
                  strokeDasharray="3 3"
                  opacity={0.5}
                  label={{ value: 'NOW', fill: 'var(--dim)', fontSize: 9, position: 'insideTopRight' }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Projection cards ───────── */}
      {proj && (
        <div className="shrink-0 grid grid-cols-3 gap-1.5 px-2.5 pt-1 pb-2 border-t border-terminal-border">
          {proj.projections.map(p => {
            const chg = proj.currentPrice
              ? ((p.price - proj.currentPrice) / proj.currentPrice) * 100 : 0;
            return (
              <div key={p.days} className="panel px-2 py-2 text-center">
                <div className="text-[8px] text-terminal-dim font-['Orbitron'] tracking-wider mb-1 uppercase">
                  {p.label}
                </div>
                <div className={`text-[14px] font-bold tabular-nums leading-none ${chg >= 0 ? 'value-up' : 'value-down'}`}>
                  ${p.price.toFixed(2)}
                </div>
                <div className={`text-[9px] mt-0.5 font-semibold ${chg >= 0 ? 'value-up' : 'value-down'}`}>
                  {chg >= 0 ? '+' : ''}{chg.toFixed(1)}%
                </div>
                <div className="text-[8px] text-terminal-dim mt-0.5">
                  ${p.low.toFixed(0)}–${p.high.toFixed(0)} · {p.confidence}%
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Technical signals ──────── */}
      {proj && proj.signals.length > 0 && (
        <div className="shrink-0 border-t border-terminal-border px-2.5 py-2 bg-terminal-surface">
          <div className="flex flex-wrap gap-1">
            {proj.signals.map((sig, i) => (
              <div key={i}
                className="flex items-center gap-1.5 text-[9px] px-2 py-1 border border-terminal-border rounded bg-terminal-panel">
                <span className={SIG_COLOR[sig.direction as keyof typeof SIG_COLOR] ?? 'text-terminal-dim'}>
                  {sig.direction === 'bullish' ? '▲' : sig.direction === 'bearish' ? '▼' : '◆'}
                </span>
                <span className="text-terminal-dim">{sig.name}:</span>
                <span className={`font-bold ${SIG_COLOR[sig.direction as keyof typeof SIG_COLOR] ?? 'text-terminal-dim'}`}>
                  {sig.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
