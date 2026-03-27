const CACHE_NAME = 'quran-app-v1.76';
const ASSETS = [
  './',
  './index.html',
  './app.css',
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
  // إجبار الـ Service Worker الجديد على أخذ مكان القديم فورًا
  self.skipWaiting();
});

// تشغيل التطبيق من الذاكرة حتى لو لا يوجد إنترنت
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});

// تفعيل النسخة الجديدة وحذف الكاش القديم
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
    }).then(() => {
      // السيطرة على الصفحات المفتوحة مباشرة
      self.clients.claim();

      // إرسال تاريخ آخر تحديث لكل الصفحات المفتوحة
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'LAST_UPDATE',
            date: new Date().toLocaleString("ar-EG")
          });
        });
      });
    })
  );
});

function syncRecords() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("QuranProjectDB", 3); // افتح قاعدة البيانات بنفسك
    request.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction("records", "readonly");
      const store = tx.objectStore("records");
      const getAll = store.getAll();

      getAll.onsuccess = () => {
        const unsynced = getAll.result.filter(r => !r.synced);

        Promise.all(
          unsynced.map(record =>
            fetch("https://<your-apex-server>/ords/<schema>/activities/", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(record)
            })
            .then(res => {
              if (res.ok) {
                const txUpdate = db.transaction("records", "readwrite");
                const storeUpdate = txUpdate.objectStore("records");
                record.synced = true;
                storeUpdate.put(record);
                console.log("✅ تم رفع النشاط:", record);
              }
            })
          )
        ).then(resolve).catch(reject);
      };
    };

    request.onerror = (err) => reject(err);
  });
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-records') {
    event.waitUntil(syncRecords());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-records') {
    event.waitUntil(syncRecords()); // استدعاء الدالة عند توفر الإنترنت
  }
});
