'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface PriceAlert {
  symbol: string;
  direction: 'UP' | 'DOWN';
  percentage: number;
  oldPrice: number;
  newPrice: number;
  timestamp: string;
}

export default function SignalsPage() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [trackedAssets] = useState(['BTC', 'ETH', 'HYPE', 'SOL', 'PYTH', 'FOGO', 'GOLD', 'SP500', 'BRENT', 'WTI']);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await fetch('/api/price-tracker');
        const data = await response.json();

        if (data.alerts) {
          // Parse alerts from the API response
          const parsedAlerts: PriceAlert[] = data.alerts.map((alert: any) => {
            // Extract data from HTML-formatted message
            const match = alert.match(/([A-Z0-9]+).*?([\d.]+)%.*?\$([0-9.]+)\s*→\s*\$([0-9.]+)/);
            if (match) {
              return {
                symbol: match[1],
                percentage: parseFloat(match[2]),
                direction: alert.includes('UP') ? 'UP' : 'DOWN',
                oldPrice: parseFloat(match[3]),
                newPrice: parseFloat(match[4]),
                timestamp: new Date().toISOString(),
              };
            }
            return null;
          }).filter(Boolean);

          setAlerts(parsedAlerts);
        }

        setLastUpdate(new Date().toLocaleTimeString());
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch alerts:', error);
        setLoading(false);
      }
    };

    // Initial fetch
    fetchAlerts();

    // Poll every 60 seconds to match the price tracker interval
    const interval = setInterval(fetchAlerts, 60000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-terminal-bg overflow-hidden font-mono">
      {/* Top bar */}
      <div className="shrink-0 h-10 border-b border-terminal-border bg-terminal-panel flex items-center px-5 gap-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-terminal-red animate-pulse" />
          <span className="text-[11px] font-['Orbitron'] font-bold tracking-[0.25em] text-terminal-bright">
            PABLO<span style={{ color: 'var(--red)' }}>SIGNALS</span>
          </span>
        </div>
        <div className="h-4 w-px bg-terminal-border" />
        <span className="text-[9px] font-['Orbitron'] text-terminal-dim tracking-widest uppercase">
          Real-Time Price Tracking Bot
        </span>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-terminal-red animate-pulse" />
            <span className="text-[8px] font-['Orbitron'] font-bold text-terminal-red tracking-wider">LIVE</span>
          </div>
          <span className="text-[8px] text-terminal-dim font-['Orbitron']">
            Last update: {lastUpdate}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col gap-5 p-8 overflow-auto">
        {/* Header section */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <h1 className="text-[32px] font-['Orbitron'] font-bold tracking-[0.12em]"
              style={{ color: 'var(--bright)', textShadow: '0 0 30px rgba(255,100,0,0.2)' }}>
              PRICE TRACKER SIGNALS
            </h1>
            <p className="text-[11px] text-terminal-dim font-['Orbitron'] tracking-widest">
              Monitoring {trackedAssets.length} assets for &gt;0.75% moves in 5-minute windows
            </p>
          </div>
          <Link href="/"
            className="px-4 py-2 rounded border text-[10px] font-['Orbitron'] font-bold tracking-widest transition-all"
            style={{
              background: 'rgba(0,200,240,0.08)',
              borderColor: 'rgba(0,200,240,0.3)',
              color: 'var(--blue)',
            }}>
            ← BACK TO HOME
          </Link>
        </div>

        {/* Tracked assets section */}
        <div className="grid grid-cols-5 gap-2">
          {trackedAssets.map(asset => (
            <div key={asset}
              className="p-3 rounded border text-center"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
              }}>
              <div className="text-[9px] font-['Orbitron'] text-terminal-dim tracking-wider">
                {asset}
              </div>
              <div className="text-[11px] font-bold font-['Orbitron'] mt-1" style={{ color: 'var(--blue)' }}>
                WATCHING
              </div>
            </div>
          ))}
        </div>

        {/* Alerts section */}
        <div className="mt-6">
          <div className="text-[12px] font-['Orbitron'] font-bold tracking-widest mb-3"
            style={{ color: 'var(--bright)' }}>
            ACTIVE ALERTS
          </div>

          {loading ? (
            <div className="text-[10px] text-terminal-dim font-['Orbitron'] tracking-wider">
              Loading price data...
            </div>
          ) : alerts.length === 0 ? (
            <div className="p-6 rounded border text-center"
              style={{
                background: 'rgba(0,200,240,0.02)',
                borderColor: 'rgba(0,200,240,0.15)',
              }}>
              <div className="text-[10px] text-terminal-dim font-['Orbitron'] tracking-widest">
                NO ALERTS DETECTED
              </div>
              <div className="text-[9px] text-terminal-dim mt-2">
                Monitoring for price movements &gt;0.75% in 5-minute windows
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert, idx) => (
                <div key={idx}
                  className="p-4 rounded border flex items-center justify-between transition-all"
                  style={{
                    background: alert.direction === 'UP'
                      ? 'rgba(0,200,100,0.08)' : 'rgba(255,100,0,0.08)',
                    borderColor: alert.direction === 'UP'
                      ? 'rgba(0,200,100,0.3)' : 'rgba(255,100,0,0.3)',
                  }}>

                  <div className="flex items-center gap-4">
                    <span className="text-[20px]">
                      {alert.direction === 'UP' ? '🟢 📈' : '🔴 📉'}
                    </span>
                    <div>
                      <div className="text-[12px] font-['Orbitron'] font-bold tracking-wider">
                        {alert.symbol}
                      </div>
                      <div className="text-[10px] text-terminal-dim font-['Orbitron'] mt-0.5">
                        ${alert.oldPrice.toFixed(2)} → ${alert.newPrice.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[14px] font-['Orbitron'] font-bold"
                      style={{ color: alert.direction === 'UP' ? '#00c864' : '#ff6400' }}>
                      {alert.direction === 'UP' ? '+' : '-'}{alert.percentage.toFixed(2)}%
                    </div>
                    <div className="text-[8px] text-terminal-dim font-['Orbitron'] mt-0.5">
                      {alert.direction} MOVE IN 5MIN
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Statistics section */}
        <div className="mt-8 grid grid-cols-3 gap-3">
          <div className="p-4 rounded border"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
            }}>
            <div className="text-[9px] font-['Orbitron'] text-terminal-dim tracking-widest">ACTIVE ALERTS</div>
            <div className="text-[20px] font-['Orbitron'] font-bold mt-2"
              style={{ color: 'var(--red)' }}>
              {alerts.length}
            </div>
          </div>

          <div className="p-4 rounded border"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
            }}>
            <div className="text-[9px] font-['Orbitron'] text-terminal-dim tracking-widest">ASSETS TRACKED</div>
            <div className="text-[20px] font-['Orbitron'] font-bold mt-2"
              style={{ color: 'var(--blue)' }}>
              {trackedAssets.length}
            </div>
          </div>

          <div className="p-4 rounded border"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
            }}>
            <div className="text-[9px] font-['Orbitron'] text-terminal-dim tracking-widest">THRESHOLD</div>
            <div className="text-[20px] font-['Orbitron'] font-bold mt-2"
              style={{ color: 'var(--amber)' }}>
              &gt;0.75%
            </div>
          </div>
        </div>

        {/* Info section */}
        <div className="mt-8 p-4 rounded border text-[9px] space-y-2"
          style={{
            background: 'rgba(0,200,240,0.02)',
            borderColor: 'rgba(0,200,240,0.15)',
          }}>
          <div className="font-['Orbitron'] font-bold text-terminal-bright">ℹ️ HOW IT WORKS</div>
          <div className="text-terminal-dim space-y-1">
            <div>• Bot monitors {trackedAssets.length} assets: {trackedAssets.join(', ')}</div>
            <div>• Checks for price movements &gt;0.75% over 5-minute windows</div>
            <div>• Alerts are sent to Telegram bot in real-time</div>
            <div>• Price data is checked every 60 seconds</div>
            <div>• All times are in UTC</div>
          </div>
        </div>
      </div>
    </div>
  );
}
