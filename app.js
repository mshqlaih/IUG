// استدعاء ملف Service Worker للعمل أوفلاين
// --- 1. تسجيل الـ Service Worker وإدارة التحديثات ---

// معالج تغيير حالة الاتصال (Online/Offline)
window.addEventListener('online', () => {
    console.log('✔ عاد الاتصال بالإنترنت');
    const deviceId = localStorage.getItem("device_id");
    const userName = localStorage.getItem("user_name");
    // إذا لم تكن هناك بيانات محفوظة بعد عودة الاتصال، انقل إلى صفحة الدخول
    if (!deviceId || deviceId === "null" || !userName || userName === "null") {
        console.log('🔄 لا توجد بيانات محفوظة، الانتقال إلى صفحة الدخول...');
        window.location.replace("login.html");
    }
});

window.addEventListener('offline', () => {
    console.log('❌ فُقد الاتصال بالإنترنت، يعمل التطبيق offline الآن');
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
        console.log("نظام العمل أوفلاين نشط");        
        reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // لافتة غير معطِّلة بدل confirm
                    const b = document.getElementById('updateBanner');
                    if (b) b.style.display = 'flex';
                }
            };
        };

    
        // استقبال الرسائل من الـ SW (تاريخ آخر تحديث + رقم النسخة)
        navigator.serviceWorker.addEventListener('message', (event) => {
            const data = event.data || {};

            if (data.type === 'LAST_UPDATE') {
                // تُخزَّن ليعرضها حقل «آخر تحديث للملفات» في شاشة الإعدادات
                localStorage.setItem("lastUpdate", data.date);
                const settingsLabel = document.getElementById("settingsLastUpdate");
                if (settingsLabel) settingsLabel.textContent = data.date;
            }

            if (data.type === 'APP_VERSION') {
                localStorage.setItem("appVersion", data.version);
                const el = document.getElementById("appVersion");
                if (el) el.textContent = data.version;
            }
        });

    }).catch(err => console.log("خطأ في تسجيل الـ SW:", err));
}

// --- مزامنة احتياطية للصفحة (iOS لا يدعم Background Sync) ---
// هل Background Sync مدعوم؟ (متوفر في Chrome/Android، غير متوفر في Safari/iOS)
const SUPPORTS_BG_SYNC = ('serviceWorker' in navigator) && ('SyncManager' in window);

let _syncInProgress = false;

// موزِّع المزامنة: يستخدم Background Sync إن وُجد، وإلا يزامن من الصفحة مباشرة
// (يستدعي syncRecordsFromPage المعرّفة أدناه — النسخة المعتمدة على db العام)
function requestSync() {
    if (_syncInProgress || !navigator.onLine) return;   // منع التشغيل المتزامن / لا فائدة بدون اتصال
    if (SUPPORTS_BG_SYNC) {
        navigator.serviceWorker.ready
            .then(reg => reg.sync.register('sync-records'))
            .catch(err => {
                console.warn("⚠️ فشل تسجيل Background Sync، التحويل للمزامنة الصفحية:", err);
                runPageSync();
            });
    } else {
        // iOS / متصفحات بلا Background Sync
        runPageSync();
    }
}

// غلاف يرفع علم التقدّم حول المزامنة الصفحية ثم يُنزله مهما كانت النتيجة
function runPageSync() {
    _syncInProgress = true;
    Promise.resolve(syncRecordsFromPage())
        .catch(err => console.error("❌ خطأ أثناء المزامنة:", err))
        .finally(() => { _syncInProgress = false; });
}

// مُحفّز iOS: مزامنة عند إعادة فتح/إظهار التطبيق (يعوّض غياب Background Sync)
if (!SUPPORTS_BG_SYNC) {
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") requestSync();
    });
}

// --- لافتة iPhone «إضافة إلى الشاشة الرئيسية» (iOS لا يدعم beforeinstallprompt) ---
function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent || navigator.platform || "");
}
function isInStandalone() {
    return window.navigator.standalone === true ||
           window.matchMedia('(display-mode: standalone)').matches;
}
function maybeShowIosBanner() {
    const banner = document.getElementById('iosInstallBanner');
    if (!banner) return;
    if (isIos() && !isInStandalone() &&
        localStorage.getItem('iosBannerDismissed') !== '1') {
        banner.style.display = 'flex';
    }
}
function dismissIosBanner() {
    const banner = document.getElementById('iosInstallBanner');
    if (banner) banner.style.display = 'none';
    localStorage.setItem('iosBannerDismissed', '1');
}

// --- شريط الحالة الديناميكي (متّصل/دون اتصال) ---
function updateStatusBanner() {
    const chip = document.getElementById('statusChip');
    const text = document.getElementById('statusChipText');
    const note = document.getElementById('statusChipNote');
    if (!chip || !text) return;
    const dot = chip.querySelector('i');
    if (navigator.onLine) {
        if (dot) dot.style.color = '#34a853';
        text.textContent = 'متّصل';
        if (note) note.textContent = 'يمكنك المزامنة وسحب البيانات الآن.';
    } else {
        if (dot) dot.style.color = '#9aa0a6';
        text.textContent = 'يعمل دون اتصال';
        if (note) note.textContent = 'التطبيق يعمل محلياً ويحتفظ ببياناتك حتى عودة الشبكة.';
    }
}
function onConnectivityChange() {
    updateStatusBanner();
    if (typeof refreshSettingsInfo === 'function') refreshSettingsInfo();
}
window.addEventListener('online', onConnectivityChange);
window.addEventListener('offline', onConnectivityChange);
window.addEventListener('DOMContentLoaded', () => {
    updateStatusBanner();
    maybeShowIosBanner();
});
// --- 2. إدارة ظهور أيقونة (زر) تثبيت التطبيق PWA ---
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // منع المتصفح من إظهار النافذة التلقائية
    e.preventDefault();
    // حفظ الحدث لاستخدامه عند النقر
    deferredPrompt = e;

    // ابحث عن زر التثبيت في الـ HTML الخاص بك (تأكد أن id="installBtn")
    const installBtn = document.getElementById('installBtn');
    
    if (installBtn) {
        // إظهار الزر للمستخدم
        installBtn.style.display = 'block';

        installBtn.onclick = async () => {
            if (deferredPrompt) {
                // إظهار نافذة التثبيت الأصلية للمتصفح
                deferredPrompt.prompt();
                
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`قرار المستخدم: ${outcome}`);
                
                // تنظيف المتغير وإخفاء الزر
                deferredPrompt = null;
                installBtn.style.display = 'none';
            }
        };
    }
});

// إخفاء الزر إذا تم تثبيت التطبيق بالفعل
window.addEventListener('appinstalled', () => {
    console.log('تم تثبيت التطبيق بنجاح');
    const installBtn = document.getElementById('installBtn');
    if (installBtn) installBtn.style.display = 'none';
});

const DB_NAME = "QuranProjectDB";
let db;
window.AYAH_REVERSE = {};
let STATIC_LOOKUP = [];
// 1. تشغيل النظام عند التحميل
// هوية المسمّع = اسم المستخدم الذي سجّل الدخول (لا يُدخل يدوياً)
// teacherID مُبقاة كاحتياط للتثبيتات القديمة التي سجّلت الدخول قبل هذا التغيير.
function getCurrentUser() {
    return String(
        localStorage.getItem("user_name") ||
        localStorage.getItem("teacherID") ||
        ""
    ).trim();
}

window.onload = () => {
    fillAyatSearchList();
    loadStaticLookup();
    initDB();
    document.getElementById('activityDate').valueAsDate = new Date();
    requestAppVersion();
    refreshSettingsInfo();
};

function loadStaticLookup() {
    return fetch('./STATIC_LOOKUP.json')
        .then(response => response.json())
        .then(data => {
            STATIC_LOOKUP = data;
            console.log("✔ STATIC_LOOKUP loaded:", STATIC_LOOKUP);
        })
        .catch(err => console.error("❌ خطأ في تحميل STATIC_LOOKUP:", err));
}

// استدعاء عند بداية الصفحة
loadStaticLookup();

// 2. تهيئة قاعدة البيانات
function initDB() {
    const request = indexedDB.open(DB_NAME, 13); // 13: إضافة مخزن الحلقات
    request.onupgradeneeded = (e) => {
        db = e.target.result;

        if (!db.objectStoreNames.contains("students")) {
            db.createObjectStore("students", { keyPath: "id" });
        }

        let store;
        
        if (!db.objectStoreNames.contains("records")) {
            store = db.createObjectStore("records", { keyPath: "id", autoIncrement: true });
        } else {
            store = e.target.transaction.objectStore("records");
        }

        if (!store.indexNames.contains("student_date_type")) {
            store.createIndex("student_date_type", ["student", "date", "type"], { unique: true });
        }
        
        if (!store.indexNames.contains("sortOrderIndex")) {
            store.createIndex("sortOrderIndex", "sortOrder", { unique: false });
        }
        
        let empStore;
        if (!db.objectStoreNames.contains("empdata")) {
            empStore = db.createObjectStore("empdata", { keyPath: "idno"});
        } else {
            empStore = e.target.transaction.objectStore("empdata");
        }

        let settingStore;
        if (!db.objectStoreNames.contains("settings")) {
            settingStore = db.createObjectStore("settings", { keyPath: "device_id"});
        } else {
            settingStore = e.target.transaction.objectStore("settings");
        }

        // حلقات المستخدم (قد تكون أكثر من حلقة) — مصدرها getUserCircles
        if (!db.objectStoreNames.contains("circles")) {
            db.createObjectStore("circles", { keyPath: "circleNo" });
        }


    };

    request.onsuccess = (e) => {
        db = e.target.result;
        refreshAll();
        fetchAndStoreEmpData(getCurrentUser());
        fetchAndStoreCircles();
        refreshSettingsInfo();

         if (!window._syncOnlineListenerAdded) {
        window._syncOnlineListenerAdded = true;
        window.addEventListener("online", () => {
            console.log("📶 الإنترنت عاد، تسجيل المزامنة...");
            requestSync();
        });
    }

    };
}

/* =========================================================
   تطبيع النص العربي + فهرس السور (لتصفية "الآية من/إلى")
   ========================================================= */

// إزالة التشكيل والتطويل وتوحيد الهمزات والألف المقصورة والتاء المربوطة
function normalizeAr(txt) {
    return String(txt || '')
        .replace(/[ً-ْٰـ]/g, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/\s+/g, ' ')
        .trim();
}

// حذف "ال" التعريف من بداية الكلمة فقط (وليس من داخلها كما كان يحدث سابقاً)
function stripAl(word) {
    return String(word || '').replace(/^ال/, '');
}

// فهرس السور: { s, name, n (مُطبّع), nb (بدون ال), words, firstId, lastId }
function buildSurahIndex() {
    if (window.SURAH_INDEX) return window.SURAH_INDEX;
    if (typeof QURAN_DATA === 'undefined') return [];

    const map = {};
    QURAN_DATA.forEach(item => {
        if (!item.s) return; // تجاهل السجل الصفري (id:0) المستخدم كقيمة فارغة
        if (!map[item.s]) {
            const m = /^سورة\s+(.+?)\s+آية\s/.exec(item.l);
            const name = m ? m[1] : ('سورة ' + item.s);
            const n = normalizeAr(name);
            map[item.s] = {
                s: item.s,
                name: name,
                n: n,
                nb: stripAl(n),
                words: n.split(' ').map(stripAl),
                firstId: item.id,
                lastId: item.id
            };
        }
        map[item.s].lastId = item.id;
    });

    window.SURAH_BY_NUM = map;
    window.SURAH_INDEX = Object.keys(map)
        .map(k => map[k])
        .sort((a, b) => a.s - b.s);

    console.log("تم بناء فهرس السور ✅ (" + window.SURAH_INDEX.length + " سورة)");
    return window.SURAH_INDEX;
}

// تعبئة قائمة السور المنسدلة
function fillSurahSelect() {
    const sel = document.getElementById('surahFilter');
    if (!sel || sel.options.length > 1) return; // الخيار الأول "كل السور" موجود دائماً

    const frag = document.createDocumentFragment();
    buildSurahIndex().forEach(su => {
        const o = document.createElement('option');
        o.value = su.s;
        o.textContent = su.s + '. ' + su.name;
        frag.appendChild(o);
    });
    sel.appendChild(frag);
}

// عند تغيير السورة: نحصر قائمة الآيات فيها ونحدّث الحقل النشط
function onSurahFilterChange() {
    const sel = document.getElementById('surahFilter');
    window.CURRENT_SURAH = (sel && sel.value) ? Number(sel.value) : null;

    const active = document.activeElement;
    const target = (active && (active.id === 'rangeFromText' || active.id === 'rangeToText'))
        ? active
        : document.getElementById('rangeFromText');

    if (target) handleSmartSearch(target);
}

function fillAyatSearchList() {
    const list = document.getElementById('ayatList');
    if (!list) return; // تأكد أن العنصر موجود

    if (typeof QURAN_DATA === 'undefined') return;

    // فهرس السور + قائمة السور المنسدلة (خفيفة، وتُبنى مرة واحدة داخلياً)
    buildSurahIndex();
    fillSurahSelect();

    // 1. إذا كانت القائمة (Datalist) بها خيارات فعلياً، فلا داعي لإعادة بنائها
    if (list.options.length > 0) {
        console.log("قائمة البحث جاهزة مسبقاً ✅");
        return;
    }

    // 2. بناء PAGE_MAX_LINES و AYAH_REVERSE مرة واحدة فقط
    if (typeof window.PAGE_MAX_LINES === 'undefined') {
        window.PAGE_MAX_LINES = QURAN_DATA.reduce((acc, curr) => {
            acc[curr.p] = Math.max(acc[curr.p] || 0, curr.le);
            return acc;
        }, {});

        // بناء مصفوفة الأسماء (ترجمة IDs إلى نصوص) + عكسها (نص ← ID)
        // نستثني السجل الصفري (id:0, l:"سورة  آية 0 ص 0 ج 0") وإلا ظهر نصاً
        // مضحكاً في أي نشاط بلا آيات (الحضور والغياب).
        window.AYAH_BY_LABEL = {};
        QURAN_DATA.forEach(item => {
            if (!item.id || !item.s) return;
            window.AYAH_REVERSE[item.id] = item.l;
            window.AYAH_BY_LABEL[item.l] = item.id;
        });
        console.log("تم تجهيز بيانات المساعدة بنجاح ✅");
    }

    // 3. بناء قائمة البحث (Datalist)
    const fragment = document.createDocumentFragment();
    QURAN_DATA.forEach(item => {
        const option = document.createElement('option');
        option.value = item.l;
        option.setAttribute('data-id', item.id); // أفضل من dataset برمجياً للـ Datalist
        fragment.appendChild(option);
    });

    list.innerHTML = "";
    list.appendChild(fragment);
}

// أيقونات وألوان الأنشطة — مطابقة لـ StudentsScreen في تطبيق Flutter
// (record_voice_over / refresh / person / mail / close / emoji_events / menu_book)
const activityStyles = {
    "1":  { fa: "fa-microphone-lines", color: "#2196F3" }, // تسميع
    "2":  { fa: "fa-arrows-rotate",    color: "#4CAF50" }, // مراجعة
    "3":  { fa: "fa-user",             color: "#009688" }, // حضور بدون تسميع
    "4":  { fa: "fa-envelope",         color: "#3F51B5" }, // غياب بعذر
    "5":  { fa: "fa-xmark",            color: "#F44336" }, // غياب بدون عذر
    "6":  { fa: "fa-trophy",           color: "#FF9800" }, // اختبار جزء
    "7":  { fa: "fa-book-open",        color: "#9C27B0" }, // سرد
    "8":  { fa: "fa-lightbulb",        color: "#E67E22" },
    "99": { fa: "fa-minus",            color: "#BDC3C7" }
};

const DEFAULT_ACTIVITY_STYLE = { fa: "fa-circle-question", color: "#95A5A6" };

