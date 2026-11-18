/* =========================================================
   ✍️ الرصد من صفّ الطالب (2026-11-18) — نظير الإدخال المضمَّن في
   students_screen.dart (Flutter). العرض المعتمد: claude.ai/artifact/UAZt7FWLiGWEBV7tbvGBfW

   «تسميع» و«مراجعة» و«سرد» في صفّ الطالب المفتوح لا يفتحان لوحة الرصد:
   يُدخَل في الصفّ نفسه «يبدأ من» (محسوبة) و«إلى» (سورةٌ تُكتب + ± آية، مقترحةٌ
   بمقدار آخر نشاطٍ من النوع) والتقدير والأخطاء والملاحظة (مطويّة)، ونشاطٌ ثانٍ
   وثالث بزرّ «+ مراجعة أيضًا»، وحفظٌ واحد لها كلّها. السرد بالأجزاء كما في
   نموذج النشاط. «تفاصيل أكثر» تفتح لوحة الرصد الكاملة بما أُدخل.

   الحالة: _st = { student, list:[entry], editing: id|null, tagNo, date }.
   الرسم من studentCardHtml (app.js) ⇐ QmcRowEntry.bodyHtml(id).
   ========================================================= */
(function () {
    'use strict';

    var _st = null;
    var TYPE_REC = 1, TYPE_REV = 2, TYPE_SARD = 7;
    var NAMES_K = ['الأول', 'الثاني', 'الثالث'];
    var BIG_TASMEE_PAGES = 20;   // كـkTasmeeDayPagesWarn في Flutter

    // ── أدوات المصحف ────────────────────────────────────────────────
    function ayah(id) { return id ? ayahById(Number(id)) : null; }
    function surahOf(s) { buildSurahIndex(); return window.SURAH_BY_NUM ? window.SURAH_BY_NUM[s] : null; }
    function lastAyaOf(s) { var su = surahOf(s), a = su && ayah(su.lastId); return a ? a.a : 0; }
    function idOf(s, n) {
        var su = surahOf(s);
        if (!su) return 0;
        var id = su.firstId + n - 1, x = ayah(id);
        if (x && x.s === s && x.a === n) return id;
        for (var i = su.firstId; i <= su.lastId; i++) { x = ayah(i); if (x && x.a === n) return i; }
        return 0;
    }
    function posLabel(id) {
        var x = ayah(id);
        if (!x) return '';
        var su = surahOf(x.s);
        return (su ? su.name : '') + ' ' + x.a;
    }
    function rangeLabel(f, t) {
        var a = ayah(f), b = ayah(t);
        if (!a || !b) return '';
        return a.s === b.s ? posLabel(f) + '–' + b.a : posLabel(f) + ' – ' + posLabel(t);
    }
    // اسم السورة من المكتوب: التطابق التامّ (بلا همزات وال) ثم البداية
    function surahFromText(raw) {
        var t = stripAl(normalizeAr(String(raw || '').replace(/^\s*سورة\s+/, '').trim()));
        if (!t) return 0;
        var idx = buildSurahIndex(), best = 0, bestScore = 0;
        for (var i = 0; i < idx.length; i++) {
            var su = idx[i];
            if (String(su.s) === t) return su.s;
            var sc = surahWordScore(t, su);
            if (sc > bestScore) { bestScore = sc; best = su.s; }
            else if (sc === bestScore && sc < 3) best = best || su.s;
        }
        return bestScore >= 2 ? best : 0;
    }

    // ── المقدار (كـcalculateExactProgress بلا DOM) ───────────────────
    function fwdPages(id1, id2) {
        var s = ayah(id1), e = ayah(id2);
        if (!s || !e) return 0;
        var ml = window.PAGE_MAX_LINES || {};
        var startL = (s.a === 1 && (s.ls === 2 || s.ls === 3)) ? 1 : (s.ls || 1);
        var maxL = ml[e.p] || 15;
        var endL = (e.le === maxL) ? 15 : (e.le || 15);
        var total = 0, pc = (e.p - s.p) + 1;
        for (var i = 1; i <= pc; i++) {
            if (i === 1 && pc === 1) total += (endL - startL + 1) / 15;
            else if (i === 1) total += (15 - startL + 1) / 15;
            else if (i === pc) total += endL / 15;
            else total += 1;
        }
        return total || 0;
    }
    function amountOf(f, t) {
        var fo = ayah(f), to = ayah(t);
        if (!fo || !to) return 0;
        var r = 0;
        if (f > t) {
            r += fwdPages(f, surahOf(fo.s).lastId);
            if (fo.s !== to.s) {
                r += fwdPages(surahOf(to.s).firstId, t);
                for (var s = Math.min(fo.s, to.s) + 1; s < Math.max(fo.s, to.s); s++) {
                    var su = surahOf(s);
                    if (su) r += fwdPages(su.firstId, su.lastId);
                }
            }
        } else r = fwdPages(f, t);
        return Number(r || 0).toFixed(1);
    }

    // ── «يبدأ من» و«إلى» المتوقَّعة (نظير StudentService في Flutter) ───
    // نشاط الطالب من النوع قبل اليوم المعروض، الأحدث أوّلًا
    function prevActs(student, type) {
        var day = actDay();
        return _recordsCache.filter(function (r) {
            return Number(r.student) === Number(student) && Number(r.type) === Number(type) && String(r.date) < day;
        }).sort(function (a, b) { return isLaterActivity(a, b) ? -1 : isLaterActivity(b, a) ? 1 : 0; });
    }
    // getNextAyaTagBefore: التالية لآخر «إلى»، وآخر السورة ⇒ السورة التالية،
    // أو السابقة إن كان الطالب يسير من آخر المصحف إلى أوّله
    function nextFrom(student, type) {
        var acts = prevActs(student, type).filter(function (r) { return Number(r.toRange) > 0; });
        if (!acts.length) return 0;
        var last = ayah(acts[0].toRange);
        if (!last) return 0;
        if (last.a < lastAyaOf(last.s)) return last.id + 1;
        if (acts.length > 1) {
            var prev = ayah(acts[1].toRange), back = surahOf(last.s - 1);
            if (prev && prev.s > last.s && back) return back.firstId;
        }
        return ayah(last.id + 1) ? last.id + 1 : 0;
    }
    // expectedToAyaTag: «من» + مقدار آخر نشاطٍ من النوع، في سورة «من»، ولا يجاوز صفحتين
    function expectedTo(student, type, fromId) {
        var acts = prevActs(student, type).filter(function (r) {
            return Number(r.fromRange) > 0 && Number(r.toRange) >= Number(r.fromRange);
        });
        if (!acts.length) return 0;
        var span = Number(acts[0].toRange) - Number(acts[0].fromRange);
        var f = ayah(fromId);
        if (!f) return 0;
        var to = fromId + span;
        while (to > fromId && (!ayah(to) || ayah(to).s !== f.s)) to--;
        var t = ayah(to);
        if (!t || t.p - f.p > 2) return 0;
        return to;
    }
    function spanOf(student, type) {
        var acts = prevActs(student, type).filter(function (r) {
            return Number(r.fromRange) > 0 && Number(r.toRange) >= Number(r.fromRange);
        });
        return acts.length ? Number(acts[0].toRange) - Number(acts[0].fromRange) + 1 : 0;
    }
    // السرد بالأجزاء: بعد آخر «إلى الجزء» بمقداره، وبعد الثلاثين يعود الأوّل
    function nextParts(student) {
        var acts = prevActs(student, TYPE_SARD).filter(function (r) { return Number(r.partTo) > 0; });
        if (!acts.length) return { from: 0, to: 0 };
        var a = acts[0], to = Number(a.partTo), fr = Number(a.partFrom || to);
        var f = to >= 30 ? 1 : to + 1;
        return { from: f, to: Math.min(30, f + Math.max(0, to - fr)) };
    }

    // ── الحالة ─────────────────────────────────────────────────────
    function todayTypes(student) {
        return ((_dayActsCache && _dayActsCache[Number(student)]) || []).map(function (r) { return Number(r.type); });
    }
    // المراجعة: إن سُجّلت مراجعةٌ في اليوم فهذه ثانية (22)
    function reviewTypeFor(student) {
        return todayTypes(student).indexOf(TYPE_REV) !== -1 ? SECOND_REVIEW_TYPE : TYPE_REV;
    }
    function isPart(t) { return Number(t) === TYPE_SARD; }

    function newEntry(student, type) {
        var e = { type: Number(type), from: 0, to: 0, partFrom: 0, partTo: 0, grade: '', errors: 0,
                  note: '', noteOpen: false, changeFrom: false, err: '', span: 0 };
        fillRange(student, e);
        return e;
    }
    function fillRange(student, e) {
        e.err = '';
        if (isPart(e.type)) {
            var p = nextParts(student);
            e.partFrom = p.from || 1;
            e.partTo = p.to || e.partFrom;
            e.from = e.to = 0;
            return;
        }
        e.partFrom = e.partTo = 0;
        e.from = nextFrom(student, e.type);
        e.span = spanOf(student, e.type);
        e.changeFrom = !e.from;
        e.to = e.from ? (expectedTo(student, e.type, e.from) || e.from) : 0;
    }

    function student() { return _st ? _studentsCache.find(function (s) { return Number(s.id) === Number(_st.student); }) : null; }

    // الأنواع المتاحة لسطر: لا نوعٌ سُجّل في اليوم ولا نوعٌ في سطرٍ آخر
    function typesFor(k) {
        var taken = {}, today = _st.editing ? [] : todayTypes(_st.student);
        today.forEach(function (t) { taken[t] = 1; });
        _st.list.forEach(function (o, i) { if (i !== k) taken[o.type] = 1; });
        var rev = reviewTypeFor(_st.student);
        if (_st.editing) rev = (_st.list[k].type === SECOND_REVIEW_TYPE) ? SECOND_REVIEW_TYPE : TYPE_REV;
        else if (taken[TYPE_REV] && !taken[SECOND_REVIEW_TYPE]) rev = SECOND_REVIEW_TYPE;
        return [TYPE_REC, rev, TYPE_SARD].map(function (t) {
            return { t: t, off: !!taken[t] && _st.list[k].type !== t };
        });
    }
    function nextAddType() {
        var used = {};
        todayTypes(_st.student).forEach(function (t) { used[t] = 1; });
        _st.list.forEach(function (e) { used[e.type] = 1; });
        var rev = used[TYPE_REV] ? SECOND_REVIEW_TYPE : TYPE_REV;
        var order = [rev, TYPE_REC, TYPE_SARD];
        for (var i = 0; i < order.length; i++) if (!used[order[i]]) return order[i];
        return 0;
    }

    function typeShort(t) {
        t = Number(t);
        if (t === SECOND_REVIEW_TYPE) return 'مراجعة ثانية';
        if (t === TYPE_REC) return 'تسميع';
        if (t === TYPE_REV) return 'مراجعة';
        if (t === TYPE_SARD) return 'سرد';
        return activityTypeName(t);
    }
    function typeIcon(t) {
        t = Number(t);
        return t === TYPE_REC ? 'fa-microphone' : t === TYPE_SARD ? 'fa-book-open'
             : t === SECOND_REVIEW_TYPE ? 'fa-repeat' : 'fa-rotate';
    }

    function autoNext() {
        try { return localStorage.getItem('row_auto_next:' + getCurrentUser()) !== '0'; } catch (_) { return true; }
    }
    function setAutoNext(on) {
        try { localStorage.setItem('row_auto_next:' + getCurrentUser(), on ? '1' : '0'); } catch (_) {}
    }

    function grades() {
        var sel = document.getElementById('rating');
        if (!sel) return [];
        return Array.prototype.filter.call(sel.options, function (o) { return o.value; })
            .map(function (o) { return { v: String(o.value), t: o.text }; });
    }

    // ── الرسم ──────────────────────────────────────────────────────
    function esc(v) { return escapeHtml(v); }
    function stepper(act, k, val, label, minus, plus, extraCls) {
        return '<span class="re-step' + (extraCls ? ' ' + extraCls : '') + '">' +
            '<button type="button" data-re="' + act + '-" data-k="' + k + '" aria-label="' + esc(minus) + '"><i class="fas fa-minus"></i></button>' +
            val +
            '<button type="button" data-re="' + act + '+" data-k="' + k + '" aria-label="' + esc(plus) + '"><i class="fas fa-plus"></i></button></span>';
    }

    function entryHtml(e, k, n) {
        var h = '<div class="re-entry">';
        if (n > 1) {
            h += '<div class="re-entry-h"><span>النشاط ' + NAMES_K[k] + '</span>' +
                (k > 0 ? '<button type="button" class="re-link danger" data-re="rm" data-k="' + k + '">إزالة</button>' : '') + '</div>';
        }
        h += '<div class="re-seg" role="group" aria-label="نوع النشاط">' + typesFor(k).map(function (o) {
            return '<button type="button" class="' + (e.type === o.t ? 'on' : '') + '"' + (o.off ? ' disabled' : '') +
                ' data-re="type" data-k="' + k + '" data-v="' + o.t + '" aria-pressed="' + (e.type === o.t) + '">' +
                '<i class="fas ' + typeIcon(o.t) + '"></i>' + esc(typeShort(o.t)) + '</button>';
        }).join('') + '</div>';

        if (isPart(e.type)) {
            h += '<div class="re-row"><span class="re-lbl">من الجزء</span>' +
                stepper('pf', k, '<output>' + (e.partFrom || '—') + '</output>', 'جزءٌ قبله', 'جزءٌ بعده') + '</div>' +
                '<div class="re-row"><span class="re-lbl">إلى الجزء</span>' +
                stepper('pt', k, '<output>' + (e.partTo || '—') + '</output>', 'جزءٌ قبله', 'جزءٌ بعده') + '</div>';
            var np = (e.partFrom && e.partTo) ? (e.partTo - e.partFrom + 1) : 0;
            if (np > 0) h += '<div class="re-hint">' + (np === 1 ? 'جزءٌ واحد' : np === 2 ? 'جزآن' : np + ' أجزاء') + '</div>';
        } else {
            h += '<div class="re-row"><span class="re-lbl">يبدأ من</span>';
            if (e.changeFrom) {
                h += '<input type="text" class="re-from-in" data-ref="from" data-k="' + k + '" id="reFrom' + k + '" ' +
                    'value="' + esc(e.from ? posLabel(e.from) : '') + '" placeholder="السورة ورقم الآية، مثل «الملك 1»" autocomplete="off">';
                if (e.from) h += '<button type="button" class="re-link" data-re="from-done" data-k="' + k + '">تمّ</button>';
            } else {
                h += '<b class="re-from">' + esc(posLabel(e.from)) + '</b>' +
                    '<button type="button" class="re-link" data-re="from-change" data-k="' + k + '">تغيير</button>';
            }
            h += '</div>';
            var to = ayah(e.to);
            h += '<div class="re-row"><span class="re-lbl">إلى</span>' +
                '<input type="text" class="re-surah" data-ref="toSurah" data-k="' + k + '" id="reToS' + k + '" list="reSurahList" ' +
                'value="' + esc(to ? surahOf(to.s).name : '') + '" placeholder="السورة" autocomplete="off"' + (e.from ? '' : ' disabled') + '>' +
                stepper('to', k, '<input type="number" inputmode="numeric" class="re-aya" data-ref="toAya" data-k="' + k + '" id="reToA' + k +
                    '" min="1" value="' + (to ? to.a : '') + '" aria-label="رقم آية «إلى»"' + (e.from ? '' : ' disabled') + '>', 'آيةٌ أقلّ', 'آيةٌ أكثر') +
                '</div>';
            if (e.from && e.to) {
                var f = ayah(e.from), cnt = (f && to && f.s === to.s) ? (to.a - f.a + 1) : 0;
                var bits = [];
                if (cnt > 0) bits.push(cnt + ' آية');
                var pg = Number(amountOf(e.from, e.to));
                if (pg > 0) bits.push('نحو ' + pg + ' صفحة');
                if (e.span) bits.push('آخر ' + typeShort(e.type) + ': ' + e.span + ' آية');
                h += '<div class="re-hint">' + esc(bits.join(' · ')) + '</div>';
            }
        }

        h += '<div class="re-grades" role="group" aria-label="التقدير">' + grades().map(function (g) {
            return '<button type="button" class="' + (e.grade === g.v ? 'on' : '') + '" data-re="grade" data-k="' + k + '" data-v="' + esc(g.v) +
                '" aria-pressed="' + (e.grade === g.v) + '">' + esc(g.t) + '</button>';
        }).join('') + '</div>';

        h += '<div class="re-row"><span class="re-lbl">الأخطاء</span>' +
            stepper('err', k, '<output class="' + (e.errors ? 'has' : '') + '">' + e.errors + '</output>', 'خطأٌ أقلّ', 'خطأٌ أكثر') + '</div>';

        // الملاحظة حقلٌ ظاهر (11-18: زرّ «+ ملاحظة» كان يأخذ السطر نفسه)
        h += '<input type="text" class="re-note" data-ref="note" data-k="' + k + '" id="reNote' + k + '" maxlength="400" ' +
            'value="' + esc(e.note) + '" placeholder="ملاحظة (اختياري)">';
        if (e.err) h += '<div class="re-err">' + esc(e.err) + '</div>';
        return h + '</div>';
    }

    function bodyHtml(studentId) {
        if (!_st || Number(_st.student) !== Number(studentId)) return null;
        var n = _st.list.length, nt = _st.editing ? 0 : nextAddType();
        var next = autoNext() && !_st.editing;
        var lbl = _st.editing ? 'حفظ التعديل'
            : (n === 1 ? 'حفظ' : n === 2 ? 'حفظ النشاطين' : 'حفظ 3 أنشطة') + (next ? ' والتالي' : '');
        var h = '<div class="re-box">' + _st.list.map(function (e, k) { return entryHtml(e, k, n); }).join('');
        if (nt && n < 3) {
            h += '<button type="button" class="re-add" data-re="add" data-v="' + nt + '"><i class="fas fa-plus"></i> ' +
                esc(typeShort(nt)) + ' أيضًا</button>';
        }
        h += '<div class="re-save-row"><button type="button" class="re-save" data-re="save"' + (_st.busy ? ' disabled' : '') + '>' +
            '<i class="fas fa-check"></i> ' + esc(lbl) + '</button>' +
            '<button type="button" class="re-cancel" data-re="cancel">إلغاء</button></div>' +
            '<button type="button" class="re-link re-more" data-re="full">تفاصيل أكثر… (العلامة، المصحف، أكثر من ذلك)</button>' +
            '</div>';
        return h;
    }

    function ensureSurahList() {
        if (document.getElementById('reSurahList')) return;
        var dl = document.createElement('datalist');
        dl.id = 'reSurahList';
        dl.innerHTML = buildSurahIndex().map(function (su) { return '<option value="' + esc(su.name) + '">'; }).join('');
        document.body.appendChild(dl);
    }

    // يُعاد رسم صفّ الطالب وحده — لا القائمة كلّها
    // ⚠️ حقلٌ مركَّز يُزال ⇒ blur ⇒ change ⇒ paint داخل paint ("node is no longer a child").
    //    فيُرفع التركيز أوّلًا (فيُحفظ ما كُتب في الحالة)، ثم يُرسم، ويُعاد التركيز.
    var _painting = false;
    function blurInside(el) {
        var a = document.activeElement;
        if (a && el && el.contains(a) && a.blur) a.blur();
    }
    function paint() {
        if (!_st || _painting) return;
        _painting = true;
        try {
            var el = document.getElementById('stRow' + _st.student);
            var mark = focusMark();
            blurInside(el);
            var s = student();
            el = document.getElementById('stRow' + (_st ? _st.student : ''));
            if (!_st) { renderStudentCards(); return; }
            if (!s || !el) { renderStudentCards(); return; }
            el.outerHTML = studentCardHtml(s);
            focusRestore(mark);
        } finally {
            _painting = false;
        }
    }

    // التركيز يبقى في حقله بعد إعادة الرسم (المزامنة تعيد رسم القائمة في الخلفية)
    function focusMark() {
        var a = document.activeElement;
        if (!_st || !a || !a.id || !/^re(From|ToS|ToA|Note)\d$/.test(a.id)) return null;
        var m = { id: a.id };
        try { m.s = a.selectionStart; m.e = a.selectionEnd; } catch (_) {}
        return m;
    }
    function focusRestore(m) {
        if (!m) return;
        var a = document.getElementById(m.id);
        if (!a) return;
        try { a.focus({ preventScroll: true }); } catch (_) { a.focus(); }
        try { if (m.s != null) a.setSelectionRange(m.s, m.e); } catch (_) {}
    }

    function scrollToRow(id) {
        var el = document.getElementById('stRow' + id);
        if (el && el.scrollIntoView) { try { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {} }
    }

    // ── الأفعال ────────────────────────────────────────────────────
    function open(studentId, type) {
        if (typeof QURAN_DATA === 'undefined') return openActivityForStudent(studentId, type);
        var id = Number(studentId);
        if (Number(type) === TYPE_REV) type = reviewTypeFor(id);
        if (todayTypes(id).indexOf(Number(type)) !== -1) {
            return showAlert({
                title: 'سُجّل له «' + typeShort(type) + '» ' + actDayLabel(actDay()),
                message: 'لتعديله: المس شارته في صفّ الطالب ثم «عرض / تعديل».',
                icon: 'ℹ️',
            });
        }
        ensureSurahList();
        _st = { student: id, list: [], editing: null, busy: false };
        _st.list.push(newEntry(id, type));
        _openStudentRow = id;
        renderStudentCards();
        scrollToRow(id);
    }

    // من شارة نشاطٍ مسجَّل: «عرض / تعديل» في الصفّ نفسه
    function canEdit(r) {
        var t = Number(r && r.type);
        return typeof QURAN_DATA !== 'undefined' &&
            (t === TYPE_REC || t === TYPE_REV || t === SECOND_REVIEW_TYPE || t === TYPE_SARD);
    }
    function edit(r) {
        ensureSurahList();
        var t = Number(r.type);
        var e = { type: t, from: Number(r.fromRange) || 0, to: Number(r.toRange) || 0,
                  partFrom: Number(r.partFrom) || 0, partTo: Number(r.partTo) || 0,
                  grade: r.rating ? String(r.rating) : '', errors: Number(r.errors) || 0,
                  note: r.notes || '', noteOpen: !!r.notes, changeFrom: false, err: '', span: 0 };
        if (!isPart(t) && !e.from) e.changeFrom = true;
        _st = { student: Number(r.student), list: [e], editing: Number(r.id), tagNo: Number(r.tagNo || 0),
                date: String(r.date), orig: r, busy: false };
        _openStudentRow = Number(r.student);
        renderStudentCards();
        scrollToRow(r.student);
    }

    function close() {
        _st = null;
    }

    function validate(e) {
        if (isPart(e.type)) {
            if (!e.partFrom || !e.partTo) return 'اختر الجزء من وإلى';
            if (e.partFrom > e.partTo) return '«من الجزء» بعد «إلى الجزء»';
        } else {
            if (!e.from) return 'اكتب «يبدأ من»: اسم السورة ثم رقم الآية';
            if (!e.to) return 'اكتب «إلى»: السورة ورقم الآية';
            var f = ayah(e.from), t = ayah(e.to);
            if (f && t && f.s === t.s && t.a < f.a) return '«إلى» قبل «يبدأ من» في السورة نفسها';
        }
        if (!e.grade) return grades().length ? 'اختر التقدير' : 'التقديرات لم تُحمَّل — اسحب البيانات من الإعدادات';
        return '';
    }

    async function save() {
        if (!_st || _st.busy) return;
        var st = _st, bad = 0;
        st.list.forEach(function (e) { e.err = validate(e); if (e.err) bad++; });
        // نوعٌ سُجّل في اليوم (من جهازٍ آخر بعد فتح الصفّ مثلًا)
        if (!st.editing) {
            var today = todayTypes(st.student);
            st.list.forEach(function (e) {
                if (!e.err && today.indexOf(e.type) !== -1) {
                    e.err = 'سُجّل له «' + typeShort(e.type) + '» ' + actDayLabel(actDay()) + ' — عدّله من شارته';
                    bad++;
                }
            });
        }
        if (bad) { paint(); return; }

        // 📏 تسميعٌ بجزءٍ فأكثر في يوم ⇒ يُسأل (كأندرويد)، ولا يُمنع
        for (var i = 0; i < st.list.length; i++) {
            var e = st.list[i];
            if (e.type !== TYPE_REC) continue;
            var f = ayah(e.from), t = ayah(e.to);
            var pages = (f && t) ? Math.abs(t.p - f.p) + 1 : 0;
            if (pages >= BIG_TASMEE_PAGES) {
                var ok = await showConfirm({
                    title: 'تسميعٌ كبير في يومٍ واحد',
                    message: 'سجّلتَ نحو ' + pages + ' صفحة تسميع في يومٍ واحد.\n\n' +
                             'التسميع للحفظ الجديد وحده. فإن كان قراءةً لما حُفظ من قبل فاختر له «مراجعة» أو «سرد».',
                    confirmText: 'هو حفظٌ جديد، احفظ',
                    cancelText: 'رجوع للتعديل',
                    icon: activityIconHtml(TYPE_REC),
                });
                if (!ok) return;
            }
        }

        var who = await getTeacherIdentity();
        if (!who.teacher) return showAlert('تعذّر التعرّف على المسمّع. يرجى تسجيل الخروج ثم الدخول من جديد.');
        if (_st !== st) return;   // أُغلق الصفّ أثناء السؤال

        var date = st.editing ? st.date : actDay();
        var recs = st.list.map(function (e) {
            var part = isPart(e.type);
            return buildActivityRecord({
                teacher: who.teacher, teacherName: who.teacherName,
                student: Number(st.student), type: e.type, date: date,
                fromRange: part ? '' : e.from, toRange: part ? '' : e.to,
                amount: part ? 0 : amountOf(e.from, e.to),
                errors: e.errors, rating: e.grade,
                partFrom: part ? e.partFrom : '', partTo: part ? e.partTo : '',
                mark: st.editing && st.orig ? (st.orig.mark || '') : '',
                notes: String(e.note || '').trim(),
                tagNo: st.editing ? st.tagNo : 0,
            });
        });

        if (st.editing) {
            var old = st.orig || {};
            if (old.synced && !Number(old.tagNo) && Number(old.type) !== Number(recs[0].type)) {
                return showAlert({
                    title: 'اسحب البيانات أوّلًا',
                    message: 'هذا النشاط لم يصل رقمه من السيرفر بعد، فتغيير نوعه يكرّره.\nاسحب البيانات من الإعدادات ثم أعد التعديل.',
                    icon: '⚠️',
                });
            }
            st.busy = true;
            updateExistingRecord(st.editing, recs[0], function () {
                if (_st === st) _st = null;
                _openStudentRow = null;
            });
            setTimeout(function () { if (_st === st) { st.busy = false; paint(); } }, 1500);
            return;
        }

        st.busy = true;
        paint();
        var saved = [];
        var name = String(fullStudentName(student()) || '').split(' ')[0];
        (function next(i) {
            if (i >= recs.length) return done();
            persistRecord(recs[i], function (r) { saved.push(r); next(i + 1); }, { quiet: true, deferSyncMs: 5200 });
        })(0);
        // نشاطٌ رُفض (تكرارٌ وصل للتوّ) ⇒ يتوقّف التسلسل وتظهر رسالته؛ الصفّ يبقى
        setTimeout(function () { if (_st === st && st.busy && saved.length < recs.length) { st.busy = false; paint(); } }, 2500);

        function done() {
            if (_st === st) _st = null;
            advanceStudentRow(st.student);   // يحترم مفتاح «افتح التالي»
            showToast('سُجّل لـ' + name + ': ' + saved.map(function (r) { return actChipLabel(r); }).join(' + '), {
                ms: 5000, actionLabel: 'تراجع', onAction: function () { undo(saved, st.student); },
            });
            setTimeout(function () { scrollToRow(_openStudentRow); }, 60);
        }
    }

    async function undo(recs, studentId) {
        var left = 0;
        for (var i = 0; i < recs.length; i++) {
            var cur = recs[i] && recs[i].id != null ? await getRecordById(recs[i].id) : null;
            if (!cur) continue;
            if (cur.synced) { left++; continue; }
            await deleteRecordLocally(cur.id);
        }
        _openStudentRow = Number(studentId);
        refreshAll();
        showToast(left ? 'رُفع ' + left + ' قبل التراجع — احذفه من شارته' : 'أُلغي التسجيل');
    }

    // «تفاصيل أكثر»: لوحة الرصد الكاملة بما أُدخل في السطر الأوّل
    async function openFull() {
        var st = _st;
        if (!st) return;
        var e = st.list[0];
        _st = null;
        if (st.editing) { renderStudentCards(); return editRecord(st.editing); }
        openActivitySheet();
        paintSheetHead(st.student, e.type);
        var sel = document.getElementById('studentSelect');
        if (sel) {
            ensureStudentOption(sel, st.student);
            sel.value = String(st.student);
            syncStudentPickerText();
            sel.dispatchEvent(new Event('change'));
        }
        var d = document.getElementById('activityDate');
        if (d) d.value = actDay();
        var tsel = document.getElementById('activityType');
        if (tsel) tsel.value = String(e.type);
        var icons = document.getElementById('iconsContainer');
        if (icons) icons.querySelectorAll('.icon-card').forEach(function (c) {
            c.classList.toggle('active', String(c.dataset.value) === String(e.type));
        });
        await handleActivityTypeChange(e.type, { silent: true });   // يملأ «من» ثم نكتب فوقه
        if (tsel) tsel.dispatchEvent(new Event('change'));
        var setVal = function (id, v) { var el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); };
        if (isPart(e.type)) {
            setVal('partFrom', e.partFrom || '');
            setVal('partTo', e.partTo || '');
        } else {
            setVal('rangeFrom', e.from || '');
            setVal('rangeTo', e.to || '');
            setVal('rangeFromText', AYAH_REVERSE[e.from] || '');
            setVal('rangeToText', AYAH_REVERSE[e.to] || '');
        }
        setVal('errors', e.errors || 0);
        setVal('rating', e.grade || '');
        syncRatingSelection();
        if (!isPart(e.type)) calculateExactProgress();
        renderStudentCards();
    }

    function setTo(e, s, n) {
        var last = lastAyaOf(s);
        if (!last) return;
        n = Math.max(1, Math.min(last, n));
        var id = idOf(s, n);
        if (id) e.to = id;
        // في سورة «من» لا تسبق «إلى» «من»
        var f = ayah(e.from), t = ayah(e.to);
        if (f && t && f.s === t.s && t.a < f.a) e.to = e.from;
    }

    document.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-re]');
        if (!b || !_st) return;
        var a = b.dataset.re, k = Number(b.dataset.k || 0), e = _st.list[k], v = b.dataset.v;
        switch (a) {
            case 'type': {
                var nt = Number(v);
                if (e.type === nt) return;
                var keep = { grade: e.grade, errors: e.errors, note: e.note, noteOpen: e.noteOpen };
                e.type = nt;
                if (!_st.editing) fillRange(_st.student, e);
                else if (isPart(nt) && !e.partFrom) fillRange(_st.student, e);
                else if (!isPart(nt) && !e.from) fillRange(_st.student, e);
                Object.assign(e, keep);
                break;
            }
            case 'add': _st.list.push(newEntry(_st.student, Number(v))); break;
            case 'rm': _st.list.splice(k, 1); break;
            case 'from-change': e.changeFrom = true; paint(); var fi = document.getElementById('reFrom' + k); if (fi) fi.focus(); return;
            case 'from-done': e.changeFrom = !e.from; break;
            case 'to-': case 'to+': {
                var t = ayah(e.to);
                if (!t) return;
                setTo(e, t.s, t.a + (a === 'to+' ? 1 : -1));
                e.err = '';
                break;
            }
            case 'pf-': e.partFrom = Math.max(1, (e.partFrom || 1) - 1); break;
            case 'pf+': e.partFrom = Math.min(30, (e.partFrom || 0) + 1); if (e.partTo < e.partFrom) e.partTo = e.partFrom; break;
            case 'pt-': e.partTo = Math.max(1, (e.partTo || 1) - 1); if (e.partFrom > e.partTo) e.partFrom = e.partTo; break;
            case 'pt+': e.partTo = Math.min(30, (e.partTo || 0) + 1); break;
            case 'grade': e.grade = (e.grade === v) ? '' : v; e.err = ''; break;
            case 'err-': e.errors = Math.max(0, e.errors - 1); break;
            case 'err+': e.errors = Math.min(99, e.errors + 1); break;
            case 'note-open': e.noteOpen = true; paint(); var ni = document.getElementById('reNote' + k); if (ni) ni.focus(); return;
            case 'cancel': {
                var id = _st.student;
                _st = null;
                _openStudentRow = id;
                renderStudentCards();
                return;
            }
            case 'save': save(); return;
            case 'full': openFull(); return;
            default: return;
        }
        paint();
    });

    document.addEventListener('change', function (ev) {
        var el = ev.target;
        if (!_st || !el.dataset || !el.dataset.ref) return;
        var k = Number(el.dataset.k || 0), e = _st.list[k];
        if (!e) return;
        if (el.dataset.ref === 'from') {
            var r = resolveAyahText(el.value, '');
            if (!r.id) { e.err = ayahProblemText(r, el.value, 'يبدأ من'); paint(); return; }
            e.from = r.id;
            e.changeFrom = false;
            e.err = '';
            var x = expectedTo(_st.student, e.type, e.from);
            var t = ayah(e.to), f = ayah(e.from);
            if (x) e.to = x;
            else if (!t || !f || t.s !== f.s || t.a < f.a) e.to = e.from;
        } else if (el.dataset.ref === 'toSurah') {
            var s = surahFromText(el.value);
            if (!s) { e.err = 'لم أتعرّف على السورة «' + String(el.value).trim() + '» — اخترها من الاقتراحات'; paint(); return; }
            var cur = ayah(e.to);
            setTo(e, s, cur ? cur.a : 1);
            e.err = '';
        } else if (el.dataset.ref === 'toAya') {
            var c = ayah(e.to);
            var n = parseInt(String(el.value).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); }), 10);
            if (!c || !n) { paint(); return; }
            if (n > lastAyaOf(c.s)) e.err = 'سورة ' + surahOf(c.s).name + ' آياتها ' + lastAyaOf(c.s);
            else e.err = '';
            setTo(e, c.s, n);
        } else if (el.dataset.ref === 'note') {
            e.note = el.value;
            return;
        }
        paint();
    });

    document.addEventListener('input', function (ev) {
        var el = ev.target;
        if (!_st || !el.dataset || el.dataset.ref !== 'note') return;
        var e = _st.list[Number(el.dataset.k || 0)];
        if (e) e.note = el.value;
    });

    window.QmcRowEntry = {
        bodyHtml: bodyHtml,
        open: open,
        edit: edit,
        canEdit: canEdit,
        close: close,
        active: function () { return _st ? _st.student : null; },
        autoNext: autoNext,
        setAutoNext: setAutoNext,
        // قبل إعادة رسم القائمة كلّها: يُعلَّم الحقل ويُرفع تركيزه (ما كُتب يُحفظ)
        focusMark: function () {
            var m = focusMark();
            if (m) { _painting = true; try { blurInside(document.getElementById('studentsCards')); } finally { _painting = false; } }
            return m;
        },
        focusRestore: focusRestore,
        // للفحص
        _nextFrom: nextFrom, _expectedTo: expectedTo, _amountOf: amountOf, _nextParts: nextParts,
    };
})();
