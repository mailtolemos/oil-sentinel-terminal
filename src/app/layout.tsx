import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/context/ThemeContext';

export const metadata: Metadata = {
  title: 'OIL SENTINEL TERMINAL — Live Crude Intelligence',
  description: 'Real-time oil futures intelligence: Brent, WTI, live tanker tracking, chokepoints, geopolitical threat matrix and price projections.',
  icons: { icon: '/favicon.svg' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Oil Sentinel',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)',  color: '#030c18' },
    { media: '(prefers-color-scheme: light)', color: '#edf2f7' },
  ],
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
