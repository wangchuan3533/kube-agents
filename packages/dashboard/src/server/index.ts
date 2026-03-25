import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { api } from './routes.js';

const app = new Hono();

app.route('/api', api);

// Serve built client in production
app.use('/*', serveStatic({ root: './dist/client' }));
app.use('/*', serveStatic({ path: './dist/client/index.html' }));

const port = Number(process.env['PORT'] ?? 3001);

console.log(`Dashboard server listening on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