function activityStyle(type) {
    return activityStyles[String(type)] || DEFAULT_ACTIVITY_STYLE;
}

// وسم أيقونة النشاط جاهزاً للإدراج في HTML
function activityIconHtml(type, extraClass) {
    const st = activityStyle(type);
    return `<i class="fas ${st.fa} ${extraClass || ''}" style="color:${st.color}"></i>`;
}

function initIconSelector() {
    const select = document.getElementById('activityType');
    const container = document.getElementById('iconsContainer');

    if (!select || !container) return;

    // مراقب ذكي: بمجرد تعبئة القائمة بالبيانات، يقوم برسم الأيقونات
    const observer = new MutationObserver(() => {
        if (select.options.length > 0) {
            drawIcons(select, container);
            observer.disconnect(); // نتوقف عن المراقبة بعد أول تعبئة ناجحة
        }
    });

    observer.observe(select, { childList: true });
}

function drawIcons(select, container) {
    container.innerHTML = '';
    Array.from(select.options).forEach(opt => {
        if (!opt.value) return;

        const style = activityStyle(opt.value);
        const item = document.createElement('div');
        item.className = "icon-card";
        item.dataset.value = opt.value;   // يتيح اختيار النوع برمجياً من بطاقات الطلبة
        item.innerHTML = `<span class="emoji">${activityIconHtml(opt.value)}</span>` +
                         `<span class="text">${escapeHtml(opt.text)}</span>`;
        item.style.borderBottom = `3px solid ${style.color}`;

        item.onclick = () => selectActivityType(opt.value);

        container.appendChild(item);
    });
}

// إلغاء تمييز نوع النشاط (بعد الحفظ السريع مثلاً)
function clearActivityTypeSelection() {
    const select = document.getElementById('activityType');
    if (select) select.value = '';
    const container = document.getElementById('iconsContainer');
    if (container) {
        container.querySelectorAll('.icon-card').forEach(c => c.classList.remove('active'));
    }
}

// اختيار نوع النشاط برمجياً أو بالنقر.
// silent = لا تُشغّل الحفظ السريع (تُستخدم عند تحميل نشاط للتعديل)
function selectActivityType(value, options) {
    const silent = !!(options && options.silent);

    const select = document.getElementById('activityType');
    if (select) select.value = String(value);

    const container = document.getElementById('iconsContainer');
    if (container) {
        container.querySelectorAll('.icon-card').forEach(card => {
            card.classList.toggle('active', String(card.dataset.value) === String(value));
        });
    }

    handleActivityTypeChange(value, { silent: silent });

    if (select) select.dispatchEvent(new Event('change'));
}

populateSelectFromLookups("activityType", "RECITATION_ATTENDANCE_TYPE");
populateSelectFromLookups("rating", "ACTIVITY_GRADE");

initIconSelector();

let lookupMap = {};

function loadLookups() {
    return fetch('./STATIC_LOOKUP.json')
        .then(response => response.json())
        .then(data => {
            lookupMap = {};
            data.forEach(item => {
                const code = item.LOOKUP_MEANING_CODE;
                if (!lookupMap[code]) lookupMap[code] = {};
                lookupMap[code][item.LOOKUP_VALUE] = item.LOOKUP_A_NAME;
            });
        })
        .catch(err => console.error("❌ خطأ في تحميل الثوابت:", err));
}

// 3. محرك البحث الذكي (بقرة 155 / ق 3 / ص 20 / احقاف ج 26)

// تحليل نص البحث إلى: اسم سورة + رقم آية + صفحة + جزء
function parseAyahQuery(raw) {
    let t = normalizeAr(raw).replace(/سوره/g, ' ').replace(/ايه/g, ' ');

    let page = null, juz = null;
    // "ص" و "ج" تُحسبان صفحة/جزء فقط إذا كانتا كلمة مستقلة (حتى لا تتأثر "قصص 5" أو "حج 5")
    t = t.replace(/(^|\s)ص\s*(\d+)/, function (m, p1, d) { page = Number(d); return ' '; });
    t = t.replace(/(^|\s)ج\s*(\d+)/, function (m, p1, d) { juz  = Number(d); return ' '; });

    const nums  = (t.match(/\d+/g) || []).map(Number);
    const words = t.replace(/\d+/g, ' ').split(/\s+/).filter(w => w.length > 0).map(stripAl);

    return {
        page: page,
        juz : juz,
        num : nums.length ? nums[nums.length - 1] : null,
        words: words
    };
}

// درجة تطابق كلمة مع اسم السورة: 3 = تطابق تام، 2 = بداية الاسم/إحدى كلماته، 1 = احتواء، 0 = لا شيء
function surahWordScore(word, su) {
    if (su.n === word || su.nb === word) return 3;
    if (su.n.indexOf(word) === 0 || su.nb.indexOf(word) === 0) return 2;
    for (let i = 0; i < su.words.length; i++) {
        if (su.words[i].indexOf(word) === 0) return 2;
    }
    return su.n.indexOf(word) !== -1 ? 1 : 0;
}

// البحث الفعلي؛ surahScope = رقم السورة المختارة من القائمة (أو null)
function searchAyat(raw, surahScope) {
    if (typeof QURAN_DATA === 'undefined') return [];
    buildSurahIndex();

    const q = parseAyahQuery(raw);
    let surahScore = null;

    if (q.words.length) {
        surahScore = {};
        window.SURAH_INDEX.forEach(su => {
            let min = 3;
            for (let i = 0; i < q.words.length; i++) {
                const sc = surahWordScore(q.words[i], su);
                if (sc === 0) { min = 0; break; }
                if (sc < min) min = sc;
            }
            if (min > 0) surahScore[su.s] = min;
        });

        const keys = Object.keys(surahScore);
        if (!keys.length) return [];

        // عند وجود تطابق قوي نستبعد الضعيف:
        // "ق" ⇒ سورة ق فقط، وليس الأحقاف/البقرة/الفرقان
        let best = 0;
        keys.forEach(k => { if (surahScore[k] > best) best = surahScore[k]; });
        if (best >= 2) keys.forEach(k => { if (surahScore[k] < best) delete surahScore[k]; });
    }

    const matchedSurahs = surahScore ? Object.keys(surahScore).length : 0;
    const limit = (surahScope || (surahScore && matchedSurahs <= 2)) ? 300 : 40;

    const out = [];
    for (let i = 0; i < QURAN_DATA.length; i++) {
        const it = QURAN_DATA[i];

        if (!it.s) continue; // السجل الصفري
        if (surahScope && it.s !== surahScope) continue;
        if (surahScore && !surahScore[it.s]) continue;
        if (q.page !== null && it.p !== q.page) continue;
        if (q.juz  !== null && it.j !== q.juz)  continue;

        if (q.num !== null) {
            if (q.words.length || q.page !== null || q.juz !== null || surahScope) {
                if (it.a !== q.num) continue;                 // الرقم = رقم الآية
            } else if (it.a !== q.num && it.p !== q.num) {
                continue;                                     // رقم مجرد: آية أو صفحة
            }
        }

        out.push(it);
        if (out.length >= limit) break;
    }
    return out;
}

// إعادة القائمة لوضعها الكامل (كل المصحف) — تُستدعى عند مسح البحث بلا سورة مختارة
function rebuildFullAyatList() {
    const list = document.getElementById('ayatList');
    if (!list || typeof QURAN_DATA === 'undefined') return;
    if (list.options.length === QURAN_DATA.length) return; // كاملة أصلاً
    renderOptions(QURAN_DATA);
}

function handleSmartSearch(inputEl) {
    if (typeof QURAN_DATA === 'undefined') return;

    const val   = String(inputEl.value || '').replace(/^\s+|\s+$/g, '');
    const scope = window.CURRENT_SURAH || null;

    // لا نص ولا سورة مختارة ⇒ أعد القائمة كاملة (وإلا بقيت مفلترة على بحث سابق)
    if (val.length < 1 && !scope) { rebuildFullAyatList(); return; }

    let res = searchAyat(val, scope);

    // لا نتيجة داخل السورة المختارة ⇒ ابحث في كل المصحف (حتى لا يصل المستخدم لطريق مسدود)
    if (!res.length && scope && val.length) res = searchAyat(val, null);

    renderOptions(res);
}

function renderOptions(data) {
    const list = document.getElementById('ayatList');
    // window.AYAH_REVERSE = {}; // ❌ احذف هذا السطر فوراً! يسبب مسح البيانات
    
    list.innerHTML = "";

    data.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.l;
        opt.setAttribute('data-id', item.id); // تخزين الـ ID للبحث
        
        // لا نحتاج لتعبئة AYAH_REVERSE هنا لأنها تعبأت عند تحميل الصفحة
        list.appendChild(opt);
    });
}

// 4. اختيار الطالب (القفزة الذكية + الإحصائيات)
document.getElementById('studentSelect').addEventListener('change', function() {
    
    const id = this.value;
    if (!id) { 
        document.getElementById('studentStatsCard').style.display = 'none'; 
        return; 
    }

    const select = document.getElementById('studentSelect');
    const name   = select.options[select.selectedIndex].text; // الاسم (النص المعروض)

    document.getElementById('statStudentName').innerText = name;
    document.getElementById('studentStatsCard').style.display = 'block';

    const tx = db.transaction(["records"], "readonly");
    const store = tx.objectStore("records");
    let hifz = 0, muraja = 0, errs = 0, cnt = 0, lastDate = null;

    store.openCursor(null, 'prev').onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            if (cursor.value.student == id) {
                if (!lastDate) {
                    lastDate = cursor.value.date;
                }

                // الآن amount يجب أن يكون رقمًا (ناتج الدالة calculateExactProgress)
                const p = parseFloat(cursor.value.amount) || 0;

                if (cursor.value.type == 1) hifz += p;
                else if (cursor.value.type == 2) muraja += p;

                errs += parseInt(cursor.value.errors) || 0;
                cnt++;
            }
            cursor.continue();
        } else {
            // هنا يمكنك عرض النص باستخدام progressToText إذا أردت
            const hifzText   = progressToText(hifz);
            const murajaText = progressToText(muraja);

            updateStatsUI(hifz, muraja, errs, cnt, lastDate);

            // مثال: لو أردت عرض النصوص بجانب الأرقام
           // document.getElementById('totalHifz').innerText   = hifzText;
           // document.getElementById('totalMuraja').innerText = murajaText;
        }
    };
});

// 5. حساب المقدار الدقيق (أرباع وصفحات)

// دالة الحساب وإرجاع القيمة الرقمية
// 1. الدالة المساعدة للحساب للأمام (Forward) - أساس كل الحسابات
// 1. الدالة المساعدة للحساب (Forward) مع مراقبة كاملة
function getForwardPages(id1, id2) {
    console.log(`--- بدء حساب Forward من ID: ${id1} إلى ID: ${id2} ---`);
    
    const s = QURAN_DATA.find(i => i.id === id1);
    const e = QURAN_DATA.find(i => i.id === id2);
    
    if (!s || !e) {
        console.error("خطأ: لم يتم العثور على بيانات الآيات في المصفوفة لهذه المعرفات.");
        return 0;
    }

    // فحص PAGE_MAX_LINES
    if (!window.PAGE_MAX_LINES || Object.keys(window.PAGE_MAX_LINES).length === 0) {
        console.warn("تنبيه: PAGE_MAX_LINES غير معرفة أو فارغة، سيتم استخدام 15 افتراضياً.");
    }

    let startL = (s.a === 1 && (s.ls === 2 || s.ls === 3)) ? 1 : (s.ls || 1);
    let maxLinesInPage = (window.PAGE_MAX_LINES && window.PAGE_MAX_LINES[e.p]) ? window.PAGE_MAX_LINES[e.p] : 15;
    let endL = (e.le === maxLinesInPage) ? 15 : (e.le || 15);

    console.log(`الصفحة: ${s.p} -> ${e.p} | الأسطر: ${startL} -> ${endL}`);

    let total = 0;
    let pCount = (e.p - s.p) + 1;

    for (let i = 1; i <= pCount; i++) {
        if (i === 1 && pCount === 1) total += (endL - startL + 1) / 15;
        else if (i === 1)           total += (15 - startL + 1) / 15;
        else if (i === pCount)       total += (endL / 15);
        else                        total += 1;
    }
    
    console.log(`النتيجة الجزئية لهذه السورة: ${total.toFixed(2)}`);
    return total || 0;
}

// 2. الدالة الرئيسية (تطابق منطق أوراكل)
function calculateExactProgress() {
    console.clear(); // تنظيف الكونسول لرؤية الحساب الجديد بوضوح
    
    const fID = parseInt(document.getElementById('rangeFrom').value);
    const tID = parseInt(document.getElementById('rangeTo').value);
    const display = document.getElementById('calcResult');

    console.log(`محاولة الحساب النهائية: من ${fID} إلى ${tID}`);

    if (!fID || !tID) {
        console.warn("تنبيه: أحد المعرفات (IDs) مفقود أو صفر.");
        if(display) display.innerText = "0";
        return;
    }

    const fObj = QURAN_DATA.find(i => i.id === fID);
    const tObj = QURAN_DATA.find(i => i.id === tID);

    if (!fObj || !tObj) {
        console.error("خطأ: تعذر العثور على كائنات الآيات المختارة.");
        return;
    }

    let finalPages = 0;

    // الحالة العكسية (المرسلات -> الإنسان)
    if (fID > tID) {
        console.log("المنطق المكتشف: تسميع عكسي (Backwards)");
        
        // سورة البدء
        const sFromAyahs = QURAN_DATA.filter(i => i.s === fObj.s);
        const lastAFrom = sFromAyahs[sFromAyahs.length - 1];
        console.log(`حساب سورة البدء (${fObj.s}): من آية ${fObj.a} لنهاية السورة`);
        finalPages += getForwardPages(fID, lastAFrom.id);

        // سورة النهاية والسور البينية
        if (fObj.s !== tObj.s) {
            const firstATo = QURAN_DATA.find(i => i.s === tObj.s);
            console.log(`حساب سورة النهاية (${tObj.s}): من بداية السورة لآية ${tObj.a}`);
            finalPages += getForwardPages(firstATo.id, tID);

            // السور البينية
            let minS = Math.min(fObj.s, tObj.s);
            let maxS = Math.max(fObj.s, tObj.s);
            for (let s = minS + 1; s < maxS; s++) {
                const sItems = QURAN_DATA.filter(i => i.s === s);
                if (sItems.length > 0) {
                    console.log(`حساب سورة كاملة بينهما: سورة رقم ${s}`);
                    finalPages += getForwardPages(sItems[0].id, sItems[sItems.length - 1].id);
                }
            }
        }
    } else {
        console.log("المنطق المكتشف: تسميع للأمام (Forward)");
        finalPages = getForwardPages(fID, tID);
    }

    const result = Number(finalPages || 0).toFixed(1);
    console.log(`النتيجة النهائية المجمعة: ${result} صفحة`);
    
    if (display) display.innerText = result;
    return result;
}

// دالة مساعدة لحساب الأسطر بدقة بين أي آيتين في نفس السورة
function getLinesBetween(obj1, obj2) {
    const start = (obj1.id <= obj2.id) ? obj1 : obj2;
    const end   = (obj1.id <= obj2.id) ? obj2 : obj1;
    
    if (start.p === end.p) return (end.le - start.ls) + 1;
    
    let lines = (PAGE_MAX_LINES[start.p] - start.ls + 1);
    for (let p = start.p + 1; p < end.p; p++) {
        lines += (PAGE_MAX_LINES[p] || 15);
    }
    lines += end.le;
    return lines;
}

// دالة لتحويل القيمة الرقمية إلى نص عربي
function progressToText(value) {
    let pgs = Math.floor(value);
    let frac = value - pgs;
    let text = "";

    if (pgs > 0) text += pgs + " صفحة";

    if (frac === 0.25) text += (pgs > 0 ? " وربع" : "ربع صفحة");
    else if (frac === 0.5) text += (pgs > 0 ? " ونصف" : "نصف صفحة");
    else if (frac === 0.75) text += (pgs > 0 ? " وثلاثة أرباع" : "ثلاثة أرباع صفحة");

    if (text === "") text = "أقل من ربع";

    return text.trim();
}


