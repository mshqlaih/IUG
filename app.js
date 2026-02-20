// استدعاء ملف Service Worker للعمل أوفلاين
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => console.log("جاهز للعمل أوفلاين"));
}

const DB_NAME = "QuranProjectDB";
let db;

window.onload = () => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains("students")) db.createObjectStore("students", { keyPath: "id" });
        if (!db.objectStoreNames.contains("records")) db.createObjectStore("records", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = (e) => { 
        db = e.target.result; 
        refreshAll(); 
    };
    
    // ملء قائمة البحث الذكي من بيانات أوراكل المدمجة في quran_data.js
    fillAyatSearchList();
    
    document.getElementById('activityDate').valueAsDate = new Date();
    const savedID = localStorage.getItem('teacherID');
    if(savedID) document.getElementById('teacherID').value = savedID;
};

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

// دالة الحساب الدقيق بالأسطر والصفحات
function calculateExactProgress() {
    const fromObj = QURAN_DATA.find(item => item.l === document.getElementById('rangeFrom').value);
    const toObj = QURAN_DATA.find(item => item.l === document.getElementById('rangeTo').value);

    if (fromObj && toObj) {
        // ترتيب المصحف لضمان حساب المسافة دوماً
        const start = (fromObj.id <= toObj.id) ? fromObj : toObj;
        const end = (fromObj.id <= toObj.id) ? toObj : fromObj;

        let totalLines = 0;

        if (start.p === end.p) {
            totalLines = (end.le - start.ls) + 1;
        } else {
            // أسطر صفحة البداية + أسطر صفحة النهاية
            const edgeLines = (15 - start.ls + 1) + end.le;
            // الصفحات التي تقع بينهما تماماً (دون احتساب البداية والنهاية)
            const diff = end.p - start.p;
            const fullPagesLines = (diff > 1) ? (diff - 1) * 15 : 0;
            
            totalLines = edgeLines + fullPagesLines;
        }

        let fullPages = Math.floor(totalLines / 15);
        let rem = totalLines % 15;
        
        // التقريب لأرباع الصفحات (المعيار 15 سطر)
        let fraction = "";
        if (rem >= 1 && rem <= 4) fraction = "وربع";
        else if (rem >= 5 && rem <= 8) fraction = "ونصف";
        else if (rem >= 9 && rem <= 12) fraction = "وثلاثة أرباع";
        else if (rem >= 13) { fullPages++; rem = 0; fraction = ""; }

        let res = fullPages > 0 ? `${fullPages} صفحة ${fraction}` : (fraction.replace("و","") || "أقل من ربع");
        
        // تعديل نصي للجمالية
        res = res.trim();
        if (res === "ونصف") res = "نصف صفحة";
        if (res === "وربع") res = "ربع صفحة";
        if (res === "وثلاثة أرباع") res = "ثلاثة أرباع صفحة";

        document.getElementById('pagesResult').innerText = "المقدار: " + res;
        return { text: res, part: toObj.j };
    }
}


function saveTeacherID() { 
    localStorage.setItem('teacherID', document.getElementById('teacherID').value); 
    alert("تم الحفظ"); 
}

function saveStudent() {
    const s = { 
        id: document.getElementById('stuID').value, 
        fName: document.getElementById('fName').value.trim(), 
        pName: document.getElementById('pName').value.trim(), 
        gName: document.getElementById('gName').value.trim(), 
        lName: document.getElementById('lName').value.trim() 
    };
    if(!s.id || !s.fName) return alert("أكمل البيانات");
    const tx = db.transaction("students", "readwrite");
    tx.objectStore("students").put(s).onsuccess = () => { refreshAll(); clearStuFields(); };
}

