// @ts-nocheck
'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  ComposableMap, Geographies, Geography,
  Marker, ZoomableGroup, Line,
} from 'react-simple-maps';
import type { TankerShip, Chokepoint, ThreatEvent } from '@/lib/types';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

const OPEC_COUNTRIES = new Set([
  '682','368','364','784','414','862','434','012','566','266','178','226','634',
  '643','860','398','031','288','706','729',
]);

const COUNTRY_DATA: Record<string, {
  production: string; reserves: string; grade: string;
  note: string; opecQuota?: string; priceImpact: string;
}> = {
  '682': { production: '12.0 Mb/d', reserves: '267 Gb', grade: 'Arab Light / Arab Heavy', opecQuota: '10.0 Mb/d', note: "World's swing producer. Aramco spare capacity ~2 Mb/d acts as global price buffer.", priceImpact: 'Output cut → +$4–8/bbl' },
  '368': { production: '4.4 Mb/d', reserves: '145 Gb', grade: 'Basra Light / Basra Heavy', opecQuota: '4.0 Mb/d', note: 'Basra Oil Terminal handles 1.8 Mb/d. Political instability a chronic risk.', priceImpact: 'Disruption → +$2–5/bbl' },
  '364': { production: '3.2 Mb/d', reserves: '208 Gb', grade: 'Iranian Heavy / Iranian Light', note: 'Under US OFAC sanctions since 2018. Grey-market exports to China ~1.8 Mb/d via Malaysia transshipment.', priceImpact: 'Sanctions lift → −$4–6/bbl' },
  '784': { production: '3.8 Mb/d', reserves: '97 Gb', grade: 'Murban / Upper Zakum / Das Blend', opecQuota: '3.2 Mb/d', note: 'ADNOC targeting 5 Mb/d by 2027. Murban futures listed on ICE Abu Dhabi since 2021.', priceImpact: 'Expansion → −$1–3/bbl long-term' },
  '414': { production: '2.7 Mb/d', reserves: '102 Gb', grade: 'Kuwait Export Crude (KEC)', opecQuota: '2.5 Mb/d', note: "Al-Ahmadi terminal one of world's largest. Mina Al-Ahmadi refinery processes 940 kb/d.", priceImpact: 'Cut → +$1–3/bbl' },
  '862': { production: '0.7 Mb/d', reserves: '303 Gb', grade: 'Merey / Hamaca (extra-heavy)', note: "World's largest proven reserves — but heavy, expensive to extract. US sanctions cap output at ~600 kb/d.", priceImpact: 'Sanctions relief → −$0.5–2/bbl' },
  '643': { production: '10.1 Mb/d', reserves: '80 Gb', grade: 'Urals / ESPO / Siberian Light', note: 'G7 price cap $60/bbl. Shadow fleet of 400+ tankers routes to India and China. Baltic Urals trading at ~$15 discount to Brent.', priceImpact: 'Cap enforcement → +$3–6/bbl' },
  '566': { production: '1.3 Mb/d', reserves: '37 Gb', grade: 'Bonny Light / Forcados / Qua Iboe', opecQuota: '1.5 Mb/d', note: 'Chronic pipeline vandalism in Niger Delta. NNPC estimates ~400 kb/d theft losses.', priceImpact: 'Outage → +$0.5–2/bbl' },
  '012': { production: '1.1 Mb/d', reserves: '12 Gb', grade: 'Saharan Blend (light sweet)', opecQuota: '1.0 Mb/d', note: 'Hassi Messaoud remains primary field. Mature basin, declining naturally ~3% annually.', priceImpact: 'Decline → marginal +$0.25/bbl' },
  '434': { production: '1.2 Mb/d', reserves: '48 Gb', grade: 'Es Sider / Sharara / El Feel', note: 'Sharara field (300 kb/d) subject to tribal blockades. Civil war risk suppresses investment.', priceImpact: 'Blockade → +$0.5–1.5/bbl' },
  '288': { production: '0.17 Mb/d', reserves: '0.66 Gb', grade: 'Jubilee / TEN offshore', note: 'Offshore Jubilee (105 kb/d) and TEN (50 kb/d). Small but growing sub-Saharan producer.', priceImpact: 'Minor supply contributor' },
};

// ── Oil shortage / disruption overlay ────────────────────────────────────────
// severity: 'critical' = deep red, 'high' = orange-red, 'moderate' = amber
type ShortageSeverity = 'critical' | 'high' | 'moderate';
interface ShortageData {
  severity:     ShortageSeverity;
  affectedMbpd: string;
  issue:        string;
  detail:       string;
  source:       string;
}

