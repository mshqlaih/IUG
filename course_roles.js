/* ============================================================================
   course_roles.js — مسارا **معلّم الدورة** («دوراتي») و**مشرف الدورات**.
   نقلٌ عن lib/screens/courses/{teacher,supervisor} و lib/services/
   {course_teacher,course_supervisor,attendance_queue} في تطبيق Flutter.

   يُحمَّل بعد courses.js ويعتمد عليه: coursesStoreGet/Put/Delete · courseNum ·
   normalizeCourseDetail · stagesOfCourseClass · tierByPercent · stageLabel ·
   openAddCourseStudents · showCoursesView — ومن app.js: canManageCourses ·
   canSuperviseCourses · escapeHtml · normalizeAr · showToast/showAlert/showConfirm.

   🔑 قاعدتان تحكمان الملفّ كلّه (docs/courses_supervision_status.md):
     · **المعلّم لا يرى درجةً قبل اعتماد المشرف.** مساراته Courses/my* بلا
       عمود درجة، ولا يُستدعى في مساره getCourse ولا sv/ — فيهما الدرجات،
       ونداءٌ واحد يوصلها إلى الجهاز ولو لم تُعرض. والاستثناء الوحيد
       Courses/myResults بعد الاعتماد، **وبلا كاش**.
     · **اعتماد النتائج علمٌ واحد بأثرين:** يراها المعلّم، وتُقفل عن الرصد
       والإدخال المباشر. والقفل نفسه على السيرفر (results_locked_n) — هنا العرض.
   ============================================================================ */

/* ===================== أدوات مشتركة ===================== */

function crEl(id) { return document.getElementById(id); }

function crN(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
}

