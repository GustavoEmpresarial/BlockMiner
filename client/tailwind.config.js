/** @type {import('tailwindcss').Config} */
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
        background: '#0B0F19',
        surface: '#1A1F2C',
        primary: '#3B82F6',
        'primary-hover': '#2563EB',
        accent: '#8B5CF6',
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
