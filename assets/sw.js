// Offline support. Pages come from the network when it's there (so updates
// show up straight away) and from the cache when it isn't; everything else is
// served from the cache and refreshed in the background.

const CACHE = 'spooooky-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './cards/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Leave other sites (fonts) and partial requests (music streaming) alone.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin || req.headers.has('range')) return;

  const save = (res) => {
    if (res.status === 200) {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(req, copy));
    }
    return res;
  };

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(save).catch(() => caches.match(req).then((hit) => hit ?? caches.match('./'))));
    return;
  }
  event.respondWith(caches.match(req).then((hit) => {
    const fresh = fetch(req).then(save).catch(() => hit);
    return hit ?? fresh;
  }));
});