function crS(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function crSN(v) { const s = crS(v); return s ? s : null; }
function crDate(v) { const s = crSN(v); return s ? s.split('T')[0] : null; }

// تاريخ اليوم **المحلّي** — toISOString يعطي UTC فيتأخّر يومًا بعد منتصف الليل
function crTodayStr() {
    const d = new Date();
    const two = n => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
}

// لون النسبة — للانتظام والنتيجة
function crPctCls(p) {
    if (p == null) return '';
    if (p >= 90) return 'ok';
    if (p >= 75) return 'accent';
    if (p >= 60) return 'warn';
    return 'crit';
}

/* رسالة ودّية للعرض.
   ⚠️⚠️ **555 ليست «لا صلاحية».** ORDS يردّها لكل خطأ PL/SQL: الحارس حين يرفض،
   وعمودٌ غائب، وجدولٌ لم يُنشأ — لا تفترق في العميل. وترجمتُها «لا صلاحية»
   أرسلت من قرأها يبحث في الصلاحيات عن عطبٍ في الاستعلام (Flutter). */
function crErrorText(err, who) {
    const s = String((err && err.message) || err || '');
    if (s.indexOf('HTTP 404') !== -1) {
        return who === 'teacher'
            ? 'مسار المعلّم غير مسجّل على السيرفر — شغّل docs/ords_course_teacher.sql §5.'
            : 'المسار غير مسجّل على السيرفر — شغّل docs/ords_course_supervision.sql.';
    }
    if (s.indexOf('HTTP 401') !== -1 || s.indexOf('HTTP 403') !== -1) {
        return 'لا صلاحية لعرض إشراف الدورات بحسابك.\n' +
               'الشرط: رتبة إدارية ومقعدٌ في دائرة التجويد أو الإدارة العامة.';
    }
    if (s.indexOf('HTTP 555') !== -1) {
        return who === 'teacher'
            ? 'تعذّر تنفيذ الطلب على السيرفر.\nإمّا أن هذه الدورة ليست مُسنَدةً إليك، ' +
              'وإمّا أن المعالج لم يُنشر بعد أو أخفق في التنفيذ.'
            : 'تعذّر تنفيذ الطلب على السيرفر.\nإمّا أن حسابك لا يملك صلاحية الإشراف، ' +
              'وإمّا أن المعالج لم يُنشر بعد أو أخفق — وإن عملت بقيةُ شاشات الإشراف ' +
              'بحسابك فالصلاحية سليمة.';
    }
    if (!navigator.onLine || /Failed to fetch|NetworkError|Load failed|abort/i.test(s)) {
        return 'لا اتصال بالشبكة.';
    }
    return s || 'خطأ غير معروف';
}

function crHtmlLines(text) {
    return escapeHtml(text).replace(/\n/g, '<br>');
}

/* جلبٌ مع كاش في مخزن 'courses': الشبكة أوّلًا، والمخزَّن عند تعذّرها.
   يُرجع { data, fromCache }. و forceOnline يمنع الرجوع إلى المخزَّن (زرّ التحديث). */
async function crCached(key, fetcher, forceOnline) {
    const cached = await coursesStoreGet('courses', key);
    if (!navigator.onLine && !forceOnline && cached != null) {
        return { data: cached, fromCache: true };
    }
    try {
        const data = await fetcher();
        try { await coursesStorePut('courses', key, data); } catch (_) { /* الطازج يكفي */ }
        return { data: data, fromCache: false };
    } catch (err) {
        if (!forceOnline && cached != null) return { data: cached, fromCache: true };
        throw err;
    }
}

/* ============================================================================
   رصد حضور يوم — شاشةٌ واحدة للمسارين
   ----------------------------------------------------------------------------
   🔑 **الكشف كاملًا لا الحاضرون وحدهم.** نسبة الانتظام تُحسب من الصفوف
      المسجَّلة، فلو أُرسل الحاضرون فقط لصارت كل دورة «انتظام ١٠٠٪» أبدًا. ولهذا
      يبدأ الكشف كلُّه حاضرًا ويُنقَر الغائب، ثم يُكتب فوقه ما رُصد لليوم فعلًا —
      ولولا ذلك لمحا أوّلُ حفظٍ غياباتٍ مسجّلة.
   ⚠️ والفرق بين المسارين في السلوك لا في الشكل (كما في Flutter):
      المعلّم يكتب في **طابور** حين تنقطع الشبكة، والمشرف يفشل صراحةً.
   ============================================================================ */

let _att = null;

async function openAttendanceEntry(opts) {
    const a = {
        mode: opts.mode === 'teacher' ? 'teacher' : 'sv',
        courseNo: Number(opts.courseNo),
        courseName: opts.courseName || '',
        onSaved: opts.onSaved || null,
        students: [], marks: {}, history: null,
        existing: false, queued: false,
        loading: true, saving: false, error: '',
    };
    _att = a;

    const today = crTodayStr();
    const dateEl = crEl('attDate');
    if (dateEl) {
        dateEl.max = today;   // ⚠️ لا مستقبل: السيرفر يرفضه، ومنعُه هنا أوضح
        dateEl.value = (opts.date && opts.date <= today) ? opts.date : today;
    }
    const search = crEl('attSearch');
    if (search) search.value = '';
    const nameEl = crEl('attCourseName');
    if (nameEl) nameEl.textContent = a.courseName;
    const modal = crEl('attEntryModal');
    if (modal) modal.style.display = 'flex';
    renderAttEntry();

    try {
        a.students = await attLoadStudents(a);
    } catch (err) {
        a.error = crErrorText(err, a.mode === 'teacher' ? 'teacher' : 'sv');
    }
    a.loading = false;
    if (_att !== a) return;
    await attLoadDay();
}

async function attLoadStudents(a) {
    if (a.mode === 'teacher') {
        // أسماءٌ بلا درجات — Courses/myRoster
        const r = await crCached('ct_roster_' + a.courseNo, () => QMC.getMyRoster(a.courseNo), false);
        return (r.data || []).map(normalizeCtStudent);
    }
    // الإشراف: كشف sv/courseRoster (المخزَّن نفسه الذي يعرضه كشف المسجّلين)
    const r = await crCached('cs_roster_' + a.courseNo, () => QMC.getSvRoster(a.courseNo), false);
    return ((r.data && r.data.students) || []).map(s => ({
        idNo: String(s.id_no),
        name: crS(s.name) || ('هوية ' + s.id_no),
        status: Number(s.student_status || 1),
    }));
}

function attDate() {
    return String((crEl('attDate') || {}).value || '');
}

async function attLoadDay() {
    const a = _att;
    if (!a) return;
    const date = attDate();

    a.marks = {};
    a.students.forEach(s => { a.marks[s.idNo] = 1; });
    a.existing = false;
    a.queued = false;
    renderAttEntry();

    try {
        const saved = {};
        if (a.mode === 'teacher') {
            // ⚠️ **الطابور يعلو المخزَّن:** يومٌ رُصد أوفلاين ولم يُرفع يُفتح بما
            //    رصده المعلّم — وإلّا رأى تصحيحَه وقد اختفى.
            const q = await ctQueueForDay(a.courseNo, date);
            if (q) {
                Object.keys(q.marks || {}).forEach(id => { saved[id] = Number(q.marks[id]); });
                a.queued = true;
            } else {
                // السجلّ كلّه يُجلب مرّةً للنافذة، ويُرشَّح باليوم محليًّا
                if (!a.history) {
                    const r = await crCached('ct_att_' + a.courseNo,
                                             () => QMC.getMyAttendance(a.courseNo), false);
                    a.history = r.data || [];
                }
                a.history.forEach(row => {
                    if (crDate(row.attendance_date) === date) {
                        saved[String(row.id_no)] = Number(row.attendance_type || 1);
                    }
                });
            }
        } else {
            (await QMC.getSvDayMarks(a.courseNo, date)).forEach(row => {
                if (crS(row.row_type) !== 'E' || row.id_no == null || row.att_type == null) return;
                saved[String(row.id_no)] = Number(row.att_type) || 1;
            });
        }
        if (_att !== a || attDate() !== date) return;   // تغيّر اليوم أثناء الجلب
        Object.keys(saved).forEach(id => {
            if (Object.prototype.hasOwnProperty.call(a.marks, id)) a.marks[id] = saved[id];
        });
        a.existing = Object.keys(saved).length > 0;
    } catch (_) {
        // ⚠️ صامتٌ عمدًا: تعذّر جلب حالة اليوم لا يمنع الرصد، والشريط يقول
        //    «لم يُرصد بعد» فلا يظنّ المستخدم أنه يعدّل وهو يبدأ من الصفر.
    }
    renderAttEntry();
}

function attDateChanged() {
    const el = crEl('attDate');
    const today = crTodayStr();
    if (el && !el.value) el.value = today;
    if (el && el.value > today) {
        el.value = today;
        showToast('لا يُرصد حضور يومٍ لم يأتِ بعد');
    }
    attLoadDay();
}

function attAllPresent() {
    const a = _att;
    if (!a || a.saving) return;
    Object.keys(a.marks).forEach(k => { a.marks[k] = 1; });
    renderAttEntry();
}

function attRowHtml(s, i) {
    const v = _att.marks[s.idNo] || 1;
    return `<div class="att-row" id="attRow_${i}">
        <div class="att-name">${escapeHtml(s.name)}<small>🪪 ${escapeHtml(s.idNo)}${
            s.status === 5 ? ' · إضافي' : ''}</small></div>
        <div class="att-seg">
            <button type="button" class="${v === 1 ? 'on-present' : ''}" onclick="setAttMark(${i}, 1)">حاضر</button>
            <button type="button" class="${v === 2 ? 'on-absent' : ''}" onclick="setAttMark(${i}, 2)">غائب</button>
        </div>
    </div>`;
}

// نقرةٌ واحدة تُعيد رسم صفّها وحده — إعادة رسم القائمة كلّها تُضيع موضع التمرير
function setAttMark(i, v) {
    const a = _att;
    if (!a || a.saving) return;
    const s = a.students[i];
    if (!s) return;
    a.marks[s.idNo] = v;
    const row = crEl('attRow_' + i);
    if (row) row.outerHTML = attRowHtml(s, i);
    renderAttHead();
}

function renderAttHead() {
    const a = _att;
    const head = crEl('attHead');
    if (!a || !head) return;

    let present = 0, absent = 0;
    Object.keys(a.marks).forEach(k => {
        if (a.marks[k] === 1) present++;
        else if (a.marks[k] === 2) absent++;
    });
    // يقول للمستخدم أيَّ الحالات هو فيها قبل أن يحفظ
    const state = a.queued ? '📥 هذا اليوم في الطابور — رُصد ولم يُرفع بعد'
                : a.existing ? '✎ هذا اليوم مرصودٌ سلفاً — الحفظ يعدّله'
                : '＋ يومٌ لم يُرصد بعد';

    head.className = 'att-head' + (a.queued ? ' queued' : '');
    head.innerHTML = `<b>يوم ${escapeHtml(attDate())}</b> · حاضر ${present} · غائب ${absent} من ${a.students.length}
        <div class="att-state ${(a.queued || a.existing) ? 'warn' : ''}">${state}</div>`;

    const btn = crEl('attSaveBtn');
    if (btn) {
        btn.disabled = a.loading || a.saving || !a.students.length;
        btn.textContent = a.saving ? 'جارٍ الحفظ…' : ('حفظ حضور ' + attDate());
    }
}

function renderAttEntry() {
    const a = _att;
    const list = crEl('attList');
    if (!a || !list) return;
    renderAttHead();

    if (a.loading) {
        list.innerHTML = '<div class="students-empty">جارٍ تحميل الكشف…</div>';
        return;
    }
    if (a.error && !a.students.length) {
        list.innerHTML = `<div class="students-empty">${crHtmlLines(a.error)}</div>`;
        return;
    }

    const q = normalizeAr((crEl('attSearch') || {}).value || '').toLowerCase();
    const html = a.students.map((s, i) => {
        if (q && normalizeAr(s.name).toLowerCase().indexOf(q) === -1 && s.idNo.indexOf(q) === -1) return '';
        return attRowHtml(s, i);
    }).join('');
    list.innerHTML = html ||
        `<div class="students-empty">${a.students.length ? 'لا نتائج للبحث' : 'لا مسجّلين في هذه الدورة'}</div>`;
}

function closeAttEntry() {
    const modal = crEl('attEntryModal');
    if (modal) modal.style.display = 'none';
    _att = null;
}

async function saveAttEntry() {
    const a = _att;
    if (!a || a.saving || a.loading || !a.students.length) return;
    const date = attDate();
    if (!date) return;
    if (date > crTodayStr()) {
        return showAlert({ message: 'لا يُرصد حضور يومٍ لم يأتِ بعد', icon: '⚠️' });
    }

    const marks = Object.assign({}, a.marks);
    a.saving = true;
    renderAttHead();

    try {
        if (a.mode === 'teacher') {
            const r = await ctSaveAttendance(a.courseNo, date, marks);
            closeAttEntry();
            showToast(r.queued
                ? '📥 حُفظ حضور ' + date + ' على الجهاز — يُرفع عند عودة الشبكة'
                : '✅ رُفع حضور ' + r.saved + ' مسجّلاً ليوم ' + date);
        } else {
            const n = await QMC.saveCourseAttendance(a.courseNo, date, marks);
            await coursesStoreDelete('courses', 'cs_att_' + a.courseNo);
            closeAttEntry();
            showToast('✅ حُفظ حضور ' + n + ' مسجّلاً ليوم ' + date);
        }
        if (a.onSaved) a.onSaved();
    } catch (err) {
        // ⚠️ لا تُمحى المُدخلات: الرسالة تقول السبب، والإعادة مأمونة (MERGE)
        a.saving = false;
        renderAttHead();
        showAlert({ title: 'لم يُحفظ الحضور',
                    message: crErrorText(err, a.mode === 'teacher' ? 'teacher' : 'sv'), icon: '⚠️' });
    }
}

/* ============================================================================
   «دوراتي» — مسار معلّم الدورة
   ----------------------------------------------------------------------------
   الإذن **ملكيّةٌ لا رتبة** (TEACHER_ID_NO = المستخدم على السيرفر)، فلا حارسَ
   هنا: من ليس معلّمًا تعود قائمتُه فارغة لا مرفوضة.
   ============================================================================ */

let _ctCourses = [];
let _ctFromCache = false;
let _ctError = '';
let _ctLoading = false;
let _ctFlushing = false;
let _ctQueue = [];          // نسخةٌ من الطابور للعرض
let _ctOpen = null;         // الدورة المفتوحة في «نتائج طلابي» أو «إضافة طلاب»
let _ctStudents = [];
let _ctStudentsFromCache = false;

function normalizeCtCourse(j) {
    return {
        courseNo      : Number(j.course_no || 0),
        courseName    : crS(j.course_name) || ('دورة ' + j.course_no),
        className     : crSN(j.class_name),
        centerName    : crSN(j.center_name),
        startDate     : crDate(j.start_date),
        endDate       : crDate(j.end_date),
        placeName     : crSN(j.place_name),
        state         : crS(j.state) || 'ACTIVE',
        students      : Number(j.students || 0),
        attendedDays  : Number(j.attended_days || 0),
        approvedVisits: Number(j.approved_visits || 0),
        // علمُ عرضٍ لا إذن: الحارس الحقيقيّ في Courses/myResults
        resultsApproved: crS(j.results_approved).toUpperCase() === 'Y',
    };
}

function normalizeCtStudent(j) {
    return {
        idNo        : String(j.id_no),
        name        : crS(j.name) || ('هوية ' + j.id_no),
        status      : Number(j.student_status || 1),    // 1 معتمد · 5 إضافي
        registerDate: crDate(j.register_date),
    };
}

// النوع الوحيد في مسار المعلّم الذي يحمل درجة — ومن Courses/myResults وحده
function normalizeCtResult(j) {
    return {
        idNo      : String(j.id_no),
        name      : crS(j.name) || ('هوية ' + j.id_no),
        status    : Number(j.student_status || 1),
        mid       : crN(j.smtr_avg),
        fin       : crN(j.final_avg),
        total     : crN(j.student_avg),
        classTotal: crN(j.class_total_mark),
    };
}

function ctStateLabel(state) {
    if (state === 'UPCOMING') return 'لم تبدأ';
    if (state === 'ENDED') return 'منتهية';
    return 'جارية';
}

function ctStateCls(state) {
    if (state === 'ACTIVE') return 'ok';
    if (state === 'ENDED') return '';
    return 'warn';
}

/* ---------- طابور رصد الحضور ----------
   🔑 **ولماذا يُؤمَن؟** القيد على السيرفر فريدٌ على (مسجَّل × تاريخ) والحفظ MERGE،
      فإعادةُ دفعةٍ وصلت **تصحيحٌ لا تكرار** — فلا يلزم مفتاح إرسالٍ ولا شاهد قبر.
   ⚠️ **والمفتاح (دورة × يوم) لا رقمٌ متسلسل:** الرصد تصحيحٌ متكرّر لليوم نفسه،
      ولو صُفَّت دفعتان متسلسلتين لرُفعت القديمة بعد الجديدة فمحتها.
   ⚠️ **ولا يُرفع في الخلفية:** عند فتح «دوراتي» وعند «رفع الآن» وحدهما — دفعةٌ
      تُرفع بلا أن يرى صاحبُها نتيجتها تُخفي فشلًا متكرّرًا. */

const CT_QUEUE_KEY = 'ct_att_queue';

// رفضٌ لا تُصلحه الإعادة ⇒ لا يدخل الطابور (ويُسقَط منه عند الرفع)،
// وإلّا بقيت شارةٌ لا تنطفئ أبدًا
const CT_REJECT_MARKS = ['غير مصرّح', 'ليست من دوراتك', 'ليست في كشف',
                         'لا يُرصد حضور يوم', 'غير موجودة'];

function ctIsRejected(msg) {
    const s = String(msg || '');
    return CT_REJECT_MARKS.some(m => s.indexOf(m) !== -1);
}

async function ctQueueAll() {
    const rows = await coursesStoreGet('courses', CT_QUEUE_KEY);
    return Array.isArray(rows) ? rows : [];
}

async function ctQueueWrite(rows) {
    await coursesStorePut('courses', CT_QUEUE_KEY, rows);
}

function ctSameDay(r, courseNo, date) {
    return Number(r.course_no) === Number(courseNo) && r.date === date;
}

async function ctEnqueue(courseNo, date, marks, error) {
    const rows = (await ctQueueAll()).filter(r => !ctSameDay(r, courseNo, date));
    rows.push({
        course_no : Number(courseNo),
        date      : date,
        marks     : Object.assign({}, marks),
        queued_at : new Date().toISOString(),
        last_error: error || null,
    });
    await ctQueueWrite(rows);
}

async function ctQueueRemove(courseNo, date) {
    await ctQueueWrite((await ctQueueAll()).filter(r => !ctSameDay(r, courseNo, date)));
}

async function ctQueueForDay(courseNo, date) {
    const rows = await ctQueueAll();
    for (let i = 0; i < rows.length; i++) {
        if (ctSameDay(rows[i], courseNo, date)) return rows[i];
    }
    return null;
}

/* بعد رفعٍ ناجح يُحدَّث السجلّ المخزَّن بصفوف اليوم — لا يُمحى (كما في Flutter)،
   كي يبقى اليوم يُفتح بحالته على الجهاز بلا شبكة. */
async function ctPatchAttendanceCache(courseNo, date, marks) {
    const key = 'ct_att_' + courseNo;
    const rows = await coursesStoreGet('courses', key);
    if (!Array.isArray(rows)) return;
    const kept = rows.filter(r => crDate(r.attendance_date) !== date);
    Object.keys(marks).forEach(id => {
        kept.push({ id_no: id, attendance_date: date, attendance_type: Number(marks[id]) });
    });
    await coursesStorePut('courses', key, kept);
}

async function ctPost(courseNo, date, marks) {
    const n = await QMC.saveCourseAttendance(courseNo, date, marks);
    try { await ctPatchAttendanceCache(courseNo, date, marks); } catch (_) { /* زينة */ }
    return n;
}

// يُرجع { saved, queued } — أو يرمي رفضًا صريحًا تبقى معه المُدخلات في الشاشة
async function ctSaveAttendance(courseNo, date, marks) {
    if (navigator.onLine) {
        try {
            const n = await ctPost(courseNo, date, marks);
            await ctQueueRemove(courseNo, date);   // نسخةٌ أقدم إن وُجدت
            return { saved: n, queued: false };
        } catch (err) {
            const msg = String((err && err.message) || err || '');
            if (ctIsRejected(msg)) throw err;
            await ctEnqueue(courseNo, date, marks, msg);
            return { saved: 0, queued: true };
        }
    }
    await ctEnqueue(courseNo, date, marks, 'لا اتصال بالشبكة');
    return { saved: 0, queued: true };
}

// يُرجع { sent, left, dropped: [رسائل] }. ⚠️ الفشل لا يُسقط الدفعة — تبقى بخطئها
async function ctFlushQueue() {
    const rows = await ctQueueAll();
    const out = { sent: 0, left: rows.length, dropped: [] };
    if (!rows.length || !navigator.onLine) return out;

    for (const day of rows) {
        try {
            await ctPost(day.course_no, day.date, day.marks || {});
            await ctQueueRemove(day.course_no, day.date);
            out.sent++;
        } catch (err) {
            const msg = String((err && err.message) || err || '');
            if (ctIsRejected(msg)) {
                await ctQueueRemove(day.course_no, day.date);
                out.dropped.push(day.date + ': ' + msg);
            } else {
                const all = await ctQueueAll();
                all.forEach(r => { if (ctSameDay(r, day.course_no, day.date)) r.last_error = msg; });
                await ctQueueWrite(all);
            }
        }
    }
    out.left = (await ctQueueAll()).length;
    return out;
}

/* ---------- الشاشات ---------- */

function showCtView(name) {
    ['ctListView', 'ctResultsView', 'ctStudentsView'].forEach(id => {
        const el = crEl(id);
        if (el) el.style.display = (id === name) ? 'block' : 'none';
    });
    window.scrollTo(0, 0);
}

function openMyCoursesHome() {
    showCtView('ctListView');
    loadMyCourses(false);
}

function backToMyCourses() {
    _ctOpen = null;
    showCtView('ctListView');
    renderMyCourses(false);
}

async function loadMyCourses(forceOnline) {
    if (_ctLoading) return;
    _ctLoading = true;

    // المخزون أوّلًا ليظهر شيءٌ فورًا
    if (!_ctCourses.length) {
        const cached = await coursesStoreGet('courses', 'ct_courses');
        if (Array.isArray(cached)) {
            _ctCourses = cached.map(normalizeCtCourse);
            _ctFromCache = true;
        }
    }
    _ctQueue = await ctQueueAll();
    renderMyCourses(true);

    try {
        const r = await crCached('ct_courses', () => QMC.getMyCourses(), !!forceOnline);
        _ctCourses = (r.data || []).map(normalizeCtCourse);
        _ctFromCache = r.fromCache;
        _ctError = '';
    } catch (err) {
        _ctError = crErrorText(err, 'teacher');
    } finally {
        _ctLoading = false;
    }
    _ctQueue = await ctQueueAll();
    renderMyCourses(false);

    // ⚠️ الرفع **بعد** العرض: شاشةٌ تنتظر طابورًا فاشلًا قبل أن تظهر تبدو معطّلة
    if (_ctQueue.length && navigator.onLine) await ctFlushNow(true);
}

async function ctFlushNow(silent) {
    if (_ctFlushing) return;
    _ctFlushing = true;
    renderMyCourses(false);
    let reload = false;
    try {
        const r = await ctFlushQueue();
        _ctQueue = await ctQueueAll();
        if (r.dropped.length) {
            showAlert({ title: 'رفض السيرفر بعض أيام الحضور',
                        message: r.dropped.join('\n'), icon: '⚠️' });
        }
        if (r.sent > 0) {
            showToast('✅ رُفع ' + r.sent + ' يوماً من الطابور' + (r.left ? ' — وبقي ' + r.left : ''));
            reload = true;   // العدّادات تغيّرت
        } else if (!silent && r.left) {
            showToast(navigator.onLine
                ? 'لم يُرفع شيء — ما زال ' + r.left + ' يوماً في الانتظار'
                : 'لا اتصال — يُرفع الطابور عند عودة الشبكة');
        }
    } finally {
        _ctFlushing = false;
        renderMyCourses(false);
    }
    if (reload) await loadMyCourses(false);
}

function renderMyCourses(loading) {
    const wrap = crEl('ctList'), empty = crEl('ctEmpty'), banners = crEl('ctBanners');
    if (!wrap) return;

    let b = '';
    if (_ctQueue.length) {
        let lastErr = '';
        _ctQueue.forEach(q => { if (q.last_error) lastErr = q.last_error; });
        b += `<div class="cr-banner warn"><i class="fas fa-cloud-arrow-up"></i>
            <div class="cr-banner-text"><b>${_ctQueue.length} يوماً بانتظار الرفع</b><br>
                رُصدت بلا شبكة وحُفظت على الجهاز — والإعادة مأمونة لا تُكرّر.${
                lastErr ? '<br><small>آخر خطأ: ' + escapeHtml(lastErr) + '</small>' : ''}</div>
            <button type="button" onclick="ctFlushNow(false)" ${_ctFlushing ? 'disabled' : ''}>${
                _ctFlushing ? 'جارٍ الرفع…' : 'رفع الآن'}</button>
        </div>`;
    }
    if (_ctFromCache && _ctCourses.length) {
        b += `<div class="cr-banner info"><i class="fas fa-hard-drive"></i>
            <div class="cr-banner-text">بيانات مخزَّنة على الجهاز</div></div>`;
    }
    if (_ctError && _ctCourses.length) b += `<div class="cr-note warn">${crHtmlLines(_ctError)}</div>`;
    if (banners) banners.innerHTML = b;

    if (!_ctCourses.length) {
        wrap.innerHTML = '';
        if (empty) {
            empty.style.display = 'block';
            empty.innerHTML = loading ? 'جارٍ التحميل…'
                : (_ctError ? crHtmlLines(_ctError)
                            : 'لا دوراتٍ مُسنَدةً إليك.<br>وإسنادُ الدورة إلى معلّمها من دائرة التجويد.');
        }
        return;
    }
    if (empty) empty.style.display = 'none';
    wrap.innerHTML = _ctCourses.map(ctCardHtml).join('');
}

/* 🔑 ما في البطاقة وما ليس فيها: رصدُ الحضور وإضافة الطلاب — وليس فيها **درجةٌ
      واحدة**. «نتائج طلابي» يظهر بعد اعتماد المشرف وحده، والزرّ علمُ عرض: الحارس
      في Courses/myResults يرفض قبل الاعتماد. */
function ctCardHtml(c, i) {
    const queued = _ctQueue.filter(q => Number(q.course_no) === c.courseNo).length;
    const facts = [
        `<span><i class="fas fa-users"></i>${c.students} مسجّلاً</span>`,
        `<span><i class="fas fa-calendar-check"></i>${c.attendedDays} يوماً مرصوداً</span>`,
    ];
    if (c.placeName) facts.push(`<span><i class="fas fa-location-dot"></i>${escapeHtml(c.placeName)}</span>`);
    if (c.startDate) {
        facts.push(`<span><i class="fas fa-calendar-days"></i>${escapeHtml(c.startDate)}${
            c.endDate ? ' — ' + escapeHtml(c.endDate) : ''}</span>`);
    }
    if (c.approvedVisits > 0) {
        facts.push(`<span><i class="fas fa-award"></i>${c.approvedVisits} تقييماً معتمداً</span>`);
    }
    if (queued) facts.push(`<span class="warn"><i class="fas fa-cloud-arrow-up"></i>${queued} بانتظار الرفع</span>`);

    return `
    <div class="student-card">
        <div class="student-card-head">
            <span class="student-name">${escapeHtml(c.courseName)}</span>
            <span class="cr-pill ${ctStateCls(c.state)}">${ctStateLabel(c.state)}</span>
        </div>
        ${c.className ? `<div class="cr-sub">🎓 ${escapeHtml(c.className)}</div>` : ''}
        <div class="cr-facts">${facts.join('')}</div>
        ${c.resultsApproved ? '<div class="cr-pills"><span class="cr-pill ok">✓ نتائج معتمدة</span></div>' : ''}
        <div class="cr-actions">
            <button type="button" class="cr-action" onclick="openCtStudents(${i})">
                <i class="fas fa-user-plus"></i> إضافة طلاب</button>
            ${c.resultsApproved ? `<button type="button" class="cr-action ok" onclick="openCtResults(${i})">
                <i class="fas fa-clipboard-check"></i> نتائج طلابي</button>` : ''}
            <button type="button" class="cr-action primary" onclick="openCtAttendance(${i})">
                <i class="fas fa-user-check"></i> رصد الحضور</button>
        </div>
    </div>`;
}

function openCtAttendance(i) {
    const c = _ctCourses[i];
    if (!c) return;
    openAttendanceEntry({
        mode: 'teacher', courseNo: c.courseNo, courseName: c.courseName,
        onSaved: () => loadMyCourses(false),
    });
}

/* ---------- نتائج طلابي ----------
   ⚠️ **بلا كاش عمدًا.** المشرف قد يفكّ الاعتماد ليصحّح فتسقط النتائج عن
   المعلّم — ونسخةٌ على الجهاز كانت ستُبقيها أمامه بأرقامٍ قد تتغيّر.
   ⚠️ **ولا تقدير:** يحتاج كشف الإشراف بمخطّطه، ولا يُعاد اشتقاقه هنا بسقفٍ
   آخر فيختلف عمّا في شاشة المشرف. */
async function openCtResults(i) {
    const c = _ctCourses[i];
    if (!c) return;
    _ctOpen = c;
    showCtView('ctResultsView');
    const title = crEl('ctResultsTitle');
    if (title) title.textContent = 'نتائج طلابي — ' + c.courseName;
    await loadCtResults();
}

async function loadCtResults() {
    const c = _ctOpen;
    const body = crEl('ctResultsBody');
    if (!c || !body) return;

    const retry = `<div class="cr-actions" style="justify-content:center">
        <button type="button" class="cr-action" onclick="loadCtResults()"><i class="fas fa-rotate"></i> إعادة المحاولة</button></div>`;

    if (!navigator.onLine) {
        body.innerHTML = `<div class="students-empty"><i class="fas fa-lock"></i><br>
            النتائج تُقرأ من السيرفر في كل فتح ولا تُخزَّن على الجهاز — اتّصل بالشبكة ثم أعد المحاولة.</div>` + retry;
        return;
    }
    body.innerHTML = '<div class="students-empty">جارٍ التحميل…</div>';
    try {
        const rows = (await QMC.getMyResults(c.courseNo)).map(normalizeCtResult);
        if (_ctOpen !== c) return;
        body.innerHTML = ctResultsHtml(rows);
    } catch (err) {
        if (_ctOpen !== c) return;
        body.innerHTML = `<div class="students-empty"><i class="fas fa-lock"></i><br>${
            crHtmlLines(crErrorText(err, 'teacher'))}</div>` + retry;
    }
}

function ctResultsHtml(rows) {
    if (!rows.length) return '<div class="students-empty">لا مسجّلين في هذه الدورة</div>';

    const scored = rows.filter(r => r.total != null);
    const avg = scored.length ? scored.reduce((s, r) => s + r.total, 0) / scored.length : null;
    let max = null;
    rows.some(r => { if (r.classTotal != null) { max = r.classTotal; return true; } return false; });

    const head = `<div class="cr-banner info"><i class="fas fa-circle-check"></i>
        <div class="cr-banner-text"><b>نتائج معتمدة</b> · ${scored.length} من ${rows.length} لهم نتيجة${
            avg != null ? ' · المتوسّط ' + courseNum(Math.round(avg * 10) / 10) : ''}${
            max != null ? ' من ' + courseNum(max) : ''}</div></div>`;

    const tiles = rows.map(r => {
        const pct = (r.total != null && max != null && max > 0) ? Math.round(r.total / max * 100) : null;
        return `
        <div class="student-card">
            <div class="student-card-head">
                <span class="student-name">${escapeHtml(r.name)}</span>
                <span class="cr-score"><span class="cr-pill ${crPctCls(pct)}">${
                    r.total != null ? courseNum(r.total) : '—'}${pct != null ? ' · ' + pct + '٪' : ''}</span></span>
            </div>
            <div class="cr-sub">النصفي ${courseNum(r.mid)} · النهائي ${courseNum(r.fin)}${
                r.status === 5 ? ' · إضافي' : ''}</div>
        </div>`;
    }).join('');

    return head + '<div class="students-cards">' + tiles + '</div>';
}

/* ---------- إضافة طلاب (وضع المعلّم) ----------
   🔑 ليس إخفاءَ زرّ حذفٍ وحده: الكشف من Courses/myRoster (أسماءٌ بلا درجات) لا
      من getCourse — ذاك كشف المختبِر **بدرجاته** ومقصورٌ على أعضاء اللجنة. ولا
      حذف — والسيرفر يرفضه أصلًا (QMC_REMOVE_COURSE_STUDENT). */
async function openCtStudents(i) {
    const c = _ctCourses[i];
    if (!c) return;
    _ctOpen = c;
    _ctStudents = [];
    showCtView('ctStudentsView');
    const title = crEl('ctStudentsTitle');
    if (title) title.textContent = 'إضافة طلاب — ' + c.courseName;
    const search = crEl('ctStudentsSearch');
    if (search) search.value = '';
    await loadCtStudents(false);
}

async function loadCtStudents(forceOnline) {
    const c = _ctOpen;
    const list = crEl('ctStudentsList');
    if (!c || !list) return;
    if (!_ctStudents.length) list.innerHTML = '<div class="students-empty">جارٍ التحميل…</div>';
    try {
        const r = await crCached('ct_roster_' + c.courseNo, () => QMC.getMyRoster(c.courseNo), !!forceOnline);
        if (_ctOpen !== c) return;
        _ctStudents = (r.data || []).map(normalizeCtStudent);
        _ctStudentsFromCache = r.fromCache;
        renderCtStudents();
    } catch (err) {
        if (_ctOpen !== c) return;
        list.innerHTML = `<div class="students-empty">${crHtmlLines(crErrorText(err, 'teacher'))}</div>`;
    }
}

function renderCtStudents() {
    const list = crEl('ctStudentsList');
    if (!list) return;
    const q = normalizeAr((crEl('ctStudentsSearch') || {}).value || '').toLowerCase();
    const items = _ctStudents.filter(s => !q ||
        normalizeAr(s.name).toLowerCase().indexOf(q) !== -1 || s.idNo.indexOf(q) !== -1);

    const head = `<div class="cr-sub" style="margin:0 0 4px"><b>المسجّلون حالياً (${_ctStudents.length})</b>${
        _ctStudentsFromCache ? ' · مخزَّن على الجهاز' : ''}</div>`;

    if (!items.length) {
        list.innerHTML = head + `<div class="students-empty">${
            _ctStudents.length ? 'لا نتائج للبحث' : 'لا مسجّلين بعد — اضغط «إضافة طلاب»'}</div>`;
        return;
    }
    list.innerHTML = head + items.map(s => `
        <div class="student-card">
            <div class="student-card-head">
                <span class="student-name">${escapeHtml(s.name)}</span>
                <span class="cr-pill ${s.status === 5 ? '' : 'accent'}">${s.status === 5 ? 'إضافي' : 'معتمد'}</span>
            </div>
            <div class="cr-sub">🪪 ${escapeHtml(s.idNo)}${
                s.registerDate ? ' · سُجّل ' + escapeHtml(s.registerDate) : ''}</div>
        </div>`).join('');
}

function openCtAddStudents() {
    const c = _ctOpen;
    if (!c) return;
    const no = c.courseNo;
    openAddCourseStudents(no, async () => {
        await coursesStoreDelete('courses', 'ct_roster_' + no);
        await loadCtStudents(true);
        loadMyCourses(false);   // عدد المسجّلين في البطاقة تغيّر
    });
}

/* ============================================================================
   إشراف الدورات — هرمٌ موازٍ لإشراف التحفيظ
   ----------------------------------------------------------------------------
   المواضع ← دورات الموضع ← كشف المسجّلين (عرضًا واعتمادًا لا رصدًا) ← سجلّ الحضور.
   ⚠️ «المواضع التي فيها دورات» لا «المراكز المصنّفة دورات»: الدائرة (TAJW)
      تملك الدورة، والدورة تُعقد في مركزٍ آخر — فالقائمة من رؤوس الدورات.
   ============================================================================ */

let _svCenters = [], _svCentersFromCache = false, _svCentersError = '';
let _svCenter = null;            // { centerNo, centerName }
let _svState = 'all';
let _svCourses = [], _svCoursesFromCache = false, _svCoursesError = '';
let _svCourse = null;            // ملخّص الدورة المفتوحة (من sv/courses)
let _svRoster = null;            // { detail, criteria, stages, tiers }
let _svRosterFromCache = false, _svRosterError = '';
let _svRosterFilter = 'all';     // all · none · partial · done
let _svBusy = false;
let _svListStale = false;        // تغيّر الاعتماد ⇒ تُعاد القائمة عند الرجوع
let _svAtt = null;               // { days, students }
let _svAttFromCache = false, _svAttError = '';
let _svAttByDay = true;
let _svAttFrom = 'courses';      // من أين فُتح سجلّ الحضور (للرجوع)

const SV_STATES = [['all', 'الكل'], ['active', 'جارية'], ['upcoming', 'قادمة'],
                   ['ended', 'منتهية'], ['approved', 'معتمدة']];

/* ---------- التبديل بين «اختبارات الدورات» و«إشراف الدورات» ---------- */

function getCoursesMode() {
    try { return localStorage.getItem('courses_mode') === 'sv' ? 'sv' : 'exams'; }
    catch (_) { return 'exams'; }
}

function setCoursesMode(mode) {
    try { localStorage.setItem('courses_mode', mode === 'sv' ? 'sv' : 'exams'); } catch (_) {}
    openCoursesHome();
}

function openCoursesHome() {
    if (canSuperviseCourses() && getCoursesMode() === 'sv') return showSvCenters();
    showCoursesView('coursesListView');
    loadCourses();
}

function updateCoursesModeBar(viewName) {
    const bar = crEl('coursesModeBar');
    if (!bar) return;
    const top = viewName === 'coursesListView' || viewName === 'svCentersView';
    bar.style.display = (top && canSuperviseCourses()) ? 'flex' : 'none';
    const mode = viewName === 'svCentersView' ? 'sv' : 'exams';
    Array.prototype.forEach.call(bar.querySelectorAll('button[data-mode]'), b => {
        b.classList.toggle('active', b.getAttribute('data-mode') === mode);
    });
}

/* ---------- النماذج ---------- */

function normalizeSvCenter(j) {
    const name = crS(j.center_name) || ('مركز ' + j.center_no);
    const root = crS(j.root_center_name);
    return {
        centerNo       : Number(j.center_no || 0),
        centerName     : name,
        // اسم الجذر إن أضاف معنًى — لا «الإدارة العامة › الإدارة العامة»
        pathPrefix     : (root && root !== name) ? root : null,
        courses        : Number(j.courses || 0),
        activeCourses  : Number(j.active_courses || 0),
        upcomingCourses: Number(j.upcoming_courses || 0),
        endedCourses   : Number(j.ended_courses || 0),
        students       : Number(j.students || 0),
        teachers       : Number(j.teachers || 0),
    };
}

function normalizeSvCourse(j) {
    return {
        courseNo       : Number(j.course_no || 0),
        courseName     : crS(j.course_name) || ('دورة ' + j.course_no),
        centerNo       : Number(j.center_no || 0),
        courseClassNo  : crN(j.course_class_no),
        className      : crSN(j.class_name),
        startDate      : crDate(j.start_date),
        endDate        : crDate(j.end_date),
        placeName      : crSN(j.place_name),
        teacherIdNo    : crSN(j.teacher_id_no),
        teacherName    : crSN(j.teacher_name),
        teacherMobile  : crSN(j.teacher_mobile_no),
        state          : crS(j.state) || 'UNKNOWN',
        weekNo         : crN(j.week_no),
        weeksTotal     : crN(j.weeks_total),
        daysToStart    : crN(j.days_to_start),
        daysSinceEnd   : crN(j.days_since_end),
        students       : Number(j.students || 0),
        stages         : Number(j.stages || 0),
        classTotalMark : crN(j.class_total_mark),
        midDone        : Number(j.mid_done || 0),
        finalDone      : Number(j.final_done || 0),
        results        : Number(j.results || 0),
        avgPct         : crN(j.avg_pct),
        cnt95          : Number(j.cnt_95 || 0),
        cnt90          : Number(j.cnt_90 || 0),
        cnt85          : Number(j.cnt_85 || 0),
        approved       : Number(j.approved || 0),
        approved90     : Number(j.approved_90 || 0),
        sponsorReady   : crS(j.sponsor_ready).toUpperCase() === 'Y',
        schedDays      : Number(j.sched_days || 0),
        attDays        : Number(j.att_days || 0),
        unrecordedDays : Number(j.unrecorded_days || 0),
        attPct         : crN(j.att_pct),
        // ⚠️ الغائب null لا false: false يُخفي زرّ الحذف عن المدير نفسه، و null
        //    يُرجع إلى canManageCourses كما كان قبل العمود. والقرار من السيرفر:
        //    العميل لا يعرف مَن أنشأ الدورة.
        canDelete      : (j.can_delete == null) ? null : crS(j.can_delete).toUpperCase() === 'Y',
        // null ⇒ سيرفرٌ لم يُضف العمود (§7 من ords_course_results.sql) — «غير معتمدة»
        resultsApproved: (j.results_approved == null) ? null
                         : crS(j.results_approved).toUpperCase() === 'Y',
    };
}

// دورةٌ بلا ورقة درجات ⇒ لا رصد فيها (إدخالٌ مباشر وحده)
function svHasScheme(c) { return c.stages > 0 && c.courseClassNo != null; }
function svHasMid(c) { return c.stages > 1; }
// «انتظام ٠٪» على دورةٍ لم يُرصد فيها حضورٌ قطّ كذبٌ لا معلومة ⇒ تُخفى الشارة
function svAttTracked(c) { return c.attDays > 0 && c.attPct != null; }

/* ---------- المواضع ---------- */

function showSvCenters() {
    showCoursesView('svCentersView');
    renderSvCenters();
    loadSvCenters(false);
}

async function loadSvCenters(forceOnline) {
    if (!_svCenters.length) {
        const cached = await coursesStoreGet('courses', 'cs_centers');
        if (Array.isArray(cached)) {
            _svCenters = cached.map(normalizeSvCenter);
            _svCentersFromCache = true;
            renderSvCenters();
        }
    }
    try {
        const r = await crCached('cs_centers', () => QMC.getCourseCenters(), !!forceOnline);
        _svCenters = (r.data || []).map(normalizeSvCenter);
        _svCentersFromCache = r.fromCache;
        _svCentersError = '';
    } catch (err) {
        _svCentersError = crErrorText(err, 'sv');
    }
    renderSvCenters();
}

function svBanners(fromCache, error, hasData) {
    let b = '';
    if (fromCache && hasData) {
        b += `<div class="cr-banner info"><i class="fas fa-hard-drive"></i>
            <div class="cr-banner-text">بيانات مخزَّنة على الجهاز</div></div>`;
    }
    if (error && hasData) b += `<div class="cr-note warn" style="margin-bottom:10px">${crHtmlLines(error)}</div>`;
    return b;
}

function renderSvCenters() {
    const list = crEl('svCentersList');
    if (!list) return;
    const banner = crEl('svCentersBanner');
    if (banner) banner.innerHTML = svBanners(_svCentersFromCache, _svCentersError, _svCenters.length);

    if (!_svCenters.length) {
        list.innerHTML = `<div class="students-empty">${
            _svCentersError ? crHtmlLines(_svCentersError) : 'لا مواضع فيها دورات بعد'}</div>`;
        return;
    }

    const q = normalizeAr((crEl('svCenterSearch') || {}).value || '').toLowerCase();
    const html = _svCenters.map((c, i) => {
        if (q && normalizeAr(c.centerName).toLowerCase().indexOf(q) === -1) return '';
        return `
        <div class="student-card roster-card" onclick="openSvCourses(${i})">
            ${c.pathPrefix ? `<div class="cr-sub" style="margin:0">${escapeHtml(c.pathPrefix)} ›</div>` : ''}
            <div class="student-card-head">
                <span class="student-name"><i class="fas fa-building-columns" style="color:#00897b"></i> ${escapeHtml(c.centerName)}</span>
                <span class="cr-pill accent">${c.courses} دورة</span>
            </div>
            <div class="cr-sub">${c.activeCourses > 0
                ? 'دورات جارية: ' + c.activeCourses + ' · مسجّلون: ' + c.students
                : 'لا دورات جارية · ' + c.endedCourses + ' منتهية'}<br>
                المجموع: ${c.courses} دورة · ${c.teachers} معلّماً</div>
        </div>`;
    }).join('');
    list.innerHTML = html || '<div class="students-empty">لا نتائج مطابقة لبحثك</div>';
}

/* ---------- دورات الموضع ---------- */

function openSvCourses(i) {
    const c = _svCenters[i];
    if (!c) return;
    _svCenter = { centerNo: c.centerNo, centerName: c.centerName };
    _svCourses = [];
    _svCoursesError = '';
    showCoursesView('svCoursesView');
    const title = crEl('svCoursesTitle');
    if (title) title.textContent = 'الدورات — ' + c.centerName;
    const search = crEl('svCourseSearch');
    if (search) search.value = '';
    loadSvCourses(false);
}

function setSvState(s) {
    if (s === _svState) return;
    _svState = s;
    _svCourses = [];
    loadSvCourses(false);
}

async function loadSvCourses(forceOnline) {
    const center = _svCenter;
    if (!center) return;
    const state = _svState;
    // 🏅 «معتمدة» ليست حالةً زمنية يعرفها السيرفر — تُجلب الكلّ وتُرشَّح هنا.
    //    ولو غاب العمود من sv/courses عادت فارغة، لا خاطئة.
    const approvedOnly = state === 'approved';
    const apiState = approvedOnly ? 'all' : state;
    const key = 'cs_courses_' + center.centerNo + '_' + apiState;
    const pick = rows => {
        const list = (rows || []).map(normalizeSvCourse);
        return approvedOnly ? list.filter(c => c.resultsApproved === true) : list;
    };

    if (!_svCourses.length) {
        const cached = await coursesStoreGet('courses', key);
        if (Array.isArray(cached)) {
            _svCourses = pick(cached);
            _svCoursesFromCache = true;
        }
    }
    renderSvCourses(!_svCourses.length);

    try {
        const r = await crCached(key, () => QMC.getSvCourses(center.centerNo, apiState), !!forceOnline);
        if (_svCenter !== center || _svState !== state) return;   // تغيّر المرشّح أثناء الجلب
        _svCourses = pick(r.data);
        _svCoursesFromCache = r.fromCache;
        _svCoursesError = '';
    } catch (err) {
        if (_svCenter !== center || _svState !== state) return;
        _svCoursesError = crErrorText(err, 'sv');
    }
    _svListStale = false;
    renderSvCourses(false);
}

function svStateStyle(c) {
    if (c.state === 'ACTIVE') {
        return { cls: 'accent', label: 'جارية' + ((c.weekNo != null && c.weeksTotal != null)
            ? ' · الأسبوع ' + c.weekNo + ' من ' + c.weeksTotal : '') };
    }
    if (c.state === 'UPCOMING') {
        return { cls: '', label: c.daysToStart == null ? 'لم تبدأ' : 'لم تبدأ · بعد ' + c.daysToStart + ' يوماً' };
    }
    if (c.state === 'ENDED') {
        return { cls: 'warn', label: c.daysSinceEnd == null ? 'منتهية' : 'منتهية منذ ' + c.daysSinceEnd + ' يوماً' };
    }
    return { cls: '', label: 'بلا تواريخ' };
}

/* ⚠️ **الأعلى أوّلًا لا المتوسّط أوّلًا** — طلب لجنة التجويد: من نتائج طلابها
   ٩٥ فما فوق، ثم ٩٠، ثم ٨٥، والمتوسّط فاصلٌ أخير. */
function svMeritCmp(a, b) {
    const ka = [a.cnt95, a.cnt90, a.cnt85, a.avgPct == null ? -1 : a.avgPct, a.results];
    const kb = [b.cnt95, b.cnt90, b.cnt85, b.avgPct == null ? -1 : b.avgPct, b.results];
    for (let i = 0; i < ka.length; i++) {
        if (kb[i] !== ka[i]) return kb[i] - ka[i];
    }
    return a.courseName.localeCompare(b.courseName);
}

// لوحتان مطويّتان افتراضًا ومحسوبتان مما هو معروض — الشاشة سِجِلُّ عملٍ لا تقرير
function svPanelsHtml(items) {
    if (!items.length) return '';
    const byClass = {};
    items.forEach(c => {
        const k = (c.className || '').trim() || 'بلا تصنيف';
        byClass[k] = (byClass[k] || 0) + 1;
    });
    const rows = Object.keys(byClass).map(k => [k, byClass[k]]).sort((a, b) => b[1] - a[1]);
    let stateLabel = 'الكل';
    SV_STATES.forEach(s => { if (s[0] === _svState) stateLabel = s[1]; });

    let html = `<details class="cr-panel"><summary>التصنيفات (${stateLabel}) · ${items.length}</summary>${
        rows.map(r => `<div class="cr-panel-row"><span class="grow">${escapeHtml(r[0])}</span>
            <span class="cr-pill accent">${r[1]}</span></div>`).join('')}</details>`;

    const ranked = items.filter(c => c.results > 0).sort(svMeritCmp);
    if (ranked.length) {
        const tally = (label, n) => `<span class="cr-tally"><b class="${n > 0 ? '' : 'zero'}">${n}</b>${label}</span>`;
        html += `<details class="cr-panel"><summary>الدورات المتميّزة · ${ranked.length}</summary>${
            ranked.slice(0, 5).map((c, i) => `<div class="cr-panel-row">
                <span class="cr-pill ${i === 0 ? 'ok' : ''}">${i + 1}</span>
                <span class="grow">${escapeHtml(c.courseName)}<br><small>${escapeHtml(c.className || '')} · ${
                    c.results} نتيجة${c.avgPct != null ? ' · متوسّط ' + c.avgPct.toFixed(1) + '٪' : ''}</small></span>
                ${tally('٩٥+', c.cnt95)}${tally('٩٠+', c.cnt90)}${tally('٨٥+', c.cnt85)}
            </div>`).join('')}
            <div class="cr-sub" style="padding-bottom:8px">الترتيب بعدد الحاصلين على ٩٥٪ فأكثر، ثم ٩٠–٩٤، ثم ٨٥–٨٩، ثم المتوسّط.</div>
        </details>`;
    }
    return html;
}

function renderSvCourses(loading) {
    const list = crEl('svCoursesList');
    if (!list) return;

    const chips = crEl('svStateChips');
    if (chips) {
        chips.innerHTML = SV_STATES.map(s => `<button type="button" class="cr-chip ${
            s[0] === _svState ? 'active' : ''}" onclick="setSvState('${s[0]}')">${s[1]}</button>`).join('');
    }
    const banner = crEl('svCoursesBanner');
    if (banner) banner.innerHTML = svBanners(_svCoursesFromCache, _svCoursesError, _svCourses.length);
    const panels = crEl('svCoursesPanels');
    if (panels) panels.innerHTML = svPanelsHtml(_svCourses);

    if (!_svCourses.length) {
        list.innerHTML = `<div class="students-empty">${loading ? 'جارٍ التحميل…'
            : (_svCoursesError ? crHtmlLines(_svCoursesError) : 'لا دورات بهذا المرشّح')}</div>`;
        return;
    }

    const q = normalizeAr((crEl('svCourseSearch') || {}).value || '').toLowerCase();
    const html = _svCourses.map((c, i) => {
        if (q) {
            const hay = normalizeAr(c.courseName + ' ' + (c.className || '') + ' ' + (c.teacherName || '')).toLowerCase();
            if (hay.indexOf(q) === -1) return '';
        }
        return svCourseCardHtml(c, i);
    }).join('');
    list.innerHTML = html || '<div class="students-empty">لا نتائج مطابقة لبحثك</div>';
}

function svCourseCardHtml(c, i) {
    const st = svStateStyle(c);
    const hasScheme = svHasScheme(c);

    const pills = [`<span class="cr-pill ${st.cls}">${escapeHtml(st.label)}</span>`];
    // 🏅 اعتماد النتائج يلي الحالة لأنه خاتمتها
    if (c.resultsApproved === true) pills.push('<span class="cr-pill ok">✓ نتائج معتمدة</span>');
    if (svAttTracked(c)) pills.push(`<span class="cr-pill ${crPctCls(c.attPct)}">انتظام ${c.attPct}٪</span>`);
    if (!hasScheme) pills.push('<span class="cr-pill crit">لا ورقة درجات</span>');
    // 🔑 أهليّة الكفالة: ١٢ معتمداً و١٠ منهم في التسعينات — وتُعرض للمنتهية وحدها:
    //    «غير مؤهّلة» عن دورةٍ جارية حكمٌ قبل أوانه
    if (c.sponsorReady) pills.push('<span class="cr-pill ok">مؤهّلة للكفالة ✓</span>');
    else if (c.state === 'ENDED' && c.approved > 0) {
        pills.push(`<span class="cr-pill">معتمدون ${c.approved}${
            c.approved90 > 0 ? ' · في التسعينات ' + c.approved90 : ''}</span>`);
    }

    let progress = '';
    if (c.students > 0 && hasScheme) {
        const p = Math.max(0, Math.min(1, c.finalDone / c.students));
        progress = `<div class="cr-progress-label"><span>الرصد</span><span>${
            svHasMid(c) ? 'نصفي ' + c.midDone + '/' + c.students + ' · ' : ''}نهائي ${c.finalDone}/${c.students}</span></div>
            <div class="cr-progress ${p >= 1 ? 'done' : ''}"><span style="width:${Math.round(p * 100)}%"></span></div>`;
    }

    const notes = [];
    if (!hasScheme) notes.push('<div class="cr-note crit">⛔ تصنيف الدورة غير مربوط بمخطّط — لا يمكن الرصد فيها</div>');
    if (c.state === 'ENDED' && c.finalDone < c.students) {
        notes.push(`<div class="cr-note warn">⚠️ ${c.students - c.finalDone} مسجّلاً بلا نتيجة نهائية بعد انتهاء الدورة</div>`);
    }
    if (c.unrecordedDays > 0 && c.state !== 'UPCOMING') {
        notes.push(`<div class="cr-note warn">📆 ${c.unrecordedDays} من ${c.schedDays} لقاءً بلا تسجيل حضور</div>`);
    }

    const canDelete = (c.canDelete == null) ? canManageCourses() : c.canDelete;

    return `
    <div class="student-card roster-card" onclick="openSvRoster(${i})">
        <div class="student-card-head">
            <span class="student-name">${escapeHtml(c.courseName)}</span>
            <i class="fas fa-chevron-left" style="color:#9aa0a6"></i>
        </div>
        <div class="cr-sub">
            ${c.className ? '🎓 ' + escapeHtml(c.className) + '<br>' : ''}
            <span class="${c.teacherName ? '' : 'warn'}">🧑‍🏫 ${escapeHtml(c.teacherName || 'لم يُسنَد معلّم')}${
                c.teacherMobile ? ' · ' + escapeHtml(c.teacherMobile) : ''}</span><br>
            ${c.startDate ? '📅 ' + escapeHtml(c.startDate) + (c.endDate ? ' — ' + escapeHtml(c.endDate) : '') +
                (c.placeName ? ' · 📍 ' + escapeHtml(c.placeName) : '') + '<br>' : ''}
            👥 المسجّلون: ${c.students}
        </div>
        <div class="cr-pills">${pills.join('')}</div>
        ${progress}
        ${notes.join('')}
        <div class="cr-actions">
            <button type="button" class="cr-action" onclick="event.stopPropagation(); openSvRoster(${i})">
                <i class="fas fa-list-check"></i> كشف المسجّلين</button>
            <button type="button" class="cr-action ${svAttTracked(c) ? 'ok' : 'muted'}"
                    onclick="event.stopPropagation(); openSvAttendance(${i})">
                <i class="fas fa-calendar-check"></i> سجلّ الحضور</button>
            ${canDelete ? `<button type="button" class="cr-action crit" onclick="event.stopPropagation(); svDeleteCourse(${i})">
                <i class="fas fa-trash"></i> حذف الدورة</button>` : ''}
        </div>
    </div>`;
}

/* حذف الدورة بكشفها — لا رجعة فيه.
   🔑 عدد المسجّلين في التأكيد: حذفُ دورةٍ فيها ثلاثون مسجّلاً قرارٌ غير حذف
      دورةٍ فارغة أُنشئت مكرّرةً. والسيرفر يرفض الحذف إن رُصدت نتيجة، ولغير
      منشئها — والرسالة تُعرض كما هي. */
async function svDeleteCourse(i) {
    const c = _svCourses[i];
    if (!c) return;
    const ok = await showConfirm({
        title: 'حذف الدورة',
        message: `حذف «${c.courseName}» (رقم ${c.courseNo})؟\n\n` +
                 (c.students > 0 ? `سيُحذف معها كشف ${c.students} مسجّلاً.` : 'لا مسجّلين فيها.') +
                 '\nلا يمكن التراجع، ويُرفض الحذف إن رُصدت فيها نتائج.',
        confirmText: 'حذف', danger: true, icon: '🗑️',
    });
    if (!ok) return;
    if (!navigator.onLine) {
        return showAlert({ title: 'لا يوجد اتصال', message: 'حذف الدورة يتطلّب اتصالاً.', icon: '📡' });
    }
    try {
        const res = await QMC.deleteCourse(c.courseNo);
        await coursesStoreDelete('courses', 'course_' + c.courseNo);
        await coursesStoreDelete('courses', 'cs_roster_' + c.courseNo);
        showToast('🗑️ حُذفت الدورة ' + c.courseNo + (res && res.students ? ' وكشف ' + res.students + ' مسجّلاً' : ''));
        await loadSvCourses(true);
    } catch (err) {
        showAlert({ title: 'تعذّر الحذف', message: (err && err.message) || 'خطأ غير معروف', icon: '⚠️' });
    }
}

function backToSvCourses() {
    showCoursesView('svCoursesView');
    // ⚠️ تُعاد القائمة **إن تغيّر الاعتماد وحده** — لا بعد كل فتحٍ للكشف
    if (_svListStale) loadSvCourses(true);
    else renderSvCourses(false);
}

/* ---------- كشف المسجّلين (الإشراف) ----------
   ⚠️ عرضًا لا رصدًا: اللمس يفتح تفصيل النتيجة لا ورقة الرصد — المشرف يقرأ عمل
      غيره ولا يكتب فوقه.
   🔑 والمجموع من المخطّط على السيرفر (stages/class_total_mark) لا من المخطّطات
      المحلّية: مشرفٌ لا يرصد قد لا تكون مخطّطاته على جهازه قطّ. */

async function openSvRoster(i) {
    const c = _svCourses[i];
    if (!c) return;
    _svCourse = c;
    _svRoster = null;
    _svRosterError = '';
    _svRosterFilter = 'all';
    showCoursesView('svRosterView');
    const title = crEl('svRosterTitle');
    if (title) title.textContent = 'كشف المسجّلين — ' + c.courseName;
    const search = crEl('svRosterSearch');
    if (search) search.value = '';
    renderSvRoster();
    await loadSvRoster(false);
}

async function loadSvRoster(forceOnline) {
    const c = _svCourse;
    if (!c) return;
    _svBusy = true;
    renderSvRoster();
    try {
        const r = await crCached('cs_roster_' + c.courseNo, () => QMC.getSvRoster(c.courseNo), !!forceOnline);
        if (_svCourse !== c) return;
        _svRoster = normalizeSvRoster(r.data);
        _svRosterFromCache = r.fromCache;
        _svRosterError = '';
    } catch (err) {
        if (_svCourse !== c) return;
        _svRosterError = crErrorText(err, 'sv');
    } finally {
        if (_svCourse === c) _svBusy = false;
    }
    renderSvRoster();
}

function normalizeSvRoster(raw) {
    const r = raw || {};
    const detail = normalizeCourseDetail(r);
    // تصنيف المسجَّل (1 معتمد · 5 إضافي) لا تقرؤه normalizeCourseDetail — يلزم هنا وحده
    const statusById = {};
    (r.students || []).forEach(s => { statusById[String(s.id_no)] = Number(s.student_status || 1); });
    detail.students.forEach(s => { s.studentStatus = statusById[s.idNo] || 1; });

    return {
        detail: detail,
        criteria: (r.criteria || []).map(j => ({
            stage      : crS(j.stage).toUpperCase(),
            labelAr    : crS(j.label_ar),
            maxMark    : crN(j.max_mark) || 0,
            sortOrder  : Number(j.sort_order || 0),
            // الغائب MARK: أسوأ أثرٍ للخطأ فيه أن يُعرض عددُ أخطاءٍ كأنه درجة
            inputMode  : crS(j.input_mode).toUpperCase() || 'MARK',
            pointWeight: crN(j.point_weight),
            code       : crS(j.question_type) + '_' + Number(j.question_no || 0),
        })),
        stages: (r.stages || []).map(j => ({
            stage: crS(j.stage).toUpperCase(), totalMark: crN(j.total_mark) || 0,
        })),
        // ⚠️ الترتيب هو المنطق: أوّل فئةٍ تنطبق
        tiers: (r.tiers || []).map(j => ({ labelAr: crS(j.label_ar), minPercent: crN(j.min_percent) })),
    };
}

function svRecordOf(idNo, stage) {
    if (!_svRoster) return null;
    const ex = _svRoster.detail.exams;
    for (let i = 0; i < ex.length; i++) {
        if (ex[i].idNo === String(idNo) && ex[i].stage === stage) return ex[i];
    }
    return null;
}

/* درجتا المسجَّل — 🔑 مصدران لا واحد: ذات ورقة الدرجات من النتائج المرصودة،
   وما لا ورقة له من أعمدة الكشف (SMTR_AVG/FINAL_AVG) — السبيل الوحيد فيه. */
function svMarksOf(s) {
    if (svHasScheme(_svCourse)) {
        const mid = svRecordOf(s.idNo, 'MID'), fin = svRecordOf(s.idNo, 'FINAL');
        return [mid ? mid.totalMark : null, fin ? fin.totalMark : null];
    }
    return [s.smtrAvg, s.finalAvg];
}

// ⚠️ صفٌّ قديم: مجموعٌ محفوظ بلا تفصيل (STUDENT_AVG أقدم من عمودَي المرحلتين)
function svIsLegacy(s) {
    return !svHasScheme(_svCourse) && s.smtrAvg == null && s.finalAvg == null && s.studentAvg != null;
}

function svTotalOf(s) {
    const m = svMarksOf(s);
    if (m[0] != null || m[1] != null) return (m[0] || 0) + (m[1] || 0);
    return svIsLegacy(s) ? s.studentAvg : null;
}

// لم يُرصد · ناقص · مكتمل
function svStatusOf(s) {
    const m = svMarksOf(s);
    if (m[0] == null && m[1] == null) return svIsLegacy(s) ? 'done' : 'none';
    if (!svHasScheme(_svCourse)) return 'done';   // لا مراحلَ معرّفة ⇒ أيُّ درجةٍ كاملة
    if (m[1] != null && (!svHasMid(_svCourse) || m[0] != null)) return 'done';
    return 'partial';
}

// السقف المعتمد: من السيرفر أوّلًا ثم من رأس الدورة — لا من كاش المخطّطات المحلّي
function svMaxMark() {
    const st = _svRoster ? _svRoster.stages : [];
    const fromServer = st.reduce((a, s) => a + (s.totalMark || 0), 0);
    if (st.length && fromServer > 0) return fromServer;
    const c = _svCourse;
    if (c && c.classTotalMark != null && c.classTotalMark > 0) return c.classTotalMark;
    return null;
}

/* تقدير **الدورة** لا تقدير مرحلةٍ منها (نظير CsGrade في Flutter): النسبة تُحسب
   مرّةً واحدة من سقفٍ واحد، ثم فئات السيرفر، ثم فئات المخطّط المخزَّن. وتقديرٌ
   على نصف الدرجات كذبٌ لا نقص ⇒ للمكتمل وحده. */
function svTierOf(total, status) {
    if (status !== 'done') return null;
    const max = svMaxMark();
    if (max == null) return null;
    const pct = total / max * 100;

    const tiers = (_svRoster && _svRoster.tiers) || [];
    for (let i = 0; i < tiers.length; i++) {
        if (tiers[i].minPercent == null || pct >= tiers[i].minPercent) return tiers[i].labelAr;
    }
    const classNo = _svCourse ? _svCourse.courseClassNo : null;
    if (classNo == null) return null;
    try {
        const stages = stagesOfCourseClass(classNo);
        if (!stages.length) return null;
        let last = null;
        stages.forEach(s => { if (s.stage === 'FINAL') last = s; });
        if (!last) last = stages[stages.length - 1];
        const t = tierByPercent(last, pct);
        return t ? t.tierLabelAr : null;
    } catch (_) {
        return null;
    }
}

function svCountOf(status) {
    const all = _svRoster ? _svRoster.detail.students : [];
    if (status === 'all') return all.length;
    return all.filter(s => svStatusOf(s) === status).length;
}

function setSvRosterFilter(f) {
    _svRosterFilter = f;
    renderSvRoster();
}

function renderSvRoster() {
    const c = _svCourse;
    const list = crEl('svRosterList');
    if (!c || !list) return;
    const approved = c.resultsApproved === true;
    const max = svMaxMark();

    const head = crEl('svRosterHeader');
    if (head) {
        const total = c.classTotalMark;
        head.innerHTML =
            (c.className ? `<div class="roster-class">🎓 ${escapeHtml(c.className)}</div>` : '') +
            (total != null ? `<div class="roster-total">مجموع الدورة: ${courseNum(total)}${
                svHasMid(c) ? ' (نصفي + نهائي)' : ''}</div>` : '') +
            `<div class="roster-count">المسجّلون: ${svCountOf('all')} · مكتمل: ${svCountOf('done')} · لم يُرصد: ${svCountOf('none')}</div>` +
            // 🏅 الحالة مكتوبةً لا أيقونةً وحدها
            (approved ? '<div style="color:#137333;font-weight:700"><i class="fas fa-circle-check"></i> النتائج معتمدة — مقفلة عن الرصد، ويراها المعلّم</div>' : '') +
            (_svRosterFromCache && _svRoster ? '<div class="roster-count"><i class="fas fa-hard-drive"></i> مخزَّن على الجهاز</div>' : '');
    }

    const actions = crEl('svRosterActions');
    if (actions) {
        const dis = (_svBusy || !_svRoster) ? 'disabled' : '';
        actions.innerHTML =
            // 🏅 اعتماد النتائج: علمٌ واحد بأثرين — والشكل يقول الحالة قبل اللمس
            `<button type="button" class="cr-action ${approved ? 'ok' : 'primary'}" ${dis} onclick="svToggleApproval()">
                <i class="fas ${approved ? 'fa-lock' : 'fa-circle-check'}"></i> ${
                approved ? 'معتمدة — فكّ الاعتماد' : 'اعتماد النتائج'}</button>` +
            `<button type="button" class="cr-action" onclick="openSvAttFromRoster()">
                <i class="fas fa-calendar-check"></i> سجلّ الحضور</button>` +
            `<button type="button" class="cr-action" ${dis} onclick="openCourseSheet('sv')">
                <i class="fas fa-print"></i> طباعة الكشف</button>` +
            (canManageCourses() ? `<button type="button" class="cr-action" ${_svBusy ? 'disabled' : ''} onclick="svAddStudents()">
                <i class="fas fa-user-plus"></i> تسجيل طلاب</button>` : '') +
            `<button type="button" class="cr-action" ${_svBusy ? 'disabled' : ''} onclick="loadSvRoster(true)">
                <i class="fas fa-rotate"></i> تحديث</button>`;
    }

    const chips = crEl('svRosterChips');
    if (chips) {
        chips.innerHTML = [['all', 'الكل'], ['none', 'لم يُرصد'], ['partial', 'ناقص'], ['done', 'مكتمل']]
            .map(f => `<button type="button" class="cr-chip ${f[0] === _svRosterFilter ? 'active' : ''}"
                onclick="setSvRosterFilter('${f[0]}')">${f[1]} ${svCountOf(f[0])}</button>`).join('');
    }

    if (!_svRoster) {
        list.innerHTML = `<div class="students-empty">${
            _svRosterError ? crHtmlLines(_svRosterError) : 'جارٍ التحميل…'}</div>`;
        return;
    }

    const students = _svRoster.detail.students;
    const q = normalizeAr((crEl('svRosterSearch') || {}).value || '').toLowerCase();
    const html = students.map((s, i) => {
        const status = svStatusOf(s);
        if (_svRosterFilter !== 'all' && status !== _svRosterFilter) return '';
        if (q && normalizeAr(s.name).toLowerCase().indexOf(q) === -1 && s.idNo.indexOf(q) === -1) return '';

        const m = svMarksOf(s);
        const legacy = svIsLegacy(s);
        const tot = svTotalOf(s);
        const tier = tot != null ? svTierOf(tot, status) : null;
        const badgeCls = status === 'done' ? 'req-done' : (status === 'partial' ? 'req-pending' : 'req-other');
        const marksLine = legacy ? 'مجموعٌ محفوظ بلا تفصيل المرحلتين'
            : ((svHasMid(c) || !svHasScheme(c)) ? 'النصفي: ' + courseNum(m[0]) + ' · ' : '') +
              'النهائي: ' + courseNum(m[1]);
        const isApproved = (s.studentStatus || 1) === 1;

        return `
        <div class="student-card roster-card" onclick="openSvResult(${i})">
            <div class="student-card-head">
                <span class="student-name">${escapeHtml(s.name)}</span>
                <span class="req-badge ${badgeCls}"><bdi>${tot != null
                    ? courseNum(tot) + (max != null ? ' / ' + courseNum(max) : '') : '—'}</bdi></span>
            </div>
            <div class="req-body">
                <div class="req-row"><i class="fas fa-id-card" style="color:#5f6368"></i><span>${escapeHtml(s.idNo)}</span>
                    <span class="cr-pill tap ${isApproved ? 'accent' : ''}" title="لمسُه يبدّل التصنيف"
                          onclick="event.stopPropagation(); svToggleStatus(${i})">${isApproved ? 'معتمد' : 'إضافي'}</span></div>
                <div class="req-row"><i class="fas fa-list-ol" style="color:#1967d2"></i><span>${escapeHtml(marksLine)}</span></div>
                <div class="req-row"><i class="fas fa-award" style="color:#e8710a"></i><span>${escapeHtml(tier ||
                    (status === 'done' ? 'مكتمل' : status === 'partial' ? 'غير مكتمل' : 'لم يُرصد'))}</span></div>
            </div>
        </div>`;
    }).join('');

    list.innerHTML = html || `<div class="students-empty">${
        students.length ? 'لا نتائج' : 'لا مسجّلين في هذه الدورة'}</div>`;
}

/* 🔑 تصنيف المسجَّل ليس زينة: عليه يقوم من يُقيَّم في الزيارة الميدانية، ومتى
   تُعدّ الدورة معتمدة (12 معتمداً)، وأهليّتها للكفالة.
   ⚠️ يُحدَّث محليًّا قبل النداء ويُرجَع عند الفشل — يُبدَّل لعشراتٍ تباعًا. */
async function svToggleStatus(i) {
    const c = _svCourse;
    const s = _svRoster && _svRoster.detail.students[i];
    if (!c || !s || _svBusy) return;
    if (!navigator.onLine) {
        return showAlert({ title: 'لا يوجد اتصال', message: 'تغيير التصنيف يتطلّب اتصالاً.', icon: '📡' });
    }
    const prev = s.studentStatus || 1;
    const next = prev === 1 ? 5 : 1;
    s.studentStatus = next;
    renderSvRoster();
    try {
        await QMC.setCourseStudentStatus(c.courseNo, s.idNo, next);
        // الكشف المخزَّن يُرقَّع لا يُمحى — ليبقى يُفتح بلا شبكة
        const raw = await coursesStoreGet('courses', 'cs_roster_' + c.courseNo);
        if (raw && Array.isArray(raw.students)) {
            raw.students.forEach(x => { if (String(x.id_no) === s.idNo) x.student_status = next; });
            await coursesStorePut('courses', 'cs_roster_' + c.courseNo, raw);
        }
    } catch (err) {
        s.studentStatus = prev;
        renderSvRoster();
        showAlert({ title: 'لم يتغيّر التصنيف', message: (err && err.message) || 'تعذّر الحفظ', icon: '⚠️' });
    }
}

/* اعتماد النتائج أو فكّه.
   🔑 فعلٌ واحد بأثرين: يرى المعلّم نتائج طلابه، **وتُقفل** عن الرصد والإدخال
      المباشر. فيُسأل المشرف صراحةً، ويرى قبل الاعتماد كم مسجّلاً بلا نتيجة.
   ⚠️ ولا يُرفض الناقص: طالبٌ منقطع لم يُختبر كان سيمنع الاعتماد أبدًا. */
async function svToggleApproval() {
    const c = _svCourse;
    if (!c || !_svRoster || _svBusy) return;
    const toApprove = c.resultsApproved !== true;
    const students = _svRoster.detail.students;
    const missing = students.filter(s => s.finalAvg == null && s.studentAvg == null).length;

    const message = toApprove
        ? `باعتماد نتائج «${c.courseName}»:\n` +
          `• يراها معلّم الدورة «${c.teacherName || 'غير مُسنَد'}» في شاشة «نتائج طلابي».\n` +
          '• وتُقفل عن الرصد والإدخال المباشر حتى يُفكّ الاعتماد.\n\n' +
          (missing > 0 ? `⚠️ ${missing} من ${students.length} بلا نتيجة نهائية.`
                       : `لكلّ المسجّلين (${students.length}) نتيجة.`)
        : 'بفكّ الاعتماد تسقط النتائج عن شاشة المعلّم فوراً، ويعود الرصد مفتوحاً.';

    const ok = await showConfirm({
        title: toApprove ? 'اعتماد النتائج' : 'فكّ اعتماد النتائج',
        message: message,
        confirmText: toApprove ? 'اعتماد' : 'فكّ الاعتماد',
        danger: !toApprove,
        icon: toApprove ? '🏅' : '🔓',
    });
    if (!ok) return;
    if (!navigator.onLine) {
        return showAlert({ title: 'لا يوجد اتصال', message: 'الاعتماد يتطلّب اتصالاً.', icon: '📡' });
    }

    _svBusy = true;
    renderSvRoster();
    try {
        const msg = await QMC.approveCourseResults(c.courseNo, toApprove);
        c.resultsApproved = toApprove;
        _svListStale = true;   // شارة البطاقة ومرشّح «معتمدة» عند الرجوع
        showToast('✅ ' + msg);
    } catch (err) {
        showAlert({ title: 'لم تتغيّر حالة الاعتماد', message: (err && err.message) || 'خطأ غير معروف', icon: '⚠️' });
    } finally {
        _svBusy = false;
        renderSvRoster();
    }
}

function svAddStudents() {
    const c = _svCourse;
    if (!c) return;
    const no = c.courseNo;
    openAddCourseStudents(no, async () => {
        await coursesStoreDelete('courses', 'cs_roster_' + no);
        _svListStale = true;   // عدد المسجّلين في البطاقة
        await loadSvRoster(true);
    });
}

/* ---------- تفصيل نتيجة مسجَّل ---------- */

function svCriterionValue(cr, v) {
    if (v == null) return '—';
    if (cr.inputMode === 'ERROR') {
        return courseNum(v) + ' خطأ' + (cr.pointWeight ? ' (×' + courseNum(cr.pointWeight) + ')' : '');
    }
    if (cr.inputMode === 'INFO') return courseNum(v);
    return courseNum(v) + (cr.maxMark > 0 ? ' / ' + courseNum(cr.maxMark) : '');
}

function openSvResult(i) {
    const c = _svCourse;
    const s = _svRoster && _svRoster.detail.students[i];
    if (!c || !s) return;

    const t = crEl('svResultTitle');
    if (t) t.textContent = s.name;
    const sub = crEl('svResultSub');
    if (sub) sub.textContent = '🪪 ' + s.idNo + ' · ' + ((s.studentStatus || 1) === 1 ? 'معتمد' : 'إضافي');

    const status = svStatusOf(s);
    const tot = svTotalOf(s);
    const max = svMaxMark();
    const tier = tot != null ? svTierOf(tot, status) : null;
    let html = '';

    if (!svHasScheme(c)) {
        html = svIsLegacy(s)
            ? `<div class="cr-stage"><div class="cr-stage-head"><span>مجموعٌ محفوظ بلا تفصيل المرحلتين</span>
                <bdi>${courseNum(s.studentAvg)}</bdi></div></div>`
            : `<div class="cr-stage">
                <div class="cr-crit"><span>النصفي</span><b><bdi>${courseNum(s.smtrAvg)}</bdi></b></div>
                <div class="cr-crit"><span>النهائي</span><b><bdi>${courseNum(s.finalAvg)}</bdi></b></div>
               </div>`;
    } else {
        let stages = _svRoster.stages.map(x => x.stage);
        if (!stages.length) {
            _svRoster.criteria.forEach(cr => { if (stages.indexOf(cr.stage) === -1) stages.push(cr.stage); });
        }
        stages = stages.sort((a, b) => (a === 'MID' ? 0 : 1) - (b === 'MID' ? 0 : 1));

        html = stages.map(stage => {
            const rec = svRecordOf(s.idNo, stage);
            let stageMax = null;
            _svRoster.stages.forEach(x => { if (x.stage === stage) stageMax = x.totalMark; });
            const crits = _svRoster.criteria.filter(cr => cr.stage === stage && cr.inputMode !== 'NOTE')
                .sort((a, b) => a.sortOrder - b.sortOrder);
            const rows = crits.map(cr => {
                let v = null;
                _svRoster.detail.marks.forEach(mk => {
                    if (mk.idNo === s.idNo && mk.stage === stage && mk.code === cr.code) v = mk.questionMark;
                });
                return `<div class="cr-crit"><span>${escapeHtml(cr.labelAr || cr.code)}</span><b><bdi>${
                    escapeHtml(svCriterionValue(cr, v))}</bdi></b></div>`;
            }).join('');

            return `<div class="cr-stage">
                <div class="cr-stage-head"><span>${escapeHtml(stageLabel(stage))}</span><bdi>${
                    rec && rec.totalMark != null
                        ? courseNum(rec.totalMark) + (stageMax ? ' / ' + courseNum(stageMax) : '')
                        : 'لم يُرصد'}</bdi></div>
                ${rec && (rec.examDate || rec.tierLabel) ? `<div class="cr-sub" style="margin:0 0 4px">${
                    rec.examDate ? '📅 ' + escapeHtml(rec.examDate) : ''}${
                    rec.tierLabel ? ' · تقدير المرحلة: ' + escapeHtml(rec.tierLabel) : ''}</div>` : ''}
                ${rec ? rows : ''}
                ${rec && rec.notes ? `<div class="cr-note">${escapeHtml(rec.notes)}</div>` : ''}
            </div>`;
        }).join('');
    }

    html += `<div class="record-summary" style="margin-top:6px">
        <span class="record-total"><bdi>${tot != null ? courseNum(tot) + (max != null ? ' / ' + courseNum(max) : '') : '—'}</bdi></span>
        <span class="record-tier">${escapeHtml(tier ||
            (status === 'done' ? 'مكتمل' : status === 'partial' ? 'غير مكتمل' : 'لم يُرصد'))}</span>
    </div>`;

    const body = crEl('svResultBody');
    if (body) body.innerHTML = html;
    const modal = crEl('svResultModal');
    if (modal) modal.style.display = 'flex';
}

function closeSvResult() {
    const modal = crEl('svResultModal');
    if (modal) modal.style.display = 'none';
}

/* ---------- سجلّ الحضور (الإشراف) ----------
   عرضان لنفس الصفوف: **باليوم** (يقيس المعلّم) و**بالطالب** (يكشف المنقطعين).
   🔑 «بلا تسجيل» لا «لم يُعقد»: غيابُ صفوفٍ في يومٍ مجدول يحتمل الأمرين. */

function openSvAttendance(i) {
    const c = _svCourses[i];
    if (!c) return;
    _svCourse = c;
    _svAttFrom = 'courses';
    showSvAtt();
}

function openSvAttFromRoster() {
    if (!_svCourse) return;
    _svAttFrom = 'roster';
    showSvAtt();
}

function showSvAtt() {
    const c = _svCourse;
    _svAtt = null;
    _svAttError = '';
    showCoursesView('svAttView');
    const title = crEl('svAttTitle');
    if (title) title.textContent = 'سجلّ الحضور — ' + c.courseName;
    renderSvAtt();
    loadSvAtt(false);
}

function backFromSvAtt() {
    if (_svAttFrom === 'roster' && _svRoster) {
        showCoursesView('svRosterView');
        renderSvRoster();
    } else {
        backToSvCourses();
    }
}

function splitSvAtt(rows) {
    const days = [], students = [];
    (rows || []).forEach(r => {
        if (crS(r.row_type) === 'D') {
            days.push({
                date: crDate(r.att_date) || '', dow: Number(r.dow || 0),
                recorded: crS(r.recorded).toUpperCase() === 'Y',
                rows: Number(r.rows_cnt || 0), present: Number(r.present_cnt || 0),
                absent: Number(r.absent_cnt || 0), students: Number(r.students || 0),
                pct: crN(r.att_pct),
            });
        } else {
            students.push({
                idNo: crS(r.id_no), name: crS(r.student_name) || ('هوية ' + r.id_no),
                rows: Number(r.rows_cnt || 0), present: Number(r.present_cnt || 0),
                absent: Number(r.absent_cnt || 0), pct: crN(r.att_pct),
            });
        }
    });
    return { days: days, students: students };
}

async function loadSvAtt(forceOnline) {
    const c = _svCourse;
    if (!c) return;
    try {
        const r = await crCached('cs_att_' + c.courseNo, () => QMC.getSvAttendance(c.courseNo), !!forceOnline);
        if (_svCourse !== c) return;
        _svAtt = splitSvAtt(r.data);
        _svAttFromCache = r.fromCache;
        _svAttError = '';
    } catch (err) {
        if (_svCourse !== c) return;
        _svAttError = crErrorText(err, 'sv');
    }
    renderSvAtt();
}

function setSvAttByDay(v) {
    _svAttByDay = !!v;
    renderSvAtt();
}

function renderSvAtt() {
    const list = crEl('svAttList');
    if (!list) return;
    const head = crEl('svAttHeader');
    const chips = crEl('svAttChips');
    if (chips) {
        chips.innerHTML =
            `<button type="button" class="cr-chip ${_svAttByDay ? 'active' : ''}" onclick="setSvAttByDay(true)">باليوم</button>` +
            `<button type="button" class="cr-chip ${_svAttByDay ? '' : 'active'}" onclick="setSvAttByDay(false)">بالطالب</button>`;
    }

    const l = _svAtt;
    if (!l) {
        if (head) head.innerHTML = '';
        list.innerHTML = `<div class="students-empty">${_svAttError ? crHtmlLines(_svAttError) : 'جارٍ التحميل…'}</div>`;
        return;
    }

    const recorded = l.days.filter(d => d.recorded);
    const unrecorded = l.days.length - recorded.length;
    let rowsSum = 0, presSum = 0;
    l.days.forEach(d => { if (d.rows > 0) { rowsSum += d.rows; presSum += d.present; } });
    const pct = rowsSum ? Math.round(presSum * 100 / rowsSum) : null;
    const last = recorded.length ? recorded[0].date : null;   // مرتّبة تنازلياً من السيرفر

    if (head) {
        head.innerHTML =
            `<div class="roster-class">أيامٌ مسجَّلة: ${recorded.length} من ${l.days.length}</div>` +
            `<div class="roster-total">${pct == null ? 'لم يُسجَّل حضورٌ في هذه الدورة بعد'
                : 'متوسّط الحضور: ' + pct + '٪' + (last ? ' · آخر إدخال ' + escapeHtml(last) : '')}</div>` +
            (unrecorded > 0 ? `<div style="color:#8a6d00">⚠️ ${unrecorded} من أيام الدورة بلا أي تسجيل — ` +
                'قد يكون اللقاء لم يُعقد أو لم يُدخله المعلّم</div>' : '') +
            (_svAttFromCache ? '<div class="roster-count"><i class="fas fa-hard-drive"></i> مخزَّن على الجهاز</div>' : '') +
            (_svAttError ? `<div class="roster-count">${crHtmlLines(_svAttError)}</div>` : '');
    }

    if (_svAttByDay) {
        if (!l.days.length) {
            list.innerHTML = '<div class="students-empty">لا أيامَ مجدولة مضت بعد.<br>' +
                'الأيام تُحسب من أيام الدورة الأسبوعية داخل مدّتها، ويومُ اليوم لا يُحسب حتى ينقضي.</div>';
            return;
        }
        // لمسُ اليوم يفتح رصده في مكانه — المشرف يقرأ السجلّ ليجد يوماً ناقصاً فيُكمله
        list.innerHTML = l.days.map(d => `
            <div class="student-card roster-card" onclick="openSvAttEntry('${escapeHtml(d.date)}')">
                <div class="student-card-head">
                    <span class="student-name" style="${d.recorded ? '' : 'color:#b26a00'}">${
                        escapeHtml((COURSE_DAY_NAMES[d.dow] || '') + ' ' + d.date)}</span>
                    <span class="cr-pill ${d.recorded ? crPctCls(d.pct) : 'warn'}">${
                        d.pct != null ? d.pct + '٪' : 'بلا تسجيل'}</span>
                </div>
                <div class="cr-sub">${d.recorded
                    ? 'حاضر ' + d.present + (d.absent > 0 ? ' · غائب ' + d.absent : '') + ' · ' + d.students + ' مسجّلاً'
                    : 'لا صفوف لهذا اليوم'} · <i class="fas ${d.recorded ? 'fa-pen' : 'fa-user-check'}"></i> ${
                    d.recorded ? 'تعديل' : 'رصد'}</div>
            </div>`).join('');
        return;
    }

    if (!l.students.length) {
        list.innerHTML = '<div class="students-empty">لا مسجّلين في هذه الدورة</div>';
        return;
    }
    // الأقلّ انتظاماً أوّلاً — هو ما يفتح المشرف الشاشة من أجله
    const sorted = l.students.slice().sort((a, b) =>
        (a.pct == null ? 1000 : a.pct) - (b.pct == null ? 1000 : b.pct));
    list.innerHTML = sorted.map(s => `
        <div class="student-card">
            <div class="student-card-head">
                <span class="student-name">${escapeHtml(s.name)}</span>
                <span class="cr-pill ${crPctCls(s.pct)}">${s.pct != null ? s.pct + '٪' : '—'}</span>
            </div>
            <div class="cr-sub">🪪 ${escapeHtml(s.idNo)} · ${
                s.rows > 0 ? 'حاضر ' + s.present + ' من ' + s.rows : 'لا سجلّ'}</div>
        </div>`).join('');
}

function openSvAttEntry(date) {
    const c = _svCourse;
    if (!c) return;
    openAttendanceEntry({
        mode: 'sv', courseNo: c.courseNo, courseName: c.courseName,
        date: date || null,
        onSaved: () => loadSvAtt(true),
    });
}

/* ============================================================================
   كشف الدورة — طباعة · PDF · Excel   (نظير cs_course_sheet.dart)
   ----------------------------------------------------------------------------
   صفٌّ لكل مسجّل بحضوره ودرجاته وتقديره. يُفتح من كشف الإشراف ومن كشف المختبِر —
   **لا من «دوراتي»**: فيه الدرجات، والمعلّم لا يراها قبل الاعتماد.

   🔑 **الترتيب أبجديٌّ بالاسم** لا برقم التسجيل: الكشف يُسلَّم ورقةً تُبحث فيها
      الأسماء باليد.
   🔑 **يُبنى الكشف مرّةً ويُستعمل في المخرجات الثلاثة** — فلا يختلف المطبوع
      عن PDF عن Excel في رقمٍ واحد.
   ⚠️ الدرجة من **النتيجة المرصودة أوّلًا** ثم أعمدة الكشف: ما رُصد أوفلاين في
      شاشة المختبِر لم يصل الأعمدة بعد، فلو قُرئت وحدها لخرج الكشف ناقصًا في
      اليوم الذي يُطلب فيه تامًّا. (ودورةٌ بلا مخطّط لا نتائج لها ⇒ الأعمدة.)
   ============================================================================ */

let _sheet = null;

const CR_DEFAULT_HEADER = 'أكاديمية الصفا للخدمات القرآنية';

// اسم الجهة في الترويسة — من بيانات الحلقات المخزّنة، وإلّا الاسم الافتراضي
function courseSheetHeaderName() {
    try {
        if (typeof _circlesCache !== 'undefined' && Array.isArray(_circlesCache)) {
            for (let i = 0; i < _circlesCache.length; i++) {
                const c = _circlesCache[i] || {};
                const v = crS(c.centerName || c.center_name);
                if (v) return v;
            }
        }
    } catch (_) { /* الافتراضي */ }
    return CR_DEFAULT_HEADER;
}

// اسم الملفّ باسم الدورة — محارف يرفضها نظام الملفّات تُبدَّل لا تُحذف
function crSafeFileName(name) {
    const s = crS(name).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
    return s || 'كشف الدورة';
}

function crDispDate(iso) {
    const s = crS(iso);
    if (s.length < 10) return s;
    return s.substring(8, 10) + '/' + s.substring(5, 7) + '/' + s.substring(0, 4);
}

// صفوفٌ مرتّبة بالاسم. markOf(s) ⇒ [mid, fin]، وtierOf(total, complete) ⇒ نصّ
function crSheetRows(students, markOf, hasMid, tierOf, presentBy) {
    const sorted = students.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));
    return sorted.map((s, i) => {
        const m = markOf(s);
        const mid = m[0], fin = m[1];
        const any = mid != null || fin != null;
        const total = any ? (mid || 0) + (fin || 0) : (s.studentAvg != null ? s.studentAvg : null);
        // التقدير لمن اكتملت درجاته: مرحلتاه، أو مجموعٌ قديم محفوظ
        const complete = (fin != null && (!hasMid || mid != null)) || (!any && s.studentAvg != null);
        return {
            seq: i + 1, idNo: s.idNo, name: s.name,
            present: presentBy ? (presentBy[s.idNo] != null ? presentBy[s.idNo] : null) : null,
            mid: mid, fin: fin, total: total,
            tier: total == null ? null : tierOf(total, complete),
        };
    });
}

