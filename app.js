const QURAN_SURAHS = ["الفاتحة","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة","يونس","هود","يوسف","الرعد","إبراهيم","الحجر","النحل","الإسراء","الكهف","مريم","طه","الأنبياء","الحج","المؤمنون","النور","الفرقان","الشعراء","النمل","القصص","العنكبوت","الروم","لقمان","السجدة","الأحزاب","سبأ","فاطر","يس","الصافات","ص","الزمر","غافر","فصلت","الشورى","الزخرف","الدخان","الجاثية","الأحقاف","محمد","الفتح","الحجرات","ق","الذاريات","الطور","النجم","القمر","الرحمن","الواقعة","الحديد","المجادلة","الحشر","الممتحنة","الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك","القلم","الحاقة","المعارج","نوح","الجن","المزمل","المدثر","القيامة","الإنسان","المرسلات","النبأ","النازعات","عبس","التكوير","الانفطار","المطففين","الانشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد","الشمس","الليل","الضحى","الشرح","التين","العلق","القدر","البينة","الزلزلة","العاديات","القارعة","التكاثر","العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون","النصر","المسد","الإخلاص","الفلق","الناس"];

let db;
const DB_NAME = "QuranAppFinalDB";

window.onload = () => {
    initDB();
    fillSurahDropdown();
    // ضبط تاريخ اليوم ليكون القيمة الافتراضية
    document.getElementById('activityDate').valueAsDate = new Date();
};

function initDB() {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains("students")) {
            db.createObjectStore("students", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("records")) {
            db.createObjectStore("records", { keyPath: "id", autoIncrement: true });
        }
    };
    request.onsuccess = (e) => {
        db = e.target.result;
        loadStudentsList();
        displayRecords();
    };
}

function fillSurahDropdown() {
    const select = document.getElementById('surahSelect');
    select.innerHTML = '<option value="-">بدون تحديد</option>';
    QURAN_SURAHS.forEach(s => {
        const option = document.createElement('option');
        option.value = s;
        option.textContent = s;
        select.appendChild(option);
    });
}

function addNewStudent() {
    const s = {
        id: document.getElementById('newID').value,
        fName: document.getElementById('fName').value.trim(),
        pName: document.getElementById('pName').value.trim(),
        gName: document.getElementById('gName').value.trim(),
        lName: document.getElementById('lName').value.trim()
    };
    
    if(!s.id || !s.fName || !s.lName) return alert("الرجاء إدخال رقم الهوية والاسم الأول والعائلة");

    const tx = db.transaction("students", "readwrite");
    const store = tx.objectStore("students");
    
    const request = store.add(s);
    request.onsuccess = () => {
        loadStudentsList();
        clearFields(['newID', 'fName', 'pName', 'gName', 'lName']);
        alert("تم تسجيل الطالب بنجاح");
    };
    request.onerror = () => alert("خطأ: رقم الهوية موجود مسبقاً");
}

function loadStudentsList() {
    const select = document.getElementById('studentSelect');
    select.innerHTML = '<option value="">-- اختر الطالب --</option>';
    
    db.transaction("students").objectStore("students").getAll().onsuccess = (e) => {
        e.target.result.forEach(s => {
            const fullName = `${s.fName} ${s.pName} ${s.gName} ${s.lName}`.replace(/\s+/g, ' ').trim();
            const option = document.createElement('option');
            option.value = fullName;
            option.textContent = fullName;
            select.appendChild(option);
        });
    };
}

function saveActivity() {
    const record = {
        student: document.getElementById('studentSelect').value,
        date: document.getElementById('activityDate').value,
        type: document.getElementById('activityType').value,
        surah: document.getElementById('surahSelect').value,
        from: document.getElementById('pageFrom').value || '-',
        to: document.getElementById('pageTo').value || '-',
        errors: document.getElementById('errorsCount').value || 0,
        rating: document.getElementById('rating').value
    };

    if(!record.student) return alert("يرجى اختيار طالب من القائمة");

    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").add(record).onsuccess = () => {
        displayRecords();
        clearFields(['pageFrom', 'pageTo', 'errorsCount']);
        alert("تم حفظ سجل النشاط");
    };
}

function displayRecords() {
    const tbody = document.getElementById('logTable');
    tbody.innerHTML = '';
    
    db.transaction("records").objectStore("records").openCursor(null, 'prev').onsuccess = (e) => {
        const cursor = e.target.result;
        if(cursor) {
            const r = cursor.value;
            const row = `<tr>
                <td>${r.date}</td>
                <td><b>${r.student}</b></td>
                <td><span class="badge">${r.type}</span></td>
                <td>${r.surah}</td>
                <td>${r.from} - ${r.to}</td>
                <td>${r.errors}</td>
                <td class="${r.rating === 'ممتاز' ? 'excellent' : ''}">${r.rating}</td>
            </tr>`;
            tbody.innerHTML += row;
            cursor.continue();
        }
    };
}

function clearFields(ids) {
    ids.forEach(id => document.getElementById(id).value = '');
}