// 6. حفظ النشاط
async function saveActivity() {

    const prog = calculateExactProgress();

    const rawDate = document.getElementById('activityDate').value;
    if (!rawDate) {
        return showAlert("يجب إدخال تاريخ النشاط");
    }

    const onlyDate = new Date(rawDate).toISOString().split("T")[0];

    // هوية المسمّع تأتي من اسم المستخدم المسجَّل، لا من إدخال يدوي
    const { teacher, teacherName } = await getTeacherIdentity();

    const student   = clean(parseInt(document.getElementById('studentSelect').value), 0);
    const type      = clean(parseInt(document.getElementById('activityType').value), 0);
    const rating    = clean(parseInt(document.getElementById('rating').value), 0);

    const fromRange = clean(parseInt(document.getElementById('rangeFrom').value), 0);
    const toRange   = clean(parseInt(document.getElementById('rangeTo').value), 0);

    const mark      = clean(parseInt(document.getElementById('mark').value), "");
    const partFrom  = clean(parseInt(document.getElementById('partFrom').value), 0);
    const partTo    = clean(parseInt(document.getElementById('partTo').value), 0);

    const errors    = clean(parseInt(document.getElementById('errors').value), 0);

    // ✅ تحقق أساسي
    if (!teacher) {
        return showAlert("تعذّر التعرّف على المسمّع. يرجى تسجيل الخروج ثم الدخول من جديد.");
    }

    if (!student || !type) {
        return showAlert("يجب اختيار الطالب ونوع النشاط");
    }

    if ((type === 1 || type === 2) && (!fromRange || !toRange)) {
        return showAlert("يجب اختيار آيات صحيحة من القائمة");
    }

   if ((type === 7 || type === 6) && (!partFrom || !partTo)) {
    return showAlert("يجب إدخال الجزء من وإلى");
}

    const record = buildActivityRecord({
        teacher, teacherName, student, type,
        date      : onlyDate,
        fromRange : fromRange || "",
        toRange   : toRange   || "",
        amount    : prog || 0,
        errors    : errors,
        rating    : rating || "",
        mark      : mark,
        partFrom  : partFrom || "",
        partTo    : partTo   || "",
        tagNo     : _editingRecordId ? _editingTagNo : 0,
    });

    if (_editingRecordId) {
        const editedId = _editingRecordId;
        updateExistingRecord(editedId, record, () => {
            _editingRecordId = null;
            _editingTagNo = 0;
            setEditingMode(false);
            resetActivityForm();
        });
        return;
    }

    persistRecord(record, resetActivityForm);
}

/* =========================================================
   تعديل نشاط مسجَّل: تحميله في شاشة النشاط ثم تحديثه
   ========================================================= */

let _editingRecordId = null;   // معرّف السجل المحلي قيد التعديل
let _editingTagNo    = 0;      // مفتاحه على السيرفر (ليُحدَّث لا يُضاف)

function setEditingMode(on) {
    const banner = document.getElementById('editingBanner');
    const label  = document.getElementById('saveActivityLabel');
    if (banner) banner.style.display = on ? 'flex' : 'none';
    if (label)  label.textContent = on ? 'تحديث النشاط' : 'حفظ سجل النشاط';
}

function cancelEditActivity() {
    _editingRecordId = null;
    _editingTagNo = 0;
    setEditingMode(false);
    resetActivityForm();
    showToast("أُلغي التعديل");
}

async function editRecord(id) {
    const rec = await getRecordById(id);
    if (!rec) return showAlert("لم يُعثر على السجل");

    openTab('activityTab', document.querySelector('.tab-btn[data-tab="activityTab"]'));

    _editingRecordId = Number(id);
    _editingTagNo = Number(rec.tagNo || 0);
    setEditingMode(true);

    // 1) الطالب
    const sel = document.getElementById('studentSelect');
    if (sel) {
        sel.value = String(rec.student);
        syncStudentPickerText();
        sel.dispatchEvent(new Event('change'));
    }

    // 2) التاريخ
    const dateEl = document.getElementById('activityDate');
    if (dateEl) dateEl.value = rec.date;

    // 3) نوع النشاط — silent حتى لا يُشغّل الحفظ السريع للحضور/الغياب
    selectActivityType(rec.type, { silent: true });

    // 4) بقية الحقول — بعد handleActivityTypeChange لأنها قد تُصفّر الآيات
    const setVal = (elId, value) => {
        const el = document.getElementById(elId);
        if (el) el.value = (value === null || value === undefined) ? '' : value;
    };

    setVal('rangeFrom', rec.fromRange);
    setVal('rangeTo', rec.toRange);
    setVal('rangeFromText', AYAH_REVERSE[rec.fromRange] || '');
    setVal('rangeToText', AYAH_REVERSE[rec.toRange] || '');
    setVal('partFrom', rec.partFrom);
    setVal('partTo', rec.partTo);
    setVal('mark', rec.mark);
    setVal('errors', rec.errors || 0);
    setVal('rating', rec.rating);

    calculateExactProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast("جاهز للتعديل — عدّل ثم اضغط «تحديث النشاط»");
}

// تحديث سجل قائم: يبقى tagNo ليعرف السيرفر أنه تعديل، ويُعاد رفعه
function updateExistingRecord(id, record, onSaved) {
    const tx = db.transaction("records", "readwrite");
    const store = tx.objectStore("records");
    const check = store.index("student_date_type").get([record.student, record.date, record.type]);

    check.onsuccess = () => {
        // التكرار مسموح إن كان السجل نفسه
        if (check.result && Number(check.result.id) !== Number(id)) {
            showAlert({
                title: "نشاط مكرر",
                message: "يوجد نشاط بنفس الطالب والتاريخ والنوع.",
                icon: "⚠️",
            });
            return;
        }

        record.id = Number(id);
        record.synced = false;       // يحتاج إعادة رفع بعد التعديل
        record.syncError = "";

        store.put(record).onsuccess = () => {
            refreshAll();
            showToast("تم تحديث النشاط");
            if (typeof onSaved === "function") onSaved();
            requestSync();
        };
    };
}

/* =========================================================
   بناء/حفظ سجل النشاط — مشترك بين شاشة النشاط وأزرار بطاقات الطلبة
   ========================================================= */

