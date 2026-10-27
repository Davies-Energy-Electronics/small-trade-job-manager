// Local test server: serves app/ and runs sync-worker.js with an in-memory KV at /sync/*
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = (await import(pathToFileURL(path.join(root, 'sync-worker/sync-worker.js')).href)).default;
const store = new Map();
export const env = { JOBMGR: { async get(k, t) { const v = store.get(k); return v == null ? null : (t === 'json' ? JSON.parse(v) : v); }, async put(k, v) { store.set(k, v); } } };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
export function start(port) {
  return new Promise(res => { const srv = http.createServer(async (req, rsp) => {
    if (req.url.startsWith('/sync/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const r = await worker.fetch(new Request('http://x' + req.url.slice(5), { method: req.method, headers: req.headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : Buffer.concat(chunks) }), env);
      rsp.writeHead(r.status, Object.fromEntries(r.headers)); rsp.end(Buffer.from(await r.arrayBuffer())); return;
    }
    const f = path.join(root, 'app', req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(f)) { rsp.writeHead(404); rsp.end(); return; }
    rsp.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rsp);
  }).listen(port, () => res(srv)); });
}
