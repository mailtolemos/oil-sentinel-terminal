'use client';
import { useState, useEffect } from 'react';
import type { CommodityPrice } from '@/lib/types';
import WorldMap from '@/components/WorldMap';
import NewsFeed from '@/components/NewsFeed';
import PriceChart from '@/components/PriceChart';
import ThreatMatrix from '@/components/ThreatMatrix';
import BotPanel from '@/components/BotPanel';
import AlJazeeraPanel from '@/components/AlJazeeraPanel';

type Tab = 'map' | 'news' | 'threats' | 'chart' | 'live' | 'signals';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'map',     label: 'MAP',     icon: '🌍' },
  { id: 'news',    label: 'NEWS',    icon: '📰' },
  { id: 'live',    label: 'AJ LIVE', icon: '📺' },
  { id: 'threats', label: 'THREATS', icon: '⚠️' },
  { id: 'signals', label: 'SIGNALS', icon: '⚡' },
];

const TICKER_ITEMS = [
  '🔴 BRENT CRUDE — Real-time price intelligence',
  '⚡ STRAIT OF HORMUZ: Elevated tension — 20 Mb/d at risk',
  '🚢 RED SEA: Houthi attacks — tankers rerouting via Cape (+10 days)',
  '🛢️ OPEC+ maintaining voluntary cuts',
  '⚠️ RUSSIA SANCTIONS: 3.5 Mb/d under G7 price cap',
  '🌍 LIBYA: Sharara field disrupted — 0.3 Mb/d offline',
  '📈 CHINA DEMAND: Q2 2025 import growth +2.1% YoY',
];

interface Props { initialPrices: CommodityPrice[] }

