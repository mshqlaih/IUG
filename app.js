const QURAN_SURAHS = ["الفاتحة","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة","يونس","هود","يوسف","الرعد","إبراهيم","الحجر","النحل","الإسراء","الكهف","مريم","طه","الأنبياء","الحج","المؤمنون","النور","الفرقان","الشعراء","النمل","القصص","العنكبوت","الروم","لقمان","السجدة","الأحزاب","سبأ","فاطر","يس","الصافات","ص","الزمر","غافر","فصلت","الشورى","الزخرف","الدخان","الجاثية","الأحقاف","محمد","الفتح","الحجرات","ق","الذاريات","الطور","النجم","القمر","الرحمن","الواقعة","الحديد","المجادلة","الحشر","الممتحنة","الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك","القلم","الحاقة","المعارج","نوح","الجن","المزمل","المدثر","القيامة","الإنسان","المرسلات","النبأ","النازعات","عبس","التكوير","الانفطار","المطففين","الانشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد","الشمس","الليل","الضحى","الشرح","التين","العلق","القدر","البينة","الزلزلة","العاديات","القارعة","التكاثر","العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون","النصر","المسد","الإخلاص","الفلق","الناس"];

// اسم قاعدة بيانات ثابت لا يتغير
const DB_NAME = "QuranProjectDB";
let db;

window.onload = () => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains("students")) db.createObjectStore("students", { keyPath: "id" });
        if (!db.objectStoreNames.contains("records")) db.createObjectStore("records", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = (e) => { db = e.target.result; refreshAll(); };
    fillSurahs();
    document.getElementById('activityDate').valueAsDate = new Date();
    const savedID = localStorage.getItem('teacherID');
    if(savedID) document.getElementById('teacherID').value = savedID;
};

function saveTeacherID() { localStorage.setItem('teacherID', document.getElementById('teacherID').value); alert("تم الحفظ"); }

function fillSurahs() {
    const s = document.getElementById('surahSelect');
    s.innerHTML = '<option value="-">بدون تحديد</option>';
    QURAN_SURAHS.forEach(name => s.innerHTML += `<option value="${name}">${name}</option>`);
}

function saveStudent() {
    const s = { id: document.getElementById('stuID').value, fName: document.getElementById('fName').value.trim(), pName: document.getElementById('pName').value.trim(), gName: document.getElementById('gName').value.trim(), lName: document.getElementById('lName').value.trim() };
    if(!s.id || !s.fName) return alert("أكمل البيانات");
    const tx = db.transaction("students", "readwrite");
    tx.objectStore("students").put(s).onsuccess = () => { refreshAll(); clearStuFields(); };
}

async function saveActivity() {
    const record = {
        teacher: document.getElementById('teacherID').value || "---",
        student: document.getElementById('studentSelect').value,
        date: document.getElementById('activityDate').value,
        type: document.getElementById('activityType').value,
        surah: document.getElementById('surahSelect').value,
        pages: `${document.getElementById('pFrom').value || 0} - ${document.getElementById('pTo').value || 0}`,
        errors: document.getElementById('errors').value || 0,
        rating: document.getElementById('rating').value
    };

    if(!record.student) return alert("اختر طالباً");

    // فحص التكرار
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
            writeTx.objectStore("records").add(record).onsuccess = () => { displayRecords(); clearActivityFields(); };
        }
    };
}

function exportToExcel() {
    try {
        // التأكد من وجود المكتبة
        if (typeof XLSX === 'undefined') {
            alert("خطأ: مكتبة التصدير لم تكتمل في التحميل، تأكد من الاتصال بالإنترنت.");
            return;
        }

        const tx = db.transaction("records", "readonly");
        const store = tx.objectStore("records");
        
        store.getAll().onsuccess = (e) => {
            const data = e.target.result;
            if (!data || data.length === 0) {
                alert("لا توجد بيانات مسجلة لتصديرها حالياً.");
                return;
            }

            // تنظيف وترتيب الأعمدة بشكل يدوي لضمان ظهورها بالعربية في إكسل
            const excelRows = data.map(r => ({
                "التاريخ": r.date,
                "رقم المسمع": r.teacher,
                "اسم الطالب": r.student,
                "نوع النشاط": r.type,
                "السورة": r.surah,
                "الصفحات": r.pages,
                "الأخطاء": r.errors,
                "التقييم": r.rating
            }));

            // إنشاء ورقة العمل
            const worksheet = XLSX.utils.json_to_sheet(excelRows);
            
            // ضبط اتجاه ورقة العمل لتكون من اليمين لليسار (RTL)
            worksheet['!dir'] = "rtl";

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "سجلات التسميع");

            // تنفيذ التحميل
            XLSX.writeFile(workbook, `سجل_تسميع_${new Date().toISOString().slice(0,10)}.xlsx`);
            
            alert("تم إنشاء ملف الإكسل بنجاح، تحقق من مجلد التحميلات (Downloads).");
        };
    } catch (err) {
        console.error(err);
        alert("حدث خطأ أثناء التصدير: " + err.message);
    }
}

function refreshAll() {
    const sel = document.getElementById('studentSelect'); sel.innerHTML = '<option value="">-- اختر --</option>';
    const list = document.getElementById('studentsList'); list.innerHTML = '';
    db.transaction("students").objectStore("students").getAll().onsuccess = (e) => {
        e.target.result.forEach(s => {
            const full = `${s.fName} ${s.pName} ${s.gName} ${s.lName}`.replace(/\s+/g, ' ').trim();
            sel.innerHTML += `<option value="${full}">${full}</option>`;
            list.innerHTML += `<tr><td>${s.id}</td><td>${full}</td><td><button style="background:#ffc107;padding:5px" onclick="editStudent('${s.id}')">✏️</button></td></tr>`;
        });
    };
    displayRecords();
}

function editStudent(id) {
    db.transaction("students").objectStore("students").get(id).onsuccess = (e) => {
        const s = e.target.result;
        ['stuID','fName','pName','gName','lName'].forEach(k => document.getElementById(k).value = s[k]);
        document.getElementById('stuID').disabled = true;
    };
}

function displayRecords() {
    const tbody = document.getElementById('logTable'); tbody.innerHTML = '';
    db.transaction("records").objectStore("records").openCursor(null, 'prev').onsuccess = (e) => {
        const cursor = e.target.result;
        if(cursor) {
            const r = cursor.value;
            tbody.innerHTML += `<tr><td>${r.date}</td><td>${r.teacher}</td><td><b>${r.student}</b></td><td>${r.type}</td><td>${r.surah}</td><td>${r.pages}</td><td>${r.errors}</td><td>${r.rating}</td><td><button class="btn-del" onclick="deleteRecord(${r.id})">حذف</button></td></tr>`;
            cursor.continue();
        }
    };
}

function deleteRecord(id) { if(confirm("حذف؟")) db.transaction("records", "readwrite").objectStore("records").delete(id).onsuccess = () => displayRecords(); }
function clearStuFields() { ['stuID','fName','pName','gName','lName'].forEach(i => document.getElementById(i).value = ''); document.getElementById('stuID').disabled = false; }
function clearActivityFields() { ['pFrom','pTo','errors'].forEach(i => document.getElementById(i).value = ''); document.getElementById('studentSelect').value = ''; }

