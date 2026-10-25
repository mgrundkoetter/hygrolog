import { defineConfig } from 'vite';

// Relative base so the build works from file://, GitHub Pages subpaths and inside Tauri.
export default defineConfig({
  base: './',
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
