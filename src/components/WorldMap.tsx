// @ts-nocheck
'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
  Line,
} from 'react-simple-maps';
import type { TankerShip, Chokepoint, ThreatEvent } from '@/lib/types';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// OPEC+ ISO numeric codes
const OPEC_COUNTRIES = new Set([
  '682','368','364','784','414','862','434','012','566','266','178','226','634',
  '643','860','398','031','288','706','729'
]);

// Country production data for click panel
const COUNTRY_DATA: Record<string, { production: string; reserves: string; grade: string; note: string }> = {
  '682': { production: '12.0 Mb/d', reserves: '267 Gb', grade: 'Arab Light / Arab Heavy', note: 'Largest OPEC producer. Aramco capacity 12.5 Mb/d.' },
  '368': { production: '4.4 Mb/d', reserves: '145 Gb', grade: 'Basra Light / Basra Heavy', note: 'Southern Basra fields main export hub.' },
  '364': { production: '3.2 Mb/d', reserves: '208 Gb', grade: 'Iranian Heavy / Iranian Light', note: 'Under US sanctions. Selling via grey market to China.' },
  '784': { production: '3.8 Mb/d', reserves: '97 Gb', grade: 'Murban / Upper Zakum', note: 'ADNOC expanding capacity to 5 Mb/d by 2027.' },
  '414': { production: '2.7 Mb/d', reserves: '102 Gb', grade: 'Kuwait Export Crude', note: 'Al-Ahmadi is one of world\'s largest export terminals.' },
  '862': { production: '0.7 Mb/d', reserves: '303 Gb', grade: 'Merey / Hamaca (heavy)', note: 'Largest proven reserves globally. US sanctions limit output.' },
  '643': { production: '10.1 Mb/d', reserves: '80 Gb', grade: 'Urals / ESPO / Siberian Light', note: 'G7 price cap at $60/bbl. Shadow fleet routing to Asia.' },
  '566': { production: '1.3 Mb/d', reserves: '37 Gb', grade: 'Bonny Light / Forcados', note: 'Niger Delta security incidents reduce output.' },
  '012': { production: '1.1 Mb/d', reserves: '12 Gb', grade: 'Saharan Blend', note: 'Hassi Messaoud primary field. Mature basin.' },
  '434': { production: '1.2 Mb/d', reserves: '48 Gb', grade: 'Es Sider / Sharara', note: 'Civil instability causes frequent field shutdowns.' },
  '288': { production: '0.17 Mb/d', reserves: '0.66 Gb', grade: 'Jubilee / TEN fields', note: 'Offshore Jubilee and TEN fields. Growing producer.' },
};

const CHOKEPOINT_COLORS: Record<string, string> = {
  open: '#00ff88',
  disrupted: '#ffaa00',
  critical: '#ff5522',
  closed: '#ff0000',
};

// Shipping lane routes for Line rendering
const LANE_ROUTES: [number, number][][] = [
  // PG → Malacca → China
  [[56.5,26],[58,22],[65,12],[75,6],[90,2.5],[104.5,1.3],[107,4.5],[110,12],[118,22.5],[121.5,29]],
  // PG → Suez → Europe
  [[56.5,26],[50,17.5],[43.5,11.2],[38,21],[32.5,31],[26,34.5],[14,38],[3,40],[0.5,51.5]],
  // PG → Cape → Europe
  [[56.5,26],[65,10],[60,-10],[35,-30],[18.5,-34],[0,-22],[-8,0],[-5,32],[-3,42],[0.5,51.5]],
  // W.Africa → Europe
  [[4.5,2],[-6,20],[-10,36],[-2,51],[1.5,51.5]],
  // W.Africa → US
  [[4.5,2],[-20,12],[-50,20],[-80,27],[-90,29.5]],
  // Venezuela → US
  [[-63.5,10.5],[-74,20],[-82,26],[-90,29.5]],
  // Russia Baltic → Europe
  [[28.5,59.5],[14,57.5],[4,51.5]],
  // US Gulf → Europe
  [[-90,29],[-76,30],[-64,40],[-32,47],[0.5,51.5]],
];