async function saveActivity() {
    const progress = calculateExactProgress();
    
    const record = {
        teacher: document.getElementById('teacherID').value || "---",
        student: document.getElementById('studentSelect').value,
        date: document.getElementById('activityDate').value,
        type: document.getElementById('activityType').value,
        flowDirection: document.getElementById('flowDirection').value, // حفظ الاتجاه
        fromRange: document.getElementById('rangeFrom').value,
        toRange: document.getElementById('rangeTo').value,
        amount: progress ? progress.text : "---",
        part: progress ? progress.part : "---",
        errors: document.getElementById('errors').value || 0,
        rating: document.getElementById('rating').value
    };

    if(!record.student || !record.fromRange) return alert("اختر الطالب ونطاق التسميع");

    // فحص التكرار لنفس النشاط في نفس اليوم
    const tx = db.transaction("records", "readonly");
    const store = tx.objectStore("records");
    let isDuplicate = false;

    store.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if(cursor) {
            if(cursor.value.student === record.student && cursor.value.date === record.date && cursor.value.type === record.type) {
                isDuplicate = true;
            }
            cursor.continue();
        } else {
            if(isDuplicate) return alert("هذا النشاط مسجل مسبقاً لهذا الطالب اليوم");
            const writeTx = db.transaction("records", "readwrite");
            writeTx.objectStore("records").add(record).onsuccess = () => { 
                displayRecords(); 
                clearActivityFields(); 
                alert("تم الحفظ بنجاح");
            };
        }
    };
}

function exportToExcel() {
    if (typeof XLSX === 'undefined') {
        alert("خطأ: ملف المكتبة (xlsx.full.min.js) غير موجود في مجلد المشروع.");
        return;
    }

    const tx = db.transaction("records", "readonly");
    const store = tx.objectStore("records");

    store.getAll().onsuccess = (e) => {
        const data = e.target.result;
        if (!data || data.length === 0) {
            alert("لا توجد سجلات لتصديرها.");
            return;
        }

        // تنسيق البيانات للأعمدة العربية لتشمل البيانات الجديدة
        const excelRows = data.map(r => ({
            "التاريخ": r.date,
            "هوية المسمع": r.teacher,
            "اسم الطالب": r.student,
            "النشاط": r.type,
            "من": r.fromRange,
            "إلى": r.toRange,
            "المقدار المحسوب": r.amount,
            "الجزء": r.part,
            "الأخطاء": r.errors,
            "التقييم": r.rating
        }));

        const worksheet = XLSX.utils.json_to_sheet(excelRows);
        worksheet['!dir'] = "rtl"; 

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "سجل التسميع");

        XLSX.writeFile(workbook, `Quran_Detailed_Records_${new Date().getTime()}.xlsx`);
    };
}

function refreshAll() {
    const sel = document.getElementById('studentSelect'); 
    sel.innerHTML = '<option value="">-- اختر --</option>';
    const list = document.getElementById('studentsList'); 
    list.innerHTML = '';
    
    db.transaction("students").objectStore("students").getAll().onsuccess = (e) => {
        e.target.result.forEach(s => {
            const full = `${s.fName} ${s.pName} ${s.gName} ${s.lName}`.replace(/\s+/g, ' ').trim();
            sel.innerHTML += `<option value="${full}">${full}</option>`;
            list.innerHTML += `<tr><td>${s.id}</td><td>${full}</td><td><button style="background:#ffc107;padding:5px;border-radius:4px;border:none;cursor:pointer" onclick="editStudent('${s.id}')">✏️</button></td></tr>`;
        });
    };
    displayRecords();
}

function editStudent(id) {
    db.transaction("students").objectStore("students").get(id).onsuccess = (e) => {
        const s = e.target.result;
        ['stuID','fName','pName','gName','lName'].forEach(k => document.getElementById(k).value = s[k]);
        document.getElementById('stuID').disabled = true;
        window.scrollTo({ top: 0, behavior: 'smooth' }); // صعود للأعلى للتعديل
    };
}

function displayRecords() {
    const tbody = document.getElementById('logTable'); 
    tbody.innerHTML = '';
    
    db.transaction("records").objectStore("records").openCursor(null, 'prev').onsuccess = (e) => {
        const cursor = e.target.result;
        if(cursor) {
            const r = cursor.value;
            // عرض الأعمدة المتوافقة مع HTML الجديد (من، إلى، المقدار)
            tbody.innerHTML += `<tr>
                <td>${r.date}</td>
                <td>${r.teacher}</td>
                <td><b>${r.student}</b></td>
                <td><span class="badge">${r.type}</span></td>
                <td style="font-size:11px">${r.fromRange}</td>
                <td style="font-size:11px">${r.toRange}</td>
                <td style="color:var(--accent); font-weight:bold">${r.amount}</td>
                <td>${r.errors}</td>
                <td class="${r.rating === 'ممتاز' ? 'excellent' : ''}">${r.rating}</td>
                <td><button class="btn-del" onclick="deleteRecord(${r.id})">حذف</button></td>
            </tr>`;
            cursor.continue();
        }
    };
}

