// استدعاء ملف Service Worker للعمل أوفلاين
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
        // التحقق مما إذا كان هناك تحديث ينتظر التفعيل
        reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // هنا يظهر التنبيه الذكي للمستخدم
                    if (confirm("تم تحميل تحديثات جديدة للنظام (إحصائيات ورادار الغياب). هل تريد التفعيل الآن؟")) {
                        location.reload(); 
                    }
                }
            };
        };
        console.log("نظام العمل أوفلاين نشط");
    }).catch(err => console.log("خطأ في التسجيل:", err));
}


if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.onupdatefound = () => {
      const installingWorker = reg.installing;
      installingWorker.onstatechange = () => {
        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // إذا وجد تحديث جديد، يظهر تنبيه للمستخدم أو يحدث تلقائياً
          if(confirm("يوجد تحديث جديد للبرنامج، هل تريد التحديث الآن؟")) {
             location.reload();
          }
        }
      };
    };
  });
}
const DB_NAME = "QuranProjectDB";
let db;

// 1. تشغيل النظام عند التحميل
window.onload = () => {
    initDB();
    fillAyatSearchList();
    document.getElementById('activityDate').valueAsDate = new Date();
    const savedID = localStorage.getItem('teacherID');
    if(savedID) document.getElementById('teacherID').value = savedID;
};

// 2. تهيئة قاعدة البيانات
function initDB() {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains("students")) db.createObjectStore("students", { keyPath: "id" });
        if (!db.objectStoreNames.contains("records")) db.createObjectStore("records", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = (e) => { db = e.target.result; refreshAll(); };
}

// ملء الـ Datalist ببيانات أوراكل (TAGNO, Page, Line)
function fillAyatSearchList() {
    const list = document.getElementById('ayatList');
    if (typeof QURAN_DATA === 'undefined') return;
    
    const fragment = document.createDocumentFragment();
    QURAN_DATA.forEach(item => {
        const option = document.createElement('option');
        option.value = item.l; // النص: سورة... آية... ص...
        fragment.appendChild(option);
    });
    list.innerHTML = "";
    list.appendChild(fragment);
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
    list.innerHTML = "";
    data.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.l;
        list.appendChild(opt);
    });
}

