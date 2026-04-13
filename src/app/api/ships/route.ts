import { NextResponse } from 'next/server';
import { getShips, CHOKEPOINTS, THREAT_EVENTS } from '@/lib/ships';

export const runtime = 'edge';
export const revalidate = 0;

export async function GET() {
  const ships = getShips();
  return NextResponse.json({
    ships,
    chokepoints: CHOKEPOINTS,
    threats: THREAT_EVENTS,
    updatedAt: new Date().toISOString(),
    stats: {
      totalShips: ships.length,
      vlccs: ships.filter(s => s.type === 'VLCC').length,
      suezmax: ships.filter(s => s.type === 'Suezmax').length,
      aframax: ships.filter(s => s.type === 'Aframax').length,
      totalDwtMillion: Math.round(ships.reduce((a, s) => a + s.dwt, 0) / 1_000_000 * 10) / 10,
    },
  });
}
