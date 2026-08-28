/* ============================================================================
   courses.js — اختبارات الدورات: القائمة، الإنشاء، تسجيل الطلبة، ورصد الدرجات.
   نقلٌ عن lib/screens/courses + lib/services/{course_exam,course_admin,grading}
   في تطبيق Flutter، بنفس العقود والقواعد.

   ⚠️ الرصد يُحفظ محلياً أولاً ثم يُرفع (المختبِر قد يكون في قاعة بلا تغطية).
      أما إنشاء الدورة وتسجيل الطلبة فيتطلبان اتصالاً: رقم الدورة يأتي من
      SEQUENCE على السيرفر، ودورةٌ بلا رقم لا يُسجَّل فيها أحد ولا يُرصد.
   ============================================================================ */

/* ===================== التخزين المحلي ===================== */

function coursesStoreGet(store, key) {
    return new Promise((resolve) => {
        if (!db || !db.objectStoreNames.contains(store)) return resolve(null);
        try {
            const req = db.transaction(store).objectStore(store).get(key);
            req.onsuccess = () => resolve(req.result ? req.result.data : null);
            req.onerror   = () => resolve(null);
        } catch (_) { resolve(null); }
    });
}

function coursesStorePut(store, key, data) {
    return new Promise((resolve, reject) => {
        if (!db || !db.objectStoreNames.contains(store)) return resolve();
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put({ key: key, data: data });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

function coursesStoreDelete(store, key) {
    return new Promise((resolve) => {
        if (!db || !db.objectStoreNames.contains(store)) return resolve();
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(key);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
    });
}

/* ===================== ثوابت المخطّطات ===================== */

const InputMode = { MARK: 'MARK', ERROR: 'ERROR', POOL: 'POOL', INFO: 'INFO', NOTE: 'NOTE' };
const CourseStage = { MID: 'MID', FINAL: 'FINAL' };
const ResultDisplay = { MARK: 'MARK', PASSFAIL: 'PASSFAIL' };

function stageLabel(stage) {
    if (stage === CourseStage.MID) return 'النصفي';
    if (stage === CourseStage.FINAL) return 'النهائي';
    return '';
}

// البند يدخل المجموع؟ (POOL محسوب، وMARK مُدخَل — وما عداهما لا يُحتسب)
function criteriaCountsInTotal(c) {
    return c.inputMode === InputMode.MARK || c.inputMode === InputMode.POOL;
}

/* ===================== محرّك التقييم ===================== */

let GRADING = { schemes: [], criteria: [], tiers: [], version: null };

function normalizeScheme(j) {
    return {
        schemeId     : Number(j.scheme_id),
        sessionId    : j.session_id == null ? null : Number(j.session_id),
        examType     : j.exam_type == null ? '' : String(j.exam_type),
        juzCount     : j.juz_count == null ? null : Number(j.juz_count),
        gradingMode  : String(j.grading_mode || 'WEIGHTED'),
        totalMark    : j.total_mark == null ? 100 : Number(j.total_mark),
        passMark     : j.pass_mark == null ? null : Number(j.pass_mark),
        courseClassNo: j.course_class_no == null ? null : Number(j.course_class_no),
        stage        : (j.stage == null || String(j.stage) === '') ? null : String(j.stage).toUpperCase(),
        resultDisplay: String(j.result_display || ResultDisplay.MARK).toUpperCase(),
    };
}

function normalizeCriteria(j) {
    const mode = String(j.input_mode || InputMode.MARK).toUpperCase();
    return {
        schemeId     : Number(j.scheme_id),
        criteriaGroup: String(j.criteria_group || ''),
        questionType : String(j.question_type),
        questionNo   : Number(j.question_no),
        labelAr      : String(j.label_ar || ''),
        maxMark      : j.max_mark == null ? 0 : Number(j.max_mark),
        sortOrder    : j.sort_order == null ? 0 : Number(j.sort_order),
        inputMode    : mode,
        pointWeight  : j.point_weight == null ? null : Number(j.point_weight),
        deductFrom   : (j.deduct_from == null || String(j.deduct_from) === '') ? null : String(j.deduct_from),
        maxInput     : j.max_input == null ? null : Number(j.max_input),
        entryRole    : String(j.entry_role || 'EXAMINER').toUpperCase(),
        code         : String(j.question_type) + '_' + Number(j.question_no),
    };
}

function normalizeTier(j) {
    return {
        schemeId   : Number(j.scheme_id),
        tierCode   : String(j.tier_code || ''),
        tierLabelAr: String(j.tier_label_ar || ''),
        minPercent : j.min_percent == null ? null : Number(j.min_percent),
        maxErrors  : j.max_errors == null ? null : Number(j.max_errors),
        maxAlerts  : j.max_alerts == null ? null : Number(j.max_alerts),
        tierOrder  : j.tier_order == null ? 0 : Number(j.tier_order),
    };
}

async function loadGradingFromDb() {
    const [schemes, criteria, tiers, version] = await Promise.all([
        coursesStoreGet('grading', 'schemes'),
        coursesStoreGet('grading', 'criteria'),
        coursesStoreGet('grading', 'tiers'),
        coursesStoreGet('grading', 'version'),
    ]);
    GRADING = {
        schemes : schemes || [],
        criteria: criteria || [],
        tiers   : tiers || [],
        version : version || null,
    };
    return GRADING;
}

// يسحب المخطّطات إن تغيّرت بصمتها أو كان المخزون فارغاً
async function refreshGradingIfNeeded(force) {
    if (!GRADING.schemes.length) await loadGradingFromDb();
    if (!navigator.onLine) return false;

    if (!force && GRADING.schemes.length) {
        const remote = await QMC.getGradingVersion();
        if (remote && remote === GRADING.version) return false;
        if (!remote) return false;                       // تعذّر الفحص ولدينا نسخة
    }

    try {
        const data = await QMC.getGradingSchemes();
        const schemes  = (data.schemes  || []).map(normalizeScheme);
        const criteria = (data.criteria || []).map(normalizeCriteria);
        const tiers    = (data.tiers    || []).map(normalizeTier);
        if (!schemes.length) return false;

        await Promise.all([
            coursesStorePut('grading', 'schemes', schemes),
            coursesStorePut('grading', 'criteria', criteria),
            coursesStorePut('grading', 'tiers', tiers),
            coursesStorePut('grading', 'version', data.version == null ? '' : String(data.version)),
        ]);
        GRADING = { schemes, criteria, tiers, version: data.version == null ? '' : String(data.version) };
        console.log(`✅ تم تحديث ${schemes.length} مخطّط تقييم (${criteria.length} بنداً، ${tiers.length} فئة)`);
        return true;
    } catch (err) {
        console.warn("تعذّر جلب مخطّطات التقييم:", err);
        return false;
    }
}

function criteriaOf(scheme) {
    return GRADING.criteria
        .filter(c => c.schemeId === scheme.schemeId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
}

function tiersOf(scheme) {
    return GRADING.tiers
        .filter(t => t.schemeId === scheme.schemeId)
        .sort((a, b) => a.tierOrder - b.tierOrder);
}

function stageRank(stage) {
    if (stage === CourseStage.MID) return 0;
    if (stage === CourseStage.FINAL) return 1;
    return 2;
}

/* مخطّط واحد لكل مرحلة في التصنيف.
   ⚠️ اللجنة قد تُدرج مخطّطاً خاصاً لنفس (التصنيف + المرحلة)، فيحمل التصنيف
      ثلاثة مخطّطات لمرحلتين ويصير جمعها الأعمى 130 — ونسبةٌ وتقديرٌ كاذبان.
      نُفضّل الافتراضي (sessionId = null) لأن مقياس الدورة يجب أن يكون المشترك. */
function stagesOfCourseClass(classNo) {
    const byStage = {};
    GRADING.schemes
        .filter(s => s.courseClassNo === Number(classNo))
        .forEach(s => {
            const key = s.stage || '';
            const cur = byStage[key];
            if (!cur || (cur.sessionId !== null && s.sessionId === null)) byStage[key] = s;
        });
    return Object.keys(byStage)
        .map(k => byStage[k])
        .sort((a, b) => stageRank(a.stage) - stageRank(b.stage));
}

// الدرجة الكلّية للدورة = مجموع درجات مراحلها (ليست 100 بالضرورة)
function courseClassTotalMark(classNo) {
    return stagesOfCourseClass(classNo).reduce((sum, s) => sum + s.totalMark, 0);
}

function classHasMidStage(classNo) {
    return stagesOfCourseClass(classNo).some(s => s.stage === CourseStage.MID);
}

// أول فئة مطابقة تفوز؛ minPercent = null تعني «بلا حدّ» (ملاذ أخير)
function tierByPercent(scheme, percent) {
    const list = tiersOf(scheme);
    for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (t.minPercent === null || percent >= t.minPercent) return t;
    }
    return null;
}

/* تقدير المجموع الكلّي للدورة — من فئات مخطّط النهائي، والنسبة على مجموع
   المراحل لا على مرحلة واحدة، وإلا ظهر من حصّل 60/100 «ممتازاً» بنسبة 200%. */
function courseClassTier(classNo, total) {
    const stages = stagesOfCourseClass(classNo);
    if (!stages.length) return null;
    const max = courseClassTotalMark(classNo);
    if (max <= 0) return null;

    let last = null;
    for (let i = stages.length - 1; i >= 0; i--) {
        if (stages[i].stage === CourseStage.FINAL) { last = stages[i]; break; }
    }
    if (!last) last = stages[stages.length - 1];
    return tierByPercent(last, (total / max) * 100);
}

/* يحسب المجموع والنسبة والتقدير من مُدخَلات البنود.
   المفتاح code، والقيمة تختلف بحسب النمط: درجة في MARK، وعدد أخطاء في ERROR،
   ورقم صفحة في INFO. بنود POOL لا تُدخَل بل تُحسب هنا. */
function computeWeighted(scheme, inputs) {
    const criteria = criteriaOf(scheme);

    // 1) وزّع خصوم الأخطاء على الأوعية
    const deductions = {};
    criteria.forEach(c => { if (c.inputMode === InputMode.POOL) deductions[c.code] = 0; });

    let looseDeduction = 0;   // أخطاء بلا وعاء ⇒ تُخصم من المجموع مباشرة
    criteria.forEach(c => {
        if (c.inputMode !== InputMode.ERROR) return;
        const count = Number(inputs[c.code] || 0);
        if (!count) return;
        const d = count * (c.pointWeight || 0);
        if (c.deductFrom && Object.prototype.hasOwnProperty.call(deductions, c.deductFrom)) {
            deductions[c.deductFrom] += d;
        } else {
            // وعاء غير موجود ليس سبباً لابتلاع الخصم صامتاً
            looseDeduction += d;
        }
    });

    // 2) الأوعية تبدأ من درجتها القصوى وتنقص — ولا تنزل تحت الصفر
    const poolMarks = {};
    criteria.forEach(c => {
        if (c.inputMode !== InputMode.POOL) return;
        const left = c.maxMark - (deductions[c.code] || 0);
        poolMarks[c.code] = left < 0 ? 0 : left;
    });

    // 3) المجموع = درجات MARK + بقايا الأوعية − خصوم بلا وعاء
    let total = 0;
    criteria.forEach(c => {
        if (c.inputMode === InputMode.MARK) total += Number(inputs[c.code] || 0);
        else if (c.inputMode === InputMode.POOL) total += poolMarks[c.code] || 0;
    });
    total -= looseDeduction;
    if (total < 0) total = 0;

    const percent = scheme.totalMark <= 0 ? 0 : (total / scheme.totalMark) * 100;
    const passed = scheme.passMark !== null ? total >= scheme.passMark : null;

    let tier = null;
    const passFailOnly = scheme.gradingMode === 'PASSFAIL' ||
                         scheme.resultDisplay === ResultDisplay.PASSFAIL;
    if (passed !== null && passFailOnly) {
        // هنا PASS_MARK وحدها تحكم — لا MIN_PERCENT
        const list = tiersOf(scheme);
        if (list.length) tier = passed ? list[0] : list[list.length - 1];
    } else {
        tier = tierByPercent(scheme, percent);
    }

    return {
        total: total, percent: percent, tier: tier, passed: passed,
        poolMarks: poolMarks, poolDeductions: deductions,
    };
}

/* ===================== حالة الشاشة ===================== */

let _courses = [];          // ملخّصات الدورات
let _courseMeta = null;     // تصنيفات ولجان نموذج الإنشاء
let _courseDetail = null;   // كشف الدورة المفتوحة
let _openCourse = null;     // ملخّص الدورة المفتوحة

const COURSE_DAY_NAMES = { 1: 'الأحد', 2: 'الإثنين', 3: 'الثلاثاء', 4: 'الأربعاء',
                           5: 'الخميس', 6: 'الجمعة', 7: 'السبت' };
// ⚠️ القيم 1=الأحد..7=السبت (ترميز أيام الحلقات)، والعرض يبدأ بالسبت
const COURSE_DAY_ORDER = [7, 1, 2, 3, 4, 5, 6];

function courseNum(v) {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    if (Number.isNaN(n)) return '—';
    if (n === Math.round(n)) return String(Math.round(n));
    return String(Number(n.toFixed(3)));
}

function normalizeCourseSummary(j) {
    return {
        courseNo     : Number(j.course_no),
        courseName   : String(j.course_name || ''),
        courseClassNo: j.course_class_no == null ? null : Number(j.course_class_no),
        className    : j.class_name == null ? null : String(j.class_name),
        startDate    : j.start_date == null ? null : String(j.start_date),
        sessionId    : j.session_id == null ? null : Number(j.session_id),
        students     : Number(j.students || 0),
        stages       : Number(j.stages || 0),
    };
}

function normalizeCourseDetail(j) {
    const c = j.course || {};
    return {
        courseNo     : Number(c.course_no || 0),
        courseName   : String(c.course_name || ''),
        courseClassNo: c.course_class_no == null ? null : Number(c.course_class_no),
        sessionId    : c.session_id == null ? null : Number(c.session_id),
        centerNo     : c.center_no == null ? null : Number(c.center_no),
        startDate    : c.start_date == null ? null : String(c.start_date).split('T')[0],
        endDate      : c.end_date == null ? null : String(c.end_date).split('T')[0],
        courseDays   : c.course_days == null ? null : String(c.course_days),
        placeName    : c.place_name == null ? null : String(c.place_name),
        teacherIdNo  : c.teacher_id_no == null ? null : String(c.teacher_id_no),
        teacherMobile: c.teacher_mobile_no == null ? null : String(c.teacher_mobile_no),
        students: (j.students || []).map(s => ({
            idNo    : String(s.id_no),
            studentNo: s.student_no == null ? null : Number(s.student_no),
            name    : (String(s.name || '').trim()) || ('هوية ' + s.id_no),
            registerDate: s.register_date == null ? null : String(s.register_date).split('T')[0],
        })),
        exams: (j.exams || []).map(e => ({
            idNo     : String(e.id_no),
            stage    : String(e.stage || '').toUpperCase(),
            totalMark: e.total_mark == null ? null : Number(e.total_mark),
            tierLabel: e.tier_label == null ? null : String(e.tier_label),
            notes    : e.notes == null ? null : String(e.notes),
            examDate : e.exam_date == null ? null : String(e.exam_date).split('T')[0],
            pending  : false,
        })),
        marks: (j.marks || []).map(m => ({
            idNo        : String(m.id_no),
            stage       : String(m.stage || '').toUpperCase(),
            questionType: String(m.question_type),
            questionNo  : Number(m.question_no),
            questionMark: m.question_mark == null ? null : Number(m.question_mark),
            code        : String(m.question_type) + '_' + Number(m.question_no),
        })),
    };
}

/* ===================== طابور الرصد ===================== */

function coursePending() {
    return coursesStoreGet('courses', 'pending').then(list => list || []);
}

async function queueCourseResult(payload) {
    const list = (await coursePending()).filter(p =>
        !(Number(p.course_no) === Number(payload.course_no) &&
          String(p.id_no) === String(payload.id_no) &&
          String(p.stage) === String(payload.stage)));
    list.push(payload);
    await coursesStorePut('courses', 'pending', list);
}

async function dequeueCourseResult(courseNo, idNo, stage) {
    const list = (await coursePending()).filter(p =>
        !(Number(p.course_no) === Number(courseNo) &&
          String(p.id_no) === String(idNo) &&
          String(p.stage) === String(stage)));
    await coursesStorePut('courses', 'pending', list);
}

async function countPendingCourseResults() {
    return (await coursePending()).length;
}

// يدمج ما لم يُرفع فوق ما جاء من السيرفر، فيرى المختبِر ما رصده للتوّ
function mergePendingIntoDetail(detail, pending) {
    const mine = pending.filter(p => Number(p.course_no) === Number(detail.courseNo));
    if (!mine.length) return detail;

    const exams = detail.exams.slice();
    const marks = detail.marks.slice();

    mine.forEach(p => {
        const id = String(p.id_no), stage = String(p.stage).toUpperCase();

        for (let i = exams.length - 1; i >= 0; i--) {
            if (exams[i].idNo === id && exams[i].stage === stage) exams.splice(i, 1);
        }
        exams.push({
            idNo: id, stage: stage,
            totalMark: p.total_mark == null ? null : Number(p.total_mark),
            tierLabel: p.tier_label || null,
            notes: p.notes || null,
            examDate: p.exam_date || null,
            pending: true,
        });

        for (let i = marks.length - 1; i >= 0; i--) {
            if (marks[i].idNo === id && marks[i].stage === stage) marks.splice(i, 1);
        }
        (p.marks || []).forEach(m => {
            marks.push({
                idNo: id, stage: stage,
                questionType: String(m.question_type),
                questionNo: Number(m.question_no),
                questionMark: m.question_mark == null ? null : Number(m.question_mark),
                code: String(m.question_type) + '_' + Number(m.question_no),
            });
        });
    });

    return Object.assign({}, detail, { exams: exams, marks: marks });
}

/* «ERR_3» ← ['ERR', 3]. يُرجع null لمفتاح مشوّه بدل إسقاط الحفظ كله */
function splitCriteriaCode(code) {
    const i = String(code).lastIndexOf('_');
    if (i <= 0 || i === String(code).length - 1) return null;
    const no = parseInt(String(code).substring(i + 1), 10);
    if (Number.isNaN(no)) return null;
    return [String(code).substring(0, i), no];
}

/* يرفع المعلّق. يُرجع { ok, rejected: [رسائل] } */
async function syncCourseResults() {
    const items = await coursePending();
    if (!items.length) return null;
    if (!navigator.onLine) return { ok: 0, rejected: [], offline: true };

    let ok = 0;
    const rejected = [];

    for (const p of items) {
        const res = await QMC.saveCourseResult(p);
        if (res.ok) {
            await dequeueCourseResult(p.course_no, p.id_no, p.stage);
            ok++;
        } else if (res.rejected) {
            // رفضٌ لن ينجح بالإعادة — يُخرَج كي لا يسدّ الطابور على البقيّة
            await dequeueCourseResult(p.course_no, p.id_no, p.stage);
            rejected.push(p.id_no + ': ' + res.error);
        }
        // عطب شبكة ⇒ يبقى في الطابور
    }

    return { ok: ok, rejected: rejected };
}

/* ===================== شاشة قائمة الدورات ===================== */

function showCoursesView(name) {
    ['coursesListView', 'courseFormView', 'courseRosterView'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === name) ? 'block' : 'none';
    });
    window.scrollTo(0, 0);
}

async function loadCourses() {
    // المخزون المحلي أولاً — يعمل دون اتصال
    if (!GRADING.schemes.length) await loadGradingFromDb();
    _courses = (await coursesStoreGet('courses', 'courses') || []).map(normalizeCourseSummary);
    _courseMeta = await coursesStoreGet('courses', 'form_meta');
    renderCoursesList();

    if (!navigator.onLine) return;

    // ارفع ما رُصد أوفلاين قبل السحب حتى لا تُدهس النتائج
    try {
        const synced = await syncCourseResults();
        if (synced && synced.rejected.length) {
            showAlert({ title: "رفض السيرفر بعض النتائج",
                        message: synced.rejected.join('\n'), icon: "⚠️" });
        }
    } catch (err) { console.warn("تعذّر رفع نتائج الدورات:", err); }

    refreshGradingIfNeeded();

    try {
        const list = await QMC.getCourses(getCurrentUser());
        await coursesStorePut('courses', 'courses', list);
        _courses = list.map(normalizeCourseSummary);
        renderCoursesList();
    } catch (err) {
        console.warn("تعذّر جلب الدورات:", err);
    }

    try {
        const meta = await QMC.getCourseFormMeta(getCurrentUser());
        await coursesStorePut('courses', 'form_meta', meta);
        _courseMeta = meta;
    } catch (err) { console.warn("تعذّر جلب بيانات نموذج الدورة:", err); }
}

function courseCardHtml(c) {
    // ⚠️ stages = 0 ⇒ لا ورقة درجات ⇒ لا يمكن الرصد، فتُعرض معطَّلة
    const hasScheme = c.stages > 0 && c.courseClassNo !== null;
    const total = hasScheme ? courseClassTotalMark(c.courseClassNo) : 0;

    const meta = [
        c.className,
        c.startDate ? String(c.startDate).split('T')[0] : '',
        c.students + ' طالب',
    ].filter(Boolean).map(escapeHtml).join(' • ');

    const warn = hasScheme ? '' :
        `<div class="course-warn"><i class="fas fa-triangle-exclamation"></i> لا ورقة درجات لتصنيف هذه الدورة — لا يمكن الرصد</div>`;

    return `
    <div class="student-card course-card">
        <div class="student-card-head">
            <span class="student-name">${escapeHtml(c.courseName)}</span>
            <span class="req-badge ${hasScheme ? 'req-done' : 'req-other'}">${
                hasScheme ? escapeHtml(courseNum(total) + ' درجة') : 'بلا ورقة'}</span>
        </div>
        <div class="req-body">
            <div class="req-row"><i class="fas fa-graduation-cap" style="color:#0b8043"></i><span>${meta}</span></div>
        </div>
        ${warn}
        <div class="student-actions">
            <button class="act-btn" title="كشف الطلبة والرصد" onclick="openCourseRoster(${c.courseNo})">
                <i class="fas fa-list-check" style="color:#1967d2"></i></button>
            <button class="act-btn" title="تعديل الدورة" onclick="openCourseForm(${c.courseNo})">
                <i class="fas fa-pen" style="color:#e8710a"></i></button>
            <button class="act-btn" title="حذف الدورة" onclick="removeCourse(${c.courseNo})">
                <i class="fas fa-trash" style="color:#c5221f"></i></button>
        </div>
    </div>`;
}

function renderCoursesList() {
    const wrap  = document.getElementById('coursesList');
    const empty = document.getElementById('coursesEmpty');
    if (!wrap) return;

    const searchEl = document.getElementById('courseSearch');
    const q = normalizeAr(searchEl ? searchEl.value : '').toLowerCase();

    let list = _courses.slice();
    if (q) {
        list = list.filter(c =>
            normalizeAr(c.courseName).toLowerCase().indexOf(q) !== -1 ||
            normalizeAr(c.className || '').toLowerCase().indexOf(q) !== -1);
    }

    wrap.innerHTML = list.map(courseCardHtml).join('');
    if (empty) {
        empty.style.display = list.length ? 'none' : 'block';
        empty.textContent = _courses.length
            ? 'لا نتائج مطابقة لبحثك'
            : 'لا دورات بعد — اضغط «دورة جديدة» للبدء';
    }
}

/* ===================== نموذج إنشاء/تعديل دورة ===================== */

function courseFormStatus(msg, color) {
    const el = document.getElementById('courseFormStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = color || '';
}

function renderCourseDayChips(selected) {
    const wrap = document.getElementById('courseDays');
    if (!wrap) return;
    const set = new Set((selected || []).map(Number));

    wrap.innerHTML = COURSE_DAY_ORDER.map(d =>
        `<label class="day-chip${set.has(d) ? ' checked' : ''}">
            <input type="checkbox" value="${d}" ${set.has(d) ? 'checked' : ''}>
            <span>${COURSE_DAY_NAMES[d]}</span>
         </label>`).join('');

    wrap.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('change', function () {
            this.closest('.day-chip').classList.toggle('checked', this.checked);
        });
    });
}