// هوية المسمّع واسمه (من اسم المستخدم المسجَّل + مخزن empdata)
async function getTeacherIdentity() {
    const teacher = clean(parseInt(getCurrentUser()), 0);
    let teacherName = String(teacher); // قيمة افتراضية في حال لم يجد الاسم

    try {
        const empStore = db.transaction("empdata", "readonly").objectStore("empdata");
        const emp = await new Promise((resolve) => {
            const req = empStore.get(String(teacher));
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
        if (emp && emp.EMP_NAME) teacherName = emp.EMP_NAME;
    } catch (e) {
        console.warn("تعذر جلب اسم المعلم من empdata", e);
    }

    return { teacher, teacherName };
}

// سجل نشاط بالحقول الافتراضية؛ ما يُمرَّر في opts يطغى عليها
function buildActivityRecord(opts) {
    const type = Number(opts.type);
    const activityInfo = STATIC_LOOKUP.find(
        i => i.LOOKUP_MEANING_CODE === "RECITATION_ATTENDANCE_TYPE"
          && parseInt(i.LOOKUP_VALUE) === type
    );

    return Object.assign({
        teacher    : 0,
        teacherName: "",
        student    : 0,
        date       : new Date().toISOString().split("T")[0],
        type       : type,
        fromRange  : "",
        toRange    : "",
        amount     : 0,
        errors     : 0,
        rating     : "",
        mark       : "",
        partFrom   : "",
        partTo     : "",
        notes      : "",
        tagNo      : 0,          // مفتاح السجل على السيرفر؛ 0 = إضافة جديدة
        synced     : false,
        syncError  : "",
        sortOrder  : (activityInfo && activityInfo.SORT_ORDER != null) ? activityInfo.SORT_ORDER : 999,
    }, opts, { type });
}

// حفظ السجل مع منع التكرار (نفس الطالب/التاريخ/النوع) ثم تحديث الواجهة والمزامنة
function persistRecord(record, onSaved) {
    const tx = db.transaction("records", "readwrite");
    const store = tx.objectStore("records");
    const check = store.index("student_date_type").get([record.student, record.date, record.type]);

    check.onsuccess = () => {
        if (check.result) {
            showAlert({ title: "نشاط مكرر", message: "هذا النشاط مسجل مسبقًا لهذا الطالب في هذا التاريخ.", icon: "⚠️" });
            return;
        }
        store.add(record).onsuccess = () => {
            refreshAll();
            showToast("تم حفظ النشاط بنجاح");
            if (typeof onSaved === "function") onSaved();
            requestSync();
        };
    };
}

// 7. الرادار والإحصائيات
function updateStatsUI(hifz, muraja, errs, cnt, lastDateStr) {
    document.getElementById('totalHifz').innerText = hifz.toFixed(1);
    document.getElementById('totalMuraja').innerText = muraja.toFixed(1);
    document.getElementById('avgErrors').innerText = cnt > 0 ? (errs / cnt).toFixed(1) : 0;
    
    if (lastDateStr) {
        const last = new Date(lastDateStr); const now = new Date();
        now.setHours(0,0,0,0); last.setHours(0,0,0,0);
        if (last.getTime() === now.getTime()) document.getElementById('lastSeen').innerText = "اليوم ✅";
        else {
            const missed = calculateWorkingDays(last, now);
            document.getElementById('lastSeen').innerText = missed === 0 ? "آخر جلسة 👍" : `${missed} جلسات ⚠️`;
        }
    }
}

function calculateWorkingDays(start, end) {
    let c = 0, cur = new Date(start); cur.setDate(cur.getDate() + 1);
    while (cur <= end) {
        if ([1, 3, 6].includes(cur.getDay())) c++;
        cur.setDate(cur.getDate() + 1);
    }
    return c;
}

/* =========================================================
   8. شاشة الطلبة: بطاقات + بحث + آخر نشاط + أزرار سريعة
   (نفس فكرة StudentsScreen في تطبيق Flutter)
   ========================================================= */

let _studentsCache = [];          // كل الطلبة من IndexedDB
let _lastActivityByStudent = {};  // رقم الطالب ← آخر نشاط له

function fullStudentName(s) {
    if (!s) return "";
    return `${s.fName || ''} ${s.pName || ''} ${s.gName || ''} ${s.lName || ''}`
        .replace(/\s+/g, ' ').trim();
}

function escapeHtml(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// أيّ النشاطين أحدث: بالتاريخ أولاً ثم بترتيب الإدخال (id تصاعدي)
function isLaterActivity(a, b) {
    const ad = String(a.date || ''), bd = String(b.date || '');
    if (ad !== bd) return ad > bd;
    return Number(a.id || 0) > Number(b.id || 0);
}

// تحميل الطلبة + بناء خريطة آخر نشاط لكل طالب
function loadStudentsAndActivities() {
    return new Promise((resolve) => {
        if (!db) { _studentsCache = []; _lastActivityByStudent = {}; return resolve(); }

        const tx = db.transaction(["students", "records"], "readonly");
        const sReq = tx.objectStore("students").getAll();
        const rReq = tx.objectStore("records").getAll();

        tx.oncomplete = () => {
            _studentsCache = sReq.result || [];
            _lastActivityByStudent = {};
            (rReq.result || []).forEach(r => {
                const key = Number(r.student);
                if (!key) return;
                const prev = _lastActivityByStudent[key];
                if (!prev || isLaterActivity(r, prev)) _lastActivityByStudent[key] = r;
            });
            resolve();
        };
        tx.onerror = () => resolve();
    });
}

// اسم آية مختصر: "سورة البقرة آية 155" بدل التسمية الكاملة بالصفحة والجزء
function shortAyahLabel(id) {
    if (!id) return "";                       // 0 أو فارغ ⇒ لا آية
    const label = AYAH_REVERSE[id];
    if (!label) return "";
    return label.replace(/\s*ص\s*\d+\s*ج\s*\d+\s*$/, '').trim();
}

// أنواع الحضور/الغياب: لا آيات ولا أجزاء لها — التاريخ والاسم فقط
const ATTENDANCE_ONLY_TYPES = [3, 4, 5];

// ملخّص آخر نشاط (نفس تركيب _formatActivitySummary في Flutter)
function formatActivitySummary(r) {
    const type = Number(r.type);
    const typeName = translateLookup("RECITATION_ATTENDANCE_TYPE", type);
    const isPartMode = (type === 6 || type === 7);

    let range = "";
    if (ATTENDANCE_ONLY_TYPES.indexOf(type) !== -1) {
        range = "";                            // حضور/غياب: بلا مدى إطلاقاً
    } else if (isPartMode) {
        if (r.partFrom && r.partTo) range = `من الجزء ${r.partFrom} إلى الجزء ${r.partTo}`;
        else if (r.partFrom)        range = `من الجزء ${r.partFrom}`;
    } else {
        const from = shortAyahLabel(r.fromRange);
        const to   = shortAyahLabel(r.toRange);
        if (from && to) range = `من ${from} إلى ${to}`;
        else if (from)  range = `من ${from}`;
    }

    const grade = r.rating ? `تقدير: ${translateLookup("ACTIVITY_GRADE", r.rating)}` : "";
    const mark  = (Number(r.mark) > 0) ? `علامة: ${r.mark}` : "";

    const parts = [typeName, range, grade, mark].filter(p => p && String(p).trim());
    return `${r.date} — ${parts.join(' • ')}`;
}

// الأنواع التي تفتح شاشة النشاط (تحتاج آيات/أجزاء) وتلك التي تُحفظ فوراً
const OPEN_ACTIVITY_TYPES  = [1, 2, 6, 7];
const QUICK_ACTIVITY_TYPES = [3, 4, 5];

function activityTypeName(type) {
    const found = STATIC_LOOKUP.find(
        i => i.LOOKUP_MEANING_CODE === "RECITATION_ATTENDANCE_TYPE"
          && parseInt(i.LOOKUP_VALUE) === Number(type)
    );
    return found ? found.LOOKUP_A_NAME : `نوع ${type}`;
}

function actionButtonHtml(type, studentId, quick) {
    const name = escapeHtml(activityTypeName(type));
    const fn   = quick ? 'quickSaveActivity' : 'openActivityForStudent';
    return `<button class="act-btn" title="${name}" aria-label="${name}" ` +
           `onclick="${fn}(${studentId}, ${type})">${activityIconHtml(type)}</button>`;
}

function studentCardHtml(s) {
    const id   = Number(s.id);
    const act  = _lastActivityByStudent[id];

    const summary = act
        ? `<span class="student-last-text">${escapeHtml(formatActivitySummary(act))}</span>`
        : `<span class="student-last-text student-last-none">لا يوجد نشاط مسجّل</span>`;

    const idNoHtml = s.idNo
        ? `<span class="student-idno">الهوية: ${escapeHtml(s.idNo)}</span>`
        : '';

    // لا نعرض «رقم الطالب» إن كان هو نفسه رقم الهوية — تكرار بلا معنى،
    // ويحدث حين لا يُرجع السيرفر رقم طالب مستقلاً.
    const hasRealStudentNo = s.idNo && String(s.idNo) !== String(id);
    const studentNoHtml = hasRealStudentNo
        ? `<div class="student-no">رقم الطالب: ${id}</div>`
        : '';

    return `
    <div class="student-card">
        <div class="student-card-head">
            <span class="student-name">${escapeHtml(fullStudentName(s))}</span>
            ${idNoHtml}
        </div>
        ${studentNoHtml}
        <div class="student-last">
            <span class="student-last-icon">${
                act ? activityIconHtml(act.type) : '<i class="fas fa-minus" style="color:#bdc3c7"></i>'
            }</span>
            ${summary}
        </div>
        <div class="student-actions">
            ${OPEN_ACTIVITY_TYPES.map(t => actionButtonHtml(t, id, false)).join('')}
            <span class="actions-sep"></span>
            ${QUICK_ACTIVITY_TYPES.map(t => actionButtonHtml(t, id, true)).join('')}
            <span class="actions-sep"></span>
            <button class="act-btn" title="تعديل بيانات الطالب" onclick="editStudent(${id})">✏️</button>
            <button class="act-btn" title="حذف الطالب" onclick="deleteStudent(${id})">🗑️</button>
        </div>
    </div>`;
}

// الترتيب كما في Flutter: من لا نشاط له أولاً، ثم الأقدم نشاطاً (الأولى بالمتابعة)
function compareStudentsByFollowUp(a, b) {
    const aAct = _lastActivityByStudent[Number(a.id)];
    const bAct = _lastActivityByStudent[Number(b.id)];
    if (!aAct && !bAct) return 0;
    if (!aAct) return -1;
    if (!bAct) return 1;
    if (isLaterActivity(aAct, bAct)) return 1;
    if (isLaterActivity(bAct, aAct)) return -1;
    return 0;
}

function renderStudentCards() {
    const wrap  = document.getElementById('studentsCards');
    const empty = document.getElementById('studentsEmpty');
    if (!wrap) return;

    const searchEl = document.getElementById('studentSearch');
    const q = normalizeAr(searchEl ? searchEl.value : '').toLowerCase();

    let list = _studentsCache.slice();

    if (q) {
        list = list.filter(s =>
            normalizeAr(fullStudentName(s)).toLowerCase().indexOf(q) !== -1 ||
            String(s.id || '').indexOf(q) !== -1 ||
            String(s.idNo || '').indexOf(q) !== -1
        );
    }

    list.sort(compareStudentsByFollowUp);

    wrap.innerHTML = list.map(studentCardHtml).join('');

    if (empty) {
        empty.style.display = list.length ? 'none' : 'block';
        empty.textContent = _studentsCache.length
            ? 'لا نتائج مطابقة لبحثك'
            : 'لا يوجد طلاب لعرضهم حالياً — اسحب البيانات من الإعدادات أو أضف طالباً جديداً';
    }
}

// فتح شاشة النشاط بالطالب والنوع محدَّدين مسبقاً (مثل DailyActivityScreen في Flutter)
function openActivityForStudent(studentId, type) {
    openTab('activityTab', document.querySelector('.tab-btn[data-tab="activityTab"]'));

    const sel = document.getElementById('studentSelect');
    if (sel) {
        sel.value = String(studentId);
        syncStudentPickerText();
        sel.dispatchEvent(new Event('change'));
    }

    // ضبط النوع والتمييز واستدعاء handleActivityTypeChange
    selectActivityType(type);
}

// حفظ فوري للحضور/الغياب بعد تأكيد (مثل _confirmAndSaveQuick في Flutter)
async function quickSaveActivity(studentId, type) {
    const student = _studentsCache.find(s => Number(s.id) === Number(studentId));
    const name = fullStudentName(student) || `الطالب ${studentId}`;
    const title = activityTypeName(type);

    const ok = await showConfirm({
        title: title,
        message: `هل تريد تسجيل "${title}" للطالب ${name} بتاريخ اليوم؟`,
        confirmText: "تأكيد",
        icon: activityIconHtml(type),
    });
    if (!ok) return;

    const { teacher, teacherName } = await getTeacherIdentity();
    if (!teacher) {
        return showAlert("تعذّر التعرّف على المسمّع. يرجى تسجيل الخروج ثم الدخول من جديد.");
    }

    persistRecord(buildActivityRecord({
        teacher, teacherName,
        student: Number(studentId),
        type: Number(type),
    }));
}

/* ===== مربع بحث الطالب في شاشة النشاط (بديل القائمة الطويلة) ===== */

// نص العرض في مربع البحث؛ يتضمّن الرقم ليبقى فريداً عند تشابه الأسماء
function studentPickerLabel(s) {
    return `${fullStudentName(s)} — ${s.id}`;
}

// يبني قائمة الاقتراحات حسب ما كُتب، ويضبط الطالب المختار عند التطابق
function handleStudentSearch(inputEl) {
    const list = document.getElementById('studentsDataList');
    const sel  = document.getElementById('studentSelect');
    if (!list || !sel) return;

    const raw = String(inputEl.value || '').trim();
    const q   = normalizeAr(raw).toLowerCase();

    let matches = _studentsCache;
    if (q) {
        matches = _studentsCache.filter(s =>
            normalizeAr(fullStudentName(s)).toLowerCase().indexOf(q) !== -1 ||
            String(s.id || '').indexOf(q) !== -1 ||
            String(s.idNo || '').indexOf(q) !== -1
        );
    }

    const frag = document.createDocumentFragment();
    matches.slice(0, 50).forEach(s => {
        const o = document.createElement('option');
        o.value = studentPickerLabel(s);
        frag.appendChild(o);
    });
    list.innerHTML = '';
    list.appendChild(frag);

    // تحديد الطالب: تطابق تام مع نص الاقتراح، أو نتيجة وحيدة
    let chosen = _studentsCache.find(s => studentPickerLabel(s) === raw);
    if (!chosen && q && matches.length === 1) chosen = matches[0];

    const newValue = chosen ? String(chosen.id) : '';
    if (sel.value !== newValue) {
        sel.value = newValue;
        sel.dispatchEvent(new Event('change'));
    }
}

// يعكس اختيار الـ select على نص مربع البحث (عند التعديل أو الفتح من بطاقة طالب)
function syncStudentPickerText() {
    const sel   = document.getElementById('studentSelect');
    const input = document.getElementById('studentPicker');
    if (!sel || !input) return;

    const s = _studentsCache.find(st => String(st.id) === String(sel.value));
    input.value = s ? studentPickerLabel(s) : '';
}

function clearStudentPicker() {
    const input = document.getElementById('studentPicker');
    const sel   = document.getElementById('studentSelect');
    if (input) input.value = '';
    if (sel && sel.value !== '') {
        sel.value = '';
        sel.dispatchEvent(new Event('change'));
    }
}

function refreshAll() {
    const sel = document.getElementById('studentSelect');
    const previous = sel ? sel.value : '';
    if (sel) sel.innerHTML = '<option value="">-- اختر --</option>';

    loadStudentsAndActivities()
        .then(() => {
            if (sel) {
                _studentsCache.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.textContent = fullStudentName(s);
                    sel.appendChild(opt);
                });
                // أعِد الاختيار السابق إن كان الطالب ما زال موجوداً
                if (previous && _studentsCache.some(s => String(s.id) === String(previous))) {
                    sel.value = previous;
                }
                syncStudentPickerText();
            }
            return loadLookups();
        })
        .then(() => {
            renderStudentCards();
            displayRecords();
        })
        .catch(err => console.error("❌ خطأ في تحديث الواجهة:", err));
}

document.getElementById('filterDate').valueAsDate = new Date();

function translateLookup(code, value) {
    if (value === null || value === undefined) return "";
    const key = String(value).trim();

    // إذا كانت القيمة نصية (ليست رقم) → أعرضها كما هي
    if (isNaN(Number(key))) {
        return key;
    }

    // إذا كانت رقمية → ابحث في الخريطة
    return (lookupMap[code] && lookupMap[code][key]) || key;
}

let lastDisplayedData = []; // ✨ متغيّر عام لتخزين النتائج

// شارة حالة المزامنة: مزامَن / بانتظار / خطأ (التفاصيل تظهر عند الضغط/المرور)
function syncStatusBadge(r) {
    if (r.synced) return '<span class="sync-badge sync-ok">✅ مزامَن</span>';
    const err = (extractArabicError(r.syncError) || "").trim();
    if (err) {
        const safe = escapeHtml(err);
        return `<span class="sync-badge sync-err" title="${safe}" data-err="${safe}" ` +
               `onclick="showSyncErrorDetails(this.dataset.err)">⚠️ خطأ</span>`;
    }
    return '<span class="sync-badge sync-wait">⏳ بانتظار</span>';
}

// سبب فشل المزامنة عند الضغط على الشارة
function showSyncErrorDetails(msg) {
    showAlert({
        title: "سبب عدم المزامنة",
        message: msg || "لم يُرجع السيرفر سبباً واضحاً.",
        icon: "⚠️",
    });
}

function displayRecords() {
    const tbody = document.getElementById('logTable');
    tbody.innerHTML = '';

    const fDate = document.getElementById('filterDate').value;
    const fID   = document.getElementById('filterStudentID').value;

    // أولاً: جلب الطلاب
    db.transaction("students").objectStore("students").getAll().onsuccess = (e) => {
        const studentsMap = {};
        e.target.result.forEach(s => {
            const fullName = `${s.fName} ${s.pName} ${s.gName} ${s.lName}`.replace(/\s+/g, ' ').trim();
            studentsMap[s.id] = fullName;
        });

        // ثانياً: جلب بيانات المحفظين
        db.transaction("empdata").objectStore("empdata").getAll().onsuccess = (empEvent) => {
    const teachersMap = {};
    empEvent.target.result.forEach(emp => {
        // 💡 توحيد المفتاح ليكون نصاً نظيفاً لضمان التطابق
        const cleanId = String(emp.idno).trim();
        teachersMap[cleanId] = emp.EMP_NAME;
    });

            // ثالثاً: جلب السجلات
            db.transaction("records").objectStore("records").index("sortOrderIndex").openCursor(null, "next").onsuccess = (recEvent) => {
                const cursor = recEvent.target.result;
                if (cursor) {
                    const r = cursor.value;
                   const studentName = studentsMap[r.student] || r.student || "غير مدخل";
                   const currentTeacherId = String(r.teacher).replace(/[\\"]/g, '').trim();
                   const teacherName = r.teacherName || teachersMap[currentTeacherId] || currentTeacherId;
                    const matchesDate = !fDate || r.date === fDate;
                    // r.student رقم وليس نصاً — التحويل ضروري وإلا انهار الفلتر
                    const matchesID   = !fID || String(r.student).includes(fID) ||
                                        studentName.indexOf(fID) !== -1;

                    if (matchesDate && matchesID) {
                        let fromText = "";
                        let toText   = "";

                        if (ATTENDANCE_ONLY_TYPES.indexOf(Number(r.type)) !== -1) {
                            // حضور/غياب: لا مدى — يبقى العمودان فارغين
                            fromText = "";
                            toText   = "";
                        } else if (r.type == 6 || r.type == 7) {
                            const juzNames = {
                                1: "الجزء الأول", 2: "الجزء الثاني", 3: "الجزء الثالث",
                                4: "الجزء الرابع", 5: "الجزء الخامس", 6: "الجزء السادس",
                                7: "الجزء السابع", 8: "الجزء الثامن", 9: "الجزء التاسع",
                                10: "الجزء العاشر", 11: "الجزء الحادي عشر", 12: "الجزء الثاني عشر",
                                13: "الجزء الثالث عشر", 14: "الجزء الرابع عشر", 15: "الجزء الخامس عشر",
                                16: "الجزء السادس عشر", 17: "الجزء السابع عشر", 18: "الجزء الثامن عشر",
                                19: "الجزء التاسع عشر", 20: "الجزء العشرون", 21: "الجزء الحادي والعشرون",
                                22: "الجزء الثاني والعشرون", 23: "الجزء الثالث والعشرون", 24: "الجزء الرابع والعشرون",
                                25: "الجزء الخامس والعشرون", 26: "الجزء السادس والعشرون", 27: "الجزء السابع والعشرون",
                                28: "الجزء الثامن والعشرون", 29: "الجزء التاسع والعشرون", 30: "الجزء الثلاثون"
                            };
                            fromText = juzNames[r.partFrom] || "";
                            toText   = juzNames[r.partTo]   || "";
                        } else {
                            fromText = AYAH_REVERSE[r.fromRange] || r.fromRange || "";
                            toText   = AYAH_REVERSE[r.toRange]   || r.toRange   || "";
                        }

                        const activityName = translateLookup("RECITATION_ATTENDANCE_TYPE", r.type);
                        const ratingName   = translateLookup("ACTIVITY_GRADE", r.rating);
                        const errorText    = !r.synced ? extractArabicError(r.syncError) : "";

                        lastDisplayedData.push({
                            "التاريخ": r.date,
                            "المحفظ": teacherName,
                            "اسم الطالب": studentName,
                            "رقم الطالب": r.student,
                            "النوع": activityName,
                            "من": fromText,
                            "إلى": toText,
                            "عدد الصفحات": r.amount,
                            "التقييم": ratingName,
                            "الأخطاء": r.errors,
                            "العلامة": r.mark,
                            "الحالة": r.synced
                                ? "✔ تم الرفع"
                                : "✘ لم يُرفع" + (errorText && errorText.trim() !== "" ? "\n" + errorText : "")
                        });

                        tbody.innerHTML += `
                            <tr>
                                <td class="no-pdf">
                                    <div class="row-actions">
                                        <button class="row-btn row-edit" title="تعديل النشاط" onclick="editRecord(${r.id})"><i class="fas fa-pen"></i></button>
                                        <button class="row-btn row-del" title="حذف النشاط" onclick="deleteRecord(${r.id})"><i class="fas fa-trash"></i></button>
                                    </div>
                                </td>
                                <td class="no-pdf">${syncStatusBadge(r)}</td>
                                <td>${r.date}</td>
                                <td>${teacherName}</td>
                                <td><b>${studentName}</b></td>
                                <td><span class="badge">${activityIconHtml(r.type)} ${activityName}</span></td>
                                <td style="font-size:11px">${fromText}</td>
                                <td style="font-size:11px">${toText}</td>
                                <td style="color:var(--secondary); font-weight:bold">${r.amount}</td>
                                <td>${ratingName}</td>
                                <td>${r.mark}</td>
                                <td class="no-pdf">${r.errors}</td>
                            </tr>`;
                    }
                    cursor.continue();
                }
            };
        };
    };
}


function resetFilters() {
    document.getElementById('filterDate').valueAsDate = new Date();
    document.getElementById('filterStudentID').value = "";
    displayRecords();
}

function getRecordById(id) {
    return new Promise((resolve) => {
        if (!db) return resolve(null);
        const req = db.transaction("records").objectStore("records").get(Number(id));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror   = () => resolve(null);
    });
}

function deleteRecordLocally(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("records", "readwrite");
        tx.objectStore("records").delete(Number(id));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

// حذف النشاط: إن كان مرفوعاً وجب حذفه من السيرفر أولاً، وإلا بقيت نسخة هناك
async function deleteRecord(id) {
    const rec = await getRecordById(id);
    if (!rec) return showAlert("لم يُعثر على السجل");

    const student = _studentsCache.find(s => Number(s.id) === Number(rec.student));
    const name = fullStudentName(student) || `الطالب ${rec.student}`;
    const typeName = activityTypeName(rec.type);

    const onServer = !!rec.synced;

    const ok = await showConfirm({
        title: "حذف النشاط",
        message: `${typeName} — ${name}\nبتاريخ ${rec.date}\n\n` +
                 (onServer ? "سيُحذف من السيرفر ومن هذا الجهاز معاً."
                           : "لم يُرفع بعد، فسيُحذف من هذا الجهاز فقط."),
        confirmText: "حذف",
        danger: true,
        icon: "🗑️",
    });
    if (!ok) return;

    if (onServer) {
        if (!navigator.onLine) {
            return showAlert({
                title: "لا يوجد اتصال",
                message: "هذا النشاط مرفوع على السيرفر، ولا يمكن حذفه دون إنترنت.\nحاول بعد عودة الاتصال.",
                icon: "📡",
            });
        }

        const res = await QMC.deleteActivity(rec);
        if (!res.ok) {
            console.error("❌ فشل الحذف من السيرفر:", res.raw);
            return showAlert({
                title: "تعذّر الحذف من السيرفر",
                message: extractArabicError(res.error) || res.error || "خطأ غير معروف",
                icon: "⚠️",
            });
        }
    }

    await deleteRecordLocally(id);
    refreshAll();
    showToast("تم حذف النشاط");
}
// 9. النسخ الاحتياطي
async function exportBackup() {
    const data = { students: await getAll("students"), records: await getAll("records"),settings : await getAll("settings"), teacherID: getCurrentUser() };
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `Backup_${new Date().toLocaleDateString()}.json`; a.click();
}

function getAll(s) { return new Promise(res => { db.transaction(s).objectStore(s).getAll().onsuccess = e => res(e.target.result); }); }

function importBackup(input) {
    const reader = new FileReader();
    reader.onload = e => {
        const d = JSON.parse(e.target.result);
        const tx = db.transaction(["students", "records"], "readwrite");

        if (d.students) {
            d.students.forEach(s => {
                // ✅ تحويل المعرف إلى رقم قبل الحفظ
                if (s.id) {
                    s.id = Number(s.id); 
                }
                tx.objectStore("students").put(s);
            });
        }

        if (d.records) {
            d.records.forEach(r => {
                // ✅ تحويل المعرف ومعرف الطالب المرتبط به إلى أرقام
                if (r.id) r.id = Number(r.id);
                if (r.studentId) r.studentId = Number(r.studentId);
                
                tx.objectStore("records").put(r);
            });
        }

        tx.oncomplete = () => {
            showImportMessage(`✅ تم الاستيراد بنجاح وتحويل البيانات لنوع رقمي`);
            setTimeout(() => location.reload(), 2000);
        };
        // ... باقي الكود (onerror)
    };
    reader.readAsText(input.files[0]);
}

// دالة لعرض الرسالة داخل الصفحة
function showImportMessage(msg, isError=false) {
    let box = document.getElementById("importMessage");
    if(!box) {
        box = document.createElement("div");
        box.id = "importMessage";
        box.style.position = "fixed";
        box.style.bottom = "20px";
        box.style.right = "20px";
        box.style.padding = "15px";
        box.style.borderRadius = "10px";
        box.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
        box.style.zIndex = "2000";
        document.body.appendChild(box);
    }
    box.style.background = isError ? "#f8d7da" : "#d4edda";
    box.style.color = isError ? "#721c24" : "#155724";
    box.innerHTML = msg;
}

function exportArrayToExcel(data, fileName = "records.xlsx") {
  if (!data || data.length === 0) {
    showAlert("لا توجد بيانات للتصدير");
    return;
  }

  // تحويل البيانات إلى ورقة عمل
  const worksheet = XLSX.utils.json_to_sheet(data);

  // إنشاء مصنف جديد وإضافة الورقة
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Records");

  // حفظ الملف
  XLSX.writeFile(workbook, fileName);
}

function exportToExcel() {
    // ✨ تصدير نفس البيانات المعروضة
    exportArrayToExcel(lastDisplayedData,"نشاط التسميع.xlsx");
}

/* =========================================================
   نموذج إضافة/تعديل طالب (نفس فكرة AddStudentScreen في Flutter):
   رقم الهوية ← جلب تلقائي من السجل المدني ← إرسال addNewStudent ←
   السيرفر يُصدر رقم الطالب (studentno) وهو مفتاح التخزين المحلي.
   ========================================================= */

const STUDENT_FORM_FIELDS = ['stuIdNo', 'fName', 'pName', 'gName', 'lName', 'stuMobile', 'stuBirthDate'];
let _lastCivilLookupId = null;

function setStudentStatus(msg, color) {
    const el = document.getElementById('addStudentStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = color || '';
}

// تحويل الأرقام العربية-الهندية (٠١٢…) إلى إنجليزية، لأن لوحة المفاتيح العربية تُدخلها
function toAsciiDigits(text) {
    return String(text == null ? '' : text)
        .replace(/[٠-٩]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48))
        .replace(/[۰-۹]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 48));
}

// حقل أرقام فقط بطول أقصى (مقابل FilteringTextInputFormatter.digitsOnly في Flutter)
function onlyDigits(el, maxLen) {
    if (!el) return;
    let v = toAsciiDigits(el.value).replace(/\D+/g, '');
    if (maxLen) v = v.slice(0, maxLen);
    if (el.value !== v) el.value = v;
}

function clearStudentForm() {
    STUDENT_FORM_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.value = ''; el.readOnly = false; }
    });
    const g = document.getElementById('stuGender');
    if (g) g.value = '';
    const c = document.getElementById('stuCircle');
    if (c) c.value = '';
    const editNo = document.getElementById('stuEditNo');
    if (editNo) editNo.value = '';
    setStudentStatus('', '');
    _lastCivilLookupId = null;
}

