const CACHE_NAME = 'quran-app-v1.2085';
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
  './html2pdf.bundle.min.js'
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

let currentDeviceId = null;

// استقبال الـ Device ID من الصفحة الرئيسية
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_DEVICE_ID') {
    currentDeviceId = event.data.deviceId;
    console.log("🆔 Service Worker استلم Device ID:", currentDeviceId);
  }
});
// دالة المزامنة مع Debug + postMessage
function syncRecords() {
  return new Promise((resolve, reject) => {
    console.log("🔄 بدأ تشغيل syncRecords");
    const request = indexedDB.open("QuranProjectDB", 7);

    request.onsuccess = (event) => {
      const db = event.target.result;

      // 1. جلب معرف الجهاز من مخزن settings أولاً
      const settingsTx = db.transaction("settings", "readonly");
      const settingsStore = settingsTx.objectStore("settings");
      const deviceRequest = settingsStore.get("device_id");

      deviceRequest.onsuccess = () => {
        const dbDeviceId = deviceRequest.result;

        if (!dbDeviceId) {
          console.error("❌ لا يمكن المزامنة: Device ID غير موجود في IndexedDB");
          return resolve(); 
        }

        // 2. البدء في جلب السجلات غير المزامنة
        const tx = db.transaction("records", "readonly");
        const store = tx.objectStore("records");
        const getAll = store.getAll();

        getAll.onsuccess = () => {
          const unsynced = getAll.result.filter(r => !r.synced);
          console.log("📦 عدد السجلات غير المزامنة:", unsynced.length);

          if (unsynced.length === 0) return resolve();

          Promise.all(
            unsynced.map(record =>
              fetch("https://g0a3378e3bd0d3a-dbcpc2023.adb.me-abudhabi-1.oraclecloudapps.com/ords/cpcws/qmc/students", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...record,                   // بيانات الطالب
                  device_id_field: dbDeviceId  // المعرف المستخرج من DB
                })
              })
              .then(async res => {
                const dbUpdate = event.target.result; // الحصول على قاعدة البيانات للتحديث
                if (res.ok) {
                  // ✅ نجاح الرفع
                  const txUpdate = dbUpdate.transaction("records", "readwrite");
                  const storeUpdate = txUpdate.objectStore("records");
                  record.synced = true;
                  record.syncError = null;
                  storeUpdate.put(record);

                  console.log("✅ تم رفع النشاط بنجاح للجهاز:", dbDeviceId);

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
                  // ❌ فشل من السيرفر
                  const errorText = await res.text();
                  console.log("❌ فشل رفع النشاط:", errorText);

                  const txUpdate = dbUpdate.transaction("records", "readwrite");
                  const storeUpdate = txUpdate.objectStore("records");
                  record.synced = false;
                  record.syncError = errorText;
                  storeUpdate.put(record);
                }
              })
              .catch(err => {
                // ⚠️ خطأ في الاتصال
                console.error("⚠️ خطأ في الاتصال:", err);
                const txUpdate = event.target.result.transaction("records", "readwrite");
                const storeUpdate = txUpdate.objectStore("records");
                record.synced = false;
                record.syncError = "خطأ في الاتصال: " + err.message;
                storeUpdate.put(record);
              })
            )
          ).then(resolve).catch(reject);
        };
      };

      deviceRequest.onerror = () => {
        console.error("❌ خطأ في الوصول لمخزن الإعدادات");
        reject("Settings store access error");
      };
    };

    request.onerror = (err) => {
      console.error("❌ خطأ في فتح قاعدة البيانات:", err);
      reject(err);
    };
  });
}

function syncRecords01() {
  return new Promise((resolve, reject) => {
    console.log("🔄 بدأ تشغيل syncRecords");
    const request = indexedDB.open("QuranProjectDB", 6);

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
      body: JSON.stringify({
        ...record,                     // فك محتويات السجل ليكون في المستوى الأول
        device_id_field: currentDeviceId // إضافة معرف الجهاز معهم
      }) 
    }) // <--- كان ينقص إغلاق قوس الـ fetch هنا
    .then(async res => {
              if (res.ok) {
                // ✅ نجاح الرفع
                const txUpdate = db.transaction("records", "readwrite");
                const storeUpdate = txUpdate.objectStore("records");
                record.synced = true;
                record.syncError = null;
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
                // ❌ فشل من السيرفر → قراءة نص الخطأ
                const errorText = await res.text();
                console.log("❌ فشل رفع النشاط:", errorText);

                const txUpdate = db.transaction("records", "readwrite");
                const storeUpdate = txUpdate.objectStore("records");
                record.synced = false;
                record.syncError = errorText; // حفظ نص الخطأ كما هو
                storeUpdate.put(record);
              }
            })
            .catch(err => {
              // ⚠️ خطأ في الاتصال (مثل انقطاع الشبكة)
              console.error("⚠️ خطأ في الاتصال:", err);

              const txUpdate = db.transaction("records", "readwrite");
              const storeUpdate = txUpdate.objectStore("records");
              record.synced = false;
              record.syncError = "خطأ في الاتصال: " + err.message;
              storeUpdate.put(record);
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
