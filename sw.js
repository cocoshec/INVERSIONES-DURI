// ============================================
// SERVICE WORKER: INVERSIONES DURI C.A (PWA)
// Permite instalar la aplicación en PC / Móvil
// ============================================

const CACHE_NAME = 'duri-pwa-v64.0';
const CORE_ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './js/app.js',
    './manifest.json',
    './img/logo-duri.png',
    './img/icon-192.png',
    './img/icon-512.png',
    './pages/productos.html',
    './pages/pedidos.html',
    './pages/inventario.html',
    './pages/nosotros.html',
    './pages/servicios.html',
    './pages/contacto.html'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Pre-caching Core App Shell');
            return cache.addAll(CORE_ASSETS).catch((err) => {
                console.warn('[ServiceWorker] Falló precaching parcial:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// Activación y limpieza de caches antiguos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[ServiceWorker] Eliminando caché antiguo:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Estrategia de Fetch: Network-First para APIs y HTML, Cache-First para estáticos
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Ignorar peticiones de extensiones de navegador o esquemas no soportados
    if (!url.protocol.startsWith('http')) return;

    // Peticiones a la API PHP siempre de la red (nunca congelar el inventario en caché)
    if (url.pathname.includes('/backend/api/')) {
        event.respondWith(
            fetch(request).catch(() => {
                return new Response(JSON.stringify({ status: 'offline', message: 'Sin conexión a internet' }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // Para archivos HTML: Network-first con fallback a caché
    if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
        event.respondWith(
            fetch(request).then((response) => {
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                }
                return response;
            }).catch(() => {
                return caches.match(request).then((cached) => cached || caches.match('./index.html'));
            })
        );
        return;
    }

    // Para recursos estáticos (CSS, JS, Imágenes, Fuentes): Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                }
                return networkResponse;
            }).catch(() => null);

            return cachedResponse || fetchPromise;
        })
    );
});