async function openAddStudentForm() {
    clearStudentForm();
    const t = document.getElementById('addStudentTitle');
    if (t) t.textContent = 'إضافة طالب جديد';
    const note = document.getElementById('addStudentNote');
    if (note) note.style.display = 'block';

    const card = document.getElementById('addStudentCard');
    if (card) card.style.display = 'block';

    await populateCircleSelect();

    const idEl = document.getElementById('stuIdNo');
    if (idEl) idEl.focus();
}

function closeAddStudentForm() {
    const card = document.getElementById('addStudentCard');
    if (card) card.style.display = 'none';
    clearStudentForm();
}

function toggleAddStudentForm() {
    const card = document.getElementById('addStudentCard');
    if (!card) return;
    if (card.style.display === 'none' || !card.style.display) openAddStudentForm();
    else closeAddStudentForm();
}

// عند الخروج من حقل الهوية: تفريغ الحقول ثم الجلب من السجل المدني (كما في Flutter)
async function onStudentIdBlur() {
    const el = document.getElementById('stuIdNo');
    if (!el) return;

    // في وضع التعديل رقم الهوية للعرض فقط
    const editNo = document.getElementById('stuEditNo');
    if (editNo && editNo.value) return;

    const id = String(el.value || '').trim();
    if (!/^\d{9}$/.test(id)) return;   // ناقص → تجاهل
    if (id === _lastCivilLookupId) return; // لم يتغيّر → لا تفريغ ولا جلب
    _lastCivilLookupId = id;

    ['fName', 'pName', 'gName', 'lName', 'stuBirthDate'].forEach(k => {
        const e = document.getElementById(k);
        if (e) e.value = '';
    });
    const g = document.getElementById('stuGender');
    if (g) g.value = '';

    if (!navigator.onLine) {
        return setStudentStatus('⚠️ لا يوجد اتصال — أكمل البيانات يدوياً.', '#e67e22');
    }

    setStudentStatus('🔄 جارٍ الجلب من السجل المدني…', '#3498db');

    try {
        const data = await QMC.lookupCivilRecord(id);
        if (!data) {
            return setStudentStatus('لا توجد بيانات لهذا الرقم في السجل المدني — أكمل يدوياً.', '#5f6368');
        }

        const setVal = (elId, value) => {
            const e = document.getElementById(elId);
            if (e) e.value = value || '';
        };
        setVal('fName', data.first_name);
        setVal('pName', data.father_name);
        setVal('gName', data.gfather_name);
        setVal('lName', data.family_name);

        if (data.gender === 'M' || data.gender === 'F') {
            if (g) g.value = data.gender;
        }
        if (data.birth_date) {
            setVal('stuBirthDate', String(data.birth_date).split('T')[0]);
        }

        setStudentStatus('✅ تم جلب البيانات من السجل المدني.', '#27ae60');
    } catch (err) {
        console.warn('تعذّر الجلب من السجل المدني:', err);
        setStudentStatus('تعذّر الجلب من السجل المدني — أكمل البيانات يدوياً.', '#5f6368');
    }
}

// سجل الموظف الحالي من مخزن empdata
function getEmpRecord() {
    return new Promise((resolve) => {
        if (!db) return resolve(null);
        try {
            const req = db.transaction("empdata").objectStore("empdata").get(getCurrentUser());
            req.onsuccess = () => resolve(req.result || null);
            req.onerror   = () => resolve(null);
        } catch (_) {
            resolve(null);
        }
    });
}

// رقم حلقة المسمّع من empdata — يُستخدم كاحتياط فقط إن لم تُجلب قائمة الحلقات
async function getCurrentCircleNo() {
    const emp = await getEmpRecord();
    return emp ? Number(emp.CIRCLE_NO) : null;
}

// حلقات المستخدم المخزّنة محلياً
function getCirclesFromDb() {
    return new Promise((resolve) => {
        if (!db || !db.objectStoreNames.contains("circles")) return resolve([]);
        try {
            const req = db.transaction("circles").objectStore("circles").getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror   = () => resolve([]);
        } catch (_) {
            resolve([]);
        }
    });
}

// جلب حلقات المستخدم من السيرفر وتخزينها (نفس فكرة UserCirclesService في Flutter)
async function fetchAndStoreCircles() {
    const user = getCurrentUser();
    if (!user || !db || !navigator.onLine) return [];

    try {
        const items = await QMC.getUserCircles(user);
        if (!items.length) {
            console.warn("⚠️ لم تُرجع الخدمة أي حلقة لهذا المستخدم");
            return [];
        }

        await new Promise((resolve, reject) => {
            const tx = db.transaction("circles", "readwrite");
            const store = tx.objectStore("circles");
            store.clear();
            items.forEach(it => store.put({
                circleNo  : Number(it.circle_no),
                circleName: it.circle_name || '',
                centerNo  : (it.center_no != null) ? Number(it.center_no) : null,
                centerName: it.center_name || '',
                empRole   : (it.emp_role != null) ? String(it.emp_role) : '',
            }));
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });

        console.log(`✅ تم تخزين ${items.length} حلقة`);
        renderCirclesList();
        return items;
    } catch (err) {
        console.warn("تعذّر جلب حلقات المستخدم:", err);
        return [];
    }
}

// تعبئة قائمة الحلقات في نموذج الطالب
async function populateCircleSelect(selectedNo) {
    const sel = document.getElementById('stuCircle');
    if (!sel) return;

    const circles = await getCirclesFromDb();
    sel.innerHTML = '<option value="">-- اختر الحلقة --</option>';

    circles
        .sort((a, b) => Number(a.circleNo) - Number(b.circleNo))
        .forEach(c => {
            const o = document.createElement('option');
            o.value = c.circleNo;
            o.textContent = c.circleName || ('حلقة ' + c.circleNo);
            sel.appendChild(o);
        });

    // احتياط: لم تُجلب الحلقات بعد → استخدم حلقة المسمّع من empdata
    if (!circles.length) {
        const emp = await getEmpRecord();
        if (emp && emp.CIRCLE_NO) {
            const o = document.createElement('option');
            o.value = Number(emp.CIRCLE_NO);
            o.textContent = emp.CIRCLE_NAME || ('حلقة ' + emp.CIRCLE_NO);
            sel.appendChild(o);
        }
    }

    if (selectedNo !== undefined && selectedNo !== null && selectedNo !== '') {
        sel.value = String(selectedNo);
    } else if (sel.options.length === 2) {
        sel.selectedIndex = 1;   // حلقة واحدة فقط → اخترها تلقائياً
    }
}

// يقرأ ويتحقق من حقول النموذج؛ يُرجع الكائن أو null مع رسالة خطأ
function readStudentForm(requireAll) {
    const val = id => String((document.getElementById(id) || {}).value || '').trim();

    const idNo   = val('stuIdNo');
    const fName  = val('fName');
    const pName  = val('pName');
    const gName  = val('gName');
    const lName  = val('lName');
    const gender = val('stuGender');
    const mobile = val('stuMobile');
    const birthDate = val('stuBirthDate');
    const circleNo = val('stuCircle');

    const idCheck = checkIDNumber(idNo);
    if (idCheck !== "Y") {
        setStudentStatus("❌ " + idCheck, '#c0392b');
        return null;
    }

    if (!fName || !pName || !gName || !lName) {
        setStudentStatus("❌ يجب إدخال الاسم رباعياً (الأول، الأب، الجد، العائلة)", '#c0392b');
        return null;
    }

    if (requireAll) {
        if (!gender) {
            setStudentStatus("❌ يجب اختيار الجنس", '#c0392b');
            return null;
        }
        if (!/^\d{9,10}$/.test(mobile)) {
            setStudentStatus("❌ رقم الجوال يجب أن يكون 9 أو 10 أرقام", '#c0392b');
            return null;
        }
        if (!circleNo) {
            setStudentStatus("❌ يجب اختيار الحلقة", '#c0392b');
            return null;
        }
    }

    if (birthDate && birthDate > new Date().toISOString().split('T')[0]) {
        setStudentStatus("❌ تاريخ الميلاد لا يكون في المستقبل", '#c0392b');
        return null;
    }

    return {
        idNo, fName, pName, gName, lName, gender, mobile, birthDate,
        circleNo: circleNo ? Number(circleNo) : null,
    };
}

function submitStudentForm() {
    const editNo = String((document.getElementById('stuEditNo') || {}).value || '').trim();
    return editNo ? updateStudentLocally(Number(editNo)) : addNewStudentOnline();
}

