'use client';
import { useEffect, useState, useRef } from 'react';
import type { CommodityPrice } from '@/lib/types';

interface Props { initialPrices: CommodityPrice[] }

// Simulated daily H/L range offset (% of price) — gives visual depth
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
      } catch { /* keep stale */ }
    };
    const pi = setInterval(fetchPrices, 30_000);
    return () => { clearInterval(ti); clearInterval(pi); };
  }, []);

  const brtWtiSpread = prices.length >= 2
    ? (prices.find(p => p.symbol === 'BRT')?.price ?? 0) - (prices.find(p => p.symbol === 'WTI')?.price ?? 0)
    : 0;

  return (
    <div className="flex items-stretch h-full border-b border-terminal-border bg-[#030810]">
      {/* Logo */}
      <div className="flex items-center px-4 border-r border-terminal-border min-w-fit gap-2.5 shrink-0">
        <div className="relative">
          <div className="w-2.5 h-2.5 rounded-full bg-terminal-green shadow-glow-green animate-pulse" />
        </div>
        <div>
          <div className="font-['Orbitron'] text-[11px] tracking-widest text-terminal-bright font-bold glow-blue leading-none">
            OIL SENTINEL
          </div>
          <div className="text-terminal-dim text-[8px] tracking-widest leading-none mt-0.5">TERMINAL  v2.0</div>
        </div>
      </div>

      {/* Price tiles */}
      <div className="flex items-center overflow-x-auto flex-1 min-w-0">
        {prices.map(p => {
          const spread = HL_SPREAD[p.symbol] ?? 0.018;
          const hi = (p.price * (1 + spread)).toFixed(2);
          const lo = (p.price * (1 - spread)).toFixed(2);
          const flashClass = flashes[p.symbol] === 'up' ? 'flash-up' : flashes[p.symbol] === 'down' ? 'flash-down' : '';

          return (
            <div
              key={p.symbol}
              className={`flex flex-col justify-center px-3 border-r border-terminal-border h-full min-w-[110px] ${flashClass}`}
            >
              {/* Symbol + trend arrow */}
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-['Orbitron'] text-[8px] tracking-wider text-terminal-dim">{p.symbol}</span>
                {p.trend !== 'flat' && (
                  <span className={`text-[9px] font-bold ${p.trend === 'up' ? 'value-up' : 'value-down'}`}>
                    {p.trend === 'up' ? '▲' : '▼'}
                  </span>
                )}
              </div>
              {/* Price — big and readable */}
              <div className={`text-[16px] font-bold leading-none tabular-nums
                ${p.trend === 'up' ? 'value-up' : p.trend === 'down' ? 'value-down' : 'text-terminal-bright'}`}>
                ${p.price.toFixed(2)}
              </div>
              {/* Change % */}
              <div className={`text-[9px] font-semibold mt-0.5 ${p.changePct >= 0 ? 'value-up' : 'value-down'}`}>
                {p.changePct >= 0 ? '+' : ''}{p.changePct.toFixed(2)}%
              </div>
              {/* H/L */}
              <div className="flex gap-1.5 text-[8px] mt-0.5">
                <span className="text-terminal-dim">H</span>
                <span className="text-terminal-text">{hi}</span>
                <span className="text-terminal-dim">L</span>
                <span className="text-terminal-text">{lo}</span>
              </div>
            </div>
          );
        })}

        {/* BRT-WTI Spread */}
        <div className="flex flex-col justify-center px-3 border-r border-terminal-border h-full min-w-[100px]">
          <div className="font-['Orbitron'] text-[8px] tracking-wider text-terminal-dim mb-0.5">BRT-WTI</div>
          <div className="text-terminal-amber text-[16px] font-bold leading-none tabular-nums">
            ${brtWtiSpread.toFixed(2)}
          </div>
          <div className="text-terminal-dim text-[8px] mt-0.5">SPREAD</div>
          <div className="text-terminal-dim text-[8px]">
            {brtWtiSpread > 3 ? 'CONTANGO' : brtWtiSpread > 1 ? 'NORMAL' : 'COMPRESSED'}
          </div>
        </div>
      </div>

      {/* Clock + status */}
      <div className="flex items-center gap-4 px-4 border-l border-terminal-border shrink-0">
        <div className="text-right">
          <div className="text-terminal-dim text-[8px] tracking-wider font-['Orbitron']">UTC</div>
          <div className="text-terminal-blue text-[14px] font-bold glow-blue tabular-nums leading-tight"
               suppressHydrationWarning>
            {time}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-[9px] text-terminal-green">
            <div className="w-1.5 h-1.5 rounded-full bg-terminal-green animate-pulse" />
            FEEDS LIVE
          </div>
          <div className="flex items-center gap-1.5 text-[9px] text-terminal-dim">
            <div className="w-1.5 h-1.5 rounded-full bg-terminal-blue opacity-70" />
            30s REFRESH
          </div>
        </div>
      </div>
    </div>
  );
}
