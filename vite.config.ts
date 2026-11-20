import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/uvelocity/',
  root: 'client',
  plugins: [react()],
  publicDir: '../public',
  build: { outDir: '../dist/client', emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/matchmake': 'http://127.0.0.1:3000'
    }
  }
});
