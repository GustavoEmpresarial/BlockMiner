/** @type {import('tailwindcss').Config} */

// Paleta navy medida a partir de referência visual externa e calibrada para WCAG AA
const brandNavy = {
  50: '#F8FAFC',  // Texto primário em títulos e destaques (15.5:1 em card)
  100: '#E8EDF5', // Texto claro
  200: '#CAD4E0', // Texto secundário (links da navbar - 10.8:1 em card)
  300: '#A3B3C9', // Muted claro (7.4:1 em card)
  400: '#94A3B8', // Texto de apoio / body muted (6.3:1 em card, 4.9:1 em input - WCAG AA)
  500: '#7C8EA6', // Labels minúsculos calibrados para contraste (4.9:1 em card - WCAG AA)
  600: '#3E547A', // Bordas e divisores médios
  700: '#2A3F66', // Bordas sutis de card e inputs
  800: '#203353', // Fundo de input / cards elevados / pills secundárias
  850: '#1A294A', // Fundo intermediário / card elevado dashboard
  900: '#152036', // Fundo principal de card
  950: '#0F1522', // Fundo de página / deep navy
};

export default {
  content: [
    "./index.html",
    "./admin-t/index.html",
    "./admin-t/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0F1522',
        surface: '#152036',
        'surface-elevated': '#1A294A',
        'surface-input': '#203353',
        primary: '#3D81F6',
        'primary-hover': '#2563EB',
        accent: '#17B880',
        'accent-hover': '#149E6D',
        slate: brandNavy,
        gray: brandNavy,
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      borderRadius: {
        'card': '1rem',
        'input': '0.75rem',
        'button': '0.75rem',
      },
      boxShadow: {
        'card': '0 10px 30px -5px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06)',
        'card-elevated': '0 20px 40px -10px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        'glow-blue': '0 0 25px rgba(61, 129, 246, 0.35)',
        'glow-green': '0 0 25px rgba(23, 184, 128, 0.35)',
      },
      keyframes: {
        blob: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(28px, -24px) scale(1.06)' },
          '66%': { transform: 'translate(-22px, 16px) scale(0.94)' },
        },
        gridPulse: {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        blob: 'blob 20s ease-in-out infinite',
        'blob-slow': 'blob 28s ease-in-out infinite',
        'blob-delay': 'blob 24s ease-in-out infinite 3s',
        gridPulse: 'gridPulse 8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
