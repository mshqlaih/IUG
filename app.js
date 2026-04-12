// استدعاء ملف Service Worker للعمل أوفلاين
// --- 1. تسجيل الـ Service Worker وإدارة التحديثات ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
        console.log("نظام العمل أوفلاين نشط");
        

        reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    if (confirm("تم تحميل تحديثات جديدة للنظام. هل تريد التفعيل الآن؟")) {
                        location.reload(); 
                    }
                }
            };
        };

    
        // استقبال تاريخ آخر تحديث من الـ SW
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data.type === 'LAST_UPDATE') {
                localStorage.setItem("lastUpdate", event.data.date);
                document.getElementById("lastUpdateLabel").innerText = "📅 آخر تحديث: " + event.data.date;
            }
        });

    }).catch(err => console.log("خطأ في تسجيل الـ SW:", err));
}

window.addEventListener("DOMContentLoaded", () => {
    const lastUpdate = localStorage.getItem("lastUpdate");
    if (lastUpdate) {
        const label = document.getElementById("lastUpdateLabel");
        if (label) {
            label.innerText = "📅 آخر تحديث: " + lastUpdate;
        }
    }
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
window.onload = () => {
    fillAyatSearchList();
    loadStaticLookup();
    initDB();
    document.getElementById('activityDate').valueAsDate = new Date();
    const savedID = localStorage.getItem('teacherID');
    if(savedID) document.getElementById('teacherID').value = savedID;
    // استدعاء الدالة عند تحميل التطبيق
    
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
    const request = indexedDB.open(DB_NAME, 12); // الإصدار الجديد
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


    };

    request.onsuccess = (e) => {
        db = e.target.result;
        refreshAll();
        migrateOldRecords(); 
        normalizeRecords();
         const teacherID = document.getElementById("teacherID").value;
          fetchAndStoreEmpData(teacherID);
        inspectFullDatabase();

         if (!window._syncOnlineListenerAdded) {
        window._syncOnlineListenerAdded = true;
        window.addEventListener("online", () => {
            console.log("📶 الإنترنت عاد، تسجيل المزامنة...");
            navigator.serviceWorker.ready.then(reg => {
                reg.sync.register('sync-records');
            });
        });
    }

    };
}

function fillAyatSearchList() {
    const list = document.getElementById('ayatList');
    if (!list) return; // تأكد أن العنصر موجود

    // 1. إذا كانت القائمة (Datalist) بها خيارات فعلياً، فلا داعي لإعادة بنائها
    if (list.options.length > 0) {
        console.log("قائمة البحث جاهزة مسبقاً ✅");
        return;
    }

    if (typeof QURAN_DATA === 'undefined') return;

    // 2. بناء PAGE_MAX_LINES و AYAH_REVERSE مرة واحدة فقط
    if (typeof window.PAGE_MAX_LINES === 'undefined') {
        window.PAGE_MAX_LINES = QURAN_DATA.reduce((acc, curr) => {
            acc[curr.p] = Math.max(acc[curr.p] || 0, curr.le);
            return acc;
        }, {});
        
        // بناء مصفوفة الأسماء (ترجمة IDs إلى نصوص)
        QURAN_DATA.forEach(item => {
            window.AYAH_REVERSE[item.id] = item.l;
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

// ملء الـ Datalist ببيانات أوراكل (TAGNO, Page, Line)
function fillAyatSearchList01() {
    const list = document.getElementById('ayatList');
    
if (!window.AYAH_REVERSE || Object.keys(window.AYAH_REVERSE).length === 0) {
        window.AYAH_REVERSE = {};
    } else {
        // إذا كانت المصفوفة مليئة بالبيانات، فلا داعي لإعادة تعبئتها وتضييع الوقت
        console.log("AYAH_REVERSE جاهزة مسبقاً، نكتفي بتعبئة قائمة البحث");
    }
    
    if (typeof QURAN_DATA === 'undefined') return;

    if (typeof window.PAGE_MAX_LINES === 'undefined') {
        window.PAGE_MAX_LINES = QURAN_DATA.reduce((acc, curr) => {
            acc[curr.p] = Math.max(acc[curr.p] || 0, curr.le);
            return acc;
        }, {});
        console.log("تم تجهيز بيانات أسطر الصفحات بنجاح ✅");
    }
    
    const fragment = document.createDocumentFragment();

    QURAN_DATA.forEach(item => {
        const option = document.createElement('option');

        option.value = item.l;         // النص الظاهر للمستخدم
        option.dataset.id = item.id;   // ✅ رقم الآية الحقيقي (هذا أهم شيء)

         AYAH_REVERSE[item.id] = item.l;

        fragment.appendChild(option);
    });

    list.innerHTML = "";
    list.appendChild(fragment);
}

const activityStyles = {
    "1": { icon: "🗣️", color: "#2ecc71" },
    "2": { icon: "🔄", color: "#3498db" },
    "6": { icon: "🏆", color: "#f1c40f" },
    "7": { icon: "📖", color: "#9b59b6" },
    "8": { icon: "💡", color: "#e67e22" },
    "3": { icon: "👤", color: "#95a5a6" },
    "4": { icon: "✉️", color: "#e74c3c" },
    "5": { icon: "❌", color: "#c0392b" },
    "99": { icon: "➖", color: "#bdc3c7" }
};

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

        const style = activityStyles[opt.value] || { icon: "📝", color: "#ccc" };
        const item = document.createElement('div');
        item.className = "icon-card";
        item.innerHTML = `<span class="emoji">${style.icon}</span><span class="text">${opt.text}</span>`;
        item.style.borderBottom = `3px solid ${style.color}`;

        item.onclick = function() {
    // 1. تحديث القيمة في الـ Select المخفي
    const select = document.getElementById('activityType');
    select.value = opt.value;

    handleActivityTypeChange(opt.value);        

    // 2. إزالة التميز (active) من جميع البطاقات الأخرى
    const allCards = container.querySelectorAll('.icon-card');
    allCards.forEach(card => card.classList.remove('active'));

    // 3. إضافة التميز للبطاقة التي تم النقر عليها حالياً
    item.classList.add('active');

    // 4. تشغيل حدث التغيير (اختياري)
    select.dispatchEvent(new Event('change'));
    
    console.log("تم اختيار النوع رقم: " + opt.value); // للتأكد في الكونسول
};

        container.appendChild(item);
    });
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

// 3. محرك البحث الذكي (بقرة 155)

function handleSmartSearch(inputEl) {
    const val = inputEl.value.trim();
    if (val.length < 1) return;
    const searchTerms = val.replace("ال", "").split(" ");
    const filtered = QURAN_DATA.filter(item => {
        const cleanLabel = item.l.replace("سورة ", "").replace("آية ", "").replace("ال", "");
        return searchTerms.every(term => cleanLabel.includes(term) || item.l.includes(term));
    }).slice(0, 30);
    renderOptions(filtered);
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
                    // تنفيذ القفزة الذكية
                    jumpToNext(cursor.value.toRange, cursor.value.flowDirection || "forward");
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

function jumpToNext(lastPos, dir) {
    const lastObj = QURAN_DATA.find(i => i.l === lastPos);
    if (lastObj) {
        const nextId = (dir === "forward") ? lastObj.id + 1 : lastObj.id - 1;
        const nextObj = QURAN_DATA.find(i => i.id === nextId);
        if (nextObj) {
            document.getElementById('rangeFrom').value = nextObj.l;
            document.getElementById('flowDirection').value = dir;
            calculateExactProgress();
        }
    }
}

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
        return alert("يجب إدخال تاريخ النشاط");
    }

    const onlyDate = new Date(rawDate).toISOString().split("T")[0];

    const teacher   = clean(parseInt(document.getElementById('teacherID').value), 0);

    let teacherName = String(teacher); // قيمة افتراضية في حال لم يجد الاسم
    try {
        const empTx = db.transaction("empdata", "readonly");
        const empStore = empTx.objectStore("empdata");
        // نحول teacherId إلى نص لأن idno في الصورة يبدو كنص
        const empReq = await new Promise((resolve) => {
            const req = empStore.get(String(teacher));
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
        if (empReq) {
            teacherName = empReq.EMP_NAME;
        }
    } catch (e) {
        console.warn("تعذر جلب اسم المعلم من empdata", e);
    }
   
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
    if (!teacher || !student || !type) {
        return alert("يجب إدخال المحفظ والطالب ونوع النشاط");
    }

    if ((type === 1 || type === 2 || type === 7) && (!fromRange || !toRange)) {
        return alert("يجب اختيار آيات صحيحة من القائمة");
    }

    if (type === 7 && (!partFrom || !partTo)) {
        return alert("يجب إدخال الجزء من وإلى");
    }
   const activityInfo = STATIC_LOOKUP.find(
    i => i.LOOKUP_MEANING_CODE === "RECITATION_ATTENDANCE_TYPE" 
      && parseInt(i.LOOKUP_VALUE) === type
);
    

    const record = {
        teacher    : teacher,                 // رقم فقط
        teacherName : teacherName,
        student   : student,
        date      : onlyDate,
        type      : type,
        fromRange : fromRange || "",
        toRange   : toRange   || "",
        amount    : prog || 0,
        errors    : errors,
        rating    : rating || "",
        mark      : mark,
        partFrom  : partFrom || "",
        partTo    : partTo   || "",
        synced    : false,
        syncError : "",
        sortOrder : activityInfo?.SORT_ORDER ?? 999,
    };

    const tx = db.transaction("records", "readwrite");
    const store = tx.objectStore("records");
    const index = store.index("student_date_type");

    const check = index.get([record.student, record.date, record.type]);

    check.onsuccess = () => {
        if (check.result) {
            alert("هذا النشاط مسجل مسبقًا لهذا الطالب في هذا التاريخ.");
        } else {
            store.add(record).onsuccess = () => {
                refreshAll();
                showToast("تم حفظ النشاط بنجاح");
                resetActivityForm();

                navigator.serviceWorker.ready.then(reg => {
                    reg.sync.register("sync-records");
                });
            };
        }
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

// 8. الدوال العامة (حفظ طالب، تعديل، تصدير، حذف)
function saveStudent() {
    let id = document.getElementById('stuID').value; // استخدم let
    const fName = document.getElementById('fName').value.trim();
    const pName = document.getElementById('pName').value.trim();
    const gName = document.getElementById('gName').value.trim();
    const lName = document.getElementById('lName').value.trim();

    const result = checkIDNumber(id);
    if (result !== "Y") {
        alert("❌ " + result);
        return;
    }

    if (!fName || !pName || !gName || !lName) {
        alert("❌ يجب إدخال جميع أجزاء الاسم (الاسم الأول، الأب، الجد، العائلة)");
        return;
    }

    id = parseInt(id, 10); // الآن مسموح لأن id مهيأ بـ let

    const s = { id, fName, pName, gName, lName };

    db.transaction("students", "readwrite")
      .objectStore("students")
      .put(s).onsuccess = () => {
          refreshAll();
          alert("✅ تم الحفظ بنجاح");
      };
}
function refreshAll() {
    const sel = document.getElementById('studentSelect'); sel.innerHTML = '<option value="">-- اختر --</option>';
    const list = document.getElementById('studentsList'); list.innerHTML = '';
    db.transaction("students").objectStore("students").getAll().onsuccess = (e) => {
        e.target.result.forEach(s => {
            const full = `${s.fName} ${s.pName} ${s.gName} ${s.lName}`.replace(/\s+/g, ' ').trim();
            sel.innerHTML += `<option value="${s.id}">${full}</option>`;
            list.innerHTML += `<tr><td>${s.id}</td><td>${full}</td>
            <td>
            <button onclick="editStudent(${s.id})">✏️</button>
             <button onclick="deleteStudent(${s.id}, '${full}')">🗑️</button>
            </td>
            </tr>`;
        });
    };
   loadLookups().then(() => {
    displayRecords();
});
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
                    const matchesID   = !fID || r.student.includes(fID);

                    if (matchesDate && matchesID) {
                        let fromText = "";
                        let toText   = "";

                        if (r.type == 6) {
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
                                <td>${r.date}</td>
                                <td>${teacherName}</td>                                
                                <td><b>${studentName}</b></td>
                                <td><span class="badge">${activityName}</span></td>
                                <td style="font-size:11px">${fromText}</td>
                                <td style="font-size:11px">${toText}</td>
                                <td style="color:var(--secondary); font-weight:bold">${r.amount}</td>
                                <td>${ratingName}</td>
                                <td>${r.mark}</td>
                                <td class="no-pdf">${r.errors}</td>
                                <td class="no-pdf">
                                    ${r.synced 
                                        ? '<span style="color:green">✔ تم الرفع</span>' 
                                        : '<span style="color:red">✘ لم يُرفع</span>'}
                                    </br>${errorText}
                                </td>
                                <td class="no-pdf"><button class="btn-del" onclick="deleteRecord(${r.id})">حذف</button></td>
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

function deleteRecord(id) { if(confirm("حذف؟")) db.transaction("records", "readwrite").objectStore("records").delete(id).onsuccess = () => displayRecords(); }
function saveTeacherID() {
    const id = document.getElementById('teacherID').value;
    const result = checkIDNumber(id);

    if (result === "Y") {
        localStorage.setItem('teacherID', id);
        alert("✅ تم الحفظ بنجاح");
    } else {
        alert("❌ " + result);
    }
}

// 9. النسخ الاحتياطي
async function exportBackup() {
    const data = { students: await getAll("students"), records: await getAll("records"),settings : await getAll("settings"), teacherID: localStorage.getItem('teacherID') };
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

function importBackup01(input) {
    const reader = new FileReader();
    reader.onload = e => {
        const d = JSON.parse(e.target.result);
        const tx = db.transaction(["students", "records"], "readwrite");

        let added = 0, updated = 0;

        if(d.students) d.students.forEach(s => {
            tx.objectStore("students").put(s);
        });

        if(d.records) d.records.forEach(r => {
            const store = tx.objectStore("records");
            const req = store.put(r);
            req.onsuccess = () => {
                // put يعيد المفتاح، نعتبره تحديث أو إضافة
                updated++; // هنا نعتبر كل عملية put تحديث أو إضافة ناجحة
            };
        });

        tx.oncomplete = () => {
            showImportMessage(`✅ تم الاستيراد بنجاح<br>تم تحديث/إضافة ${updated} سجل`);
            setTimeout(() => location.reload(), 2000); // إعادة تحميل بعد ثانيتين
        };

        tx.onerror = err => {
            console.error("خطأ:", err.target.error);
            showImportMessage("❌ فشل الاستيراد: " + err.target.error, true);
        };
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
    alert("لا توجد بيانات للتصدير");
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

function editStudent(id) {
    db.transaction("students").objectStore("students").get(id).onsuccess = (e) => {
        const s = e.target.result;

        // تعبئة stuID من قيمة id
        document.getElementById('stuID').value = s.id;

        // باقي الحقول عادي
        ['fName','pName','gName','lName'].forEach(k => {
            document.getElementById(k).value = s[k];
        });

        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
}

function deleteStudent(id, fullName) {
    if (confirm(`هل أنت متأكد أنك تريد حذف الطالب: ${fullName} ؟`)) {
        const tx = db.transaction("students", "readwrite");
        const store = tx.objectStore("students");

        // حذف إذا كان مخزن كنص
        store.delete(id.toString());

        // حذف إذا كان مخزن كرقم
        const numericID = parseInt(id, 10);
        if (!isNaN(numericID)) {
            store.delete(numericID);
        }

        tx.oncomplete = () => {
            refreshAll();
            alert("✅ تم الحذف بنجاح");
        };
    }
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
    const val = textInput.value.trim();
    const opts = document.querySelectorAll('#ayatList option');

    let foundID = "";

    opts.forEach(opt => {
        if (opt.value === val) {
            foundID = opt.dataset.id;
        }
    });

    document.getElementById(hiddenID).value = foundID;
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

async function loadStudentsTable() {
  const response = await fetch("students.json");
  const data = await response.json();

  const tbody = document.querySelector("#studentsTable tbody");
  tbody.innerHTML = "";

  data.forEach(student => {
    const tr = document.createElement("tr");

    // أول عمود: زر الإضافة
    const addTd = document.createElement("td");
    const addBtn = document.createElement("button");
    addBtn.textContent = "➕";
    addBtn.style.cursor = "pointer";
    addBtn.style.background = "none";
    addBtn.style.border = "none";
    addBtn.style.fontSize = "18px"; // حجم الأيقونة فقط
    addBtn.style.color = "var(--primary)";

    addBtn.addEventListener("click", () => addStudent({
      id: student.ID_NO,
      fName: student.FIRST_NAME,
      pName: student.FATHER_NAME,
      gName: student.GFATHER_NAME,
      lName: student.FAMILY_NAME
    }));

    addTd.appendChild(addBtn);
    tr.appendChild(addTd);

    // باقي الأعمدة
    ["ID_NO","FIRST_NAME","FATHER_NAME","GFATHER_NAME","FAMILY_NAME"].forEach(key => {
      const td = document.createElement("td");
      td.textContent = student[key];
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
    
}

function addStudent(student) {
  const tx = db.transaction("students", "readwrite");
  const store = tx.objectStore("students");
  store.put(student);
  tx.oncomplete = () => console.log("تمت إضافة الطالب:", student);
  refreshAll();   
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
        alert("✅ تم تحويل جميع الهويات النصية إلى أرقام بنجاح");
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

// دالة لتحديث السجلات القديمة
function normalizeRecords() {
    if (!db) {
        console.error("قاعدة البيانات غير مهيأة بعد");
        return;
    }

    loadLookups().then(() => {
        const tx = db.transaction("records", "readonly");
        const store = tx.objectStore("records");

        store.openCursor().onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                const r = cursor.value;
                let updated = false;

                // ✅ معالجة type
                if (typeof r.type === "string") {
                    const trimmed = r.type.trim();
                    if (!isNaN(Number(trimmed))) {
                        console.log("تحويل type:", r.type, "→", Number(trimmed));
                        r.type = Number(trimmed);
                        updated = true;
                    } else {
                        for (const [val, name] of Object.entries(lookupMap["RECITATION_ATTENDANCE_TYPE"] || {})) {
                            if (name.trim() === trimmed) {
                                console.log("تحويل type:", r.type, "→", Number(val));
                                r.type = Number(val);
                                updated = true;
                                break;
                            }
                        }
                    }
                }

                // ✅ معالجة rating
                if (typeof r.rating === "string") {
                    const trimmed = r.rating.trim();
                    if (!isNaN(Number(trimmed))) {
                        console.log("تحويل rating:", r.rating, "→", Number(trimmed));
                        r.rating = Number(trimmed);
                        updated = true;
                    } else {
                        for (const [val, name] of Object.entries(lookupMap["ACTIVITY_GRADE"] || {})) {
                            if (name.trim() === trimmed) {
                                console.log("تحويل rating:", r.rating, "→", Number(val));
                                r.rating = Number(val);
                                updated = true;
                                break;
                            }
                        }
                    }
                }

                // ✅ teacher و student إذا كانوا نصوص رقمية
                if (typeof r.teacher === "string" && !isNaN(Number(r.teacher))) {
                    console.log("تحويل teacher:", r.teacher, "→", Number(r.teacher));
                    r.teacher = Number(r.teacher);
                    updated = true;
                }
                if (typeof r.student === "string" && !isNaN(Number(r.student))) {
                    console.log("تحويل student:", r.student, "→", Number(r.student));
                    r.student = Number(r.student);
                    updated = true;
                }

                // إذا تم تعديل السجل → افتح transaction جديد واحفظه
                if (updated) {
                    const tx2 = db.transaction("records", "readwrite");
                    const store2 = tx2.objectStore("records");
                    const updateRequest = store2.put(r); // put يكتب السجل مباشرة

                    updateRequest.onsuccess = () => {
                        console.log("✅ تم حفظ السجل بنجاح:", r.id);
                    };
                    updateRequest.onerror = (event) => {
                        console.error("❌ فشل حفظ السجل:", r.id, event.target.error);
                    };

                    tx2.oncomplete = () => {
                        console.log("🎉 انتهى تحديث السجل:", r.id);
                    };
                    tx2.onerror = (event) => {
                        console.error("❌ خطأ في المعاملة للسجل:", r.id, event.target.error);
                    };
                }

                cursor.continue();
            }
        };

        tx.oncomplete = () => {
            console.log("🎯 انتهت عملية الفحص لجميع السجلات");
        };
    });
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
        alert("❌ خطأ: لم يتم العثور على معرف الجهاز");  
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

        Promise.all(
          unsynced.map(record =>
            fetch("https://g0a3378e3bd0d3a-dbcpc2023.adb.me-abudhabi-1.oraclecloudapps.com/ords/cpcws/qmc/students", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              // ✅ تعديل: دمج الـ device_id_field مع بيانات السجل
              body: JSON.stringify({
                ...record,
                device_id_field: currentDeviceId
              })
            })
            .then(async res => {
              if (res.ok) {
                const txUpdate = db.transaction("records", "readwrite");
                const storeUpdate = txUpdate.objectStore("records");
                record.synced = true;
                record.syncError = null;
                storeUpdate.put(record);
              } else {
                const errorText = await res.text();
                record.synced = false;
                record.syncError = errorText;
                const txUpdate = db.transaction("records", "readwrite");
                txUpdate.objectStore("records").put(record);
              }
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
          showSyncMessage("✅ تمت عملية المزامنة");
          displayRecords();
          resolve();
        })
        .catch(reject);
      };
    };
  });
}

function syncRecordsFromPage01() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("⚠️ قاعدة البيانات غير مهيأة بعد");
      return;
    }

    const tx = db.transaction("records", "readonly");
    const store = tx.objectStore("records");
    const getAll = store.getAll();

    getAll.onsuccess = () => {
      const unsynced = getAll.result.filter(r => !r.synced);
      console.log("📦 عدد السجلات غير المزامنة:", unsynced.length);

      if (unsynced.length === 0) {
        showSyncMessage("✅ لا توجد سجلات تحتاج مزامنة");
        displayRecords(); // تحديث الجدول مباشرة
        resolve();
        return;
      }

      Promise.all(
        unsynced.map(record =>
          fetch("https://g0a3378e3bd0d3a-dbcpc2023.adb.me-abudhabi-1.oraclecloudapps.com/ords/cpcws/qmc/students", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(record)
          })
          .then(async res => {
            if (res.ok) {
              const txUpdate = db.transaction("records", "readwrite");
              const storeUpdate = txUpdate.objectStore("records");
              record.synced = true;
              record.syncError = null;
              storeUpdate.put(record);
            } else {
              const errorText = await res.text();
              record.synced = false;
              record.syncError = errorText;
              const txUpdate = db.transaction("records", "readwrite");
              txUpdate.objectStore("records").put(record);
            }
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
        // ✅ رسالة واحدة فقط بعد اكتمال العملية
        showSyncMessage("✅ تمت عملية المزامنة");
        displayRecords(); // تحديث الجدول بعد المزامنة
        resolve();
      })
      .catch(reject);
    };

    getAll.onerror = (err) => reject(err);
  });
}


// دالة لعرض رسالة في الصفحة
function showSyncMessage(msg) {
  const container = document.getElementById("syncBtnContainer");
  const alertBox = document.createElement("div");
  alertBox.textContent = msg;
  alertBox.style.background = "#d4edda";   // أخضر فاتح
  alertBox.style.color = "#155724";        // أخضر غامق
  alertBox.style.padding = "10px";
  alertBox.style.marginTop = "10px";
  alertBox.style.border = "1px solid #c3e6cb";
  alertBox.style.borderRadius = "5px";

  container.appendChild(alertBox);

  setTimeout(() => alertBox.remove(), 5000);
}

document.getElementById("syncBtn").addEventListener("click", () => {
  syncRecordsFromPage()
    .then(() => console.log("🎉 انتهت المزامنة"))
    .catch(err => console.error("❌ خطأ أثناء المزامنة:", err));
});

document.getElementById("pullBtn").addEventListener("click", () => {
  pullRecordsFromServer()
    .then(() => console.log("🎉 انتهى سحب البيانات"))
    .catch(err => console.error("❌ خطأ أثناء السحب:", err));
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

    document.getElementById('partFrom').value = "";
    document.getElementById('partTo').value = "";
    document.getElementById('mark').value = "";

    // 2. إعادة الأخطاء للصفر
    document.getElementById('errors').value = 0;
    
    // 4. (اختياري) إبقاء اسم الطالب أو تصفيره حسب رغبتك
    document.getElementById('studentSelect').value = ""; 
    
    console.log("تم تنظيف النموذج بنجاح 🧹");
}

function handleActivityTypeChange(type) {

    const extraFields = document.getElementById('extraFieldsContainer');

    // حقول الآيات
    const rangeFromDiv = document.getElementById('rangeFromText').parentElement.parentElement;
    const rangeToDiv   = document.getElementById('rangeToText').parentElement.parentElement;

    // مجموعة الأجزاء داخل extraFields
    const examDiv = document.getElementById('examdiv');

    // الأخطاء والتقييم
    const errorsDiv  = document.getElementById('errors').parentElement;
    const ratingDiv  = document.getElementById('rating').parentElement;

    // الأنواع التي تُخفي كل شيء
    const hideForTypes = [3, 4, 5];

    // النوع الذي يُظهر فقط examdiv
    const showOnlyExamDiv = 6;

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

        return;
    }

    // -----------------------------------
    // ✅ 2) إظهار الأجزاء فقط (examdiv)
    // -----------------------------------
    if (Number(type) === showOnlyExamDiv) {

        extraFields.style.display = 'grid';

        // ✅ إظهار examdiv (الجزء من/إلى + العلامة)
        examDiv.style.display = 'grid';

        // ✅ إخفاء الآيات
        rangeFromDiv.style.display = 'none';
        rangeToDiv.style.display   = 'none';

        // ✅ إخفاء الأخطاء والتقييم
        errorsDiv.style.display = 'none';
        ratingDiv.style.display = 'none';

        return;
    }

    // -----------------------------------
    // ✅ 3) الوضع الطبيعي (تسميع/سرد)
    // -----------------------------------
    extraFields.style.display = 'grid';

    // ✅ إظهار الآيات
    rangeFromDiv.style.display = 'block';
    rangeToDiv.style.display   = 'block';

    // ✅ إخفاء examdiv
    examDiv.style.display = 'none';

    // ✅ إظهار الأخطاء والتقييم
    errorsDiv.style.display = 'block';
    ratingDiv.style.display = 'block';
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

function getTeacherCache() {
  return JSON.parse(localStorage.getItem("teacher_cache")) || {};
}

function saveTeacherToCache(id, name) {
  const cache = getTeacherCache();
  cache[id] = name;
  localStorage.setItem("teacher_cache", JSON.stringify(cache));
}

async function resolveTeacherName(teacherID) {

  const cache = getTeacherCache();

  // ✅ 1. موجود محليًا
  if (cache[teacherID]) {
    return cache[teacherID];
  }

  // ✅ 2. غير موجود → جلب من السيرفر
  try {
    const response = await fetch(
      'https://g0a3378e3bd0d3a-dbcpc2023.adb.me-abudhabi-1.oraclecloudapps.com/ords/cpcws/qmc/employees/${teacherID}',
      { method: "GET" }
    );

    if (!response.ok) {
      throw new Error("Teacher not found");
    }

    const data = await response.json();

    // نفترض أن السيرفر يرجع:
    // { "name": "فلان علان" }
    const teacherName = data.name;

    // ✅ خزنه محليًا
    saveTeacherToCache(teacherID, teacherName);

    return teacherName;

  } catch (err) {
    console.error(err);
    return ""; // أو "غير معروف"
  }
}

async function onTeacherIDChange() {
  const id = document.getElementById("teacherID").value;
  if (!id) return;

  const name = await resolveTeacherName(id);

  if (name) {
    console.log("اسم المسمع:", name);
    // إن أحببت عرضه:
    // document.getElementById("teacherName").textContent = name;
  } else {
    alert("لم يتم العثور على المسمّع");
  }
}

function fetchAndStoreEmpData(teacherID) {
    if (!teacherID) {
        console.warn("⚠️ لم يتم إدخال رقم الهوية");
        return;
    }

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
    fetch(`https://g0a3378e3bd0d3a-dbcpc2023.adb.me-abudhabi-1.oraclecloudapps.com/ords/cpcws/qmc/employees/${teacherID}`)
      .then(response => response.json())
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
              
              tx.oncomplete = () => {
                  console.log("✅ تم جلب البيانات من السيرفر وتخزينها");
                  displayEmpData(empRecord);
              };
          } else {
              console.warn("⚠️ لم يتم العثور على بيانات في السيرفر");
          }
      })
      .catch(err => console.error("❌ خطأ في الاتصال:", err));
}

// دالة موحدة لعرض البيانات في الواجهة
function displayEmpData(data) {
    document.getElementById("empName").textContent = data.EMP_NAME || data.emp_name;
    document.getElementById("centerInfo").textContent = `${data.CENTER_NO} - ${data.CENTER_NAME}`;
    document.getElementById("circleInfo").textContent = `${data.CIRCLE_NO} - ${data.CIRCLE_NAME}`;
}

function fetchAndStoreEmpData01(teacherID) {
    if (!teacherID) {
        console.warn("⚠️ لم يتم إدخال رقم الهوية");
        return;
    }

    fetch(`https://g0a3378e3bd0d3a-dbcpc2023.adb.me-abudhabi-1.oraclecloudapps.com/ords/cpcws/qmc/employees/${teacherID}`)
      .then(response => response.json())
      .then(emp => {
          if (emp && emp.emp_name) {
              const tx = db.transaction("empdata", "readwrite");
              const empStore = tx.objectStore("empdata");

              const empRecord = {
                  idno: teacherID,
                  EMP_NAME: emp.emp_name,
                  CENTER_NO: emp.center_no,
                  CENTER_NAME: emp.center_name,
                  CIRCLE_NO: emp.circle_no,
                  CIRCLE_NAME: emp.circle_name
              };

              empStore.put(empRecord);

              tx.oncomplete = () => {
                  console.log("✅ تم تخزين بيانات الموظف بنجاح في empStore");
                  // عرض البيانات في الصفحة
              document.getElementById("empName").textContent = emp.emp_name;
              document.getElementById("centerInfo").textContent = `${emp.center_no} - ${emp.center_name}`;
              document.getElementById("circleInfo").textContent = `${emp.circle_no} - ${emp.circle_name}`;

              };

              tx.onerror = (err) => {
                  console.error("❌ خطأ أثناء التخزين:", err);
              };
          } else {
              console.warn("⚠️ لم يتم العثور على بيانات لهذا الرقم");
          }
      })
      .catch(err => console.error("❌ خطأ في جلب البيانات:", err));
}

async function inspectFullDatabase() {
    const container = document.getElementById("db-viewer-content");
    container.innerHTML = "🔄 جاري تحميل البيانات...";

    const request = indexedDB.open("QuranProjectDB");

    request.onerror = (e) => container.innerHTML = "❌ فشل فتح القاعدة: " + e.target.error;

    request.onsuccess = async (event) => {
        const db = event.target.result;
        const storeNames = Array.from(db.objectStoreNames);
        container.innerHTML = ""; // مسح رسالة التحميل

        for (const storeName of storeNames) {
            // إنشاء قسم لكل متجر
            const section = document.createElement("div");
            section.className = "store-section";
            section.innerHTML = `<h3 class="store-title">📦 مخزن: ${storeName}</h3>`;
            
            const table = document.createElement("table");
            const data = await getAllDataFromStore(db, storeName);

            if (data.length === 0) {
                section.innerHTML += `<p class="empty-msg">لا توجد بيانات في هذا المخزن.</p>`;
            } else {
                // إنشاء رؤوس الجدول بناءً على مفاتيح أول كائن
                const keys = Object.keys(data[0]);
                let thead = `<thead><tr>${keys.map(k => `<th>${k}</th>`).join('')}</tr></thead>`;
                let tbody = `<tbody>${data.map(row => 
                    `<tr>${keys.map(k => `<td>${JSON.stringify(row[k])}</td>`).join('')}</tr>`
                ).join('')}</tbody>`;
                
                table.innerHTML = thead + tbody;
                section.appendChild(table);
            }
            container.appendChild(section);
        }
    };
}

// دالة مساعدة لجلب البيانات من مخزن معين
function getAllDataFromStore(db, storeName) {
    return new Promise((resolve) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve([]);
    });
}

function handleLogout() {
    if (confirm("هل تريد تسجيل الخروج؟")) {
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

async function handleLogout01() {
    if (!confirm("هل أنت متأكد من تسجيل الخروج؟ سيتم مسح الإعدادات فقط.")) return;

    // 1. حذف عناصر محددة من LocalStorage
    localStorage.removeItem("teacherID");
    localStorage.removeItem("user_name");
    localStorage.removeItem("device_id");

    // 2. تفريغ مخزن settings في IndexedDB
    const request = indexedDB.open("QuranProjectDB"); // يفتح آخر إصدار متاح تلقائياً

    request.onsuccess = (event) => {
        const db = event.target.result;
        
        // التحقق من وجود المخزن قبل محاولة مسحه لتجنب الأخطاء
        if (db.objectStoreNames.contains("settings")) {
            const transaction = db.transaction("settings", "readwrite");
            const store = transaction.objectStore("settings");
            
            const clearRequest = store.clear(); // تفريغ البيانات داخل المخزن

            clearRequest.onsuccess = () => {
                console.log("✅ تم تفريغ الإعدادات بنجاح");
                window.location.replace("login.html");
            };

            clearRequest.onerror = () => {
                console.error("❌ فشل تفريغ الإعدادات");
                window.location.replace("login.html");
            };
        } else {
            // إذا لم يكن المخزن موجوداً أصلاً، ننتقل لصفحة الدخول
            window.location.replace("login.html");
        }
    };

    request.onerror = (err) => {
        console.error("❌ فشل فتح القاعدة للمسح:", err);
        window.location.replace("login.html");
    };
}

function migrateOldRecords() {
    // 1. التحقق هل قمنا بالتحديث سابقاً؟ (لتجنب التكرار)
    if (localStorage.getItem("is_sortOrder_fixed") === "true") return;

    console.log("🚀 جاري تحديث السجلات القديمة للمستخدم...");

    const tx = db.transaction("records", "readwrite");
    const store = tx.objectStore("records");
    const cursorRequest = store.openCursor();

    cursorRequest.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const record = cursor.value;

            // إذا كان الحقل مفقوداً، نقوم بحقنه
            if (record.sortOrder === undefined || record.sortOrder === null) {
                const typeVal = parseInt(record.type);
                const activityInfo = STATIC_LOOKUP.find(
                    i => i.LOOKUP_MEANING_CODE === "RECITATION_ATTENDANCE_TYPE" 
                      && parseInt(i.LOOKUP_VALUE) === typeVal
                );

                record.sortOrder = activityInfo?.SORT_ORDER ?? 999;
                cursor.update(record);
            }
            cursor.continue();
        }
    };

    tx.oncomplete = () => {
        console.log("✅ تم تحديث جميع السجلات بنجاح.");
        // 2. وضع علامة بأنه تم الانتهاء من هذا الجهاز للأبد
        localStorage.setItem("is_sortOrder_fixed", "true");
    };

    tx.onerror = (err) => console.error("❌ فشل تحديث السجلات:", err);
}

async function pullRecordsFromServer() {
    const puserName = localStorage.getItem("user_name");
    const syncContainer = document.getElementById("syncBtnContainer");

    if (!puserName) {
        console.warn("⚠️ لا يوجد اسم مستخدم مسجل لسحب البيانات.");
        return;
    }

    // 1. إظهار رسالة "جاري التحديث" في الحاوية
    if (syncContainer) {
        syncContainer.innerHTML = `<span id="pullStatus" style="margin-inline-end:10px; color:#3498db; font-weight:bold;">🔄 جاري تحديث بيانات الحلقة...</span>`;
    }

    try {
        const url = `https://g0a3378e3bd0d3a-dbcpc2023.adb.me-abudhabi-1.oraclecloudapps.com/ords/cpcws/qmc/circleActivity/${puserName}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error("فشل الاتصال بالسيرفر");
        
        const data = await response.json();
        const remoteRecords = data.items || [];

        const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open("QuranProjectDB");
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        const tx = db.transaction("records", "readwrite");
        const store = tx.objectStore("records");
        const index = store.index("student_date_type");

        for (const remote of remoteRecords) {
            // 2. تنظيف البيانات ومعالجة مشكلة "الاسم لا يظهر"
            const cleanDate = String(remote.date).replace(/[\\"]/g, '').trim();
            const cleanTeacherId = String(remote.teacher).replace(/[\\"]/g, '').trim();
            
            // 💡 ملاحظة: السيرفر يرسل الحقل غالباً كـ teachername (حروف صغيرة)
            const rawName = remote.teachername || remote.teacherName || remote.TEACHERNAME || "";
            const cleanTeacherName = String(rawName).replace(/[\\"]/g, '').trim();

            const recordToSave = {
                student:     Number(remote.student),
                date:        cleanDate,
                type:        Number(remote.type),
                teacher:     cleanTeacherId,
                teacherName: cleanTeacherName || cleanTeacherId, // استخدام الرقم إذا غاب الاسم
                fromRange:   Number(remote.fromrange || 0),
                toRange:     Number(remote.torange || 0),
                partFrom:    remote.partfrom,
                partTo:      remote.partto,
                amount:      Number(remote.amount || 0),
                rating:      remote.rating,
                errors:      Number(remote.errors || 0),
                mark:        remote.mark,
                sortOrder:   Number(remote.sortorder || 999),
                synced:      true
            };

            const localId = await new Promise((resolve) => {
                const getRequest = index.getKey([recordToSave.student, recordToSave.date, recordToSave.type]);
                getRequest.onsuccess = (e) => resolve(e.target.result);
            });

            if (localId !== undefined) {
                recordToSave.id = localId;
            } else {
                delete recordToSave.id;
            }

            store.put(recordToSave);
        }

        await new Promise((resolve) => {
            tx.oncomplete = resolve;
        });

        // 3. طباعة النجاح في الحاوية
        if (syncContainer) {
            const statusEl = document.getElementById("pullStatus");
            if (statusEl) {
                statusEl.style.color = "#27ae60";
                statusEl.innerHTML = `✅ تم تحديث ${remoteRecords.length} سجل بنجاح.`;
                // إخفاء الرسالة بعد 5 ثوانٍ
                setTimeout(() => { statusEl.style.opacity = '0'; setTimeout(()=>statusEl.remove(), 1000); }, 5000);
            }
        }

        if (typeof refreshAll === "function") refreshAll();

    } catch (err) {
        console.error("❌ خطأ:", err);
        if (syncContainer) {
            const statusEl = document.getElementById("pullStatus");
            if (statusEl) {
                statusEl.style.color = "#e74c3c";
                statusEl.innerHTML = `❌ فشل التحديث.`;
            }
        }
    }
}


async function pullRecordsFromServer00() {
    const puserName = localStorage.getItem("user_name");
    if (!puserName) {
        console.warn("⚠️ لا يوجد اسم مستخدم مسجل لسحب البيانات.");
        return;
    }

    // إظهار رسالة للمستخدم (اختياري)
    console.log("📥 جاري سحب بيانات الحلقة من السيرفر...");

    try {
        // الرابط الصحيح مع تمرير المتغير برمجياً
        const url = `https://g0a3378e3bd0d3a-dbcpc2023.adb.me-abudhabi-1.oraclecloudapps.com/ords/cpcws/qmc/circleActivity/${puserName}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error("فشل الاتصال بالسيرفر");
        
        const data = await response.json();
        const remoteRecords = data.items || [];

        // فتح قاعدة البيانات المحلية
        const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open("QuranProjectDB");
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        const tx = db.transaction("records", "readwrite");
        const store = tx.objectStore("records");
        const index = store.index("student_date_type");

        for (const remote of remoteRecords) {
            // 1. تنظيف البيانات (إزالة علامات التنصيص الزائدة وتوحيد الأنواع)
            const cleanDate = String(remote.date).replace(/[\\"]/g, '').trim();
            const cleanTeacher = String(remote.teacher).replace(/[\\"]/g, '').trim();
            const cleanStudent = Number(remote.student);
            const cleanType = Number(remote.type);

            // 2. بناء كائن السجل مع تصحيح أسماء الأعمدة (Mapping) ليتوافق مع displayRecords
            const recordToSave = {
                student:   cleanStudent,
                date:      cleanDate,
                type:      cleanType,
                teacher:   cleanTeacher,
                teacherName:remote.teacherName,
                // ربط الحقول القادمة من السيرفر (lowercase) بالحقول المطلوبة في التطبيق (camelCase)
                fromRange: Number(remote.fromrange || 0),
                toRange:   Number(remote.torange || 0),
                partFrom:  remote.partfrom,
                partTo:    remote.partto,
                amount:    Number(remote.amount || 0),
                rating:    remote.rating,
                errors:    Number(remote.errors || 0),
                sortOrder: Number(remote.sortorder || 999),
                mark: remote.mark,
                synced:    true // علامة النجاح لأنها قادمة من السيرفر
            };

            // 3. البحث باستخدام الفهرس الفريد لمنع التكرار
            const localId = await new Promise((resolve) => {
                const getRequest = index.getKey([cleanStudent, cleanDate, cleanType]);
                getRequest.onsuccess = (e) => resolve(e.target.result);
            });

            if (localId !== undefined) {
                // تحديث السجل الموجود بنفس المعرف المحلي
                recordToSave.id = localId;
            } else {
                // إضافة سجل جديد (سيقوم المتصفح بتوليد id تلقائي)
                delete recordToSave.id;
            }

            store.put(recordToSave);
        }

        // انتهاء المعاملة وحفظ البيانات
        await new Promise((resolve) => {
            tx.oncomplete = resolve;
        });
        
        console.log(`✅ تم تحديث ${remoteRecords.length} سجل بنجاح.`);

        // 4. تحديث الشاشة فوراً ليرى المستخدم السجلات الجديدة
        if (typeof refreshAll === "function") {
            refreshAll();
        } else if (typeof displayRecords === "function") {
            displayRecords();
        }

    } catch (err) {
        console.error("❌ خطأ في مزامنة بيانات الحلقة:", err);
    }
}

async function pullRecordsFromServer01() {
    const puserName = localStorage.getItem("user_name");
    if (!puserName) return;

    try {
        const url = `https://g0a3378e3bd0d3a-dbcpc2023.adb.me-abudhabi-1.oraclecloudapps.com/ords/cpcws/qmc/circleActivity/${puserName}`;
        const response = await fetch(url);
        const data = await response.json();
        const remoteRecords = data.items || [];

        const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open("QuranProjectDB");
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        const tx = db.transaction("records", "readwrite");
        const store = tx.objectStore("records");
        const index = store.index("student_date_type");

        for (const remote of remoteRecords) {
            const localId = await new Promise(resolve => {
                const getReq = index.getKey([Number(remote.student), remote.date, Number(remote.type)]);
                getReq.onsuccess = (e) => resolve(e.target.result);
            });

            const recordToSave = { ...remote, synced: true };

            if (localId !== undefined) {
                recordToSave.id = localId; // تحديث
            } else {
                delete recordToSave.id; // إضافة جديد
            }

            store.put(recordToSave);
        }

        await new Promise(resolve => {
            tx.oncomplete = resolve;
        });

        console.log("✅ تم تحديث بيانات الحلقة بنجاح.");
        if (typeof refreshAll === "function") refreshAll();

    } catch (err) {
        console.error("❌ خطأ في الوصول للسيرفر:", err);
    }
}
function shareAsWhatsAppText() {
    const dateInput = document.getElementById("filterDate").value;
    if (!dateInput) return alert("⚠️ يرجى اختيار التاريخ");

    const selectedDate = new Date(dateInput);
    const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    let msg = `*تقرير تسميع يوم ${days[selectedDate.getDay()]} (${dateInput})* 😇\n`;
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
        const mark    = parseFloat(cols[8].innerText.trim()) || 0; // العلامة

        let line = `( *${student}* ) ${type}`;

        // 1. الأنواع التي تتطلب (من - إلى)
        const rangeTypes = ["تسميع", "مراجعة", "اختبار جزء", "سرد"];
        if (rangeTypes.includes(type)) {
            line += ` من ${fromP} إلى ${toP}`;
        }

        // 2. شروط التقدير والعلامة
        if (type === "تسميع" || type === "مراجعة") {
            line += ` بتقدير *${eval}*`;
        } 
        else if (type === "اختبار جزء" || type === "سرد") {
            // العلامة أكبر من 100 تعرض العلامة، وإلا التقدير
            if (mark >= 100) {
                line += ` بعلامة *${mark}*`;
            } else if (eval) {
                line += ` بتقدير *${eval}*`;
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
