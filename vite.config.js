import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// The repo's existing art lives in ./assets, so serve that folder as the
// static root: /cards/..., /audio/..., /pumpkin/...
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  publicDir: 'assets',
  build: { outDir: 'dist', emptyOutDir: true },
});