function crRecMark(rec) { return (rec && rec.totalMark != null) ? rec.totalMark : null; }

// من كشف الإشراف — ومعه عمود الحضور إن وُجد سجلّه (مخزَّنًا أو من الشبكة)
async function buildSvSheet() {
    const c = _svCourse, roster = _svRoster;
    let att = null;
    try {
        let raw = await coursesStoreGet('courses', 'cs_att_' + c.courseNo);
        if (raw == null && navigator.onLine) {
            raw = await QMC.getSvAttendance(c.courseNo);
            try { await coursesStorePut('courses', 'cs_att_' + c.courseNo, raw); } catch (_) {}
        }
        if (raw != null) att = splitSvAtt(raw);
    } catch (_) {
        att = null;   // تعذُّر السجلّ لا يُبطل الكشف — يُطوى عمود الحضور وحده
    }
    const presentBy = {};
    if (att) att.students.forEach(s => { presentBy[s.idNo] = s.present; });

    const scheme = svHasScheme(c);
    return {
        title: c.courseName, className: c.className,
        teacher: c.teacherName || null,
        startDate: c.startDate, endDate: c.endDate,
        totalDays: (att && att.days.length) ? att.days.length : null,
        rows: crSheetRows(roster.detail.students, s => {
            if (!scheme) return [s.smtrAvg, s.finalAvg];
            const mid = crRecMark(svRecordOf(s.idNo, 'MID'));
            const fin = crRecMark(svRecordOf(s.idNo, 'FINAL'));
            return [mid != null ? mid : s.smtrAvg, fin != null ? fin : s.finalAvg];
        }, svHasMid(c), (total, complete) => svTierOf(total, complete ? 'done' : 'partial'),
           att ? presentBy : null),
    };
}