function deleteRecord(id) { 
    if(confirm("هل أنت متأكد من حذف هذا السجل؟")) {
        db.transaction("records", "readwrite").objectStore("records").delete(id).onsuccess = () => displayRecords(); 
    }
}

function clearStuFields() { 
    ['stuID','fName','pName','gName','lName'].forEach(i => document.getElementById(i).value = ''); 
    document.getElementById('stuID').disabled = false; 
}

function clearActivityFields() { 
    // تفريغ حقول النشاط وإعادة تعيين عداد المقدار
    ['rangeFrom','rangeTo','errors'].forEach(i => document.getElementById(i).value = ''); 
    document.getElementById('errors').value = 0;
    document.getElementById('studentSelect').value = ''; 
    document.getElementById('pagesResult').innerText = "المقدار: 0 صفحة و 0 أسطر";
    document.getElementById('partNumber').value = "";
    document.getElementById('activityDate').valueAsDate = new Date();
}

// 1. أتمتة البداية بناءً على آخر حفظ للطالب
document.getElementById('studentSelect').addEventListener('change', function() {
    const studentName = this.value;
    if (!studentName) return;

    const tx = db.transaction("records", "readonly");
    const store = tx.objectStore("records");
    
    // البحث عن آخر سجل لهذا الطالب
    store.openCursor(null, 'prev').onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            if (cursor.value.student === studentName) {
                const lastRecord = cursor.value;
                const lastToRange = lastRecord.toRange;
                
                // 1. تذكر اتجاه السير الأخير وضبط القائمة المنسدلة تلقائياً
                const lastDir = lastRecord.flowDirection || "forward";
                document.getElementById('flowDirection').value = lastDir;

                // 2. البحث عن الكائن المرتبط بآخر آية
                const lastAyahObj = QURAN_DATA.find(item => item.l === lastToRange);
                
                if (lastAyahObj) {
                    // 3. تنفيذ القفزة بناءً على الاتجاه المتذكر
                    let nextId = (lastDir === "forward") ? lastAyahObj.id + 1 : lastAyahObj.id - 1;

                    const nextAyahObj = QURAN_DATA.find(item => item.id === nextId);
                    
                    if (nextAyahObj) {
                        document.getElementById('rangeFrom').value = nextAyahObj.l;
                    } else {
                        document.getElementById('rangeFrom').value = lastAyahObj.l;
                    }
                }
                
                calculateExactProgress();
                return; 
            }
            cursor.continue();
        } else {
            // طالب جديد: افتراضي للأمام والحقول فارغة
            document.getElementById('flowDirection').value = "forward";
            document.getElementById('rangeFrom').value = "";
        }
    };
});




// 2. محرك البحث الذكي (دعم الاختصارات)
// ربط الحقول بمحرك البحث
document.getElementById('rangeFrom').addEventListener('input', (e) => handleSmartSearch(e.target));
document.getElementById('rangeTo').addEventListener('input', (e) => handleSmartSearch(e.target));

function handleSmartSearch(inputEl) {
    const val = inputEl.value.trim();
    if (val.length < 1) return;

    // تنظيف النص للبحث المرن (تجاهل "سورة" و "ال")
    const searchVal = val.replace("سورة ", "").replace(/^ال/, "");

    const filtered = QURAN_DATA.filter(item => {
        const cleanLabel = item.l.replace("سورة ", "").replace(/^ال/, "");
        return cleanLabel.includes(searchVal) || item.l.includes(val);
    }).slice(0, 30);

    renderOptions(filtered, val); // نرسل القيمة المكتوبة للدالة
}

function renderOptions(data, currentVal) {
    const list = document.getElementById('ayatList');
    list.innerHTML = ""; 
    
    data.forEach(item => {
        const option = document.createElement('option');
        // السر هنا: نجعل الـ value هو النص الكامل (للحفظ) 
        // والـ label أو الـ text هو ما يراه المستخدم
        option.value = item.l; 
        
        // إذا كان المستخدم كتب "البقرة 155" والنص هو "سورة البقرة آية 155"
        // المتصفح سيظهره لأننا نستخدم "includes" برمجياً
        list.appendChild(option);
    });
}


function updateDatalist(data) {
    const list = document.getElementById('ayatList');
    list.innerHTML = ""; // تفريغ القديم
    const frag = document.createDocumentFragment();
    
    data.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.l;
        frag.appendChild(opt);
    });
    list.appendChild(frag);
}
















