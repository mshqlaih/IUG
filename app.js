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

// 1. تشغيل النظام عند التحميل
window.onload = () => {
    initDB()
    fillAyatSearchList();
    document.getElementById('activityDate').valueAsDate = new Date();
    const savedID = localStorage.getItem('teacherID');
    if(savedID) document.getElementById('teacherID').value = savedID;
    // استدعاء الدالة عند تحميل التطبيق
    
};

// 2. تهيئة قاعدة البيانات
function initDB() {
    const request = indexedDB.open(DB_NAME, 3); // الإصدار الجديد
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
    };

    request.onsuccess = (e) => {
        db = e.target.result;
        refreshAll();
        normalizeRecords();
    };
}

// ملء الـ Datalist ببيانات أوراكل (TAGNO, Page, Line)
function fillAyatSearchList() {
    const list = document.getElementById('ayatList');
    window.AYAH_REVERSE = {};
    if (typeof QURAN_DATA === 'undefined') return;
    
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

// مثال استخدام: بناء قائمة النشاط
populateSelectFromLookups("activityType", "RECITATION_ATTENDANCE_TYPE");
populateSelectFromLookups("rating", "ACTIVITY_GRADE");

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
    window.AYAH_REVERSE = {};
    list.innerHTML = "";

    data.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.l;          // النص الظاهر للمستخدم
        opt.dataset.id = item.id;    // ✅ رقم الآية الحقيقي

         AYAH_REVERSE[item.id] = item.l;
        list.appendChild(opt);
    });
}

