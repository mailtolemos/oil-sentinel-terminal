import type { TankerShip, Chokepoint, ThreatEvent } from './types';

// ── Major crude oil shipping routes ────────────────────────────
const ROUTES = {
  PG_TO_CHINA: [
    [56.5, 26.0], [57.2, 24.5], [58.0, 22.0], [59.0, 19.0],
    [63.0, 15.0], [68.0, 10.0], [74.0, 7.5], [80.0, 4.5],
    [88.0, 2.5], [96.0, 1.8], [102.0, 1.5], [104.5, 1.3],
    [107.0, 4.5], [110.0, 12.0], [113.0, 18.0], [118.0, 22.5],
    [121.5, 29.0],
  ] as [number, number][],

  PG_TO_JAPAN: [
    [56.5, 26.0], [58.0, 22.0], [65.0, 12.0], [75.0, 6.0],
    [90.0, 2.5], [104.5, 1.3], [110.0, 15.0], [120.0, 25.0],
    [128.0, 30.0], [132.0, 34.0], [136.5, 36.0],
  ] as [number, number][],

  PG_TO_EUROPE_SUEZ: [
    [56.5, 26.0], [54.5, 23.5], [50.0, 17.5], [45.0, 12.5],
    [43.5, 11.2], [42.0, 11.5], [40.5, 14.0], [38.0, 21.0],
    [36.0, 28.5], [32.5, 31.0], [32.8, 32.5], [30.0, 33.5],
    [26.0, 34.5], [20.0, 36.0], [14.0, 38.0], [8.0, 38.5],
    [3.0, 40.0], [-1.0, 44.0], [-5.0, 47.5], [-4.5, 51.5],
    [0.5, 51.5],
  ] as [number, number][],

  PG_TO_EUROPE_CAPE: [
    [56.5, 26.0], [60.0, 20.0], [65.0, 10.0], [68.0, 0.0],
    [60.0, -10.0], [48.0, -20.0], [35.0, -30.0], [20.0, -34.5],
    [18.5, -34.0], [8.0, -30.0], [0.0, -22.0], [-5.0, -12.0],
    [-8.0, 0.0], [-10.0, 10.0], [-8.0, 22.0], [-5.5, 32.0],
    [-3.0, 42.0], [-4.0, 50.0], [0.5, 51.5],
  ] as [number, number][],

  W_AFRICA_TO_EUROPE: [
    [4.5, 2.0], [2.0, 5.0], [-3.0, 12.0], [-6.0, 20.0],
    [-10.0, 28.0], [-10.0, 36.0], [-7.0, 43.5],
    [-4.0, 48.0], [-2.0, 51.0], [1.5, 51.5],
  ] as [number, number][],

  W_AFRICA_TO_US: [
    [4.5, 2.0], [0.0, 5.0], [-10.0, 8.0], [-20.0, 12.0],
    [-35.0, 16.0], [-50.0, 20.0], [-62.0, 24.0], [-70.0, 26.0],
    [-80.0, 27.0], [-85.0, 28.5], [-88.0, 29.0], [-90.0, 29.5],
  ] as [number, number][],

  VENEZUELA_TO_US: [
    [-63.5, 10.5], [-65.0, 14.0], [-68.0, 17.5], [-74.0, 20.0],
    [-78.0, 23.0], [-82.0, 26.0], [-86.0, 28.0], [-89.5, 29.0],
    [-90.2, 29.5],
  ] as [number, number][],

  RUSSIA_BALTIC_TO_EUROPE: [
    [28.5, 59.5], [25.0, 59.0], [20.0, 58.0], [14.0, 57.5],
    [10.5, 57.0], [8.5, 56.5], [5.0, 56.0], [2.5, 53.5],
    [4.0, 51.5],
  ] as [number, number][],

  NORTH_SEA: [
    [2.5, 57.5], [1.5, 56.0], [0.5, 53.5], [1.5, 52.5],
    [3.5, 51.5], [4.0, 52.0],
  ] as [number, number][],

  US_GULF_TO_EUROPE: [
    [-90.0, 29.0], [-87.5, 26.5], [-82.0, 24.0], [-76.0, 30.0],
    [-70.0, 35.5], [-64.0, 40.0], [-50.0, 43.5], [-32.0, 47.0],
    [-18.0, 49.5], [-8.0, 50.5], [-3.0, 52.0], [0.5, 51.5],
  ] as [number, number][],

  ALASKA_TO_JAPAN: [
    [-149.5, 61.0], [-155.0, 58.0], [-162.0, 55.0], [-170.0, 52.5],
    [175.0, 50.0], [165.0, 45.0], [148.0, 40.5], [138.0, 36.5],
    [135.0, 35.0],
  ] as [number, number][],

  RUSSIA_PACIFIC_TO_KOREA: [
    [131.5, 42.5], [132.0, 40.0], [131.0, 37.5], [130.0, 35.5],
    [129.0, 35.0],
  ] as [number, number][],
};