// من كشف المختبِر (getCourse + ما رُصد أوفلاين) — بلا حضور: لا مصدر له هنا
function buildExamSheet() {
    const oc = _openCourse || {}, d = _courseDetail;
    const classNo = oc.courseClassNo == null ? null : oc.courseClassNo;
    const stages = classNo == null ? [] : stagesOfCourseClass(classNo);
    const scheme = stages.length > 0;
    const hasMid = classNo != null && classHasMidStage(classNo);
    return {
        title: oc.courseName || d.courseName, className: oc.className || null,
        teacher: d.teacherIdNo ? 'هوية ' + d.teacherIdNo : null,
        startDate: d.startDate || oc.startDate, endDate: d.endDate,
        totalDays: null,
        rows: crSheetRows(d.students, s => {
            if (!scheme) return [s.smtrAvg, s.finalAvg];
            const mid = crRecMark(recordOf(s.idNo, CourseStage.MID));
            const fin = crRecMark(recordOf(s.idNo, CourseStage.FINAL));
            return [mid != null ? mid : s.smtrAvg, fin != null ? fin : s.finalAvg];
        }, hasMid, (total, complete) => {
            if (!complete || !scheme) return null;
            const t = courseClassTier(classNo, total);
            return t ? t.tierLabelAr : null;
        }, null),
    };
}

