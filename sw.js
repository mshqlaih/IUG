const CACHE_NAME = 'quran-app-v1.51';
const ASSETS = [
  './',
  './index.html',
  './quran_data.js',
  './app.js',
  './xlsx.full.min.js',
  './bootstrap.bundle.min.js'
];

// تثبيت الملفات في الذاكرة
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// تشغيل التطبيق من الذاكرة حتى لو لا يوجد إنترنت
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("جاري حذف الكاش القديم...", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
});








