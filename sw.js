// Jag's Fashion - Service Worker v2.0.3
// Fixed: CSS files now use network-first strategy to load properly on navigation
// Fixed: Better error handling for missing files on first load
// Fixed: Only cache successful responses
// Fixed: Response clone error - clone before returning response

const VERSION = '2.0.4';
const STATIC_CACHE = `jagsfashion-static-v${VERSION}`;
const DYNAMIC_CACHE = `jagsfashion-dynamic-v${VERSION}`;
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/shopScript.js',
    '/product.html',
    '/productScript.js',
    '/cart.html',
    '/cartScript.js',
    '/user.html',
    '/userScript.js',
    '/news.html',
    '/newsScript.js',
    '/about.html',
    '/toast.js',
    '/searchScript.js',
    '/heroImage.js',
    '/changeImage.js',
    '/giftCart.js',
    '/heartScript.js',
    '/lensScript.js',
    '/ratingScript.js',
    '/prescriptionScript.js',
    '/static-images-loader.js',
    '/app-version.js'
];

self.addEventListener('install', (event) => {
    // Force immediate activation
    self.skipWaiting();
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                // Add files individually to avoid failing entire cache if one file fails
                return Promise.allSettled(
                    STATIC_ASSETS.map(url => 
                        cache.add(new Request(url, {cache: 'reload'}))
                            .catch(err => console.log(`Failed to cache ${url}:`, err))
                    )
                );
            })
            .catch((error) => {
                console.log('Cache installation failed:', error);
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        // Delete old caches only
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName.startsWith('jagsfashion-') && 
                        cacheName !== STATIC_CACHE && 
                        cacheName !== DYNAMIC_CACHE) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Only handle same-origin requests and Cloudinary
    if (url.origin !== location.origin && !url.hostname.includes('cloudinary.com')) {
        return;
    }
    
    // Cloudinary images - cache first with long expiration
    if (url.hostname.includes('cloudinary.com')) {
        event.respondWith(
            caches.match(request).then((response) => {
                return response || fetch(request).then((fetchResponse) => {
                    return caches.open(DYNAMIC_CACHE).then((cache) => {
                        cache.put(request, fetchResponse.clone());
                        return fetchResponse;
                    });
                });
            }).catch(() => {
                return new Response(
                    '<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f0f0f0"/><text x="50%" y="50%" font-family="Arial" font-size="16" fill="#999" text-anchor="middle" dy=".3em">Offline</text></svg>',
                    { headers: { 'Content-Type': 'image/svg+xml' } }
                );
            })
        );
        return;
    }
    
    // PHP API calls - NETWORK ONLY (no cache)
    if (request.url.includes('.php')) {
        event.respondWith(
            fetch(request, {
                cache: 'no-store'
            }).catch(() => {
                return new Response(
                    JSON.stringify({ 
                        success: false,
                        error: 'Offline', 
                        message: 'Интернет холболт алдаатай байна. Дахин оролдоно уу.' 
                    }),
                    { 
                        status: 503,
                        headers: { 'Content-Type': 'application/json' } 
                    }
                );
            })
        );
        return;
    }
    
    // HTML, JS, and CSS files - NETWORK FIRST with cache fallback (prevents stale content)
    if (request.url.endsWith('.html') || 
        request.url.endsWith('.js') || 
        request.url.endsWith('.css') || 
        request.url.endsWith('/')) {
        event.respondWith(
            fetch(request, {
                cache: 'no-cache'
            }).then((fetchResponse) => {
                // Only cache successful responses
                if (fetchResponse.ok) {
                    // Clone BEFORE returning to avoid "already used" error
                    const responseClone = fetchResponse.clone();
                    // Update cache with fresh content (async, don't await)
                    caches.open(DYNAMIC_CACHE).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }
                return fetchResponse;
            }).catch(() => {
                // Network failed, use cache as fallback
                return caches.match(request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // No cache available
                    if (request.url.endsWith('.css')) {
                        return new Response('/* CSS offline */', { 
                            headers: { 'Content-Type': 'text/css' } 
                        });
                    }
                    return new Response(
                        '<html><body><h1>Оффлайн байна</h1><p>Интернет холболтоо шалгана уу.</p></body></html>',
                        { headers: { 'Content-Type': 'text/html' } }
                    );
                });
            })
        );
        return;
    }
    
    // CSS and other static assets - cache first with expiration check
    event.respondWith(
        caches.match(request).then(async (response) => {
            // Check if cached response is expired
            if (response) {
                const cachedDate = response.headers.get('sw-cache-date');
                if (cachedDate) {
                    const age = Date.now() - parseInt(cachedDate);
                    if (age > CACHE_EXPIRATION) {
                        // Cache expired, fetch fresh
                        try {
                            const freshResponse = await fetch(request);
                            const clonedResponse = freshResponse.clone();
                            caches.open(DYNAMIC_CACHE).then((cache) => {
                                const headers = new Headers(clonedResponse.headers);
                                headers.append('sw-cache-date', Date.now().toString());
                                const responseWithDate = new Response(clonedResponse.body, {
                                    status: clonedResponse.status,
                                    statusText: clonedResponse.statusText,
                                    headers: headers
                                });
                                cache.put(request, responseWithDate);
                            });
                            return freshResponse;
                        } catch (error) {
                            // Network failed, use stale cache
                            return response;
                        }
                    }
                }
                return response;
            }
            
            // No cache, fetch from network
            return fetch(request).then((fetchResponse) => {
                // Only cache successful responses
                if (!fetchResponse.ok) {
                    return fetchResponse;
                }
                
                return caches.open(DYNAMIC_CACHE).then((cache) => {
                    const headers = new Headers(fetchResponse.headers);
                    headers.append('sw-cache-date', Date.now().toString());
                    const responseWithDate = new Response(fetchResponse.body, {
                        status: fetchResponse.status,
                        statusText: fetchResponse.statusText,
                        headers: headers
                    });
                    cache.put(request, responseWithDate.clone());
                    return fetchResponse;
                });
            }).catch((error) => {
                // Network failed completely
                return new Response('', { status: 503, statusText: 'Service Unavailable' });
            });
        })
    );
});

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-orders') {
        event.waitUntil(syncOrders());
    }
});

async function syncOrders() {
    try {
        const cache = await caches.open(DYNAMIC_CACHE);
        const requests = await cache.keys();
        
        const orderRequests = requests.filter(req => 
            req.url.includes('checkout.php') || req.url.includes('order')
        );
        
        for (const request of orderRequests) {
            try {
                await fetch(request.clone());
                await cache.delete(request);
            } catch (error) {
                // Silent error handling
            }
        }
    } catch (error) {
        // Silent error handling
    }
}

self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Jag\'s Fashion';
    const options = {
        body: data.body || 'Shine medegdel',
        icon: data.icon || '/logo-192.png',
        badge: '/logo-192.png',
        vibrate: [200, 100, 200],
        data: data.url || '/'
    };
    
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data || '/')
    );
});

self.addEventListener('message', (event) => {
    // Manual skipWaiting (not automatic)
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
    
    // Manual cache clear (admin only)
    if (event.data.action === 'clearCache') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cache) => caches.delete(cache))
                );
            }).then(() => {
                event.ports[0].postMessage({ success: true });
            })
        );
    }
});

// Silent service worker - no console output in production