async function openCourseSheet(source) {
    let sheet = null;
    try {
        if (source === 'sv') {
            if (!_svCourse || !_svRoster) return showToast('انتظر تحميل الكشف');
            sheet = await buildSvSheet();
        } else {
            if (!_courseDetail) return showToast('انتظر تحميل الكشف');
            sheet = buildExamSheet();
        }
    } catch (err) {
        return showAlert({ title: 'تعذّر بناء الكشف', message: (err && err.message) || 'خطأ غير معروف', icon: '⚠️' });
    }
    if (!sheet.rows.length) return showAlert({ message: 'لا مسجّلين في هذه الدورة', icon: 'ℹ️' });

    _sheet = sheet;
    const sub = crEl('sheetSub');
    if (sub) sub.textContent = sheet.title + ' · ' + sheet.rows.length + ' مسجّلاً';
    const note = crEl('sheetNote');
    if (note) {
        const show = source === 'sv' && sheet.totalDays == null;
        note.style.display = show ? 'block' : 'none';
        note.textContent = show ? 'ℹ️ لا سجلّ حضور لهذه الدورة — عمود الحضور لن يظهر.' : '';
    }
    const modal = crEl('sheetModal');
    if (modal) modal.style.display = 'flex';
}

function closeCourseSheet() {
    const modal = crEl('sheetModal');
    if (modal) modal.style.display = 'none';
}

