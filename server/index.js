import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { snapshot } from './claude-state.js';
import { handleHook, installHooks } from './hooks.js';
import { act, earn, publicState } from './office-store.js';
import { weather } from './weather.js';
import { ExternalSessions, validateCodexSnapshot } from './external-sessions.js';
import { Adapter } from './codex/receiver.js';
import { editHooks as editCodexHooks } from './codex/hook-install.js';

const PORT = Number(process.env.PORT) || 4317;
const HOST = process.env.HOST || '127.0.0.1';
const POLL_MS = 1000;
const DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const clients = new Set();
const external = new ExternalSessions();
let localCodexSessions = [];
let latest = JSON.stringify({ sessions: [], office: publicState() });
let sessions = [];

function broadcast(data) {
  latest = data;
  for (const res of clients) res.write(`data: ${data}\n\n`);
}

function tick(seconds = POLL_MS / 1000) {
  let data;
  try {
    const codexSessions = new Map(external.current().map(session => [session.id, session]));
    for (const session of localCodexSessions) codexSessions.set(session.id, session);
    sessions = [...snapshot().sessions, ...codexSessions.values()];
    earn(sessions, seconds, clients.size > 0);
    data = JSON.stringify({ sessions, office: publicState() });
  } catch (err) {
    console.error('snapshot failed:', err);
    return;
  }
  if (data !== latest) broadcast(data);
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

function jsonError(res, status, error) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error }));
}

function loopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function authorized(req) {
  const token = process.env.CAT_AGENTS_EXTERNAL_TOKEN;
  const supplied = req.headers.authorization;
  if (!token || typeof supplied !== 'string' || !supplied.startsWith('Bearer ')) return false;
  const a = Buffer.from(supplied.slice(7));
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handleExternalSnapshot(req, res) {
  if (!loopback(req.socket.remoteAddress)) return jsonError(res, 403, 'Loopback only');
  if (!process.env.CAT_AGENTS_EXTERNAL_TOKEN) return jsonError(res, 503, 'External source disabled');
  if (!authorized(req)) return jsonError(res, 401, 'Unauthorized');
  let bytes = 0;
  const chunks = [];
  try {
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 256 * 1024) return jsonError(res, 413, 'Snapshot too large');
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const result = validateCodexSnapshot(body);
    if (!result.ok) return jsonError(res, 400, result.error);
    external.replace(result.sessions);
    tick(0);
    res.writeHead(204).end();
  } catch {
    if (!res.writableEnded) jsonError(res, 400, 'Invalid JSON');
  }
}

async function handleOffice(req, res, action) {
  const result = act(action, await readBody(req));
  res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
  if (result.ok) broadcast(JSON.stringify({ sessions, office: publicState() }));
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.normalize(path.join(DIST_DIR, urlPath));
  if (!file.startsWith(DIST_DIR)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Frontend is not built. Run `npm run build`, or `npm run dev` for development.');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

export const server = http.createServer((req, res) => {
  if (req.url === '/api/external-sources/codex/sessions') {
    if (req.method !== 'PUT') return jsonError(res, 405, 'Method not allowed');
    handleExternalSnapshot(req, res);
    return;
  }
  if (req.url === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`data: ${latest}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  const officeAction = req.method === 'POST' && req.url.match(/^\/api\/office\/(\w+)$/);
  if (officeAction) {
    handleOffice(req, res, officeAction[1]);
    return;
  }
  if (req.method === 'POST' && req.url === '/api/hook') {
    readBody(req).then((event) => {
      handleHook(event);
      tick(0);
    });
    res.writeHead(204).end();
    return;
  }
  if (req.url === '/api/weather') {
    weather().then((data) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    });
    return;
  }
  if (req.url === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(latest);
    return;
  }
  serveStatic(req, res);
});

tick();
setInterval(tick, POLL_MS);
setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 20_000);

server.listen(PORT, HOST, () => {
  console.log(`cat-agents server on http://${HOST}:${PORT}`);
  if (process.env.CAT_AGENTS_HOOKS !== 'off') {
    try {
      console.log(installHooks(process.env.HOOK_URL || `http://127.0.0.1:${PORT}/api/hook`));
    } catch (err) {
      console.error('failed to install hooks:', err.message);
    }
  }
  if (process.platform === 'darwin' && process.env.CAT_AGENTS_CODEX !== 'off') {
    const adapter = new Adapter({
      token: 'in-process',
      publish: async codexSessions => {
        localCodexSessions = codexSessions;
        tick(0);
      },
    });
    adapter.start().then(() => {
      if (process.env.CAT_AGENTS_HOOKS !== 'off') {
        try {
          const result = editCodexHooks({ action: 'install' });
          if (result.changed) console.log(`Codex hooks installed into ${result.target}`);
        } catch (error) {
          console.error('failed to install Codex hooks:', error.message);
        }
      }
    }).catch(error => console.error('Codex adapter:', error.message));
    server.on('close', () => adapter.stop().catch(error => console.error('Codex adapter:', error.message)));
  }
});
