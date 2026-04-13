export interface CommodityPrice {
  symbol: string;
  name: string;
  shortName: string;
  price: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  open: number;
  unit: string;
  trend: 'up' | 'down' | 'flat';
  history: { t: number; v: number }[];
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary: string;
  impactScore: number;
  direction: 'bullish' | 'bearish' | 'mixed' | 'neutral';
  drivers: string[];
  category: string;
  isBreaking: boolean;
}

export interface PriceProjection {
  symbol: string;
  currentPrice: number;
  projections: {
    label: string;
    days: number;
    price: number;
    low: number;
    high: number;
    confidence: number;
  }[];
  signals: {
    name: string;
    value: string;
    direction: 'bullish' | 'bearish' | 'neutral';
  }[];
  sentimentScore: number; // -100 to +100
  bias: 'strongly_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strongly_bearish';
  chartData: { date: string; actual?: number; projected?: number; low?: number; high?: number }[];
}

export interface TankerShip {
  id: string;
  name: string;
  type: 'VLCC' | 'Suezmax' | 'Aframax' | 'Panamax';
  flag: string;
  cargo: string;
  origin: string;
  destination: string;
  lon: number;
  lat: number;
  heading: number;
  speed: number; // knots
  dwt: number;
  status: 'underway' | 'anchored' | 'loading' | 'discharging';
  eta: string;
  routeProgress: number; // 0-1
  route: [number, number][];
}

export interface Chokepoint {
  id: string;
  name: string;
  lon: number;
  lat: number;
  status: 'open' | 'disrupted' | 'critical' | 'closed';
  throughputMbpd: number;
  riskLevel: 1 | 2 | 3 | 4 | 5;
  description: string;
}

export interface ThreatEvent {
  id: string;
  region: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  impact: string;
  priceImpact: string;
  lon: number;
  lat: number;
  active: boolean;
}

export interface MarketMetrics {
  brentWtiSpread: number;
  oecdInventoryDays: number;
  opecSpareCapacity: number;
  globalDemandGrowth: number;
  usProductionMbpd: number;
  sentimentIndex: number;
}
