/* Job manager: sync service (a Cloudflare Worker).

   What it stores: one encrypted blob per sync code, and a revision number.
   The app encrypts the records with the user's passphrase BEFORE sending them,
   so this Worker never sees a customer, a job or a price, and cannot decrypt
   what it stores.

   The sync code (the Bearer token) is never stored. The Worker keys each blob
   by the SHA-256 of the code, so two devices with the same code share one
   blob, and a different code reaches nothing.

   Endpoints (both POST, JSON):
     /pull                -> 200 {rev, data}   data is null until the first push
     /push {rev, data}    -> 200 {rev}         rev must match the stored one
                          -> 409 {rev}         someone else pushed first: pull again
   Errors: 401 no or short code, 404 unknown path, 405 not POST, 413 too large.

   Setup: a KV namespace bound as JOBMGR (see the app's Sync panel).
   Optional: set ALLOWED_ORIGIN to the app's address to refuse other sites. */

const MAX_BYTES = 20 * 1024 * 1024;   // below KV's 25 MiB value limit

function cors(env) {
  return {
    'Access-Control-Allow-Origin': (env && env.ALLOWED_ORIGIN) || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function reply(env, status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(env) },
  });
}

async function slotFor(code) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return 'sync:' + [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    if (request.method !== 'POST') return reply(env, 405, { error: 'POST only' });

    const auth = request.headers.get('Authorization') || '';
    const code = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (code.length < 32) return reply(env, 401, { error: 'sync code missing or too short' });

    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    const key = await slotFor(code);
    const stored = (await env.JOBMGR.get(key, 'json')) || { rev: 0, data: null };

    if (path === '/pull') return reply(env, 200, { rev: stored.rev, data: stored.data });

    if (path === '/push') {
      const text = await request.text();
      if (text.length > MAX_BYTES) return reply(env, 413, { error: 'too large' });
      let body;
      try { body = JSON.parse(text); } catch (e) { return reply(env, 400, { error: 'not JSON' }); }
      if (typeof body.data !== 'string') return reply(env, 400, { error: 'data must be a string' });
      if ((+body.rev || 0) !== stored.rev) return reply(env, 409, { rev: stored.rev });
      const next = { rev: stored.rev + 1, data: body.data };
      await env.JOBMGR.put(key, JSON.stringify(next));
      return reply(env, 200, { rev: next.rev });
    }

    return reply(env, 404, { error: 'unknown path' });
  },
};