function selectedCourseDays() {
    const wrap = document.getElementById('courseDays');
    if (!wrap) return [];
    const picked = [];
    wrap.querySelectorAll('input:checked').forEach(i => picked.push(Number(i.value)));
    // الترتيب المخزَّن يتبع ترتيب العرض (السبت أولاً) كما في Flutter
    return COURSE_DAY_ORDER.filter(d => picked.indexOf(d) !== -1);
}

async function openCourseForm(courseNo) {
    const isEdit = courseNo !== undefined && courseNo !== null;

    const title = document.getElementById('courseFormTitle');
    if (title) title.textContent = isEdit ? 'تعديل الدورة' : 'دورة جديدة';
    courseFormStatus('', '');

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); };
    ['courseName', 'coursePlace', 'courseTeacherId', 'courseTeacherMobile',
     'courseStartDate', 'courseEndDate'].forEach(id => set(id, ''));
    set('courseEditNo', isEdit ? courseNo : '');

    // التصنيفات والمراكز من بيانات النموذج
    const classSel = document.getElementById('courseClassNo');
    const centerSel = document.getElementById('courseCenterNo');
    const classes = (_courseMeta && _courseMeta.classes) || [];
    const sessions = (_courseMeta && _courseMeta.sessions) || [];

    if (classSel) {
        classSel.innerHTML = '<option value="">-- اختر التصنيف --</option>' +
            classes.map(c => {
                const no = c.const_no;
                const nm = (c.const_name && String(c.const_name).trim()) || ('تصنيف ' + no);
                const has = Number(c.stages || 0) > 0;
                return `<option value="${no}">${escapeHtml(nm)}${has ? '' : ' (بلا ورقة درجات)'}</option>`;
            }).join('');
    }

    if (centerSel) {
        // المراكز من اللجان الفعّالة — لا من كاش الأسماء (نطاق لا أسماء)
        const seen = {};
        sessions.forEach(s => { if (s.center_no != null) seen[s.center_no] = s.session_name || ('مركز ' + s.center_no); });
        const emp = await getEmpRecord();
        if (emp && emp.CENTER_NO != null && !seen[emp.CENTER_NO]) {
            seen[emp.CENTER_NO] = emp.CENTER_NAME || ('مركز ' + emp.CENTER_NO);
        }
        centerSel.innerHTML = '<option value="">-- اختر المركز --</option>' +
            Object.keys(seen).map(no => `<option value="${no}">${escapeHtml(String(no) + ' — ' + seen[no])}</option>`).join('');
    }

    renderCourseDayChips([]);
    showCoursesView('courseFormView');

    if (!isEdit) return;

    // وضع التعديل: لا يُفتح النموذج ناقصاً — نموذجٌ نصفُ فارغ يُحفظ فيمحو ما لم يصل
    courseFormStatus('🔄 جارٍ جلب بيانات الدورة…', '#3498db');
    try {
        const raw = await QMC.getCourseDetail(courseNo);
        const d = normalizeCourseDetail(raw);
        if (d.centerNo === null || !d.startDate) {
            throw new Error("تعذّر جلب بيانات الدورة كاملةً من السيرفر");
        }

        set('courseName', d.courseName);
        set('coursePlace', d.placeName);
        set('courseTeacherId', d.teacherIdNo);
        set('courseTeacherMobile', d.teacherMobile);
        set('courseStartDate', d.startDate);
        set('courseEndDate', d.endDate);
        if (classSel) classSel.value = String(d.courseClassNo == null ? '' : d.courseClassNo);
        if (centerSel) centerSel.value = String(d.centerNo == null ? '' : d.centerNo);
        renderCourseDayChips((d.courseDays || '').split(':').filter(Boolean));
        courseFormStatus('', '');
    } catch (err) {
        courseFormStatus('❌ ' + (err.message || 'تعذّر جلب بيانات الدورة'), '#c0392b');
        // نُعطّل الحفظ حتى لا يُكتب نموذج ناقص فوق بيانات صحيحة
        const btn = document.getElementById('courseSaveBtn');
        if (btn) btn.disabled = true;
    }
}

