const QURAN_SURAHS = ["الفاتحة","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة","يونس","هود","يوسف","الرعد","إبراهيم","الحجر","النحل","الإسراء","الكهف","مريم","طه","الأنبياء","الحج","المؤمنون","النور","الفرقان","الشعراء","النمل","القصص","العنكبوت","الروم","لقمان","السجدة","الأحزاب","سبأ","فاطر","يس","الصافات","ص","الزمر","غافر","فصلت","الشورى","الزخرف","الدخان","الجاثية","الأحقاف","محمد","الفتح","الحجرات","ق","الذاريات","الطور","النجم","القمر","الرحمن","الواقعة","الحديد","المجادلة","الحشر","الممتحنة","الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك","القلم","الحاقة","المعارج","نوح","الجن","المزمل","المدثر","القيامة","الإنسان","المرسلات","النبأ","النازعات","عبس","التكوير","الانفطار","المطففين","الانشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد","الشمس","الليل","الضحى","الشرح","التين","العلق","القدر","البينة","الزلزلة","العاديات","القارعة","التكاثر","العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون","النصر","المسد","الإخلاص","الفلق","الناس"];

let db;

window.onload = () => {
    initDB();
    fillSurahs();
    document.getElementById('activityDate').valueAsDate = new Date();
};

function initDB() {
    const request = indexedDB.open("QuranFinalSystem", 2);
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains("students")) db.createObjectStore("students", { keyPath: "id" });
        if (!db.objectStoreNames.contains("records")) db.createObjectStore("records", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = (e) => {
        db = e.target.result;
        refreshAll();
    };
}

function fillSurahs() {
    const s = document.getElementById('surahSelect');
    s.innerHTML = '<option value="-">بدون تحديد</option>';
    QURAN_SURAHS.forEach(name => s.innerHTML += `<option value="${name}">${name}</option>`);
}

function saveStudent() {
    const s = {
        id: document.getElementById('stuID').value,
        fName: document.getElementById('fName').value.trim(),
        pName: document.getElementById('pName').value.trim(),
        gName: document.getElementById('gName').value.trim(),
        lName: document.getElementById('lName').value.trim()
    };
    if(!s.id || !s.fName) return alert("يرجى إدخال الهوية والاسم");

    const tx = db.transaction("students", "readwrite");
    tx.objectStore("students").put(s); // put تحفظ الجديد أو تحدث القديم
    tx.oncomplete = () => {
        refreshAll();
        ['stuID', 'fName', 'pName', 'gName', 'lName'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('stuID').disabled = false;
        alert("تم حفظ بيانات الطالب");
    };
}

function editStudent(id) {
    db.transaction("students").objectStore("students").get(id).onsuccess = (e) => {
        const s = e.target.result;
        document.getElementById('stuID').value = s.id;
        document.getElementById('stuID').disabled = true; // الهوية مفتاح لا يعدل
        document.getElementById('fName').value = s.fName;
        document.getElementById('pName').value = s.pName;
        document.getElementById('gName').value = s.gName;
        document.getElementById('lName').value = s.lName;
        window.scrollTo(0,0); // الصعود لأعلى الصفحة للتعديل
    };
}

function refreshAll() {
    // 1. تحديث قائمة الاختيار
    const select = document.getElementById('studentSelect');
    select.innerHTML = '<option value="">-- اختر الطالب --</option>';
    // 2. تحديث جدول الإدارة
    const list = document.getElementById('studentsList');
    list.innerHTML = '';

    db.transaction("students").objectStore("students").getAll().onsuccess = (e) => {
        e.target.result.forEach(s => {
            const full = `${s.fName} ${s.pName} ${s.gName} ${s.lName}`.replace(/\s+/g, ' ').trim();
            select.innerHTML += `<option value="${full}">${full}</option>`;
            list.innerHTML += `<tr><td>${s.id}</td><td>${full}</td>
            <td><button class="btn-edit" onclick="editStudent('${s.id}')">تعديل</button></td></tr>`;
        });
    };
    displayRecords();
}

function saveActivity() {
    const record = {
        teacher: document.getElementById('teacherID').value || "غير مسجل",
        student: document.getElementById('studentSelect').value,
        date: document.getElementById('activityDate').value,
        type: document.getElementById('activityType').value,
        surah: document.getElementById('surahSelect').value,
        pages: `${document.getElementById('pFrom').value} - ${document.getElementById('pTo').value}`,
        rating: document.getElementById('rating').value
    };
    if(!record.student) return alert("اختر طالباً");

    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").add(record).onsuccess = () => {
        displayRecords();
        ['pFrom', 'pTo', 'errors'].forEach(id => document.getElementById(id).value = '');
    };
}

function displayRecords() {
    const tbody = document.getElementById('logTable');
    tbody.innerHTML = '';
    db.transaction("records").objectStore("records").openCursor(null, 'prev').onsuccess = (e) => {
        const cursor = e.target.result;
        if(cursor) {
            const r = cursor.value;
            tbody.innerHTML += `<tr>
                <td>${r.date}</td><td>${r.teacher}</td><td><b>${r.student}</b></td>
                <td><span class="badge">${r.type}</span></td><td>${r.surah}</td>
                <td>${r.pages}</td><td class="${r.rating === 'ممتاز' ? 'excellent' : ''}">${r.rating}</td>
            </tr>`;
            cursor.continue();
        }
    };
}

function clearStuFields() {
    ['stuID', 'fName', 'pName', 'gName', 'lName'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('stuID').disabled = false;
}