type DetailType = 'ship' | 'chokepoint' | 'country';
interface DetailPanel {
  type: DetailType;
  data: TankerShip | Chokepoint | { name: string; id: string };
}

export default function WorldMap() {
  const [ships, setShips]           = useState<TankerShip[]>([]);
  const [chokepoints, setChokepoints] = useState<Chokepoint[]>([]);
  const [threats, setThreats]       = useState<ThreatEvent[]>([]);
  const [stats, setStats]           = useState<Record<string, number | string>>({});
  const [zoom, setZoom]             = useState(1);
  const [center, setCenter]         = useState<[number, number]>([20, 15]);
  const [pulsePhase, setPulsePhase] = useState(0);
  const [hoverShip, setHoverShip]   = useState<{ ship: TankerShip; x: number; y: number } | null>(null);
  const [hoverCp, setHoverCp]       = useState<{ cp: Chokepoint; x: number; y: number } | null>(null);
  const [detail, setDetail]         = useState<DetailPanel | null>(null);
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
         : type === 'Suezmax' ? '#22ccee'
         : type === 'Aframax' ? '#44aacc'
         : '#2299bb';
  }

  function handleShipClick(ship: TankerShip) {
    setDetail(detail?.type === 'ship' && (detail.data as TankerShip).id === ship.id
      ? null
      : { type: 'ship', data: ship });
  }

  function handleCpClick(cp: Chokepoint) {
    setDetail(detail?.type === 'chokepoint' && (detail.data as Chokepoint).id === cp.id
      ? null
      : { type: 'chokepoint', data: cp });
  }

  function handleCountryClick(geoId: string, name: string) {
    if (!COUNTRY_DATA[geoId]) return;
    setDetail(detail?.type === 'country' && (detail.data as { id: string }).id === geoId
      ? null
      : { type: 'country', data: { name, id: geoId } });
  }

  return (
    <div className="relative w-full h-full bg-[#020c18] overflow-hidden select-none">

      {/* ── Stat bar ─────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-4 px-3 py-1.5
                      bg-[#020c18]/90 border-b border-[#112840] backdrop-blur-sm">
        <span className="font-['Orbitron'] text-[8px] tracking-widest text-[#5a8aaa]">LIVE CRUDE INTELLIGENCE</span>
        <span className="text-[#00d4ff] text-[9px]">⬡ {stats.totalShips ?? '—'} TANKERS</span>
        <span className="text-[#5a8aaa] text-[9px]">VLCC: {stats.vlccs ?? '—'}</span>
        <span className="text-[#5a8aaa] text-[9px]">Suezmax: {stats.suezmax ?? '—'}</span>
        <span className="text-[#5a8aaa] text-[9px]">Aframax: {stats.aframax ?? '—'}</span>
        <span className="text-[#ffaa00] text-[9px]">⚠ Hormuz ELEVATED</span>
        <span className="text-[#ff3344] text-[9px]">⚠ Red Sea ACTIVE</span>
        <div className="ml-auto flex items-center gap-1.5 text-[#00ff88] text-[9px]">
          <div className="w-1.5 h-1.5 bg-[#00ff88] rounded-full animate-pulse" />
          AIS LIVE
        </div>
      </div>

      {/* ── Map ──────────────────────────────────── */}
      <ComposableMap
        projection="geoNaturalEarth1"
        projectionConfig={{ scale: 170, center: [20, 10] }}
        style={{ width: '100%', height: '100%', background: 'transparent' }}
        onClick={() => setDetail(null)}
      >
        <ZoomableGroup
          zoom={zoom}
          center={center}
          onMoveEnd={({ zoom: z, coordinates: c }: { zoom: number; coordinates: [number, number] }) => {
            setZoom(z);
            setCenter(c);
          }}
        >
          {/* Ocean base */}
          <rect x="-5000" y="-5000" width="10000" height="10000" fill="#020e1c" />

          {/* Shipping lanes */}
          {LANE_ROUTES.map((route, ri) =>
            route.slice(0, -1).map((pt, si) => (
              <Line
                key={`lane-${ri}-${si}`}
                from={pt}
                to={route[si + 1]}
                stroke="rgba(0,140,200,0.12)"
                strokeWidth={0.7}
                strokeDasharray="4,7"
              />
            ))
          )}

          {/* Countries */}
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map(geo => {
                const isOpec = OPEC_COUNTRIES.has(geo.id);
                const isSelected = detail?.type === 'country' && (detail.data as { id: string }).id === geo.id;
                const hasData = !!COUNTRY_DATA[geo.id];
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={isSelected ? '#1d4a6e' : isOpec ? '#0d2a14' : '#091520'}
                    stroke={isSelected ? '#00d4ff' : isOpec ? '#1a4020' : '#0d2035'}
                    strokeWidth={isSelected ? 0.8 : 0.4}
                    onClick={(e) => { e.stopPropagation(); handleCountryClick(geo.id, geo.properties.name); }}
                    style={{
                      default: { outline: 'none', cursor: hasData ? 'pointer' : 'default' },
                      hover:   { fill: hasData ? '#1a3d5c' : (isOpec ? '#112518' : '#0d2030'), outline: 'none' },
                      pressed: { outline: 'none' },
                    }}
                  />
                );
              })
            }
          </Geographies>

          {/* ── Threat zones ──────────────────── */}
          {threats.filter(t => t.active).map(t => {
            const col = t.severity === 'critical' ? '#ff0022'
                      : t.severity === 'high' ? '#ff3344'
                      : '#ffaa00';
            const r = t.severity === 'critical' ? 14 : t.severity === 'high' ? 12 : 9;
            return (
              <Marker key={t.id} coordinates={[t.lon, t.lat]}>
                <circle r={r * slowPulse} fill="none" stroke={col} strokeWidth={0.5} opacity={0.2} />
                <circle r={r} fill="none" stroke={col} strokeWidth={0.7} opacity={0.4 + (pulsePhase / 120) * 0.3} />
                <circle r={t.severity === 'critical' ? 4 : 3}
                  fill={col + '44'} stroke={col} strokeWidth={0.8} />
              </Marker>
            );
          })}

          {/* ── Chokepoints ───────────────────── */}
          {chokepoints.map(cp => {
            const col = CHOKEPOINT_COLORS[cp.status] ?? '#00ff88';
            const isSelected = detail?.type === 'chokepoint' && (detail.data as Chokepoint).id === cp.id;
            return (
              <Marker
                key={cp.id}
                coordinates={[cp.lon, cp.lat]}
                onMouseEnter={(e) => setHoverCp({ cp, x: (e as unknown as MouseEvent).clientX, y: (e as unknown as MouseEvent).clientY })}
                onMouseLeave={() => setHoverCp(null)}
                onClick={(e) => { (e as unknown as Event).stopPropagation(); handleCpClick(cp); }}
              >
                {/* Outer pulse ring */}
                <circle
                  r={isSelected ? 14 : 10 * pulseScale}
                  fill="none"
                  stroke={col}
                  strokeWidth={isSelected ? 1.5 : 0.7}
                  opacity={isSelected ? 0.8 : 0.3 * (1 - pulsePhase / 120)}
                />
                {/* Middle ring */}
                <circle r={7} fill="none" stroke={col} strokeWidth={1.2} opacity={0.7} />
                {/* Diamond */}
                <polygon
                  points="0,-6 6,0 0,6 -6,0"
                  fill={isSelected ? col + '55' : col + '22'}
                  stroke={col}
                  strokeWidth={1.2}
                  style={{ cursor: 'pointer' }}
                />
                {/* Label */}
                <text y={-13} textAnchor="middle"
                  style={{ fontSize: '5.5px', fill: col, fontFamily: 'JetBrains Mono', fontWeight: 700, letterSpacing: '0.5px' }}>
                  {cp.name.replace('Strait of ', '').replace(' Canal', '').replace('Turkish Straits (', '').replace(')', '').toUpperCase()}
                </text>
                <text y={-7} textAnchor="middle"
                  style={{ fontSize: '4.5px', fill: col + 'cc', fontFamily: 'JetBrains Mono' }}>
                  {cp.throughputMbpd} Mb/d
                </text>
              </Marker>
            );
          })}

          {/* ── Tanker ships ──────────────────── */}
          {ships.map(ship => {
            const col = shipColor(ship.type);
            const rad = ship.heading * (Math.PI / 180);
            const size = ship.type === 'VLCC' ? 4.5 : ship.type === 'Suezmax' ? 3.5 : 3;
            const tip   = { x: Math.sin(rad) * size * 2,   y: -Math.cos(rad) * size * 2 };
            const left  = { x: Math.sin(rad - 2.3) * size, y: -Math.cos(rad - 2.3) * size };
            const right = { x: Math.sin(rad + 2.3) * size, y: -Math.cos(rad + 2.3) * size };
            const isSelected = detail?.type === 'ship' && (detail.data as TankerShip).id === ship.id;

            return (
              <Marker
                key={ship.id}
                coordinates={[ship.lon, ship.lat]}
                onMouseEnter={(e) => setHoverShip({ ship, x: (e as unknown as MouseEvent).clientX, y: (e as unknown as MouseEvent).clientY })}
                onMouseLeave={() => setHoverShip(null)}
                onClick={(e) => { (e as unknown as Event).stopPropagation(); handleShipClick(ship); }}
              >
                {/* Selected ring */}
                {isSelected && <circle r={8} fill="none" stroke={col} strokeWidth={1} opacity={0.8} />}
                {/* Wake */}
                <line x1={0} y1={0} x2={-tip.x * 0.9} y2={-tip.y * 0.9}
                  stroke={col} strokeWidth={0.6} opacity={0.3} />
                {/* Hull */}
                <polygon
                  points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`}
                  fill={col}
                  opacity={isSelected ? 1 : 0.88}
                  style={{ cursor: 'pointer' }}
                />
                {/* Center dot */}
                <circle r={1.2} fill={col} opacity={0.7} />
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>

      {/* ── Zoom controls ────────────────────────── */}
      <div className="absolute bottom-[calc(var(--panel-height,0px)+12px)] right-3 flex flex-col gap-1 z-20"
           style={{ bottom: detail ? '230px' : '12px', transition: 'bottom 0.25s ease' }}>
        {[
          { label: '+', action: () => setZoom(z => Math.min(z * 1.6, 10)) },
          { label: '−', action: () => setZoom(z => Math.max(z / 1.6, 1)) },
          { label: '⌂', action: () => { setZoom(1); setCenter([20, 15]); setDetail(null); } },
        ].map(btn => (
          <button
            key={btn.label}
            onClick={btn.action}
            className="w-7 h-7 flex items-center justify-center text-[#00d4ff] border border-[#112840]
                       bg-[#060e1c] hover:bg-[#0d2238] hover:border-[#00d4ff]/50 text-[13px] font-bold
                       transition-all rounded-sm shadow-lg"
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* ── Legend ───────────────────────────────── */}
      <div className="absolute bottom-2 left-2 z-20 bg-[#060e1c]/90 border border-[#112840]
                      px-2 py-1.5 text-[8px] backdrop-blur-sm space-y-0.5"
           style={{ bottom: detail ? '218px' : '8px', transition: 'bottom 0.25s ease' }}>
        <div className="text-[#5a8aaa] font-['Orbitron'] text-[7px] tracking-wider mb-1">LEGEND</div>
        {[
          { color: '#00d4ff', label: 'VLCC  (>200k DWT)' },
          { color: '#22ccee', label: 'Suezmax (120-200k)' },
          { color: '#44aacc', label: 'Aframax (<120k)' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ background: l.color }} />
            <span style={{ color: '#a8cce0' }}>{l.label}</span>
          </div>
        ))}
        <div className="border-t border-[#112840] pt-0.5 mt-0.5">
          {[
            { color: '#00ff88', label: 'Chokepoint Open' },
            { color: '#ffaa00', label: 'Chokepoint Disrupted' },
            { color: '#ff3344', label: 'Threat Zone Active' },
            { color: '#0d2a14', label: 'OPEC+ Member', fill: true },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              {l.fill
                ? <div className="w-2 h-2 border rounded-sm" style={{ background: l.color, borderColor: l.color + '88' }} />
                : <div className="w-2 h-2 rounded-full border" style={{ borderColor: l.color }} />
              }
              <span style={{ color: '#a8cce0' }}>{l.label}</span>
            </div>
          ))}
        </div>
        <div className="text-[#5a8aaa] text-[7px] mt-1 pt-0.5 border-t border-[#112840]">
          Click country / ship / chokepoint for details
        </div>
      </div>

      {/* ── Hover: Ship tooltip ───────────────────── */}
      {hoverShip && !detail && (
        <div
          className="fixed z-50 pointer-events-none terminal-tooltip p-2 min-w-[160px]"
          style={{ left: hoverShip.x + 14, top: hoverShip.y - 10 }}
        >
          <div className="text-[#00d4ff] font-bold text-[10px] mb-0.5">{hoverShip.ship.name}</div>
          <div className="text-[#a8cce0] text-[9px]">{hoverShip.ship.type} · {hoverShip.ship.flag}</div>
          <div className="text-[#5a8aaa] text-[8px] mt-0.5">{hoverShip.ship.cargo}</div>
          <div className="text-[#5a8aaa] text-[8px]">{hoverShip.ship.origin} → {hoverShip.ship.destination}</div>
          <div className="text-[#e2f4ff] text-[8px] mt-0.5">Click for full details</div>
        </div>
      )}

      {/* ── Hover: Chokepoint tooltip ─────────────── */}
      {hoverCp && !detail && (
        <div
          className="fixed z-50 pointer-events-none terminal-tooltip p-2 min-w-[160px]"
          style={{
            left: hoverCp.x + 14, top: hoverCp.y - 10,
            borderColor: CHOKEPOINT_COLORS[hoverCp.cp.status] + '88',
          }}
        >
          <div className="font-bold text-[10px] mb-0.5" style={{ color: CHOKEPOINT_COLORS[hoverCp.cp.status] }}>
            {hoverCp.cp.name}
          </div>
          <div className="text-[#a8cce0] text-[9px] uppercase">{hoverCp.cp.status} · {hoverCp.cp.throughputMbpd} Mb/d</div>
          <div className="text-[#e2f4ff] text-[8px] mt-0.5">Click for full details</div>
        </div>
      )}

      {/* ── Detail panel (slide-up) ───────────────── */}
      {detail && (
        <div className="absolute bottom-0 left-0 right-0 z-30 map-detail-panel">
          {/* ── SHIP PANEL ── */}
          {detail.type === 'ship' && (() => {
            const s = detail.data as TankerShip;
            return (
              <div className="p-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[#00d4ff] font-bold text-[13px]">{s.name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] rounded">{s.type}</span>
                      <span className="text-[12px]">{s.flag}</span>
                    </div>
                    <div className="text-[#5a8aaa] text-[9px] mt-0.5">{s.cargo}</div>
                  </div>
                  <button onClick={() => setDetail(null)} className="close-btn">✕</button>
                </div>
                <div className="data-grid text-[9px] mb-2">
                  <div className="data-cell">
                    <div className="data-cell-label">DWT</div>
                    <div className="data-cell-value">{(s.dwt / 1000).toFixed(0)}k t</div>
                  </div>
                  <div className="data-cell">
                    <div className="data-cell-label">Speed</div>
                    <div className="data-cell-value">{s.speed} kn</div>
                  </div>
                  <div className="data-cell">
                    <div className="data-cell-label">Origin</div>
                    <div className="data-cell-value text-[10px] font-normal text-[#a8cce0]">{s.origin}</div>
                  </div>
                  <div className="data-cell">
                    <div className="data-cell-label">Destination</div>
                    <div className="data-cell-value text-[10px] font-normal text-[#a8cce0]">{s.destination}</div>
                  </div>
                  <div className="data-cell">
                    <div className="data-cell-label">ETA</div>
                    <div className="data-cell-value text-[#ffaa00]">{s.eta}</div>
                  </div>
                  <div className="data-cell">
                    <div className="data-cell-label">Status</div>
                    <div className="data-cell-value text-[#00ff88] text-[11px]">UNDERWAY</div>
                  </div>
                </div>
                <div>
                  <div className="text-[#5a8aaa] text-[8px] mb-1 uppercase tracking-wider">Route Progress</div>
                  <div className="risk-bar">
                    <div className="risk-fill bg-[#00d4ff]" style={{ width: `${(s.routeProgress * 100).toFixed(0)}%` }} />
                  </div>
                  <div className="flex justify-between text-[8px] mt-0.5">
                    <span className="text-[#5a8aaa]">{s.origin.split(',')[0]}</span>
                    <span className="text-[#00d4ff] font-bold">{(s.routeProgress * 100).toFixed(0)}% complete</span>
                    <span className="text-[#5a8aaa]">{s.destination.split(',')[0]}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── CHOKEPOINT PANEL ── */}
          {detail.type === 'chokepoint' && (() => {
            const cp = detail.data as Chokepoint;
            const col = CHOKEPOINT_COLORS[cp.status] ?? '#00ff88';
            return (
              <div className="p-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[13px]" style={{ color: col }}>{cp.name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded uppercase font-bold"
                        style={{ color: col, background: col + '15', border: `1px solid ${col}44` }}>
                        {cp.status}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => setDetail(null)} className="close-btn">✕</button>
                </div>
                <div className="data-grid text-[9px] mb-2">
                  <div className="data-cell">
                    <div className="data-cell-label">Daily Flow</div>
                    <div className="data-cell-value">{cp.throughputMbpd} Mb/d</div>
                  </div>
                  <div className="data-cell">
                    <div className="data-cell-label">Risk Level</div>
                    <div className="data-cell-value flex gap-0.5 items-center">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className="text-[10px]"
                          style={{ color: i < cp.riskLevel ? '#ff3344' : '#112840' }}>█</span>
                      ))}
                      <span className="text-[10px] ml-1 text-[#a8cce0]">{cp.riskLevel}/5</span>
                    </div>
                  </div>
                </div>
                <div className="text-[#a8cce0] text-[10px] leading-snug">{cp.description}</div>
                <div className="mt-2">
                  <div className="text-[8px] text-[#5a8aaa] uppercase tracking-wider mb-1">Disruption Risk</div>
                  <div className="risk-bar" style={{ height: '4px' }}>
                    <div className="risk-fill"
                      style={{ width: `${cp.riskLevel * 20}%`, background: col }} />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── COUNTRY PANEL ── */}
          {detail.type === 'country' && (() => {
            const c = detail.data as { name: string; id: string };
            const info = COUNTRY_DATA[c.id];
            if (!info) return null;
            const isOpec = OPEC_COUNTRIES.has(c.id);
            return (
              <div className="p-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[#e2f4ff] font-bold text-[13px]">{c.name}</span>
                      {isOpec && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88] rounded">OPEC+</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setDetail(null)} className="close-btn">✕</button>
                </div>
                <div className="data-grid text-[9px] mb-2">
                  <div className="data-cell">
                    <div className="data-cell-label">Production</div>
                    <div className="data-cell-value text-[#00d4ff]">{info.production}</div>
                  </div>
                  <div className="data-cell">
                    <div className="data-cell-label">Reserves</div>
                    <div className="data-cell-value text-[#00ff88]">{info.reserves}</div>
                  </div>
                  <div className="data-cell" style={{ gridColumn: '1 / -1' }}>
                    <div className="data-cell-label">Crude Grade(s)</div>
                    <div className="data-cell-value text-[#ffaa00] text-[11px] font-normal">{info.grade}</div>
                  </div>
                </div>
                <div className="text-[#a8cce0] text-[10px] leading-snug">{info.note}</div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
