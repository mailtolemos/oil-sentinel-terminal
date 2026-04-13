'use client';
import { useState } from 'react';
import type { CommodityPrice } from '@/lib/types';
import WorldMap from '@/components/WorldMap';
import NewsFeed from '@/components/NewsFeed';
import PriceChart from '@/components/PriceChart';
import ThreatMatrix from '@/components/ThreatMatrix';

type Tab = 'map' | 'news' | 'threats' | 'chart';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'map',     label: 'MAP',     icon: '🌍' },
  { id: 'news',    label: 'NEWS',    icon: '📰' },
  { id: 'threats', label: 'THREATS', icon: '⚠️' },
  { id: 'chart',   label: 'CHART',   icon: '📈' },
];

const TICKER_ITEMS = [
  '🔴 BRENT CRUDE — Real-time price intelligence',
  '⚡ STRAIT OF HORMUZ: Elevated tension — 20 Mb/d at risk',
  '🚢 RED SEA: Houthi attacks — tankers rerouting via Cape (+10 days)',
  '🛢️ OPEC+ maintaining voluntary cuts through Q3 2025',
  '⚠️ RUSSIA SANCTIONS: 3.5 Mb/d under G7 price cap',
  '🌍 LIBYA: Sharara field disrupted — 0.3 Mb/d offline',
  '📈 CHINA DEMAND: Q2 2025 import growth +2.1% YoY',
  '🔔 BAKER HUGHES RIG COUNT: Friday 18:00 UTC',
];

interface Props { initialPrices: CommodityPrice[] }

export default function MobileTerminal({ initialPrices }: Props) {
  const [tab, setTab] = useState<Tab>('map');

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-terminal-bg transition-colors duration-300">

      {/* ── Mobile price strip ───────────────────────────────── */}
      <div className="shrink-0 border-b border-terminal-border bg-terminal-panel">
        {/* Logo row */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-terminal-border bg-terminal-surface">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-terminal-green animate-pulse" />
            <span className="font-['Orbitron'] text-[11px] tracking-widest text-terminal-bright font-bold glow-blue">
              OIL SENTINEL
            </span>
            <span className="text-terminal-dim text-[8px] tracking-widest">v2.1</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-terminal-blue text-[12px] font-bold tabular-nums glow-blue" suppressHydrationWarning>
                {new Date().toUTCString().slice(17, 25)} UTC
              </div>
            </div>
            <div className="flex items-center gap-1 text-[8px] text-terminal-green">
              <div className="w-1.5 h-1.5 rounded-full bg-terminal-green animate-pulse" />
              LIVE
            </div>
          </div>
        </div>

        {/* Scrollable price tiles */}
        <div className="flex overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {initialPrices.map(p => {
            const col = p.trend === 'up' ? 'value-up' : p.trend === 'down' ? 'value-down' : 'text-terminal-bright';
            return (
              <div key={p.symbol}
                   className="flex flex-col justify-center px-3 py-2 border-r border-terminal-border shrink-0 min-w-[90px]">
                <div className="flex items-center gap-1">
                  <span className="font-['Orbitron'] text-[7px] tracking-wider text-terminal-dim">{p.symbol}</span>
                  {p.trend !== 'flat' && (
                    <span className={`text-[8px] font-bold ${col}`}>{p.trend === 'up' ? '▲' : '▼'}</span>
                  )}
                </div>
                <div className={`text-[14px] font-bold leading-none tabular-nums ${col}`}>
                  ${p.price.toFixed(2)}
                </div>
                <div className={`text-[8px] font-semibold ${p.changePct >= 0 ? 'value-up' : 'value-down'}`}>
                  {p.changePct >= 0 ? '+' : ''}{p.changePct.toFixed(2)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main content area ────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className={`h-full ${tab === 'map'     ? 'block' : 'hidden'}`}><WorldMap /></div>
        <div className={`h-full ${tab === 'news'    ? 'block' : 'hidden'}`}><NewsFeed /></div>
        <div className={`h-full ${tab === 'threats' ? 'block' : 'hidden'}`}><ThreatMatrix /></div>
        <div className={`h-full ${tab === 'chart'   ? 'block' : 'hidden'}`}><PriceChart /></div>
      </div>

      {/* ── Bottom ticker ────────────────────────────────────── */}
      <div className="shrink-0 h-6 border-t border-terminal-border bg-terminal-surface flex items-center overflow-hidden">
        <div className="flex-1 overflow-hidden relative">
          <div className="ticker-text text-[9px] text-terminal-text font-medium">
            {TICKER_ITEMS.join('  ·  ')}&nbsp;&nbsp;&nbsp;&nbsp;{TICKER_ITEMS.join('  ·  ')}
          </div>
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────── */}
      <div className="shrink-0 grid grid-cols-4 border-t border-terminal-border bg-terminal-panel"
           style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-col items-center justify-center py-2.5 gap-1 transition-all text-center
              ${tab === t.id
                ? 'text-terminal-blue border-t-2 border-terminal-blue bg-terminal-accent-blue'
                : 'text-terminal-dim border-t-2 border-transparent hover:text-terminal-text'}`}
          >
            <span className="text-[16px] leading-none">{t.icon}</span>
            <span className="font-['Orbitron'] text-[7px] tracking-widest font-bold">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
