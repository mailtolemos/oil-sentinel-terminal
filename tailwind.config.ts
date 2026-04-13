import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg:       '#030810',
          panel:    '#050d1a',
          border:   '#0d2238',
          blue:     '#00d4ff',
          green:    '#00ff88',
          amber:    '#ffaa00',
          red:      '#ff3344',
          dim:      '#3a6080',
          text:     '#8ab8d0',
          bright:   '#d0eaf8',
          muted:    '#1e3a52',
        },
      },
      fontFamily: {
        mono: ['var(--font-mono)', 'JetBrains Mono', 'Courier New', 'monospace'],
      },
      animation: {
        'ping-slow':  'ping 2s cubic-bezier(0,0,0.2,1) infinite',
        'pulse-fast': 'pulse 1s ease-in-out infinite',
        'scroll':     'scroll 40s linear infinite',
        'glow':       'glow 2s ease-in-out infinite alternate',
        'ship':       'shipMove 0.5s ease-in-out',
        'scanline':   'scanline 8s linear infinite',
      },
      keyframes: {
        scroll: {
          '0%':   { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(-100%)' },
        },
        glow: {
          from: { textShadow: '0 0 5px #00d4ff, 0 0 10px #00d4ff' },
          to:   { textShadow: '0 0 10px #00d4ff, 0 0 20px #00d4ff, 0 0 30px #00d4ff' },
        },
        scanline: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
      },
      boxShadow: {
        'glow-blue':  '0 0 20px rgba(0,212,255,0.15)',
        'glow-green': '0 0 20px rgba(0,255,136,0.15)',
        'glow-red':   '0 0 20px rgba(255,51,68,0.2)',
        'panel':      'inset 0 1px 0 rgba(0,212,255,0.1)',
      },
    },
  },
  plugins: [],
};

export default config;
