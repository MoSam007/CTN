/**
 * Service Worker for CTN Dashboard
 * Caches static assets and map tiles for offline use
 */

const CACHE_NAME = 'ctn-dashboard-v2';
const STATIC_CACHE = 'ctn-static-v2';
const MAP_CACHE = 'ctn-map-tiles-v2';

// Assets to cache on install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/styles.css',
    '/components.css',
    '/js/api.js',
    '/js/state.js',
    '/js/router.js',
    '/js/components/map.js',
    '/js/components/gauge.js',
    '/js/components/timeline.js',
    '/js/components/zone-editor.js',
    '/js/pages/dashboard.js',
    '/js/pages/safe-locations.js',
    '/js/pages/behaviour.js',
    '/js/pages/wifi.js',
    '/js/pages/diagnostics.js',
    '/js/pages/settings.js',
    '/js/demo.js',
    '/assets/logo.svg',
    '/assets/icon-192.png',
    '/assets/icon-512.png'
];

// External resources that might be needed offline
const EXTERNAL_RESOURCES = [
    // Leaflet CSS/JS from CDN
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    // Map tiles - will cache first 10 zoom levels around Nairobi
];

// Map tile cache configuration
const MAP_TILE_CONFIG = {
    baseUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    zoomLevels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    // Bounding box around Nairobi (roughly)
    bounds: {
        minLat: -1.5,
        maxLat: -1.0,
        minLng: 36.5,
        maxLng: 37.2
    }
};

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');

    event.waitUntil(
        Promise.all([
            caches.open(STATIC_CACHE).then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })));
            }),
            // Pre-cache external resources
            caches.open(CACHE_NAME).then((cache) => {
                return cache.addAll(EXTERNAL_RESOURCES.map(url => new Request(url, { mode: 'no-cors' })));
            }).catch(err => {
                console.warn('[SW] External resources failed to cache:', err);
            }),
            // Pre-cache map tiles for Nairobi area
            cacheMapTiles()
        ]).then(() => {
            console.log('[SW] Installation complete');
            return self.skipWaiting();
        })
    );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== STATIC_CACHE && name !== MAP_CACHE && name !== CACHE_NAME)
                    .map((name) => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => {
            console.log('[SW] Activation complete');
            return self.clients.claim();
        })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip chrome-extension and other non-http(s) requests
    if (!url.protocol.startsWith('http')) return;

    // Handle map tile requests
    if (isMapTileRequest(url)) {
        event.respondWith(handleMapTileRequest(request));
        return;
    }

    // Handle navigation requests (HTML pages)
    if (request.mode === 'navigate') {
        event.respondWith(handleNavigationRequest(request));
        return;
    }

    // Handle static assets
    if (isStaticAsset(url)) {
        event.respondWith(handleStaticAssetRequest(request));
        return;
    }

    // Handle API requests
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) {
        event.respondWith(handleApiRequest(request));
        return;
    }

    // Default: network first, cache fallback
    event.respondWith(
        fetch(request)
            .then((response) => {
                // Cache successful responses
                if (response.ok) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(request);
            })
    );
});

// Check if request is for map tiles
function isMapTileRequest(url) {
    return url.hostname.includes('tile.openstreetmap.org') ||
           url.hostname.includes('tile.thunderforest.com') ||
           url.pathname.match(/\/\d+\/\d+\/\d+\.png$/);
}

// Check if request is for static asset
function isStaticAsset(url) {
    return STATIC_ASSETS.some(asset => url.pathname.endsWith(asset.replace('/', ''))) ||
           url.pathname.match(/\.(css|js|png|jpg|jpeg|svg|ico|woff|woff2)$/);
}

// Handle navigation requests (SPA)
async function handleNavigationRequest(request) {
    try {
        const response = await fetch(request);
        return response;
    } catch (error) {
        // Fallback to cached index.html for SPA routing
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match('/index.html');
        return cached || new Response('Offline', { status: 503 });
    }
}

// Handle static asset requests
async function handleStaticAssetRequest(request) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);

    if (cached) {
        // Serve from cache, update in background
        fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
        }).catch(() => {});
        return cached;
    }

    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        return new Response('Asset not available offline', { status: 503 });
    }
}