function crSheetHeaders(sheet, short) {
    const h = ['م', 'رقم الهوية', 'اسم الطالب'];
    if (sheet.totalDays != null) h.push(short ? 'الحضور' : 'أيام الحضور');
    h.push('النصفي', 'النهائي', 'المجموع', 'التقدير');
    return h;
}

function crSheetInfo(sheet) {
    return {
        line1: ['المعلّم: ' + (sheet.teacher || 'غير مُسنَد')]
            .concat(sheet.className ? ['التصنيف: ' + sheet.className] : []),
        line2: [(sheet.startDate ? 'من ' + crDispDate(sheet.startDate) : '') +
                (sheet.endDate ? '  إلى ' + crDispDate(sheet.endDate) : ''),
                'المسجّلون: ' + sheet.rows.length +
                (sheet.totalDays != null ? '  ·  أيام الدورة: ' + sheet.totalDays : '')],
    };
}

// HTML واحد للطباعة و PDF
function courseSheetHtml(sheet) {
    const info = crSheetInfo(sheet);
    const num = v => (v == null ? '' : courseNum(v));
    const withAtt = sheet.totalDays != null;
    const rows = sheet.rows.map(r => `<tr>
        <td>${r.seq}</td>
        <td class="csheet-id">${escapeHtml(r.idNo)}</td>
        <td class="csheet-name">${escapeHtml(r.name)}</td>
        ${withAtt ? `<td>${r.present == null ? '—' : r.present + ' / ' + sheet.totalDays}</td>` : ''}
        <td>${num(r.mid)}</td>
        <td>${num(r.fin)}</td>
        <td><b>${num(r.total)}</b></td>
        <td class="csheet-tier">${escapeHtml(r.tier || '')}</td>
    </tr>`).join('');

    return `<div class="csheet" dir="rtl">
        <div class="csheet-org">${escapeHtml(courseSheetHeaderName())}</div>
        <div class="csheet-title">كشف ${escapeHtml(sheet.title)}</div>
        <div class="csheet-info">
            <div>${info.line1.map(t => '<span>' + escapeHtml(t) + '</span>').join('')}</div>
            <div>${info.line2.filter(Boolean).map(t => '<span>' + escapeHtml(t) + '</span>').join('')}</div>
        </div>
        <table class="csheet-table">
            <thead><tr>${crSheetHeaders(sheet, true).map(h => '<th>' + h + '</th>').join('')}</tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <div class="csheet-foot">طُبع في ${escapeHtml(crDispDate(crTodayStr()))}</div>
    </div>`;
}

