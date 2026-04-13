import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg:     'var(--bg)',
          panel:  'var(--panel)',
          border: 'var(--border)',
          blue:   'var(--blue)',
          green:  'var(--green)',
          amber:  'var(--amber)',
          red:    'var(--red)',
          dim:    'var(--dim)',
          text:   'var(--text)',
          bright: 'var(--bright)',
          muted:  'var(--muted)',
          // accent helpers
          'accent-blue':  'var(--accent-blue)',
          'accent-green': 'var(--accent-green)',
          'surface':      'var(--surface)',
          'surface2':     'var(--surface2)',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
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
          from: { textShadow: '0 0 5px var(--blue), 0 0 10px var(--blue)' },
          to:   { textShadow: '0 0 10px var(--blue), 0 0 20px var(--blue), 0 0 30px var(--blue)' },
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
      transitionProperty: {
        'theme': 'background-color, border-color, color',
      },
    },
  },
  plugins: [],
};

export default config;
