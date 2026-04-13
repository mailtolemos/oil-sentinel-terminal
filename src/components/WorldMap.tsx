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

const OPEC_COUNTRIES = new Set([
  '682','368','364','784','414','862','434','012','566','266','178','226','634',
  '643','860','398','031','288','706','729',
]);

const COUNTRY_DATA: Record<string, {
  production: string; reserves: string; grade: string;
  note: string; opecQuota?: string; priceImpact: string;
}> = {
  '682': { production: '12.0 Mb/d', reserves: '267 Gb', grade: 'Arab Light / Arab Heavy', opecQuota: '10.0 Mb/d', note: 'World\'s swing producer. Aramco spare capacity ~2 Mb/d acts as global price buffer.', priceImpact: 'Output cut → +$4–8/bbl' },
  '368': { production: '4.4 Mb/d', reserves: '145 Gb', grade: 'Basra Light / Basra Heavy', opecQuota: '4.0 Mb/d', note: 'Basra Oil Terminal handles 1.8 Mb/d. Political instability a chronic risk.', priceImpact: 'Disruption → +$2–5/bbl' },
  '364': { production: '3.2 Mb/d', reserves: '208 Gb', grade: 'Iranian Heavy / Iranian Light', note: 'Under US OFAC sanctions since 2018. Grey-market exports to China ~1.8 Mb/d via Malaysia transshipment.', priceImpact: 'Sanctions lift → −$4–6/bbl' },
  '784': { production: '3.8 Mb/d', reserves: '97 Gb', grade: 'Murban / Upper Zakum / Das Blend', opecQuota: '3.2 Mb/d', note: 'ADNOC targeting 5 Mb/d by 2027. Murban futures listed on ICE Abu Dhabi since 2021.', priceImpact: 'Expansion → −$1–3/bbl long-term' },
  '414': { production: '2.7 Mb/d', reserves: '102 Gb', grade: 'Kuwait Export Crude (KEC)', opecQuota: '2.5 Mb/d', note: 'Al-Ahmadi terminal one of world\'s largest. Mina Al-Ahmadi refinery processes 940 kb/d.', priceImpact: 'Cut → +$1–3/bbl' },
  '862': { production: '0.7 Mb/d', reserves: '303 Gb', grade: 'Merey / Hamaca (extra-heavy)', note: 'World\'s largest proven reserves — but heavy, expensive to extract. US sanctions cap output at ~600 kb/d.', priceImpact: 'Sanctions relief → −$0.5–2/bbl' },
  '643': { production: '10.1 Mb/d', reserves: '80 Gb', grade: 'Urals / ESPO / Siberian Light', note: 'G7 price cap $60/bbl. Shadow fleet of 400+ tankers routes to India and China. Baltic Urals trading at ~$15 discount to Brent.', priceImpact: 'Cap enforcement → +$3–6/bbl' },
  '566': { production: '1.3 Mb/d', reserves: '37 Gb', grade: 'Bonny Light / Forcados / Qua Iboe', opecQuota: '1.5 Mb/d', note: 'Chronic pipeline vandalism in Niger Delta. NNPC estimates ~400 kb/d theft losses.', priceImpact: 'Outage → +$0.5–2/bbl' },
  '012': { production: '1.1 Mb/d', reserves: '12 Gb', grade: 'Saharan Blend (light sweet)', opecQuota: '1.0 Mb/d', note: 'Hassi Messaoud remains primary field. Mature basin, declining naturally ~3% annually.', priceImpact: 'Decline → marginal +$0.25/bbl' },
  '434': { production: '1.2 Mb/d', reserves: '48 Gb', grade: 'Es Sider / Sharara / El Feel', note: 'Sharara field (300 kb/d) subject to tribal blockades. Civil war risk suppresses investment.', priceImpact: 'Blockade → +$0.5–1.5/bbl' },
  '288': { production: '0.17 Mb/d', reserves: '0.66 Gb', grade: 'Jubilee / TEN offshore', note: 'Offshore Jubilee (105 kb/d) and TEN (50 kb/d). Small but growing sub-Saharan producer.', priceImpact: 'Minor supply contributor' },
};

const CHOKEPOINT_COLORS: Record<string, string> = {
  open: '#00ff88', disrupted: '#ffaa00', critical: '#ff5522', closed: '#ff0000',
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
  price: number;
  bias: string;
  signals: { name: string; value: string; direction: string }[];
  target7d: number;
  target7dLow: number;
  target7dHigh: number;
}