/* الطباعة: منطقةٌ مخفيّة على الشاشة تظهر وحدها في @media print (app.css) —
   لا نافذةٌ جديدة: التطبيق المثبَّت على iPhone لا يفتح نوافذ منبثقة. */
function printCourseSheet() {
    if (!_sheet) return;
    const box = crEl('printSheet');
    if (!box) return;
    box.innerHTML = courseSheetHtml(_sheet);
    document.body.classList.add('printing-sheet');
    const done = () => {
        document.body.classList.remove('printing-sheet');
        window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    closeCourseSheet();
    // مهلةٌ قصيرة ليُرسم المحتوى قبل فتح حوار الطباعة
    setTimeout(() => {
        try { window.print(); }
        catch (_) { showAlert({ message: 'الطباعة غير متاحة على هذا الجهاز — استعمل PDF.', icon: 'ℹ️' }); }
    }, 60);
}

/* تسليم ملفّ: المشاركة أوّلًا (iPhone: حفظ في الملفات/واتساب/طباعة)، وإلّا تنزيل.
   ⚠️ المشاركة بعد عملٍ غير متزامن قد تُرفض لانقضاء «لمسة المستخدم» — فيُنزَّل. */
function crDeliverFile(blob, fileName, type) {
    const download = () => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.parentNode.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    };
    try {
        if (typeof File !== 'undefined' && navigator.canShare && navigator.share) {
            const file = new File([blob], fileName, { type: type });
            if (navigator.canShare({ files: [file] })) {
                navigator.share({ title: fileName, files: [file] }).catch(err => {
                    if (!err || err.name !== 'AbortError') download();
                });
                return;
            }
        }
    } catch (_) { /* تنزيل */ }
    download();
}

