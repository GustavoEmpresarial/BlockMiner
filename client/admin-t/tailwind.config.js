import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'main.tsx'),
    path.join(__dirname, '../src/features/admin/AdminLayout.tsx'),
    path.join(__dirname, '../src/features/admin/components/AdminSidebar.tsx'),
    path.join(__dirname, '../src/features/admin/tournaments/**/*.{ts,tsx}'),
    path.join(__dirname, '../src/features/admin-auth/**/*.{ts,tsx}'),
  ],
  theme: {
    extend: {
      colors: {
        background: '#0B0F19',
        surface: '#1A1F2C',
        primary: '#3B82F6',
      },
    },
  },
  plugins: [],
};
