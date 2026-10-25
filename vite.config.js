import { defineConfig } from 'vite';

// The repo's existing art lives in ./assets, so serve that folder as the
// static root: /cards/..., /audio/..., /pumpkin/...
export default defineConfig({
  base: './',
  publicDir: 'assets',
  build: { outDir: 'dist', emptyOutDir: true },
});
