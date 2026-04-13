'use client';
import { useEffect, useState, useRef } from 'react';
import type { CommodityPrice } from '@/lib/types';

interface Props { initialPrices: CommodityPrice[] }

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
        setTimeout(() => setFlashes({}), 700);
      } catch { /* keep stale */ }
    };
    const pi = setInterval(fetchPrices, 30_000);
    return () => { clearInterval(ti); clearInterval(pi); };
  }, []);

  const brtWtiSpread = prices.length >= 2
    ? (prices.find(p => p.symbol === 'BRT')?.price ?? 0) - (prices.find(p => p.symbol === 'WTI')?.price ?? 0)
    : 0;

  return (
    <div className="flex items-stretch h-full border-b border-terminal-border bg-terminal-bg">
      {/* Logo */}
      <div className="flex items-center px-4 border-r border-terminal-border min-w-fit gap-2">
        <div className="w-2 h-2 rounded-full bg-terminal-green shadow-glow-green animate-pulse" />
        <span className="font-['Orbitron'] text-[10px] tracking-widest text-terminal-bright font-bold glow-blue">
          OIL SENTINEL
        </span>
        <span className="text-terminal-dim text-[9px]">TERMINAL</span>
        <div className="text-[8px] text-terminal-dim border border-terminal-muted px-1 rounded">LIVE</div>
      </div>

      {/* Prices */}
      <div className="flex items-center gap-0 overflow-x-auto flex-1">
        {prices.map(p => (
          <div
            key={p.symbol}
            className={`flex flex-col justify-center px-3 border-r border-terminal-border h-full min-w-[100px] transition-colors
              ${flashes[p.symbol] === 'up' ? 'bg-terminal-green/10' : flashes[p.symbol] === 'down' ? 'bg-terminal-red/10' : ''}`}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-terminal-dim text-[9px] font-['Orbitron'] tracking-wider">{p.symbol}</span>
              {p.trend !== 'flat' && (
                <span className={p.trend === 'up' ? 'value-up text-[8px]' : 'value-down text-[8px]'}>
                  {p.trend === 'up' ? '▲' : '▼'}
                </span>
              )}
            </div>
            <div className={`text-[13px] font-bold leading-tight ${p.trend === 'up' ? 'value-up' : p.trend === 'down' ? 'value-down' : 'text-terminal-bright'}`}>
              ${p.price.toFixed(2)}
            </div>
            <div className={`text-[9px] ${p.changePct >= 0 ? 'value-up' : 'value-down'}`}>
              {p.changePct >= 0 ? '+' : ''}{p.changePct.toFixed(2)}%
            </div>
          </div>
        ))}

        {/* Spread */}
        <div className="flex flex-col justify-center px-3 border-r border-terminal-border h-full min-w-[90px]">
          <div className="text-terminal-dim text-[9px] font-['Orbitron'] tracking-wider">BRT-WTI</div>
          <div className="text-terminal-amber text-[13px] font-bold leading-tight">${brtWtiSpread.toFixed(2)}</div>
          <div className="text-terminal-dim text-[9px]">SPREAD</div>
        </div>
      </div>

      {/* Clock & Status */}
      <div className="flex items-center gap-3 px-4 border-l border-terminal-border">
        <div className="text-right">
          <div className="text-terminal-dim text-[8px] tracking-wider">CLOCK</div>
          <div className="text-terminal-blue text-[11px] font-bold glow-blue tabular-nums">{time}</div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 text-[8px] text-terminal-green">
            <div className="w-1.5 h-1.5 rounded-full bg-terminal-green animate-pulse" />
            FEEDS LIVE
          </div>
          <div className="flex items-center gap-1 text-[8px] text-terminal-dim">
            <div className="w-1.5 h-1.5 rounded-full bg-terminal-blue" />
            30s REFRESH
          </div>
        </div>
      </div>
    </div>
  );
}
