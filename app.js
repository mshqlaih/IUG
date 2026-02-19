// بيانات السور مدمجة للعمل بدون إنترنت
const QURAN_SURAHS = [
    "الفاتحة","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة","يونس","هود","يوسف","الرعد","إبراهيم","الحجر","النحل","الإسراء","الكهف","مريم","طه","الأنبياء","الحج","المؤمنون","النور","الفرقان","الشعراء","النمل","القصص","العنكبوت","الروم","لقمان","السجدة","الأحزاب","سبأ","فاطر","يس","الصافات","ص","الزمر","غافر","فصلت","الشورى","الزخرف","الدخان","الجاثية","الأحقاف","محمد","الفتح","الحجرات","ق","الذاريات","الطور","النجم","القمر","الرحمن","الواقعة","الحديد","المجادلة","الحشر","الممتحنة","الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك","القلم","الحاقة","المعارج","نوح","الجن","المزمل","المدثر","القيامة","الإنسان","المرسلات","النبأ","النازعات","عبس","التكوير","الانفطار","المطففين","الانشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد","الشمس","الليل","الضحى","الشرح","التين","العلق","القدر","البينة","الزلزلة","العاديات","القارعة","التكاثر","العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون","النصر","المسد","الإخلاص","الفلق","الناس"
];

let db;

window.onload = () => {
    initDB();
    fillSurahs();
    document.getElementById('activityDate').valueAsDate = new Date();
};

function fillSurahs() {
    const select = document.getElementById('surahSelect');
    select.innerHTML = '<option value="-">بدون تحديد</option>';
    QURAN_SURAHS.forEach(name => {
        select.innerHTML += `<option value="${name}">${name}</option>`;
    });
}

function initDB() {
    const request = indexedDB.open("QuranOfflineDB", 3);
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains("students")) db.createObjectStore("students", { keyPath: "id" });
        if (!db.objectStoreNames.contains("records")) db.createObjectStore("records", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = (e) => {
        db = e.target.result;
        loadStudentsList();
        displayRecords();
    };
}

function addNewStudent() {
    const s = {
        id: document.getElementById('newID').value,
        fName: document.getElementById('fName').value.trim(),
        pName: document.getElementById('pName').value.trim(),
        gName: document.getElementById('gName').value.trim(),
        lName: document.getElementById('lName').value.trim()
    };
    if (!s.id || !s.fName || !s.lName) return alert("أكمل بيانات الهوية والاسم");
    
    const tx = db.transaction("students", "readwrite");
    tx.objectStore("students").add(s).onsuccess = () => {
        loadStudentsList();
        ['newID', 'fName', 'pName', 'gName', 'lName'].forEach(id => document.getElementById(id).value = '');
    };
}

function loadStudentsList() {
    const select = document.getElementById('studentSelect');
    select.innerHTML = '<option value="">-- اختر الطالب --</option>';
    db.transaction("students").objectStore("students").getAll().onsuccess = (e) => {
        e.target.result.forEach(s => {
            const fullName = `${s.fName} ${s.pName} ${s.gName} ${s.lName}`.replace(/\s+/g, ' ').trim();
            select.innerHTML += `<option value="${fullName}">${fullName} (${s.id})</option>`;
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

    if (!record.student) return alert("اختر طالباً");

    db.transaction("records", "readwrite").objectStore("records").add(record).onsuccess = () => {
        displayRecords();
        ['pageFrom', 'pageTo', 'errorsCount'].forEach(id => document.getElementById(id).value = '');
    };
}

function displayRecords() {
    const tbody = document.getElementById('logTable');
    tbody.innerHTML = '';
    db.transaction("records").objectStore("records").openCursor(null, 'prev').onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const r = cursor.value;
            tbody.innerHTML += `<tr>
                <td>${r.date}</td>
                <td><b>${r.student}</b></td>
                <td><span class="badge">${r.type}</span></td>
                <td>${r.surah}</td>
                <td>${r.from} إلى ${r.to}</td>
                <td>${r.errors}</td>
                <td>${r.rating}</td>
            </tr>`;
            cursor.continue();
        }
    };
}

let deferredPrompt;
const installBtn = document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  // منع المتصفح من إظهار الرسالة التلقائية الضعيفة
  e.preventDefault();
  // حفظ الحدث لاستخدامه عند الضغط على الزر
  deferredPrompt = e;
  // إظهار الزر الخاص بنا الآن
  installBtn.style.display = 'block';

  installBtn.addEventListener('click', () => {
    // إخفاء الزر بعد الضغط
    installBtn.style.display = 'none';
    // إظهار نافذة التثبيت الحقيقية للمستخدم
    deferredPrompt.prompt();
    // معرفة قرار المستخدم (هل وافق أم رفض؟)
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('المستخدم وافق على التثبيت');
      }
      deferredPrompt = null;
    });
  });
});

// إخفاء الزر إذا تم التثبيت بنجاح
window.addEventListener('appinstalled', () => {
  installBtn.style.display = 'none';
  console.log('تم تثبيت التطبيق بنجاح!');
});


