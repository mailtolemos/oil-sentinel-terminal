'use client';
import { useEffect, useState } from 'react';
import type { AssetSignal, SignalsPayload } from '@/app/api/signals/route';

const ACTION_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  BUY:   { color: 'var(--green)', bg: 'rgba(0,232,122,0.10)',  border: 'rgba(0,232,122,0.45)' },
  SELL:  { color: 'var(--red)',   bg: 'rgba(255,51,85,0.10)',  border: 'rgba(255,51,85,0.45)' },
  HOLD:  { color: 'var(--blue)',  bg: 'rgba(0,200,240,0.08)',  border: 'rgba(0,200,240,0.35)' },
  WATCH: { color: 'var(--amber)', bg: 'rgba(255,179,0,0.09)',  border: 'rgba(255,179,0,0.40)' },
};

const ASSET_META: Record<string, { icon: string; color: string }> = {
  BTC:   { icon: '₿', color: '#f7931a' },
  GOLD:  { icon: '⬡', color: '#ffb300' },
  USOIL: { icon: '🛢', color: '#00c8f0' },
};

const CONF_COLOR: Record<string, string> = {
  HIGH: 'var(--green)', MEDIUM: 'var(--amber)', LOW: 'var(--dim)',
};

function timeAgo(iso: string): string {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function SignalRow({ signal }: { signal: AssetSignal }) {
  const [expanded, setExpanded] = useState(false);
  const style  = ACTION_STYLE[signal.action] ?? ACTION_STYLE.WATCH;
  const meta   = ASSET_META[signal.symbol] ?? { icon: '◆', color: 'var(--dim)' };
  const ago    = timeAgo(signal.updatedAt);
  const isNew  = signal.updatedAt && (Date.now() - new Date(signal.updatedAt).getTime()) < 20 * 60_000;

  return (
    <div
      className="rounded border transition-all duration-200 cursor-pointer select-none"
      style={{ background: style.bg, borderColor: style.border }}
      onClick={() => setExpanded(e => !e)}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {/* Asset icon */}
        <div className="w-7 h-7 rounded flex items-center justify-center text-[14px] shrink-0 font-bold"
          style={{ background: `${meta.color}18`, border: `1px solid ${meta.color}44`, color: meta.color }}>
          {meta.icon}
        </div>

        {/* Symbol + price */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-['Orbitron'] font-bold text-terminal-bright tracking-wider">
              {signal.symbol}
            </span>
            {isNew && (
              <span className="text-[7px] font-['Orbitron'] font-bold px-1 py-0.5 rounded"
                style={{ background: 'rgba(0,232,122,0.15)', color: 'var(--green)', border: '1px solid rgba(0,232,122,0.3)' }}>
                NEW
              </span>
            )}
          </div>
          <div className="text-[10px] font-bold tabular-nums text-terminal-bright">{signal.priceStr}</div>
          {signal.change !== undefined && (
            <div className="text-[9px] tabular-nums" style={{ color: signal.change >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {signal.change >= 0 ? '+' : ''}{signal.change.toFixed(2)}%
            </div>
          )}
        </div>

        {/* Action badge */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          <div className="px-2 py-0.5 rounded text-[10px] font-['Orbitron'] font-black tracking-wider"
            style={{ background: style.border, color: '#000' }}>
            {signal.action}
          </div>
          <div className="text-[8px] font-['Orbitron']" style={{ color: CONF_COLOR[signal.confidence] ?? 'var(--dim)' }}>
            {signal.confidence}
          </div>
        </div>

        <div className="shrink-0 text-terminal-dim text-[9px]">{expanded ? '▲' : '▼'}</div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-terminal-border/50 space-y-2 pt-2">
          <p className="text-[9px] text-terminal-text leading-relaxed">{signal.rationale}</p>

          {signal.indicators && (
            <div className="text-[8px] font-['Orbitron'] text-terminal-dim">
              {Object.entries(signal.indicators).map(([key, val]) => (
                <div key={key}>{key}: {typeof val === 'object' ? JSON.stringify(val) : val}</div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-1.5">
            <div className="bg-terminal-bg/60 rounded px-2 py-1.5">
              <div className="text-[7px] font-['Orbitron'] text-terminal-dim mb-0.5">ENTRY</div>
              <div className="text-[10px] font-bold" style={{ color: 'var(--blue)' }}>{signal.entryZone}</div>
            </div>
            <div className="bg-terminal-bg/60 rounded px-2 py-1.5">
              <div className="text-[7px] font-['Orbitron'] text-terminal-dim mb-0.5">TARGET</div>
              <div className="text-[10px] font-bold" style={{ color: 'var(--green)' }}>{signal.target}</div>
            </div>
            <div className="bg-terminal-bg/60 rounded px-2 py-1.5">
              <div className="text-[7px] font-['Orbitron'] text-terminal-dim mb-0.5">STOP</div>
              <div className="text-[10px] font-bold" style={{ color: 'var(--red)' }}>{signal.stopLoss}</div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[8px] text-terminal-dim font-['Orbitron']">{signal.timeframe}</span>
            <span className="text-[8px] text-terminal-dim">{ago}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SignalsCard({ hovered }: { hovered: boolean }) {
  const [data,    setData]    = useState<SignalsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch('/api/signals', { cache: 'no-store' });
        if (r.ok) setData(await r.json());
      } catch { /* stale */ } finally { setLoading(false); }
    };
    fetch_();
    const iv = setInterval(fetch_, 60_000); // refresh every minute
    return () => clearInterval(iv);
  }, []);

  const signals  = data?.signals ?? {};
  const availableSymbols = Object.keys(signals).sort();
  const hasAny   = availableSymbols.length > 0;
  const lastSync = data?.updatedAt ? timeAgo(data.updatedAt) : null;
  const displaySymbols = availableSymbols.slice(0, 3); // Show top 3

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded border transition-all duration-300 cursor-default"
      style={{
        background:   hovered ? 'rgba(255,100,0,0.04)' : 'var(--panel)',
        borderColor:  hovered ? 'rgba(255,100,0,0.5)' : 'var(--border)',
        boxShadow:    hovered ? '0 0 40px rgba(255,100,0,0.08), inset 0 1px 0 rgba(255,100,0,0.12)' : 'none',
      }}>

      {/* Card header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-terminal-border">
        <div className="w-8 h-8 rounded flex items-center justify-center text-lg"
          style={{ background: 'rgba(255,100,0,0.1)', border: '1px solid rgba(255,100,0,0.3)' }}>
          ⚡
        </div>
        <div>
          <div className="text-[14px] font-['Orbitron'] font-bold tracking-widest text-terminal-bright">
            LIVE SIGNALS
          </div>
          <div className="text-[8px] font-['Orbitron'] text-terminal-dim tracking-wider mt-0.5">
            {displaySymbols.join(' · ') || 'Generating signals…'} — RSI · Trend · Analysis
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {lastSync && (
            <span className="text-[8px] font-['Orbitron'] text-terminal-dim">{lastSync}</span>
          )}
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: hasAny ? 'var(--green)' : 'var(--dim)' }} />
        </div>
      </div>

      {/* Signals */}
      <div className="flex-1 p-4 space-y-2.5 overflow-hidden">

        {loading && (
          <div className="space-y-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="animate-pulse h-14 rounded border border-terminal-border bg-terminal-surface" />
            ))}
          </div>
        )}

        {!loading && !hasAny && (
          <div className="h-full flex flex-col items-center justify-center gap-3 py-4">
            <div className="w-8 h-8 rounded-full border-2 border-terminal-border flex items-center justify-center">
              <span className="text-terminal-dim text-[14px]">⏳</span>
            </div>
            <div className="text-center">
              <div className="text-[9px] font-['Orbitron'] text-terminal-dim tracking-widest uppercase">
                Awaiting Signals
              </div>
              <div className="text-[8px] text-terminal-dim mt-1 opacity-70">
                Computing market indicators…
              </div>
            </div>
          </div>
        )}

        {!loading && hasAny && displaySymbols.map(sym => {
          const s = signals[sym];
          return <SignalRow key={sym} signal={s} />;
        })}
      </div>

      {/* Tags */}
      <div className="px-5 pb-4">
        <div className="flex flex-wrap gap-1.5">
          {['Supreme Signals', 'EMA · RSI · ATR', 'Every 10 min', 'AI Enhanced'].map(tag => (
            <span key={tag} className="text-[7px] font-['Orbitron'] px-2 py-0.5 rounded tracking-wider"
              style={{ background: 'rgba(255,100,0,0.08)', border: '1px solid rgba(255,100,0,0.2)', color: 'rgba(255,100,0,0.9)' }}>
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
