import type { CommodityPrice } from '@/lib/types';
import PriceStrip from '@/components/PriceStrip';
import NewsFeed from '@/components/NewsFeed';
import WorldMap from '@/components/WorldMap';
import PriceChart from '@/components/PriceChart';
import ThreatMatrix from '@/components/ThreatMatrix';

export const revalidate = 30;

async function getInitialPrices(): Promise<CommodityPrice[]> {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    const r = await fetch(`${baseUrl}/api/prices`, { cache: 'no-store' });
    const d = await r.json();
    return d.prices ?? [];
  } catch {
    return [];
  }
}

// Breaking news ticker items (static baseline, updated by NewsFeed live data)
const TICKER_ITEMS = [
  '🔴 BRENT CRUDE LIVE — Real-time price intelligence',
  '⚡ STRAIT OF HORMUZ: Elevated tension — 20 Mb/d at risk',
  '🚢 RED SEA: Houthi attacks persist — tankers rerouting via Cape (+10 days)',
  '🛢️ OPEC+ maintaining voluntary cuts through Q3 2025',
  '📊 EIA WEEKLY PETROLEUM STATUS: Wednesday 15:30 UTC',
  '⚠️ RUSSIA SANCTIONS: 3.5 Mb/d under G7 price cap restrictions',
  '🌍 LIBYA: Sharara field disrupted — 0.3 Mb/d offline',
  '📈 CHINA DEMAND: Q2 2025 import growth +2.1% YoY',
  '💹 WTI-BRENT SPREAD: Structural contango in near-month',
  '🔔 BAKER HUGHES RIG COUNT: Friday 18:00 UTC',
];

export default async function TerminalPage() {
  const initialPrices = await getInitialPrices();

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#030810]">
      {/* ── Top bar: Price strip ───────────────────── */}
      <div className="shrink-0 h-[52px]">
        <PriceStrip initialPrices={initialPrices} />
      </div>

      {/* ── Main body: 3-column grid ───────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-[280px_1fr_280px] gap-0 overflow-hidden">
        {/* Left: News feed */}
        <div className="panel border-r border-terminal-border overflow-hidden">
          <NewsFeed />
        </div>

        {/* Center: World map + chart stacked */}
        <div className="flex flex-col overflow-hidden border-r border-terminal-border">
          {/* World map takes ~60% of center height */}
          <div className="flex-[6] min-h-0 panel border-b border-terminal-border">
            <WorldMap />
          </div>
          {/* Price chart takes ~40% */}
          <div className="flex-[4] min-h-0 panel">
            <PriceChart />
          </div>
        </div>

        {/* Right: Threat matrix */}
        <div className="panel overflow-hidden">
          <ThreatMatrix />
        </div>
      </div>

      {/* ── Bottom: Alert ticker ───────────────────── */}
      <div className="shrink-0 h-6 border-t border-terminal-border bg-terminal-panel flex items-center overflow-hidden">
        <div className="shrink-0 px-2 border-r border-terminal-border h-full flex items-center">
          <span className="text-[7px] font-['Orbitron'] text-terminal-red font-bold tracking-wider animate-pulse">
            ● LIVE
          </span>
        </div>
        <div className="flex-1 overflow-hidden relative">
          <div className="ticker-text text-[8px] text-terminal-dim">
            {TICKER_ITEMS.join('   ·   ')}
            &nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;
            {TICKER_ITEMS.join('   ·   ')}
          </div>
        </div>
        <div className="shrink-0 px-2 border-l border-terminal-border h-full flex items-center">
          <span className="text-[7px] text-terminal-dim tabular-nums" suppressHydrationWarning>
            OIL SENTINEL v2.0
          </span>
        </div>
      </div>
    </div>
  );
}