const SHORTAGE_COUNTRIES: Record<string, ShortageData> = {
  '364': { // Iran
    severity:     'critical',
    affectedMbpd: '~2.0 Mb/d sanctioned',
    issue:        'US-OFAC Sanctions + Nuclear Standoff',
    detail:       'Under maximum-pressure OFAC sanctions since 2018. Grey-market exports to China via Malaysia at ~60% discount to Brent. Nuclear deal collapse risk could cut remaining 1.8 Mb/d exports.',
    source:       'US Treasury OFAC, Reuters, IAEA',
  },
  '862': { // Venezuela
    severity:     'critical',
    affectedMbpd: '~2.5 Mb/d lost since 2016',
    issue:        'PDVSA Collapse + US Sanctions',
    detail:       "Production collapsed from 3.2 Mb/d (2016) to ~0.7 Mb/d. PDVSA infrastructure in severe disrepair. US Chevron waiver allows limited output but structural underinvestment limits recovery.",
    source:       'OPEC, EIA, Bloomberg',
  },
  '729': { // Sudan
    severity:     'high',
    affectedMbpd: '~0.06 Mb/d disrupted',
    issue:        'Civil War — SAF vs RSF',
    detail:       'Civil war since April 2023 between Sudanese Armed Forces and Rapid Support Forces. Oil infrastructure in conflict zones. Small but strategically significant for East African supply.',
    source:       'UN OCHA, Reuters',
  },
  '434': { // Libya
    severity:     'high',
    affectedMbpd: '~0.3–0.6 Mb/d at risk',
    issue:        'Ongoing Field Blockades + Civil Unrest',
    detail:       'Sharara field (300 kb/d) subject to recurring tribal blockades. El Feel field disrupted. UN-backed GNU and eastern rival factions contest revenue control. Output highly volatile.',
    source:       'NOC Libya, Reuters, S&P Platts',
  },
  '566': { // Nigeria
    severity:     'high',
    affectedMbpd: '~0.4 Mb/d theft + vandalism',
    issue:        'Niger Delta Pipeline Vandalism',
    detail:       'NNPC estimates ~400 kb/d losses from crude theft and pipeline sabotage in the Delta. Trans Niger Pipeline and Nembe Creek Trunkline chronically disrupted. OPEC quota compliance difficult.',
    source:       'NNPC, World Bank, Reuters',
  },
  '643': { // Russia
    severity:     'high',
    affectedMbpd: '~0.5 Mb/d under cap pressure',
    issue:        'G7 $60/bbl Price Cap + Ukraine War',
    detail:       'G7 price cap restricts Western shipping/insurance for Russian oil above $60/bbl. Shadow fleet of 400+ vessels routes Urals to India & China. Dresdner / Novatek output under secondary sanction threat.',
    source:       'IEA, US Treasury, Reuters',
  },
  '484': { // Mexico
    severity:     'moderate',
    affectedMbpd: '~0.5 Mb/d lost since 2004 peak',
    issue:        'PEMEX Structural Decline',
    detail:       "Pemex production fell from 3.4 Mb/d (2004) to ~1.7 Mb/d. Chronic underinvestment, high taxes siphoned to government budget, and Cantarell field natural decline. Imports rising; exports falling.",
    source:       'PEMEX, EIA, IEA',
  },
  '398': { // Kazakhstan
    severity:     'moderate',
    affectedMbpd: '~0.2 Mb/d intermittent',
    issue:        'CPC Pipeline Disruptions',
    detail:       'Caspian Pipeline Consortium (CPC) — the main export route — has suffered storm damage and Russian-imposed "inspection" closures. 1.4 Mb/d capacity; outages create near-term Brent spikes.',
    source:       'CPC Consortium, Reuters, IEA',
  },
  '218': { // Ecuador
    severity:     'moderate',
    affectedMbpd: '~0.1 Mb/d lost',
    issue:        'Indigenous Protests + Political Instability',
    detail:       'Recurring indigenous community blockades of Amazonian oil installations. Amazon crude production (Oriente blend) affected. Government has declared states of emergency multiple times.',
    source:       'Petroecuador, Reuters',
  },
};

const SHORTAGE_FILL: Record<ShortageSeverity, string> = {
  critical: '#3d0c12',
  high:     '#2e1404',
  moderate: '#2a1d00',
};
const SHORTAGE_STROKE: Record<ShortageSeverity, string> = {
  critical: '#cc1a2e',
  high:     '#c85010',
  moderate: '#b08000',
};
const SHORTAGE_HOVER: Record<ShortageSeverity, string> = {
  critical: '#5a0f1a',
  high:     '#4a1e08',
  moderate: '#3d2c00',
};

const CP_COLORS: Record<string, string> = {
  open: '#00e87a', disrupted: '#ffb300', critical: '#ff5522', closed: '#ff0000',
};

const LANE_ROUTES: [number, number][][] = [
  [[56.5,26],[58,22],[65,12],[75,6],[90,2.5],[104.5,1.3],[107,4.5],[110,12],[118,22.5],[121.5,29]],
  [[56.5,26],[50,17.5],[43.5,11.2],[38,21],[32.5,31],[26,34.5],[14,38],[3,40],[0.5,51.5]],
  [[56.5,26],[65,10],[60,-10],[35,-30],[18.5,-34],[0,-22],[-8,0],[-5,32],[-3,42],[0.5,51.5]],
  [[4.5,2],[-6,20],[-10,36],[-2,51],[1.5,51.5]],
  [[4.5,2],[-20,12],[-50,20],[-80,27],[-90,29.5]],
  [[-63.5,10.5],[-74,20],[-82,26],[-90,29.5]],
  [[28.5,59.5],[14,57.5],[4,51.5]],
  [[-90,29],[-76,30],[-64,40],[-32,47],[0.5,51.5]],
];

type TooltipPos = { x: number; y: number };
interface TradeSignal {
  price: number; bias: string;
  signals: { name: string; value: string; direction: string }[];
  target7d: number; target7dLow: number; target7dHigh: number;
}
type DetailType = 'ship' | 'chokepoint' | 'country';
interface DetailPanel { type: DetailType; data: TankerShip | Chokepoint | { name: string; id: string }; }

function shipColor(type: TankerShip['type']) {
  return type === 'VLCC' ? '#00c8f0' : type === 'Suezmax' ? '#22c0e8' : type === 'Aframax' ? '#44a8c8' : '#2299bb';
}
function biasColor(bias: string) {
  if (bias?.includes('bullish')) return '#00e87a';
  if (bias?.includes('bearish')) return '#ff3355';
  return '#ffb300';
}
function biasLabel(bias: string) {
  const m: Record<string, string> = {
    strongly_bullish: '▲▲ STRONG BUY', bullish: '▲  BUY',
    neutral: '◆  HOLD / WATCH', bearish: '▼  SELL', strongly_bearish: '▼▼ STRONG SELL',
  };
  return m[bias] ?? '◆  NEUTRAL';
}

