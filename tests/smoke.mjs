import { start } from './serve.mjs'; import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
const srv = await start(8765); const b = await chromium.launch(); const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://localhost:8765/'); await p.waitForTimeout(1500);
await p.screenshot({ path: process.argv[2] || 'smoke.png' });
console.log('title:', await p.title()); console.log('errors:', errs);
console.log((await p.evaluate(() => document.body.innerText)).slice(0, 600));
await b.close(); srv.close();