// 4. اختيار الطالب (القفزة الذكية + الإحصائيات)
document.getElementById('studentSelect').addEventListener('change', function() {
    const name = this.value;
    if (!name) { 
        document.getElementById('studentStatsCard').style.display = 'none'; 
        return; 
    }
    
    document.getElementById('statStudentName').innerText = name;
    document.getElementById('studentStatsCard').style.display = 'block';

    const tx = db.transaction(["records"], "readonly");
    const store = tx.objectStore("records");
    let hifz = 0, muraja = 0, errs = 0, cnt = 0, lastDate = null;

    store.openCursor(null, 'prev').onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            if (cursor.value.student === name) {
                if (!lastDate) {
                    lastDate = cursor.value.date;
                    // تنفيذ القفزة الذكية
                    jumpToNext(cursor.value.toRange, cursor.value.flowDirection || "forward");
                }

                // الآن amount يجب أن يكون رقمًا (ناتج الدالة calculateExactProgress)
                const p = parseFloat(cursor.value.amount) || 0;

                if (cursor.value.type === "تسميع") hifz += p;
                else if (cursor.value.type === "مراجعة") muraja += p;

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
            document.getElementById('hifzText').innerText   = hifzText;
            document.getElementById('murajaText').innerText = murajaText;
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
function calculateExactProgress() {
    const fromID = parseInt(document.getElementById('rangeFrom').value);
    const toID   = parseInt(document.getElementById('rangeTo').value);

    if (!fromID || !toID) return;

    const fromObj = QURAN_DATA.find(i => i.id === fromID);
    const toObj   = QURAN_DATA.find(i => i.id === toID);

    if (!fromObj || !toObj) return;

    const start = (fromObj.id <= toObj.id) ? fromObj : toObj;
    const end   = (fromObj.id <= toObj.id) ? toObj   : fromObj;

    let lines = (start.p === end.p)
        ? (end.le - start.ls + 1)
        : (15 - start.ls + 1) + end.le + ((end.p - start.p - 1) * 15);

    let pgs = Math.floor(lines / 15),
        rem = lines % 15,
        frac = 0;

    if (rem >= 1 && rem <= 4) frac = 0.25;
    else if (rem >= 5 && rem <= 8) frac = 0.5;
    else if (rem >= 9 && rem <= 12) frac = 0.75;
    else if (rem >= 13) { pgs++; rem = 0; }

    let numericValue = pgs + frac;

    // عرض القيمة الرقمية فقط
    document.getElementById('pagesResult').innerText = "المقدار: " + numericValue;
    document.getElementById('partNumber').innerText  = end.j;

    return { value: numericValue, part: end.j };
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

function saveActivity() {
    const prog = calculateExactProgress();
    const rawDate = document.getElementById('activityDate').value;
    const onlyDate = new Date(rawDate).toISOString().split("T")[0];

    const teacher = parseInt(document.getElementById('teacherID').value) || null;
    const student = parseInt(document.getElementById('studentSelect').value) || null;
    const type    = parseInt(document.getElementById('activityType').value) || null;
    const rating    = parseInt(document.getElementById('rating').value) || null;

    // ✅ الآن القيمة رقم ID فقط
    const fromRange = parseInt(document.getElementById('rangeFrom').value) || null;
    const toRange   = parseInt(document.getElementById('rangeTo').value) || null;

    if (!teacher || !student || !type) {
        return alert("يجب إدخال المعلم والطالب ونوع النشاط");
    }
    if ((type === "تسميع" || type === "مراجعة") && (!fromRange || !toRange)) {
        return alert("يجب اختيار آيات صحيحة من القائمة");
    }

    const record = {
        teacher: teacher || "---",
        student: student,
        date: onlyDate,
        type: type,
   //     flowDirection: document.getElementById('flowDirection').value,

        fromRange: fromRange,  
        toRange: toRange,

        amount: prog ? prog.value : 0,   // ✅ نخزن الرقم
        part: prog ? prog.part : "---",
        errors: document.getElementById('errors').value || 0,
        rating: rating,
        synced: false
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
                alert("تم الحفظ");

                navigator.serviceWorker.ready.then(reg => {
                    reg.sync.register('sync-records');
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

function displayRecords() {
    const tbody = document.getElementById('logTable');
    tbody.innerHTML = '';
    
    const fDate = document.getElementById('filterDate').value;
    const fID = document.getElementById('filterStudentID').value;

    db.transaction("students").objectStore("students").getAll().onsuccess = (e) => {
        const studentsMap = {};
        e.target.result.forEach(s => {
            const fullName = `${s.fName} ${s.pName} ${s.gName} ${s.lName}`.replace(/\s+/g, ' ').trim();
            studentsMap[s.id] = fullName;
        });

        db.transaction("records").objectStore("records").openCursor(null, 'prev').onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                const r = cursor.value;
                const studentName = studentsMap[r.student] || "";

                const matchesDate = !fDate || r.date === fDate;
                const matchesID = !fID || r.student.includes(fID);

                if (matchesDate && matchesID) {
                    const fromText = AYAH_REVERSE[r.fromRange] || r.fromRange || "";
                    const toText   = AYAH_REVERSE[r.toRange]   || r.toRange   || "";
                    const errorText = extractArabicError(r.syncError);

                    // تحويل القيمة إلى نص للمطابقة مع JSON
const typeKey = String(r.type);

// إذا كانت القيمة نصية (مثلاً "تسميع") نعرضها كما هي
// وإذا كانت رقمًا نبحث عن المسمى في الثوابت
const activityName = translateLookup("RECITATION_ATTENDANCE_TYPE", r.type);
const ratingName = translateLookup("ACTIVITY_GRADE",r.rating);
                    tbody.innerHTML += `
                        <tr>
                            <td>${r.date}</td>
                            <td>${r.teacher}</td>
                            <td><b>${studentName}</b><br><small class="text-muted">(${r.student})</small></td>
                            <td><span class="badge">${activityName}</span></td>
                            <td style="font-size:11px">${fromText}</td>
                            <td style="font-size:11px">${toText}</td>
                            <td style="color:var(--secondary); font-weight:bold">${r.amount}</td>
                            <td>${r.errors}</td>
                            <td>${ratingName}</td>
                            <td>
                                  ${r.synced 
                                    ? '<span style="color:green">✔ تم الرفع</span>' 
                                    : '<span style="color:red">✘ لم يُرفع</span>'
                                  }</br>
                                  ${errorText}
                            </td>
                            <td><button class="btn-del" onclick="deleteRecord(${r.id})">حذف</button></td>
                        </tr>`;
                }
                cursor.continue();
            }
        };
    };
}
function displayRecords01() {
    const tbody = document.getElementById('logTable');
    tbody.innerHTML = '';
    
    const fDate = document.getElementById('filterDate').value;
    const fID = document.getElementById('filterStudentID').value;

    // جلب الطلاب أولاً
    db.transaction("students").objectStore("students").getAll().onsuccess = (e) => {
        const studentsMap = {};
        e.target.result.forEach(s => {
            const fullName = `${s.fName} ${s.pName} ${s.gName} ${s.lName}`.replace(/\s+/g, ' ').trim();
            studentsMap[s.id] = fullName;
        });

        // قراءة السجلات
        db.transaction("records").objectStore("records").openCursor(null, 'prev').onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                const r = cursor.value;

                const studentName = studentsMap[r.student] || "";

                const matchesDate = !fDate || r.date === fDate;
                const matchesID = !fID || r.student.includes(fID);

                if (matchesDate && matchesID) {

                    // ✅ تحويل ID → نص باستخدام AYAH_REVERSE
                    const fromText = AYAH_REVERSE[r.fromRange] || r.fromRange || "";
                    const toText   = AYAH_REVERSE[r.toRange]   || r.toRange   || "";
                    const errorText = extractArabicError(r.syncError);
                    tbody.innerHTML += `
                        <tr>
                            <td>${r.date}</td>
                            <td>${r.teacher}</td>
                            <td><b>${studentName}</b><br><small class="text-muted">(${r.student})</small></td>
                            <td><span class="badge">${r.type}</span></td>
                            
                            <td style="font-size:11px">${fromText}</td>
                            <td style="font-size:11px">${toText}</td>
                            
                            <td style="color:var(--secondary); font-weight:bold">${r.amount}</td>
                            <td>${r.errors}</td>
                            <td>${r.rating}</td>
                            <td>
                                  ${r.synced 
                                    ? '<span style="color:green">✔ تم الرفع</span>' 
                                    : '<span style="color:red">✘ لم يُرفع</span>'
                                  }</br>
                                  ${errorText}
                            </td>
                            <td><button class="btn-del" onclick="deleteRecord(${r.id})">حذف</button></td>
                        </tr>`;
                }

                cursor.continue();
            }
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
    const data = { students: await getAll("students"), records: await getAll("records"), teacherID: localStorage.getItem('teacherID') };
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

function exportToExcel() {
  const txRecords = db.transaction("records", "readonly").objectStore("records").getAll();
  txRecords.onsuccess = e => {
    const records = e.target.result;

    const txStudents = db.transaction("students", "readonly").objectStore("students").getAll();
    txStudents.onsuccess = s => {
      const students = s.target.result;

      const mergedData = records.map(record => {
        const student = students.find(st => st.id === record.student);
        const studentName = student
          ? `${student.fName} ${student.pName} ${student.gName} ${student.lName}`
          : "غير معروف";

        // ✨ جلب تفاصيل الآيات من QURAN_DATA
        const fromInfo = QURAN_DATA.find(a => a.id === record.fromRange);
        const toInfo   = QURAN_DATA.find(a => a.id === record.toRange);

        // استخراج اسم السورة من النص الكامل (l) أو من جدول أسماء السور
        const fromSurahName = fromInfo ? fromInfo.l.split(" ")[1] : "";
        const toSurahName   = toInfo   ? toInfo.l.split(" ")[1]   : "";

        const fromText = fromInfo ? `${fromSurahName} (${fromInfo.a})` : record.fromRange;
        const toText   = toInfo   ? `${toSurahName} (${toInfo.a})`     : record.toRange;

        return {
          "رقم السجل": record.id,
          "اسم الطالب": studentName,
          "المعلم": record.teacher,
          "التاريخ": record.date,
          "النوع": record.type,
          "الاتجاه": record.flowDirection,
          "الجزء": record.part,
          "من الآية": fromText,
          "إلى الآية": toText,
          "التقييم": record.rating,
          "المقدار": record.amount,
          "الأخطاء": record.errors,
          "الحالة": record.synced 
            ? "✔ تم الرفع" 
            : "✘ لم يُرفع"
        };
      });

      const ws = XLSX.utils.json_to_sheet(mergedData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Records");

      XLSX.writeFile(wb, "Quran_Report.xlsx");
    };
  };
}

function exportToExcel01() {
    db.transaction("records").objectStore("records").getAll().onsuccess = e => {
        const ws = XLSX.utils.json_to_sheet(e.target.result);
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Records");
        XLSX.writeFile(wb, "Quran_Report.xlsx");
    };
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
function extractArabicError(errorText) {
  if (!errorText) return "";

  // 🔎 البحث عن جميع النصوص العربية (مع الترقيم)
  const matches = errorText.match(/[\u0600-\u06FF\s،؟!ـ]+/g);

  if (matches && matches.length > 0) {
    return matches.join(" ").trim(); // إرجاع كل النصوص العربية مجمعة
  } else {
    return errorText; // إذا لم يوجد نص عربي، إرجاع النص كامل
  }
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

