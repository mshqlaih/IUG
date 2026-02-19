const QURAN_SURAHS = ["الفاتحة","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة","يونس","هود","يوسف","الرعد","إبراهيم","الحجر","النحل","الإسراء","الكهف","مريم","طه","الأنبياء","الحج","المؤمنون","النور","الفرقان","الشعراء","النمل","القصص","العنكبوت","الروم","لقمان","السجدة","الأحزاب","سبأ","فاطر","يس","الصافات","ص","الزمر","غافر","فصلت","الشورى","الزخرف","الدخان","الجاثية","الأحقاف","محمد","الفتح","الحجرات","ق","الذاريات","الطور","النجم","القمر","الرحمن","الواقعة","الحديد","المجادلة","الحشر","الممتحنة","الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك","القلم","الحاقة","المعارج","نوح","الجن","المزمل","المدثر","القيامة","الإنسان","المرسلات","النبأ","النازعات","عبس","التكوير","الانفطار","المطففين","الانشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد","الشمس","الليل","الضحى","الشرح","التين","العلق","القدر","البينة","الزلزلة","العاديات","القارعة","التكاثر","العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون","النصر","المسد","الإخلاص","الفلق","الناس"];

let db;

window.onload = () => {
    initDB();
    fillSurahs();
    document.getElementById('activityDate').valueAsDate = new Date();
    const savedID = localStorage.getItem('teacherID');
    if(savedID) document.getElementById('teacherID').value = savedID;
};

function initDB() {
    const request = indexedDB.open("QuranFinalV5", 1);
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        db.createObjectStore("students", { keyPath: "id" });
        db.createObjectStore("records", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = (e) => { db = e.target.result; refreshAll(); };
}

// دالة منع التكرار
async function checkDuplicate(student, date, type) {
    return new Promise((resolve) => {
        const tx = db.transaction("records", "readonly");
        const store = tx.objectStore("records");
        let found = false;
        store.openCursor().onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                if (cursor.value.student === student && cursor.value.date === date && cursor.value.type === type) {
                    found = true;
                }
                cursor.continue();
            } else {
                resolve(found);
            }
        };
    });
}

async function saveActivity() {
    const record = {
        teacher: document.getElementById('teacherID').value || "---",
        student: document.getElementById('studentSelect').value,
        date: document.getElementById('activityDate').value,
        type: document.getElementById('activityType').value,
        surah: document.getElementById('surahSelect').value,
        pages: `${document.getElementById('pFrom').value} - ${document.getElementById('pTo').value}`,
        errors: document.getElementById('errors').value || 0,
        rating: document.getElementById('rating').value
    };

    if(!record.student) return alert("اختر طالباً");

    // التحقق من تكرار نفس النشاط لنفس الطالب في نفس اليوم
    const isDuplicate = await checkDuplicate(record.student, record.date, record.type);
    if(isDuplicate) {
        return alert(`خطأ: تم تسجيل نشاط (${record.type}) لهذا الطالب بالفعل في تاريخ ${record.date}`);
    }

    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").add(record).onsuccess = () => {
        displayRecords();
        clearActivityFields();
        alert("تم الحفظ بنجاح");
    };
}

function exportToExcel() {
    const tx = db.transaction("records", "readonly");
    tx.objectStore("records").getAll().onsuccess = (e) => {
        const data = e.target.result;
        if(data.length === 0) return alert("لا توجد سجلات لتصديرها");
        
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "سجلات التسميع");
        XLSX.writeFile(workbook, `سجل_التسميع_${new Date().toLocaleDateString()}.xlsx`);
    };
}

// الدوال المساعدة (نفسها من الكود السابق)
function saveTeacherID() { localStorage.setItem('teacherID', document.getElementById('teacherID').value); alert("تم الحفظ"); }
function fillSurahs() { 
    const s = document.getElementById('surahSelect');
    s.innerHTML = '<option value="-">بدون تحديد</option>';
    QURAN_SURAHS.forEach(name => s.innerHTML += `<option value="${name}">${name}</option>`);
}
function saveStudent() {
    const s = { id: document.getElementById('stuID').value, fName: document.getElementById('fName').value.trim(), pName: document.getElementById('pName').value.trim(), gName: document.getElementById('gName').value.trim(), lName: document.getElementById('lName').value.trim() };
    if(!s.id || !s.fName) return alert("أكمل البيانات");
    db.transaction("students", "readwrite").objectStore("students").put(s).onsuccess = () => { refreshAll(); clearStuFields(); };
}
function editStudent(id) {
    db.transaction("students").objectStore("students").get(id).onsuccess = (e) => {
        const s = e.target.result;
        ['stuID','fName','pName','gName','lName'].forEach(k => document.getElementById(k).value = s[k]);
        document.getElementById('stuID').disabled = true;
        window.scrollTo(0,0);
    };
}
function refreshAll() {
    const sel = document.getElementById('studentSelect'); sel.innerHTML = '<option value="">-- اختر --</option>';
    const list = document.getElementById('studentsList'); list.innerHTML = '';
    db.transaction("students").objectStore("students").getAll().onsuccess = (e) => {
        e.target.result.forEach(s => {
            const full = `${s.fName} ${s.pName} ${s.gName} ${s.lName}`.replace(/\s+/g, ' ').trim();
            sel.innerHTML += `<option value="${full}">${full}</option>`;
            list.innerHTML += `<tr><td>${s.id}</td><td>${full}</td><td><button class="btn-edit" onclick="editStudent('${s.id}')">تعديل</button></td></tr>`;
        });
    };
    displayRecords();
}
function displayRecords() {
    const tbody = document.getElementById('logTable'); tbody.innerHTML = '';
    db.transaction("records").objectStore("records").openCursor(null, 'prev').onsuccess = (e) => {
        const cursor = e.target.result;
        if(cursor) {
            const r = cursor.value;
            tbody.innerHTML += `<tr><td>${r.date}</td><td>${r.teacher}</td><td>${r.student}</td><td>${r.type}</td><td>${r.surah}</td><td>${r.pages}</td><td>${r.errors}</td><td>${r.rating}</td><td><button class="btn-del" onclick="deleteRecord(${r.id})">حذف</button></td></tr>`;
            cursor.continue();
        }
    };
}
function deleteRecord(id) { if(confirm("حذف؟")) db.transaction("records", "readwrite").objectStore("records").delete(id).onsuccess = () => displayRecords(); }
function clearStuFields() { ['stuID','fName','pName','gName','lName'].forEach(i => document.getElementById(i).value = ''); document.getElementById('stuID').disabled = false; }
function clearActivityFields() { ['pFrom','pTo','errors'].forEach(i => document.getElementById(i).value = ''); document.getElementById('studentSelect').value = ''; }
