const CACHE_NAME = 'planos-dxf-edc-v2';
const TILE_CACHE_NAME = 'planos-tiles-v1';

const ASSETS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'icon.png',
  'manifest.json',
  // External Libraries
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.9.0/proj4.js',
  'https://cdn.jsdelivr.net/npm/dxf-parser@1.1.2/dist/dxf-parser.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Map tile patterns to cache
const TILE_URLS = [
  'arcgisonline.com',
  'maptiles.arcgis.com',
  'cartocdn.com'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== TILE_CACHE_NAME)
            .map(key => caches.delete(key))
      );
    })
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // Strategy for Map Tiles: Cache First, then Network & Cache
  if (TILE_URLS.some(domain => url.includes(domain))) {
    e.respondWith(
      caches.open(TILE_CACHE_NAME).then((cache) => {
        return cache.match(e.request).then((response) => {
          return response || fetch(e.request).then((networkResponse) => {
            cache.put(e.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // Strategy for Assets & Rest: Cache with Network Fallback
  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request);
    })
  );
});
