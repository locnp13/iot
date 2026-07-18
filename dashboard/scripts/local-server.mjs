// Local/container dev server: mounts every api/*.ts handler with a Vercel-like req/res
// shape, and serves the frontend through Vite in middleware mode (HMR included).
// Vercel itself provides this routing in production/`vercel dev`; this script exists so
// the same app can also run standalone in Docker (see docker-compose.yml) with no
// dependency on a Vercel account or CLI.
import http from 'node:http';
import { createServer as createViteServer } from 'vite';

const routes = [
  { pattern: /^\/api\/auth\/register$/, mod: '/api/auth/register.ts' },
  { pattern: /^\/api\/auth\/login$/, mod: '/api/auth/login.ts' },
  { pattern: /^\/api\/auth\/logout$/, mod: '/api/auth/logout.ts' },
  { pattern: /^\/api\/auth\/me$/, mod: '/api/auth/me.ts' },
  { pattern: /^\/api\/devices$/, mod: '/api/devices/index.ts' },
  { pattern: /^\/api\/devices\/([^/]+)\/regenerate-token$/, mod: '/api/devices/[id]/regenerate-token.ts', params: ['id'] },
  { pattern: /^\/api\/devices\/([^/]+)\/readings$/, mod: '/api/devices/[id]/readings.ts', params: ['id'] },
  { pattern: /^\/api\/readings$/, mod: '/api/readings.ts' },
];

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

const port = Number(process.env.PORT) || 3000;

// Vite's HMR client defaults to its own standalone WebSocket listener, which isn't reachable
// through Docker's port mapping. Declaring `server` before the Vite server, then handing it
// to `hmr.server`, makes Vite attach its WebSocket upgrade handling to OUR listener instead
// of opening a second one (which would otherwise collide with `server.listen` below on the
// same port). `clientPort` tells the browser which host-mapped port to reconnect on.
let vite;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/api/')) {
    for (const route of routes) {
      const m = url.pathname.match(route.pattern);
      if (!m) continue;

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString('utf8');
      let body;
      if (rawBody) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          body = rawBody;
        }
      }

      const query = Object.fromEntries(url.searchParams.entries());
      if (route.params) route.params.forEach((p, i) => (query[p] = m[i + 1]));

      const apiReq = {
        method: req.method,
        headers: req.headers,
        body,
        query,
        cookies: parseCookies(req.headers.cookie),
      };

      const setHeaders = [];
      const apiRes = {
        _status: 200,
        status(code) {
          this._status = code;
          return this;
        },
        setHeader(name, value) {
          setHeaders.push([name, value]);
          return this;
        },
        json(payload) {
          for (const [n, v] of setHeaders) res.setHeader(n, v);
          res.statusCode = this._status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(payload));
        },
        end() {
          for (const [n, v] of setHeaders) res.setHeader(n, v);
          res.statusCode = this._status;
          res.end();
        },
      };

      try {
        const { default: handler } = await vite.ssrLoadModule(route.mod);
        await handler(apiReq, apiRes);
      } catch (err) {
        console.error('[api error]', route.mod, err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Unexpected error' }));
      }
      return;
    }
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  vite.middlewares(req, res);
});

vite = await createViteServer({
  server: {
    middlewareMode: true,
    host: true,
    hmr: { server, clientPort: Number(process.env.HMR_CLIENT_PORT) || port },
  },
  appType: 'spa',
});

server.listen(port, '0.0.0.0', () => {
  // `port` is this container's INTERNAL port — not necessarily what's reachable on the host.
  // HMR_CLIENT_PORT is already set to the host-side mapped port (see docker-compose.yml),
  // so it doubles as the right value to print here.
  const hostPort = process.env.HMR_CLIENT_PORT || port;
  console.log(`Dashboard running — open http://localhost:${hostPort} on your host machine`);
});
