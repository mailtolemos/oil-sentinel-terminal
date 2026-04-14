'use client';
import { useEffect, useState, useRef } from 'react';
import type { CommodityPrice } from '@/lib/types';
import ThemeToggle from '@/components/ThemeToggle';
import MetricTooltip from '@/components/MetricTooltip';

interface Props { initialPrices: CommodityPrice[] }

const COMMODITY_INFO: Record<string, { title: string; description: string; unit: string }> = {
  BRT: { title: 'Brent Crude Oil',       description: 'Global benchmark crude — ICE Futures Europe. ~70% of world oil priced off Brent. Sourced from the North Sea.', unit: 'USD/bbl' },
  WTI: { title: 'WTI Crude Oil',         description: 'US benchmark crude — NYMEX. Lighter & sweeter than Brent. Delivery at Cushing, Oklahoma hub.',                 unit: 'USD/bbl' },
  DUB: { title: 'Dubai Crude',           description: 'Middle East sour crude benchmark. Key pricing reference for Asian refiners buying Persian Gulf barrels.',       unit: 'USD/bbl' },
  HH:  { title: 'Henry Hub Natural Gas', description: 'US gas benchmark at Henry Hub, Louisiana. Key reference for LNG export pricing and US power generation.',      unit: 'USD/MMBtu' },
  GO:  { title: 'ICE Gasoil / Diesel',   description: 'European diesel & heating oil benchmark on ICE. Primary indicator for transport and industrial demand.',        unit: 'USD/metric tonne' },
  RB:  { title: 'RBOB Gasoline',         description: 'US gasoline blendstock futures — NYMEX. Drives the crack spread (refinery margin) calculation.',               unit: 'USD/gal' },
};

const CRUDE_SYMS   = ['BRT', 'WTI', 'DUB'] as const;
const CRUDE_COLORS: Record<string, string> = { BRT: '#00d4ff', WTI: '#00ff88', DUB: '#ffa500' };

