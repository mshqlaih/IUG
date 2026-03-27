const CACHE_NAME = 'quran-app-v1.92';
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
  self.skipWaiting();
});

// تشغيل التطبيق من الكاش
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
      self.clients.claim();
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

// دالة المزامنة مع Debug + postMessage
function syncRecords() {
  return new Promise((resolve, reject) => {
    console.log("🔄 بدأ تشغيل syncRecords");
    const request = indexedDB.open("QuranProjectDB", 3);
    request.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction("records", "readonly");
      const store = tx.objectStore("records");
      const getAll = store.getAll();

      getAll.onsuccess = () => {
        const unsynced = getAll.result.filter(r => !r.synced);
        console.log("📦 عدد السجلات غير المزامنة:", unsynced.length);

        Promise.all(
          unsynced.map(record =>
            fetch("https://g0a3378e3bd0d3a-dbcpc2023.adb.me-abudhabi-1.oraclecloudapps.com/ords/cpcws/qmc/students", {
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

                // إرسال رسالة للصفحة
                self.clients.matchAll().then(clients => {
                  clients.forEach(client => {
                    client.postMessage({
                      type: 'SYNC_LOG',
                      message: "✅ تم رفع النشاط: " + JSON.stringify(record)
                    });
                  });
                });
              } else {
                console.log("❌ فشل رفع النشاط:", record);
              }
            })
            .catch(err => {
              console.error("⚠️ خطأ في الاتصال:", err);
            })
          )
        ).then(resolve).catch(reject);
      };
    };
    request.onerror = (err) => reject(err);
  });
}

// حدث المزامنة
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-records') {
    event.waitUntil(syncRecords());
  }
});
