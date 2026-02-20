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
    const fromLabel = document.getElementById('rangeFrom').value;
    const toLabel = document.getElementById('rangeTo').value;

    const fromObj = QURAN_DATA.find(item => item.l === fromLabel);
    const toObj = QURAN_DATA.find(item => item.l === toLabel);

    if (fromObj && toObj) {
        let totalLines = 0;

        // 1. حساب إجمالي الأسطر (نفس المنطق الدقيق السابق)
        if (fromObj.p === toObj.p) {
            totalLines = Math.abs(toObj.le - fromObj.ls) + 1;
        } else {
            const startPage = Math.min(fromObj.p, toObj.p);
            const endPage = Math.max(fromObj.p, toObj.p);
            const firstPageLines = 15 - fromObj.ls + 1;
            const lastPageLines = toObj.le;
            const intermediatePages = (endPage - startPage) - 1;
            const intermediateLines = (intermediatePages > 0) ? intermediatePages * 15 : 0;
            totalLines = firstPageLines + lastPageLines + intermediateLines;
        }

        // 2. تحويل الأسطر إلى صفحات كاملة وبواقي
        let fullPages = Math.floor(totalLines / 15);
        let remainingLines = totalLines % 15;
        let fractionText = "";

        // 3. منطق التقريب إلى أرباع الصفحات
        if (remainingLines >= 1 && remainingLines <= 4) {
            fractionText = "وربع"; 
        } else if (remainingLines >= 5 && remainingLines <= 8) {
            fractionText = "ونصف";
        } else if (remainingLines >= 9 && remainingLines <= 12) {
            fractionText = "وثلاثة أرباع";
        } else if (remainingLines >= 13) {
            fullPages += 1; // جبر الكسر لصفحة كاملة
            fractionText = "";
        }

        // 4. صياغة النص النهائي بشكل جمالي
        let resultText = "";
        if (fullPages > 0) {
            resultText = `${fullPages} صفحة ${fractionText}`;
        } else {
            // إذا كان المجموع أقل من صفحة، نعرض الكسر فقط
            resultText = fractionText.replace("و", "") || `${remainingLines} أسطر`;
        }

        // تنظيف النص (مثل إزالة "وربع" إذا كانت الصفحة 0 لتصبح "ربع")
        resultText = resultText.trim();
        if (resultText === "ونصف") resultText = "نصف صفحة";
        if (resultText === "وربع") resultText = "ربع صفحة";
        if (resultText === "وثلاثة أرباع") resultText = "ثلاثة أرباع صفحة";

        document.getElementById('pagesResult').innerText = "المقدار: " + resultText;
        document.getElementById('partNumber').value = toObj.j;
        
        return { text: resultText, part: toObj.j };
    }
    return null;
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