// إضافة طالب جديد: السيرفر يُصدر رقم الطالب ثم نحفظه محلياً بذلك الرقم
async function addNewStudentOnline() {
    const form = readStudentForm(true);
    if (!form) return;

    if (!navigator.onLine) {
        return setStudentStatus('❌ إضافة طالب جديد تتطلب اتصالاً بالإنترنت، لأن السيرفر هو من يُصدر رقم الطالب.', '#c0392b');
    }

    const btn = document.getElementById('submitStudentBtn');
    if (btn) btn.disabled = true;
    setStudentStatus('🔄 جارٍ إضافة الطالب على السيرفر…', '#3498db');

    try {
        // الحلقة المختارة من القائمة؛ وإن غابت القائمة نرجع لحلقة المسمّع من empdata
        const circleNo = form.circleNo || await getCurrentCircleNo();

        const studentNo = await QMC.addNewStudent({
            USER_ID_NO_IN  : getCurrentUser(),
            ID_NO_IN       : form.idNo,
            FIRST_NAME_IN  : form.fName,
            FATHER_NAME_IN : form.pName,
            GFATHER_NAME_IN: form.gName,
            FAMILY_NAME_IN : form.lName,
            BIRTH_DATE_IN  : form.birthDate || null,
            GENDER_IN      : form.gender,
            MOBILE_NO_IN   : form.mobile,
            CIRCLE_NO_IN   : circleNo,
        });

        const student = {
            id       : studentNo,     // المفتاح = رقم الطالب من السيرفر
            idNo     : form.idNo,
            fName    : form.fName,
            pName    : form.pName,
            gName    : form.gName,
            lName    : form.lName,
            gender   : form.gender,
            mobile   : form.mobile,
            birthDate: form.birthDate,
            circleNo : circleNo,
        };

        db.transaction("students", "readwrite").objectStore("students").put(student).onsuccess = () => {
            refreshAll();
            showToast(`✅ تم إضافة الطالب — رقمه ${studentNo}`);
            closeAddStudentForm();
        };
    } catch (err) {
        console.error("❌ تعذّر إضافة الطالب:", err);
        setStudentStatus('❌ ' + (err.message || 'تعذّر إضافة الطالب'), '#c0392b');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// تعديل بيانات طالب موجود — محلي فقط (لا يوجد endpoint لتعديل الطالب على السيرفر)
function updateStudentLocally(studentNo) {
    const form = readStudentForm(false);
    if (!form) return;

    const store = db.transaction("students", "readwrite").objectStore("students");
    const req = store.get(studentNo);

    req.onsuccess = () => {
        const merged = Object.assign({}, req.result || {}, form, { id: studentNo });
        store.put(merged).onsuccess = () => {
            refreshAll();
            showToast("✅ تم تحديث بيانات الطالب محلياً");
            closeAddStudentForm();
        };
    };
}

async function editStudent(id) {
    const s = _studentsCache.find(st => Number(st.id) === Number(id));
    if (!s) return showAlert("لم يُعثر على الطالب");

    clearStudentForm();
    await populateCircleSelect(s.circleNo);

    const set = (elId, value) => {
        const el = document.getElementById(elId);
        if (el) el.value = value || '';
    };
    set('stuIdNo', s.idNo);
    set('fName', s.fName);
    set('pName', s.pName);
    set('gName', s.gName);
    set('lName', s.lName);
    set('stuGender', s.gender);
    set('stuMobile', s.mobile);
    set('stuBirthDate', s.birthDate);
    set('stuEditNo', s.id);

    const idEl = document.getElementById('stuIdNo');
    if (idEl) idEl.readOnly = true;   // رقم الهوية لا يُعدَّل بعد التسجيل

    const t = document.getElementById('addStudentTitle');
    if (t) t.textContent = `تعديل بيانات: ${fullStudentName(s)}`;
    const note = document.getElementById('addStudentNote');
    if (note) note.style.display = 'none';

    const card = document.getElementById('addStudentCard');
    if (card) card.style.display = 'block';

    setStudentStatus('التعديل يُحفظ محلياً على هذا الجهاز فقط.', '#5f6368');
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteStudent(id) {
    const s = _studentsCache.find(st => Number(st.id) === Number(id));
    const fullName = fullStudentName(s) || `رقم ${id}`;

    const ok = await showConfirm({
        title: "حذف الطالب",
        message: `${fullName}\n\nالحذف محلي على هذا الجهاز فقط — سيعود الطالب عند سحب البيانات.`,
        confirmText: "حذف",
        danger: true,
        icon: "🗑️",
    });
    if (!ok) return;

    const tx = db.transaction("students", "readwrite");
    const store = tx.objectStore("students");

    // حذف إذا كان مخزن كنص
    store.delete(String(id));

    // حذف إذا كان مخزن كرقم
    const numericID = parseInt(id, 10);
    if (!isNaN(numericID)) {
        store.delete(numericID);
    }

    tx.oncomplete = () => {
        refreshAll();
        showToast("✅ تم حذف الطالب");
    };
}

function checkIDNumber(id) {
    const idStr = id.toString();

    // يجب أن يكون 9 خانات
    if (idStr.length !== 9) {
        return "رقم الهوية يجب أن يتكون من 9 خانات";
    }

    let sum = 0;
    for (let i = 0; i < 8; i++) {
        let digit = parseInt(idStr[i], 10);
        if ((i + 1) % 2 === 0) {
            let doubled = digit * 2;
            sum += Math.floor(doubled / 10) + (doubled % 10);
        } else {
            sum += digit;
        }
    }

    let checkDigit = (10 - (sum % 10)) % 10;
    if (parseInt(idStr[8], 10) !== checkDigit) {
        return "تأكد من رقم الهوية المدخل";
    }

    return "Y";
}


function formatAyah(id) {
    return AYAH_REVERSE[id] || id;
}

function syncAyahID(textInput, hiddenID) {
    const val    = String(textInput.value || '').trim();
    const hidden = document.getElementById(hiddenID);
    if (!hidden) return;

    // المصدر الموثوق: خريطة (نص الآية ← ID) المبنية من QURAN_DATA كاملة،
    // وليس خيارات القائمة لأنها مفلترة وقد لا تحتوي الآية المكتوبة.
    let foundID = (window.AYAH_BY_LABEL && window.AYAH_BY_LABEL[val]) || "";

    if (!foundID) {
        document.querySelectorAll('#ayatList option').forEach(opt => {
            if (opt.value === val) foundID = opt.dataset.id;
        });
    }

    hidden.value = foundID;
}

/**
 * دالة لاستخراج النص العربي من رسالة الخطأ
 * إذا وُجد نص عربي تُرجعه، وإذا لم يوجد تُرجع النص كامل كما هو
 */
function extractArabicError(errorObj) {
  console.log("Input to function:", errorObj);  
  if (!errorObj) return "";
  
  // استخراج النص الأساسي سواء كان الكائن مباشرة أو حقلاً بداخله
  let textToSearch = "";
  if (typeof errorObj === "object") {
    textToSearch = errorObj.cause || errorObj.message || JSON.stringify(errorObj);
  } else {
    textToSearch = errorObj;
  }

  // 1. البحث عن نص عربي (الأولوية للعربي)
  const arabicMatches = textToSearch.match(/[\u0600-\u06FF\s،؟!ـ]+/g);
  if (arabicMatches) {
    const cleanedArabic = arabicMatches.join(" ").trim();
    if (cleanedArabic.length > 5) return cleanedArabic; // إرجاعه إذا كان نصاً معتبراً
  }

  // 2. البحث عن أخطاء ORA (بما في ذلك الأخطاء المتداخلة)
  const oracleMatches = textToSearch.match(/ORA-\d{5}:?[^\n]*/g);
  if (oracleMatches) {
    // استخدام Set لإزالة التكرار (مثل ORA-20001 المتكررة)
    return [...new Set(oracleMatches)].join("\n").trim();
  }

  return textToSearch.substring(0, 200); // إرجاع أول جزء من النص إذا لم يطابق ما سبق
}

function convertStringIDsToNumbers() {
    const tx = db.transaction("students", "readwrite");
    const store = tx.objectStore("students");

    const request = store.openCursor();
    request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            const student = cursor.value;
            if (typeof student.id === "string") {
                // تحويل الهوية من نص إلى رقم
                const newID = parseInt(student.id, 10);

                // حذف السجل القديم
                store.delete(student.id);

                // حفظ نسخة جديدة بنفس البيانات لكن بالرقم
                const newStudent = { ...student, id: newID };
                store.put(newStudent);
            }
            cursor.continue();
        }
    };

    tx.oncomplete = () => {
        refreshAll();
        showToast("✅ تم تحويل جميع الهويات النصية إلى أرقام بنجاح");
    };
}

function populateSelectFromLookups(selectId, meaningCode) {
    fetch('./STATIC_LOOKUP.json')
        .then(response => response.json())
        .then(data => {
            // تصفية الثوابت حسب LOOKUP_MEANING_CODE المطلوب
            const items = data
                .filter(item => item.LOOKUP_MEANING_CODE === meaningCode)
                .sort((a, b) => (a.SORT_ORDER ?? 0) - (b.SORT_ORDER ?? 0));

            const select = document.getElementById(selectId);
            select.innerHTML = ""; // تفريغ القائمة أولاً

            items.forEach(item => {
                const option = document.createElement("option");
                option.value = item.LOOKUP_VALUE;   // القيمة الحقيقية
                option.textContent = item.LOOKUP_A_NAME; // النص المعروض
                select.appendChild(option);
            });
        })
        .catch(error => console.error("❌ خطأ في تحميل الثوابت:", error));
}

function syncRecordsFromPage() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("⚠️ قاعدة البيانات غير مهيأة بعد");
      return;
    }

    // 1. جلب الـ Device ID من مخزن الإعدادات أولاً
    const settingsTx = db.transaction("settings", "readonly");
    const settingsStore = settingsTx.objectStore("settings");
    const getSettings = settingsStore.getAll(); // جلب كائن الإعدادات

    getSettings.onsuccess = () => {
      const settings = getSettings.result[0]; // نأخذ أول سجل إعدادات
      const currentDeviceId = settings ? settings.device_id : localStorage.getItem("device_id");

      if (!currentDeviceId) {
        showAlert("❌ خطأ: لم يتم العثور على معرف الجهاز");
        showSyncMessage("❌ خطأ: لم يتم العثور على معرف الجهاز");
        reject("Device ID missing");
        return;
      }

      // 2. جلب السجلات غير المزامنة
      const tx = db.transaction("records", "readonly");
      const store = tx.objectStore("records");
      const getAll = store.getAll();

      getAll.onsuccess = () => {
        const unsynced = getAll.result.filter(r => !r.synced);
        console.log("📦 عدد السجلات غير المزامنة:", unsynced.length);

        if (unsynced.length === 0) {
          showSyncMessage("✅ لا توجد سجلات تحتاج مزامنة");
          displayRecords();
          resolve();
          return;
        }

        let okCount = 0, failCount = 0;

        Promise.all(
          unsynced.map(record =>
            // ✅ saveActivity: النجاح يتطلّب status = success من السيرفر
            QMC.saveActivity(record)
            .then(result => {
              record.synced   = result.ok;
              record.syncError = result.ok ? null : (result.error || "رفض السيرفر السجل دون رسالة");

              if (result.ok) {
                okCount++;
                // السيرفر يُصدر tagno (مفتاح السجل عنده) ويحسب عدد الصفحات
                if (result.tagNo != null) record.tagNo = result.tagNo;
                if (result.numPages != null) record.amount = result.numPages;
              } else {
                failCount++;
                console.warn("❌ رفض السيرفر السجل:", record.student, result.error, result.raw);
              }

              const txUpdate = db.transaction("records", "readwrite");
              txUpdate.objectStore("records").put(record);
            })
            .catch(err => {
              record.synced = false;
              record.syncError = "خطأ في الاتصال: " + err.message;
              const txUpdate = db.transaction("records", "readwrite");
              txUpdate.objectStore("records").put(record);
            })
          )
        )
        .then(() => {
          // رسالة صادقة: لا نقول "تمت" ما لم تُقبل فعلاً
          if (failCount === 0) {
            showSyncMessage(`✅ تم رفع ${okCount} سجل بنجاح`);
          } else if (okCount === 0) {
            showSyncMessage(`❌ رفض السيرفر كل السجلات (${failCount}) — راجع عمود حالة المزامنة`);
          } else {
            showSyncMessage(`⚠️ تم رفع ${okCount} سجل، ورُفض ${failCount} — راجع عمود حالة المزامنة`);
          }
          displayRecords();
          resolve();
        })
        .catch(reject);
      };
    };
  });
}

// حاوية رسائل المزامنة: شاشة الإعدادات إن كانت مفتوحة، وإلا شاشة السجلات
function getSyncMessageContainer() {
  const settingsTab = document.getElementById("settingsTab");
  if (settingsTab && settingsTab.classList.contains("active")) {
    return document.getElementById("settingsSyncStatus") ||
           document.getElementById("syncBtnContainer");
  }
  return document.getElementById("syncBtnContainer");
}

// دالة لعرض رسالة في الصفحة
function showSyncMessage(msg) {
  const container = getSyncMessageContainer();
  if (!container) return;
  // اللون يتبع مضمون الرسالة — الأخضر الدائم كان يُخفي الفشل
  const isError = msg.indexOf("❌") !== -1;
  const isWarn  = msg.indexOf("⚠️") !== -1;

  const alertBox = document.createElement("div");
  alertBox.textContent = msg;
  alertBox.style.background = isError ? "#f8d7da" : (isWarn ? "#fff3cd" : "#d4edda");
  alertBox.style.color      = isError ? "#721c24" : (isWarn ? "#856404" : "#155724");
  alertBox.style.border     = "1px solid " + (isError ? "#f5c6cb" : (isWarn ? "#ffeeba" : "#c3e6cb"));
  alertBox.style.padding = "10px";
  alertBox.style.marginTop = "10px";
  alertBox.style.borderRadius = "5px";

  container.appendChild(alertBox);

  setTimeout(() => alertBox.remove(), isError || isWarn ? 12000 : 5000);
}

function bindClick(id, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", handler);
}

const onSyncClick = () => {
  syncRecordsFromPage()
    .then(() => { console.log("🎉 انتهت المزامنة"); refreshSettingsInfo(); })
    .catch(err => console.error("❌ خطأ أثناء المزامنة:", err));
};

const onPullClick = () => {
  pullRecordsFromServer()
    .then(() => { console.log("🎉 انتهى سحب البيانات"); refreshSettingsInfo(); })
    .catch(err => console.error("❌ خطأ أثناء السحب:", err));
};

// أزرار شاشة السجلات + نظيراتها في شاشة الإعدادات
bindClick("syncBtn", onSyncClick);
bindClick("pullBtn", onPullClick);
bindClick("settingsSyncBtn", onSyncClick);
bindClick("settingsPullBtn", onPullClick);

/* =========================================================
   نافذة تأكيد/تنبيه موحّدة — بديل confirm/alert المتصفح
   ========================================================= */

let _modalResolve = null;

function closeAppModal(result) {
    const overlay = document.getElementById('appModal');
    if (overlay) overlay.style.display = 'none';
    const resolve = _modalResolve;
    _modalResolve = null;
    if (resolve) resolve(result);
}

function showModal(opts) {
    const o = opts || {};
    const overlay = document.getElementById('appModal');

    // احتياط: لو غاب العنصر لا نُسقط العملية بصمت
    if (!overlay) return Promise.resolve(window.confirm(o.message || ''));

    // إغلاق أي نافذة مفتوحة قبل فتح جديدة
    if (_modalResolve) closeAppModal(false);

    const box = overlay.querySelector('.modal-box');
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    // الأيقونة تقبل رمزاً تعبيرياً أو وسم <i> من Font Awesome
    const iconEl = document.getElementById('modalIcon');
    if (iconEl) iconEl.innerHTML = o.icon || (o.danger ? '⚠️' : '❓');

    set('modalTitle', o.title || 'تأكيد');
    set('modalMessage', o.message || '');

    const confirmBtn = document.getElementById('modalConfirmBtn');
    const cancelBtn  = document.getElementById('modalCancelBtn');

    if (confirmBtn) confirmBtn.textContent = o.confirmText || 'تأكيد';
    if (cancelBtn) {
        cancelBtn.textContent = o.cancelText || 'إلغاء';
        cancelBtn.style.display = o.alertOnly ? 'none' : '';
    }
    if (box) box.classList.toggle('danger', !!o.danger);

    overlay.style.display = 'flex';
    if (confirmBtn) confirmBtn.focus();

    return new Promise(resolve => { _modalResolve = resolve; });
}

// تأكيد بنعم/لا
function showConfirm(opts) {
    return showModal(opts);
}

// تنبيه بزر واحد
function showAlert(opts) {
    const o = (typeof opts === 'string') ? { message: opts } : (opts || {});
    return showModal(Object.assign({ alertOnly: true, confirmText: 'حسناً', icon: o.icon || 'ℹ️' }, o));
}

document.addEventListener('DOMContentLoaded', () => {
    const overlay    = document.getElementById('appModal');
    const confirmBtn = document.getElementById('modalConfirmBtn');
    const cancelBtn  = document.getElementById('modalCancelBtn');

    if (confirmBtn) confirmBtn.addEventListener('click', () => closeAppModal(true));
    if (cancelBtn)  cancelBtn.addEventListener('click', () => closeAppModal(false));

    // الضغط خارج الصندوق = إلغاء
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeAppModal(false);
        });
    }
});

document.addEventListener('keydown', (e) => {
    if (!_modalResolve) return;
    if (e.key === 'Escape') closeAppModal(false);
    else if (e.key === 'Enter') closeAppModal(true);
});

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.classList.remove('toast-hidden');
    
    // تختفي تلقائياً بعد 3 ثوانٍ
    setTimeout(() => {
        toast.classList.add('toast-hidden');
    }, 3000);
}

function resetActivityForm() {
    // 1. تصفير نصوص البحث والحقول المخفية للآيات
    document.getElementById('rangeFromText').value = "";
    document.getElementById('rangeToText').value = "";
    document.getElementById('rangeFrom').value = "";
    document.getElementById('rangeTo').value = "";

    // إلغاء تصفية السورة
    const surahSel = document.getElementById('surahFilter');
    if (surahSel) surahSel.value = "";
    window.CURRENT_SURAH = null;

    document.getElementById('partFrom').value = "";
    document.getElementById('partTo').value = "";
    document.getElementById('mark').value = "";

    // 2. إعادة الأخطاء للصفر والتقييم للفراغ
    document.getElementById('errors').value = 0;
    document.getElementById('rating').value = "";
    
    // 4. (اختياري) إبقاء اسم الطالب أو تصفيره حسب رغبتك
    document.getElementById('studentSelect').value = "";
    const picker = document.getElementById('studentPicker');
    if (picker) picker.value = "";
    
    console.log("تم تنظيف النموذج بنجاح 🧹");
}

