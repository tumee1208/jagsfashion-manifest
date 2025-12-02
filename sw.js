// Jag's Fashion - Service Worker v3.0.0
// DISABLED: Service Worker is disabled - site works online only
// This file unregisters itself and clears all caches

const VERSION = '2.0.8';

// Immediately unregister this service worker
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        // Delete ALL caches
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    console.log('Deleting cache:', cacheName);
                    return caches.delete(cacheName);
                })
            );
        }).then(() => {
            // Unregister this service worker
            return self.registration.unregister();
        }).then(() => {
            // Reload all open tabs to clear SW control
            return self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({ action: 'reload' });
                });
            });
        })
    );
});

// Pass all requests directly to network - no caching
self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});