// Handle API requests
async function handleApiRequest(request) {
    try {
        const response = await fetch(request);

        // Cache GET responses for offline viewing
        if (request.method === 'GET' && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        // Serve cached API response if available
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);

        if (cached) {
            // Add offline header
            const headers = new Headers(cached.headers);
            headers.set('X-CTN-Offline', 'true');
            return new Response(cached.body, {
                status: cached.status,
                statusText: cached.statusText,
                headers
            });
        }

        return new Response(JSON.stringify({ error: 'Offline', offline: true }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Handle map tile requests
async function handleMapTileRequest(request) {
    const cache = await caches.open(MAP_CACHE);
    const cached = await cache.match(request);

    if (cached) {
        return cached;
    }

    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        // Return offline placeholder tile
        return new Response(generateOfflineTile(), {
            headers: { 'Content-Type': 'image/png' }
        });
    }
}

// Generate a simple offline tile (gray with "OFFLINE" text)
function generateOfflineTile() {
    // 1x1 transparent PNG as base64 - in production, use a proper offline tile
    const transparentPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    return Uint8Array.from(atob(transparentPng), c => c.charCodeAt(0)).buffer;
}

// Pre-cache map tiles for Nairobi area
async function cacheMapTiles() {
    console.log('[SW] Pre-caching map tiles...');

    const cache = await caches.open(MAP_CACHE);
    const { baseUrl, subdomains, zoomLevels, bounds } = MAP_TILE_CONFIG;

    const tilesToCache = [];

    for (const z of zoomLevels) {
        // Calculate tile range for bounds
        const minTile = latLngToTile(bounds.minLat, bounds.minLng, z);
        const maxTile = latLngToTile(bounds.maxLat, bounds.maxLng, z);

        for (let x = minTile.x; x <= maxTile.x; x++) {
            for (let y = maxTile.y; y <= minTile.y; y++) {
                // Limit number of tiles per zoom level
                if (tilesToCache.length >= 200) break;

                const subdomain = subdomains[(x + y) % subdomains.length];
                const url = baseUrl
                    .replace('{s}', subdomain)
                    .replace('{z}', z)
                    .replace('{x}', x)
                    .replace('{y}', y);

                tilesToCache.push(url);
            }
        }
    }

    // Cache tiles with rate limiting
    const batchSize = 10;
    for (let i = 0; i < tilesToCache.length; i += batchSize) {
        const batch = tilesToCache.slice(i, i + batchSize);

        await Promise.all(batch.map(tileUrl => {
            return fetch(tileUrl, { mode: 'no-cors' })
                .then(response => cache.put(tileUrl, response))
                .catch(err => console.warn('[SW] Failed to cache tile:', tileUrl, err));
        }));

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[SW] Cached ${tilesToCache.length} map tiles`);
}

// Convert lat/lng to tile coordinates
function latLngToTile(lat, lng, z) {
    const n = Math.pow(2, z);
    const x = Math.floor((lng + 180) / 360 * n);
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
    return { x, y };
}

// Message handler for cache management
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    } else if (event.data === 'clearCache') {
        clearAllCaches().then(() => {
            event.ports[0]?.postMessage({ success: true });
        });
    } else if (event.data === 'getCacheSize') {
        getCacheSize().then(size => {
            event.ports[0]?.postMessage({ size });
        });
    }
});

async function clearAllCaches() {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
}

async function getCacheSize() {
    const cacheNames = await caches.keys();
    let totalSize = 0;

    for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        for (const request of keys) {
            const response = await cache.match(request);
            if (response) {
                const blob = await response.blob();
                totalSize += blob.size;
            }
        }
    }

    return totalSize;
}

// Background sync for pending API requests (when online)
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-pending-requests') {
        event.waitUntil(syncPendingRequests());
    }
});

async function syncPendingRequests() {
    // Implementation for syncing offline API requests
    // Would use IndexedDB to store pending requests
    console.log('[SW] Syncing pending requests...');
}

console.log('[SW] Service Worker loaded');