async function pdfCourseSheet() {
    if (!_sheet) return;
    if (!await ensurePdfLibrary()) return;
    const fileName = crSafeFileName(_sheet.title) + '.pdf';
    showToast('جارٍ إنشاء PDF…');
    try {
        const blob = await html2pdf().set({
            margin: [0.8, 0.8, 1, 0.8],
            filename: fileName,
            image: { type: 'jpeg', quality: 0.92 },
            html2canvas: { scale: 2, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'cm', format: 'a4', orientation: 'portrait' },
            // لا يُشطر صفّ طالبٍ بين صفحتين
            pagebreak: { mode: ['css', 'legacy'], avoid: 'tr' },
        }).from(courseSheetHtml(_sheet), 'string').outputPdf('blob');
        closeCourseSheet();
        crDeliverFile(blob, fileName, 'application/pdf');
    } catch (err) {
        console.error(err);
        showAlert({ title: 'تعذّر إنشاء PDF', message: (err && err.message) || 'خطأ غير معروف', icon: '⚠️' });
    }
}

async function excelCourseSheet() {
    if (!_sheet) return;
    try {
        await loadScriptOnce('xlsx.full.min.js');
    } catch (_) {
        return showAlert({ message: 'تعذّر تحميل مكتبة إكسل — تأكّد من الاتصال ثم أعد المحاولة.', icon: '⚠️' });
    }
    const s = _sheet;
    const info = crSheetInfo(s);
    const headers = crSheetHeaders(s, false);
    const withAtt = s.totalDays != null;
    const blank = v => (v == null ? '' : v);

    const aoa = [
        [courseSheetHeaderName() + '  —  كشف ' + s.title],
        [info.line1.join('   ·   ')],
        [info.line2.filter(Boolean).join('   ·   ')],
        headers,
    ].concat(s.rows.map(r => {
        // ⚠️ الهوية نصًّا (أصفارها البادئة)، والدرجات أرقاماً تبقى قابلة للجمع والفرز
        const row = [r.seq, String(r.idNo), r.name];
        if (withAtt) row.push(blank(r.present));
        row.push(blank(r.mid), blank(r.fin), blank(r.total), r.tier || '');
        return row;
    }));

    try {
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const last = headers.length - 1;
        ws['!merges'] = [0, 1, 2].map(r => ({ s: { r: r, c: 0 }, e: { r: r, c: last } }));
        const widths = [5, 14, 32];
        if (withAtt) widths.push(12);
        widths.push(10, 10, 10, 14);
        ws['!cols'] = widths.map(w => ({ wch: w }));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'كشف الدورة');
        wb.Workbook = wb.Workbook || {};
        wb.Workbook.Views = [{ RTL: true }];   // الورقة من اليمين

        const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        closeCourseSheet();
        crDeliverFile(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
                      crSafeFileName(s.title) + '.xlsx',
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch (err) {
        console.error(err);
        showAlert({ title: 'تعذّر إنشاء ملف Excel', message: (err && err.message) || 'خطأ غير معروف', icon: '⚠️' });
    }
}
