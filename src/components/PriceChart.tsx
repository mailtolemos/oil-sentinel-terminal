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
    <div className="panel px-2 py-1.5 text-[8px] border border-terminal-border z-50">
      <div className="text-terminal-dim mb-1">{label}</div>
      {payload.map((p: any) => (
        p.value != null && (
          <div key={p.dataKey} style={{ color: p.color }} className="flex gap-3 justify-between">
            <span>{p.name}:</span>
            <span className="font-bold tabular-nums">${Number(p.value).toFixed(2)}</span>
          </div>
        )
      ))}
    </div>
  );
}

export default function PriceChart() {
  const [proj, setProj] = useState<PriceProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSymbol, setActiveSymbol] = useState<'BRT' | 'WTI'>('BRT');

  const fetchProjection = async () => {
    try {
      const ticker = activeSymbol === 'BRT' ? 'BZ%3DF' : 'CL%3DF';
      const r = await fetch(`/api/projection?symbol=${ticker}`);
      const d = await r.json();
      setProj(d);
    } catch { /* keep stale */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    setLoading(true);
    fetchProjection();
    const iv = setInterval(fetchProjection, 120_000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol]);

  const bias = (proj?.bias ?? 'neutral') as BiasKey;
  const bc = BIAS_CONFIG[bias] ?? BIAS_CONFIG.neutral;
  const chartData = proj?.chartData ?? [];

  // Find split between actual and projected
  const splitDate = chartData.find(d => d.projected != null)?.date;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="section-header shrink-0">
        <div className="dot" />
        <span>PRICE PROJECTION</span>
        <div className="ml-auto flex gap-1">
          {(['BRT', 'WTI'] as const).map(s => (
            <button
              key={s}
              onClick={() => setActiveSymbol(s)}
              className={`text-[7px] px-2 py-0.5 rounded border transition-colors font-['Orbitron'] uppercase
                ${activeSymbol === s
                  ? 'bg-terminal-blue/20 border-terminal-blue text-terminal-blue'
                  : 'border-terminal-border text-terminal-dim hover:border-terminal-dim'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Bias banner */}
      {proj && (
        <div className={`shrink-0 flex items-center gap-3 px-3 py-1.5 border-b border-terminal-border ${bc.bg}`}>
          <span className={`text-[10px] font-bold ${bc.text} ${bc.glow} font-['Orbitron'] tracking-wide`}>
            {bc.label}
          </span>
          <span className="text-terminal-dim text-[8px]">
            SENTIMENT {proj.sentimentScore > 0 ? '+' : ''}{proj.sentimentScore}
          </span>
          <span className="ml-auto text-terminal-dim text-[8px] tabular-nums">
            ${proj.currentPrice.toFixed(2)}
          </span>
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 min-h-0 px-1 pt-2">
        {loading ? (
          <div className="flex items-center justify-center h-full text-terminal-dim text-[9px]">
            <span className="animate-pulse">LOADING PROJECTION DATA…</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -10 }}>
              <defs>
                <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00ff88" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#00ff88" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="2 4" stroke="rgba(13,34,56,0.8)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 7, fill: '#3a6080' }}
                interval={Math.floor(chartData.length / 6)}
                tickLine={false}
                axisLine={{ stroke: '#0d2238' }}
              />
              <YAxis
                tick={{ fontSize: 7, fill: '#3a6080' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `$${v}`}
                width={38}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* CI band (filled area between high and low) */}
              <Area dataKey="high" fill="rgba(0,212,255,0.06)" stroke="none" name="CI High" legendType="none" />
              <Area dataKey="low"  fill="rgba(3,8,16,0.99)"   stroke="none" name="CI Low"  legendType="none" />

              {/* Actual price */}
              <Area
                dataKey="actual"
                stroke="#00ff88"
                strokeWidth={1.5}
                fill="url(#actualGrad)"
                dot={false}
                name="Actual"
                connectNulls={false}
              />

              {/* Projected price */}
              <Line
                dataKey="projected"
                stroke="#00d4ff"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="4 2"
                name="Projected"
                connectNulls={false}
              />

              {/* Split line */}
              {splitDate && (
                <ReferenceLine
                  x={splitDate}
                  stroke="rgba(58,96,128,0.6)"
                  strokeDasharray="3 3"
                  label={{ value: 'NOW', fill: '#3a6080', fontSize: 7, position: 'insideTopRight' }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Projection cards */}
      {proj && (
        <div className="shrink-0 grid grid-cols-3 gap-1 px-2 pb-2 pt-1 border-t border-terminal-border">
          {proj.projections.map(p => {
            const changePct = proj.currentPrice
              ? ((p.price - proj.currentPrice) / proj.currentPrice) * 100
              : 0;
            return (
              <div key={p.days} className="panel px-2 py-1.5 text-center">
                <div className="text-terminal-dim text-[7px] mb-0.5">{p.label.toUpperCase()}</div>
                <div className={`text-[12px] font-bold ${changePct >= 0 ? 'value-up' : 'value-down'} leading-none`}>
                  ${p.price.toFixed(2)}
                </div>
                <div className={`text-[8px] mt-0.5 ${changePct >= 0 ? 'value-up' : 'value-down'}`}>
                  {changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%
                </div>
                <div className="text-terminal-dim text-[6px] mt-0.5 leading-tight">
                  ${p.low.toFixed(0)}–${p.high.toFixed(0)} · {p.confidence}% CI
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Technical signals */}
      {proj && proj.signals.length > 0 && (
        <div className="shrink-0 border-t border-terminal-border px-2 py-1.5">
          <div className="text-terminal-dim text-[7px] uppercase tracking-wider mb-1">Technical Signals</div>
          <div className="flex flex-wrap gap-1">
            {proj.signals.map((sig, i) => (
              <div key={i} className="flex items-center gap-0.5 text-[7px] px-1.5 py-0.5 border border-terminal-muted rounded">
                <span className={SIGNAL_COLORS[sig.direction]}>{
                  sig.direction === 'bullish' ? '▲' : sig.direction === 'bearish' ? '▼' : '◆'
                }</span>
                <span className="text-terminal-dim">{sig.name}:</span>
                <span className={`font-bold ${SIGNAL_COLORS[sig.direction]}`}>{sig.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