async function submitCourseForm() {
    const val = id => String((document.getElementById(id) || {}).value || '').trim();

    const name = val('courseName');
    const classNo = val('courseClassNo');
    const centerNo = val('courseCenterNo');
    const start = val('courseStartDate');
    const days = selectedCourseDays();
    const teacherId = val('courseTeacherId');

    if (!name) return courseFormStatus("❌ اكتب اسم الدورة", '#c0392b');
    if (!classNo) return courseFormStatus("❌ اختر تصنيف الدورة", '#c0392b');
    if (!centerNo) return courseFormStatus("❌ اختر المركز", '#c0392b');
    if (!start) return courseFormStatus("❌ اختر تاريخ البداية", '#c0392b');
    if (!days.length) return courseFormStatus("❌ اختر أيام الدورة", '#c0392b');

    const idCheck = checkIDNumber(teacherId);
    if (idCheck !== "Y") return courseFormStatus("❌ هوية المدرّس: " + idCheck, '#c0392b');

    const end = val('courseEndDate');
    if (end && end < start) return courseFormStatus("❌ تاريخ النهاية قبل البداية", '#c0392b');

    if (!navigator.onLine) {
        return courseFormStatus(
            "❌ إنشاء الدورة يتطلّب اتصالاً — رقم الدورة يصدره السيرفر.", '#c0392b');
    }

    const editNo = val('courseEditNo');
    const payload = {
        course_name      : name,
        course_class_no  : Number(classNo),
        center_no        : Number(centerNo),
        course_start_date: start,
        course_end_date  : end || null,
        course_days      : days.join(':'),
        course_place_name: val('coursePlace') || null,
        teacher_id_no    : teacherId,
        teacher_mobile_no: val('courseTeacherMobile') || null,
    };

    const btn = document.getElementById('courseSaveBtn');
    if (btn) btn.disabled = true;
    courseFormStatus("🔄 جارٍ الحفظ…", '#3498db');

    try {
        if (editNo) {
            payload.course_no = Number(editNo);
            await QMC.updateCourse(payload);
            await coursesStoreDelete('courses', 'course_' + editNo);
            showToast("تم حفظ التعديل");
        } else {
            const no = await QMC.createCourse(payload);
            showToast("أُنشئت الدورة برقم " + no);
        }
        showCoursesView('coursesListView');
        await loadCourses();
    } catch (err) {
        console.error("❌ تعذّر حفظ الدورة:", err);
        courseFormStatus("❌ " + (err.message || 'تعذّر الحفظ'), '#c0392b');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function removeCourse(courseNo) {
    const c = _courses.find(x => Number(x.courseNo) === Number(courseNo));
    const ok = await showConfirm({
        title: "حذف الدورة",
        message: `${(c && c.courseName) || ('دورة ' + courseNo)}\n\n` +
                 "سيُحذف كشف المسجّلين معها.\nيرفض السيرفر الحذف إن رُصدت نتيجة واحدة.",
        confirmText: "حذف", danger: true, icon: "🗑️",
    });
    if (!ok) return;

    if (!navigator.onLine) {
        return showAlert({ title: "لا يوجد اتصال", message: "حذف الدورة يتطلّب اتصالاً.", icon: "📡" });
    }

    try {
        const res = await QMC.deleteCourse(Number(courseNo));
        await coursesStoreDelete('courses', 'course_' + courseNo);
        showToast("حُذفت الدورة" + (res.students ? ` و${res.students} مسجّلاً` : ''));
        await loadCourses();
    } catch (err) {
        showAlert({ title: "تعذّر الحذف", message: err.message || 'خطأ غير معروف', icon: "⚠️" });
    }
}

/* ===================== كشف الدورة (الطلبة + الرصد) ===================== */

async function readCourseDetail(courseNo) {
    const raw = await coursesStoreGet('courses', 'course_' + courseNo);
    if (!raw) return null;
    return mergePendingIntoDetail(normalizeCourseDetail(raw), await coursePending());
}

async function openCourseRoster(courseNo) {
    _openCourse = _courses.find(c => Number(c.courseNo) === Number(courseNo)) || { courseNo: Number(courseNo) };
    _courseDetail = await readCourseDetail(courseNo);

    showCoursesView('courseRosterView');
    renderCourseRoster();

    if (!navigator.onLine) return;

    try {
        const raw = await QMC.getCourseDetail(courseNo);
        await coursesStorePut('courses', 'course_' + courseNo, raw);
        _courseDetail = mergePendingIntoDetail(normalizeCourseDetail(raw), await coursePending());
        renderCourseRoster();
    } catch (err) {
        console.warn("تعذّر جلب كشف الدورة:", err);
        if (!_courseDetail) {
            const wrap = document.getElementById('rosterList');
            if (wrap) wrap.innerHTML = `<div class="students-empty">${escapeHtml(err.message || 'تعذّر جلب الكشف')}</div>`;
        }
    }
}

function backToCoursesList() {
    _courseDetail = null;
    _openCourse = null;
    showCoursesView('coursesListView');
    renderCoursesList();
}

function recordOf(idNo, stage) {
    if (!_courseDetail) return null;
    return _courseDetail.exams.find(e => e.idNo === String(idNo) && e.stage === stage) || null;
}

function renderCourseRoster() {
    const wrap  = document.getElementById('rosterList');
    const head  = document.getElementById('rosterHeader');
    const title = document.getElementById('rosterTitle');
    if (!wrap) return;

    const classNo = _openCourse ? _openCourse.courseClassNo : null;
    const stages = classNo == null ? [] : stagesOfCourseClass(classNo);
    const total = classNo == null ? 0 : courseClassTotalMark(classNo);
    const hasMid = classNo != null && classHasMidStage(classNo);

    if (title) title.textContent = (_openCourse && _openCourse.courseName) || 'كشف الدورة';

    const students = (_courseDetail && _courseDetail.students) || [];
    const recorded = new Set(((_courseDetail && _courseDetail.exams) || []).map(e => e.idNo)).size;

    if (head) {
        const parts = stages.map(s => stageLabel(s.stage) + ' ' + courseNum(s.totalMark)).join(' + ');
        head.innerHTML =
            (_openCourse && _openCourse.className ? `<div class="roster-class">🎓 ${escapeHtml(_openCourse.className)}</div>` : '') +
            (stages.length ? `<div class="roster-total">${escapeHtml(parts)} = ${escapeHtml(courseNum(total))}</div>` : '') +
            `<div class="roster-count">المسجّلون: ${students.length} · رُصد لهم: ${recorded}</div>`;
    }

    const searchEl = document.getElementById('rosterSearch');
    const q = normalizeAr(searchEl ? searchEl.value : '').toLowerCase();
    let list = students;
    if (q) {
        list = students.filter(s =>
            normalizeAr(s.name).toLowerCase().indexOf(q) !== -1 ||
            String(s.idNo).indexOf(q) !== -1);
    }

    if (!list.length) {
        wrap.innerHTML = `<div class="students-empty">${
            students.length ? 'لا نتائج مطابقة لبحثك' : 'لا مسجّلين في هذه الدورة'}</div>`;
        return;
    }

    wrap.innerHTML = list.map(s => {
        const mid = recordOf(s.idNo, CourseStage.MID);
        const fin = recordOf(s.idNo, CourseStage.FINAL);

        // ⚠️ المجموع من النتائج المرصودة لا من أعمدة الكشف: تلك تُحدَّث على
        //    السيرفر، وما رُصد أوفلاين لم يصلها بعد فيبدو الطالب بلا نتيجة.
        const sum = (mid && mid.totalMark != null ? mid.totalMark : 0) +
                    (fin && fin.totalMark != null ? fin.totalMark : 0);
        const any = (mid && mid.totalMark != null) || (fin && fin.totalMark != null);
        const complete = (!hasMid || (mid && mid.totalMark != null)) && (fin && fin.totalMark != null);
        const pending = (mid && mid.pending) || (fin && fin.pending);

        const tierObj = (any && complete && classNo != null) ? courseClassTier(classNo, sum) : null;
        const tier = tierObj ? tierObj.tierLabelAr : (any ? 'غير مكتمل' : 'لم يُرصد');

        const marksLine = (hasMid ? `النصفي: ${courseNum(mid && mid.totalMark)} · ` : '') +
                          `النهائي: ${courseNum(fin && fin.totalMark)}`;

        return `
        <div class="student-card roster-card" onclick="pickCourseStage('${escapeHtml(s.idNo)}')">
            <div class="student-card-head">
                <span class="student-name">${escapeHtml(s.name)}${
                    pending ? ' <i class="fas fa-cloud-arrow-up" style="color:#e8710a" title="لم يُرفع بعد"></i>' : ''}</span>
                <span class="req-badge ${complete ? 'req-done' : (any ? 'req-pending' : 'req-other')}">${
                    any ? escapeHtml(courseNum(sum) + ' / ' + courseNum(total)) : '—'}</span>
            </div>
            <div class="req-body">
                <div class="req-row"><i class="fas fa-id-card" style="color:#5f6368"></i><span>${escapeHtml(s.idNo)}</span></div>
                <div class="req-row"><i class="fas fa-list-ol" style="color:#1967d2"></i><span>${escapeHtml(marksLine)}</span></div>
                <div class="req-row"><i class="fas fa-award" style="color:#e8710a"></i><span>${escapeHtml(tier)}</span></div>
            </div>
        </div>`;
    }).join('');
}

// مرحلة واحدة (دورة إجازة) ⇒ لا معنى لسؤال المختبِر
async function pickCourseStage(idNo) {
    const classNo = _openCourse ? _openCourse.courseClassNo : null;
    const stages = classNo == null ? [] : stagesOfCourseClass(classNo);

    if (!stages.length) {
        return showAlert({ title: "لا ورقة درجات",
                           message: "لا ورقة درجات لتصنيف هذه الدورة — لا يمكن الرصد.", icon: "⚠️" });
    }
    if (stages.length === 1) return openCourseRecord(idNo, stages[0]);

    const student = _courseDetail.students.find(s => s.idNo === String(idNo));
    const buttons = stages.map(st => {
        const done = recordOf(idNo, st.stage) ? ' ✓ مرصود' : '';
        return `<button class="stage-pick" onclick="chooseCourseStage('${escapeHtml(idNo)}', '${escapeHtml(st.stage)}')">
                    ${escapeHtml(stageLabel(st.stage))} (من ${escapeHtml(courseNum(st.totalMark))})${done}
                </button>`;
    }).join('');

    const box = document.getElementById('stagePickBody');
    const title = document.getElementById('stagePickTitle');
    if (title) title.textContent = (student && student.name) || idNo;
    if (box) box.innerHTML = buttons;
    const overlay = document.getElementById('stagePickModal');
    if (overlay) overlay.style.display = 'flex';
}

function closeStagePick() {
    const overlay = document.getElementById('stagePickModal');
    if (overlay) overlay.style.display = 'none';
}

function chooseCourseStage(idNo, stage) {
    closeStagePick();
    const classNo = _openCourse ? _openCourse.courseClassNo : null;
    const scheme = stagesOfCourseClass(classNo).find(s => s.stage === stage);
    if (scheme) openCourseRecord(idNo, scheme);
}

/* ===================== ورقة الرصد ===================== */

const COURSE_NOTE_SEP = ' — ';
let _recordCtx = null;   // { idNo, stage, scheme, criteria }

// يستخرج قيم الحقول النصّية المحفوظة داخل الملاحظة
function parseCourseNotes(notes, criteria) {
    const out = {};
    if (!notes || !String(notes).trim()) return out;
    const parts = String(notes).split(COURSE_NOTE_SEP).map(p => p.trim());
    criteria.forEach(c => {
        if (c.inputMode !== InputMode.NOTE) return;
        const prefix = c.labelAr + ':';
        for (let i = 0; i < parts.length; i++) {
            if (parts[i].indexOf(prefix) === 0) {
                out[c.code] = parts[i].substring(prefix.length).trim();
                break;
            }
        }
    });
    return out;
}

// يزيل مقاطع الحقول النصّية فيبقى نصّ المختبِر وحده — وإلا تراكمت مع كل تعديل
function stripCourseNotes(notes, labels) {
    if (!notes || !String(notes).trim()) return '';
    return String(notes).split(COURSE_NOTE_SEP)
        .filter(p => !labels.some(l => p.trim().indexOf(l + ':') === 0))
        .join(COURSE_NOTE_SEP).trim();
}

function openCourseRecord(idNo, scheme) {
    const student = _courseDetail.students.find(s => s.idNo === String(idNo));
    const stage = scheme.stage || CourseStage.FINAL;
    const criteria = criteriaOf(scheme);
    const existing = recordOf(idNo, stage);

    _recordCtx = { idNo: String(idNo), stage: stage, scheme: scheme, criteria: criteria };

    // مُدخَلات البنود المحفوظة لهذه المرحلة
    const saved = {};
    _courseDetail.marks.forEach(m => {
        if (m.idNo === String(idNo) && m.stage === stage && m.questionMark != null) {
            saved[m.code] = m.questionMark;
        }
    });
    const savedNotes = parseCourseNotes(existing && existing.notes, criteria);

    const title = document.getElementById('recordTitle');
    if (title) title.textContent = (student && student.name) || idNo;
    const sub = document.getElementById('recordSubtitle');
    if (sub) {
        sub.textContent = ((_openCourse && (_openCourse.className || _openCourse.courseName)) || '') +
                          ' — ' + stageLabel(stage);
    }

    const dateEl = document.getElementById('recordDate');
    if (dateEl) dateEl.value = (existing && existing.examDate) || new Date().toISOString().split('T')[0];

    const notesEl = document.getElementById('recordNotes');
    const noteLabels = criteria.filter(c => c.inputMode === InputMode.NOTE).map(c => c.labelAr);
    if (notesEl) notesEl.value = stripCourseNotes(existing && existing.notes, noteLabels);

    // البنود: المختبِر أولاً ثم ما تُدخله الإدارة (النظري) في قسم منفصل
    const body = document.getElementById('recordBody');
    if (body) {
        const examiner = criteria.filter(c => c.entryRole === 'EXAMINER');
        const admin    = criteria.filter(c => c.entryRole !== 'EXAMINER');
        body.innerHTML =
            examiner.map(c => criteriaFieldHtml(c, saved, savedNotes)).join('') +
            (admin.length
                ? `<div class="record-section">بنود تُدخلها الإدارة (اختيارية)</div>` +
                  admin.map(c => criteriaFieldHtml(c, saved, savedNotes)).join('')
                : '');

        body.querySelectorAll('input').forEach(inp => {
            inp.addEventListener('input', recomputeCourseRecord);
        });
    }

    document.getElementById('recordModal').style.display = 'flex';
    recomputeCourseRecord();
}

function criteriaFieldHtml(c, saved, savedNotes) {
    const val = saved[c.code];

    if (c.inputMode === InputMode.POOL) {
        // وعاء محسوب — لا يُكتب فيه شيء
        return `<div class="crit-row crit-pool" data-code="${escapeHtml(c.code)}">
            <span class="crit-label">${escapeHtml(c.labelAr)}</span>
            <span class="crit-pool-value" id="pool_${escapeHtml(c.code)}">${escapeHtml(courseNum(c.maxMark))}</span>
            <span class="crit-max">من ${escapeHtml(courseNum(c.maxMark))}</span>
        </div>`;
    }

    if (c.inputMode === InputMode.NOTE) {
        return `<div class="crit-row">
            <span class="crit-label">${escapeHtml(c.labelAr)}</span>
            <input type="text" class="crit-input" data-code="${escapeHtml(c.code)}" data-mode="NOTE"
                   value="${escapeHtml(savedNotes[c.code] || '')}">
        </div>`;
    }

    const max = (c.inputMode === InputMode.MARK) ? c.maxMark : c.maxInput;
    const hint = (c.inputMode === InputMode.ERROR)
        ? `<span class="crit-max">${c.pointWeight ? '×' + courseNum(c.pointWeight) : ''}</span>`
        : `<span class="crit-max">${max != null ? 'من ' + courseNum(max) : ''}</span>`;

    return `<div class="crit-row">
        <span class="crit-label">${escapeHtml(c.labelAr)}</span>
        <input type="number" step="any" inputmode="decimal" class="crit-input"
               data-code="${escapeHtml(c.code)}" data-mode="${escapeHtml(c.inputMode)}"
               ${max != null ? 'max="' + max + '"' : ''} min="0"
               value="${val == null ? '' : escapeHtml(String(val))}">
        ${hint}
    </div>`;
}

function collectRecordInputs() {
    const inputs = {}, notes = {};
    document.querySelectorAll('#recordBody .crit-input').forEach(el => {
        const code = el.dataset.code;
        if (el.dataset.mode === 'NOTE') {
            notes[code] = String(el.value || '').trim();
        } else {
            const v = String(el.value || '').trim();
            if (v !== '') inputs[code] = Number(v);
        }
    });
    return { inputs: inputs, notes: notes };
}

function recomputeCourseRecord() {
    if (!_recordCtx) return;
    const { inputs } = collectRecordInputs();
    const out = computeWeighted(_recordCtx.scheme, inputs);

    // حدّث الأوعية المحسوبة أمام المختبِر
    Object.keys(out.poolMarks).forEach(code => {
        const el = document.getElementById('pool_' + code);
        if (el) {
            el.textContent = courseNum(out.poolMarks[code]);
            const ded = out.poolDeductions[code] || 0;
            el.title = ded ? ('خُصم ' + courseNum(ded)) : '';
            el.classList.toggle('deducted', ded > 0);
        }
    });

    const scheme = _recordCtx.scheme;
    const passFailOnly = scheme.resultDisplay === ResultDisplay.PASSFAIL;

    const totalEl = document.getElementById('recordTotal');
    if (totalEl) {
        totalEl.textContent = passFailOnly
            ? (out.passed ? 'مجاز' : 'غير مجاز')
            : courseNum(out.total) + ' / ' + courseNum(scheme.totalMark);
    }

    const tierEl = document.getElementById('recordTier');
    if (tierEl) {
        const bits = [];
        if (!passFailOnly) bits.push(courseNum(Math.round(out.percent * 10) / 10) + '%');
        if (out.tier) bits.push(out.tier.tierLabelAr);
        if (out.passed !== null && !passFailOnly) bits.push(out.passed ? 'مجاز' : 'غير مجاز');
        tierEl.textContent = bits.join(' · ');
    }
}

function closeCourseRecord() {
    const m = document.getElementById('recordModal');
    if (m) m.style.display = 'none';
    _recordCtx = null;
}

async function saveCourseRecord() {
    if (!_recordCtx) return;

    const { inputs, notes } = collectRecordInputs();
    const out = computeWeighted(_recordCtx.scheme, inputs);
    const criteria = _recordCtx.criteria;

    // النصّيات تُحفظ مقاطعَ داخل الملاحظة — كما في الاختبارات
    const freeNotes = String((document.getElementById('recordNotes') || {}).value || '').trim();
    const parts = [];
    criteria.forEach(c => {
        if (c.inputMode === InputMode.NOTE && notes[c.code]) {
            parts.push(c.labelAr + ': ' + notes[c.code]);
        }
    });
    if (freeNotes) parts.push(freeNotes);

    const payload = {
        course_no : Number(_openCourse.courseNo),
        id_no     : _recordCtx.idNo,
        stage     : _recordCtx.stage,
        total_mark: out.total,
        tier_label: out.tier ? out.tier.tierLabelAr : null,
        notes     : parts.length ? parts.join(COURSE_NOTE_SEP) : null,
        exam_date : String((document.getElementById('recordDate') || {}).value || '') || null,
        marks     : Object.keys(inputs).map(code => {
            const pair = splitCriteriaCode(code);
            if (!pair) return null;
            return { question_type: pair[0], question_no: pair[1], question_mark: inputs[code] };
        }).filter(Boolean),
    };

    const btn = document.getElementById('recordSaveBtn');
    if (btn) btn.disabled = true;

    try {
        // ⚠️ يُحفظ محلياً أولاً ثم يُرفع — القاعة قد تكون بلا تغطية
        await queueCourseResult(payload);

        const res = await QMC.saveCourseResult(payload);
        if (res.ok) {
            await dequeueCourseResult(payload.course_no, payload.id_no, payload.stage);
        } else if (res.rejected) {
            await dequeueCourseResult(payload.course_no, payload.id_no, payload.stage);
            _courseDetail = await readCourseDetail(_openCourse.courseNo);
            renderCourseRoster();
            closeCourseRecord();
            return showAlert({ title: "لم تُحفظ النتيجة", message: res.error, icon: "⚠️" });
        }

        _courseDetail = await readCourseDetail(_openCourse.courseNo);
        renderCourseRoster();
        closeCourseRecord();
        showToast(res.ok ? "حُفظت النتيجة" : "حُفظت محلياً — تُرفع عند عودة الشبكة");

        if (res.ok) openCourseRoster(_openCourse.courseNo);
    } catch (err) {
        console.error("❌ تعذّر حفظ النتيجة:", err);
        showAlert({ title: "تعذّر الحفظ", message: err.message || 'خطأ غير معروف', icon: "⚠️" });
    } finally {
        if (btn) btn.disabled = false;
    }
}

/* ===================== تسجيل الطلبة ===================== */

function openAddCourseStudents() {
    const box = document.getElementById('addStudentsModal');
    if (!box) return;
    const ta = document.getElementById('courseStudentIds');
    if (ta) ta.value = '';
    const d = document.getElementById('courseRegisterDate');
    if (d) d.value = new Date().toISOString().split('T')[0];
    const st = document.getElementById('addStudentsStatus');
    if (st) { st.textContent = ''; st.style.color = ''; }
    box.style.display = 'flex';
}

function closeAddCourseStudents() {
    const box = document.getElementById('addStudentsModal');
    if (box) box.style.display = 'none';
}

async function submitCourseStudents() {
    const ta = document.getElementById('courseStudentIds');
    const st = document.getElementById('addStudentsStatus');
    const show = (m, c) => { if (st) { st.textContent = m; st.style.color = c || ''; } };

    const raw = String((ta && ta.value) || '');
    // يقبل الفواصل والأسطر والمسافات
    const ids = raw.split(/[\s,،;]+/).map(s => toAsciiDigits(s).replace(/\D+/g, '')).filter(Boolean);

    if (!ids.length) return show("❌ أدخل رقم هوية واحداً على الأقل", '#c0392b');

    const bad = ids.filter(id => checkIDNumber(id) !== "Y");
    if (bad.length) {
        return show("❌ هويات غير صحيحة: " + bad.join('، '), '#c0392b');
    }

    const date = String((document.getElementById('courseRegisterDate') || {}).value || '');
    if (!date) return show("❌ اختر تاريخ التسجيل", '#c0392b');

    if (!navigator.onLine) {
        return show("❌ تسجيل الطلبة يتطلّب اتصالاً بالإنترنت.", '#c0392b');
    }

    show("🔄 جارٍ التسجيل…", '#3498db');
    try {
        // ⚠️ الدفعة ذرّية: تُقبل كلها أو تُرفض كلها
        const res = await QMC.addCourseStudents(Number(_openCourse.courseNo), ids, date);
        const added = Number(res.added || 0), skipped = Number(res.skipped || 0);

        closeAddCourseStudents();
        showToast(`أُضيف ${added}` + (skipped ? ` · ${skipped} مسجّل سلفاً` : ''));
        await openCourseRoster(_openCourse.courseNo);
    } catch (err) {
        show("❌ " + (err.message || 'تعذّر التسجيل'), '#c0392b');
    }
}

async function removeCourseStudent(idNo) {
    const s = _courseDetail.students.find(x => x.idNo === String(idNo));
    const ok = await showConfirm({
        title: "حذف تسجيل الطالب",
        message: `${(s && s.name) || idNo}\n\nيرفض السيرفر الحذف إن كانت له نتيجة مرصودة.`,
        confirmText: "حذف", danger: true, icon: "🗑️",
    });
    if (!ok) return;

    if (!navigator.onLine) {
        return showAlert({ title: "لا يوجد اتصال", message: "حذف التسجيل يتطلّب اتصالاً.", icon: "📡" });
    }

    try {
        await QMC.removeCourseStudent(Number(_openCourse.courseNo), String(idNo));
        showToast("حُذف تسجيل الطالب");
        await openCourseRoster(_openCourse.courseNo);
    } catch (err) {
        showAlert({ title: "تعذّر الحذف", message: err.message || 'خطأ غير معروف', icon: "⚠️" });
    }
}