export default function MobileTerminal({ initialPrices }: Props) {
  const [tab, setTab]         = useState<Tab>('map');
  const [prices, setPrices]   = useState<CommodityPrice[]>(initialPrices);
  const [time, setTime]       = useState('');

  useEffect(() => {
    const ti = setInterval(() => setTime(new Date().toUTCString().slice(17, 25) + ' UTC'), 1000);
    setTime(new Date().toUTCString().slice(17, 25) + ' UTC');

    const fetchPrices = async () => {
      try {
        const r = await fetch('/api/prices');
        const d = await r.json();
        setPrices(d.prices);
      } catch { /* stale */ }
    };
    const pi = setInterval(fetchPrices, 15_000);
    return () => { clearInterval(ti); clearInterval(pi); };
  }, []);

  const brt = prices.find(p => p.symbol === 'BRT');
  const wti = prices.find(p => p.symbol === 'WTI');
  const spread = brt && wti ? +(brt.price - wti.price).toFixed(2) : null;

  return (
    /* Root: fixed viewport, no overflow leak */
    <div className="flex flex-col bg-terminal-bg transition-colors duration-300"
         style={{ height: '100dvh', maxHeight: '100dvh', overflow: 'hidden' }}>

      {/* ── Header ─────────────────────────────────────── */}
      <div className="shrink-0 border-b border-terminal-border bg-terminal-panel" style={{ zIndex: 20, position: 'relative' }}>

        {/* Logo row */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-terminal-border bg-terminal-surface">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-terminal-green animate-pulse" />
            <span className="font-['Orbitron'] text-[10px] tracking-widest text-terminal-bright font-bold glow-blue">OIL SENTINEL</span>
            <span className="text-terminal-dim text-[7px] tracking-widest">v2.1</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-terminal-blue text-[11px] font-bold tabular-nums glow-blue" suppressHydrationWarning>{time}</div>
            <div className="flex items-center gap-1 text-[7px] text-terminal-green">
              <div className="w-1.5 h-1.5 rounded-full bg-terminal-green animate-pulse" />LIVE
            </div>
          </div>
        </div>

        {/* Price tiles — horizontal scroll */}
        <div className="flex overflow-x-auto" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
          {prices.map(p => {
            const col = p.trend === 'up' ? 'value-up' : p.trend === 'down' ? 'value-down' : 'text-terminal-bright';
            const isGas = p.symbol === 'HH';
            const fmt = (v: number) => isGas ? v.toFixed(3) : v.toFixed(2);
            return (
              <div key={p.symbol}
                   className="flex flex-col justify-center px-3 py-2 border-r border-terminal-border shrink-0 min-w-[88px]">
                <div className="flex items-center gap-1">
                  <span className="font-['Orbitron'] text-[7px] tracking-wider text-terminal-dim">{p.symbol}</span>
                  {p.trend !== 'flat' && <span className={`text-[8px] font-bold ${col}`}>{p.trend === 'up' ? '▲' : '▼'}</span>}
                </div>
                <div className={`text-[13px] font-bold leading-none tabular-nums ${col}`}>${fmt(p.price)}</div>
                <div className={`text-[8px] font-semibold tabular-nums ${p.changePct >= 0 ? 'value-up' : 'value-down'}`}>
                  {p.changePct >= 0 ? '+' : ''}{p.changePct.toFixed(2)}%
                </div>
              </div>
            );
          })}

          {/* Spread tile */}
          {spread !== null && (
            <div className="flex flex-col justify-center px-3 py-2 border-r border-terminal-border shrink-0 min-w-[80px]">
              <span className="font-['Orbitron'] text-[7px] tracking-wider text-terminal-dim mb-0.5">BRT–WTI</span>
              <span className={`text-[13px] font-bold tabular-nums ${spread > 3 ? 'text-terminal-amber' : spread > 1 ? 'text-terminal-green' : 'text-terminal-red'}`}>
                +${spread.toFixed(2)}
              </span>
              <span className="text-[7px] text-terminal-dim">{spread > 3 ? 'WIDE' : spread > 1 ? 'NORMAL' : 'TIGHT'}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Main content ───────────────────────────────── */}
      {/* isolation:isolate creates a stacking context so nothing leaks below the tab bar */}
      <div className="flex-1 overflow-hidden" style={{ position: 'relative', isolation: 'isolate', zIndex: 1 }}>
        <div className={`h-full w-full ${tab === 'map'     ? 'block' : 'hidden'}`}><WorldMap /></div>
        <div className={`h-full w-full ${tab === 'news'    ? 'block' : 'hidden'}`}><NewsFeed /></div>
        <div className={`h-full w-full overflow-y-auto ${tab === 'live'    ? 'block' : 'hidden'}`}><AlJazeeraPanel /></div>
        <div className={`h-full w-full overflow-y-auto ${tab === 'threats' ? 'block' : 'hidden'}`}><ThreatMatrix /></div>
        <div className={`h-full w-full overflow-y-auto ${tab === 'signals' ? 'block' : 'hidden'}`}><BotPanel /></div>
      </div>

      {/* ── Ticker ─────────────────────────────────────── */}
      <div className="shrink-0 h-6 border-t border-terminal-border bg-terminal-surface flex items-center overflow-hidden"
           style={{ position: 'relative', zIndex: 30 }}>
        <div className="flex-1 overflow-hidden relative">
          <div className="ticker-text text-[8px] text-terminal-text font-medium">
            {TICKER_ITEMS.join('  ·  ')}&nbsp;&nbsp;&nbsp;{TICKER_ITEMS.join('  ·  ')}
          </div>
        </div>
      </div>

      {/* ── Tab bar — z-index 40 keeps it above everything ─ */}
      <div className="shrink-0 grid grid-cols-5 border-t border-terminal-border bg-terminal-panel"
           style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', position: 'relative', zIndex: 40 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex flex-col items-center justify-center py-2.5 gap-0.5 transition-all text-center
              ${tab === t.id
                ? 'text-terminal-blue border-t-2 border-terminal-blue bg-terminal-accent-blue'
                : 'text-terminal-dim border-t-2 border-transparent'}`}>
            <span className="text-[15px] leading-none">{t.icon}</span>
            <span className="font-['Orbitron'] text-[6px] tracking-widest font-bold">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
