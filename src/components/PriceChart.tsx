'use client';
import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import type { PriceProjection } from '@/lib/types';

type BiasKey = 'strongly_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strongly_bearish';

const BIAS_CONFIG: Record<BiasKey, { text: string; glow: string; label: string; bg: string }> = {
  strongly_bullish: { text: 'text-terminal-green', glow: 'glow-green', label: '▲▲ STRONGLY BULLISH', bg: 'bg-terminal-green/10 border-terminal-green/30' },
  bullish:          { text: 'text-terminal-green', glow: 'glow-green', label: '▲ BULLISH',           bg: 'bg-terminal-green/10 border-terminal-green/30' },
  neutral:          { text: 'text-terminal-amber', glow: 'glow-amber', label: '◆ NEUTRAL',           bg: 'bg-terminal-amber/10 border-terminal-amber/30' },
  bearish:          { text: 'text-terminal-red',   glow: 'glow-red',   label: '▼ BEARISH',           bg: 'bg-terminal-red/10   border-terminal-red/30'   },
  strongly_bearish: { text: 'text-terminal-red',   glow: 'glow-red',   label: '▼▼ STRONGLY BEARISH', bg: 'bg-terminal-red/10   border-terminal-red/30'   },
};

const SIGNAL_COLORS = { bullish: 'text-terminal-green', bearish: 'text-terminal-red', neutral: 'text-terminal-dim' };

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel px-2.5 py-2 text-[9px] border border-terminal-border z-50">
      <div className="text-terminal-dim mb-1 font-bold">{label}</div>
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
  const [proj, setProj]               = useState<PriceProjection | null>(null);
  const [loading, setLoading]         = useState(true);
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

  const bias = (proj?.bias ?? 'neutral') as BiasKey;
  const bc   = BIAS_CONFIG[bias] ?? BIAS_CONFIG.neutral;
  const chartData  = proj?.chartData ?? [];
  const splitDate  = chartData.find(d => d.projected != null)?.date;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="section-header shrink-0">
        <div className="dot" />
        <span>PRICE PROJECTION</span>
        <div className="ml-auto flex gap-1">
          {(['BRT', 'WTI'] as const).map(s => (
            <button key={s} onClick={() => setActiveSymbol(s)}
              className={`text-[9px] px-2 py-0.5 rounded border transition-colors font-['Orbitron'] uppercase
                ${activeSymbol === s
                  ? 'bg-terminal-blue/20 border-terminal-blue text-terminal-blue'
                  : 'border-terminal-border text-terminal-dim hover:border-terminal-dim hover:text-terminal-text'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Bias banner */}
      {proj && (
        <div className={`shrink-0 flex items-center gap-3 px-3 py-1.5 border-b border-terminal-border ${bc.bg}`}>
          <span className={`text-[11px] font-bold ${bc.text} ${bc.glow} font-['Orbitron'] tracking-wide`}>
            {bc.label}
          </span>
          <span className="text-terminal-text text-[9px]">
            SENTIMENT {proj.sentimentScore > 0 ? '+' : ''}{proj.sentimentScore}
          </span>
          <span className="ml-auto text-terminal-bright text-[10px] font-bold tabular-nums">
            ${proj.currentPrice.toFixed(2)}
          </span>
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 min-h-0 px-1 pt-1.5">
        {loading ? (
          <div className="flex items-center justify-center h-full text-terminal-dim text-[10px]">
            <span className="animate-pulse">LOADING PROJECTION DATA…</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: -8 }}>
              <defs>
                <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#00ff88" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#00ff88" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#00d4ff" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(17,40,64,0.7)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: '#5a8aaa' }}
                interval={Math.floor(chartData.length / 6)}
                tickLine={false}
                axisLine={{ stroke: '#112840' }}
              />
              <YAxis
                tick={{ fontSize: 9, fill: '#5a8aaa' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `$${v}`}
                width={40}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area dataKey="high" fill="rgba(0,212,255,0.06)" stroke="none" name="CI High" legendType="none" />
              <Area dataKey="low"  fill="rgba(3,8,16,0.99)"   stroke="none" name="CI Low"  legendType="none" />
              <Area
                dataKey="actual" stroke="#00ff88" strokeWidth={1.8}
                fill="url(#actualGrad)" dot={false} name="Actual" connectNulls={false}
              />
              <Line
                dataKey="projected" stroke="#00d4ff" strokeWidth={1.8}
                dot={false} strokeDasharray="4 2" name="Projected" connectNulls={false}
              />
              {splitDate && (
                <ReferenceLine
                  x={splitDate}
                  stroke="rgba(90,138,170,0.5)"
                  strokeDasharray="3 3"
                  label={{ value: 'NOW', fill: '#5a8aaa', fontSize: 9, position: 'insideTopRight' }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Projection target cards */}
      {proj && (
        <div className="shrink-0 grid grid-cols-3 gap-1 px-2 pb-2 pt-1 border-t border-terminal-border">
          {proj.projections.map(p => {
            const changePct = proj.currentPrice
              ? ((p.price - proj.currentPrice) / proj.currentPrice) * 100 : 0;
            return (
              <div key={p.days} className="panel px-2 py-2 text-center">
                <div className="text-[9px] text-terminal-dim font-['Orbitron'] tracking-wider mb-1">
                  {p.label.toUpperCase()}
                </div>
                <div className={`text-[14px] font-bold tabular-nums leading-none ${changePct >= 0 ? 'value-up' : 'value-down'}`}>
                  ${p.price.toFixed(2)}
                </div>
                <div className={`text-[9px] mt-0.5 font-semibold ${changePct >= 0 ? 'value-up' : 'value-down'}`}>
                  {changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%
                </div>
                <div className="text-[8px] text-terminal-dim mt-0.5">
                  ${p.low.toFixed(0)}–${p.high.toFixed(0)} · {p.confidence}% CI
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Technical signals */}
      {proj && proj.signals.length > 0 && (
        <div className="shrink-0 border-t border-terminal-border px-2 py-2">
          <div className="flex flex-wrap gap-1">
            {proj.signals.map((sig, i) => (
              <div key={i}
                className="flex items-center gap-1 text-[9px] px-2 py-0.5 border border-terminal-border rounded bg-terminal-panel/60">
                <span className={SIGNAL_COLORS[sig.direction as keyof typeof SIGNAL_COLORS]}>
                  {sig.direction === 'bullish' ? '▲' : sig.direction === 'bearish' ? '▼' : '◆'}
                </span>
                <span className="text-terminal-dim">{sig.name}:</span>
                <span className={`font-bold ${SIGNAL_COLORS[sig.direction as keyof typeof SIGNAL_COLORS]}`}>
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
