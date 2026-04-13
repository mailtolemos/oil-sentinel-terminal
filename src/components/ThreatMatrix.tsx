'use client';
import { useEffect, useState } from 'react';
import type { Chokepoint, ThreatEvent } from '@/lib/types';

const STATUS_COLORS = {
  open:       { text: 'text-terminal-green',  dot: 'bg-terminal-green',  label: 'OPEN' },
  disrupted:  { text: 'text-terminal-amber',  dot: 'bg-terminal-amber',  label: 'DISRUPTED' },
  critical:   { text: 'text-terminal-red',    dot: 'bg-terminal-red',    label: 'CRITICAL' },
  closed:     { text: 'text-terminal-red',    dot: 'bg-terminal-red',    label: 'CLOSED' },
};

const SEVERITY_RISK: Record<string, number> = {
  low: 2, medium: 5, high: 8, critical: 10,
};

interface ShipsData {
  chokepoints: Chokepoint[];
  threats: ThreatEvent[];
  stats: {
    totalShips: number;
    vlccs: number;
    suezmax: number;
    aframax: number;
    totalDwtMillion: number;
  };
}

interface MarketMetrics {
  brtWtiSpread: number;
  opecSpareCapacity: number;
  sentimentIndex: number;
  volatilityIndex: number;
  inventoryTrend: string;
  crackSpread: number;
}

