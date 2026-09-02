import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// In dev, /api calls are proxied to a live TMI backend so the React app talks
// to the real serverless functions without running them locally. Set
// VITE_API_TARGET to point at a different deployment (default: admin prod).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'https://admin.tmitechai.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: { outDir: 'dist', sourcemap: mode !== 'production' },
}));
