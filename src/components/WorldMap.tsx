// @ts-nocheck
'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from 'react-simple-maps';
import type { TankerShip, Chokepoint, ThreatEvent } from '@/lib/types';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// OPEC+ member ISO numeric codes
const OPEC_COUNTRIES = new Set([
  '682','368','364','784','414','862','434','012','566','266','178','226','634',
  '643','860','398','031','288','706','729' // Russia, Uzbekistan, Kazakhstan, Azerbaijan, Ghana, Sudan, Gabon
]);

// Color by region/status
const CHOKEPOINT_COLORS: Record<string, string> = {
  open: '#00ff88',
  disrupted: '#ffaa00',
  critical: '#ff3344',
  closed: '#ff0000',
};

interface ShipTooltip {
  ship: TankerShip;
  x: number; y: number;
}
interface ChokepointTooltip {
  cp: Chokepoint;
  x: number; y: number;
}

export default function WorldMap() {
  const [ships, setShips]           = useState<TankerShip[]>([]);
  const [chokepoints, setChokepoints] = useState<Chokepoint[]>([]);
  const [threats, setThreats]       = useState<ThreatEvent[]>([]);
  const [shipTooltip, setShipTooltip]   = useState<ShipTooltip | null>(null);
  const [cpTooltip, setCpTooltip]   = useState<ChokepointTooltip | null>(null);
  const [stats, setStats]           = useState<Record<string, number | string>>({});
  const [zoom, setZoom]             = useState(1);
  const [center, setCenter]         = useState<[number, number]>([20, 15]);
  const [pulsePhase, setPulsePhase] = useState(0);
  const animRef = useRef<number | null>(null);
  const lastFetch = useRef(0);

  const fetchData = useCallback(async () => {
    if (Date.now() - lastFetch.current < 25_000) return;
    lastFetch.current = Date.now();
    try {
      const r = await fetch('/api/ships');
      const d = await r.json();
      setShips(d.ships ?? []);
      setChokepoints(d.chokepoints ?? []);
      setThreats(d.threats ?? []);
      setStats(d.stats ?? {});
    } catch { /* keep stale */ }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);

    // Smooth pulse animation
    let frame = 0;
    const animate = () => {
      frame++;
      setPulsePhase(frame % 120);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    return () => {
      clearInterval(interval);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [fetchData]);

  const pulseScale = 1 + Math.sin((pulsePhase / 120) * Math.PI * 2) * 0.4;
  const slowPulse  = 1 + Math.sin((pulsePhase / 120) * Math.PI * 2) * 0.25;

  function shipColor(type: TankerShip['type']) {
    return type === 'VLCC' ? '#00d4ff'
         : type === 'Suezmax' ? '#00aacc'
         : type === 'Aframax' ? '#0088aa'
         : '#006688';
  }

  function handleShipEnter(ship: TankerShip, e: React.MouseEvent) {
    setShipTooltip({ ship, x: e.clientX, y: e.clientY });
    setCpTooltip(null);
  }
  function handleCpEnter(cp: Chokepoint, e: React.MouseEvent) {
    setCpTooltip({ cp, x: e.clientX, y: e.clientY });
    setShipTooltip(null);
  }

  return (
    <div className="relative w-full h-full bg-[#020c18] overflow-hidden select-none">

      {/* ── Stat bar ─────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-4 px-3 py-1.5
                      bg-terminal-panel/80 border-b border-terminal-border backdrop-blur-sm text-[9px]">
        <span className="text-terminal-dim font-['Orbitron'] tracking-widest">LIVE CRUDE INTELLIGENCE</span>
        <span className="text-terminal-blue">⬡ {stats.totalShips ?? '—'} TANKERS</span>
        <span className="text-terminal-dim">VLCC: {stats.vlccs ?? '—'}</span>
        <span className="text-terminal-dim">Suezmax: {stats.suezmax ?? '—'}</span>
        <span className="text-terminal-dim">Aframax: {stats.aframax ?? '—'}</span>
        <span className="text-terminal-amber">⚠ Hormuz: ELEVATED RISK</span>
        <span className="text-terminal-red">⚠ Red Sea: ACTIVE THREAT</span>
        <div className="ml-auto flex items-center gap-1 text-terminal-green">
          <div className="w-1.5 h-1.5 bg-terminal-green rounded-full animate-pulse" />
          AIS FEED LIVE
        </div>
      </div>

      {/* ── Map ──────────────────────────────────── */}
      <ComposableMap
        projection="geoNaturalEarth1"
        projectionConfig={{ scale: 170, center: [20, 10] }}
        style={{ width: '100%', height: '100%', background: 'transparent' }}
      >
        <ZoomableGroup
          zoom={zoom}
          center={center}
          onMoveEnd={({ zoom: z, coordinates: c }: { zoom: number; coordinates: [number, number] }) => { setZoom(z); setCenter(c); }}
        >
          {/* Ocean gradient */}
          <rect x="-5000" y="-5000" width="10000" height="10000" fill="#020e1c" />

          {/* Countries */}
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map(geo => {
                const isOpec = OPEC_COUNTRIES.has(geo.id);
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={isOpec ? '#12200e' : '#0a1825'}
                    stroke="#0d2035"
                    strokeWidth={0.4}
                    style={{
                      default: { outline: 'none' },
                      hover:   { fill: '#162d42', outline: 'none' },
                      pressed: { outline: 'none' },
                    }}
                  />
                );
              })
            }
          </Geographies>

          {/* ── Major shipping lane hints ──────── */}
          {[
            // Persian Gulf → Malacca
            [[56,26],[65,12],[80,5],[104,1],[110,15],[121,29]],
            // Suez route
            [[56,26],[43,11],[32,31],[26,34],[15,37],[0,51]],
            // Cape route
            [[56,26],[65,5],[20,-34],[0,51]],
            // W.Africa → Europe
            [[5,2],[-5,15],[-8,28],[0,51]],
            // Venezuela → US
            [[-63,10],[-80,26],[-90,29]],
            // Russia Baltic
            [[28,59],[10,57],[4,52]],
          ].map((points, li) => (
            <polyline
              key={`lane-${li}`}
              points={points.map(([lon, lat]) => {
                // Use a rough equirectangular projection approximation
                // react-simple-maps handles the actual projection via Marker
                return `${(lon + 180) * 2},${(90 - lat) * 2}`;
              }).join(' ')}
              fill="none"
              stroke="rgba(0,100,180,0.08)"
              strokeWidth={0.8}
              strokeDasharray="3,5"
            />
          ))}

          {/* ── Threat zones ──────────────────── */}
          {threats.filter(t => t.active).map(t => (
            <Marker key={t.id} coordinates={[t.lon, t.lat]}>
              {/* Outer glow ring */}
              <circle
                r={t.severity === 'high' || t.severity === 'critical' ? 14 : 10}
                fill="none"
                stroke={t.severity === 'critical' ? '#ff0022' : t.severity === 'high' ? '#ff3344' : '#ffaa00'}
                strokeWidth={0.5}
                opacity={0.3 + (pulsePhase / 120) * 0.3}
              />
              <circle
                r={(t.severity === 'high' || t.severity === 'critical' ? 14 : 10) * slowPulse}
                fill="none"
                stroke={t.severity === 'critical' ? '#ff0022' : t.severity === 'high' ? '#ff3344' : '#ffaa00'}
                strokeWidth={0.5}
                opacity={0.15}
              />
              {/* Inner fill */}
              <circle
                r={t.severity === 'high' || t.severity === 'critical' ? 5 : 3}
                fill={t.severity === 'critical' ? 'rgba(255,0,34,0.3)' : t.severity === 'high' ? 'rgba(255,51,68,0.25)' : 'rgba(255,170,0,0.2)'}
                stroke={t.severity === 'critical' ? '#ff0022' : t.severity === 'high' ? '#ff3344' : '#ffaa00'}
                strokeWidth={0.8}
              />
            </Marker>
          ))}

          {/* ── Chokepoints ───────────────────── */}
          {chokepoints.map(cp => {
            const col = CHOKEPOINT_COLORS[cp.status];
            return (
              <Marker
                key={cp.id}
                coordinates={[cp.lon, cp.lat]}
                onMouseEnter={e => handleCpEnter(cp, e as unknown as React.MouseEvent)}
                onMouseLeave={() => setCpTooltip(null)}
              >
                {/* Pulse rings */}
                <circle
                  r={10 * pulseScale}
                  fill="none"
                  stroke={col}
                  strokeWidth={0.6}
                  opacity={0.3 * (1 - pulsePhase / 120)}
                />
                <circle
                  r={7}
                  fill="none"
                  stroke={col}
                  strokeWidth={1}
                  opacity={0.6}
                />
                {/* Diamond marker */}
                <polygon
                  points="0,-5 5,0 0,5 -5,0"
                  fill={col + '33'}
                  stroke={col}
                  strokeWidth={1}
                />
                {/* Label */}
                <text
                  y={-12}
                  textAnchor="middle"
                  style={{ fontSize: '4.5px', fill: col, fontFamily: 'JetBrains Mono', fontWeight: 600 }}
                >
                  {cp.name.replace('Strait of ', '').replace(' Canal', '').toUpperCase()}
                </text>
                <text
                  y={-7.5}
                  textAnchor="middle"
                  style={{ fontSize: '3.5px', fill: col + 'aa', fontFamily: 'JetBrains Mono' }}
                >
                  {cp.throughputMbpd} Mb/d
                </text>
              </Marker>
            );
          })}

          {/* ── Tanker ships ──────────────────── */}
          {ships.map(ship => {
            const col = shipColor(ship.type);
            const rad = ship.heading * (Math.PI / 180);
            const size = ship.type === 'VLCC' ? 4 : ship.type === 'Suezmax' ? 3 : 2.5;
            // Triangle points rotated to heading
            const tip  = { x: Math.sin(rad) * size * 2,   y: -Math.cos(rad) * size * 2 };
            const left = { x: Math.sin(rad - 2.3) * size, y: -Math.cos(rad - 2.3) * size };
            const right= { x: Math.sin(rad + 2.3) * size, y: -Math.cos(rad + 2.3) * size };

            return (
              <Marker
                key={ship.id}
                coordinates={[ship.lon, ship.lat]}
                onMouseEnter={e => handleShipEnter(ship, e as unknown as React.MouseEvent)}
                onMouseLeave={() => setShipTooltip(null)}
              >
                {/* Wake trail */}
                <line
                  x1={0} y1={0}
                  x2={-tip.x * 0.8} y2={-tip.y * 0.8}
                  stroke={col}
                  strokeWidth={0.5}
                  opacity={0.25}
                />
                {/* Ship body */}
                <polygon
                  points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`}
                  fill={col}
                  opacity={0.9}
                  style={{ cursor: 'pointer' }}
                />
                {/* Glow dot */}
                <circle r={1} fill={col} opacity={0.6} />
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>

      {/* ── Zoom controls ────────────────────── */}
      <div className="absolute bottom-6 right-3 flex flex-col gap-1 z-10">
        {[
          { label: '+', action: () => setZoom(z => Math.min(z * 1.5, 8)) },
          { label: '−', action: () => setZoom(z => Math.max(z / 1.5, 1)) },
          { label: '⌂', action: () => { setZoom(1); setCenter([20, 15]); } },
        ].map(btn => (
          <button
            key={btn.label}
            onClick={btn.action}
            className="w-6 h-6 flex items-center justify-center text-terminal-blue border border-terminal-border
                       bg-terminal-panel hover:bg-terminal-muted text-[11px] font-bold transition-colors rounded-sm"
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* ── Legend ───────────────────────────── */}
      <div className="absolute bottom-2 left-2 z-10 bg-terminal-panel/80 border border-terminal-border
                      rounded px-2 py-1.5 text-[8px] backdrop-blur-sm space-y-0.5">
        <div className="text-terminal-dim font-['Orbitron'] tracking-wider mb-1">LEGEND</div>
        {[
          { color: '#00d4ff', label: 'VLCC  (>200k DWT)' },
          { color: '#00aacc', label: 'Suezmax (120-200k)' },
          { color: '#0088aa', label: 'Aframax (<120k)' },
          { color: '#12200e', label: 'OPEC+ Member', bg: true },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-sm border"
              style={{
                background: l.bg ? l.color : 'transparent',
                borderColor: l.color,
                ...(l.bg ? {} : { background: l.color }),
              }}
            />
            <span className="text-terminal-text">{l.label}</span>
          </div>
        ))}
        <div className="border-t border-terminal-border pt-0.5 mt-0.5">
          {[
            { color: '#00ff88', label: 'Chokepoint — Open' },
            { color: '#ffaa00', label: 'Chokepoint — Disrupted' },
            { color: '#ff3344', label: 'Threat Zone — Active' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full border" style={{ borderColor: l.color }} />
              <span className="text-terminal-text">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Ship tooltip ─────────────────────── */}
      {shipTooltip && (
        <div
          className="fixed z-50 pointer-events-none panel rounded text-[9px] p-2 min-w-[180px] shadow-glow-blue"
          style={{ left: shipTooltip.x + 12, top: shipTooltip.y - 20 }}
        >
          <div className="text-terminal-blue font-bold text-[10px] mb-1">{shipTooltip.ship.name}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-terminal-text">
            <span className="text-terminal-dim">Type</span><span>{shipTooltip.ship.type}</span>
            <span className="text-terminal-dim">Flag</span><span>{shipTooltip.ship.flag}</span>
            <span className="text-terminal-dim">DWT</span><span>{(shipTooltip.ship.dwt / 1000).toFixed(0)}k t</span>
            <span className="text-terminal-dim">Speed</span><span>{shipTooltip.ship.speed} kn</span>
            <span className="text-terminal-dim">Cargo</span><span className="col-span-1 truncate">{shipTooltip.ship.cargo}</span>
            <span className="text-terminal-dim">From</span><span className="col-span-1 truncate">{shipTooltip.ship.origin}</span>
            <span className="text-terminal-dim">To</span><span className="col-span-1 truncate">{shipTooltip.ship.destination}</span>
            <span className="text-terminal-dim">ETA</span><span className="text-terminal-amber">{shipTooltip.ship.eta}</span>
          </div>
          <div className="mt-1.5">
            <div className="text-terminal-dim text-[8px] mb-0.5">ROUTE PROGRESS</div>
            <div className="progress-bar">
              <div className="progress-fill bg-terminal-blue" style={{ width: `${shipTooltip.ship.routeProgress * 100}%` }} />
            </div>
            <div className="text-terminal-blue text-[8px] mt-0.5">{(shipTooltip.ship.routeProgress * 100).toFixed(0)}% complete</div>
          </div>
        </div>
      )}

      {/* ── Chokepoint tooltip ───────────────── */}
      {cpTooltip && (
        <div
          className="fixed z-50 pointer-events-none panel rounded text-[9px] p-2 min-w-[200px]"
          style={{
            left: cpTooltip.x + 12, top: cpTooltip.y - 20,
            borderColor: CHOKEPOINT_COLORS[cpTooltip.cp.status],
            boxShadow: `0 0 20px ${CHOKEPOINT_COLORS[cpTooltip.cp.status]}33`,
          }}
        >
          <div className="font-bold text-[10px] mb-1" style={{ color: CHOKEPOINT_COLORS[cpTooltip.cp.status] }}>
            {cpTooltip.cp.name}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-terminal-text">
            <span className="text-terminal-dim">Status</span>
            <span className="uppercase font-bold" style={{ color: CHOKEPOINT_COLORS[cpTooltip.cp.status] }}>
              {cpTooltip.cp.status}
            </span>
            <span className="text-terminal-dim">Flow</span>
            <span>{cpTooltip.cp.throughputMbpd} Mb/d</span>
            <span className="text-terminal-dim">Risk</span>
            <span className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={i < cpTooltip.cp.riskLevel ? 'text-terminal-red' : 'text-terminal-border'}>█</span>
              ))}
            </span>
          </div>
          <div className="text-terminal-dim mt-1.5 text-[8px] leading-tight">{cpTooltip.cp.description}</div>
        </div>
      )}
    </div>
  );
}
