// ========== Service Worker: 오프라인 지원 & 캐싱 ==========

const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `translator-cache-${CACHE_VERSION}`;

// 캐시할 정적 리소스
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/storage.js',
    '/js/api.js',
    '/js/ui-optimizer.js'
];

// API 캐시 전략: Network First (최신 데이터 우선)
const API_CACHE_NAME = `${CACHE_NAME}-api`;
const API_ENDPOINTS = [
    'https://knstranslator.netlify.app/.netlify/functions/translate',
    'https://knstranslator.netlify.app/.netlify/functions/auth'
];

// ========== Install: 초기 캐싱 ==========
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// ========== Activate: 오래된 캐시 삭제 ==========
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');

    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name !== CACHE_NAME && name !== API_CACHE_NAME)
                        .map(name => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// ========== Fetch: 요청 인터셉트 ==========
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // API 요청: Network First
    if (isApiRequest(url)) {
        event.respondWith(networkFirstStrategy(request));
        return;
    }

    // 정적 리소스: Cache First
    event.respondWith(cacheFirstStrategy(request));
});

// ========== 캐싱 전략 ==========

// Cache First: 정적 리소스 (빠른 로딩)
async function cacheFirstStrategy(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    if (cached) {
        console.log('[SW] Cache hit:', request.url);
        return cached;
    }

    try {
        const response = await fetch(request);

        // 성공적인 응답만 캐싱
        if (response.ok) {
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        console.error('[SW] Fetch failed:', error);

        // 오프라인 폴백
        if (request.destination === 'document') {
            return cache.match('/index.html');
        }

        return new Response('Offline', { status: 503 });
    }
}

// Network First: API 요청 (최신 데이터 우선)
async function networkFirstStrategy(request) {
    const cache = await caches.open(API_CACHE_NAME);

    try {
        const response = await fetch(request);

        // POST 요청은 캐싱하지 않음
        if (request.method === 'GET' && response.ok) {
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        console.error('[SW] Network failed, trying cache:', error);

        const cached = await cache.match(request);
        if (cached) {
            return cached;
        }

        return new Response(JSON.stringify({
            error: 'Network unavailable',
            offline: true
        }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// ========== 유틸리티 함수 ==========
function isApiRequest(url) {
    return API_ENDPOINTS.some(endpoint => url.href.startsWith(endpoint));
}

// ========== 백그라운드 동기화 (선택적) ==========
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-translations') {
        event.waitUntil(syncTranslations());
    }
});

async function syncTranslations() {
    console.log('[SW] Background sync: translations');
    // 오프라인 중 저장된 번역 요청을 서버에 전송
    // (구현은 앱 로직에 따라 다름)
}

// ========== 푸시 알림 (선택적) ==========
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};

    const options = {
        body: data.body || '새로운 알림이 있습니다.',
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        vibrate: [200, 100, 200],
        data: data
    };

    event.waitUntil(
        self.registration.showNotification(data.title || '번역기', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        clients.openWindow('/')
    );
});
