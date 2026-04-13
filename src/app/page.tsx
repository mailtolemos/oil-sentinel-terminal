import type { CommodityPrice } from '@/lib/types';
import PriceStrip from '@/components/PriceStrip';
import NewsFeed from '@/components/NewsFeed';
import WorldMap from '@/components/WorldMap';
import PriceChart from '@/components/PriceChart';
import ThreatMatrix from '@/components/ThreatMatrix';
import MobileTerminal from '@/components/MobileTerminal';

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
  '🇮🇷 IRAN: Nuclear programme status under international scrutiny',
  '🚀 MIDDLE EAST: Regional conflict escalation risk elevated',
];

const TICKER_STRING = TICKER_ITEMS.join('     ·     ');

export default async function TerminalPage() {
  const initialPrices = await getInitialPrices();

  return (
    <>
      {/* ── Mobile layout (< md) ─────────────────────────────── */}
      <div className="md:hidden">
        <MobileTerminal initialPrices={initialPrices} />
      </div>

      {/* ── Desktop layout (≥ md) ────────────────────────────── */}
      <div className="hidden md:flex flex-col h-screen overflow-hidden bg-terminal-bg transition-colors duration-300">

        {/* ── Top bar: Price strip ───────────────────────── */}
        <div className="shrink-0 h-[60px] border-b border-terminal-border">
          <PriceStrip initialPrices={initialPrices} />
        </div>

        {/* ── Main body: 3-column grid ───────────────────── */}
        <div className="flex-1 min-h-0 grid grid-cols-[300px_1fr_300px] overflow-hidden">

          {/* Left: News feed */}
          <div className="panel border-r border-terminal-border overflow-hidden flex flex-col">
            <NewsFeed />
          </div>

          {/* Center: World map + chart stacked */}
          <div className="flex flex-col overflow-hidden border-r border-terminal-border">
            <div className="flex-[62] min-h-0 panel border-b border-terminal-border">
              <WorldMap />
            </div>
            <div className="flex-[38] min-h-0 panel">
              <PriceChart />
            </div>
          </div>

          {/* Right: Threat matrix */}
          <div className="panel overflow-hidden flex flex-col">
            <ThreatMatrix />
          </div>
        </div>

        {/* ── Bottom: Alert ticker ───────────────────────── */}
        <div className="shrink-0 h-7 border-t border-terminal-border bg-terminal-surface flex items-center overflow-hidden">
          <div className="shrink-0 px-3 border-r border-terminal-border h-full flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-terminal-red animate-pulse" />
            <span className="text-[9px] font-['Orbitron'] text-terminal-red font-bold tracking-wider">LIVE</span>
          </div>
          <div className="flex-1 overflow-hidden relative">
            <div className="ticker-text text-[10px] text-terminal-text font-medium">
              {TICKER_STRING}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{TICKER_STRING}
            </div>
          </div>
          <div className="shrink-0 px-3 border-l border-terminal-border h-full flex items-center">
            <span className="text-[9px] text-terminal-dim font-['Orbitron'] tracking-wider">OIL SENTINEL v2.1</span>
          </div>
        </div>
      </div>
    </>
  );
}
