/* ============================================================================
   course_extras.js — تحديثات الدورات المنقولة من تطبيق Flutter (2026-10-07)
   ----------------------------------------------------------------------------
   1) جوال وواتس المتدرّبين  — حقلان مع الهويّة عند التسجيل، وشاشة «أرقام الطلاب»
      مع «نسخ أرقام الواتس» (Courses/studentContacts · Courses/studentContact).
   2) تسلسل الدورات         — فحصٌ قبل التسجيل يذكر الممنوعين بأسمائهم، و«استثناء»
      لمشرف الدورات بسببٍ وملاحظة (Courses/ladderCheck · grantLevelException).
   3) البحث عن متدرّب وسجلّه في الدورات (sv/courseStudentSearch · courseStudentHistory).
   4) «الحاصلون على الدورات» و«معلّمو الدورات» بتصدير Excel.
   المرجع: lib/screens/courses/** في Flutter — والحارس الحقيقيّ على السيرفر في كلّها.
   ⚠️ بلا ?. ولا ?? — متصفّحات أندرويد القديمة ترفض الملفّ كلّه.
   ============================================================================ */

/* ===================== أدوات ===================== */

// نسخة UTIL_PHONE_NORM حرفًا (lib/utils/phone_check.dart) — تُحدَّث الثلاث معًا
const CX_PHONE_HINT = 'جوال 05xxxxxxxx، أو أرضيّ 08xxxxxxx، أو دوليّ يبدأ بـ+ أو 00';

function cxPhoneCheck(raw) {
    let s = String(raw == null ? '' : raw).trim().replace(/[\s().\-]/g, '');
    if (!s) return { value: null, error: null };
    s = toAsciiDigits(s);
    if (s.indexOf('00') === 0) s = '+' + s.substring(2);
    const ok = v => ({ value: v, error: null });
    const bad = { value: null, error: 'رقم غير صالح — ' + CX_PHONE_HINT };
    if (s.indexOf('+970') === 0 || s.indexOf('+972') === 0) {
        const rest = s.substring(4);
        return (/^5\d{8}$/.test(rest) || /^[2-9]\d{7}$/.test(rest)) ? ok(s) : bad;
    }
    if (/^\+[1-9]\d{7,14}$/.test(s)) return ok(s);
    if (/^05\d{8}$/.test(s)) return ok(s);
    if (/^0[2346789]\d{7}$/.test(s)) return ok(s);
    if (/^5\d{8}$/.test(s)) return ok('0' + s);
    return bad;
}

function cxNum(v) {
    if (v == null || v === '') return '—';
    const n = Number(v);
    if (isNaN(n)) return '—';
    return n === Math.round(n) ? String(Math.round(n)) : n.toFixed(1);
}

function cxBody(raw) {
    const d = safeDecodeJson(raw);
    return (d && typeof d === 'object' && !Array.isArray(d)) ? d : null;
}

function safeDecodeJson(raw) {
    try { return JSON.parse(raw); } catch (_) { return null; }
}

// نداءٌ عامّ: { status, body } — والحكم للمستدعي (404 بلا JSON = نقطةٌ لم تُنشر)
async function cxCall(path, body) {
    let res;
    try {
        res = await QMC.apiFetch(path, body ? { method: 'POST', body: body, timeoutMs: 30000 }
                                           : { timeoutMs: 25000 });
    } catch (_) {
        throw new Error('تعذّر الاتصال بالسيرفر — تحقّق من الشبكة');
    }
    const raw = await res.text().catch(() => '');
    return { status: res.status, raw: raw, body: cxBody(raw) };
}

function cxNotDeployed(r) {
    return r.status === 404 && !String(r.raw || '').trim().startsWith('{');
}

function cxFail(r, fallback) {
    const m = r.body && (r.body.message || r.body.error);
    return new Error(m ? String(m) : (fallback + ' (رمز ' + r.status + ')'));
}

// نافذةٌ عامّة واحدة لكل ما في هذا الملفّ — تُبنى مرّةً في الصفحة
function cxModal(html) {
    let box = document.getElementById('cxModal');
    if (!box) {
        box = document.createElement('div');
        box.id = 'cxModal';
        box.className = 'modal-overlay';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.innerHTML = '<div class="modal-box" id="cxModalBox" style="max-height:85vh;overflow:auto"></div>';
        document.body.appendChild(box);
    }
    document.getElementById('cxModalBox').innerHTML = html;
    box.style.display = 'flex';
}

function cxCloseModal() {
    const box = document.getElementById('cxModal');
    if (box) box.style.display = 'none';
}

async function cxCopyText(text) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (_) { /* البديل أدناه */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.parentNode.removeChild(ta);
        return ok;
    } catch (_) { return false; }
}