export default function ThreatMatrix() {
  const [data, setData] = useState<ShipsData | null>(null);
  const [metrics, setMetrics] = useState<MarketMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [shipsRes, pricesRes] = await Promise.all([
        fetch('/api/ships'),
        fetch('/api/prices'),
      ]);
      const ships: ShipsData = await shipsRes.json();
      const prices = await pricesRes.json();
      setData(ships);

      const brt = prices.prices?.find((p: any) => p.symbol === 'BRT');
      const wti = prices.prices?.find((p: any) => p.symbol === 'WTI');
      if (brt && wti) {
        setMetrics({
          brtWtiSpread: +(brt.price - wti.price).toFixed(2),
          opecSpareCapacity: 3.2,
          sentimentIndex: 48,
          volatilityIndex: 24.3,
          inventoryTrend: 'draw',
          crackSpread: 18.4,
        });
      }
    } catch { /* keep stale */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 60_000);
    return () => clearInterval(iv);
  }, []);

  const chokepoints = data?.chokepoints ?? [];
  const threats = data?.threats.filter(t => t.active) ?? [];
  const disruptedCount = chokepoints.filter(c => c.status !== 'open').length;
  const avgSeverity = threats.length
    ? threats.reduce((a, t) => a + (SEVERITY_RISK[t.severity] ?? 3), 0) / threats.length
    : 0;

  const sortedThreats = [...threats].sort((a, b) =>
    (SEVERITY_RISK[b.severity] ?? 0) - (SEVERITY_RISK[a.severity] ?? 0)
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="section-header shrink-0">
        <div className="dot" />
        <span>THREAT MATRIX</span>
        {disruptedCount > 0 && (
          <span className="ml-auto text-terminal-red text-[8px] animate-pulse">
            {disruptedCount} DISRUPTED
          </span>
        )}
      </div>

      <div className={`flex-1 overflow-y-auto ${loading ? 'hidden' : ''}`}>
        {/* Chokepoints */}
        <div className="px-2 pt-2 pb-1">
          <div className="text-[7px] text-terminal-dim uppercase tracking-wider mb-1.5">
            Chokepoints
          </div>
          <div className="grid grid-cols-2 gap-1">
            {chokepoints.map(cp => {
              const sc = STATUS_COLORS[cp.status];
              return (
                <div key={cp.id} className="panel px-2 py-1.5 flex items-start gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-0.5 ${sc.dot} ${cp.status !== 'open' ? 'animate-pulse' : ''}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-terminal-text text-[8px] truncate font-bold leading-tight">
                      {cp.name.split(' ')[0] === 'Strait' ? cp.name.split(' ').slice(0, 3).join(' ') : cp.name.split(',')[0].substring(0, 16)}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className={`text-[7px] ${sc.text}`}>{sc.label}</span>
                      <span className="text-terminal-dim text-[6px]">·</span>
                      <span className="text-terminal-dim text-[6px]">{cp.throughputMbpd}Mb/d</span>
                    </div>
                  </div>
                  <div className={`text-[9px] font-bold shrink-0 ${
                    cp.riskLevel >= 4 ? 'text-terminal-red' :
                    cp.riskLevel >= 3 ? 'text-terminal-amber' : 'text-terminal-green'
                  }`}>
                    {cp.riskLevel}/5
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Threats */}
        <div className="px-2 pt-1 pb-1">
          <div className="text-[7px] text-terminal-dim uppercase tracking-wider mb-1.5">
            Active Threats
          </div>
          <div className="flex flex-col gap-1">
            {sortedThreats.map(t => {
              const risk = SEVERITY_RISK[t.severity] ?? 3;
              return (
                <div key={t.id} className="panel px-2 py-1.5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="flex gap-0.5 shrink-0">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-1.5 h-1.5 rounded-sm ${
                            i < Math.ceil(risk / 2)
                              ? risk >= 8 ? 'bg-terminal-red'
                              : risk >= 5 ? 'bg-terminal-amber'
                              : 'bg-terminal-green'
                              : 'bg-terminal-muted'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[8px] text-terminal-bright font-bold truncate flex-1">{t.region}</span>
                    <span className={`text-[6px] shrink-0 px-1 py-0.5 rounded border uppercase ${
                      t.severity === 'critical' ? 'text-terminal-red border-terminal-red/30 bg-terminal-red/10' :
                      t.severity === 'high' ? 'text-terminal-amber border-terminal-amber/30 bg-terminal-amber/10' :
                      'text-terminal-dim border-terminal-border'
                    }`}>
                      {t.severity}
                    </span>
                  </div>
                  <div className="text-terminal-dim text-[7px] leading-relaxed">{t.impact}</div>
                  {t.priceImpact && (
                    <div className="text-terminal-amber text-[7px] mt-0.5 font-bold">{t.priceImpact}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Market Metrics */}
        {metrics && (
          <div className="px-2 pt-1 pb-2">
            <div className="text-[7px] text-terminal-dim uppercase tracking-wider mb-1.5">
              Market Metrics
            </div>
            <div className="grid grid-cols-2 gap-1">
              <MetricTile
                label="BRT-WTI Spread"
                value={`$${metrics.brtWtiSpread}`}
                sub="$/bbl"
              />
              <MetricTile
                label="OPEC Spare Cap"
                value={`${metrics.opecSpareCapacity}`}
                sub="mb/d"
              />
              <MetricTile
                label="Sentiment Index"
                value={`${metrics.sentimentIndex}`}
                sub={metrics.sentimentIndex > 50 ? '▲ BULLISH' : '▼ BEARISH'}
                color={metrics.sentimentIndex > 50 ? 'text-terminal-green' : 'text-terminal-red'}
              />
              <MetricTile
                label="Inventory Trend"
                value={metrics.inventoryTrend.toUpperCase()}
                sub="weekly EIA"
                color={metrics.inventoryTrend === 'draw' ? 'text-terminal-green' : 'text-terminal-red'}
              />
              <MetricTile
                label="Volatility (OVX)"
                value={metrics.volatilityIndex.toFixed(1)}
                sub="index"
              />
              <MetricTile
                label="Crack Spread"
                value={`$${metrics.crackSpread.toFixed(1)}`}
                sub="3-2-1 $/bbl"
              />
            </div>
          </div>
        )}

        {/* Fleet summary */}
        {data && (
          <div className="px-2 pb-2">
            <div className="text-[7px] text-terminal-dim uppercase tracking-wider mb-1.5">
              Fleet Status
            </div>
            <div className="panel px-2 py-2 grid grid-cols-2 gap-2">
              <div className="text-center">
                <div className="text-terminal-blue text-[18px] font-bold glow-blue leading-none">
                  {data.stats.totalShips}
                </div>
                <div className="text-terminal-dim text-[7px] mt-0.5">TANKERS TRACKED</div>
              </div>
              <div className="text-center">
                <div className="text-terminal-amber text-[18px] font-bold leading-none">
                  {data.stats.vlccs}
                </div>
                <div className="text-terminal-dim text-[7px] mt-0.5">VLCCs ACTIVE</div>
              </div>
              <div className="text-center">
                <div className={`text-[18px] font-bold leading-none ${disruptedCount > 0 ? 'text-terminal-red glow-red' : 'text-terminal-green'}`}>
                  {disruptedCount}
                </div>
                <div className="text-terminal-dim text-[7px] mt-0.5">DISRUPTED ROUTES</div>
              </div>
              <div className="text-center">
                <div className={`text-[18px] font-bold leading-none ${
                  avgSeverity >= 7 ? 'text-terminal-red' :
                  avgSeverity >= 4 ? 'text-terminal-amber' :
                  'text-terminal-green'
                }`}>
                  {avgSeverity.toFixed(1)}
                </div>
                <div className="text-terminal-dim text-[7px] mt-0.5">AVG RISK SCORE</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="flex-1 flex flex-col gap-2 p-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="animate-pulse space-y-1">
              <div className="h-2 bg-terminal-muted rounded w-3/4" />
              <div className="h-1.5 bg-terminal-muted/50 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricTile({
  label, value, sub, color = 'text-terminal-bright',
}: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="panel px-2 py-1.5">
      <div className="text-terminal-dim text-[6px] uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-[11px] font-bold leading-none ${color}`}>{value}</div>
      {sub && <div className="text-terminal-dim text-[6px] mt-0.5">{sub}</div>}
    </div>
  );
}