function interpolateRoute(route: [number, number][], progress: number): { lon: number; lat: number; heading: number } {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const totalSegments = route.length - 1;
  const segmentIndex = Math.floor(clampedProgress * totalSegments);
  const segmentProgress = (clampedProgress * totalSegments) - segmentIndex;

  const from = route[Math.min(segmentIndex, totalSegments - 1)];
  const to = route[Math.min(segmentIndex + 1, totalSegments)];

  const lon = from[0] + (to[0] - from[0]) * segmentProgress;
  const lat = from[1] + (to[1] - from[1]) * segmentProgress;

  const dLon = to[0] - from[0];
  const dLat = to[1] - from[1];
  const heading = Math.atan2(dLon, dLat) * (180 / Math.PI);

  return { lon, lat, heading: (heading + 360) % 360 };
}

// Deterministic progress based on ship ID + current hour
function getShipProgress(shipId: string, transitDays: number): number {
  const hash = shipId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const now = Date.now();
  const hoursElapsed = (now / 3600000) % (transitDays * 24);
  const baseProgress = ((hash % 1000) / 1000);
  return (baseProgress + hoursElapsed / (transitDays * 24)) % 1.0;
}

const SHIP_DEFINITIONS = [
  // VLCCs on PG → Asia
  { id: 'vlcc001', name: 'TI Europe', type: 'VLCC' as const, flag: '🇬🇷', route: 'PG_TO_CHINA', origin: 'Ras Tanura, Saudi Arabia', destination: 'Ningbo, China', cargo: 'Arabian Heavy Crude', dwt: 319000, days: 22 },
  { id: 'vlcc002', name: 'Front Ace', type: 'VLCC' as const, flag: '🇳🇴', route: 'PG_TO_CHINA', origin: 'Kuwait Al-Ahmadi', destination: 'Qingdao, China', cargo: 'Kuwait Export Crude', dwt: 308000, days: 22 },
  { id: 'vlcc003', name: 'Oceania', type: 'VLCC' as const, flag: '🇬🇷', route: 'PG_TO_JAPAN', origin: 'Kharg Island, Iran', destination: 'Chiba, Japan', cargo: 'Iranian Heavy Crude', dwt: 298500, days: 24 },
  { id: 'vlcc004', name: 'Pacific Voyager', type: 'VLCC' as const, flag: '🇯🇵', route: 'PG_TO_JAPAN', origin: 'Abu Dhabi, UAE', destination: 'Yokohama, Japan', cargo: 'Murban Crude', dwt: 302000, days: 24 },
  { id: 'vlcc005', name: 'Genmar Constellation', type: 'VLCC' as const, flag: '🇺🇸', route: 'PG_TO_CHINA', origin: 'Ras al-Khair, Saudi Arabia', destination: 'Zhoushan, China', cargo: 'Arab Light Crude', dwt: 321000, days: 22 },
  { id: 'vlcc006', name: 'TI Asia', type: 'VLCC' as const, flag: '🇬🇷', route: 'PG_TO_CHINA', origin: 'Jubail, Saudi Arabia', destination: 'Busan, South Korea', cargo: 'Arab Medium Crude', dwt: 319000, days: 20 },
  // Suezmax on PG → Europe via Suez
  { id: 'smx001', name: 'Minerva Zoe', type: 'Suezmax' as const, flag: '🇬🇷', route: 'PG_TO_EUROPE_SUEZ', origin: 'Basra, Iraq', destination: 'Rotterdam, Netherlands', cargo: 'Basra Light Crude', dwt: 158000, days: 18 },
  { id: 'smx002', name: 'Nordic Hawk', type: 'Suezmax' as const, flag: '🇳🇴', route: 'PG_TO_EUROPE_SUEZ', origin: 'Das Island, UAE', destination: 'Augusta, Italy', cargo: 'Upper Zakum Crude', dwt: 161000, days: 18 },
  { id: 'smx003', name: 'Torm Titan', type: 'Suezmax' as const, flag: '🇩🇰', route: 'PG_TO_EUROPE_SUEZ', origin: 'Mina Al-Ahmadi, Kuwait', destination: 'Trieste, Italy', cargo: 'Kuwait Export Blend', dwt: 155000, days: 17 },
  // VLCCs on PG → Europe via Cape (rerouted)
  { id: 'vlcc007', name: 'TI Africa', type: 'VLCC' as const, flag: '🇬🇷', route: 'PG_TO_EUROPE_CAPE', origin: 'Oman', destination: 'Rotterdam, Netherlands', cargo: 'Omani Crude', dwt: 319000, days: 35 },
  { id: 'vlcc008', name: 'Seaways Andes', type: 'VLCC' as const, flag: '🇺🇸', route: 'PG_TO_EUROPE_CAPE', origin: 'Kharg Island, Iran', destination: 'Flushing, Netherlands', cargo: 'Iranian Light', dwt: 309000, days: 35 },
  // Aframax on West Africa → Europe
  { id: 'afx001', name: 'Elli', type: 'Aframax' as const, flag: '🇬🇷', route: 'W_AFRICA_TO_EUROPE', origin: 'Bonny Light, Nigeria', destination: 'Le Havre, France', cargo: 'Bonny Light Crude', dwt: 105000, days: 12 },
  { id: 'afx002', name: 'Olympic Thunder', type: 'Aframax' as const, flag: '🇬🇷', route: 'W_AFRICA_TO_EUROPE', origin: 'Djeno, Congo', destination: 'Antwerp, Belgium', cargo: 'Congo Blend', dwt: 112000, days: 13 },
  // Suezmax on West Africa → US
  { id: 'smx004', name: 'Torm Troilus', type: 'Suezmax' as const, flag: '🇩🇰', route: 'W_AFRICA_TO_US', origin: 'Cabinda, Angola', destination: 'Port Arthur, TX', cargo: 'Cabinda Crude', dwt: 160000, days: 20 },
  { id: 'smx005', name: 'Nordic Orion', type: 'Suezmax' as const, flag: '🇳🇴', route: 'W_AFRICA_TO_US', origin: 'Escravos, Nigeria', destination: 'Pascagoula, MS', cargo: 'Escravos Crude', dwt: 157000, days: 19 },
  // Aframax Venezuela → US
  { id: 'afx003', name: 'Courage', type: 'Aframax' as const, flag: '🇬🇷', route: 'VENEZUELA_TO_US', origin: 'Jose Terminal, Venezuela', destination: 'Corpus Christi, TX', cargo: 'Boscan Heavy', dwt: 115000, days: 6 },
  // Russia Baltic → Europe
  { id: 'afx004', name: 'SCF Neva', type: 'Aframax' as const, flag: '🇷🇺', route: 'RUSSIA_BALTIC_TO_EUROPE', origin: 'Primorsk, Russia', destination: 'Rotterdam, Netherlands', cargo: 'Urals Crude', dwt: 108000, days: 5 },
  { id: 'afx005', name: 'Maxim Gorky', type: 'Aframax' as const, flag: '🇷🇺', route: 'RUSSIA_BALTIC_TO_EUROPE', origin: 'Ust-Luga, Russia', destination: 'Rotterdam, Netherlands', cargo: 'Urals Crude', dwt: 106000, days: 5 },
  // North Sea
  { id: 'afx006', name: 'Iver Progress', type: 'Aframax' as const, flag: '🇳🇴', route: 'NORTH_SEA', origin: 'Sullom Voe, UK', destination: 'Teesside, UK', cargo: 'Brent Blend', dwt: 100000, days: 3 },
  // US Gulf → Europe
  { id: 'vlcc009', name: 'Phoenix Voyager', type: 'VLCC' as const, flag: '🇺🇸', route: 'US_GULF_TO_EUROPE', origin: 'Houston, TX', destination: 'Rotterdam, Netherlands', cargo: 'WTI Crude', dwt: 315000, days: 16 },
  { id: 'smx006', name: 'Aegean Queen', type: 'Suezmax' as const, flag: '🇬🇷', route: 'US_GULF_TO_EUROPE', origin: 'Port Fourchon, LA', destination: 'Amsterdam, Netherlands', cargo: 'Mars Crude', dwt: 159000, days: 15 },
  // Alaska → Japan
  { id: 'pmax001', name: 'Prince William Sound', type: 'Panamax' as const, flag: '🇺🇸', route: 'ALASKA_TO_JAPAN', origin: 'Valdez, Alaska', destination: 'Yokkaichi, Japan', cargo: 'ANS Crude', dwt: 70000, days: 12 },
  // Russia Pacific → Korea
  { id: 'afx007', name: 'SCF Ural', type: 'Aframax' as const, flag: '🇷🇺', route: 'RUSSIA_PACIFIC_TO_KOREA', origin: 'De-Kastri, Russia', destination: 'Yeosu, South Korea', cargo: 'ESPO Crude', dwt: 104000, days: 3 },
  // Extra ships for density
  { id: 'vlcc010', name: 'Leonardo', type: 'VLCC' as const, flag: '🇮🇹', route: 'PG_TO_CHINA', origin: 'Basra, Iraq', destination: 'Guangzhou, China', cargo: 'Basra Heavy', dwt: 311000, days: 22 },
  { id: 'smx007', name: 'British Pioneer', type: 'Suezmax' as const, flag: '🇬🇧', route: 'PG_TO_EUROPE_SUEZ', origin: 'Bandar Abbas, Iran', destination: 'Milford Haven, UK', cargo: 'Iranian Blend', dwt: 162000, days: 18 },
  { id: 'afx008', name: 'Stena Arctica', type: 'Aframax' as const, flag: '🇸🇪', route: 'RUSSIA_BALTIC_TO_EUROPE', origin: 'Ust-Luga, Russia', destination: 'Gothenburg, Sweden', cargo: 'Urals Crude', dwt: 107000, days: 4 },
  { id: 'vlcc011', name: 'Elandra Swan', type: 'VLCC' as const, flag: '🇬🇧', route: 'PG_TO_EUROPE_CAPE', origin: 'Jubail, Saudi Arabia', destination: 'Europoort, Netherlands', cargo: 'Arab Light Crude', dwt: 317000, days: 35 },
  { id: 'smx008', name: 'Gulf Cobalt', type: 'Suezmax' as const, flag: '🇦🇪', route: 'PG_TO_EUROPE_SUEZ', origin: 'Fujairah, UAE', destination: 'Genoa, Italy', cargo: 'Dubai Crude', dwt: 156000, days: 17 },
  { id: 'afx009', name: 'Delta Captain', type: 'Aframax' as const, flag: '🇬🇷', route: 'W_AFRICA_TO_EUROPE', origin: 'Onne Port, Nigeria', destination: 'Lisbon, Portugal', cargo: 'Nigerian Crude', dwt: 110000, days: 12 },
  { id: 'vlcc012', name: 'Kriti Giant', type: 'VLCC' as const, flag: '🇬🇷', route: 'PG_TO_CHINA', origin: 'Jeddah, Saudi Arabia', destination: 'Dalian, China', cargo: 'Arab Extra Light', dwt: 320000, days: 22 },
];