export default function WorldMap() {
  const [ships,       setShips]       = useState<TankerShip[]>([]);
  const [chokepoints, setChokepoints] = useState<Chokepoint[]>([]);
  const [threats,     setThreats]     = useState<ThreatEvent[]>([]);
  const [stats,       setStats]       = useState<Record<string, number | string>>({});
  const [zoom,        setZoom]        = useState(1);
  const [center,      setCenter]      = useState<[number, number]>([20, 15]);
  const [pulsePhase,  setPulsePhase]  = useState(0);
  const [detail,      setDetail]      = useState<DetailPanel | null>(null);
  const [tradeSignal, setTradeSignal] = useState<TradeSignal | null>(null);

  const [hoverShip,    setHoverShip]    = useState<{ ship: TankerShip;    pos: TooltipPos } | null>(null);
  const [hoverCp,      setHoverCp]      = useState<{ cp: Chokepoint;      pos: TooltipPos } | null>(null);
  const [hoverThreat,  setHoverThreat]  = useState<{ t: ThreatEvent;      pos: TooltipPos } | null>(null);
  const [hoverCountry, setHoverCountry] = useState<{ id: string; name: string; pos: TooltipPos } | null>(null);

  const animRef   = useRef<number | null>(null);
  const lastFetch = useRef(0);

  const fetchData = useCallback(async () => {
    if (Date.now() - lastFetch.current < 25_000) return;
    lastFetch.current = Date.now();
    try {
      const r = await fetch('/api/ships');
      const d = await r.json();
      setShips(d.ships ?? []); setChokepoints(d.chokepoints ?? []);
      setThreats(d.threats ?? []); setStats(d.stats ?? {});
    } catch {}
  }, []);

  useEffect(() => {
    const fetchSignal = async () => {
      try {
        const r = await fetch('/api/projection?symbol=BZ%3DF');
        const d = await r.json();
        if (d.error) return;
        setTradeSignal({
          price: d.currentPrice, bias: d.bias, signals: d.signals ?? [],
          target7d:     d.projections?.[0]?.price ?? d.currentPrice,
          target7dLow:  d.projections?.[0]?.low   ?? d.currentPrice,
          target7dHigh: d.projections?.[0]?.high  ?? d.currentPrice,
        });
      } catch {}
    };
    fetchSignal();
    const iv = setInterval(fetchSignal, 120_000);
    return () => clearInterval(iv);
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
    return () => { clearInterval(interval); if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [fetchData]);

  const pulseScale = 1 + Math.sin((pulsePhase / 120) * Math.PI * 2) * 0.4;
  const slowPulse  = 1 + Math.sin((pulsePhase / 120) * Math.PI * 2) * 0.25;

  function gmp(e: React.MouseEvent): TooltipPos { return { x: e.clientX, y: e.clientY }; }
  function handleShipClick(ship: TankerShip) {
    setDetail(detail?.type === 'ship' && (detail.data as TankerShip).id === ship.id ? null : { type: 'ship', data: ship });
  }
  function handleCpClick(cp: Chokepoint) {
    setDetail(detail?.type === 'chokepoint' && (detail.data as Chokepoint).id === cp.id ? null : { type: 'chokepoint', data: cp });
  }
  function handleCountryClick(id: string, name: string) {
    if (!COUNTRY_DATA[id] && !SHORTAGE_COUNTRIES[id]) return;
    setDetail(detail?.type === 'country' && (detail.data as { id: string }).id === id ? null : { type: 'country', data: { name, id } });
  }

  const panelOpen = !!detail;

  return (
    <div className="relative w-full h-full overflow-hidden select-none" style={{ background: '#020c18' }}>

      {/* ── Stat bar ────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-3 px-3 py-1.5 backdrop-blur-sm"
           style={{ background: 'rgba(2,12,24,0.95)', borderBottom: '1px solid #0f2a42' }}>
        <span className="font-['Orbitron'] text-[8px] tracking-widest shrink-0" style={{ color: '#6b9db8' }}>
          CRUDE INTELLIGENCE
        </span>
        <span className="w-px h-3" style={{ background: '#0f2a42' }} />
        <span className="text-[9px] font-bold" style={{ color: '#00c8f0' }}>⬡ {stats.totalShips ?? '—'} TANKERS</span>
        <span className="text-[9px]" style={{ color: '#6b9db8' }}>VLCC <b style={{ color: '#c0d8ec' }}>{stats.vlccs ?? '—'}</b></span>
        <span className="text-[9px]" style={{ color: '#6b9db8' }}>Suezmax <b style={{ color: '#c0d8ec' }}>{stats.suezmax ?? '—'}</b></span>
        <span className="text-[9px]" style={{ color: '#6b9db8' }}>Aframax <b style={{ color: '#c0d8ec' }}>{stats.aframax ?? '—'}</b></span>
        <span className="w-px h-3" style={{ background: '#0f2a42' }} />
        <span className="text-[9px] font-medium" style={{ color: '#ffb300' }}>⚠ Hormuz ELEVATED</span>
        <span className="text-[9px] font-medium" style={{ color: '#ff3355' }}>⚠ Red Sea ACTIVE</span>
        <div className="ml-auto flex items-center gap-1.5 text-[9px] font-medium" style={{ color: '#00e87a' }}>
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#00e87a' }} />
          AIS LIVE
        </div>
      </div>

      {/* ── Map ─────────────────────────────────── */}
      <ComposableMap
        projection="geoNaturalEarth1"
        projectionConfig={{ scale: 170, center: [20, 10] }}
        style={{ width: '100%', height: '100%', background: 'transparent' }}
        onClick={() => setDetail(null)}
      >
        <ZoomableGroup zoom={zoom} center={center}
          onMoveEnd={({ zoom: z, coordinates: c }) => { setZoom(z); setCenter(c); }}>
          <rect x="-5000" y="-5000" width="10000" height="10000" fill="#020e1c" />

          {/* Shipping lanes */}
          {LANE_ROUTES.map((route, ri) =>
            route.slice(0, -1).map((pt, si) => (
              <Line key={`lane-${ri}-${si}`} from={pt} to={route[si + 1]}
                stroke="rgba(0,140,200,0.14)" strokeWidth={0.8} strokeDasharray="4,8" />
            ))
          )}

          {/* Countries */}
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map(geo => {
                const isOpec     = OPEC_COUNTRIES.has(geo.id);
                const shortage   = SHORTAGE_COUNTRIES[geo.id];
                const hasData    = !!COUNTRY_DATA[geo.id] || !!shortage;
                const isSelected = detail?.type === 'country' && (detail.data as { id: string }).id === geo.id;
                const isHovered  = hoverCountry?.id === geo.id;

                let fill, stroke, strokeWidth, hoverFill;
                if (isSelected) {
                  fill = shortage ? SHORTAGE_HOVER[shortage.severity] : '#1d4a6e';
                  stroke = shortage ? SHORTAGE_STROKE[shortage.severity] : '#00c8f0';
                  strokeWidth = 1.1;
                  hoverFill = fill;
                } else if (shortage) {
                  fill = isHovered ? SHORTAGE_HOVER[shortage.severity] : SHORTAGE_FILL[shortage.severity];
                  stroke = SHORTAGE_STROKE[shortage.severity];
                  strokeWidth = isHovered ? 0.8 : 0.5;
                  hoverFill = SHORTAGE_HOVER[shortage.severity];
                } else if (isOpec) {
                  fill = isHovered && hasData ? '#16384e' : '#0d2a14';
                  stroke = '#1a4020';
                  strokeWidth = 0.4;
                  hoverFill = '#112518';
                } else {
                  fill = '#091520';
                  stroke = '#0d2035';
                  strokeWidth = 0.4;
                  hoverFill = '#0d2030';
                }

                return (
                  <Geography key={geo.rsmKey} geography={geo}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    onMouseEnter={(e) => { if (geo.properties.name) setHoverCountry({ id: geo.id, name: geo.properties.name, pos: gmp(e) }); }}
                    onMouseMove={(e)  => setHoverCountry(prev => prev ? { ...prev, pos: gmp(e) } : null)}
                    onMouseLeave={() => setHoverCountry(null)}
                    onClick={(e) => { e.stopPropagation(); handleCountryClick(geo.id, geo.properties.name); }}
                    style={{
                      default: { outline: 'none', cursor: hasData ? 'pointer' : 'default' },
                      hover:   { fill: hoverFill, outline: 'none' },
                      pressed: { outline: 'none' },
                    }}
                  />
                );
              })
            }
          </Geographies>

          {/* Threat zones */}
          {threats.filter(t => t.active).map(t => {
            const col = t.severity === 'critical' ? '#ff0022' : t.severity === 'high' ? '#ff3355' : '#ffb300';
            const r   = t.severity === 'critical' ? 14 : t.severity === 'high' ? 12 : 9;
            return (
              <Marker key={t.id} coordinates={[t.lon, t.lat]}
                onMouseEnter={(e) => setHoverThreat({ t, pos: gmp(e as unknown as React.MouseEvent) })}
                onMouseMove={(e)  => setHoverThreat(prev => prev ? { ...prev, pos: gmp(e as unknown as React.MouseEvent) } : null)}
                onMouseLeave={() => setHoverThreat(null)}>
                <circle r={r * slowPulse} fill="none" stroke={col} strokeWidth={0.5} opacity={0.18} />
                <circle r={r} fill="none" stroke={col} strokeWidth={0.8} opacity={0.35 + (pulsePhase / 120) * 0.35} />
                <circle r={t.severity === 'critical' ? 5 : 3.5} fill={col + '44'} stroke={col} strokeWidth={1} style={{ cursor: 'crosshair' }} />
                <text y={r + 8} textAnchor="middle"
                  style={{ fontSize: '4.5px', fill: col + 'cc', fontFamily: 'JetBrains Mono', fontWeight: 700, letterSpacing: '0.3px' }}>
                  {t.title.toUpperCase().slice(0, 18)}
                </text>
              </Marker>
            );
          })}

          {/* Chokepoints */}
          {chokepoints.map(cp => {
            const col        = CP_COLORS[cp.status] ?? '#00e87a';
            const isSelected = detail?.type === 'chokepoint' && (detail.data as Chokepoint).id === cp.id;
            return (
              <Marker key={cp.id} coordinates={[cp.lon, cp.lat]}
                onMouseEnter={(e) => setHoverCp({ cp, pos: gmp(e as unknown as React.MouseEvent) })}
                onMouseMove={(e)  => setHoverCp(prev => prev ? { ...prev, pos: gmp(e as unknown as React.MouseEvent) } : null)}
                onMouseLeave={() => setHoverCp(null)}
                onClick={(e) => { (e as unknown as Event).stopPropagation(); handleCpClick(cp); }}>
                <circle r={isSelected ? 14 : 10 * pulseScale} fill="none" stroke={col}
                  strokeWidth={isSelected ? 1.5 : 0.7} opacity={isSelected ? 0.8 : 0.25 * (1 - pulsePhase / 120)} />
                <circle r={7} fill="none" stroke={col} strokeWidth={1.2} opacity={0.75} />
                <polygon points="0,-6 6,0 0,6 -6,0" fill={isSelected ? col + '55' : col + '22'}
                  stroke={col} strokeWidth={1.3} style={{ cursor: 'pointer' }} />
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

          {/* Tanker ships */}
          {ships.map(ship => {
            const col  = shipColor(ship.type);
            const rad  = ship.heading * (Math.PI / 180);
            const size = ship.type === 'VLCC' ? 4.5 : ship.type === 'Suezmax' ? 3.5 : 3;
            const tip   = { x: Math.sin(rad) * size * 2,   y: -Math.cos(rad) * size * 2 };
            const left  = { x: Math.sin(rad - 2.3) * size, y: -Math.cos(rad - 2.3) * size };
            const right = { x: Math.sin(rad + 2.3) * size, y: -Math.cos(rad + 2.3) * size };
            const isSel = detail?.type === 'ship' && (detail.data as TankerShip).id === ship.id;
            return (
              <Marker key={ship.id} coordinates={[ship.lon, ship.lat]}
                onMouseEnter={(e) => setHoverShip({ ship, pos: gmp(e as unknown as React.MouseEvent) })}
                onMouseMove={(e)  => setHoverShip(prev => prev ? { ...prev, pos: gmp(e as unknown as React.MouseEvent) } : null)}
                onMouseLeave={() => setHoverShip(null)}
                onClick={(e) => { (e as unknown as Event).stopPropagation(); handleShipClick(ship); }}>
                {isSel && <circle r={9} fill="none" stroke={col} strokeWidth={1.2} opacity={0.9} />}
                <line x1={0} y1={0} x2={-tip.x * 0.9} y2={-tip.y * 0.9} stroke={col} strokeWidth={0.7} opacity={0.35} />
                <polygon points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`}
                  fill={col} opacity={isSel ? 1 : 0.9} style={{ cursor: 'pointer' }} />
                <circle r={1.2} fill={col} opacity={0.7} />
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>

      {/* ── TRADE SIGNAL WIDGET ─────────────────── */}
      {tradeSignal && (
        <div className="absolute top-9 right-3 z-20 w-[168px] panel"
             style={{ borderTopColor: biasColor(tradeSignal.bias) + '80', background: 'rgba(4,13,26,0.97)' }}>
          <div className="px-2.5 pt-2 pb-1.5 border-b border-[#0f2a42]">
            <div className="flex items-center justify-between mb-1">
              <span className="font-['Orbitron'] text-[8px] tracking-widest" style={{ color: '#6b9db8' }}>
                BRENT SIGNAL
              </span>
              <span className="text-[9px] font-bold" style={{ color: biasColor(tradeSignal.bias) }}>
                {biasLabel(tradeSignal.bias)}
              </span>
            </div>
            <div className="flex items-end gap-1.5">
              <span className="text-[24px] font-bold tabular-nums leading-none"
                    style={{ color: biasColor(tradeSignal.bias) }}>
                ${tradeSignal.price.toFixed(2)}
              </span>
              <span className="text-[10px] mb-0.5" style={{ color: '#6b9db8' }}>/bbl</span>
            </div>
          </div>

          <div className="px-2.5 py-2 border-b border-[#0f2a42]" style={{ background: 'rgba(6,14,28,0.7)' }}>
            <div className="text-[8px] uppercase tracking-wider font-bold mb-1" style={{ color: '#6b9db8' }}>
              7-Day Target
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] font-bold tabular-nums"
                    style={{ color: tradeSignal.target7d > tradeSignal.price ? '#00e87a' : '#ff3355' }}>
                ${tradeSignal.target7d.toFixed(2)}
              </span>
              <span className="text-[10px] font-semibold"
                    style={{ color: tradeSignal.target7d > tradeSignal.price ? '#00e87a' : '#ff3355' }}>
                {tradeSignal.target7d > tradeSignal.price ? '▲' : '▼'}
                {' '}{Math.abs(tradeSignal.target7d - tradeSignal.price).toFixed(2)}
              </span>
            </div>
            <div className="text-[8px] mt-0.5" style={{ color: '#8ab8cc' }}>
              Range ${tradeSignal.target7dLow.toFixed(1)} – ${tradeSignal.target7dHigh.toFixed(1)}
            </div>
          </div>

          <div className="px-2.5 py-2">
            {tradeSignal.signals.slice(0, 4).map((sig, i) => (
              <div key={i} className="flex items-center justify-between gap-1 mb-1.5 last:mb-0">
                <span className="text-[8px] truncate" style={{ color: '#8ab8cc' }}>{sig.name}</span>
                <span className="text-[9px] font-bold shrink-0"
                      style={{ color: sig.direction === 'bullish' ? '#00e87a' : sig.direction === 'bearish' ? '#ff3355' : '#ffb300' }}>
                  {sig.value}
                </span>
              </div>
            ))}
          </div>

          <div className="px-2.5 pb-2.5">
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#0f2a42' }}>
              <div className="h-full rounded-full transition-all duration-1000"
                   style={{
                     width: tradeSignal.bias === 'strongly_bullish' ? '95%' : tradeSignal.bias === 'bullish' ? '70%'
                          : tradeSignal.bias === 'neutral' ? '50%' : tradeSignal.bias === 'bearish' ? '30%' : '10%',
                     background: 'linear-gradient(90deg, #ff3355, #ffb300, #00e87a)',
                   }} />
            </div>
            <div className="flex justify-between text-[8px] font-bold mt-1" style={{ color: '#6b9db8' }}>
              <span>BEAR</span><span>BULL</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Zoom controls ───────────────────────── */}
      <div className="absolute right-3 flex flex-col gap-1 z-20"
           style={{ bottom: panelOpen ? '220px' : '44px', transition: 'bottom 0.25s ease' }}>
        {[
          { label: '+', fn: () => setZoom(z => Math.min(z * 1.6, 10)) },
          { label: '−', fn: () => setZoom(z => Math.max(z / 1.6, 1)) },
          { label: '⌂', fn: () => { setZoom(1); setCenter([20, 15]); setDetail(null); } },
        ].map(btn => (
          <button key={btn.label} onClick={btn.fn}
            className="w-7 h-7 flex items-center justify-center text-[14px] font-bold transition-all rounded-sm shadow-lg"
            style={{ color: '#00c8f0', border: '1px solid #0f2a42', background: '#060e1c' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0d2238'; e.currentTarget.style.borderColor = 'rgba(0,200,240,0.5)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#060e1c'; e.currentTarget.style.borderColor = '#0f2a42'; }}>
            {btn.label}
          </button>
        ))}
      </div>

      {/* ── Legend ──────────────────────────────── */}
      <div className="absolute left-2 z-20 px-2.5 py-2 text-[8px] backdrop-blur-sm"
           style={{
             bottom: panelOpen ? '220px' : '8px', transition: 'bottom 0.25s ease',
             background: 'rgba(4,13,26,0.95)', border: '1px solid #0f2a42',
           }}>
        <div className="font-['Orbitron'] text-[8px] tracking-wider mb-1.5 font-bold" style={{ color: '#c0d8ec' }}>
          LEGEND
        </div>
        {[
          { color: '#00c8f0', label: 'VLCC (>200k DWT)'    },
          { color: '#22c0e8', label: 'Suezmax (120–200k)'  },
          { color: '#44a8c8', label: 'Aframax (<120k DWT)' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5 mb-0.5">
            <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: l.color }} />
            <span style={{ color: '#c0d8ec' }}>{l.label}</span>
          </div>
        ))}
        <div className="pt-1 mt-1 space-y-0.5" style={{ borderTop: '1px solid #0f2a42' }}>
          {[
            { color: '#00e87a', label: 'Chokepoint — Open'     },
            { color: '#ffb300', label: 'Chokepoint — Disrupted' },
            { color: '#ff3355', label: 'Threat Zone — Active'   },
            { color: '#1a4020', label: 'OPEC+ Country'          },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full border shrink-0"
                   style={{ borderColor: l.color, background: l.color + '22' }} />
              <span style={{ color: '#c0d8ec' }}>{l.label}</span>
            </div>
          ))}
        </div>
        <div className="pt-1 mt-1 space-y-0.5" style={{ borderTop: '1px solid #0f2a42' }}>
          {[
            { color: '#cc1a2e', bg: '#3d0c12', label: 'Critical Disruption' },
            { color: '#c85010', bg: '#2e1404', label: 'High Risk Supply'     },
            { color: '#b08000', bg: '#2a1d00', label: 'Moderate Disruption'  },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm border shrink-0"
                   style={{ borderColor: l.color, background: l.bg }} />
              <span style={{ color: '#c0d8ec' }}>{l.label}</span>
            </div>
          ))}
        </div>
        <div className="text-[8px] mt-1.5 pt-1" style={{ borderTop: '1px solid #0f2a42', color: '#6b9db8' }}>
          Hover for info · Click to expand
        </div>
      </div>

      {/* ═══════════════════ HOVER TOOLTIPS ════════════════════ */}

      {/* SHIP hover */}
      {hoverShip && (
        <div className="fixed z-50 pointer-events-none"
             style={{ left: hoverShip.pos.x + 16, top: hoverShip.pos.y - 8 }}>
          <div className="min-w-[210px] text-[9px]"
               style={{ background: 'rgba(3,13,28,0.98)', border: 'rgba(0,200,240,0.4) 1px solid',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.8)' }}>
            <div className="flex items-center gap-2 px-2.5 py-2 border-b" style={{ borderColor: '#0f2a42', background: 'rgba(0,200,240,0.06)' }}>
              <span className="font-bold text-[11px]" style={{ color: '#00c8f0' }}>{hoverShip.ship.name}</span>
              <span className="text-[8px] px-1.5 py-0.5 rounded font-bold" style={{ color: '#00c8f0', background: 'rgba(0,200,240,0.12)', border: '1px solid rgba(0,200,240,0.3)' }}>
                {hoverShip.ship.type}
              </span>
              <span className="text-[12px] ml-auto">{hoverShip.ship.flag}</span>
            </div>
            <div className="px-2.5 py-2 space-y-1">
              <MapRow label="Cargo"  value={hoverShip.ship.cargo}         col="#eaf6ff" bold />
              <MapRow label="From"   value={hoverShip.ship.origin}        col="#c0d8ec" />
              <MapRow label="To"     value={hoverShip.ship.destination}   col="#c0d8ec" />
              <MapRow label="Speed"  value={`${hoverShip.ship.speed} kn`} col="#c0d8ec" />
              <MapRow label="DWT"    value={`${(hoverShip.ship.dwt/1000).toFixed(0)}k t`} col="#c0d8ec" />
              <MapRow label="ETA"    value={hoverShip.ship.eta}            col="#ffb300" bold />
            </div>
            <div className="px-2.5 pb-2">
              <div className="flex justify-between text-[8px] mb-0.5" style={{ color: '#6b9db8' }}>
                <span>Route progress</span>
                <span className="font-bold" style={{ color: '#00c8f0' }}>{(hoverShip.ship.routeProgress * 100).toFixed(0)}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#0f2a42' }}>
                <div className="h-full rounded-full" style={{ width: `${(hoverShip.ship.routeProgress * 100).toFixed(0)}%`, background: '#00c8f0' }} />
              </div>
            </div>
            <div className="px-2.5 pb-1.5 text-[8px] italic" style={{ color: '#3a5a72' }}>Click ship for full details</div>
          </div>
        </div>
      )}

      {/* CHOKEPOINT hover */}
      {hoverCp && (
        <div className="fixed z-50 pointer-events-none"
             style={{ left: hoverCp.pos.x + 16, top: hoverCp.pos.y - 8 }}>
          <div className="min-w-[220px] text-[9px]"
               style={{ background: 'rgba(3,13,28,0.98)', border: `1px solid ${CP_COLORS[hoverCp.cp.status]}55`,
                        boxShadow: '0 4px 24px rgba(0,0,0,0.8)' }}>
            <div className="flex items-center gap-2 px-2.5 py-2 border-b"
                 style={{ borderColor: '#0f2a42', background: CP_COLORS[hoverCp.cp.status] + '0a' }}>
              <span className="font-bold text-[11px]" style={{ color: CP_COLORS[hoverCp.cp.status] }}>
                {hoverCp.cp.name}
              </span>
              <span className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ml-auto"
                    style={{ color: CP_COLORS[hoverCp.cp.status], background: CP_COLORS[hoverCp.cp.status] + '15', border: `1px solid ${CP_COLORS[hoverCp.cp.status]}44` }}>
                {hoverCp.cp.status}
              </span>
            </div>
            <div className="px-2.5 py-2 space-y-1">
              <MapRow label="Daily Flow" value={`${hoverCp.cp.throughputMbpd} Mb/d`} col="#eaf6ff" bold />
              <div className="flex items-center gap-1.5">
                <span className="w-16 shrink-0" style={{ color: '#6b9db8' }}>Risk</span>
                <div className="flex gap-0.5">
                  {Array.from({length:5}).map((_,i)=>(
                    <span key={i} style={{ color: i < hoverCp.cp.riskLevel ? '#ff3355' : '#1a3a52' }}>█</span>
                  ))}
                </div>
                <span className="font-bold" style={{ color: '#c0d8ec' }}>{hoverCp.cp.riskLevel}/5</span>
              </div>
              <div className="text-[8px] leading-snug pt-0.5" style={{ color: '#c0d8ec' }}>{hoverCp.cp.description}</div>
            </div>
          </div>
        </div>
      )}

      {/* THREAT hover */}
      {hoverThreat && (() => {
        const col = hoverThreat.t.severity === 'critical' ? '#ff0022' : hoverThreat.t.severity === 'high' ? '#ff3355' : '#ffb300';
        return (
          <div className="fixed z-50 pointer-events-none"
               style={{ left: hoverThreat.pos.x + 16, top: hoverThreat.pos.y - 8 }}>
            <div className="min-w-[220px] text-[9px]"
                 style={{ background: 'rgba(3,13,28,0.98)', border: `1px solid ${col}55`,
                          boxShadow: '0 4px 24px rgba(0,0,0,0.8)' }}>
              <div className="flex items-center gap-2 px-2.5 py-2 border-b"
                   style={{ borderColor: '#0f2a42', background: col + '0a' }}>
                <span className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase"
                      style={{ color: col, background: col+'15', border:`1px solid ${col}44` }}>
                  ⚠ {hoverThreat.t.severity}
                </span>
                <span className="font-bold text-[10px]" style={{ color: '#eaf6ff' }}>{hoverThreat.t.title}</span>
              </div>
              <div className="px-2.5 py-2 space-y-1">
                <MapRow label="Region" value={hoverThreat.t.region}      col="#c0d8ec" />
                <MapRow label="Type"   value={hoverThreat.t.type}        col="#c0d8ec" />
                <MapRow label="Impact" value={hoverThreat.t.impact}      col="#eaf6ff" bold />
                {hoverThreat.t.priceImpact && <MapRow label="Price" value={hoverThreat.t.priceImpact} col={col} bold />}
              </div>
            </div>
          </div>
        );
      })()}

      {/* COUNTRY hover */}
      {hoverCountry && (
        <div className="fixed z-50 pointer-events-none"
             style={{ left: hoverCountry.pos.x + 16, top: hoverCountry.pos.y - 8 }}>
          {(COUNTRY_DATA[hoverCountry.id] || SHORTAGE_COUNTRIES[hoverCountry.id]) ? (
            <div className="min-w-[240px] text-[9px]"
                 style={{
                   background: 'rgba(3,13,28,0.98)',
                   border: SHORTAGE_COUNTRIES[hoverCountry.id]
                     ? `1px solid ${SHORTAGE_STROKE[SHORTAGE_COUNTRIES[hoverCountry.id].severity]}55`
                     : '1px solid rgba(0,232,122,0.25)',
                   boxShadow: '0 4px 24px rgba(0,0,0,0.8)',
                 }}>
              {/* Header */}
              <div className="flex items-center gap-2 px-2.5 py-2 border-b"
                   style={{
                     borderColor: '#0f2a42',
                     background: SHORTAGE_COUNTRIES[hoverCountry.id]
                       ? SHORTAGE_STROKE[SHORTAGE_COUNTRIES[hoverCountry.id].severity] + '0a'
                       : 'rgba(0,232,122,0.05)',
                   }}>
                <span className="font-bold text-[11px]" style={{ color: '#eaf6ff' }}>{hoverCountry.name}</span>
                <div className="ml-auto flex items-center gap-1">
                  {OPEC_COUNTRIES.has(hoverCountry.id) && (
                    <span className="text-[7px] px-1.5 py-0.5 rounded font-bold"
                          style={{ color: '#00e87a', background: 'rgba(0,232,122,0.10)', border: '1px solid rgba(0,232,122,0.3)' }}>
                      OPEC+
                    </span>
                  )}
                  {SHORTAGE_COUNTRIES[hoverCountry.id] && (
                    <span className="text-[7px] px-1.5 py-0.5 rounded font-bold uppercase"
                          style={{
                            color: SHORTAGE_STROKE[SHORTAGE_COUNTRIES[hoverCountry.id].severity],
                            background: SHORTAGE_FILL[SHORTAGE_COUNTRIES[hoverCountry.id].severity],
                            border: `1px solid ${SHORTAGE_STROKE[SHORTAGE_COUNTRIES[hoverCountry.id].severity]}55`,
                          }}>
                      ⚠ {SHORTAGE_COUNTRIES[hoverCountry.id].severity}
                    </span>
                  )}
                </div>
              </div>
              <div className="px-2.5 py-2 space-y-1">
                {/* Shortage info (prominent) */}
                {SHORTAGE_COUNTRIES[hoverCountry.id] && (() => {
                  const s   = SHORTAGE_COUNTRIES[hoverCountry.id];
                  const col = SHORTAGE_STROKE[s.severity];
                  return (
                    <>
                      <div className="px-2 py-1.5 rounded mb-1.5"
                           style={{ background: SHORTAGE_FILL[s.severity], border: `1px solid ${col}33` }}>
                        <div className="text-[8px] font-bold uppercase tracking-wide mb-0.5" style={{ color: col }}>
                          {s.issue}
                        </div>
                        <div className="text-[8px]" style={{ color: '#e0e8f0' }}>
                          {s.affectedMbpd} at risk
                        </div>
                      </div>
                      <div className="text-[8px] leading-snug" style={{ color: '#c0d8ec' }}>{s.detail}</div>
                      <div className="text-[7px] mt-1 pt-1" style={{ borderTop: '1px solid #0f2a42', color: '#6b9db8' }}>
                        Source: {s.source}
                      </div>
                    </>
                  );
                })()}
                {/* Production data (if available) */}
                {COUNTRY_DATA[hoverCountry.id] && !SHORTAGE_COUNTRIES[hoverCountry.id] && (
                  <>
                    <MapRow label="Production" value={COUNTRY_DATA[hoverCountry.id].production} col="#00c8f0" bold />
                    <MapRow label="Reserves"   value={COUNTRY_DATA[hoverCountry.id].reserves}   col="#00e87a" bold />
                    <MapRow label="Grade"      value={COUNTRY_DATA[hoverCountry.id].grade}       col="#ffb300" />
                    <MapRow label="Price Δ"    value={COUNTRY_DATA[hoverCountry.id].priceImpact} col="#ff9944" />
                    {COUNTRY_DATA[hoverCountry.id].opecQuota && (
                      <MapRow label="OPEC Quota" value={COUNTRY_DATA[hoverCountry.id].opecQuota!} col="#c0d8ec" />
                    )}
                    <div className="text-[8px] leading-snug pt-0.5 border-t mt-1" style={{ borderColor: '#0f2a42', color: '#8ab8cc' }}>
                      {COUNTRY_DATA[hoverCountry.id].note}
                    </div>
                  </>
                )}
                {/* Show production data alongside shortage if available */}
                {COUNTRY_DATA[hoverCountry.id] && SHORTAGE_COUNTRIES[hoverCountry.id] && (
                  <div className="pt-1 mt-1 border-t space-y-1" style={{ borderColor: '#0f2a42' }}>
                    <MapRow label="Current Output" value={COUNTRY_DATA[hoverCountry.id].production} col="#00c8f0" bold />
                    <MapRow label="Grade"          value={COUNTRY_DATA[hoverCountry.id].grade}       col="#ffb300" />
                    <MapRow label="Price Δ"        value={COUNTRY_DATA[hoverCountry.id].priceImpact} col="#ff9944" />
                  </div>
                )}
              </div>
              <div className="px-2.5 pb-1.5 text-[8px] italic" style={{ color: '#3a5a72' }}>Click to expand details</div>
            </div>
          ) : (
            <div className="text-[9px] px-2.5 py-1.5 shadow-lg"
                 style={{ background: 'rgba(3,13,28,0.95)', border: '1px solid #0f2a42', color: '#c0d8ec' }}>
              {hoverCountry.name}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ DETAIL PANEL ══════════════════════ */}
      {detail && (
        <div className="absolute bottom-0 left-0 right-0 z-30 map-detail-panel"
             style={{ background: 'rgba(4,13,26,0.97)' }}>

          {/* SHIP */}
          {detail.type === 'ship' && (() => {
            const s   = detail.data as TankerShip;
            const col = shipColor(s.type);
            return (
              <div className="p-3.5">
                <div className="flex items-start justify-between mb-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[14px]" style={{ color: col }}>{s.name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                            style={{ color: col, background: col+'15', border:`1px solid ${col}44` }}>{s.type}</span>
                      <span className="text-[13px]">{s.flag}</span>
                    </div>
                    <div className="text-[10px] mt-0.5 font-medium" style={{ color: '#6b9db8' }}>{s.cargo}</div>
                  </div>
                  <button onClick={() => setDetail(null)} className="close-btn">✕</button>
                </div>
                <div className="data-grid mb-2.5">
                  <MapDataCell label="DWT"          value={`${(s.dwt/1000).toFixed(0)}k t`} />
                  <MapDataCell label="Speed"         value={`${s.speed} kn`} />
                  <MapDataCell label="Origin"        value={s.origin}      dim />
                  <MapDataCell label="Destination"   value={s.destination} dim />
                  <MapDataCell label="ETA"           value={s.eta}         amber />
                  <MapDataCell label="Status"        value="UNDERWAY"      green />
                </div>
                <div className="text-[8px] uppercase tracking-wider mb-1" style={{ color: '#6b9db8' }}>Route Progress</div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: '#0f2a42' }}>
                  <div className="h-full rounded-full transition-all" style={{ width:`${(s.routeProgress*100).toFixed(0)}%`, background: col }} />
                </div>
                <div className="flex justify-between text-[8px] mt-1">
                  <span style={{ color: '#6b9db8' }}>{s.origin.split(',')[0]}</span>
                  <span className="font-bold" style={{ color: col }}>{(s.routeProgress*100).toFixed(0)}% complete</span>
                  <span style={{ color: '#6b9db8' }}>{s.destination.split(',')[0]}</span>
                </div>
              </div>
            );
          })()}

          {/* CHOKEPOINT */}
          {detail.type === 'chokepoint' && (() => {
            const cp  = detail.data as Chokepoint;
            const col = CP_COLORS[cp.status] ?? '#00e87a';
            return (
              <div className="p-3.5">
                <div className="flex items-start justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[14px]" style={{ color: col }}>{cp.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase"
                          style={{ color: col, background: col+'15', border:`1px solid ${col}44` }}>{cp.status}</span>
                  </div>
                  <button onClick={() => setDetail(null)} className="close-btn">✕</button>
                </div>
                <div className="data-grid mb-2.5">
                  <MapDataCell label="Daily Flow" value={`${cp.throughputMbpd} Mb/d`} />
                  <MapDataCell label="Risk Level" value={`${cp.riskLevel} / 5`} amber={cp.riskLevel >= 4} />
                </div>
                <div className="text-[10px] leading-snug mb-2" style={{ color: '#c0d8ec' }}>{cp.description}</div>
                <div className="text-[8px] uppercase tracking-wider mb-1" style={{ color: '#6b9db8' }}>Disruption Risk</div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: '#0f2a42' }}>
                  <div className="h-full rounded-full" style={{ width:`${cp.riskLevel*20}%`, background: col }} />
                </div>
              </div>
            );
          })()}

          {/* COUNTRY */}
          {detail.type === 'country' && (() => {
            const c        = detail.data as { name: string; id: string };
            const info     = COUNTRY_DATA[c.id];
            const shortage = SHORTAGE_COUNTRIES[c.id];
            if (!info && !shortage) return null;
            const isOpec = OPEC_COUNTRIES.has(c.id);
            const shortageCol = shortage ? SHORTAGE_STROKE[shortage.severity] : null;
            return (
              <div className="p-3.5">
                <div className="flex items-start justify-between mb-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[14px]" style={{ color: '#eaf6ff' }}>{c.name}</span>
                    {isOpec && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                            style={{ color: '#00e87a', background: 'rgba(0,232,122,0.10)', border: '1px solid rgba(0,232,122,0.3)' }}>
                        OPEC+
                      </span>
                    )}
                    {shortage && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase"
                            style={{ color: shortageCol!, background: SHORTAGE_FILL[shortage.severity], border: `1px solid ${shortageCol}44` }}>
                        ⚠ DISRUPTED — {shortage.severity}
                      </span>
                    )}
                    {info?.opecQuota && <span className="text-[9px]" style={{ color: '#6b9db8' }}>Quota: {info.opecQuota}</span>}
                  </div>
                  <button onClick={() => setDetail(null)} className="close-btn">✕</button>
                </div>

                {/* Shortage banner */}
                {shortage && (
                  <div className="mb-2.5 px-3 py-2 rounded border"
                       style={{ background: SHORTAGE_FILL[shortage.severity], borderColor: shortageCol + '44' }}>
                    <div className="text-[10px] font-bold mb-1" style={{ color: shortageCol! }}>{shortage.issue}</div>
                    <div className="text-[9px] leading-snug" style={{ color: '#e0e8f0' }}>{shortage.detail}</div>
                    <div className="text-[8px] mt-1.5 font-semibold" style={{ color: shortageCol! }}>
                      Volume at risk: {shortage.affectedMbpd}
                    </div>
                    <div className="text-[7px] mt-0.5" style={{ color: '#8ab8cc' }}>Source: {shortage.source}</div>
                  </div>
                )}

                {info && (
                  <>
                    <div className="data-grid mb-2.5">
                      <MapDataCell label="Production"    value={info.production}   blue />
                      <MapDataCell label="Reserves"      value={info.reserves}     green />
                      <MapDataCell label="Crude Grade(s)"value={info.grade}        amber span2 />
                      <MapDataCell label="Price Impact"  value={info.priceImpact}  span2 />
                    </div>
                    <div className="text-[10px] leading-snug" style={{ color: '#c0d8ec' }}>{info.note}</div>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/* ── Helpers ─────────────────────────────── */
function MapRow({ label, value, col, bold }: { label: string; value?: string; col: string; bold?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-1.5">
      <span className="w-16 shrink-0" style={{ color: '#6b9db8' }}>{label}</span>
      <span className={bold ? 'font-bold' : ''} style={{ color: col }}>{value}</span>
    </div>
  );
}

function MapDataCell({ label, value, dim, amber, green, blue, span2 }: {
  label: string; value: string;
  dim?: boolean; amber?: boolean; green?: boolean; blue?: boolean; span2?: boolean;
}) {
  const col = blue ? '#00c8f0' : green ? '#00e87a' : amber ? '#ffb300' : dim ? '#c0d8ec' : '#eaf6ff';
  return (
    <div className="data-cell" style={span2 ? { gridColumn: '1 / -1' } : {}}>
      <div className="data-cell-label">{label}</div>
      <div className="data-cell-value text-[11px]" style={{ color: col }}>{value}</div>
    </div>
  );
}
