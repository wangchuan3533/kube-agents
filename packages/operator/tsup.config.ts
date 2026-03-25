import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
  },
  {
    entry: ['src/main.ts'],
    format: ['esm'],
    clean: false,
    sourcemap: true,
    noExternal: [/^@kube-agents\//],
  },
]);
