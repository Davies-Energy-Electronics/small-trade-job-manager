// End-to-end: two separate browsers sync through sync-worker.js (in-memory KV). Run: node tests/sync_test.mjs
import { start, env } from './serve.mjs'; import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const srv = await start(8766); const b = await chromium.launch(); let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const code = 'A'.repeat(43), url = 'http://localhost:8766/sync';
async function device() { const ctx = await b.newContext(); const p = await ctx.newPage(); await p.goto('http://localhost:8766/'); await p.waitForTimeout(800);
  await p.evaluate(([u, c]) => { PASS = 'correct horse battery staple'; SYNC.on = true; SYNC.url = u; SYNC.secret = c; }, [url, code]); return p; }
const A = await device(), B = await device();
await A.evaluate(() => { db.customers.push({ id: 'test-cust-1', name: 'Test Customer From A', type: 'Residential', created: '2026-10-27' }); persist(); });
await A.evaluate(() => syncNow());
ok(await A.evaluate(() => SYNC.state) === 'ok', 'device A sync state ok: ' + await A.evaluate(() => SYNC.state + ' ' + SYNC.err));
await B.evaluate(() => syncNow());
ok(await B.evaluate(() => SYNC.state) === 'ok', 'device B sync state ok: ' + await B.evaluate(() => SYNC.state + ' ' + SYNC.err));
ok(await B.evaluate(() => db.customers.some(c => c.name === 'Test Customer From A')), 'B received the customer A added');
// what the server holds is ciphertext only
const stored = await (async () => { const r = await fetch(url + '/pull', { method: 'POST', headers: { Authorization: 'Bearer ' + code } }); return r.json(); })();
ok(stored.rev >= 1 && typeof stored.data === 'string' && !stored.data.includes('Test Customer'), 'server holds only an encrypted blob (rev ' + stored.rev + ')');
const wrong = await fetch(url + '/pull', { method: 'POST', headers: { Authorization: 'Bearer ' + 'B'.repeat(43) } }).then(r => r.json());
ok(wrong.data === null, 'a different sync code reaches nothing');
const short = await fetch(url + '/pull', { method: 'POST', headers: { Authorization: 'Bearer short' } });
ok(short.status === 401, 'a short code is refused (401)');
const stale = await fetch(url + '/push', { method: 'POST', headers: { Authorization: 'Bearer ' + code }, body: JSON.stringify({ rev: 0, data: 'x' }) });
ok(stale.status === 409, 'a push on an old revision is refused (409)');
await B.evaluate(() => { PASS = 'wrong passphrase'; }); await B.evaluate(() => syncNow());
ok(/passphrase/.test(await B.evaluate(() => SYNC.err)), 'wrong passphrase cannot read the records: ' + await B.evaluate(() => SYNC.err));
await b.close(); srv.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
