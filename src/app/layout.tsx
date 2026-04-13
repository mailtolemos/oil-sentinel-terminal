import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/context/ThemeContext';

export const metadata: Metadata = {
  title: 'OIL SENTINEL TERMINAL — Live Crude Intelligence',
  description: 'Real-time oil futures intelligence: Brent, WTI, live tanker tracking, chokepoints, geopolitical threat matrix and price projections.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body className="scanlines crt-vignette">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
