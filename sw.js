const CACHE_NAME = 'walki-talki-v2'; // Bumped version to v2
const ASSETS = [
  './',                 // Fixed: Relative path
  './index.html',        // Fixed: Relative path
  './css/style.css',     // Fixed: Relative path
  './js/peer-logic.js',  // Fixed: Relative path
  './js/ui-manager.js',  // Fixed: Relative path
  './manifest.json',     // Fixed: Relative path
  'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap',
  'https://fonts.googleapis.com/icon?family=Material+Icons+Outlined'
];

// 1. Install Service Worker & Cache Files
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  // Force the waiting service worker to become the active service worker.
  self.skipWaiting(); 
});

// 2. Fetch Files (Network First, then Cache)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => {
      return caches.match(e.request);
    })
  );
});

// 3. Activate & Clean Up Old Caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  // Tell the active service worker to take control of the page immediately.
  self.clients.claim();
});