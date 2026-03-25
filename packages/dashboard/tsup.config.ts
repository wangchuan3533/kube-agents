import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server/index.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  outDir: 'dist/server',
});