// Excel من صفوفٍ وأعمدة — نمط excelCourseSheet نفسه (الهويّة والجوال نصًّا)
async function cxExcel(title, info, headers, rows, fileName) {
    try {
        await loadScriptOnce('xlsx.full.min.js');
    } catch (_) {
        return showAlert({ message: 'تعذّر تحميل مكتبة إكسل — تأكّد من الاتصال ثم أعد المحاولة.', icon: '⚠️' });
    }
    try {
        const aoa = [[title], [info], headers].concat(rows);
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const last = headers.length - 1;
        ws['!merges'] = [0, 1].map(r => ({ s: { r: r, c: 0 }, e: { r: r, c: last } }));
        ws['!cols'] = headers.map((h, i) => ({ wch: i === 0 ? 30 : Math.max(10, String(h).length + 4) }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'الكشف');
        wb.Workbook = wb.Workbook || {};
        wb.Workbook.Views = [{ RTL: true }];
        const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        crDeliverFile(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
                      crSafeFileName(fileName) + '.xlsx',
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch (err) {
        console.error(err);
        showAlert({ title: 'تعذّر إنشاء ملف Excel', message: (err && err.message) || 'خطأ غير معروف', icon: '⚠️' });
    }
}

/* ===================== 1) التسجيل بالأرقام ===================== */

/* كل سطر: هويّة، ثم (اختياريًّا) الجوال ثم الواتس إن اختلف — مثل نسخ أعمدةٍ من
   Excel. وما زالت هويّاتٌ كثيرة في سطرٍ واحد تُقبل كما كانت: الرقم الذي يبدأ
   بـ0 أو + (أو تسعة أرقام ليست هويّةً صحيحة) هاتفٌ للهويّة التي قبله.
   يُرجع { ids, contacts:{id:{mobile_no, whatsapp_no}}, error } */
function cxParseStudentLines(raw) {
    const ids = [], contacts = {}, badIds = [], badPhones = [];
    let current = null, phones = 0;
    const tokens = String(raw || '').split(/[\s,،;]+/).map(s => toAsciiDigits(s).trim()).filter(Boolean);
    tokens.forEach(t => {
        const digits = t.replace(/[^\d+]/g, '');
        if (!digits) return;
        const isPhoneLike = digits.charAt(0) === '0' || digits.charAt(0) === '+' ||
                            (digits.length !== 9) || checkIDNumber(digits) !== 'Y';
        if (/^\d{9}$/.test(digits) && checkIDNumber(digits) === 'Y') {
            current = digits; phones = 0;
            if (ids.indexOf(digits) === -1) ids.push(digits);
            return;
        }
        if (isPhoneLike && current) {
            const p = cxPhoneCheck(digits);
            if (p.error) { badPhones.push(digits); return; }
            contacts[current] = contacts[current] || {};
            if (phones === 0) contacts[current].mobile_no = p.value;
            else if (phones === 1 && p.value !== contacts[current].mobile_no) contacts[current].whatsapp_no = p.value;
            phones++;
            return;
        }
        badIds.push(digits);
    });
    let error = null;
    if (badIds.length) error = 'هويات غير صحيحة: ' + badIds.join('، ');
    else if (badPhones.length) error = 'أرقام هواتف غير صالحة: ' + badPhones.join('، ') + '\n' + CX_PHONE_HINT;
    return { ids: ids, contacts: contacts, error: error };
}

/* ===================== 2) تسلسل الدورات ===================== */

// null ⇒ النقطة لم تُنشر بعد (docs/ords_course_ladder.sql) — يمضي التسجيل والسيرفر يحكم
async function cxLadderCheck(courseNo, ids) {
    const r = await cxCall('Courses/ladderCheck', {
        course_no: Number(courseNo), students: ids.map(id => ({ id_no: id })),
    });
    if (cxNotDeployed(r)) return null;
    if (!r.body || String(r.body.status) !== 'success') throw cxFail(r, 'تعذّر فحص التسلسل');
    const blocked = {};
    (r.body.items || []).forEach(e => {
        if (String(e.allowed) === 'N') blocked[String(e.id_no)] = String(e.message || 'خارج التسلسل');
    });
    return {
        classNo: Number(r.body.class_no || 0),
        canOverride: String(r.body.can_override) === 'Y',
        blocked: blocked,
    };
}

/* البوّابة: يُرجع الهويّات التي تُرسَل، أو null إن ألغى. وتعذُّر الفحص لا يمنع
   الإرسال — الحارس الحقيقيّ في QMC_ADD_COURSE_STUDENTS. */
let _cxGate = null;
function cxLadderGate(courseNo, ids) {
    return new Promise(async (resolve) => {
        let chk = null;
        try { chk = await cxLadderCheck(courseNo, ids); } catch (_) { return resolve(ids); }
        if (!chk || !Object.keys(chk.blocked).length) return resolve(ids);
        _cxGate = { courseNo: courseNo, ids: ids, chk: chk, resolve: resolve };
        cxRenderGate();
    });
}

function cxRenderGate() {
    const g = _cxGate;
    const keys = Object.keys(g.chk.blocked);
    const allowed = g.ids.length - keys.length;
    cxModal(`
        <h4 class="modal-title">خارج تسلسل الدورات (${keys.length})</h4>
        ${keys.map(id => `
            <div class="course-warn" style="margin:6px 0;display:block">
                <div style="font-size:13px;line-height:1.6">${crHtmlLines(g.chk.blocked[id])}</div>
                ${g.chk.canOverride ? `<div style="text-align:left;margin-top:4px">
                    <button type="button" class="cr-action" onclick="cxGateException('${id}')">
                        <i class="fas fa-certificate"></i> استثناء</button></div>` : ''}
            </div>`).join('')}
        ${g.chk.canOverride ? '' : `<div class="cr-sub" style="margin-top:6px">تخطّي التسلسل من صلاحية مشرف الدورات — يسجّل الاستثناء من «البحث عن متدرّب» ثم يُعاد التسجيل.</div>`}
        <div class="modal-actions">
            <button type="button" class="modal-btn modal-cancel" onclick="cxGateDone(false)">إلغاء</button>
            ${allowed > 0 ? `<button type="button" class="modal-btn modal-confirm" onclick="cxGateDone(true)">${
                keys.length ? 'تسجيل المسموح لهم (' + allowed + ')' : 'تسجيل الكلّ (' + allowed + ')'}</button>` : ''}
        </div>`);
}

function cxGateDone(ok) {
    const g = _cxGate;
    _cxGate = null;
    cxCloseModal();
    if (!g) return;
    g.resolve(ok ? g.ids.filter(id => !g.chk.blocked[id]) : null);
}

function cxGateException(idNo) {
    const g = _cxGate;
    cxExceptionForm({
        idNo: idNo, name: idNo, classNo: g.chk.classNo,
        onDone: (saved) => {
            if (saved) delete g.chk.blocked[idNo];
            cxRenderGate();
        },
    });
}

/* حوار الاستثناء: السبب (شهادة سابقة · تقييم تلاوته) والملاحظة — لمشرف الدورات */
let _cxExc = null;
function cxExceptionForm(opts) {
    _cxExc = opts;
    cxModal(`
        <h4 class="modal-title">استثناء من تسلسل الدورات</h4>
        <div class="modal-message"><b>${escapeHtml(opts.name)}</b><br>
            <span class="cr-sub">🪪 ${escapeHtml(opts.idNo)}${opts.className ? '<br>للتسجيل في: ' + escapeHtml(opts.className) : ''}</span></div>
        <div class="cr-chips" id="cxExcReason">
            <button type="button" class="cr-chip active" data-r="CERT" onclick="cxExcPick('CERT')">شهادة سابقة</button>
            <button type="button" class="cr-chip" data-r="EVAL" onclick="cxExcPick('EVAL')">تقييم تلاوته</button>
        </div>
        <div class="field">
            <label id="cxExcLabel">رقم الشهادة وجهتها وتاريخها</label>
            <textarea id="cxExcNotes" rows="3"></textarea>
        </div>
        <div id="cxExcStatus" class="settings-status"></div>
        <div class="modal-actions">
            <button type="button" class="modal-btn modal-cancel" onclick="cxExcClose(false)">إلغاء</button>
            <button type="button" class="modal-btn modal-confirm" id="cxExcSave" onclick="cxExcSave()">حفظ الاستثناء</button>
        </div>`);
    _cxExc.reason = 'CERT';
}

function cxExcPick(r) {
    if (!_cxExc) return;
    _cxExc.reason = r;
    Array.prototype.forEach.call(document.querySelectorAll('#cxExcReason .cr-chip'), b => {
        b.classList.toggle('active', b.getAttribute('data-r') === r);
    });
    const l = document.getElementById('cxExcLabel');
    if (l) l.textContent = r === 'CERT' ? 'رقم الشهادة وجهتها وتاريخها' : 'خلاصة التقييم';
}

function cxExcClose(saved) {
    const o = _cxExc;
    _cxExc = null;
    if (o && o.onDone) o.onDone(saved); else cxCloseModal();
}

async function cxExcSave() {
    const o = _cxExc;
    if (!o) return;
    const st = document.getElementById('cxExcStatus');
    const show = (m, c) => { if (st) { st.textContent = m; st.style.color = c || ''; } };
    const notes = String((document.getElementById('cxExcNotes') || {}).value || '').trim();
    if (!notes) {
        return show(o.reason === 'CERT' ? 'اكتب رقم الشهادة وجهتها وتاريخها' : 'اكتب خلاصة تقييمك لتلاوته', '#c0392b');
    }
    const btn = document.getElementById('cxExcSave');
    if (btn) btn.disabled = true;
    show('🔄 جارٍ الحفظ…', '#3498db');
    try {
        const r = await cxCall('Courses/grantLevelException', {
            id_no: Number(o.idNo), class_no: Number(o.classNo), reason: o.reason, notes: notes,
        });
        if (!r.body || String(r.body.status) !== 'success') throw cxFail(r, 'تعذّر حفظ الاستثناء');
        showToast('✅ ' + (r.body.message || 'سُجّل الاستثناء'));
        cxExcClose(true);
    } catch (err) {
        if (btn) btn.disabled = false;
        show('❌ ' + (err.message || 'تعذّر الحفظ'), '#c0392b');
    }
}

/* ===================== 1ب) أرقام الطلاب ===================== */

let _cxContacts = null;   // { courseNo, courseName, items, error, editing }

function cxNormContact(j) {
    const s = v => { const t = (v == null ? '' : String(v)).trim(); return t || null; };
    const mobile = s(j.mobile_no), wa = s(j.whatsapp_no);
    return {
        idNo: String(j.id_no),
        name: s(j.name) || ('هوية ' + j.id_no),
        birthDate: s(j.birth_date) ? s(j.birth_date).split('T')[0] : null,
        mobileNo: mobile, whatsappNo: wa,
        whatsapp: wa || mobile,   // الواتس الفعليّ — ما يُنسخ إلى المجموعة
    };
}

// null ⇒ النقطة لم تُنشر بعد (docs/ords_course_contacts.sql)
async function cxFetchContacts(courseNo) {
    const r = await cxCall('Courses/studentContacts/' + encodeURIComponent(courseNo));
    if (cxNotDeployed(r)) return null;
    if (!r.body || String(r.body.status) !== 'success') throw cxFail(r, 'تعذّر جلب الأرقام');
    return (r.body.items || []).map(cxNormContact);
}

async function openCourseContacts(courseNo, courseName) {
    if (!navigator.onLine) {
        return showAlert({ title: 'لا يوجد اتصال', message: 'أرقام الطلاب تُجلب من السيرفر.', icon: '📡' });
    }
    _cxContacts = { courseNo: Number(courseNo), courseName: courseName || '', items: [], error: null };
    cxModal('<h4 class="modal-title">أرقام الطلاب</h4><div class="students-empty">جارٍ التحميل…</div>');
    try {
        const list = await cxFetchContacts(courseNo);
        if (list == null) _cxContacts.error = 'خدمة الأرقام لم تُفعَّل على السيرفر بعد';
        else _cxContacts.items = list.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    } catch (err) {
        _cxContacts.error = err.message || 'تعذّر جلب الأرقام';
    }
    cxRenderContacts();
}

// من نافذة «تسجيل طلبة» — الدورة نفسها، واسمها من أيّ شاشةٍ فتحتها
function openAddStudentsContacts() {
    const ctx = (typeof _addStudentsCtx !== 'undefined') ? _addStudentsCtx : null;
    if (!ctx || !ctx.courseNo) return;
    let name = '';
    if (typeof _svCourse !== 'undefined' && _svCourse && _svCourse.courseNo === ctx.courseNo) name = _svCourse.courseName;
    else if (typeof _openCourse !== 'undefined' && _openCourse && Number(_openCourse.courseNo) === ctx.courseNo) name = _openCourse.courseName;
    else if (typeof _ctOpen !== 'undefined' && _ctOpen && Number(_ctOpen.courseNo) === ctx.courseNo) name = _ctOpen.courseName;
    closeAddCourseStudents();
    openCourseContacts(ctx.courseNo, name);
}

function cxRenderContacts() {
    const c = _cxContacts;
    if (!c) return;
    const missing = c.items.filter(x => !x.whatsapp).length;
    const rows = c.items.map((x, i) => {
        const lines = [];
        if (x.mobileNo) lines.push('جوال: ' + x.mobileNo);
        if (x.whatsappNo) lines.push('واتس: ' + x.whatsappNo);
        if (x.mobileNo && !x.whatsappNo) lines.push('الواتس على الجوال');
        return `<div class="student-card" onclick="cxEditContact(${i})" style="cursor:pointer">
            <div class="student-card-head"><span class="student-name">${escapeHtml(x.name)}</span>
                <i class="fas fa-pen" style="color:#5f6368"></i></div>
            <div class="cr-sub" dir="rtl">${lines.length ? escapeHtml(lines.join('  ·  ')) : '<span style="color:#999">لا رقم بعد</span>'}</div>
        </div>`;
    }).join('');
    cxModal(`
        <h4 class="modal-title">أرقام الطلاب</h4>
        <div class="cr-sub" style="margin-bottom:8px">${escapeHtml(c.courseName)}</div>
        ${c.error ? `<div class="students-empty">${crHtmlLines(c.error)}</div>` : `
            <div class="cr-sub" style="margin-bottom:8px">${!c.items.length ? 'لا مسجّلين في هذه الدورة'
                : (missing === 0 ? 'لكلّ المسجّلين (' + c.items.length + ') رقم واتس'
                   : 'لهم رقم: ' + (c.items.length - missing) + ' من ' + c.items.length + ' · بقي ' + missing + ' — المس الاسم لإضافة رقمه')}</div>
            ${rows}`}
        <div class="modal-actions">
            <button type="button" class="modal-btn modal-cancel" onclick="cxCloseModal()">إغلاق</button>
            ${c.items.length ? `<button type="button" class="modal-btn modal-confirm" onclick="cxCopyWhatsapp()">
                <i class="fas fa-copy"></i> نسخ أرقام الواتس</button>` : ''}
        </div>`);
}

async function cxCopyWhatsapp() {
    const c = _cxContacts;
    if (!c) return;
    const nums = c.items.map(x => x.whatsapp).filter(Boolean);
    if (!nums.length) return showToast('لا أرقام بعد لنسخها');
    const ok = await cxCopyText(nums.join('\n'));
    const missing = c.items.length - nums.length;
    showToast(ok ? ('نُسخ ' + nums.length + ' رقمًا' + (missing ? ' · بلا رقم: ' + missing : ''))
                 : 'تعذّر النسخ على هذا الجهاز');
}

function cxEditContact(i) {
    const c = _cxContacts;
    const x = c && c.items[i];
    if (!x) return;
    c.editing = i;
    cxModal(`
        <h4 class="modal-title">${escapeHtml(x.name)}</h4>
        <div class="field">
            <label>الجوال</label>
            <input type="tel" dir="ltr" id="cxMob" maxlength="20" value="${escapeHtml(x.mobileNo || '')}">
            <div class="cr-sub">${CX_PHONE_HINT}</div>
        </div>
        <div class="field">
            <label>واتس (إن اختلف عن الجوال)</label>
            <input type="tel" dir="ltr" id="cxWa" maxlength="20" value="${escapeHtml(x.whatsappNo || '')}">
            <div class="cr-sub">اتركه فارغًا إن كان الواتس على الجوال نفسه</div>
        </div>
        <div id="cxContactStatus" class="settings-status"></div>
        <div class="modal-actions">
            <button type="button" class="modal-btn modal-cancel" onclick="cxRenderContacts()">رجوع</button>
            <button type="button" class="modal-btn modal-confirm" id="cxContactSave" onclick="cxSaveContact()">حفظ</button>
        </div>`);
}

async function cxSaveContact() {
    const c = _cxContacts;
    const x = c && c.items[c.editing];
    if (!x) return;
    const st = document.getElementById('cxContactStatus');
    const show = (m, col) => { if (st) { st.textContent = m; st.style.color = col || ''; } };
    const m = cxPhoneCheck((document.getElementById('cxMob') || {}).value);
    const w = cxPhoneCheck((document.getElementById('cxWa') || {}).value);
    if (m.error) return show('الجوال: ' + m.error, '#c0392b');
    if (w.error) return show('الواتس: ' + w.error, '#c0392b');
    const wa = (w.value && w.value !== m.value) ? w.value : null;
    const btn = document.getElementById('cxContactSave');
    if (btn) btn.disabled = true;
    show('🔄 جارٍ الحفظ…', '#3498db');
    try {
        const r = await cxCall('Courses/studentContact', {
            course_no: c.courseNo, id_no: Number(x.idNo), mobile_no: m.value || '', whatsapp_no: wa || '',
        });
        if (cxNotDeployed(r)) throw new Error('نقطة «Courses/studentContact» غير مسجّلة — شغّل docs/ords_course_contacts.sql');
        if (!r.body || String(r.body.status) !== 'success') throw cxFail(r, 'تعذّر الحفظ');
        x.mobileNo = m.value; x.whatsappNo = wa; x.whatsapp = wa || m.value;
        showToast('حُفظ الرقم');
        cxRenderContacts();
    } catch (err) {
        if (btn) btn.disabled = false;
        show('❌ ' + (err.message || 'تعذّر الحفظ'), '#c0392b');
    }
}

/* ===================== 3 و4) أدوات المشرف — عرضٌ واحد بمكدّس رجوع ===================== */

/* cxView في تبويب الدورات: كل شاشةٍ دالّةُ رسم تُدفع في المكدّس، والرجوع يُخرجها.
   فارغٌ ⇒ الرجوع إلى «إشراف الدورات». */
let _cxStack = [];

function cxPush(render) {
    _cxStack.push(render);
    showCoursesView('cxView');
    render();
}

function cxBack() {
    _cxStack.pop();
    if (!_cxStack.length) return showSvCenters();
    showCoursesView('cxView');
    _cxStack[_cxStack.length - 1]();
}

function cxSet(title, sub, html) {
    const t = crEl('cxTitle'), s = crEl('cxSub'), b = crEl('cxBody');
    if (t) t.textContent = title;
    if (s) { s.textContent = sub || ''; s.style.display = sub ? 'block' : 'none'; }
    if (b) b.innerHTML = html;
}

function cxGetItems(path) {
    return QMC.apiFetch(path, { timeoutMs: 25000 }).then(async res => {
        const raw = await res.text().catch(() => '');
        const d = cxBody(raw);
        if (res.status !== 200) {
            const m = d && d.message;
            throw new Error(m ? String(m) : 'HTTP ' + res.status);
        }
        if (!d) throw new Error('استجابة غير مفهومة من السيرفر');
        return d;
    });
}

const CX_STATE = { ACTIVE: 'جارية', UPCOMING: 'قادمة', ENDED: 'منتهية' };

/* ---------- البحث عن متدرّب ---------- */

let _cxHits = null, _cxSearchErr = '', _cxSearching = false, _cxSearchQ = '';

function openCxStudentSearch() {
    _cxHits = null; _cxSearchErr = ''; _cxSearching = false; _cxSearchQ = '';
    cxPush(cxRenderSearch);
}

function cxRenderSearch() {
    const cap = 60;   // سقف السيرفر — بلوغه يعني «ضيّق البحث»
    let res = '';
    if (_cxSearching) res = '<div class="students-empty">🔄 جارٍ البحث…</div>';
    else if (_cxSearchErr) res = `<div class="students-empty">تعذّر البحث: ${crHtmlLines(_cxSearchErr)}</div>`;
    else if (_cxHits == null) res = '<div class="students-empty">يُبحث بين من سُجّلوا في دوراتٍ من نطاقك. الاسم الأوّل ثم أيّ اسمٍ بعده يكفي.</div>';
    else if (!_cxHits.length) res = '<div class="students-empty">لا متدرّب بهذا الاسم في دورات نطاقك</div>';
    else {
        res = (_cxHits.length >= cap ? '<div class="cr-note warn">النتائج كثيرة — أضف اسم الأب أو العائلة لتضييق البحث</div>' : '') +
            _cxHits.map((h, i) => `
            <div class="student-card roster-card" onclick="cxOpenHit(${i})">
                <div class="student-card-head"><span class="student-name"><i class="fas fa-user" style="color:#00897b"></i> ${escapeHtml(h.name)}</span>
                    <span class="cr-pill accent">${h.courses} دورة</span></div>
                <div class="cr-sub">🪪 ${escapeHtml(h.idNo)}${h.lastClass ? '<br>آخرها: ' + escapeHtml(h.lastClass) + (h.lastStart ? ' (' + escapeHtml(h.lastStart) + ')' : '') : ''}</div>
            </div>`).join('');
    }
    cxSet('البحث عن متدرّب', '', `
        <div class="students-toolbar">
            <div class="search-wrap"><i class="fas fa-magnifying-glass search-icon"></i>
                <input type="search" id="cxSearchInput" placeholder="الاسم (مثل: عبد الله الحتة) أو رقم الهويّة"
                       value="${escapeHtml(_cxSearchQ)}" onkeydown="if(event.key==='Enter')cxRunSearch()"></div>
            <button class="btn-new-student" onclick="cxRunSearch()"><i class="fas fa-magnifying-glass"></i> <span>بحث</span></button>
        </div>
        <div class="students-cards">${res}</div>`);
}

async function cxRunSearch() {
    const q = String((crEl('cxSearchInput') || {}).value || '').trim();
    if (!q || _cxSearching) return;
    _cxSearchQ = q; _cxSearchErr = ''; _cxHits = null; _cxSearching = true;
    cxRenderSearch();
    try {
        // ⚠️ term لا q: ORDS يحجز ?q= لمرشّحه فيردّ 400 قبل المعالج
        const d = await cxGetItems('sv/courseStudentSearch?term=' + encodeURIComponent(q));
        _cxHits = (d.items || []).map(j => ({
            idNo: String(j.id_no), name: crS(j.name) || ('هوية ' + j.id_no),
            courses: Number(j.courses || 0), lastClass: crSN(j.last_class), lastStart: crDate(j.last_start),
        }));
    } catch (err) {
        _cxSearchErr = crErrorText(err, 'sv');
    }
    _cxSearching = false;
    if (_cxStack[_cxStack.length - 1] === cxRenderSearch) cxRenderSearch();
}

function cxOpenHit(i) {
    const h = _cxHits && _cxHits[i];
    if (h) openCxStudentHistory(h.idNo, h.name);
}

/* ---------- سجلّ متدرّب في الدورات ---------- */

function openCxStudentHistory(idNo, name) {
    const ctx = { idNo: String(idNo), name: name || ('هوية ' + idNo), list: null, error: '' };
    const render = () => cxRenderHistory(ctx);
    cxPush(render);
    cxGetItems('sv/courseStudentHistory/' + encodeURIComponent(ctx.idNo)).then(d => {
        ctx.list = (d.items || []).map(j => ({
            courseName: crS(j.course_name), className: crSN(j.class_name),
            startDate: crDate(j.start_date), endDate: crDate(j.end_date),
            state: crS(j.state).toUpperCase(), centerName: crSN(j.center_name), teacherName: crSN(j.teacher_name),
            total: crN(j.total_mark), max: crN(j.class_total_mark), attPct: crN(j.att_pct),
            studentStatus: crN(j.student_status) || 1,
            approved: crS(j.results_approved).toUpperCase() === 'Y', passMark: crN(j.pass_mark),
        }));
    }).catch(err => { ctx.error = crErrorText(err, 'sv'); })
      .then(() => { if (_cxStack[_cxStack.length - 1] === render) render(); });
}

function cxRenderHistory(ctx) {
    let body;
    if (ctx.error) body = `<div class="students-empty">تعذّر جلب السجلّ: ${crHtmlLines(ctx.error)}</div>`;
    else if (ctx.list == null) body = '<div class="students-empty">جارٍ التحميل…</div>';
    else if (!ctx.list.length) body = '<div class="students-empty">لا دورات له في نطاقك</div>';
    else body = ctx.list.map(c => {
        const pct = (c.total != null && c.max) ? Math.round(c.total * 100 / c.max) : null;
        const passed = (!c.approved || c.total == null || c.passMark == null) ? null : c.total >= c.passMark;
        const pills = [];
        // المنقطع لا يُحكم عليه باجتيازٍ ولا رسوب — ترك الدورة (2026-10-08)
        if (c.studentStatus === CR_DROPPED) pills.push('<span class="cr-pill crit">منقطع</span>');
        else if (!c.approved) pills.push('<span class="cr-pill">لم تُعتمد النتائج بعد</span>');
        else if (passed === true) pills.push('<span class="cr-pill ok">✓ مجتاز</span>');
        else if (passed === false) pills.push('<span class="cr-pill crit">لم يجتز</span>');
        else pills.push('<span class="cr-pill ok">✓ نتيجة معتمدة</span>');
        if (c.studentStatus === 5) pills.push('<span class="cr-pill warn">إضافي</span>');
        if (c.attPct != null) pills.push(`<span class="cr-pill ${crPctCls(c.attPct)}">الحضور ${c.attPct}٪</span>`);
        return `<div class="student-card">
            <div class="student-card-head"><span class="student-name">${escapeHtml(c.className || c.courseName)}</span>
                <span class="req-badge ${c.total == null ? 'req-other' : 'req-done'}"><bdi>${c.total == null ? '—'
                    : cxNum(c.total) + (c.max != null ? ' / ' + cxNum(c.max) : '')}${pct != null ? ' · ' + pct + '%' : ''}</bdi></span></div>
            ${c.className && c.className !== c.courseName ? `<div class="cr-sub">${escapeHtml(c.courseName)}</div>` : ''}
            <div class="cr-sub">📅 ${escapeHtml(c.startDate || '—')}${c.endDate ? ' ← ' + escapeHtml(c.endDate) : ''} · ${CX_STATE[c.state] || c.state || '—'}</div>
            ${(c.centerName || c.teacherName) ? `<div class="cr-sub">${[c.centerName ? '📍 ' + escapeHtml(c.centerName) : '',
                c.teacherName ? '👤 ' + escapeHtml(c.teacherName) : ''].filter(Boolean).join(' · ')}</div>` : ''}
            <div class="cr-pills">${pills.join('')}</div>
        </div>`;
    }).join('');
    // 🪜 استثناء التسلسل — لمشرف الدورات (والسيرفر يحرسه)
    const grant = canSuperviseCourses() ? `<div class="cr-actions">
        <button type="button" class="cr-action" onclick="cxGrantFromHistory()">
            <i class="fas fa-certificate"></i> استثناء من تسلسل الدورات</button></div>` : '';
    _cxHistCtx = ctx;
    cxSet('سجلّه في الدورات', ctx.name + ' · ' + ctx.idNo, grant + `<div class="students-cards">${body}</div>`);
}

let _cxHistCtx = null;

/* يختار المشرف نوعًا من السلسلة (له متطلّب) ثم السبب — فيُسجَّل بعدها فوق مستحقّه */
async function cxGrantFromHistory() {
    const ctx = _cxHistCtx;
    if (!ctx) return;
    let classes;
    try {
        const rep = await cxGetItems('sv/courseClassReport?class_no=');
        classes = (rep.summary || []).filter(c => c.prereq_class_no != null)
            .map(c => ({ classNo: Number(c.class_no), className: crS(c.class_name) || ('نوع ' + c.class_no) }));
    } catch (err) {
        return showAlert({ message: 'تعذّر جلب أنواع الدورات: ' + crErrorText(err, 'sv'), icon: '⚠️' });
    }
    if (!classes.length) return showToast('لا أنواع دوراتٍ لها متطلّب في نطاقك');
    _cxGrantClasses = classes;
    cxModal(`<h4 class="modal-title">السماح بالتسجيل في:</h4>
        ${classes.map((c, i) => `<div class="student-card roster-card" onclick="cxGrantPick(${i})">
            <span class="student-name">${escapeHtml(c.className)}</span></div>`).join('')}
        <div class="modal-actions"><button type="button" class="modal-btn modal-cancel" onclick="cxCloseModal()">إلغاء</button></div>`);
}

let _cxGrantClasses = [];
function cxGrantPick(i) {
    const c = _cxGrantClasses[i], ctx = _cxHistCtx;
    if (!c || !ctx) return;
    cxExceptionForm({ idNo: ctx.idNo, name: ctx.name, classNo: c.classNo, className: c.className,
                      onDone: () => cxCloseModal() });
}

/* ---------- الحاصلون على الدورات ---------- */

let _cxReport = null, _cxReportErr = '';

function openCxClassReport() {
    _cxReport = null; _cxReportErr = '';
    cxPush(cxRenderReport);
    cxGetItems('sv/courseClassReport?class_no=').then(d => { _cxReport = d; })
        .catch(err => { _cxReportErr = crErrorText(err, 'sv'); })
        .then(() => { if (_cxStack[_cxStack.length - 1] === cxRenderReport) cxRenderReport(); });
}

function cxSummaryOf(j) {
    const i = v => Number(v || 0);
    return {
        classNo: i(j.class_no), className: crS(j.class_name) || ('نوع ' + j.class_no),
        passMark: crN(j.pass_mark), maxMark: crN(j.max_mark),
        courses: i(j.courses), approvedCourses: i(j.approved_courses), students: i(j.students),
        passed: i(j.passed), inProgress: i(j.in_progress), failed: i(j.failed),
        undetermined: i(j.undetermined), noResult: i(j.no_result),
    };
}

const CX_RES_COLORS = { passed: '#137333', inProgress: '#00897b', failed: '#c5221f', undetermined: '#e8710a', noResult: '#bdbdbd' };

function cxRenderReport() {
    if (_cxReportErr) return cxSet('الحاصلون على الدورات', '', `<div class="students-empty">تعذّر جلب التقرير: ${crHtmlLines(_cxReportErr)}</div>`);
    if (!_cxReport) return cxSet('الحاصلون على الدورات', '', '<div class="students-empty">جارٍ التحميل…</div>');
    const list = (_cxReport.summary || []).map(cxSummaryOf);
    if (!list.length) return cxSet('الحاصلون على الدورات', '', '<div class="students-empty">لا دورات في نطاقك</div>');
    const all = list.reduce((s, c) => s + c.students, 0);
    _cxSummaries = list;
    const cards = list.map((c, idx) => {
        const decided = c.passed + c.failed;
        const rate = decided ? Math.round(c.passed * 100 / decided) : null;
        const share = all ? Math.round(c.students * 100 / all) : 0;
        const parts = [['passed', c.passed], ['inProgress', c.inProgress], ['failed', c.failed],
                       ['undetermined', c.undetermined], ['noResult', c.noResult]].filter(p => p[1] > 0);
        const bar = c.students ? `<div style="display:flex;height:8px;border-radius:4px;overflow:hidden;margin:8px 0 6px">${
            parts.map(p => `<div style="flex:${p[1]};background:${CX_RES_COLORS[p[0]]}"></div>`).join('')}</div>` : '';
        const legend = [['مجتاز', 'passed'], ['قيد الدورة', 'inProgress'], ['راسب', 'failed'], ['غير محدَّد', 'undetermined'], ['بلا نتيجة', 'noResult']]
            .filter(l => l[1] === 'passed' || l[1] === 'inProgress' || l[1] === 'failed' || c[l[1]] > 0)
            .map(l => `<span style="margin-inline-end:10px;font-size:12px"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${CX_RES_COLORS[l[1]]}"></span> ${l[0]} ${c[l[1]]}</span>`).join('');
        return `<div class="student-card roster-card" onclick="openCxClass(${idx})">
            <div class="student-card-head"><span class="student-name">${escapeHtml(c.className)}</span>
                ${rate != null ? `<span class="cr-pill ${crPctCls(rate)}">اجتياز ${rate}٪</span>` : ''}</div>
            <div class="cr-sub">${c.students} طالبًا (${share}٪ من المسجّلين) · ${c.courses} دورة (${c.approvedCourses} معتمدة)${
                c.passMark != null ? ' · الاجتياز ' + cxNum(c.passMark) + ' من ' + cxNum(c.maxMark != null ? c.maxMark : 100) : ''}</div>
            ${bar}<div>${legend}</div>
        </div>`;
    }).join('');
    cxSet('الحاصلون على الدورات', '', `
        <div class="cr-sub" style="margin-bottom:8px">المجتاز: معدّله (النصفي + النهائي) يبلغ درجة اجتياز النوع، في دورةٍ اعتُمدت نتائجها. ونسبة الاجتياز ممّن حُسمت نتيجتهم.</div>
        <div class="students-cards">${cards}</div>`);
}

let _cxSummaries = [];
const CX_RANK = { P: 5, I: 4, F: 3, U: 2, N: 1 };

function openCxClass(idx) {
    const s = _cxSummaries[idx];
    if (!s) return;
    const ctx = { summary: s, rep: null, error: '', tab: 0, tabs: [] };
    const render = () => cxRenderClass(ctx);
    cxPush(render);
    cxGetItems('sv/courseClassReport?class_no=' + encodeURIComponent(s.classNo)).then(d => { ctx.rep = d; })
        .catch(err => { ctx.error = crErrorText(err, 'sv'); })
        .then(() => { if (_cxStack[_cxStack.length - 1] === render) render(); });
}

function cxClassTabs(rep) {
    // الطالب مرّةً بأفضل حالاته، وفي الحالة نفسها آخرُ دورة
    const best = {};
    (rep.students || []).forEach(j => {
        const r = {
            idNo: String(j.id_no), name: crS(j.name) || ('هوية ' + j.id_no), courseName: crS(j.course_name),
            centerName: crSN(j.center_name), startDate: crDate(j.start_date),
            extra: Number(j.student_status) === 5, total: crN(j.total), result: crS(j.result) || 'N',
        };
        const cur = best[r.idNo];
        const a = CX_RANK[r.result] || 0, b = cur ? (CX_RANK[cur.result] || 0) : -1;
        if (!cur || a > b || (a === b && String(r.startDate || '') > String(cur.startDate || ''))) best[r.idNo] = r;
    });
    const rows = Object.keys(best).map(k => best[k]).sort((x, y) => x.name.localeCompare(y.name, 'ar'));
    const of = code => rows.filter(r => r.result === code);
    const tabs = [['المجتازون', of('P')], ['قيد الدورة', of('I')], ['الراسبون', of('F')]];
    if (of('U').length) tabs.push(['غير محدَّد', of('U')]);
    if (of('N').length) tabs.push(['بلا نتيجة', of('N')]);
    if (rep.next_class_no != null) {
        tabs.push(['المرشّحون لـ' + (crS(rep.next_class_name) || 'التالية'), (rep.candidates || []).map(j => ({
            idNo: String(j.id_no), name: crS(j.name) || ('هوية ' + j.id_no),
            courseName: crS(j.course_name), centerName: crSN(j.center_name), startDate: crDate(j.start_date),
            total: crN(j.total), extra: false, candidate: true,
        }))]);
    }
    return tabs;
}

function cxRenderClass(ctx) {
    const s = ctx.summary;
    if (ctx.error) return cxSet(s.className, '', `<div class="students-empty">تعذّر جلب التقرير: ${crHtmlLines(ctx.error)}</div>`);
    if (!ctx.rep) return cxSet(s.className, '', '<div class="students-empty">جارٍ التحميل…</div>');
    ctx.tabs = cxClassTabs(ctx.rep);
    if (ctx.tab >= ctx.tabs.length) ctx.tab = 0;
    const cur = ctx.tabs[ctx.tab];
    _cxClassCtx = ctx;
    const pm = crN(ctx.rep.pass_mark), mm = crN(ctx.rep.max_mark);
    const chips = ctx.tabs.map((t, i) => `<button type="button" class="cr-chip ${i === ctx.tab ? 'active' : ''}"
        onclick="cxClassTab(${i})">${escapeHtml(t[0])} (${t[1].length})</button>`).join('');
    const list = cur[1].length ? cur[1].map((r, i) => `
        <div class="student-card roster-card" onclick="cxClassOpen(${i})">
            <div class="student-card-head"><span class="student-name">${escapeHtml(r.name)}</span>
                <span class="req-badge req-done"><bdi>${cxNum(r.total)}</bdi></span></div>
            <div class="cr-sub">🪪 ${escapeHtml(r.idNo)}${r.extra ? ' · إضافي' : ''}<br>${escapeHtml([
                r.candidate && r.courseName ? 'اجتاز: ' + r.courseName : r.courseName,
                r.centerName, r.startDate].filter(Boolean).join(' · '))}</div>
        </div>`).join('') : '<div class="students-empty">لا أحد</div>';
    cxSet(s.className, pm != null ? 'الاجتياز ' + cxNum(pm) + ' من ' + cxNum(mm != null ? mm : 100) : 'لا درجة اجتياز لهذا النوع', `
        <div class="cr-chips">${chips}</div>
        <div class="cr-actions"><button type="button" class="cr-action" onclick="cxClassExport()">
            <i class="fas fa-file-excel"></i> تصدير القائمة Excel</button></div>
        <div class="students-cards">${list}</div>`);
}

let _cxClassCtx = null;
function cxClassTab(i) { if (_cxClassCtx) { _cxClassCtx.tab = i; cxRenderClass(_cxClassCtx); } }
function cxClassOpen(i) {
    const ctx = _cxClassCtx;
    const r = ctx && ctx.tabs[ctx.tab] && ctx.tabs[ctx.tab][1][i];
    if (r) openCxStudentHistory(r.idNo, r.name);
}

function cxClassExport() {
    const ctx = _cxClassCtx;
    if (!ctx) return;
    const t = ctx.tabs[ctx.tab];
    if (!t[1].length) return showToast('القائمة فارغة');
    const cand = !!t[1][0].candidate;
    const headers = ['الاسم', 'رقم الهوية', 'الدورة', 'الموضع', 'تاريخ البدء', 'المعدّل'].concat(cand ? [] : ['التصنيف']);
    const rows = t[1].map(r => {
        const row = [r.name, String(r.idNo), r.courseName || '', r.centerName || '',
                     r.startDate ? crDispDate(r.startDate) : '', r.total == null ? '' : r.total];
        if (!cand) row.push(r.extra ? 'إضافي' : 'معتمد');
        return row;
    });
    cxExcel(ctx.summary.className + ' — ' + t[0], t[1].length + ' طالبًا', headers, rows,
            ctx.summary.className + '_' + t[0]);
}

/* ---------- معلّمو الدورات ---------- */

/* يُجمَّع من رؤوس الدورات (sv/courses لكل موضع) لا من جدول الموظفين: الدائرة
   تُسند الدورة إلى معلّمٍ بهويّته وجواله، وقد لا يكون موظفًا مسجّلًا أصلًا.
   والمرشّح بنوع الدورة يُعيد العدّ على دورات ذلك النوع وحده. */
let _cxT = null;   // { courses, classNo, error, loading }

function openCxTeachers() {
    _cxT = { courses: null, classNo: null, error: '', loading: true };
    cxPush(cxRenderTeachers);
    cxLoadTeachers();
}

async function cxLoadTeachers() {
    const t = _cxT;
    try {
        const centers = (await QMC.getCourseCenters()).map(normalizeSvCenter);
        const names = {};
        centers.forEach(c => { names[c.centerNo] = c.centerName; });
        const lists = await Promise.all(centers.map(c => QMC.getSvCourses(c.centerNo, 'all')));
        const byNo = {};   // المواضع قد تتداخل في الشجرة ⇒ الدورة الواحدة تعود مرّتين
        lists.forEach(l => l.forEach(j => {
            const c = normalizeSvCourse(j);
            c.centerName = names[c.centerNo] || ('موضع ' + c.centerNo);
            byNo[c.courseNo] = c;
        }));
        t.courses = Object.keys(byNo).map(k => byNo[k]);
    } catch (err) {
        t.error = crErrorText(err, 'sv');
    }
    t.loading = false;
    if (_cxStack[_cxStack.length - 1] === cxRenderTeachers) cxRenderTeachers();
}

function cxTeachersOf(courses) {
    const g = {};
    courses.forEach(c => {
        if (!c.teacherIdNo) return;
        (g[c.teacherIdNo] = g[c.teacherIdNo] || []).push(c);
    });
    const first = (l, f) => { for (let i = 0; i < l.length; i++) { const v = f(l[i]); if (v) return v; } return null; };
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    const out = Object.keys(g).map(id => {
        const l = g[id];
        const att = l.map(c => c.attPct).filter(v => v != null);
        const pct = l.map(c => c.avgPct).filter(v => v != null);
        let last = null;
        l.forEach(c => { if (c.startDate && (!last || c.startDate > last)) last = c.startDate; });
        const uniq = a => a.filter((v, i) => a.indexOf(v) === i);
        return {
            idNo: id, name: first(l, c => c.teacherName) || ('هوية ' + id), mobile: first(l, c => c.teacherMobile),
            courses: l.length, active: l.filter(c => c.state === 'ACTIVE').length,
            students: l.reduce((s, c) => s + c.students, 0),
            attPct: att.length ? Math.round(avg(att)) : null, avgPct: avg(pct),
            classes: uniq(l.map(c => c.className || 'بلا نوع')).join('، '),
            centers: uniq(l.map(c => c.centerName)).join('، '), lastStart: last,
        };
    });
    out.sort((a, b) => (b.active - a.active) || (b.courses - a.courses) || a.name.localeCompare(b.name, 'ar'));
    return out;
}

function cxTeachersShown() {
    const t = _cxT;
    const list = cxTeachersOf(t.courses.filter(c => t.classNo == null || c.courseClassNo === t.classNo));
    const q = normalizeAr((crEl('cxTeacherSearch') || {}).value || '').toLowerCase();
    return q ? list.filter(x => normalizeAr(x.name).toLowerCase().indexOf(q) !== -1 || x.idNo.indexOf(q) !== -1) : list;
}

function cxRenderTeachers() {
    const t = _cxT;
    if (t.error) return cxSet('معلّمو الدورات', 'كل المواضع', `<div class="students-empty">${crHtmlLines(t.error)}</div>`);
    if (!t.courses) return cxSet('معلّمو الدورات', 'كل المواضع', '<div class="students-empty">جارٍ التحميل…</div>');
    // أنواع الدورات في النطاق مع عدد دورات كل نوع — قائمةٌ منسدلة لا شرائط
    const classes = {};
    t.courses.forEach(c => {
        if (c.courseClassNo == null) return;
        const k = c.courseClassNo;
        classes[k] = classes[k] || { name: c.className || ('نوع ' + k), n: 0 };
        classes[k].n++;
    });
    const keys = Object.keys(classes).map(Number).sort((a, b) => a - b);
    const prevQ = (crEl('cxTeacherSearch') || {}).value || '';
    const filter = keys.length < 2 ? '' : `<div class="field"><label>نوع الدورة</label>
        <select id="cxTeacherClass" onchange="cxTeacherClass(this.value)">
            <option value="">كل الأنواع (${t.courses.length} دورة)</option>
            ${keys.map(k => `<option value="${k}" ${t.classNo === k ? 'selected' : ''}>${escapeHtml(classes[k].name)} (${classes[k].n})</option>`).join('')}
        </select></div>`;
    cxSet('معلّمو الدورات', 'كل المواضع', `
        ${filter}
        <div class="students-toolbar">
            <div class="search-wrap"><i class="fas fa-magnifying-glass search-icon"></i>
                <input type="search" id="cxTeacherSearch" placeholder="بحث بالاسم أو الهويّة" value="${escapeHtml(prevQ)}" oninput="cxRenderTeacherList()"></div>
            <button class="btn-new-student" onclick="cxTeachersExport()"><i class="fas fa-file-excel"></i> <span>Excel</span></button>
        </div>
        <div id="cxTeacherList" class="students-cards"></div>`);
    cxRenderTeacherList();
}

function cxTeacherClass(v) {
    _cxT.classNo = v === '' ? null : Number(v);
    cxRenderTeachers();
}

function cxRenderTeacherList() {
    const box = crEl('cxTeacherList');
    if (!box) return;
    const t = _cxT, list = cxTeachersShown();
    box.innerHTML = list.length ? list.map(x => `
        <div class="student-card">
            <div class="student-card-head"><span class="student-name"><i class="fas fa-user" style="color:#00897b"></i> ${escapeHtml(x.name)}</span>
                <span class="cr-pill accent">${x.courses} دورة</span></div>
            <div class="cr-sub">${t.classNo == null ? 'دوراته' : 'دوراته من هذا النوع'}: ${x.courses}${
                x.active ? ' (جارية ' + x.active + ')' : ''} · مسجّلون ${x.students}</div>
            ${t.classNo == null ? `<div class="cr-sub">${escapeHtml(x.classes)}</div>` : ''}
            <div class="cr-sub">📍 ${escapeHtml(x.centers)}</div>
            <div class="cr-sub">🪪 ${escapeHtml(x.idNo)}${x.mobile ? ' · ' + escapeHtml(x.mobile) : ''}</div>
            <div class="cr-pills">
                <span class="cr-pill">${x.avgPct != null ? 'متوسّط نسب طلابه: ' + cxNum(x.avgPct) + '٪' : 'لم تُرصد نتائج'}</span>
                ${x.attPct != null ? `<span class="cr-pill ${crPctCls(x.attPct)}">انتظام دوراته: ${x.attPct}٪</span>` : ''}
            </div>
        </div>`).join('') : '<div class="students-empty">لا معلّمين في هذا المرشّح</div>';
}

function cxTeachersExport() {
    const t = _cxT;
    if (!t || !t.courses) return;
    const list = cxTeachersShown();
    if (!list.length) return showToast('لا معلّمين في هذا المرشّح');
    const className = t.classNo == null ? null
        : ((t.courses.filter(c => c.courseClassNo === t.classNo)[0] || {}).className || ('نوع ' + t.classNo));
    const headers = ['الاسم', 'رقم الهوية', 'الجوال', 'الدورات', 'الجارية', 'المسجّلون',
                     'أنواع دوراته', 'المواضع', 'الانتظام ٪', 'متوسّط النسب ٪', 'آخر دورة'];
    const rows = list.map(x => [x.name, String(x.idNo), x.mobile ? String(x.mobile) : '', x.courses, x.active,
        x.students, x.classes, x.centers, x.attPct == null ? '' : x.attPct,
        x.avgPct == null ? '' : Number(x.avgPct.toFixed(1)), x.lastStart ? crDispDate(x.lastStart) : '']);
    cxExcel('معلّمو الدورات', 'كل المواضع' + (className ? ' · ' + className : '') + ' · ' + list.length + ' معلّمًا',
            headers, rows, 'معلمو_الدورات' + (className ? '_' + className : ''));
}
