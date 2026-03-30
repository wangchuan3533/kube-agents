import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { api } from './routes.js';
import { getDb } from './db.js';
import { initNats, initTraceConsumer } from './nats-client.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Ensure data directory exists for SQLite
const dbPath = process.env['DATABASE_PATH'] ?? './data/kube-agents.db';
mkdirSync(dirname(dbPath), { recursive: true });

// Initialize SQLite database
getDb();

// Initialize NATS connection (non-blocking — dashboard works without it)
await initNats().catch(() => {
  console.warn('[server] NATS initialization failed. Message inspection will be unavailable.');
});

// Start trace consumer (non-blocking — traces work only when NATS + trace stream are available)
await initTraceConsumer().catch(() => {
  console.warn('[server] Trace consumer initialization failed. Tracing will be unavailable.');
});

const app = new Hono();

app.route('/api', api);

// Serve built client in production
app.use('/*', serveStatic({ root: './dist/client' }));
app.use('/*', serveStatic({ path: './dist/client/index.html' }));

const port = Number(process.env['PORT'] ?? 3001);

console.log(`Dashboard server listening on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
