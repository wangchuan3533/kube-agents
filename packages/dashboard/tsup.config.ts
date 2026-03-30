import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server/index.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  outDir: 'dist/server',
  noExternal: [/^@kube-agents\//],
  external: ['nats', '@kubernetes/client-node', 'better-sqlite3'],
});