export default function PriceStrip({ initialPrices }: Props) {
  const [prices, setPrices]     = useState<CommodityPrice[]>(initialPrices);
  const [time, setTime]         = useState('');
  const [lastUpdate, setLast]   = useState('');
  const prevRef                 = useRef<Record<string, number>>({});
  const [flashes, setFlashes]   = useState<Record<string, 'up' | 'down' | ''>>({});

  useEffect(() => {
    const tick = () => setTime(new Date().toUTCString().slice(17, 25) + ' UTC');
    tick();
    const ti = setInterval(tick, 1000);

    const fetchPrices = async () => {
      try {
        const r = await fetch('/api/prices');
        const d = await r.json();
        const nf: Record<string, 'up' | 'down' | ''> = {};
        (d.prices as CommodityPrice[]).forEach(p => {
          const prev = prevRef.current[p.symbol];
          if (prev !== undefined && prev !== p.price)
            nf[p.symbol] = p.price > prev ? 'up' : 'down';
          prevRef.current[p.symbol] = p.price;
        });
        setFlashes(nf);
        setPrices(d.prices);
        setLast(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setTimeout(() => setFlashes({}), 700);
      } catch { /* stale */ }
    };
    fetchPrices();
    const pi = setInterval(fetchPrices, 12_000); // every 12 s
    return () => { clearInterval(ti); clearInterval(pi); };
  }, []);

  const brt = prices.find(p => p.symbol === 'BRT');
  const wti = prices.find(p => p.symbol === 'WTI');
  const dub = prices.find(p => p.symbol === 'DUB');

  const brtWtiSpread = brt && wti ? +(brt.price - wti.price).toFixed(2) : 0;
  const brtDubSpread = brt && dub ? +(brt.price - dub.price).toFixed(2) : 0;

  const crudeData = ([brt, wti, dub].filter(Boolean)) as CommodityPrice[];
  const minP = crudeData.length ? Math.min(...crudeData.map(p => p.price)) : 60;
  const maxP = crudeData.length ? Math.max(...crudeData.map(p => p.price)) : 70;
  const rng  = Math.max(maxP - minP, 0.5);
  const pct  = (price: number) => Math.max(0, Math.min(96, ((price - minP) / rng) * 96));

  return (
    <div className="flex flex-col h-full bg-terminal-panel border-b border-terminal-border transition-colors duration-300">

      {/* ── Row 1: Logo + tiles + clock ─────────────────────── */}
      <div className="flex items-stretch flex-1 min-h-0">

        {/* Logo */}
        <div className="flex items-center px-4 border-r border-terminal-border gap-2.5 shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-terminal-green shadow-glow-green animate-pulse" />
          <div>
            <div className="font-['Orbitron'] text-[10px] tracking-widest text-terminal-bright font-bold glow-blue leading-none">OIL SENTINEL</div>
            <div className="text-terminal-dim text-[7px] tracking-[0.2em] leading-none mt-0.5">v2.1  TERMINAL</div>
          </div>
        </div>

        {/* Price tiles */}
        <div className="flex items-center overflow-x-auto flex-1 min-w-0 divide-x divide-terminal-border" style={{ scrollbarWidth: 'none' }}>
          {prices.map(p => {
            const flashCls   = flashes[p.symbol] === 'up' ? 'flash-up' : flashes[p.symbol] === 'down' ? 'flash-down' : '';
            const trendColor = p.trend === 'up' ? 'value-up' : p.trend === 'down' ? 'value-down' : 'text-terminal-bright';
            const info       = COMMODITY_INFO[p.symbol];
            const isGas = p.symbol === 'HH';
            const fmt = (v: number) => isGas ? v.toFixed(3) : v.toFixed(2);

            return (
              <div key={p.symbol}
                   className={`flex flex-col justify-center px-3 h-full min-w-[105px] transition-colors ${flashCls}`}>
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="font-['Orbitron'] text-[8px] tracking-wider text-terminal-dim">{p.symbol}</span>
                  {p.trend !== 'flat' && (
                    <span className={`text-[9px] font-bold ${trendColor}`}>{p.trend === 'up' ? '▲' : '▼'}</span>
                  )}
                </div>
                <div className={`text-[14px] font-bold leading-none tabular-nums ${trendColor}`}>
                  {info ? (
                    <MetricTooltip title={info.title} description={info.description} unit={info.unit}
                      context={`${p.changePct >= 0 ? '▲' : '▼'} ${Math.abs(p.changePct).toFixed(2)}% · H: $${fmt(p.high)} L: $${fmt(p.low)}`}>
                      ${fmt(p.price)}
                    </MetricTooltip>
                  ) : `$${fmt(p.price)}`}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[8px] font-bold tabular-nums ${p.changePct >= 0 ? 'value-up' : 'value-down'}`}>
                    {p.changePct >= 0 ? '+' : ''}{p.changePct.toFixed(2)}%
                  </span>
                  {p.high > 0 && (
                    <span className="text-[7px] text-terminal-dim hidden lg:inline tabular-nums">
                      H {fmt(p.high)} L {fmt(p.low)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Clock + status */}
        <div className="flex items-center gap-3 px-4 border-l border-terminal-border shrink-0">
          <div className="text-right">
            <div className="text-terminal-dim text-[7px] tracking-wider font-['Orbitron']">UTC</div>
            <div className="text-terminal-blue text-[13px] font-bold glow-blue tabular-nums leading-tight" suppressHydrationWarning>
              {time}
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 text-[8px] text-terminal-green font-medium">
              <div className="w-1.5 h-1.5 rounded-full bg-terminal-green animate-pulse" />LIVE
            </div>
            <div className="text-[7px] text-terminal-dim tabular-nums" suppressHydrationWarning>{lastUpdate || '12s'}</div>
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* ── Row 2: Crude spread comparison bar ──────────────── */}
      <div className="shrink-0 h-[20px] border-t border-terminal-border bg-terminal-surface/60 flex items-center px-4 gap-5 overflow-hidden">

        <span className="font-['Orbitron'] text-[7px] text-terminal-dim tracking-wider shrink-0">CRUDE SPREADS</span>

        {/* Visual bar */}
        <div className="relative flex-1 h-[6px] bg-terminal-border/20 rounded-full overflow-visible max-w-[200px]">
          {crudeData.map(p => (
            <div key={p.symbol}
              className="absolute top-1/2 -translate-y-1/2 w-[3px] h-[10px] rounded-sm transition-all duration-700"
              style={{ left: `${pct(p.price)}%`, background: CRUDE_COLORS[p.symbol] ?? '#fff' }}
              title={`${p.symbol} $${p.price.toFixed(2)}`}
            />
          ))}
          {/* Connector line */}
          {crudeData.length >= 2 && (
            <div className="absolute top-1/2 -translate-y-1/2 h-[1px] opacity-30"
              style={{
                left: `${pct(Math.min(...crudeData.map(p => p.price)))}%`,
                width: `${pct(Math.max(...crudeData.map(p => p.price))) - pct(Math.min(...crudeData.map(p => p.price)))}%`,
                background: 'linear-gradient(to right, #00d4ff, #00ff88)',
              }}
            />
          )}
        </div>

        {/* Crude price labels */}
        {crudeData.map(p => (
          <div key={p.symbol} className="flex items-center gap-1 shrink-0">
            <div className="w-[6px] h-[6px] rounded-sm" style={{ background: CRUDE_COLORS[p.symbol] }} />
            <span className="font-['Orbitron'] text-[7px]" style={{ color: CRUDE_COLORS[p.symbol] }}>{p.symbol}</span>
            <span className="text-terminal-text text-[8px] font-bold tabular-nums">${p.price.toFixed(2)}</span>
          </div>
        ))}

        <div className="h-3 w-px bg-terminal-border/40 shrink-0" />

        {/* Spread values */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[7px] text-terminal-dim font-['Orbitron']">BRT–WTI</span>
            <span className={`text-[10px] font-bold tabular-nums ${brtWtiSpread > 3 ? 'text-terminal-amber' : brtWtiSpread > 1 ? 'text-terminal-green' : 'text-terminal-red'}`}>
              {brtWtiSpread >= 0 ? '+' : ''}${brtWtiSpread.toFixed(2)}
            </span>
            <span className="text-[7px] text-terminal-dim">
              {brtWtiSpread > 3 ? 'WIDE' : brtWtiSpread > 1 ? 'NORMAL' : 'TIGHT'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[7px] text-terminal-dim font-['Orbitron']">BRT–DUB</span>
            <span className="text-[10px] font-bold tabular-nums text-terminal-blue">
              {brtDubSpread >= 0 ? '+' : ''}${brtDubSpread.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