type DetailType = 'ship' | 'chokepoint' | 'country';
interface DetailPanel {
  type: DetailType;
  data: TankerShip | Chokepoint | { name: string; id: string };
}

export default function WorldMap() {
  const [ships, setShips]             = useState<TankerShip[]>([]);
  const [chokepoints, setChokepoints] = useState<Chokepoint[]>([]);
  const [threats, setThreats]         = useState<ThreatEvent[]>([]);
  const [stats, setStats]             = useState<Record<string, number | string>>({});
  const [zoom, setZoom]               = useState(1);
  const [center, setCenter]           = useState<[number, number]>([20, 15]);
  const [pulsePhase, setPulsePhase]   = useState(0);
  const [detail, setDetail]           = useState<DetailPanel | null>(null);
  const [tradeSignal, setTradeSignal] = useState<TradeSignal | null>(null);

  // Hover state – one for each element type
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
      setShips(d.ships ?? []);
      setChokepoints(d.chokepoints ?? []);
      setThreats(d.threats ?? []);
      setStats(d.stats ?? {});
    } catch {}
  }, []);

  // Fetch trade signal from projection API
  useEffect(() => {
    const fetchSignal = async () => {
      try {
        const r = await fetch('/api/projection?symbol=BZ%3DF');
        const d = await r.json();
        if (d.error) return;
        setTradeSignal({
          price: d.currentPrice,
          bias: d.bias,
          signals: d.signals ?? [],
          target7d:     d.projections?.[0]?.price    ?? d.currentPrice,
          target7dLow:  d.projections?.[0]?.low      ?? d.currentPrice,
          target7dHigh: d.projections?.[0]?.high     ?? d.currentPrice,
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
    return () => {
      clearInterval(interval);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [fetchData]);

  const pulseScale = 1 + Math.sin((pulsePhase / 120) * Math.PI * 2) * 0.4;
  const slowPulse  = 1 + Math.sin((pulsePhase / 120) * Math.PI * 2) * 0.25;

  function shipColor(type: TankerShip['type']) {
    return type === 'VLCC'    ? '#00d4ff'
         : type === 'Suezmax' ? '#22ccee'
         : type === 'Aframax' ? '#44aacc'
         : '#2299bb';
  }

  function getMousePos(e: React.MouseEvent): TooltipPos {
    return { x: e.clientX, y: e.clientY };
  }

  function biasColor(bias: string) {
    if (bias?.includes('bullish')) return '#00ff88';
    if (bias?.includes('bearish')) return '#ff3344';
    return '#ffaa00';
  }
  function biasLabel(bias: string) {
    const map: Record<string, string> = {
      strongly_bullish: '▲▲ STRONG BUY',
      bullish:          '▲  BUY',
      neutral:          '◆  HOLD / WATCH',
      bearish:          '▼  SELL',
      strongly_bearish: '▼▼ STRONG SELL',
    };
    return map[bias] ?? '◆  NEUTRAL';
  }

  function handleShipClick(ship: TankerShip)   { setDetail(detail?.type === 'ship'       && (detail.data as TankerShip).id  === ship.id  ? null : { type: 'ship',       data: ship }); }
  function handleCpClick(cp: Chokepoint)        { setDetail(detail?.type === 'chokepoint' && (detail.data as Chokepoint).id  === cp.id    ? null : { type: 'chokepoint', data: cp }); }
  function handleCountryClick(id: string, name: string) {
    if (!COUNTRY_DATA[id]) return;
    setDetail(detail?.type === 'country' && (detail.data as { id: string }).id === id ? null : { type: 'country', data: { name, id } });
  }

  const panelOpen = !!detail;

  return (
    <div className="relative w-full h-full bg-[#020c18] overflow-hidden select-none">

      {/* ── Stat bar ──────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-3 px-3 py-1.5
                      bg-[#020c18]/95 border-b border-[#112840] backdrop-blur-sm">
        <span className="font-['Orbitron'] text-[8px] tracking-widest text-[#5a8aaa] shrink-0">CRUDE INTELLIGENCE</span>
        <span className="w-px h-3 bg-[#112840]" />
        <span className="text-[#00d4ff] text-[9px] font-bold">⬡ {stats.totalShips ?? '—'} TANKERS</span>
        <span className="text-[#5a8aaa] text-[9px]">VLCC <b className="text-[#a8cce0]">{stats.vlccs ?? '—'}</b></span>
        <span className="text-[#5a8aaa] text-[9px]">Suezmax <b className="text-[#a8cce0]">{stats.suezmax ?? '—'}</b></span>
        <span className="text-[#5a8aaa] text-[9px]">Aframax <b className="text-[#a8cce0]">{stats.aframax ?? '—'}</b></span>
        <span className="w-px h-3 bg-[#112840]" />
        <span className="text-[#ffaa00] text-[9px]">⚠ Hormuz ELEVATED</span>
        <span className="text-[#ff3344] text-[9px]">⚠ Red Sea ACTIVE</span>
        <div className="ml-auto flex items-center gap-1.5 text-[#00ff88] text-[9px]">
          <div className="w-1.5 h-1.5 bg-[#00ff88] rounded-full animate-pulse" />
          AIS LIVE
        </div>
      </div>

      {/* ── Map ───────────────────────────────────── */}
      <ComposableMap
        projection="geoNaturalEarth1"
        projectionConfig={{ scale: 170, center: [20, 10] }}
        style={{ width: '100%', height: '100%', background: 'transparent' }}
        onClick={() => setDetail(null)}
      >
        <ZoomableGroup
          zoom={zoom} center={center}
          onMoveEnd={({ zoom: z, coordinates: c }) => { setZoom(z); setCenter(c); }}
        >
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
                const isOpec    = OPEC_COUNTRIES.has(geo.id);
                const hasData   = !!COUNTRY_DATA[geo.id];
                const isSelected = detail?.type === 'country' && (detail.data as { id: string }).id === geo.id;
                const isHovered  = hoverCountry?.id === geo.id;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={isSelected ? '#1d4a6e' : isHovered && hasData ? '#16384e' : isOpec ? '#0d2a14' : '#091520'}
                    stroke={isSelected ? '#00d4ff' : isOpec ? '#1a4020' : '#0d2035'}
                    strokeWidth={isSelected ? 0.9 : 0.4}
                    onMouseEnter={(e) => {
                      if (geo.properties.name) {
                        setHoverCountry({ id: geo.id, name: geo.properties.name, pos: getMousePos(e) });
                      }
                    }}
                    onMouseMove={(e) => {
                      setHoverCountry(prev => prev ? { ...prev, pos: getMousePos(e) } : null);
                    }}
                    onMouseLeave={() => setHoverCountry(null)}
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

          {/* Threat zones */}
          {threats.filter(t => t.active).map(t => {
            const col = t.severity === 'critical' ? '#ff0022' : t.severity === 'high' ? '#ff3344' : '#ffaa00';
            const r   = t.severity === 'critical' ? 14 : t.severity === 'high' ? 12 : 9;
            return (
              <Marker key={t.id} coordinates={[t.lon, t.lat]}
                onMouseEnter={(e) => setHoverThreat({ t, pos: getMousePos(e as unknown as React.MouseEvent) })}
                onMouseMove={(e)  => setHoverThreat(prev => prev ? { ...prev, pos: getMousePos(e as unknown as React.MouseEvent) } : null)}
                onMouseLeave={() => setHoverThreat(null)}
              >
                <circle r={r * slowPulse} fill="none" stroke={col} strokeWidth={0.5} opacity={0.18} />
                <circle r={r} fill="none" stroke={col} strokeWidth={0.8}
                  opacity={0.35 + (pulsePhase / 120) * 0.35} />
                <circle r={t.severity === 'critical' ? 5 : 3.5}
                  fill={col + '44'} stroke={col} strokeWidth={1} style={{ cursor: 'crosshair' }} />
                {/* Severity label */}
                <text y={r + 8} textAnchor="middle"
                  style={{ fontSize: '4.5px', fill: col + 'cc', fontFamily: 'JetBrains Mono', fontWeight: 700, letterSpacing: '0.3px' }}>
                  {t.title.toUpperCase().slice(0, 18)}
                </text>
              </Marker>
            );
          })}

          {/* Chokepoints */}
          {chokepoints.map(cp => {
            const col        = CHOKEPOINT_COLORS[cp.status] ?? '#00ff88';
            const isSelected = detail?.type === 'chokepoint' && (detail.data as Chokepoint).id === cp.id;
            return (
              <Marker key={cp.id} coordinates={[cp.lon, cp.lat]}
                onMouseEnter={(e) => setHoverCp({ cp, pos: getMousePos(e as unknown as React.MouseEvent) })}
                onMouseMove={(e)  => setHoverCp(prev => prev ? { ...prev, pos: getMousePos(e as unknown as React.MouseEvent) } : null)}
                onMouseLeave={() => setHoverCp(null)}
                onClick={(e)  => { (e as unknown as Event).stopPropagation(); handleCpClick(cp); }}
              >
                <circle r={isSelected ? 14 : 10 * pulseScale} fill="none" stroke={col}
                  strokeWidth={isSelected ? 1.5 : 0.7}
                  opacity={isSelected ? 0.8 : 0.25 * (1 - pulsePhase / 120)} />
                <circle r={7} fill="none" stroke={col} strokeWidth={1.2} opacity={0.75} />
                <polygon points="0,-6 6,0 0,6 -6,0"
                  fill={isSelected ? col + '55' : col + '22'} stroke={col} strokeWidth={1.3}
                  style={{ cursor: 'pointer' }} />
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
            const isSelected = detail?.type === 'ship' && (detail.data as TankerShip).id === ship.id;
            return (
              <Marker key={ship.id} coordinates={[ship.lon, ship.lat]}
                onMouseEnter={(e) => setHoverShip({ ship, pos: getMousePos(e as unknown as React.MouseEvent) })}
                onMouseMove={(e)  => setHoverShip(prev => prev ? { ...prev, pos: getMousePos(e as unknown as React.MouseEvent) } : null)}
                onMouseLeave={() => setHoverShip(null)}
                onClick={(e) => { (e as unknown as Event).stopPropagation(); handleShipClick(ship); }}
              >
                {isSelected && <circle r={9} fill="none" stroke={col} strokeWidth={1.2} opacity={0.9} />}
                <line x1={0} y1={0} x2={-tip.x * 0.9} y2={-tip.y * 0.9}
                  stroke={col} strokeWidth={0.7} opacity={0.35} />
                <polygon points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`}
                  fill={col} opacity={isSelected ? 1 : 0.9} style={{ cursor: 'pointer' }} />
                <circle r={1.2} fill={col} opacity={0.7} />
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>

      {/* ── TRADE SIGNAL WIDGET (top-right) ──────── */}
      {tradeSignal && (
        <div className="absolute top-9 right-3 z-20 w-[168px]
                        bg-[#040d1a]/96 border border-[#112840] backdrop-blur-md"
             style={{ borderTopColor: biasColor(tradeSignal.bias) + '80' }}>
          <div className="px-2.5 pt-2 pb-1 border-b border-[#112840]">
            <div className="flex items-center justify-between mb-0.5">
              <span className="font-['Orbitron'] text-[8px] tracking-widest text-[#5a8aaa]">BRENT SIGNAL</span>
              <span className="text-[9px] font-bold" style={{ color: biasColor(tradeSignal.bias) }}>
                {biasLabel(tradeSignal.bias)}
              </span>
            </div>
            {/* Big price */}
            <div className="flex items-end gap-1.5">
              <span className="text-[24px] font-bold tabular-nums leading-none"
                    style={{ color: biasColor(tradeSignal.bias) }}>
                ${tradeSignal.price.toFixed(2)}
              </span>
              <span className="text-[10px] text-[#5a8aaa] mb-0.5">/bbl</span>
            </div>
          </div>

          {/* 7-day target */}
          <div className="px-2.5 py-2 border-b border-[#112840] bg-[#060e1c]/60">
            <div className="text-[8px] text-[#5a8aaa] uppercase tracking-wider font-bold mb-1">7-Day Target</div>
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] font-bold tabular-nums"
                    style={{ color: tradeSignal.target7d > tradeSignal.price ? '#00ff88' : '#ff3344' }}>
                ${tradeSignal.target7d.toFixed(2)}
              </span>
              <span className="text-[10px] font-semibold"
                    style={{ color: tradeSignal.target7d > tradeSignal.price ? '#00ff88' : '#ff3344' }}>
                {tradeSignal.target7d > tradeSignal.price ? '▲' : '▼'}
                {' '}{Math.abs(tradeSignal.target7d - tradeSignal.price).toFixed(2)}
              </span>
            </div>
            <div className="text-[8px] text-[#7aaccc] mt-0.5">
              Range ${tradeSignal.target7dLow.toFixed(1)} – ${tradeSignal.target7dHigh.toFixed(1)}
            </div>
          </div>

          {/* Signals */}
          <div className="px-2.5 py-2">
            {tradeSignal.signals.slice(0, 4).map((sig, i) => (
              <div key={i} className="flex items-center justify-between gap-1 mb-1.5 last:mb-0">
                <span className="text-[8px] text-[#7aaccc] truncate">{sig.name}</span>
                <span className="text-[9px] font-bold shrink-0"
                      style={{ color: sig.direction === 'bullish' ? '#00ff88' : sig.direction === 'bearish' ? '#ff3344' : '#ffaa00' }}>
                  {sig.value}
                </span>
              </div>
            ))}
          </div>

          {/* Bias bar */}
          <div className="px-2.5 pb-2.5">
            <div className="h-1.5 bg-[#112840] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000"
                   style={{
                     width: tradeSignal.bias === 'strongly_bullish' ? '95%'
                          : tradeSignal.bias === 'bullish'           ? '70%'
                          : tradeSignal.bias === 'neutral'           ? '50%'
                          : tradeSignal.bias === 'bearish'           ? '30%'
                          : '10%',
                     background: `linear-gradient(90deg, #ff3344, #ffaa00, #00ff88)`,
                   }} />
            </div>
            <div className="flex justify-between text-[8px] text-[#5a8aaa] mt-1 font-bold">
              <span>BEAR</span><span>BULL</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Zoom controls ─────────────────────────── */}
      <div className="absolute right-3 flex flex-col gap-1 z-20"
           style={{ bottom: panelOpen ? '220px' : '44px', transition: 'bottom 0.25s ease' }}>
        {[
          { label: '+', fn: () => setZoom(z => Math.min(z * 1.6, 10)) },
          { label: '−', fn: () => setZoom(z => Math.max(z / 1.6, 1)) },
          { label: '⌂', fn: () => { setZoom(1); setCenter([20, 15]); setDetail(null); } },
        ].map(btn => (
          <button key={btn.label} onClick={btn.fn}
            className="w-7 h-7 flex items-center justify-center text-[#00d4ff] border border-[#112840]
                       bg-[#060e1c] hover:bg-[#0d2238] hover:border-[#00d4ff]/50 text-[14px] font-bold
                       transition-all rounded-sm shadow-lg">
            {btn.label}
          </button>
        ))}
      </div>

      {/* ── Legend ────────────────────────────────── */}
      <div className="absolute left-2 z-20 bg-[#040d1a]/95 border border-[#112840] px-2.5 py-2 text-[8px] backdrop-blur-sm"
           style={{ bottom: panelOpen ? '220px' : '8px', transition: 'bottom 0.25s ease' }}>
        <div className="text-[#a8cce0] font-['Orbitron'] text-[8px] tracking-wider mb-1.5 font-bold">LEGEND</div>
        {[
          { color: '#00d4ff', label: 'VLCC (>200k DWT)',     dot: true },
          { color: '#22ccee', label: 'Suezmax (120–200k)',    dot: true },
          { color: '#44aacc', label: 'Aframax (<120k DWT)',   dot: true },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5 mb-0.5">
            <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: l.color }} />
            <span style={{ color: '#a8cce0' }}>{l.label}</span>
          </div>
        ))}
        <div className="border-t border-[#112840] pt-1 mt-1 space-y-0.5">
          {[
            { color: '#00ff88', label: 'Chokepoint — Open',     shape: 'diamond' },
            { color: '#ffaa00', label: 'Chokepoint — Disrupted', shape: 'diamond' },
            { color: '#ff3344', label: 'Threat Zone — Active',   shape: 'circle' },
            { color: '#0d2a14', label: 'OPEC+ Country',          shape: 'fill' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              {l.shape === 'fill'
                ? <div className="w-2 h-2 rounded-sm border border-green-900/60 shrink-0"
                       style={{ background: '#0d2a14' }} />
                : <div className="w-2 h-2 rounded-full border shrink-0"
                       style={{ borderColor: l.color, background: l.color + '22' }} />
              }
              <span style={{ color: '#a8cce0' }}>{l.label}</span>
            </div>
          ))}
        </div>
        <div className="text-[#5a8aaa] text-[8px] mt-1.5 pt-1 border-t border-[#112840]">
          Hover for info · Click to expand
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          HOVER TOOLTIPS — always visible, all types
          ═══════════════════════════════════════════ */}

      {/* SHIP hover */}
      {hoverShip && (
        <div className="fixed z-50 pointer-events-none"
             style={{ left: hoverShip.pos.x + 16, top: hoverShip.pos.y - 8 }}>
          <div className="bg-[#030d1c]/98 border border-[#00d4ff]/40 shadow-[0_4px_24px_rgba(0,0,0,0.8)]
                          min-w-[210px] text-[9px]">
            {/* Header */}
            <div className="flex items-center gap-2 px-2.5 py-2 border-b border-[#112840] bg-[#00d4ff]/6">
              <span className="font-bold text-[11px] text-[#00d4ff]">{hoverShip.ship.name}</span>
              <span className="text-[8px] px-1.5 py-0.5 bg-[#00d4ff]/12 border border-[#00d4ff]/30 text-[#00d4ff] rounded font-bold">{hoverShip.ship.type}</span>
              <span className="text-[12px] ml-auto">{hoverShip.ship.flag}</span>
            </div>
            {/* Body */}
            <div className="px-2.5 py-2 space-y-1">
              <Row label="Cargo"   value={hoverShip.ship.cargo}       col="#e2f4ff" bold />
              <Row label="From"    value={hoverShip.ship.origin}       col="#a8cce0" />
              <Row label="To"      value={hoverShip.ship.destination}  col="#a8cce0" />
              <Row label="Speed"   value={`${hoverShip.ship.speed} kn`} col="#a8cce0" />
              <Row label="DWT"     value={`${(hoverShip.ship.dwt/1000).toFixed(0)}k t`} col="#a8cce0" />
              <Row label="ETA"     value={hoverShip.ship.eta}          col="#ffaa00" bold />
            </div>
            {/* Progress */}
            <div className="px-2.5 pb-2">
              <div className="flex justify-between text-[7px] text-[#5a8aaa] mb-0.5">
                <span>Route progress</span>
                <span className="text-[#00d4ff] font-bold">{(hoverShip.ship.routeProgress * 100).toFixed(0)}%</span>
              </div>
              <div className="h-1.5 bg-[#112840] rounded-full overflow-hidden">
                <div className="h-full bg-[#00d4ff] rounded-full transition-all"
                     style={{ width: `${(hoverShip.ship.routeProgress * 100).toFixed(0)}%` }} />
              </div>
            </div>
            <div className="px-2.5 pb-1.5 text-[7px] text-[#3a5a72] italic">Click ship for full details panel</div>
          </div>
        </div>
      )}

      {/* CHOKEPOINT hover */}
      {hoverCp && (
        <div className="fixed z-50 pointer-events-none"
             style={{ left: hoverCp.pos.x + 16, top: hoverCp.pos.y - 8 }}>
          <div className="bg-[#030d1c]/98 shadow-[0_4px_24px_rgba(0,0,0,0.8)] min-w-[220px] text-[9px]"
               style={{ border: `1px solid ${CHOKEPOINT_COLORS[hoverCp.cp.status]}55` }}>
            <div className="flex items-center gap-2 px-2.5 py-2 border-b border-[#112840]"
                 style={{ background: CHOKEPOINT_COLORS[hoverCp.cp.status] + '0a' }}>
              <span className="font-bold text-[11px]" style={{ color: CHOKEPOINT_COLORS[hoverCp.cp.status] }}>
                {hoverCp.cp.name}
              </span>
              <span className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ml-auto"
                    style={{ color: CHOKEPOINT_COLORS[hoverCp.cp.status],
                             background: CHOKEPOINT_COLORS[hoverCp.cp.status] + '15',
                             border: `1px solid ${CHOKEPOINT_COLORS[hoverCp.cp.status]}44` }}>
                {hoverCp.cp.status}
              </span>
            </div>
            <div className="px-2.5 py-2 space-y-1">
              <Row label="Daily Flow" value={`${hoverCp.cp.throughputMbpd} Mb/d`} col="#e2f4ff" bold />
              <div className="flex items-center gap-1.5">
                <span className="text-[#5a8aaa] w-16 shrink-0">Risk</span>
                <div className="flex gap-0.5">
                  {Array.from({length:5}).map((_,i)=>(
                    <span key={i} style={{ color: i < hoverCp.cp.riskLevel ? '#ff3344' : '#1a3a52' }}>█</span>
                  ))}
                </div>
                <span className="text-[#a8cce0] font-bold">{hoverCp.cp.riskLevel}/5</span>
              </div>
              <div className="text-[8px] text-[#a8cce0] leading-snug pt-0.5">{hoverCp.cp.description}</div>
            </div>
            <div className="px-2.5 pb-1.5 text-[7px] text-[#3a5a72] italic">Click for expanded details</div>
          </div>
        </div>
      )}

      {/* THREAT ZONE hover */}
      {hoverThreat && (
        <div className="fixed z-50 pointer-events-none"
             style={{ left: hoverThreat.pos.x + 16, top: hoverThreat.pos.y - 8 }}>
          <div className="bg-[#030d1c]/98 shadow-[0_4px_24px_rgba(0,0,0,0.8)] min-w-[220px] text-[9px]"
               style={{ border: `1px solid ${hoverThreat.t.severity === 'critical' ? '#ff0022' : hoverThreat.t.severity === 'high' ? '#ff3344' : '#ffaa00'}55` }}>
            {(() => {
              const col = hoverThreat.t.severity === 'critical' ? '#ff0022' : hoverThreat.t.severity === 'high' ? '#ff3344' : '#ffaa00';
              return (
                <>
                  <div className="flex items-center gap-2 px-2.5 py-2 border-b border-[#112840]"
                       style={{ background: col + '0a' }}>
                    <span className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase"
                          style={{ color: col, background: col+'15', border:`1px solid ${col}44` }}>
                      ⚠ {hoverThreat.t.severity}
                    </span>
                    <span className="font-bold text-[10px] text-[#e2f4ff]">{hoverThreat.t.title}</span>
                  </div>
                  <div className="px-2.5 py-2 space-y-1">
                    <Row label="Region" value={hoverThreat.t.region}      col="#a8cce0" />
                    <Row label="Type"   value={hoverThreat.t.type}        col="#a8cce0" />
                    <Row label="Impact" value={hoverThreat.t.impact}      col="#e2f4ff" bold />
                    <Row label="Price"  value={hoverThreat.t.priceImpact} col={col}     bold />
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* COUNTRY hover */}
      {hoverCountry && (
        <div className="fixed z-50 pointer-events-none"
             style={{ left: hoverCountry.pos.x + 16, top: hoverCountry.pos.y - 8 }}>
          {COUNTRY_DATA[hoverCountry.id] ? (
            <div className="bg-[#030d1c]/98 border border-[#00ff88]/25 shadow-[0_4px_24px_rgba(0,0,0,0.8)] min-w-[220px] text-[9px]">
              <div className="flex items-center gap-2 px-2.5 py-2 border-b border-[#112840] bg-[#00ff88]/5">
                <span className="font-bold text-[11px] text-[#e2f4ff]">{hoverCountry.name}</span>
                {OPEC_COUNTRIES.has(hoverCountry.id) && (
                  <span className="text-[7px] px-1.5 py-0.5 bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88] rounded font-bold ml-auto">OPEC+</span>
                )}
              </div>
              <div className="px-2.5 py-2 space-y-1">
                <Row label="Production" value={COUNTRY_DATA[hoverCountry.id].production} col="#00d4ff" bold />
                <Row label="Reserves"   value={COUNTRY_DATA[hoverCountry.id].reserves}   col="#00ff88" bold />
                <Row label="Grade"      value={COUNTRY_DATA[hoverCountry.id].grade}       col="#ffaa00" />
                <Row label="Price Δ"    value={COUNTRY_DATA[hoverCountry.id].priceImpact} col="#ff9944" />
                {COUNTRY_DATA[hoverCountry.id].opecQuota && (
                  <Row label="OPEC Quota" value={COUNTRY_DATA[hoverCountry.id].opecQuota!} col="#a8cce0" />
                )}
                <div className="text-[8px] text-[#7aaccc] leading-snug pt-0.5 border-t border-[#112840] mt-1">
                  {COUNTRY_DATA[hoverCountry.id].note}
                </div>
              </div>
              <div className="px-2.5 pb-1.5 text-[7px] text-[#3a5a72] italic">Click to expand details</div>
            </div>
          ) : (
            /* Non-data country: just show name */
            <div className="bg-[#030d1c]/95 border border-[#112840] px-2.5 py-1.5 text-[9px] text-[#a8cce0] shadow-lg">
              {hoverCountry.name}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════
          CLICK DETAIL PANEL (slide-up)
          ═══════════════════════════════════ */}
      {detail && (
        <div className="absolute bottom-0 left-0 right-0 z-30 map-detail-panel">

          {/* SHIP */}
          {detail.type === 'ship' && (() => {
            const s = detail.data as TankerShip;
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
                    <div className="text-[#5a8aaa] text-[10px] mt-0.5 font-medium">{s.cargo}</div>
                  </div>
                  <button onClick={() => setDetail(null)} className="close-btn">✕</button>
                </div>
                <div className="data-grid mb-2.5">
                  <DataCell label="DWT"         value={`${(s.dwt/1000).toFixed(0)}k t`} />
                  <DataCell label="Speed"        value={`${s.speed} kn`} />
                  <DataCell label="Origin"       value={s.origin}       dim />
                  <DataCell label="Destination"  value={s.destination}  dim />
                  <DataCell label="ETA"          value={s.eta}          amber />
                  <DataCell label="Status"       value="UNDERWAY"       green />
                </div>
                <div className="text-[#5a8aaa] text-[8px] mb-1 uppercase tracking-wider">Route Progress</div>
                <div className="h-2 bg-[#112840] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width:`${(s.routeProgress*100).toFixed(0)}%`, background: col }} />
                </div>
                <div className="flex justify-between text-[8px] mt-1">
                  <span className="text-[#5a8aaa]">{s.origin.split(',')[0]}</span>
                  <span className="font-bold" style={{ color: col }}>{(s.routeProgress*100).toFixed(0)}% complete</span>
                  <span className="text-[#5a8aaa]">{s.destination.split(',')[0]}</span>
                </div>
              </div>
            );
          })()}

          {/* CHOKEPOINT */}
          {detail.type === 'chokepoint' && (() => {
            const cp  = detail.data as Chokepoint;
            const col = CHOKEPOINT_COLORS[cp.status] ?? '#00ff88';
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
                  <DataCell label="Daily Flow" value={`${cp.throughputMbpd} Mb/d`} />
                  <DataCell label="Risk Level" value={`${cp.riskLevel} / 5`} amber={cp.riskLevel >= 4} />
                </div>
                <div className="text-[#a8cce0] text-[10px] leading-snug mb-2">{cp.description}</div>
                <div className="text-[8px] text-[#5a8aaa] uppercase tracking-wider mb-1">Disruption Risk</div>
                <div className="h-2 bg-[#112840] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width:`${cp.riskLevel*20}%`, background: col }} />
                </div>
              </div>
            );
          })()}

          {/* COUNTRY */}
          {detail.type === 'country' && (() => {
            const c    = detail.data as { name: string; id: string };
            const info = COUNTRY_DATA[c.id];
            if (!info) return null;
            const isOpec = OPEC_COUNTRIES.has(c.id);
            return (
              <div className="p-3.5">
                <div className="flex items-start justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[#e2f4ff] font-bold text-[14px]">{c.name}</span>
                    {isOpec && <span className="text-[9px] px-1.5 py-0.5 bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88] rounded font-bold">OPEC+</span>}
                    {info.opecQuota && <span className="text-[9px] text-[#5a8aaa]">Quota: {info.opecQuota}</span>}
                  </div>
                  <button onClick={() => setDetail(null)} className="close-btn">✕</button>
                </div>
                <div className="data-grid mb-2.5">
                  <DataCell label="Production" value={info.production} blue />
                  <DataCell label="Reserves"   value={info.reserves}   green />
                  <DataCell label="Crude Grade(s)" value={info.grade}  amber span2 />
                  <DataCell label="Price Impact"   value={info.priceImpact} span2 />
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

/* ── Tiny helpers ─────────────────────── */
function Row({ label, value, col, bold }: { label: string; value: string; col: string; bold?: boolean }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-[#5a8aaa] w-16 shrink-0">{label}</span>
      <span className={bold ? 'font-bold' : ''} style={{ color: col }}>{value}</span>
    </div>
  );
}

function DataCell({ label, value, dim, amber, green, blue, span2 }: {
  label: string; value: string;
  dim?: boolean; amber?: boolean; green?: boolean; blue?: boolean; span2?: boolean;
}) {
  const col = blue ? '#00d4ff' : green ? '#00ff88' : amber ? '#ffaa00' : dim ? '#a8cce0' : '#e2f4ff';
  return (
    <div className="data-cell" style={span2 ? { gridColumn: '1 / -1' } : {}}>
      <div className="data-cell-label">{label}</div>
      <div className="data-cell-value text-[11px]" style={{ color: col }}>{value}</div>
    </div>
  );
}