export function getShips(): TankerShip[] {
  return SHIP_DEFINITIONS.map(def => {
    const routeKey = def.route as keyof typeof ROUTES;
    const route = ROUTES[routeKey];
    const progress = getShipProgress(def.id, def.days);
    const pos = interpolateRoute(route, progress);

    // Speed between 12-16 knots based on type
    const speedBase = def.type === 'VLCC' ? 14 : def.type === 'Suezmax' ? 15 : 14;
    const speed = speedBase + (parseInt(def.id.replace(/\D/g, '')) % 3);

    const daysToArrival = Math.round(def.days * (1 - progress));
    const eta = new Date(Date.now() + daysToArrival * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return {
      id: def.id,
      name: def.name,
      type: def.type,
      flag: def.flag,
      cargo: def.cargo,
      origin: def.origin,
      destination: def.destination,
      lon: pos.lon,
      lat: pos.lat,
      heading: pos.heading,
      speed,
      dwt: def.dwt,
      status: 'underway',
      eta,
      routeProgress: progress,
      route,
    };
  });
}

export const CHOKEPOINTS: Chokepoint[] = [
  {
    id: 'hormuz',
    name: 'Strait of Hormuz',
    lon: 56.5, lat: 26.5,
    status: 'disrupted',
    throughputMbpd: 20,
    riskLevel: 4,
    description: '20 Mb/d — Regional tensions elevated. Iranian naval activity reported.',
  },
  {
    id: 'suez',
    name: 'Suez Canal',
    lon: 32.5, lat: 30.5,
    status: 'open',
    throughputMbpd: 5.5,
    riskLevel: 2,
    description: '5.5 Mb/d — Operating normally. Houthi threat reduced rerouting pressure.',
  },
  {
    id: 'bab_mandeb',
    name: 'Bab el-Mandeb',
    lon: 43.3, lat: 12.6,
    status: 'disrupted',
    throughputMbpd: 6.2,
    riskLevel: 4,
    description: '6.2 Mb/d — Houthi attacks ongoing. Many tankers rerouting via Cape.',
  },
  {
    id: 'malacca',
    name: 'Strait of Malacca',
    lon: 103.8, lat: 1.3,
    status: 'open',
    throughputMbpd: 16,
    riskLevel: 1,
    description: '16 Mb/d — Heaviest tanker traffic globally. Operating normally.',
  },
  {
    id: 'bosphorus',
    name: 'Turkish Straits (Bosphorus)',
    lon: 29.0, lat: 41.0,
    status: 'open',
    throughputMbpd: 2.9,
    riskLevel: 2,
    description: '2.9 Mb/d — Sanctions slowing Russian CPC-blend flows.',
  },
  {
    id: 'cape_hope',
    name: 'Cape of Good Hope',
    lon: 18.5, lat: -34.2,
    status: 'open',
    throughputMbpd: 4.8,
    riskLevel: 1,
    description: '4.8 Mb/d (↑ from 2.9) — Increased traffic rerouting from Red Sea.',
  },
  {
    id: 'panama',
    name: 'Panama Canal',
    lon: -79.5, lat: 9.0,
    status: 'open',
    throughputMbpd: 0.8,
    riskLevel: 1,
    description: '0.8 Mb/d — Water levels normalized. LNG/LPG traffic dominant.',
  },
];

export const THREAT_EVENTS: ThreatEvent[] = [
  {
    id: 'iran_tension',
    region: 'Middle East',
    type: 'Geopolitical',
    severity: 'high',
    title: 'Iran Strait Tensions',
    impact: 'Supply disruption risk to 20 Mb/d',
    priceImpact: '+$4–8/bbl risk premium',
    lon: 54.0, lat: 27.5,
    active: true,
  },
  {
    id: 'houthi',
    region: 'Red Sea',
    type: 'Security',
    severity: 'high',
    title: 'Houthi Maritime Attacks',
    impact: 'Tankers rerouting via Cape (+10 days)',
    priceImpact: '+$2–4/bbl shipping cost',
    lon: 44.0, lat: 14.5,
    active: true,
  },
  {
    id: 'russia_sanctions',
    region: 'Eastern Europe',
    type: 'Sanctions',
    severity: 'medium',
    title: 'Russian Oil Sanctions',
    impact: '3.5 Mb/d under restrictions',
    priceImpact: '+$1–2/bbl tightness',
    lon: 38.0, lat: 51.0,
    active: true,
  },
  {
    id: 'venezuela',
    region: 'South America',
    type: 'Political',
    severity: 'medium',
    title: 'Venezuela Production Cuts',
    impact: 'Output down 0.3 Mb/d from peak',
    priceImpact: '+$0.50–1/bbl',
    lon: -63.0, lat: 9.0,
    active: true,
  },
  {
    id: 'libya_outage',
    region: 'North Africa',
    type: 'Supply Disruption',
    severity: 'medium',
    title: 'Libya Field Outages',
    impact: 'Sharara field disrupted 0.3 Mb/d',
    priceImpact: '+$0.50/bbl',
    lon: 13.5, lat: 27.0,
    active: true,
  },
  {
    id: 'nigeria_militancy',
    region: 'West Africa',
    type: 'Security',
    severity: 'low',
    title: 'Niger Delta Unrest',
    impact: 'Pipeline vandalism risk',
    priceImpact: '+$0.25–0.50/bbl',
    lon: 6.0, lat: 5.0,
    active: true,
  },
  {
    id: 'opec_meeting',
    region: 'Global',
    type: 'OPEC+',
    severity: 'medium',
    title: 'OPEC+ Production Review',
    impact: 'Voluntary cuts maintained through Q3',
    priceImpact: '+$2–3/bbl support',
    lon: 46.7, lat: 24.7,
    active: true,
  },
  {
    id: 'china_spr',
    region: 'Asia Pacific',
    type: 'Demand',
    severity: 'low',
    title: 'China SPR Release',
    impact: 'Strategic reserve drawdown 10 Mb',
    priceImpact: '-$0.50/bbl short-term',
    lon: 116.0, lat: 35.0,
    active: false,
  },
];