async function handleActivityTypeChange(type, options) {
    const silent = !!(options && options.silent);

    const extraFields = document.getElementById('extraFieldsContainer');

    // حقول الآيات
    const rangeFromDiv = document.getElementById('rangeFromText').parentElement.parentElement;
    const rangeToDiv   = document.getElementById('rangeToText').parentElement.parentElement;
    const surahDiv     = document.getElementById('surahFilterDiv');

    // مجموعة الأجزاء داخل extraFields
    const examDiv = document.getElementById('examdiv');

    // الأخطاء والتقييم
    const errorsDiv  = document.getElementById('errors').parentElement;
    const ratingDiv  = document.getElementById('rating').parentElement;

    // الأنواع التي تُخفي كل شيء
    const hideForTypes = [3, 4, 5];

    // النوع الذي يُظهر فقط examdiv
    const showOnlyExamDiv = [6, 7];

    // -----------------------------------
    // ✅ 1) إخفاء جميع الحقول كاملة
    // -----------------------------------
    if (hideForTypes.includes(Number(type))) {

        extraFields.style.display = 'none';

        // تصفير القيم
        document.getElementById('rangeFromText').value = '';
        document.getElementById('rangeToText').value = '';
        document.getElementById('rangeFrom').value = '0';
        document.getElementById('rangeTo').value = '0';
        document.getElementById('errors').value = 0;
        document.getElementById('rating').value = '';

        examDiv.style.display = 'none';

        // مثل شاشة الطلبة في Flutter: الحضور والغياب يُحفظان فوراً بتأكيد،
        // بلا آيات ولا تقييم ولا حاجة للضغط على «حفظ».
        if (!silent && !_editingRecordId) {
            const studentId = clean(parseInt(document.getElementById('studentSelect').value), 0);
            if (studentId) {
                await quickSaveActivity(studentId, Number(type));
                clearActivityTypeSelection();
            } else {
                showToast("اختر الطالب أولاً");
            }
        }

        return;
    }

    // -----------------------------------
    // ✅ 2) إظهار الأجزاء فقط (examdiv)
    // -----------------------------------
   if (showOnlyExamDiv.includes(Number(type))) {

        extraFields.style.display = 'grid';

        // ✅ إظهار examdiv (الجزء من/إلى + العلامة)
        examDiv.style.display = 'grid';

        // ✅ إخفاء الآيات
        rangeFromDiv.style.display = 'none';
        rangeToDiv.style.display   = 'none';
        if (surahDiv) surahDiv.style.display = 'none';

        // ✅ إخفاء الأخطاء
        errorsDiv.style.display = 'none';

        // ✅ إظهار التقييم (مطلوب في اختبار الجزء والسرد أيضاً)
        ratingDiv.style.display = 'block';

        return;
    }

    // -----------------------------------
    // ✅ 3) الوضع الطبيعي (تسميع/مراجعة)
    // -----------------------------------
    extraFields.style.display = 'grid';

    // ✅ إظهار الآيات
    rangeFromDiv.style.display = 'block';
    rangeToDiv.style.display   = 'block';
    if (surahDiv) surahDiv.style.display = 'block';

    // ✅ إخفاء examdiv
    examDiv.style.display = 'none';

    // ✅ إظهار الأخطاء والتقييم
    errorsDiv.style.display = 'block';
    ratingDiv.style.display = 'block';

   // ... داخل handleActivityTypeChange ...

// 1. احصل على قيمة الطالب أولاً
const studentSelect = document.getElementById('studentSelect');
const studentId = studentSelect ? studentSelect.value : null;

// 2. إذا كان النوع يتطلب آيات وكان الطالب مختاراً
if (studentId && studentId !== "") {
    // استدعاء الدالة وانتظارها (يجب أن تكون handleActivityTypeChange معرفة كـ async)
    await fillNextAyahFields(studentId, type);
    
    // 3. بعد ملء الحقول، استدعِ دالة التزامن يدوياً لتجنب NaN
    const rangeFromText = document.getElementById('rangeFromText');
    if (rangeFromText.value !== "") {
        syncAyahID(rangeFromText, 'rangeFrom');
    }
} else {
    console.warn("لم يتم جلب الآية التالية: الطالب غير محدد.");
}

}

function exportPDF() {

  const pdfArea = document.getElementById("pdfArea");

  // ✅ فعّل وضع التصدير
  pdfArea.classList.add("pdf-mode");

  html2pdf()
    .set({
      margin: 0.5,
      filename: 'نشاط_التحفيظ.pdf',
      image: { type: 'png', quality: 1 },
      html2canvas: {
        scale: 2,
        backgroundColor: '#ffffff'
      },
      jsPDF: {
        unit: 'cm',
        format: 'a4',
        orientation: 'landscape'
      }
    })
    .from(pdfArea)
    .save()
    .then(() => {
      // ✅ أعد الوضع الطبيعي
      pdfArea.classList.remove("pdf-mode");
    });
}

function exportAndSharePDF() {

  const pdfArea = document.getElementById("pdfArea");
  const fileName = `Activity_Report_${getFileDatePart()}.pdf`;

  // ✅ عنوان التقرير
  const header = document.createElement("div");
  header.style.textAlign = "center";
  header.style.fontWeight = "bold";
  header.style.marginBottom = "12px";
  header.style.fontSize = "16px";
  header.textContent = `تقرير نشاط التحفيظ – ${getArabicDateText()}`;

  pdfArea.prepend(header);
  pdfArea.classList.add("pdf-mode");

  html2pdf()
    .set({
      margin: 0.5,
      image: { type: 'jpeg', quality: 0.75 },
      html2canvas: {
        scale: 1.5,
        backgroundColor: '#ffffff'
      },
      jsPDF: {
        unit: 'cm',
        format: 'a4',
        orientation: 'landscape'
      }
    })
    .from(pdfArea)
    .outputPdf('blob')
    .then(blob => {

      const file = new File([blob], fileName, {
        type: 'application/pdf'
      });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({
          title: 'تقرير نشاط التحفيظ',
          files: [file]
        });
      }

      // تنظيف
      header.remove();
      pdfArea.classList.remove("pdf-mode");
    });
}

function getSelectedDate() {
  const v = document.getElementById("filterDate").value;
  return v && v.trim() !== "" ? v : null;
}

function getFileDatePart() {
  const d = getSelectedDate();
  return d ? d : "ALL_DATES";
}

function getArabicDateText() {
  const d = getSelectedDate();
  if (!d) return "جميع التواريخ";

  return new Date(d).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}
function clean(value, fallback = "") {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return fallback;
  }

  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "" || v === "null" || v === "undefined") return fallback;
    return value.trim();
  }

  return value;
}

function fetchAndStoreEmpData(teacherID) {
    if (!teacherID) {
        console.warn("⚠️ لا يوجد مستخدم مسجَّل، تعذّر جلب بيانات الموظف");
        return;
    }
    if (!db) return;

    const tx = db.transaction("empdata", "readonly");
    const empStore = tx.objectStore("empdata");
    const getRequest = empStore.get(teacherID);

    getRequest.onsuccess = () => {
        if (getRequest.result) {
            // ✅ الحالة الأولى: البيانات موجودة في الـ Store
            console.log("📦 تم جلب البيانات من التخزين المحلي (IndexedDB)");
            displayEmpData(getRequest.result);
        } else {
            // 🌐 الحالة الثانية: البيانات غير موجودة، نطلبها من السيرفر
            fetchDataFromServer(teacherID);
        }
    };
}

// دالة لجلب البيانات من السيرفر وتخزينها
function fetchDataFromServer(teacherID) {
    return QMC.getEmployee(teacherID)
      .then(emp => {
          if (emp && emp.emp_name) {
              const empRecord = {
                  idno: teacherID,
                  EMP_NAME: emp.emp_name,
                  CENTER_NO: emp.center_no,
                  CENTER_NAME: emp.center_name,
                  CIRCLE_NO: emp.circle_no,
                  CIRCLE_NAME: emp.circle_name
              };

              // تخزين البيانات للمرة القادمة
              const tx = db.transaction("empdata", "readwrite");
              tx.objectStore("empdata").put(empRecord);

              return new Promise((resolve, reject) => {
                  tx.oncomplete = () => {
                      console.log("✅ تم جلب البيانات من السيرفر وتخزينها");
                      displayEmpData(empRecord);
                      resolve(empRecord);
                  };
                  tx.onerror = () => reject(tx.error);
              });
          }
          console.warn("⚠️ لم يتم العثور على بيانات في السيرفر");
          throw new Error("لم يتم العثور على بيانات الموظف");
      });
}

/* =========================================================
   شاشة الإعدادات: بيانات المستخدم + نسخة التطبيق + المزامنة
   ========================================================= */

// تحديث بيانات الموظف يدوياً من السيرفر (زر في شاشة الإعدادات)
function refreshEmpData() {
    const status = document.getElementById('empRefreshStatus');
    const user = getCurrentUser();

    const show = (msg, color) => {
        if (!status) return;
        status.textContent = msg;
        status.style.color = color;
    };

    if (!user) return show("❌ لا يوجد مستخدم مسجَّل. أعد تسجيل الدخول.", "#c0392b");
    if (!navigator.onLine) return show("⚠️ لا يوجد اتصال بالإنترنت حالياً.", "#e67e22");

    show("🔄 جارٍ التحديث من السيرفر…", "#3498db");

    Promise.all([fetchDataFromServer(user), fetchAndStoreCircles()])
        .then(([, circles]) => {
            const extra = circles && circles.length ? ` (${circles.length} حلقة)` : "";
            show("✅ تم تحديث بياناتك" + extra + ".", "#27ae60");
            refreshSettingsInfo();
            setTimeout(() => show("", ""), 4000);
        })
        .catch(err => {
            console.error("❌ تعذر تحديث بيانات الموظف:", err);
            show("❌ تعذّر التحديث: " + (err.message || "خطأ في الاتصال"), "#c0392b");
        });
}

// طلب رقم النسخة من الـ Service Worker (المصدر الوحيد: CACHE_NAME في sw.js)
function requestAppVersion() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready
        .then(reg => {
            const target = reg.active || navigator.serviceWorker.controller;
            if (target) target.postMessage({ type: 'GET_VERSION' });
        })
        .catch(err => console.warn("تعذّر طلب رقم النسخة:", err));
}

// عدّ السجلات التي لم تُرفع بعد
function countPendingRecords() {
    return new Promise(resolve => {
        if (!db) return resolve(null);
        try {
            db.transaction("records").objectStore("records").getAll().onsuccess = (e) => {
                resolve((e.target.result || []).filter(r => !r.synced).length);
            };
        } catch (err) {
            console.warn("تعذّر عدّ السجلات المعلّقة:", err);
            resolve(null);
        }
    });
}

// تعبئة كل بطاقات شاشة الإعدادات
async function refreshSettingsInfo() {
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    const user = getCurrentUser();
    set('settingsUserName', user || "غير مسجَّل");

    const deviceId = localStorage.getItem("device_id") || "";
    set('settingsDeviceId', deviceId ? maskDeviceId(deviceId) : "-");

    set('appVersion', localStorage.getItem("appVersion") || "-");
    set('settingsLastUpdate', localStorage.getItem("lastUpdate") || "-");
    set('settingsOnline', navigator.onLine ? "متصل ✅" : "دون اتصال ⚠️");

    const pending = await countPendingRecords();
    set('settingsPending', pending === null ? "-" : String(pending));

    await renderCirclesList();
}

/* إعادة ضبط البيانات المحلية: حذف الطلبة والسجلات ثم سحبها من السيرفر.
   يرفض العمل إن كان هناك سجل واحد غير مرفوع — حتى لا يضيع عمل المسمّع. */
async function resetLocalData() {
    const btn = document.getElementById('resetLocalBtn');
    const show = (msg, color) => {
        const el = document.getElementById('resetStatus');
        if (!el) return;
        el.textContent = msg || '';
        el.style.color = color || '';
    };

    if (!db) return show("❌ قاعدة البيانات غير جاهزة بعد.", "#c0392b");

    const pending = await countPendingRecords();
    if (pending === null) return show("❌ تعذّر فحص السجلات المعلّقة.", "#c0392b");

    if (pending > 0) {
        show(`⛔ يوجد ${pending} سجل لم يُرفع بعد. اضغط «رفع السجلات» أولاً حتى يصبح العدد صفراً.`, "#c0392b");
        return showAlert({
            title: "لا يمكن إعادة الضبط الآن",
            message: `يوجد ${pending} سجل نشاط لم يُرفع إلى السيرفر، وسيضيع نهائياً.\n\n` +
                     `اضغط «رفع السجلات» أولاً، وتأكد أن «سجلات بانتظار الرفع» أصبح صفراً.`,
            icon: "⛔",
        });
    }

    if (!navigator.onLine) {
        return show("⚠️ إعادة الضبط تتطلب اتصالاً بالإنترنت لإعادة سحب البيانات.", "#e67e22");
    }

    const confirmed = await showConfirm({
        title: "إعادة ضبط البيانات المحلية",
        message: "سيتم حذف كل الطلبة والسجلات المخزّنة على هذا الجهاز ثم سحبها من جديد من السيرفر.\n\n" +
                 "لا توجد سجلات غير مرفوعة، فلن يضيع شيء.",
        confirmText: "إعادة الضبط",
        danger: true,
        icon: "🧹",
    });
    if (!confirmed) return;

    if (btn) btn.disabled = true;
    show("🔄 جارٍ حذف البيانات المحلية…", "#3498db");

    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(["students", "records"], "readwrite");
            tx.objectStore("students").clear();
            tx.objectStore("records").clear();
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error || new Error("فشل حذف المخازن"));
        });

        show("🔄 تم الحذف، جارٍ السحب من السيرفر…", "#3498db");
        await pullRecordsFromServer();

        refreshAll();
        refreshSettingsInfo();
        show("✅ تمت إعادة الضبط بنجاح.", "#27ae60");
    } catch (err) {
        console.error("❌ فشل إعادة الضبط:", err);
        show("❌ فشل إعادة الضبط: " + (err.message || "خطأ غير معروف") +
             " — اضغط «سحب البيانات» يدوياً.", "#c0392b");
    } finally {
        if (btn) btn.disabled = false;
    }
}

// دور المسمّع في الحلقة (emp_role) — نفس ترميز تطبيق Flutter
const CIRCLE_ROLE_NAMES = { M: 'محفّظ أساسي', A: 'مساعد', Q: 'استعلام فقط' };

function circleRoleLabel(role) {
    const r = String(role || '').trim().toUpperCase();
    return CIRCLE_ROLE_NAMES[r] || (r ? r : 'غير محدّد');
}

// عرض كل حلقات المسمّع (قد تكون أكثر من واحدة في نفس الوقت)
async function renderCirclesList() {
    const wrap  = document.getElementById('circlesList');
    const count = document.getElementById('circlesCount');
    if (!wrap) return;

    const circles = await getCirclesFromDb();
    const emp = await getEmpRecord();

    // احتياط: لم تُجلب الحلقات بعد → اعرض حلقة empdata الواحدة
    let rows = circles;
    let isFallback = false;
    if (!rows.length && emp && emp.CIRCLE_NO) {
        isFallback = true;
        rows = [{
            circleNo  : Number(emp.CIRCLE_NO),
            circleName: emp.CIRCLE_NAME || '',
            centerName: emp.CENTER_NAME || '',
            empRole   : '',
        }];
    }

    if (!rows.length) {
        wrap.innerHTML = `<div class="circles-empty">لم تُجلب حلقاتك بعد — اضغط «تحديث بياناتي من السيرفر».</div>`;
        if (count) count.textContent = '';
        updateEmpChipSub([], emp);
        return;
    }

    rows.sort((a, b) => Number(a.circleNo) - Number(b.circleNo));

    wrap.innerHTML = rows.map(c => {
        const role = String(c.empRole || '').trim().toUpperCase();
        const badge = (!isFallback && role)
            ? `<span class="role-badge role-${escapeHtml(role)}">${escapeHtml(circleRoleLabel(role))}</span>`
            : '';
        const meta = [
            `رقم ${c.circleNo}`,
            c.centerName ? escapeHtml(c.centerName) : ''
        ].filter(Boolean).join(' • ');

        return `
        <div class="circle-row">
            <div class="circle-main">
                <span class="circle-name">${escapeHtml(c.circleName || ('حلقة ' + c.circleNo))}</span>
                <span class="circle-meta">${meta}</span>
            </div>
            ${badge}
        </div>`;
    }).join('');

    if (count) {
        count.textContent = isFallback
            ? 'من بيانات الموظف'
            : (rows.length === 1 ? 'حلقة واحدة' : `${rows.length} حلقات`);
    }

    updateEmpChipSub(isFallback ? [] : rows, emp);
}