// 4. اختيار الطالب (القفزة الذكية + الإحصائيات)
document.getElementById('studentSelect').addEventListener('change', function() {
    const name = this.value;
    if (!name) { document.getElementById('studentStatsCard').style.display = 'none'; return; }
    
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
                const p = parseFloat(cursor.value.amount) || 0;
                if (cursor.value.type === "تسميع") hifz += p;
                else if (cursor.value.type === "مراجعة") muraja += p;
                errs += parseInt(cursor.value.errors) || 0;
                cnt++;
            }
            cursor.continue();
        } else {
            updateStatsUI(hifz, muraja, errs, cnt, lastDate);
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
function calculateExactProgress() {
    const fromObj = QURAN_DATA.find(i => i.l === document.getElementById('rangeFrom').value);
    const toObj = QURAN_DATA.find(i => i.l === document.getElementById('rangeTo').value);
    if (!fromObj || !toObj) return;

    const start = (fromObj.id <= toObj.id) ? fromObj : toObj;
    const end = (fromObj.id <= toObj.id) ? toObj : fromObj;
    let lines = (start.p === end.p) ? (end.le - start.ls + 1) : (15 - start.ls + 1) + end.le + ((end.p - start.p - 1) * 15);

    let pgs = Math.floor(lines / 15), rem = lines % 15, frac = "";
    if (rem >= 1 && rem <= 4) frac = "وربع";
    else if (rem >= 5 && rem <= 8) frac = "ونصف";
    else if (rem >= 9 && rem <= 12) frac = "وثلاثة أرباع";
    else if (rem >= 13) { pgs++; rem = 0; }

    let res = pgs > 0 ? `${pgs} صفحة ${frac}` : (frac.replace("و","") || "أقل من ربع");
    document.getElementById('pagesResult').innerText = "المقدار: " + res.trim();
    document.getElementById('partNumber').innerText = toObj.j;
    return { text: res.trim(), part: toObj.j };
}

// 6. حفظ النشاط
function saveActivity() {
    const prog = calculateExactProgress();
    const record = {
        teacher: document.getElementById('teacherID').value || "---",
        student: document.getElementById('studentSelect').value,
        date: document.getElementById('activityDate').value,
        type: document.getElementById('activityType').value,
        flowDirection: document.getElementById('flowDirection').value,
        fromRange: document.getElementById('rangeFrom').value,
        toRange: document.getElementById('rangeTo').value,
        amount: prog ? prog.text : "---",
        part: prog ? prog.part : "---",
        errors: document.getElementById('errors').value || 0,
        rating: document.getElementById('rating').value
    };
    if(!record.student || !record.fromRange) return alert("أكمل البيانات");

    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").add(record).onsuccess = () => { refreshAll(); alert("تم الحفظ"); };
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
    const s = { id: document.getElementById('stuID').value, fName: document.getElementById('fName').value, pName: document.getElementById('pName').value, gName: document.getElementById('gName').value, lName: document.getElementById('lName').value };
    db.transaction("students", "readwrite").objectStore("students").put(s).onsuccess = () => { refreshAll(); alert("تم الحفظ"); };
}

function refreshAll() {
    const sel = document.getElementById('studentSelect'); sel.innerHTML = '<option value="">-- اختر --</option>';
    const list = document.getElementById('studentsList'); list.innerHTML = '';
    db.transaction("students").objectStore("students").getAll().onsuccess = (e) => {
        e.target.result.forEach(s => {
            const full = `${s.fName} ${s.pName} ${s.gName} ${s.lName}`.replace(/\s+/g, ' ').trim();
            sel.innerHTML += `<option value="${full}">${full}</option>`;
            list.innerHTML += `<tr><td>${s.id}</td><td>${full}</td><td><button onclick="editStudent('${s.id}')">✏️</button></td></tr>`;
        });
    };
    displayRecords();
}

document.getElementById('filterDate').valueAsDate = new Date();

function displayRecords() {
    const tbody = document.getElementById('logTable');
    tbody.innerHTML = '';
    
    const fDate = document.getElementById('filterDate').value;
    const fID = document.getElementById('filterStudentID').value;

    // جلب قائمة الطلاب أولاً لربط الهوية بالاسم في الفلترة
    db.transaction("students").objectStore("students").getAll().onsuccess = (e) => {
        const studentsMap = {};
        e.target.result.forEach(s => {
            const fullName = `${s.fName} ${s.pName} ${s.gName} ${s.lName}`.replace(/\s+/g, ' ').trim();
            studentsMap[fullName] = s.id;
        });

        // البدء بقراءة السجلات
        db.transaction("records").objectStore("records").openCursor(null, 'prev').onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                const r = cursor.value;
                const studentID = studentsMap[r.student] || "";

                // منطق الفلترة المزدوج
                const matchesDate = !fDate || r.date === fDate;
                const matchesID = !fID || studentID.includes(fID);

                if (matchesDate && matchesID) {
                    tbody.innerHTML += `<tr>
                        <td>${r.date}</td>
                        <td>${r.teacher}</td>
                        <td><b>${r.student}</b> <br><small class="text-muted">(${studentID})</small></td>
                        <td><span class="badge">${r.type}</span></td>
                        <td style="font-size:11px">${r.fromRange}</td>
                        <td style="font-size:11px">${r.toRange}</td>
                        <td style="color:var(--secondary); font-weight:bold">${r.amount}</td>
                        <td>${r.errors}</td>
                        <td>${r.rating}</td>
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
function saveTeacherID() { localStorage.setItem('teacherID', document.getElementById('teacherID').value); alert("تم الحفظ"); }

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
        if(d.students) d.students.forEach(s => tx.objectStore("students").put(s));
        if(d.records) d.records.forEach(r => tx.objectStore("records").add(r));
        tx.oncomplete = () => { alert("تم الاستيراد"); location.reload(); };
    };
    reader.readAsText(input.files[0]);
}

function exportToExcel() {
    db.transaction("records").objectStore("records").getAll().onsuccess = e => {
        const ws = XLSX.utils.json_to_sheet(e.target.result);
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Records");
        XLSX.writeFile(wb, "Quran_Report.xlsx");
    };
}



