'use client';
import { useEffect, useState, useRef } from 'react';
import type { CommodityPrice } from '@/lib/types';
import ThemeToggle from '@/components/ThemeToggle';

interface Props { initialPrices: CommodityPrice[] }

const HL_SPREAD: Record<string, number> = {
  BRT: 0.018, WTI: 0.019, HH: 0.025, TTF: 0.022, GO: 0.016, HFO: 0.014,
};

export default function PriceStrip({ initialPrices }: Props) {
  const [prices, setPrices] = useState<CommodityPrice[]>(initialPrices);
  const [time, setTime] = useState('');
  const prevRef = useRef<Record<string, number>>({});
  const [flashes, setFlashes] = useState<Record<string, 'up' | 'down' | ''>>({});

  useEffect(() => {
    const tick = () => setTime(new Date().toUTCString().slice(17, 25) + ' UTC');
    tick();
    const ti = setInterval(tick, 1000);

    const fetchPrices = async () => {
      try {
        const r = await fetch('/api/prices');
        const d = await r.json();
        const newFlashes: Record<string, 'up' | 'down' | ''> = {};
        d.prices.forEach((p: CommodityPrice) => {
          const prev = prevRef.current[p.symbol];
          if (prev !== undefined && prev !== p.price) {
            newFlashes[p.symbol] = p.price > prev ? 'up' : 'down';
          }
          prevRef.current[p.symbol] = p.price;
        });
        setFlashes(newFlashes);
        setPrices(d.prices);
        setTimeout(() => setFlashes({}), 800);
      } catch { /* stale */ }
    };
    const pi = setInterval(fetchPrices, 30_000);
    return () => { clearInterval(ti); clearInterval(pi); };
  }, []);

  const brtWtiSpread = prices.length >= 2
    ? (prices.find(p => p.symbol === 'BRT')?.price ?? 0) - (prices.find(p => p.symbol === 'WTI')?.price ?? 0)
    : 0;

  const spreadLabel = brtWtiSpread > 3 ? 'CONTANGO' : brtWtiSpread > 1 ? 'NORMAL' : 'COMPRESSED';

  return (
    <div className="flex items-stretch h-full bg-terminal-panel border-b border-terminal-border transition-colors duration-300">

      {/* ── Logo ─────────────────────── */}
      <div className="flex items-center px-4 border-r border-terminal-border gap-3 shrink-0">
        <div className="w-3 h-3 rounded-full bg-terminal-green shadow-glow-green animate-pulse" />
        <div>
          <div className="font-['Orbitron'] text-[11px] tracking-widest text-terminal-bright font-bold glow-blue leading-none">
            OIL SENTINEL
          </div>
          <div className="text-terminal-dim text-[8px] tracking-[0.2em] leading-none mt-1">
            TERMINAL  v2.1
          </div>
        </div>
      </div>

      {/* ── Price tiles ──────────────── */}
      <div className="flex items-center overflow-x-auto flex-1 min-w-0 scrollbar-hide">
        {prices.map(p => {
          const spread    = HL_SPREAD[p.symbol] ?? 0.018;
          const hi        = (p.price * (1 + spread)).toFixed(2);
          const lo        = (p.price * (1 - spread)).toFixed(2);
          const flashCls  = flashes[p.symbol] === 'up' ? 'flash-up' : flashes[p.symbol] === 'down' ? 'flash-down' : '';
          const trendColor = p.trend === 'up' ? 'value-up' : p.trend === 'down' ? 'value-down' : 'text-terminal-bright';

          return (
            <div
              key={p.symbol}
              className={`flex flex-col justify-center px-3 border-r border-terminal-border h-full min-w-[108px] transition-colors ${flashCls}`}
            >
              {/* Symbol + arrow */}
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-['Orbitron'] text-[8px] tracking-wider text-terminal-dim">{p.symbol}</span>
                {p.trend !== 'flat' && (
                  <span className={`text-[10px] font-bold ${trendColor}`}>
                    {p.trend === 'up' ? '▲' : '▼'}
                  </span>
                )}
              </div>
              {/* Price */}
              <div className={`text-[15px] font-bold leading-none tabular-nums ${trendColor}`}>
                ${p.price.toFixed(2)}
              </div>
              {/* Change % */}
              <div className={`text-[9px] font-semibold mt-0.5 ${p.changePct >= 0 ? 'value-up' : 'value-down'}`}>
                {p.changePct >= 0 ? '+' : ''}{p.changePct.toFixed(2)}%
              </div>
              {/* H/L range */}
              <div className="flex gap-1.5 text-[8px] mt-0.5 text-terminal-dim">
                <span>H <span className="text-terminal-text">{hi}</span></span>
                <span>L <span className="text-terminal-text">{lo}</span></span>
              </div>
            </div>
          );
        })}

        {/* BRT-WTI Spread */}
        <div className="flex flex-col justify-center px-3 border-r border-terminal-border h-full min-w-[96px]">
          <div className="font-['Orbitron'] text-[8px] tracking-wider text-terminal-dim mb-0.5">BRT–WTI</div>
          <div className="text-terminal-amber text-[15px] font-bold leading-none tabular-nums">
            ${brtWtiSpread.toFixed(2)}
          </div>
          <div className="text-terminal-dim text-[8px] mt-0.5">SPREAD</div>
          <div className="text-terminal-amber text-[8px] font-semibold">{spreadLabel}</div>
        </div>
      </div>

      {/* ── Clock + status + toggle ───── */}
      <div className="flex items-center gap-4 px-4 border-l border-terminal-border shrink-0">
        {/* UTC clock */}
        <div className="text-right">
          <div className="text-terminal-dim text-[8px] tracking-wider font-['Orbitron']">UTC</div>
          <div className="text-terminal-blue text-[14px] font-bold glow-blue tabular-nums leading-tight"
               suppressHydrationWarning>
            {time}
          </div>
        </div>
        {/* Feed status */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[9px] text-terminal-green font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-terminal-green animate-pulse" />
            FEEDS LIVE
          </div>
          <div className="flex items-center gap-1.5 text-[9px] text-terminal-dim">
            <div className="w-1.5 h-1.5 rounded-full bg-terminal-blue opacity-70" />
            30s REFRESH
          </div>
        </div>
        {/* Theme toggle */}
        <ThemeToggle />
      </div>
    </div>
  );
}
