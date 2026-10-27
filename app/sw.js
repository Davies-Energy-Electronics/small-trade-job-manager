/* ============================================================
   Job manager: service worker

   Two jobs, and deliberately no more than two:

   1. Keep the app working with no signal. An engineer is often in a loft, a
      cellar or a field. Before this existed, moving the tool from a local
      file to a web address would have been a straight downgrade: no
      signal, no app. Now the shell is cached and it opens regardless.

   2. Let reminders actually fire on iPhone. iOS only allows notifications
      from an installed home-screen app, and only through a service worker
      — the plain `new Notification(...)` call throws there.

   It caches ONLY the app shell. It never touches the records: those live
   in localStorage on the device, and the encrypted copy that travels
   between devices goes straight to the sync Worker, never through here.
   Sync requests are always passed to the network untouched.
   ============================================================ */

const VERSION = 'jobmgr-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())   /* a missing optional file must not block install */
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  /* Only ever handle our own GETs. Anything cross-origin — above all the
     sync Worker — goes straight to the network and is never cached. */
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  /* Network first, cache as the safety net. That way a redeploy is picked
     up straight away when there is signal, and the last good copy opens
     when there isn't. */
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});

/* Tapping a reminder should bring the app forward rather than open a second copy. */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});

/* Lets the page trigger an immediate update after a redeploy. */
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
