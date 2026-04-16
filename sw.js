const CACHE_NAME = 'quran-app-v1.2131';
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './quran_data.js',
  './app.js',
  './xlsx.full.min.js',
  './bootstrap.bundle.min.js',
  './students.json',
  './STATIC_LOOKUP.json',
  './manifest.json',
  './html2pdf.bundle.min.js',
  './login.html'
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
    console.log("🔄 بدأ تشغيل syncRecords (الإصدار 12)");
    
    // فتح قاعدة البيانات بالإصدار الأخير
    const request = indexedDB.open("QuranProjectDB", 12);

    request.onsuccess = (event) => {
      const db = event.target.result;

      // 1. جلب كائن الإعدادات من مخزن settings
      const settingsTx = db.transaction("settings", "readonly");
      const settingsStore = settingsTx.objectStore("settings");
      const getSettings = settingsStore.getAll(); // جلب كافة السجلات (عادة يكون سجل واحد)

      getSettings.onsuccess = () => {
        const settingsList = getSettings.result;
        
        // التأكد من وجود بيانات الجهاز
        if (!settingsList || settingsList.length === 0) {
          console.error("❌ لا يمكن المزامنة: بيانات الجهاز غير موجودة في IndexedDB");
          return resolve(); 
        }

        // استخراج device_id من أول سجل متاح
        const dbDeviceId = settingsList[0].device_id;
        console.log("🆔 تم جلب معرف الجهاز للمزامنة:", dbDeviceId);

        // 2. البدء في جلب السجلات غير المزامنة من مخزن records
        const tx = db.transaction("records", "readonly");
        const store = tx.objectStore("records");
        const getAllRecords = store.getAll();

        getAllRecords.onsuccess = () => {
          const unsynced = getAllRecords.result.filter(r => !r.synced);
          console.log("📦 عدد السجلات غير المزامنة:", unsynced.length);

          if (unsynced.length === 0) return resolve();

          Promise.all(
            unsynced.map(record =>
              fetch("https://g0a3378e3bd0d3a-dbcpc2023.adb.me-abudhabi-1.oraclecloudapps.com/ords/cpcws/qmc/students", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...record,                   // فك محتويات السجل
                  device_id_field: dbDeviceId  // إضافة معرف الجهاز المسجل
                })
              })
              .then(async res => {
                // فتح قاعدة البيانات مرة أخرى للتحديث (لضمان سياق المعاملة)
                const dbUpdate = event.target.result;
                
                if (res.ok) {
                  // ✅ نجاح الرفع للسيرفر
                  const txUpdate = dbUpdate.transaction("records", "readwrite");
                  const storeUpdate = txUpdate.objectStore("records");
                  record.synced = true;
                  record.syncError = null;
                  storeUpdate.put(record);

                  console.log("✅ نجاح المزامنة للسجل:", record.id);

                  // إرسال إشعار للصفحة النشطة
                  self.clients.matchAll().then(clients => {
                    clients.forEach(client => {
                      client.postMessage({
                        type: 'SYNC_LOG',
                        message: "✅ تم رفع النشاط بنجاح."
                      });
                    });
                  });
                } else {
                  // ❌ فشل من السيرفر (مثل 401 أو 500)
                  const errorText = await res.text();
                  console.log("❌ فشل السيرفر:", errorText);

                  const txUpdate = dbUpdate.transaction("records", "readwrite");
                  const storeUpdate = txUpdate.objectStore("records");
                  record.synced = false;
                  record.syncError = errorText;
                  storeUpdate.put(record);
                }
              })
              .catch(err => {
                // ⚠️ خطأ شبكة أو انقطاع اتصال
                console.error("⚠️ خطأ اتصال أثناء المزامنة:", err);
                const dbErr = event.target.result;
                const txUpdate = dbErr.transaction("records", "readwrite");
                const storeUpdate = txUpdate.objectStore("records");
                record.synced = false;
                record.syncError = "خطأ اتصال: " + err.message;
                storeUpdate.put(record);
              })
            )
          ).then(resolve).catch(reject);
        };
      };
    };

    request.onerror = (err) => {
      console.error("❌ فشل فتح قاعدة البيانات في SW:", err);
      reject(err);
    };
  });
}


// حدث المزامنة
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-records') {
    event.waitUntil(syncRecords());
  }
});
