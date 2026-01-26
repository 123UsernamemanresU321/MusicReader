/**
 * Service Worker for MusicReader PWA
 * Caches app shell for offline access
 */

const CACHE_NAME = 'musicreader-v1';

// Core assets to cache for app shell
const CORE_ASSETS = [
    '/',
    '/index.html',
    '/styles/main.css',
    '/styles/themes.css',
    '/styles/auth.css',
    '/styles/library.css',
    '/styles/viewer.css',
    '/styles/settings.css',
    '/manifest.json'
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching app shell');
                return cache.addAll(CORE_ASSETS);
            })
            .then(() => {
                console.log('Service Worker: Installed');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Service Worker: Install failed', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cache) => {
                        if (cache !== CACHE_NAME) {
                            console.log('Service Worker: Clearing old cache', cache);
                            return caches.delete(cache);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Activated');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip cross-origin requests (Supabase, CDNs, etc)
    if (url.origin !== self.location.origin) {
        return;
    }

    // Skip API requests
    if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/rest/')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // Return cached version if available
                if (cachedResponse) {
                    // Also fetch updated version in background
                    fetch(event.request)
                        .then((networkResponse) => {
                            if (networkResponse.ok) {
                                caches.open(CACHE_NAME)
                                    .then((cache) => cache.put(event.request, networkResponse));
                            }
                        })
                        .catch(() => { });

                    return cachedResponse;
                }

                // Otherwise fetch from network
                return fetch(event.request)
                    .then((networkResponse) => {
                        // Cache successful responses
                        if (networkResponse.ok) {
                            const responseClone = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => cache.put(event.request, responseClone));
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // Return offline page for navigation requests
                        if (event.request.mode === 'navigate') {
                            return caches.match('/index.html');
                        }

                        // For other requests, return a simple error
                        return new Response('Offline', { status: 503 });
                    });
            })
    );
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
