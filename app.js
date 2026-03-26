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
    const request = indexedDB.open(DB_NAME, 2); // غيّر رقم الإصدار ليتفعّل onupgradeneeded
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

        // إنشاء الفهرس المركب إذا لم يكن موجود
        if (!store.indexNames.contains("student_date_type")) {
            store.createIndex("student_date_type", ["student", "date", "type"], { unique: true });
        }
    };

    request.onsuccess = (e) => {
        db = e.target.result;
        refreshAll();
    };
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
    const rawDate = document.getElementById('activityDate').value;
    const onlyDate = new Date(rawDate).toISOString().split("T")[0]; // التاريخ فقط

    const teacher = document.getElementById('teacherID').value;
    const student = document.getElementById('studentSelect').value;
    const type = document.getElementById('activityType').value;
    const fromRange = document.getElementById('rangeFrom').value;
    const toRange = document.getElementById('rangeTo').value;

    // تحقق من الحقول الأساسية
    if (!teacher || !student || !type) {
        return alert("يجب إدخال المعلم والطالب ونوع النشاط");
    }

    // تحقق من الحقول الإضافية إذا كان النوع تسميع أو مراجعة
    if ((type === "تسميع" || type === "مراجعة") && (!fromRange || !toRange)) {
        return alert("يجب إدخال من وإلى في حالة النشاط تسميع أو مراجعة");
    }

    const record = {
        teacher: teacher || "---",
        student: student,
        date: onlyDate, // التاريخ فقط
        type: type,
        flowDirection: document.getElementById('flowDirection').value,
        fromRange: fromRange,
        toRange: toRange,
        amount: prog ? prog.text : "---",
        part: prog ? prog.part : "---",
        errors: document.getElementById('errors').value || 0,
        rating: document.getElementById('rating').value
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
    const id = document.getElementById('stuID').value;
    const fName = document.getElementById('fName').value.trim();
    const pName = document.getElementById('pName').value.trim();
    const gName = document.getElementById('gName').value.trim();
    const lName = document.getElementById('lName').value.trim();

    // فحص رقم الهوية باستخدام الدالة الموجودة لديك
    const result = checkIDNumber(id);

    if (result !== "Y") {
        alert("❌ " + result);
        return;
    }

    // فحص أن الاسم غير فارغ
    if (!fName || !pName || !gName || !lName) {
        alert("❌ يجب إدخال جميع أجزاء الاسم (الاسم الأول، الأب، الجد، العائلة)");
        return;
    }

    // إذا كان كل شيء صحيح يتم الحفظ
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

function deleteStudentBtnClick(id) {
    if (!confirm("هل أنت متأكد من حذف هذا الطالب؟")) return;

    const tx = db.transaction("students", "readwrite");
    const store = tx.objectStore("students");

    const request = store.delete(id);

    request.onsuccess = () => {
        alert("تم حذف الطالب بنجاح.");
        loadStudents(); // إعادة تحميل القائمة لو عندك دالة عرض
    };

    request.onerror = (e) => {
        console.error("فشل الحذف:", e);
        alert("حدث خطأ أثناء الحذف.");
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