// سطر الشريط أعلى شاشة النشاط: يوضّح تعدّد الحلقات بدل عرض واحدة فقط
function updateEmpChipSub(circles, emp) {
    const el = document.getElementById('empChipSub');
    if (!el) return;

    const center = (emp && emp.CENTER_NAME) ? emp.CENTER_NAME : '';

    let text;
    if (circles.length > 1) {
        text = `${circles.length} حلقات`;
    } else if (circles.length === 1) {
        text = circles[0].circleName || ('حلقة ' + circles[0].circleNo);
    } else if (emp && emp.CIRCLE_NAME) {
        text = emp.CIRCLE_NAME;
    } else {
        text = 'اضغط لعرض بيانات المركز والحلقة';
        return void (el.textContent = text);
    }

    el.textContent = center ? `${text} — ${center}` : text;
}

// إظهار طرفَي معرّف الجهاز فقط (لا داعي لعرضه كاملاً)
function maskDeviceId(id) {
    const s = String(id);
    return s.length <= 12 ? s : s.slice(0, 6) + "…" + s.slice(-4);
}

// دالة موحدة لعرض البيانات في الواجهة (شاشة الإعدادات + شريط شاشة النشاط)
function displayEmpData(data) {
    const name   = data.EMP_NAME || data.emp_name || "";
    const center = `${data.CENTER_NO} - ${data.CENTER_NAME}`;
    const circle = `${data.CIRCLE_NO} - ${data.CIRCLE_NAME}`;

    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    set("empName", name);
    set("centerInfo", center);
    set("circleInfo", circle);   // بقي لتوافق أي نسخة قديمة من الصفحة

    // الشريط المضغوط أعلى شاشة النشاط (سطر الحلقات تضبطه renderCirclesList)
    set("empChipName", name || getCurrentUser() || "غير معروف");
    renderCirclesList();
}

async function handleLogout() {
    const pending = await countPendingRecords();
    const warn = pending ? `\n\n⚠️ يوجد ${pending} سجل لم يُرفع بعد — ارفعه أولاً حتى لا تفقده.` : '';

    const ok = await showConfirm({
        title: "تسجيل الخروج",
        message: "سيتم إنهاء جلستك على هذا الجهاز." + warn,
        confirmText: "خروج",
        danger: true,
        icon: "🚪",
    });

    if (ok) {
        localStorage.removeItem("user_name");
        localStorage.removeItem("device_id");
        // تفريغ مخزن الإعدادات كما طلب سابقاً
        const req = indexedDB.open("QuranProjectDB");
        req.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction("settings", "readwrite");
            tx.objectStore("settings").clear();
            tx.oncomplete = () => window.location.replace("login.html");
        };
    }
}

async function pullRecordsFromServer() {
    const puserName = getCurrentUser();
    const syncContainer = getSyncMessageContainer();

    if (!puserName) {
        console.warn("⚠️ لا يوجد اسم مستخدم مسجل لسحب البيانات.");
        return;
    }

    if (syncContainer) {
        syncContainer.innerHTML = `<span id="pullStatus" style="margin-inline-end:10px; color:#3498db; font-weight:bold;">🔄 جاري تحديث بيانات الحلقة والطلاب...</span>`;
    }

    try {
        const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open("QuranProjectDB");
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        // 1. جلب البيانات من السيرفر بالتوازي (موحّد عبر QMC مع X-Device-Id)
        const [recordsData, studentsData] = await Promise.all([
            QMC.pullCircleActivity(puserName),
            QMC.pullStudents(puserName)
        ]);

        const remoteRecords = recordsData.items || [];
        const remoteStudents = studentsData.items || [];

        // 2. فتح معاملة واحدة لكل من السجلات والطلاب
        const tx = db.transaction(["records", "students"], "readwrite");
        const storeRec = tx.objectStore("records");
        const storeStu = tx.objectStore("students");
        const indexRec = storeRec.index("student_date_type");

        // --- حفظ الطلاب: المفتاح student_no (وهو ما يطلبه saveActivity) ---
        let missingStudentNo = 0;
        const idNoToStudentNo = {};   // لترجمة الأنشطة القديمة المخزّنة برقم الهوية

        for (const s of remoteStudents) {
            const pick = (...vals) => vals.find(v => v !== undefined && v !== null && v !== '') || '';

            const studentNo = pick(s.student_no, s.studentno, s.studentNo, s.STUDENT_NO);
            const idNo      = pick(s.id_no, s.idNo, s.idno, s.ID_NO);

            if (!studentNo) { missingStudentNo++; continue; }   // بلا رقم طالب لا يمكن حفظ نشاط له

            const key = Number(studentNo);
            if (idNo) idNoToStudentNo[String(idNo)] = key;

            const existing = await new Promise(r => {
                const req = storeStu.get(key);
                req.onsuccess = () => r(req.result);
                req.onerror   = () => r(null);
            });

            storeStu.put(Object.assign({}, existing || {}, {
                id      : key,
                idNo    : String(pick(idNo, existing && existing.idNo)),
                fName   : pick(s.first_name,   s.fName, s.fname, existing && existing.fName),
                pName   : pick(s.father_name,  s.pName, s.pname, existing && existing.pName),
                gName   : pick(s.gfather_name, s.gName, s.gname, existing && existing.gName),
                lName   : pick(s.family_name,  s.lName, s.lname, existing && existing.lName),
                circleNo: (s.circle_no != null) ? Number(s.circle_no)
                                                : (existing ? existing.circleNo : null),
            }));
        }

        if (missingStudentNo) {
            console.warn(`⚠️ تُجوهل ${missingStudentNo} طالباً لأن السيرفر لم يُرجع لهم student_no`);
        }

        // --- حفظ السجلات ---
        let translatedByIdNo = 0;

        for (const remote of remoteRecords) {
            // معرّف الطالب في النشاط يجب أن يكون student_no ليلتقي مع مخزن الطلبة.
            // إن أرسل السيرفر رقم هوية بدلاً منه نترجمه عبر خريطة الطلاب المسحوبين.
            const rawStudent = String(
                remote.student_no ?? remote.studentno ?? remote.student ?? ''
            ).replace(/[\\"]/g, '').trim();

            let student = Number(rawStudent);
            if (idNoToStudentNo[rawStudent] !== undefined) {
                student = idNoToStudentNo[rawStudent];
                translatedByIdNo++;
            }

            const recordToSave = {
                student:     student,
                date:        String(remote.date).replace(/[\\"]/g, '').trim(),
                type:        Number(remote.type),
                teacher:     String(remote.teacher).replace(/[\\"]/g, '').trim(),
                teacherName: (remote.teachername || remote.teacherName || "").replace(/[\\"]/g, '').trim(),
                fromRange:   Number(remote.fromrange || 0),
                toRange:     Number(remote.torange || 0),
                partFrom:    remote.partfrom,
                partTo:      remote.partto,
                amount:      Number(remote.amount || 0),
                rating:      remote.rating,
                errors:      Number(remote.errors || 0),
                mark:        remote.mark,
                notes:       remote.notes || "",
                tagNo:       Number(remote.tagno || remote.tagNo || 0),
                sortOrder:   Number(remote.sortorder || 999),
                synced:      true
            };

            const localId = await new Promise(r => {
                const req = indexRec.getKey([recordToSave.student, recordToSave.date, recordToSave.type]);
                req.onsuccess = e => r(e.target.result);
            });

            if (localId !== undefined) recordToSave.id = localId;
            storeRec.put(recordToSave);
        }

        // انتظر حتى تكتمل المعاملة بالكامل
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });

        if (translatedByIdNo) {
            console.log(`ℹ️ تُرجم ${translatedByIdNo} سجلاً من رقم الهوية إلى رقم الطالب`);
        }

        if (syncContainer) {
            const statusEl = document.getElementById("pullStatus");
            if (statusEl) {
                statusEl.style.color = "#27ae60";
                statusEl.innerHTML = `✅ تم تحديث ${remoteStudents.length} طالب و ${remoteRecords.length} سجل.`;
                setTimeout(() => statusEl.remove(), 5000);
            }
        }

        if (typeof refreshAll === "function") refreshAll();

    } catch (err) {
        console.error("❌ خطأ أثناء المزامنة:", err);
        if (syncContainer) {
            const statusEl = document.getElementById("pullStatus");
            if (statusEl) statusEl.innerHTML = `❌ فشل التحديث.`;
        }
    }
}


function shareAsWhatsAppText() {
    const dateInput = document.getElementById("filterDate").value;
    if (!dateInput) return showAlert("⚠️ يرجى اختيار التاريخ");

    const selectedDate = new Date(dateInput);
    const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    let msg = `*📊 تقرير نشاط يوم ${days[selectedDate.getDay()]} (${dateInput})* 😇\n`;
    msg += `--------------------------\n`;

    const rows = document.querySelectorAll("#logTable tr");
    
    rows.forEach(row => {
        const cols = row.querySelectorAll("td");
        if (cols.length < 10) return;

        const student = cols[2].innerText.trim();    // الطالب
        const type    = cols[3].innerText.trim();    // النوع
        const fromP   = cols[4].innerText.trim();    // من
        const toP     = cols[5].innerText.trim();    // إلى
        const eval    = cols[7].innerText.trim();    // التقييم
        const markNum = parseFloat(cols[8].innerText.trim()) || 0; // العلامة

        // تحديد الرمز التعبيري حسب النوع
        let emoji = "🔹"; 
        if (type.includes("تسميع")) emoji = "📖";
        if (type.includes("مراجعة")) emoji = "🔄";
        if (type.includes("اختبار")) emoji = "✅";
        if (type.includes("سرد")) emoji = "🏆";
        if (type.includes("حضور")) emoji = "🟢";
        if (type.includes("غياب بعذر")) emoji = "🟡";
        if (type.includes("غياب بدون عذر")) emoji = "🔴";

        let line = `${emoji} ( *${student}* ) ${type}`;

        // 1. الأنواع التي تتطلب (من - إلى)
        const rangeTypes = ["تسميع", "مراجعة", "اختبار جزء", "سرد"];
        if (rangeTypes.includes(type)) {
            line += ` من ${fromP} إلى ${toP}`;
        }

        // 2. معالجة التقدير (إخفاء الصفر)
        let displayEval = (eval === "0" || eval === "") ? "" : ` بتقدير *${eval}*`;

        // 3. شروط العرض الخاصة بالنتائج
        if (type === "تسميع" || type === "مراجعة") {
            line += displayEval;
        } 
        else if (type === "اختبار جزء" || type === "سرد") {
            if (markNum > 0) {
                line += ` بعلامة *${markNum}*`;
            } else {
                line += displayEval;
            }
        }

        msg += line + `\n`;
    });

    msg += `--------------------------\n`;
    msg += `_تم الإرسال عبر نظام إدارة التحفيظ_`;

    if (navigator.share) {
        navigator.share({ text: msg });
    } else {
        window.open(`https://wa.me{encodeURIComponent(msg)}`);
    }
}


function getLastActivity(studentId, activityType) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);

    request.onsuccess = function(event) {
      const db = event.target.result;
      const tx = db.transaction("records", "readonly");
      const store = tx.objectStore("records");
      const index = store.index("student_date_type");

      // نفتح المدى لكل السجلات الخاصة بهذا الطالب (بغض النظر عن التاريخ والنوع حالياً)
      // التاريخ يبدأ من "0" والنوع من 0 لضمان شمول كل شيء
      const range = IDBKeyRange.bound(
        [Number(studentId), "0", 0],
        [Number(studentId), "9", 99]
      );

      // نفتح المؤشر بترتيب تنازلي (الأحدث أولاً)
      index.openCursor(range, "prev").onsuccess = function(e) {
        const cursor = e.target.result;
        if (cursor) {
          const record = cursor.value;
          
          // فلترة برمجية مرنة للنوع: تقارن القيمة سواء كانت نصاً أو رقماً
          if (String(record.type) === String(activityType)) {
            console.log("✅ وجدنا آخر نشاط مطابق:", record);
            resolve(record);
            return; // توقف فور إيجاد الأحدث
          }
          
          // إذا لم يطابق النوع، انتقل للسجل الذي قبله (أقدم منه)
          cursor.continue();
        } else {
          console.log("❌ لا يوجد سجلات مطابقة لهذا الطالب وهذا النوع.");
          resolve(null);
        }
      };

      tx.oncomplete = () => db.close();
    };

    request.onerror = () => reject("Error opening database");
  });
}

// حساب الاتجاه والآية التالية
function getNextAyah(record) {
  // التعديل هنا: استخدام المسميات الصحيحة من قاعدة بياناتك
  const from = Number(record.fromRange || 0);
  const to = Number(record.toRange || 0);
  
  let direction, nextAyah;

  const getSuraId = (id) => {
    const ayah = QURAN_DATA.find(a => a.id === id);
    return ayah ? ayah.s : null;
  };

  const currentSura = getSuraId(to);

  if (from < to) {
    direction = "forward";
    nextAyah = to + 1;
  } else {
    direction = "backward";
    let potentialNext = to + 1;
    if (getSuraId(potentialNext) === currentSura) {
      nextAyah = potentialNext;
    } else {
      nextAyah = to - 1;
    }
  }

  return { direction, nextAyah };
}

async function fillNextAyahFields(studentId, activityType) {
    // 1. تحديد الأنواع المسموح لها بالتعبئة التلقائية
    const allowedTypes = [1, 2, 6, 7];
    if (!allowedTypes.includes(Number(activityType))) return;

    try {
        const lastRecord = await getLastActivity(studentId, activityType);

        if (lastRecord) {
            // 2. حساب الآية التالية من السجل الأخير
            let result = getNextAyah(lastRecord);
            let nextId = result.nextAyah;

            // 3. منطق التحقق من التكرار:
            // إذا كانت الآية المحسوبة (nextId) تقع ضمن النطاق الذي سمعه الطالب في السجل الأخير
            // (أي أنها محصورة بين من وإلى في النشاط السابق)
            const isRepeated = (nextId >= lastRecord.fromRange && nextId <= lastRecord.toRange) || 
                               (nextId <= lastRecord.fromRange && nextId >= lastRecord.toRange);

            if (isRepeated) {
                console.log("⚠️ الآية مكررة في النشاط السابق، جاري الرجوع خطوة للخلف...");
                // نقوم بتعديل السجل وهمياً بطرح 1 من النهاية لإعادة الحساب
                lastRecord.toRange = Number(lastRecord.toRange) - 1;
                // إعادة استدعاء الدالة بنفس البيانات المحدثة (أو تنفيذ getNextAyah مرة أخرى)
                result = getNextAyah(lastRecord);
                nextId = result.nextAyah;
            }

            // 4. جلب النص وتعبئة الحقول
            const ayahData = QURAN_DATA.find(item => item.id === nextId);
            if (ayahData) {
                const textField = document.getElementById('rangeFromText');
                const hiddenField = document.getElementById('rangeFrom');

                textField.value = ayahData.l;
                hiddenField.value = nextId;

                if (typeof syncAyahID === 'function') {
                    syncAyahID(textField, 'rangeFrom');
                }
                console.log("✅ تم التحديث بنجاح للآية:", ayahData.l);
            }
        }
    } catch (error) {
        console.error("خطأ في معالجة الآية التالية:", error);
    }
}

