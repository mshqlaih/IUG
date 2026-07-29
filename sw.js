const CACHE_NAME = 'quran-app-v1.65';

// كود التطبيق: يتغيّر مع كل تحديث ⇒ الشبكة أولاً حتى يصل الجديد فوراً
const SHELL_FILES = ['index.html', 'login.html', 'app.js', 'api.js', 'app.css'];
const SHELL = ['./', './index.html', './login.html', './app.css', './app.js', './api.js'];

// ثابت لا يتغيّر عملياً ⇒ الكاش أولاً (أسرع وأخفّ على الشبكة)
const ASSETS = ['./quran_data.js', './STATIC_LOOKUP.json', './manifest.json',
                './bootstrap.bundle.min.js', './icon.png'];

// ثقيل — يُخزَّن في الخلفية ولا يُفشّل التثبيت
const OPTIONAL = ['./xlsx.full.min.js', './html2pdf.bundle.min.js'];

// تجاوز كاش المتصفح عند التخزين.
// بدونه قد يسلّم المتصفحُ الـ SW نسخةً قديمة من app.js فتُخزَّن تحت اسم
// الكاش الجديد — فيرى المستخدم رقم نسخة جديداً وسلوكاً قديماً، ولا ينحلّ
// الأمر إلا بـ «تحديث كامل». هذا كان سبب المشكلة.
function freshRequest(url) {
  return new Request(url, { cache: 'reload' });
}

// تثبيت الملفات في الذاكرة (مرن: فشل ملف لا يكسر الكل)
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(SHELL.concat(ASSETS).map((u) => cache.add(freshRequest(u))));
    Promise.allSettled(OPTIONAL.map((u) => cache.add(freshRequest(u))));  // في الخلفية
  })());
});

// تفعيل النسخة الجديدة وحذف الكاش القديم
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
    // إبلاغ الصفحة بآخر تحديث (مستخدم في app.js)
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'LAST_UPDATE',
        date: new Date().toLocaleString("ar-EG")
      });
    });
  })());
});

// الرد على استفسار الصفحة عن رقم النسخة (المصدر الوحيد: CACHE_NAME أعلاه)
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'GET_VERSION' && e.source) {
    e.source.postMessage({ type: 'APP_VERSION', version: CACHE_NAME });
  }
});

// هل الطلب لكود التطبيق (صفحة/سكربت/تنسيق) أم لأصل ثابت؟
function isShellRequest(req, url) {
  if (req.mode === 'navigate') return true;
  const name = url.pathname.split('/').pop();
  return name === '' || SHELL_FILES.indexOf(name) !== -1;
}

// جلب بمهلة: لا ننتظر شبكة بطيئة أكثر من ثوانٍ قليلة ثم نرجع للكاش
async function fetchWithTimeout(req, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(req, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function cacheFallback(cache, req) {
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;
  if (req.mode === 'navigate') {
    return (await cache.match('./index.html', { ignoreSearch: true })) || Response.error();
  }
  return Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url; try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;            // مرّر طلبات API الخارجية للشبكة

  e.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // كود التطبيق: الشبكة أولاً ⇒ إعادة تحميل عادية تكفي لرؤية الجديد،
    // ومع انقطاع الشبكة يعمل من الكاش كالمعتاد.
    if (isShellRequest(req, url)) {
      try {
        const fresh = await fetchWithTimeout(req, 4000);
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        return cacheFallback(cache, req);
      }
    }

    // الأصول الثابتة: الكاش أولاً مع تحديث صامت في الخلفية
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) {
      fetch(req).then((r) => { if (r && r.ok) cache.put(req, r.clone()); }).catch(() => {});
      return cached;
    }

    try {
      const r = await fetch(req);
      if (r && r.ok && r.type === 'basic') cache.put(req, r.clone());
      return r;
    } catch (_) {
      return cacheFallback(cache, req);
    }
  })());
});


// جسم saveActivity — نسخة مطابقة لِما في api.js (الـ SW لا يستطيع استيراده).
// أي تعديل هنا يجب أن يُطبَّق في buildSaveActivityBody داخل api.js والعكس.
function buildSaveActivityBody(record) {
  const type = Number(record.type);
  const isPartMode = (type === 6 || type === 7);

  const from = isPartMode ? record.partFrom : record.fromRange;
  const to   = isPartMode ? record.partTo   : record.toRange;

  const num = (v) => (v === "" || v === null || v === undefined) ? null : Number(v);

  return {
    action          : "SAVE",
    user_name       : String(record.teacher || ""),
    student_no      : String(record.student),
    attendance_type : String(type),
    activity_date   : String(record.date),
    from_aya_no     : String(num(from) ?? 0),
    to_aya_no       : String(num(to) ?? 0),
    num_errors      : String(num(record.errors) ?? 0),
    recitation_grade: num(record.rating),
    student_mark    : num(record.mark),
    notes           : record.notes || "",
    tagno           : record.tagNo ? Number(record.tagNo) : null,
  };
}

// دالة المزامنة مع Debug + postMessage
function syncRecords() {
  return new Promise((resolve, reject) => {
    console.log("🔄 بدأ تشغيل syncRecords");

    // بلا رقم إصدار: نفتح القاعدة كما هي دائماً.
    // تثبيت رقم هنا يجعل الـ SW يفشل (VersionError) كلما رقّت الصفحة القاعدة،
    // أو — أسوأ — يرقّيها بنفسه بلا مخازن جديدة قبل أن تفتحها الصفحة.
    const request = indexedDB.open("QuranProjectDB");

    request.onsuccess = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("settings") || !db.objectStoreNames.contains("records")) {
        console.warn("⚠️ القاعدة غير مهيأة بعد، تخطّي المزامنة");
        return resolve();
      }

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
              fetch("https://g0a3378e3bd0d3a-dbcpc2023.adb.me-abudhabi-1.oraclecloudapps.com/ords/cpcws/qmc/saveActivity", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Device-Id": dbDeviceId,
                  "X-Platform": "web"
                },
                body: JSON.stringify(buildSaveActivityBody(record))
              })
              .then(async res => {
                // فتح قاعدة البيانات مرة أخرى للتحديث (لضمان سياق المعاملة)
                const dbUpdate = event.target.result;

                // النجاح يتطلّب status = success/ok صراحةً؛ ORDS قد يعيد 200
                // ومعها خطأ في الجسم فيُحسب السجل "مزامَناً" وهو لم يُحفظ.
                const bodyText = await res.clone().text().catch(() => "");
                let payload = null;
                try { payload = JSON.parse(bodyText); } catch (_) {}

                const st = (payload && typeof payload === "object")
                  ? String(payload.status || "").toLowerCase() : "";
                const succeeded = res.ok && (st === "success" || st === "ok");

                if (succeeded) {
                  if (payload.tagno != null) record.tagNo = Number(payload.tagno);
                  if (payload.numPages != null) record.amount = Number(payload.numPages);
                }

                if (succeeded) {
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
                  // ❌ فشل من السيرفر (حالة HTTP أو خطأ داخل جسم الاستجابة)
                  const errorText = bodyText || ("HTTP " + res.status);
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
