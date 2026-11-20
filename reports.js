/* =========================================================
   📊 تقارير الحلقة (2026-11-20) — نظير شاشة التقارير في Flutter لمعلّم الحلقة:
   تقرير التسكين · الحضور والتسميع · الشهري التفصيلي · ملخّص الحلقات والمتميّزون
   · كشف بيانات الطلاب · خلاصة اختبارات الطلاب.

   كلٌّ «معايير ثم ورقة» كما في Flutter (specs/memo_reports.dart):
   الحلقة (حلقاتي من مخزن circles) والفترة ⇒ PDF أو Excel.
   المصادر نقاط السيرفر نفسها، والنطاق يفرضه السيرفر (QMC_V_USER_CIRCLES):
     sv/placement/:circle_no · sv/recitationReport · sv/monthlyReport
     sv/report/students · sv/report/exams-summary
   والأوراق نسخٌ من قوالب Flutter (أيّ تغييرٍ هناك يُنقل هنا):
     placement_pdf.dart · recitation_export.dart · monthly_report_export.dart
     roster_export.dart · exams_summary_pdf.dart
   الظهور بقدرة REPORT_* (getUserAccess.capabilities) متى وصل report_groups —
   كما في reports_hub_screen.dart — والسيرفر هو الحارس.
   ⚠️ Excel بلا ألوان: SheetJS المجتمعيّة (0.18.5) لا تكتب تنسيق الخلايا.
   ========================================================= */
(function () {
  'use strict';

  /* ---------- أساسيات ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function user() { return typeof getCurrentUser === 'function' ? String(getCurrentUser() || '') : ''; }
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function toast(m) { if (typeof showToast === 'function') showToast(m); }
  function alertMsg(title, msg) {
    if (typeof showAlert === 'function') showAlert({ title: title, message: msg, icon: '⚠️' });
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { var p = String(s || '').split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
  // «2026-11-05» ⇐ «05/11/2026» — للسيرفر (DD/MM/YYYY) وللورقة
  function dmy(s) { var p = String(s || '').trim().split(' ')[0].split('T')[0].split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(s || '').trim(); }

  // الصفحات بكسرٍ واحد بلا «.0» — _num في monthly_report_export.dart
  function n1(v) { var r = Math.round((Number(v) || 0) * 10) / 10; return r === Math.round(r) ? String(Math.round(r)) : r.toFixed(1); }
  // الصفر فارغ في صفوف الطلاب
  function z(v) { v = Number(v) || 0; return v === 0 ? '' : (v === Math.round(v) ? String(v) : n1(v)); }
  function toI(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
  function toD(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  // ترتيبٌ عربيّ: «أحمد» بعد «ابراهيم» لا قبله (compareArabicNames)
  var TASHKEEL = new RegExp('[' + String.fromCharCode(0x64B) + '-' + String.fromCharCode(0x652) + String.fromCharCode(0x640) + ']', 'g');
  function arKey(s) {
    return String(s || '').replace(TASHKEEL, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim();
  }
  function cmpAr(a, b) { return arKey(a).localeCompare(arKey(b), 'ar'); }

  /* ---------- الحلقات والمؤسسات ---------- */
  function myCircles() {
    var list = (typeof _circlesCache !== 'undefined' && Array.isArray(_circlesCache)) ? _circlesCache.slice() : [];
    var seen = {};
    return list.filter(function (c) {
      var n = Number(c.circleNo);
      if (!n || seen[n]) return false;
      seen[n] = true;
      return true;
    }).sort(function (a, b) { return cmpAr(a.circleName, b.circleName); });
  }
  function circleOf(no) {
    var c = myCircles().filter(function (x) { return Number(x.circleNo) === Number(no); })[0];
    return c || null;
  }

  // 🏛 مؤسسة كل مركز (أقرب جذر) من sv/myCenters — عنوان الأوراق باسم مؤسسة الحلقة
  //    لا مؤسسة الجلسة (multi-root-user-logo). محفوظٌ على الجهاز.
  var _centers = null;
  async function centerMap() {
    var u = user(), key = 'rp_centers:' + u;
    if (_centers && _centers.u === u) return _centers.map;
    var map = lsGet(key) || {};
    if (navigator.onLine && window.QMC) {
      try {
        var r = await QMC.apiFetch('sv/myCenters', { timeoutMs: 15000 });
        var j = r.ok ? await r.json() : null;
        if (j && Array.isArray(j.items)) {
          map = {};
          j.items.forEach(function (c) {
            map[Number(c.center_no)] = {
              name: String(c.center_name || '').trim(),
              root: c.root_center_no != null ? Number(c.root_center_no) : Number(c.center_no),
              rootName: String(c.root_name || '').trim(),
            };
          });
          lsSet(key, map);
        }
      } catch (_) {}
    }
    _centers = { u: u, map: map };
    return map;
  }
  function orgOfCenter(map, centerNo) {
    var c = centerNo != null ? map[Number(centerNo)] : null;
    return c ? (c.rootName || '') : '';
  }
  function centerNameOf(map, centerNo, fallback) {
    var c = centerNo != null ? map[Number(centerNo)] : null;
    if (c && c.name) return c.name;
    return fallback || '';
  }

  /* ---------- الشبكة ---------- */
  async function getJson(path, timeoutMs) {
    if (!navigator.onLine) throw new Error('التقرير يُعدّ من السيرفر — اتّصل بالإنترنت ثم أعد المحاولة.');
    var r;
    try {
      r = await QMC.apiFetch(path, { timeoutMs: timeoutMs || 90000 });
    } catch (e) {
      throw new Error(e && e.name === 'AbortError'
        ? 'تأخّر السيرفر في الردّ — الشبكة ضعيفة. أعد المحاولة، أو اختر حلقةً واحدة أو فترةً أقصر.'
        : 'تعذّر الوصول إلى السيرفر — تأكّد من الاتصال ثم أعد المحاولة.');
    }
    var text = await r.text();
    var j = null;
    try { j = JSON.parse(text); } catch (_) {}
    if (r.status === 401) throw new Error('انتهت جلسة هذا الجهاز — سجّل الدخول من جديد.');
    if (!r.ok || (j && String(j.status || '').toLowerCase() === 'error')) {
      var m = j && j.message ? String(j.message) : '';
      if (r.status === 403 || /غير مصرّح/.test(m)) {
        throw new Error((m || 'غير مصرّح بهذا التقرير') + ' — إن كان من عملك فاطلبه من مدير مركزك (مركز الصلاحيات).');
      }
      throw new Error((m || 'ردّ السيرفر برمز ' + r.status) + ' — أعد المحاولة، وإن تكرّر فأرسل لقطةً للدعم الفنّي.');
    }
    return j || {};
  }

  /* ---------- التقارير ---------- */
  var REPORTS = [
    { id: 'placement', cap: 'REPORT_PLACEMENT', icon: 'fa-print', color: '#00796b',
      title: 'تقرير التسكين', sub: 'النموذج المعتمد — صفحةٌ لكل حلقة (PDF / Excel)',
      desc: 'بيانات المعلّم وطلاب الحلقة: المعتمدون (12 مقعدًا) ثم الإضافيون — بأسمائهم الرباعية وهويّاتهم وميلادهم.',
      period: null },
    { id: 'recitation', cap: 'REPORT_RECITATION', icon: 'fa-table-cells', color: '#3949ab',
      title: 'تقرير الحضور والتسميع', sub: 'حضور الطلاب وأنشطتهم خلال فترة (PDF / Excel)',
      desc: 'حضور الطلاب وعدد مرات كل نشاط وصفحاته خلال الفترة — صفحةٌ لكل حلقة.',
      period: 'month' },
    { id: 'monthly', cap: 'REPORT_MONTHLY_DETAIL', icon: 'fa-book-open', color: '#2e7d32',
      title: 'التقرير الشهري التفصيلي', sub: 'ماذا سمّع وراجع وسرد كل طالب (من – إلى) مع المرات والصفحات',
      desc: 'ماذا سمّع كل طالب وراجع وسرد (من – إلى) مع المرات والصفحات — صفحةٌ لكل حلقة.',
      period: 'prev' },
    { id: 'summary', cap: 'REPORT_CIRCLES_SUMMARY', icon: 'fa-trophy', color: '#ff8f00',
      title: 'ملخّص الحلقات والمتميّزون', sub: 'أعداد كل حلقة، والحلقة والطالب المتميّزان',
      desc: 'أعداد كل حلقة، والحلقة والطالب المتميّزان على مستوى الحلقة والمركز.',
      period: 'prev' },
    { id: 'roster', cap: 'REPORT_ROSTER_STUDENTS', icon: 'fa-id-badge', color: '#1565c0',
      title: 'كشف بيانات الطلاب', sub: 'الاسم رباعي والهوية والميلاد والحالة ووليّ الأمر — بأعمدةٍ تختارها',
      desc: 'الطلاب بأسمائهم الرباعية وهويّاتهم وحالاتهم ووليّ الأمر — بالحلقة والحالة، وبالأعمدة التي تختارها.',
      period: null },
    { id: 'exams', cap: 'REPORT_EXAMS_SUMMARY', icon: 'fa-list-check', color: '#3949ab',
      title: 'خلاصة اختبارات الطلاب', sub: 'الجزء من – إلى والأجزاء المنجزة والمعدّل وتاريخ آخر اختبار',
      desc: 'سطرٌ لكل طالب: الجزء من (أوّل اختبار) إلى (آخر اختبار)، وعدد الأجزاء المنجزة، والمعدّل وتقديره، وتاريخ آخر اختبار — للاختبارات الناجحة، في الفترة إن حُدّدت.',
      period: 'optional' },
  ];

  // REPORT_* مفعّلة متى حمل getUserAccess حقل report_groups (كـAccessService.reportGranted)
  function granted(rep) {
    var ua = (typeof USER_ACCESS !== 'undefined') ? USER_ACCESS : null;
    if (!ua || !Object.prototype.hasOwnProperty.call(ua, 'report_groups')) return true;
    return typeof hasCapability === 'function' && hasCapability(rep.cap);
  }
  function visibleReports() { return REPORTS.filter(granted); }
  function anyVisible() { return myCircles().length > 0 && visibleReports().length > 0; }

  /* ---------- الحالة ---------- */
  var ui = { view: 'list', rep: null, busy: false, msg: '', err: '' };
  var crit = {};

  function presetRange(kind) {
    var now = new Date();
    if (kind === 'prev') return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) };
    if (kind === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
    if (kind === 'week') {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var back = (d.getDay() + 1) % 7;               // الأسبوع يبدأ بالسبت
      return { from: ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - back)), to: ymd(now) };
    }
    return { from: '', to: '' };
  }

  function initCrit(rep) {
    var circles = myCircles();
    var scope = typeof currentCircleScope === 'function' ? currentCircleScope() : null;
    var r = rep.period ? presetRange(rep.period === 'optional' ? 'all' : rep.period) : { from: '', to: '' };
    crit = {
      circle: circles.length === 1 ? Number(circles[0].circleNo) : (scope || null),
      from: r.from, to: r.to,
      statuses: null, cols: null,
    };
    if (rep.id === 'roster') {
      var saved = lsGet('rp_roster_cols:' + user());
      crit.cols = saved && saved.length ? saved.concat(saved.indexOf('name') === -1 ? ['name'] : [])
        : ROSTER_COLS.filter(function (c) { return c.on; }).map(function (c) { return c.key; });
    }
  }

  /* ---------- الشاشة ---------- */
  function ensureScreen() {
    var el = document.getElementById('rpScreen');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'rpScreen';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.style.display = 'none';
    el.innerHTML = '<div class="rp-bar"></div><div class="rp-body"></div>';
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    document.body.appendChild(el);
    return el;
  }

  function render() {
    var el = ensureScreen();
    var bar = el.querySelector('.rp-bar');
    var body = el.querySelector('.rp-body');
    if (ui.view === 'crit' && ui.rep) {
      bar.innerHTML = '<button type="button" class="rp-icon" data-act="back" aria-label="رجوع"><i class="fas fa-arrow-right"></i></button>' +
        '<div class="rp-title">' + esc(ui.rep.title) + '</div>';
      body.innerHTML = critHtml(ui.rep);
      return;
    }
    bar.innerHTML = '<button type="button" class="rp-icon" data-act="close" aria-label="رجوع"><i class="fas fa-arrow-right"></i></button>' +
      '<div class="rp-title">تقارير الحلقة</div>' +
      '<button type="button" class="help-btn" data-help="circleReports" title="شرح الشاشة" aria-label="شرح الشاشة"><i class="fas fa-question"></i></button>';
    if (typeof _helpMarkDots === 'function') { try { _helpMarkDots(); } catch (_) {} }
    var reps = visibleReports();
    if (!myCircles().length) {
      body.innerHTML = '<div class="rp-center"><i class="fas fa-people-group rp-big"></i><div>لا حلقات لك على هذا الجهاز بعد — اسحب البيانات من «المزيد ← المزامنة» وأنت متّصل.</div></div>';
      return;
    }
    if (!reps.length) {
      body.innerHTML = '<div class="rp-center"><i class="fas fa-lock rp-big"></i><div>لم تُمنح تقارير الحلقة لحسابك — يمنحها مدير مركزك من «مركز الصلاحيات».</div></div>';
      return;
    }
    body.innerHTML = (navigator.onLine ? '' :
      '<div class="rp-note rp-amber"><i class="fas fa-wifi"></i><span>دون اتصال — التقارير تُعدّ من السيرفر، وتقرير التسكين وحده يُطبع من نسخته المحفوظة إن سبق فتحه.</span></div>') +
      reps.map(function (r) {
        return '<button type="button" class="rp-item" data-open="' + r.id + '">' +
          '<span class="rp-ic" style="--c:' + r.color + '"><i class="fas ' + r.icon + '"></i></span>' +
          '<span class="rp-t"><b>' + esc(r.title) + '</b><small>' + esc(r.sub) + '</small></span>' +
          '<i class="fas fa-chevron-left rp-go"></i></button>';
      }).join('');
  }

  function dateField(key, label, val) {
    return '<div class="range-item"><span class="range-lbl">' + label + '</span><div class="date-pick-wrap">' +
      '<div class="date-pick">' + esc(val ? dmy(val) : '') + '</div>' +
      '<input type="date" class="day-input" data-date="' + key + '" value="' + esc(val || '') + '" aria-label="' + label + '"></div></div>';
  }

  function critHtml(rep) {
    var circles = myCircles();
    var h = '<div class="rp-desc">' + esc(rep.desc) + '</div>';

    // الحلقة
    h += '<label class="rp-lbl">الحلقة</label>';
    if (circles.length === 1) {
      h += '<div class="rp-fixed">' + esc(circles[0].circleName) + '</div>';
    } else {
      h += '<select class="rp-select" data-crit="circle"><option value="">كل حلقاتي (' + circles.length + ')</option>' +
        circles.map(function (c) {
          return '<option value="' + c.circleNo + '"' + (Number(crit.circle) === Number(c.circleNo) ? ' selected' : '') + '>' + esc(c.circleName) + '</option>';
        }).join('') + '</select>';
    }

    // الفترة
    if (rep.period) {
      h += '<label class="rp-lbl">الفترة' + (rep.period === 'optional' ? ' <small>(اختياريّة — فارغة = كل الاختبارات)</small>' : '') + '</label>' +
        '<div class="range-row">' + dateField('from', 'من', crit.from) + dateField('to', 'إلى', crit.to) + '</div>' +
        '<div class="range-quick">' +
        (rep.period === 'optional' ? '<button type="button" data-preset="all">كل الاختبارات</button>' : '') +
        '<button type="button" data-preset="week">هذا الأسبوع</button>' +
        '<button type="button" data-preset="month">هذا الشهر</button>' +
        '<button type="button" data-preset="prev">الشهر الماضي</button></div>';
    }

    // كشف الطلاب: الحالة والأعمدة
    if (rep.id === 'roster') {
      h += '<label class="rp-lbl">حالة الطالب</label><div class="rp-checks" id="rpStatuses">' +
        (crit._statusOpts ? statusChecks() : '<span class="rp-muted"><i class="fas fa-spinner fa-spin"></i> جارٍ جلب الحالات…</span>') + '</div>';
      h += '<label class="rp-lbl">أعمدة الكشف</label><div class="rp-checks">' +
        ROSTER_COLS.map(function (c) {
          var on = crit.cols.indexOf(c.key) !== -1;
          return '<label class="rp-chk' + (c.key === 'name' ? ' locked' : '') + '"><input type="checkbox" data-col="' + c.key + '"' +
            (on ? ' checked' : '') + (c.key === 'name' ? ' disabled' : '') + '> ' + esc(c.label) + '</label>';
        }).join('') + '</div>';
    }

    h += '<div class="rp-actions">' +
      '<button type="button" class="rp-btn" data-run="pdf"' + (ui.busy ? ' disabled' : '') + '><i class="fas ' + (ui.busy === 'pdf' ? 'fa-spinner fa-spin' : 'fa-file-pdf') + '"></i> PDF</button>' +
      '<button type="button" class="rp-btn rp-outline" data-run="xlsx"' + (ui.busy ? ' disabled' : '') + '><i class="fas ' + (ui.busy === 'xlsx' ? 'fa-spinner fa-spin' : 'fa-file-excel') + '"></i> Excel</button></div>';
    if (ui.msg) h += '<div class="rp-note rp-calm"><i class="fas fa-circle-info"></i><span>' + esc(ui.msg) + '</span></div>';
    if (ui.err) h += '<div class="rp-note rp-rose"><i class="fas fa-triangle-exclamation"></i><span>' + esc(ui.err) + '</span></div>';
    if (!navigator.onLine && rep.id !== 'placement') {
      h += '<div class="rp-note rp-amber"><i class="fas fa-wifi"></i><span>دون اتصال — هذا التقرير يُعدّ من السيرفر.</span></div>';
    }
    return h;
  }

  function statusChecks() {
    return crit._statusOpts.map(function (s) {
      var on = crit.statuses ? crit.statuses.indexOf(String(s.code)) !== -1 : s.enrolled;
      return '<label class="rp-chk"><input type="checkbox" data-status="' + esc(s.code) + '"' + (on ? ' checked' : '') + '> ' + esc(s.name) + '</label>';
    }).join('');
  }

  async function loadStatuses() {
    try {
      var j = await getJson('sv/report/students/meta', 30000);
      var st = Array.isArray(j.statuses) ? j.statuses : [];
      crit._statusOpts = st.map(function (s) { return { code: String(s.code), name: s.name, enrolled: s.enrolled === 'Y' }; });
    } catch (_) {
      crit._statusOpts = [
        { code: '0', name: 'قيد القبول', enrolled: true }, { code: '1', name: 'منتظم', enrolled: true },
        { code: '5', name: 'إضافي', enrolled: true }];
    }
    if (crit.statuses == null) crit.statuses = crit._statusOpts.filter(function (s) { return s.enrolled; }).map(function (s) { return s.code; });
    var box = document.getElementById('rpStatuses');
    if (box && ui.view === 'crit' && ui.rep && ui.rep.id === 'roster') box.innerHTML = statusChecks();
  }

  function onClick(e) {
    var t = e.target.closest('[data-act],[data-open],[data-preset],[data-run]');
    if (!t) return;
    if (t.dataset.act === 'close') return closeCircleReports();
    if (t.dataset.act === 'back') { ui.view = 'list'; ui.rep = null; ui.msg = ui.err = ''; return render(); }
    if (t.dataset.open) {
      var rep = REPORTS.filter(function (r) { return r.id === t.dataset.open; })[0];
      if (!rep) return;
      ui.view = 'crit'; ui.rep = rep; ui.msg = ui.err = '';
      initCrit(rep);
      render();
      if (rep.id === 'roster') loadStatuses();
      return;
    }
    if (t.dataset.preset) {
      var r = presetRange(t.dataset.preset);
      crit.from = r.from; crit.to = r.to;
      return render();
    }
    if (t.dataset.run) run(t.dataset.run);
  }

  function onChange(e) {
    var t = e.target;
    if (t.dataset.crit === 'circle') { crit.circle = t.value ? Number(t.value) : null; ui.msg = ui.err = ''; return; }
    if (t.dataset.date) {
      crit[t.dataset.date] = t.value || '';
      var pick = t.parentNode.querySelector('.date-pick');
      if (pick) pick.textContent = t.value ? dmy(t.value) : '';
      return;
    }
    if (t.dataset.status != null) {
      var set = (crit.statuses || []).slice();
      var i = set.indexOf(t.dataset.status);
      if (t.checked && i === -1) set.push(t.dataset.status);
      if (!t.checked && i !== -1) set.splice(i, 1);
      crit.statuses = set;
      return;
    }
    if (t.dataset.col) {
      var cols = crit.cols.slice();
      var k = cols.indexOf(t.dataset.col);
      if (t.checked && k === -1) cols.push(t.dataset.col);
      if (!t.checked && k !== -1) cols.splice(k, 1);
      crit.cols = cols;
      lsSet('rp_roster_cols:' + user(), cols);
    }
  }

  function checkPeriod(rep) {
    if (!rep.period) return '';
    if (rep.period === 'optional' && !crit.from && !crit.to) return '';
    if (!crit.from || !crit.to) return 'حدّد بداية الفترة ونهايتها' + (rep.period === 'optional' ? '، أو اختر «كل الاختبارات»' : '') + '.';
    if (crit.from > crit.to) return 'بداية الفترة بعد نهايتها — صحّح التاريخين.';
    var days = (parseYmd(crit.to) - parseYmd(crit.from)) / 86400000;
    if (days > 370) return 'الفترة أطول من سنة — اختر فترةً أقصر.';
    return '';
  }

  async function run(kind) {
    var rep = ui.rep;
    if (!rep || ui.busy) return;
    var bad = checkPeriod(rep);
    if (bad) { ui.err = bad; ui.msg = ''; return render(); }
    ui.busy = kind; ui.err = ''; ui.msg = 'جارٍ جلب البيانات…';
    render();
    try {
      var out = await BUILDERS[rep.id]();
      if (out.empty) {
        ui.msg = '';
        ui.err = out.emptyMsg || 'لا بيانات لهذه الاختيارات — جرّب فترةً أخرى أو حلقةً أخرى.';
      } else {
        ui.msg = out.count + ' — جارٍ إعداد الملف…';
        render();
        var ascii = asciiName(rep.id);
        if (kind === 'pdf') await toPdf(out.pdf(), out.fileName + '.pdf', out.landscape, ascii);
        else await toXlsx(out.xlsx(), out.fileName + '.xlsx', ascii);
        ui.msg = out.count + (out.warn ? ' · ' + out.warn : '');
      }
    } catch (err) {
      ui.msg = '';
      ui.err = (err && err.message) || 'خطأ غير معروف';
    } finally {
      ui.busy = false;
      if (ui.view === 'crit') render();
    }
  }

  /* ---------- الإخراج ---------- */
  // 🏷 اسم الملف مقروءٌ في الجوال (11-20: «خرابيش»): بلا تشكيل ولا تواريخ بشَرطات —
  //    العربيّ المخلوط بـ«2026-11-01» ينقلب ترتيبه في مدير الملفات وواتساب
  function fileSafe(s) {
    return String(s || '').replace(TASHKEEL, '').replace(/[\\/:*?"<>|«»]+/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 80) || 'تقرير';
  }
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  // «نوفمبر 2026» لشهرٍ واحد، وإلا «من 1 أكتوبر إلى 19 نوفمبر 2026» — رقمٌ بين كلمتين لا ينقلب
  function periodName(from, to) {
    var a = parseYmd(from), b = parseYmd(to);
    if (!a && !b) return '';
    if (!a) return 'حتى ' + b.getDate() + ' ' + MONTHS[b.getMonth()] + ' ' + b.getFullYear();
    if (!b) return 'من ' + a.getDate() + ' ' + MONTHS[a.getMonth()] + ' ' + a.getFullYear();
    if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
      var last = new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate();
      if (a.getDate() === 1 && (b.getDate() === last || to === ymd(new Date()))) return MONTHS[a.getMonth()] + ' ' + a.getFullYear();
      return 'من ' + a.getDate() + ' إلى ' + b.getDate() + ' ' + MONTHS[b.getMonth()] + ' ' + b.getFullYear();
    }
    return 'من ' + a.getDate() + ' ' + MONTHS[a.getMonth()] + (a.getFullYear() !== b.getFullYear() ? ' ' + a.getFullYear() : '') +
      ' إلى ' + b.getDate() + ' ' + MONTHS[b.getMonth()] + ' ' + b.getFullYear();
  }

  // 🖨 كل قسمٍ (حلقة/مؤسسة) يُرسم وحده ثم يُضاف إلى الملف نفسه — لا لوحةٌ واحدة
  //    للتقرير كلّه: الجوال الضعيف (J7) لا يحتمل canvas بطول عشرات الصفحات.
  // 🔤 اسم المشاركة على أندرويد (crShareName): «Placement-601-2026-11» — العربيّ يصل واتساب مشوَّهًا
  var SLUG = { placement: 'Placement', recitation: 'Attendance', monthly: 'Monthly-Detail', summary: 'Circles-Summary', roster: 'Students', exams: 'Exams-Summary' };
  function asciiName(id) {
    var parts = ['Safwa', SLUG[id] || 'Report'];
    if (crit.circle) parts.push(String(crit.circle));
    var a = crit.from ? crit.from.slice(0, 7) : '', b = crit.to ? crit.to.slice(0, 7) : '';
    if (a || b) parts.push(a && b && a !== b ? a + '_' + b : (a || b));
    return parts.join('-');
  }

  async function toPdf(sections, name, landscape, ascii) {
    if (typeof ensurePdfLibrary === 'function' && !await ensurePdfLibrary()) throw new Error('تعذّر تحميل مكتبة PDF — تأكّد من الاتصال ثم أعد المحاولة.');
    var opt = {
      margin: landscape ? [0.6, 0.6, 0.6, 0.6] : [0.7, 0.6, 0.7, 0.6],
      filename: name,
      image: { type: 'jpeg', quality: 0.92 },
      html2canvas: { scale: 2, backgroundColor: '#ffffff', onclone: window.QmcAppearance && QmcAppearance.lightClone },
      jsPDF: { unit: 'cm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.rp-keep'] },
    };
    var w = html2pdf().set(opt).from(sections[0], 'string').toPdf();
    sections.slice(1).forEach(function (s) {
      w = w.get('pdf').then(function (pdf) { pdf.addPage(); }).from(s, 'string').toContainer().toCanvas().toPdf();
    });
    var blob = await w.outputPdf('blob');
    crDeliverFile(blob, name, 'application/pdf', ascii);
  }

  async function toXlsx(sheets, name, ascii) {
    try { await loadScriptOnce('xlsx.full.min.js'); }
    catch (_) { throw new Error('تعذّر تحميل مكتبة Excel — تأكّد من الاتصال ثم أعد المحاولة.'); }
    var wb = XLSX.utils.book_new();
    var used = {};
    sheets.forEach(function (s) {
      var ws = XLSX.utils.aoa_to_sheet(s.aoa);
      if (s.merges) ws['!merges'] = s.merges;
      if (s.cols) ws['!cols'] = s.cols.map(function (w) { return { wch: w }; });
      XLSX.utils.book_append_sheet(wb, ws, sheetName(s.name, used));
    });
    wb.Workbook = wb.Workbook || {};
    wb.Workbook.Views = [{ RTL: true }];
    var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    crDeliverFile(new Blob([out], { type: type }), name, type, ascii);
  }

  // اسم ورقة صالح وفريد (≤31 حرفًا، بلا \ / ? * [ ] :)
  function sheetName(raw, used) {
    var n = String(raw || '').replace(/[\\\/\?\*\[\]:]/g, ' ').trim() || 'ورقة';
    if (n.length > 28) n = n.slice(0, 28);
    var c = n, i = 2;
    while (used[c]) { c = n.slice(0, 25) + ' ' + i; i++; }
    used[c] = true;
    return c;
  }
  function mergeRow(r, c1, c2) { return { s: { r: r, c: c1 }, e: { r: r, c: c2 } }; }

  /* =========================================================
     📖 الحضور والتسميع · الشهري التفصيلي · الملخّص (sv/recitationReport · sv/monthlyReport)
     ========================================================= */
  var ACTS = [
    ['تسميع', 'tasmee', true], ['مراجعة', 'muraja', true], ['اختبار جزء', 'exam', true], ['سرد', 'sard', true],
    ['حضور (لم يسمع)', 'hudur', false], ['غياب بعذر', 'excused', false], ['غياب بدون عذر', 'absent', false],
    ['بدون نشاط', 'no_activity', false],
  ];
  var RANGE_KEYS = ['tasmee', 'muraja', 'exam', 'sard'];
  var COUNT_KEYS = ['hudur', 'excused', 'absent', 'no_activity'];
  var COLOR = { tasmee: 'C8E6C9', muraja: 'B2DFDB', exam: 'E1BEE7', sard: 'C5CAE9', hudur: 'FFE0B2', excused: 'FFF9C4', absent: 'FFCDD2', no_activity: 'E0E0E0' };
  var COUNT_HEAD = { hudur: 'حضور<br>بلا تسميع', excused: 'غياب<br>بعذر', absent: 'غياب<br>بلا عذر', no_activity: 'بدون<br>نشاط' };
  var SCORE_FORMULA = 'درجة الطالب = (نقاط الصفحات + نقاط الاختبارات) × نسبة الحضور  •  الصفحات الجديدة فقط (المكرّر لا يُحتسب)  •  درجة الحلقة = معدّل درجات طلابها';
  var STAR_RULE = 'المتميّزون: حلقةٌ من 2–5 حلقات، وحلقتان من 6–10، وثلاثٌ فوقها؛ وطالبٌ لكل 10 طلاب (3 أقصى)؛ ولا تميّز في حلقةٍ أو مركزٍ ليس فيه ما يُقارَن به؛ ولا يُسمّى متميّزًا — حلقةً أو طالبًا — من قلّت نسبة حضوره عن 75٪';

  function col(k) { return '#' + (COLOR[k] || 'EEEEEE'); }
  function light(k) {
    var h = COLOR[k] || 'EEEEEE';
    var lift = function (i) { var c = parseInt(h.substr(i, 2), 16); return Math.round(c + (255 - c) * 0.6); };
    return 'rgb(' + lift(0) + ',' + lift(2) + ',' + lift(4) + ')';
  }
  function actLabel(k) { return ACTS.filter(function (a) { return a[1] === k; })[0][0]; }

  // صفّ تقرير — RecitationReportRow
  function Row(d) {
    this.d = d;
    this.circleNo = toI(d.circle_no);
    this.circleName = String(d.circle_name || '').trim();
    this.studentNo = toI(d.student_no);
    this.studentName = String(d.student_name || '').trim();
    this.idNo = String(d.id_no || '').trim();
    this.centerNo = toI(d.center_no);
    this.centerName = String(d.center_name || '').trim();
    this.teachers = String(d.teachers || '').trim();
  }
  Row.prototype.cnt = function (k) { return toI(this.d[k + '_cnt'] != null ? this.d[k + '_cnt'] : this.d[k + '_count']); };
  Row.prototype.pagesI = function (k) { return Math.trunc(toD(this.d[k + '_pages'])); };
  Row.prototype.pagesD = function (k) { return toD(this.d[k + '_pages']); };
  Row.prototype.range1 = function (k) {
    var f = String(this.d[k + '_from'] || '').trim(), t = String(this.d[k + '_to'] || '').trim();
    if (!f && !t) return '';
    if (!f || !t) return f || t;
    return f + ' - ' + t;
  };
  Row.prototype.range = function (k) {
    var r1 = this.range1(k), r2 = this.range1(k + '2');
    if (!r2) return r1;
    return r1 ? r1 + '\n' + r2 : r2;
  };
  Row.prototype.presentDays = function () { return toI(this.d.present_days); };
  Row.prototype.totalDays = function () { return toI(this.d.total_days); };
  Row.prototype.attRate = function () { var t = this.totalDays(); return t ? this.presentDays() / t : 0; };
  Row.prototype.pagePoints = function () {
    if (Object.prototype.hasOwnProperty.call(this.d, 'page_points')) return toD(this.d.page_points);
    return this.pagesD('tasmee') * 3 + this.pagesD('sard') * 2 + this.pagesD('muraja');
  };
  Row.prototype.examPoints = function () { return toD(this.d.exam_points); };
  Row.prototype.useAtt = function () { return String(this.d.use_attendance == null ? 'Y' : this.d.use_attendance) !== 'N'; };
  Row.prototype.score = function () { return (this.pagePoints() + this.examPoints()) * (this.useAtt() ? this.attRate() : 1); };

  // «من 01/11/2026 إلى 19/11/2026» — كلمةٌ عربية بين التاريخين فلا ينقلب ترتيبهما
  function periodText() { return 'من ' + dmy(crit.from) + ' إلى ' + dmy(crit.to); }

  async function fetchRows(path) {
    var q = 'date_from=' + encodeURIComponent(dmy(crit.from)) + '&date_to=' + encodeURIComponent(dmy(crit.to)) +
      (crit.circle ? '&circle_no=' + crit.circle : '');
    var j = await getJson(path + '?' + q, 120000);
    var items = Array.isArray(j.items) ? j.items : [];
    return items.map(function (x) { return new Row(x); });
  }

  // يجمع بمفتاح مع حفظ ترتيب أوّل ظهور
  function groupBy(rows, key) {
    var m = {}, order = [];
    rows.forEach(function (r) { var k = key(r); if (!m[k]) { m[k] = []; order.push(k); } m[k].push(r); });
    return order.map(function (k) { return { key: k, rows: m[k] }; });
  }

  // الحلقة ⇒ اسمها ومركزها ومؤسستها
  async function circleInfo(rows) {
    var map = await centerMap();
    return function (no) {
      var c = circleOf(no);
      var r = rows.filter(function (x) { return x.circleNo === Number(no); })[0];
      var centerNo = (c && c.centerNo != null) ? Number(c.centerNo) : (r && r.centerNo ? r.centerNo : null);
      return {
        name: (c && c.circleName) || (r && r.circleName) || ('حلقة ' + no),
        center: centerNameOf(map, centerNo, (c && c.centerName) || (r && r.centerName) || ''),
        centerNo: centerNo,
        org: orgOfCenter(map, centerNo),
      };
    };
  }

  function rowsCount(rows) {
    var c = {}; rows.forEach(function (r) { c[r.circleNo] = 1; });
    return rows.length + ' طالبًا في ' + Object.keys(c).length + ' حلقة';
  }
  function filePart() {
    var c = crit.circle ? circleOf(crit.circle) : null;
    return (c ? c.circleName + ' - ' : '') + periodName(crit.from, crit.to);
  }

  var PDF_CSS = '<style>' +
    '.rpx{font-family:inherit;color:#111;direction:rtl;box-sizing:border-box}' +
    '.rpx *{box-sizing:border-box}' +
    '.rpx table{border-collapse:collapse;width:100%;table-layout:fixed}' +
    '.rpx th,.rpx td{border:1px solid #757575;padding:2px 3px;text-align:center;vertical-align:middle;word-wrap:break-word;line-height:1.35}' +
    // أنماط جداول التطبيق (app.css: لون العناوين وأعمدةٌ ملوّنة وحجم الخطّ) لا تدخل الورقة
    '.rpx th,.rpx td{color:inherit !important;font-size:inherit;letter-spacing:0 !important;text-transform:none !important;box-shadow:none !important}' +
    '.rpx th{font-weight:700}' +
    '.rpx .rng{white-space:nowrap;font-size:8.5px}' +
    '.rpx .r{text-align:right}' +
    '.rpx .ltr{direction:ltr;unicode-bidi:isolate}' +
    '.rpx-bar{background:#10375C;color:#fff;text-align:center;font-weight:700;padding:6px;font-size:16px}' +
    '.rpx-org{color:#10375C;font-weight:700;font-size:14px;margin-top:4px}' +
    '.rpx-sub{font-weight:700;font-size:12px;margin:4px 0 6px}' +
    '.rpx-total td{background:#eee;font-weight:700}' +
    '</style>';

  /* ---------- الحضور والتسميع (recitation_export.dart) ---------- */
  async function buildRecitation() {
    var rows = await fetchRows('sv/recitationReport');
    if (!rows.length) return { empty: true, emptyMsg: 'لا نشاط مسجَّلًا في هذه الفترة لحلقاتك المختارة.' };
    var info = await circleInfo(rows);
    var groups = groupBy(rows, function (r) { return r.circleNo; }).sort(function (a, b) { return a.key - b.key; });
    var period = periodText();

    function active(rs) {
      return ACTS.filter(function (a) { return rs.some(function (r) { return r.cnt(a[1]) > 0 || r.pagesI(a[1]) > 0; }); });
    }
    function circleLine(no) {
      var i = info(no);
      return 'الحلقة: ' + i.name + (i.center && i.center !== i.org ? '   •   المركز: ' + i.center : '');
    }

    function section(g) {
      var rs = g.rows, acts = active(rs), i = info(g.key);
      var hasId = rs.some(function (r) { return r.idNo; });
      var h1 = '<th rowspan="2" style="width:150px;background:#e0e0e0">اسم الطالب</th>' + (hasId ? '<th rowspan="2" style="width:92px;background:#e0e0e0">رقم الهوية</th>' : '');
      var h2 = '';
      acts.forEach(function (a) {
        h1 += '<th colspan="' + (a[2] ? 2 : 1) + '" style="background:' + col(a[1]) + '">' + esc(a[0]) + '</th>';
        h2 += a[2] ? '<th style="background:' + col(a[1]) + '">مرات</th><th style="background:' + col(a[1]) + '">صفحات</th>'
          : '<th style="background:' + col(a[1]) + '">مرات</th>';
      });
      var body = rs.map(function (r) {
        return '<tr><td class="r"><b>' + esc(r.studentName) + '</b></td>' + (hasId ? '<td class="ltr">' + esc(r.idNo) + '</td>' : '') +
          acts.map(function (a) {
            var bg = ' style="background:' + light(a[1]) + '"';
            return '<td' + bg + '>' + r.cnt(a[1]) + '</td>' + (a[2] ? '<td' + bg + '>' + r.pagesI(a[1]) + '</td>' : '');
          }).join('') + '</tr>';
      }).join('');
      var sum = ['عدد الطلاب: ' + rs.length].concat(acts.map(function (a) {
        var c = rs.reduce(function (s, r) { return s + r.cnt(a[1]); }, 0);
        if (!a[2]) return a[0] + ': ' + c;
        var p = rs.reduce(function (s, r) { return s + r.pagesI(a[1]); }, 0);
        return a[0] + ': ' + c + ' مرة / ' + p + ' صفحة';
      }));
      return PDF_CSS + '<div class="rpx" style="width:1060px;font-size:11px">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-end"><div style="font-size:19px;font-weight:700">تقرير الحضور والتسميع</div>' +
        (i.org ? '<div style="font-size:15px;font-weight:700;color:#10375C">' + esc(i.org) + '</div>' : '') + '</div>' +
        '<div style="font-size:14px;font-weight:700;margin-top:4px">' + esc(circleLine(g.key)) + '</div>' +
        '<div style="font-size:12px;margin:2px 0 8px">الفترة: ' + esc(period) + '</div>' +
        '<table><thead><tr>' + h1 + '</tr><tr>' + h2 + '</tr></thead><tbody>' + body + '</tbody></table>' +
        '<div class="rp-keep" style="margin-top:8px;background:#eee;border:1px solid #9e9e9e;padding:6px;font-size:11px">' +
        '<b>ملخّص الحلقة</b><div style="display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:4px">' +
        sum.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div></div></div>';
    }

    function sheets() {
      return groups.map(function (g) {
        var rs = g.rows, acts = active(rs), i = info(g.key);
        var hasId = rs.some(function (r) { return r.idNo; });
        var h1 = ['اسم الطالب'].concat(hasId ? ['رقم الهوية'] : []), h2 = [''].concat(hasId ? [''] : []);
        var merges = [];
        acts.forEach(function (a) {
          if (a[2]) { merges.push({ s: { r: 1, c: h1.length }, e: { r: 1, c: h1.length + 1 } }); h1.push(a[0], ''); h2.push('مرات', 'صفحات'); }
          else { h1.push(a[0]); h2.push('مرات'); }
        });
        var aoa = [[[i.org, circleLine(g.key), 'الفترة: ' + period].filter(Boolean).join('    |    ')], h1, h2];
        rs.forEach(function (r) {
          var row = [r.studentName].concat(hasId ? [String(r.idNo)] : []);
          acts.forEach(function (a) { row.push(r.cnt(a[1])); if (a[2]) row.push(r.pagesI(a[1])); });
          aoa.push(row);
        });
        var tot = ['الإجمالي (' + rs.length + ' طالب)'].concat(hasId ? [''] : []);
        acts.forEach(function (a) {
          tot.push(rs.reduce(function (s, r) { return s + r.cnt(a[1]); }, 0));
          if (a[2]) tot.push(rs.reduce(function (s, r) { return s + r.pagesI(a[1]); }, 0));
        });
        aoa.push(tot);
        merges.push(mergeRow(0, 0, h1.length - 1));
        return { name: i.name, aoa: aoa, merges: merges, cols: [30].concat(hasId ? [13] : []).concat(h1.slice(hasId ? 2 : 1).map(function () { return 9; })) };
      });
    }

    return {
      count: rowsCount(rows), landscape: true,
      fileName: fileSafe('تقرير الحضور والتسميع - ' + filePart()),
      pdf: function () { return groups.map(section); },
      xlsx: sheets,
    };
  }

  /* ---------- الإحصاء والمتميّزون (monthly_report_export.dart) ---------- */
  function circleQuota(n) { return n < 2 ? 0 : (n <= 5 ? 1 : (n <= 10 ? 2 : 3)); }
  function studentQuota(n) { return n < 2 ? 0 : Math.min(3, Math.max(1, Math.floor((n + 9) / 10))); }
  function starEmpty(n, unit) {
    return n < 2 ? unit + ' واحد' + (unit === 'حلقة' ? 'ة' : '') + ' في التقرير — لا مقارنة'
      : 'لم يبلغ أحدٌ شرط التميّز في الفترة (درجةٌ وحضورٌ 75٪ فأكثر)';
  }
  function rankStudents(rows) {
    return rows.filter(function (r) { return r.score() > 0 && r.attRate() >= 0.75; })
      .sort(function (a, b) { var s = b.score() - a.score(); return s !== 0 ? s : b.pagesD('tasmee') - a.pagesD('tasmee'); });
  }
  function starOf(rows) { if (rows.length < 2) return null; var r = rankStudents(rows); return r.length ? r[0] : null; }

  function Stat(no, name, teacher, rows) { this.no = no; this.name = name; this.teacher = teacher; this.rows = rows; }
  Stat.prototype.cnt = function (k) { return this.rows.reduce(function (s, r) { return s + r.cnt(k); }, 0); };
  Stat.prototype.pages = function (k) { return this.rows.reduce(function (s, r) { return s + r.pagesD(k); }, 0); };
  Stat.prototype.present = function () { return this.rows.reduce(function (s, r) { return s + r.presentDays(); }, 0); };
  Stat.prototype.total = function () { return this.rows.reduce(function (s, r) { return s + r.totalDays(); }, 0); };
  Stat.prototype.att = function () { var t = this.total(); return t ? this.present() / t : 0; };
  Stat.prototype.avg = function () { return this.rows.length ? this.rows.reduce(function (s, r) { return s + r.score(); }, 0) / this.rows.length : 0; };
  Stat.prototype.star = function () { return starOf(this.rows); };
  function rankCircles(stats) {
    return stats.filter(function (s) { return s.avg() > 0 && s.att() >= 0.75; }).sort(function (a, b) { return b.avg() - a.avg(); });
  }

  async function monthlyCtx() {
    var rows = await fetchRows('sv/monthlyReport');
    var info = await circleInfo(rows);
    function cName(rs) { return rs[0].circleName || info(rs[0].circleNo).name; }
    function cCenter(rs) { return rs[0].centerName || info(rs[0].circleNo).center || (rs[0].centerNo ? 'مركز ' + rs[0].centerNo : ''); }
    function org(rs) { return info(rs[0].circleNo).org; }
    function stats(rs) { return groupBy(rs, function (r) { return r.circleNo; }).map(function (g) { return new Stat(g.key, cName(g.rows), g.rows[0].teachers, g.rows); }); }
    return { rows: rows, info: info, cName: cName, cCenter: cCenter, org: org, stats: stats };
  }

  /* ---------- الشهري التفصيلي ---------- */
  async function buildMonthly() {
    var x = await monthlyCtx();
    var rows = x.rows;
    if (!rows.length) return { empty: true, emptyMsg: 'لا نشاط مسجَّلًا في هذه الفترة لحلقاتك المختارة.' };
    var groups = groupBy(rows, function (r) { return r.circleNo; });
    var period = periodText();

    function head() {
      return '<thead><tr><th rowspan="2" style="width:22px;background:#e0e0e0">م</th><th rowspan="2" style="width:132px;background:#e0e0e0">اسم الطالب</th>' +
        RANGE_KEYS.map(function (k) { return '<th colspan="3" style="background:' + col(k) + '">' + actLabel(k) + '</th>'; }).join('') +
        COUNT_KEYS.map(function (k) { return '<th rowspan="2" style="width:34px;background:' + col(k) + ';font-size:9px">' + COUNT_HEAD[k] + '</th>'; }).join('') +
        '</tr><tr>' + RANGE_KEYS.map(function (k) {
          var b = ' style="background:' + col(k) + '"';
          return '<th' + b + '>من - إلى</th><th style="width:28px;background:' + col(k) + '">مرات</th><th style="width:32px;background:' + col(k) + '">صفحات</th>';
        }).join('') + '</tr></thead>';
    }

    function section(g) {
      var rs = g.rows, teacher = rs[0].teachers, center = x.cCenter(rs), org = x.org(rs), star = starOf(rs);
      var infoLine = ['الحلقة: ' + x.cName(rs)].concat(teacher ? ['المعلّم: ' + teacher] : [])
        .concat(center && center !== org ? ['المركز: ' + center] : []).concat(['الفترة: ' + period]).join('    •    ');
      var body = rs.map(function (r, i) {
        return '<tr><td>' + (i + 1) + '</td><td class="r">' + esc(r.studentName) + '</td>' +
          RANGE_KEYS.map(function (k) {
            var bg = ' style="background:' + light(k) + '"';
            return '<td' + bg + '><span class="rng">' + esc(r.range(k)).replace(/\n/g, '<br>') + '</span></td><td' + bg + '>' + z(r.cnt(k)) + '</td><td' + bg + '>' + z(r.pagesD(k)) + '</td>';
          }).join('') +
          COUNT_KEYS.map(function (k) { return '<td style="background:' + light(k) + '">' + z(r.cnt(k)) + '</td>'; }).join('') + '</tr>';
      }).join('');
      var c = function (k) { return rs.reduce(function (s, r) { return s + r.cnt(k); }, 0); };
      var p = function (k) { return rs.reduce(function (s, r) { return s + r.pagesD(k); }, 0); };
      var total = '<tr class="rpx-total"><td colspan="2">المجموع (' + rs.length + ' طالب)</td>' +
        RANGE_KEYS.map(function (k) { return '<td></td><td style="background:' + col(k) + '">' + c(k) + '</td><td style="background:' + col(k) + '">' + n1(p(k)) + '</td>'; }).join('') +
        COUNT_KEYS.map(function (k) { return '<td style="background:' + col(k) + '">' + c(k) + '</td>'; }).join('') + '</tr>';
      return PDF_CSS + '<div class="rpx" style="width:1060px;font-size:10.5px">' +
        '<div class="rpx-bar">التقرير الشهري التفصيلي</div>' +
        (org ? '<div class="rpx-org">' + esc(org) + '</div>' : '') +
        '<div class="rpx-sub">' + esc(infoLine) + '</div>' +
        '<table>' + head() + '<tbody>' + body + total + '</tbody></table>' +
        (star ? '<div class="rp-keep" style="margin-top:6px;font-weight:700;font-size:12px">المتميّز في الحلقة: ' + esc(star.studentName) + '  (الدرجة ' + Math.round(star.score()) + ')</div>' : '') +
        '</div>';
    }

    function sheets() {
      return groups.map(function (g) {
        var rs = g.rows, teacher = rs[0].teachers, org = x.org(rs);
        var h1 = ['م', 'اسم الطالب', 'رقم الهوية'], h2 = ['', '', ''];
        var merges = [mergeRow(0, 0, 18)];
        RANGE_KEYS.forEach(function (k) { merges.push({ s: { r: 1, c: h1.length }, e: { r: 1, c: h1.length + 2 } }); h1.push(actLabel(k), '', ''); h2.push('من - إلى', 'مرات', 'صفحات'); });
        COUNT_KEYS.forEach(function (k) { h1.push(COUNT_HEAD[k].replace('<br>', ' ')); h2.push(''); });
        var aoa = [[[org, 'الحلقة: ' + x.cName(rs), teacher ? 'المعلّم: ' + teacher : '', 'الفترة: ' + period].filter(Boolean).join('    |    ')], h1, h2];
        rs.forEach(function (r, i) {
          var row = [i + 1, r.studentName, String(r.idNo)];
          RANGE_KEYS.forEach(function (k) { row.push(r.range(k), r.cnt(k), Math.round(r.pagesD(k) * 10) / 10); });
          COUNT_KEYS.forEach(function (k) { row.push(r.cnt(k)); });
          aoa.push(row);
        });
        var tot = ['المجموع (' + rs.length + ' طالب)', '', ''];
        RANGE_KEYS.forEach(function (k) {
          tot.push('', rs.reduce(function (s, r) { return s + r.cnt(k); }, 0), Math.round(rs.reduce(function (s, r) { return s + r.pagesD(k); }, 0) * 10) / 10);
        });
        COUNT_KEYS.forEach(function (k) { tot.push(rs.reduce(function (s, r) { return s + r.cnt(k); }, 0)); });
        aoa.push(tot);
        merges.push(mergeRow(aoa.length - 1, 0, 2));
        return { name: x.cName(rs), aoa: aoa, merges: merges, cols: [5, 28, 13, 30, 7, 8, 30, 7, 8, 30, 7, 8, 30, 7, 8, 11, 11, 11, 11] };
      });
    }

    return {
      count: rowsCount(rows), landscape: true,
      fileName: fileSafe('التقرير الشهري التفصيلي - ' + filePart()),
      pdf: function () { return groups.map(section); },
      xlsx: sheets,
    };
  }

  /* ---------- ملخّص الحلقات والمتميّزون ---------- */
  async function buildSummary() {
    var x = await monthlyCtx();
    var rows = x.rows;
    if (!rows.length) return { empty: true, emptyMsg: 'لا نشاط مسجَّلًا في هذه الفترة لحلقاتك المختارة.' };
    var period = periodText();

    // المراكز مجموعةً بمؤسستها مع حفظ ترتيب أوّل ظهور
    var byOrg = groupBy(groupBy(rows, function (r) { return r.centerNo; }), function (e) { return x.org(e.rows); });

    function centerStat(rs) {
      var all = x.stats(rs), cs = rankCircles(all);
      return new Stat(rs[0].centerNo, x.cCenter(rs), circleQuota(all.length) === 0 ? '—' : (cs.length ? cs[0].name : ''), rs);
    }

    var pages = [];   // { org, info, units, circles, rs, centers }
    byOrg.forEach(function (og) {
      var centers = og.rows;   // [{key: centerNo, rows}]
      if (centers.length > 1) {
        var all = [];
        centers.forEach(function (e) { all = all.concat(e.rows); });
        pages.push({ org: og.key, info: 'ملخّص المؤسسة: ' + centers.length + ' مراكز    •    الفترة: ' + period,
          units: centers.map(function (e) { return centerStat(e.rows); }), circles: x.stats(all), rs: all, centers: centers.length });
      }
      centers.forEach(function (e) {
        var st = x.stats(e.rows), center = x.cCenter(e.rows);
        pages.push({ org: og.key, info: [center && center !== og.key ? 'المركز: ' + center : '', 'الفترة: ' + period].filter(Boolean).join('    •    '),
          units: st, circles: st, rs: e.rows, centers: null, sheet: center || 'ملخّص الحلقات' });
      });
    });

    function where(s, withCenter) {
      var c = s.rows[0].centerName;
      return withCenter && c ? s.name + ' · ' + c : s.name;
    }
    function tops(pg) {
      var byCenter = pg.centers != null;
      var tc = rankCircles(pg.circles).slice(0, circleQuota(pg.circles.length));
      var ts = rankStudents(pg.rs).slice(0, studentQuota(pg.rs.length));
      var circleOfNo = function (no) { var s = pg.circles.filter(function (c) { return c.no === no; })[0]; return s ? where(s, byCenter) : ''; };
      return {
        circles: tc.map(function (s, i) { return (i + 1) + '. ' + where(s, byCenter) + (s.teacher ? ' — ' + s.teacher : '') + ' — معدّل الدرجة ' + Math.round(s.avg()); }),
        students: ts.map(function (r, i) { return (i + 1) + '. ' + r.studentName + ' — ' + circleOfNo(r.circleNo) + ' — الدرجة ' + Math.round(r.score()); }),
        tc: tc, ts: ts, circleOfNo: circleOfNo,
      };
    }

    function section(pg) {
      var byCenter = pg.centers != null;
      var all = pg.rs;
      var pp = function (k) { return all.reduce(function (s, r) { return s + r.pagesD(k); }, 0); };
      var pres = all.reduce(function (s, r) { return s + r.presentDays(); }, 0), tot = all.reduce(function (s, r) { return s + r.totalDays(); }, 0);
      var kpis = (byCenter ? [['المراكز', pg.centers]] : []).concat([
        ['الحلقات', pg.circles.length], ['الطلاب', all.length], ['صفحات التسميع', n1(pp('tasmee'))],
        ['صفحات المراجعة', n1(pp('muraja'))], ['صفحات السرد', n1(pp('sard'))], ['نسبة الحضور %', tot ? Math.round(pres * 100 / tot) : '—']]);
      var t = tops(pg);
      var box = function (title, lines, empty) {
        return '<div style="flex:1;background:#FFF8E1;border:1px solid #CBB273;padding:6px;font-size:11px"><b style="font-size:12.5px">' + title + '</b>' +
          (lines.length ? lines.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') : '<div>' + esc(empty) + '</div>') + '</div>';
      };
      var head = '<thead><tr><th rowspan="2" style="width:22px;background:#e0e0e0">م</th>' +
        '<th rowspan="2" style="width:150px;background:#e0e0e0">' + (byCenter ? 'المركز' : 'الحلقة') + '</th>' +
        '<th rowspan="2" style="width:132px;background:#e0e0e0">' + (byCenter ? 'الحلقة المتميّزة' : 'المعلّم') + '</th>' +
        '<th rowspan="2" style="width:42px;background:#e0e0e0;font-size:9.5px">الطلاب</th>' +
        RANGE_KEYS.map(function (k) { return '<th colspan="2" style="background:' + col(k) + '">' + actLabel(k) + '</th>'; }).join('') +
        COUNT_KEYS.map(function (k) { return '<th rowspan="2" style="width:36px;background:' + col(k) + ';font-size:9px">' + COUNT_HEAD[k] + '</th>'; }).join('') +
        '<th rowspan="2" style="width:42px;background:#e0e0e0;font-size:9px">نسبة<br>الحضور %</th>' +
        '<th rowspan="2" style="width:42px;background:#e0e0e0;font-size:9px">' + (byCenter ? 'درجة<br>المركز' : 'درجة<br>الحلقة') + '</th>' +
        '<th rowspan="2" style="width:150px;background:#e0e0e0">الطالب المتميّز</th></tr><tr>' +
        RANGE_KEYS.map(function (k) { return '<th style="background:' + col(k) + ';font-size:9px">مرات</th><th style="background:' + col(k) + ';font-size:9px">صفحات</th>'; }).join('') + '</tr></thead>';
      var body = pg.units.map(function (s, i) {
        var star = s.star();
        return '<tr><td>' + (i + 1) + '</td><td class="r">' + esc(s.name) + '</td><td class="r" style="font-size:9.5px">' + esc(s.teacher) + '</td><td>' + s.rows.length + '</td>' +
          RANGE_KEYS.map(function (k) { return '<td style="background:' + light(k) + '">' + z(s.cnt(k)) + '</td><td style="background:' + light(k) + '">' + z(s.pages(k)) + '</td>'; }).join('') +
          COUNT_KEYS.map(function (k) { return '<td style="background:' + light(k) + '">' + z(s.cnt(k)) + '</td>'; }).join('') +
          '<td>' + (s.total() ? Math.round(s.att() * 100) : '') + '</td><td><b>' + (s.avg() ? Math.round(s.avg()) : '') + '</b></td>' +
          '<td class="r">' + esc(star ? star.studentName : '') + '</td></tr>';
      }).join('');
      var c = function (k) { return pg.units.reduce(function (s, u) { return s + u.cnt(k); }, 0); };
      var p = function (k) { return pg.units.reduce(function (s, u) { return s + u.pages(k); }, 0); };
      var uPres = pg.units.reduce(function (s, u) { return s + u.present(); }, 0), uTot = pg.units.reduce(function (s, u) { return s + u.total(); }, 0);
      var total = '<tr class="rpx-total"><td colspan="3">المجموع</td><td>' + pg.units.reduce(function (s, u) { return s + u.rows.length; }, 0) + '</td>' +
        RANGE_KEYS.map(function (k) { return '<td style="background:' + col(k) + '">' + c(k) + '</td><td style="background:' + col(k) + '">' + n1(p(k)) + '</td>'; }).join('') +
        COUNT_KEYS.map(function (k) { return '<td style="background:' + col(k) + '">' + c(k) + '</td>'; }).join('') +
        '<td>' + (uTot ? Math.round(uPres * 100 / uTot) : '') + '</td><td colspan="2"></td></tr>';
      return PDF_CSS + '<div class="rpx" style="width:1060px;font-size:10.5px">' +
        '<div class="rpx-bar">ملخّص الحلقات والمتميّزون</div>' +
        (pg.org ? '<div class="rpx-org">' + esc(pg.org) + '</div>' : '') +
        '<div class="rpx-sub">' + esc(pg.info) + '</div>' +
        '<div class="rp-keep" style="display:flex">' + kpis.map(function (k) {
          return '<div style="flex:1;background:#f5f5f5;border:1px solid #757575;text-align:center;padding:4px"><div style="font-size:17px;font-weight:700">' + esc(k[1]) + '</div><div style="font-size:10px">' + k[0] + '</div></div>';
        }).join('') + '</div>' +
        '<div class="rp-keep" style="display:flex;gap:10px;margin:8px 0 10px">' +
        box('الحلقات المتميّزة', t.circles, starEmpty(pg.circles.length, 'حلقة')) +
        box('الطلاب المتميّزون', t.students, starEmpty(pg.rs.length, 'طالب')) + '</div>' +
        '<table>' + head + '<tbody>' + body + total + '</tbody></table>' +
        '<div class="rp-keep" style="font-size:9.5px;margin-top:6px">معيار التميّز: ' + esc(SCORE_FORMULA) + (byCenter ? '  —  درجة المركز = معدّل درجات طلابه' : '') + '</div>' +
        '<div class="rp-keep" style="font-size:9.5px">' + esc(STAR_RULE) + '</div></div>';
    }

    function sheets() {
      return pages.map(function (pg) {
        var byCenter = pg.centers != null;
        var last = 4 + 4 * 2 + 4 + 3 - 1;
        var title = ['ملخّص الحلقات والمتميّزون', pg.org].concat(pg.info.split('    •    ')).filter(Boolean).join('    |    ');
        var h1 = ['م', byCenter ? 'المركز' : 'الحلقة', byCenter ? 'الحلقة المتميّزة' : 'المعلّم', 'الطلاب'], h2 = ['', '', '', ''];
        var merges = [mergeRow(0, 0, last)];
        RANGE_KEYS.forEach(function (k) { merges.push({ s: { r: 1, c: h1.length }, e: { r: 1, c: h1.length + 1 } }); h1.push(actLabel(k), ''); h2.push('مرات', 'صفحات'); });
        COUNT_KEYS.forEach(function (k) { h1.push(COUNT_HEAD[k].replace('<br>', ' ')); h2.push(''); });
        h1.push('نسبة الحضور %', byCenter ? 'درجة المركز' : 'درجة الحلقة', 'الطالب المتميّز'); h2.push('', '', '');
        var aoa = [[title], h1, h2];
        pg.units.forEach(function (s, i) {
          var row = [i + 1, s.name, s.teacher, s.rows.length];
          RANGE_KEYS.forEach(function (k) { row.push(s.cnt(k), Math.round(s.pages(k) * 10) / 10); });
          COUNT_KEYS.forEach(function (k) { row.push(s.cnt(k)); });
          var st = s.star();
          row.push(s.total() ? Math.round(s.att() * 100) : '', Math.round(s.avg()), st ? st.studentName : '');
          aoa.push(row);
        });
        var tot = ['المجموع', '', '', pg.circles.reduce(function (a, s) { return a + s.rows.length; }, 0)];
        RANGE_KEYS.forEach(function (k) {
          tot.push(pg.circles.reduce(function (a, s) { return a + s.cnt(k); }, 0), Math.round(pg.circles.reduce(function (a, s) { return a + s.pages(k); }, 0) * 10) / 10);
        });
        COUNT_KEYS.forEach(function (k) { tot.push(pg.circles.reduce(function (a, s) { return a + s.cnt(k); }, 0)); });
        var pr = pg.circles.reduce(function (a, s) { return a + s.present(); }, 0), tt = pg.circles.reduce(function (a, s) { return a + s.total(); }, 0);
        tot.push(tt ? Math.round(pr * 100 / tt) : '');
        aoa.push(tot);
        merges.push(mergeRow(aoa.length - 1, 0, 2));
        var t = tops(pg);
        aoa.push([]);
        aoa.push(['', 'الحلقات المتميّزة', 'المعلّم', 'الدرجة']);
        if (!t.tc.length) aoa.push(['', starEmpty(pg.circles.length, 'حلقة')]);
        t.tc.forEach(function (s, i) { aoa.push([i + 1, where(s, byCenter), s.teacher, Math.round(s.avg())]); });
        aoa.push([]);
        aoa.push(['', 'الطلاب المتميّزون', 'الحلقة', 'الدرجة']);
        if (!t.ts.length) aoa.push(['', starEmpty(pg.rs.length, 'طالب')]);
        t.ts.forEach(function (r, i) { aoa.push([i + 1, r.studentName, t.circleOfNo(r.circleNo), Math.round(r.score())]); });
        aoa.push([]);
        aoa.push(['معيار التميّز: ' + SCORE_FORMULA]); merges.push(mergeRow(aoa.length - 1, 0, last));
        aoa.push([STAR_RULE]); merges.push(mergeRow(aoa.length - 1, 0, last));
        var cols = [5, 30, 28, 9];
        for (var i = 4; i < last - 2; i++) cols.push(9);
        cols.push(12, 11, 30);
        return { name: byCenter ? 'ملخّص المؤسسة' : pg.sheet, aoa: aoa, merges: merges, cols: cols };
      });
    }

    return {
      count: rowsCount(rows), landscape: true,
      fileName: fileSafe('ملخّص الحلقات والمتميّزون - ' + filePart()),
      pdf: function () { return pages.map(section); },
      xlsx: sheets,
    };
  }

  /* =========================================================
     🖨 تقرير التسكين (placement_pdf.dart · placement_report.dart)
     ========================================================= */
  var APPROVED_ROWS = 12;   // = FvRules.approvedStudents — مقام حضور الزيارة الميدانية
  var PAGE_ROWS = 20;       // 12 + 8 سعة الصفحة

  async function placementRows(no) {
    var key = 'rp_placement:' + user() + ':' + no;
    try {
      var j = await getJson('sv/placement/' + no, 30000);
      var items = Array.isArray(j.items) ? j.items : [];
      lsSet(key, { at: Date.now(), items: items });
      return { items: items, cached: false };
    } catch (err) {
      var c = lsGet(key);
      if (c && Array.isArray(c.items)) return { items: c.items, cached: true };
      throw err;
    }
  }

  function placementFrom(items, no) {
    var c = { no: no, name: '', centerNo: null, centerName: '', cls: '', teachers: [], students: [] };
    items.forEach(function (r) {
      if (!c.name) c.name = String(r.circle_name || '').trim();
      if (!c.centerName) c.centerName = String(r.center_name || '').trim();
      if (c.centerNo == null && r.center_no != null) c.centerNo = Number(r.center_no);
      if (!c.cls) c.cls = String(r.circle_class || '').trim();
      var type = String(r.row_type || '').trim().toUpperCase();
      if (type === 'T') {
        c.teachers.push({ name: String(r.teacher_name || r.name || '').trim(), idNo: String(r.id_no || '').trim(),
          birth: String(r.birth_date || '').slice(0, 10), mobile: String(r.mobile_no || '').trim(),
          tajweed: String(r.tajweed_course || '').trim(), hifz: r.hifz_juz == null ? '' : String(r.hifz_juz),
          role: String(r.emp_role || 'M').trim() || 'M' });
      } else if (type === 'S') {
        var st = toI(r.student_status != null ? r.student_status : r.status);
        if (st === 1 || st === 5) {
          c.students.push({ no: toI(r.student_no), name: String(r.student_name || r.name || '').trim(),
            idNo: String(r.id_no || '').trim(), birth: String(r.birth_date || '').slice(0, 10), st: st });
        }
      }
    });
    c.teachers.sort(function (a, b) {
      var pa = a.role !== 'A', pb = b.role !== 'A';
      if (pa !== pb) return pa ? -1 : 1;
      return cmpAr(a.name, b.name);
    });
    var byName = function (a, b) { var x = cmpAr(a.name, b.name); return x !== 0 ? x : a.no - b.no; };
    var approved = c.students.filter(function (s) { return s.st !== 5; }).sort(byName);
    var additional = c.students.filter(function (s) { return s.st === 5; }).sort(byName);
    // المعتمدون مكمَّلون إلى 12 (المقعد الشاغر يُعدّ)، والإضافيون بعددهم
    c.rows = [];
    var n = Math.max(approved.length, APPROVED_ROWS);
    for (var i = 0; i < n; i++) c.rows.push({ seq: c.rows.length + 1, s: approved[i] || null, g: 'معتمدين' });
    additional.forEach(function (s) { c.rows.push({ seq: c.rows.length + 1, s: s, g: 'إضافيين' }); });
    return c;
  }

  async function buildPlacement() {
    var nos = crit.circle ? [crit.circle] : myCircles().map(function (c) { return Number(c.circleNo); });
    var map = await centerMap();
    var out = [], cached = 0, failed = [];
    for (var i = 0; i < nos.length; i++) {
      ui.msg = 'جارٍ جلب الحلقة ' + (i + 1) + ' من ' + nos.length + '…';
      render();
      try {
        var r = await placementRows(nos[i]);
        if (r.cached) cached++;
        var c = placementFrom(r.items, nos[i]);
        var mine = circleOf(nos[i]);
        if (!c.name && mine) c.name = mine.circleName;
        if (c.centerNo == null && mine && mine.centerNo != null) c.centerNo = Number(mine.centerNo);
        if (!c.centerName) c.centerName = centerNameOf(map, c.centerNo, mine && mine.centerName);
        c.org = orgOfCenter(map, c.centerNo) || 'أكاديمية الصفا';
        out.push(c);
      } catch (err) {
        failed.push(((circleOf(nos[i]) || {}).circleName || ('حلقة ' + nos[i])) + ': ' + ((err && err.message) || ''));
      }
    }
    if (!out.length) throw new Error(failed.join('\n') || 'تعذّر جلب الحلقات.');
    var warn = [cached ? cached + ' حلقة من نسختها المحفوظة على الجهاز' : '', failed.length ? 'تعذّرت ' + failed.length + ' حلقة' : ''].filter(Boolean).join(' · ');

    var GOLD = '#BF9000', INK = '#7F6000', LABEL = '#C9DAF8', SECTION = '#A6C9EB';
    function cell(t, extra) { return '<td style="border:1.4px solid ' + GOLD + ';color:' + INK + ';' + (extra || '') + '">' + esc(t) + '</td>'; }
    function where(c) {
      return [c.centerName, c.name ? 'حلقة ' + c.name : '', c.cls ? 'تصنيف ' + c.cls : ''].filter(Boolean).join('  •  ');
    }
    function page(c, rows, first, pageNo, pages) {
      var title = c.org + ' - تقرير التسكين لحلقة التحفيظ';
      var t = c.teachers.filter(function (x) { return x.role !== 'A'; })[0] || c.teachers[0] || {};
      var assistants = c.teachers.filter(function (x) { return x !== t; }).map(function (x) { return x.name; }).filter(Boolean).join('  •  ');
      var h = PDF_CSS + '<div class="rpx" style="width:740px;font-size:13px;color:' + INK + '">' +
        '<div style="background:#215E99;color:#FFD966;text-align:center;font-weight:700;font-size:' + (title.length > 48 ? 16 : 20) + 'px;padding:9px 6px;border:1.4px solid ' + GOLD + '">' + esc(title) + '</div>' +
        '<div style="text-align:center;padding:6px 0;font-size:13px">' + esc(where(c) + (pages > 1 ? '  •  صفحة ' + pageNo + ' من ' + pages : '')) + '</div>';
      var lab = 'background:' + LABEL + ';font-weight:700;font-size:12px;height:34px';
      if (first) {
        h += '<table style="table-layout:fixed"><colgroup><col style="width:20%"><col style="width:30%"><col style="width:27%"><col style="width:23%"></colgroup>' +
          '<tr><td colspan="4" style="border:1.4px solid ' + GOLD + ';background:' + SECTION + ';font-weight:700;font-size:15px;color:' + INK + '">بيانات المعلم/ة</td></tr>' +
          '<tr>' + cell('الاسم (رباعي)', lab) + cell(t.name || '') + cell('رقم الجوال المعتمد واتساب', lab) + cell(t.mobile || '', 'direction:ltr') + '</tr>' +
          '<tr>' + cell('رقم الهوية', lab) + cell(t.idNo || '', 'direction:ltr') + cell('آخر دورة تجويد حاصل عليها', lab) + cell(t.tajweed || '') + '</tr>' +
          '<tr>' + cell('تاريخ الميلاد', lab) + cell(t.birth ? dmy(t.birth) : '', 'direction:ltr') + cell('مقدار الحفظ الكلي بالأجزاء', lab) + cell(t.hifz || '') + '</tr>' +
          (assistants ? '<tr>' + cell('معلّمون مساعدون', lab) + '<td colspan="3" style="border:1.4px solid ' + GOLD + ';color:' + INK + '">' + esc(assistants) + '</td></tr>' : '') +
          '</table><div style="height:10px"></div>';
      }
      // مقاطع الفئة المتّصلة ⇒ العمود الجانبي المدموج
      var runs = [];
      rows.forEach(function (r) { if (runs.length && runs[runs.length - 1].g === r.g) runs[runs.length - 1].n++; else runs.push({ g: r.g, n: 1 }); });
      var body = '', runIdx = 0, left = 0;
      rows.forEach(function (r) {
        var s = r.s;
        body += '<tr style="height:33px">' + cell(String(r.seq), 'background:' + LABEL + ';font-size:12px') +
          cell(s ? s.name : '', 'text-align:right;font-size:13px;white-space:nowrap;overflow:hidden') +
          cell(s ? s.idNo : '', 'direction:ltr;font-size:12px') + cell(s && s.birth ? dmy(s.birth) : '', 'direction:ltr;font-size:12px');
        if (left === 0) {
          var run = runs[runIdx++];
          left = run.n;
          // مقطعٌ قصير (صفّان فأقلّ) لا يتّسع للنصّ مدوَّرًا ⇒ أفقيًّا بخطٍّ أصغر
          body += '<td rowspan="' + run.n + '" style="border:1.4px solid ' + GOLD + ';background:#FFD966;color:' + INK + ';font-weight:700;font-size:' + (run.n >= 3 ? 16 : 13) + 'px">' +
            (run.n >= 3 ? '<div style="display:inline-block;transform:rotate(90deg);white-space:nowrap">' + esc(run.g) + '</div>' : esc(run.g)) + '</td>';
        }
        left--;
        body += '</tr>';
      });
      h += '<table style="table-layout:fixed"><colgroup><col style="width:5%"><col style="width:43%"><col style="width:20%"><col style="width:17.5%"><col style="width:14.5%"></colgroup>' +
        '<tr><td colspan="5" style="border:1.4px solid ' + GOLD + ';background:' + SECTION + ';font-weight:700;font-size:15px;color:' + INK + '">بيانات (الطلاب - الطالبات)</td></tr>' +
        '<tr>' + cell('م', lab) + cell('الاسم رباعي', lab) + cell('رقم الهوية', lab) + cell('تاريخ الميلاد', lab) + cell('') + '</tr>' +
        body + '</table></div>';
      return h;
    }

    function sections() {
      var all = [];
      out.forEach(function (c) {
        var pages = [];
        for (var i = 0; i < c.rows.length; i += PAGE_ROWS) pages.push(c.rows.slice(i, i + PAGE_ROWS));
        pages.forEach(function (rows, i) { all.push(page(c, rows, i === 0, i + 1, pages.length)); });
      });
      return all;
    }

    function sheets() {
      return out.map(function (c) {
        var t = c.teachers.filter(function (x) { return x.role !== 'A'; })[0] || c.teachers[0] || {};
        var assistants = c.teachers.filter(function (x) { return x !== t; }).map(function (x) { return x.name; }).filter(Boolean).join('  •  ');
        var aoa = [[c.org + ' - تقرير التسكين لحلقة التحفيظ'], [where(c)], ['بيانات المعلم/ة'],
          ['الاسم (رباعي)', t.name || '', 'رقم الجوال المعتمد واتساب', t.mobile ? String(t.mobile) : ''],
          ['رقم الهوية', t.idNo ? String(t.idNo) : '', 'آخر دورة تجويد حاصل عليها', t.tajweed || ''],
          ['تاريخ الميلاد', t.birth ? dmy(t.birth) : '', 'مقدار الحفظ الكلي بالأجزاء', t.hifz || '']];
        if (assistants) aoa.push(['معلّمون مساعدون', assistants]);
        aoa.push([]);
        aoa.push(['بيانات (الطلاب - الطالبات)']);
        var tableTop = aoa.length;
        aoa.push(['م', 'الاسم رباعي', 'رقم الهوية', 'تاريخ الميلاد', '']);
        var merges = [mergeRow(0, 0, 4), mergeRow(1, 0, 4), mergeRow(2, 0, 4), mergeRow(tableTop - 1, 0, 4)];
        var start = aoa.length;
        c.rows.forEach(function (r) {
          aoa.push([r.seq, r.s ? r.s.name : '', r.s ? String(r.s.idNo) : '', r.s && r.s.birth ? dmy(r.s.birth) : '', '']);
        });
        // العمود الجانبي: «معتمدين»/«إضافيين» مدموجًا على مقطعه
        for (var a = 0; a < c.rows.length;) {
          var b = a;
          while (b + 1 < c.rows.length && c.rows[b + 1].g === c.rows[a].g) b++;
          aoa[start + a][4] = c.rows[a].g;
          if (b > a) merges.push({ s: { r: start + a, c: 4 }, e: { r: start + b, c: 4 } });
          a = b + 1;
        }
        return { name: c.name || ('حلقة ' + c.no), aoa: aoa, merges: merges, cols: [16, 36, 24, 18, 12] };
      });
    }

    return {
      count: out.length + ' حلقة', warn: warn, landscape: false,
      fileName: fileSafe('تقرير التسكين - ' + (crit.circle ? (out[0].name || 'حلقة') : 'حلقاتي')),
      pdf: sections, xlsx: sheets,
    };
  }

  /* =========================================================
     🪪 كشف بيانات الطلاب (roster_export.dart)
     ========================================================= */
  function mobileText(m) {
    var s = String(m || '').trim();
    if (!s || s === '0') return '';
    if (s[0] === '0' || s[0] === '+') return s;
    if (/^\d{10,15}$/.test(s)) return '+' + s;
    return s.length === 9 ? '0' + s : s;
  }
  function g(r, k) { return String(r[k] == null ? '' : r[k]).trim(); }
  var ROSTER_COLS = [
    { key: 'name', label: 'الاسم رباعي', w: 150, xl: 34, v: function (r) { return g(r, 'name'); }, on: true },
    { key: 'id_no', label: 'رقم الهوية', w: 58, xl: 13, v: function (r) { return g(r, 'id_no'); }, latin: true, on: true },
    { key: 'birth_date', label: 'تاريخ الميلاد', w: 54, xl: 13, v: function (r) { return dmy(g(r, 'birth_date')); }, latin: true, on: true },
    { key: 'status', label: 'الحالة', w: 50, xl: 12, v: function (r) { return g(r, 'status_name'); }, on: true },
    { key: 'mobile', label: 'رقم التواصل', w: 60, xl: 13, v: function (r) { return mobileText(g(r, 'mobile')); }, latin: true, on: true },
    { key: 'whatsapp', label: 'واتساب', w: 66, xl: 15, v: function (r) { return g(r, 'whatsapp'); }, latin: true },
    { key: 'guardian_id_no', label: 'هوية وليّ الأمر', w: 58, xl: 14, v: function (r) { return g(r, 'guardian_id_no'); }, latin: true, on: true },
    { key: 'guardian_name', label: 'اسم وليّ الأمر', w: 130, xl: 32, v: function (r) { return g(r, 'guardian_name'); } },
    { key: 'circle', label: 'الحلقة', w: 90, xl: 24, v: function (r) { return g(r, 'circle_name'); }, on: true },
    { key: 'teachers', label: 'المعلّم', w: 100, xl: 26, v: function (r) { return g(r, 'teachers'); } },
    { key: 'center', label: 'المركز', w: 90, xl: 24, v: function (r) { return g(r, 'center_name'); } },
    { key: 'register_date', label: 'تاريخ التسجيل', w: 54, xl: 13, v: function (r) { return dmy(g(r, 'register_date')); }, latin: true },
    { key: 'address', label: 'العنوان', w: 110, xl: 30, v: function (r) { return g(r, 'address'); } },
  ];

  // الصفوف مجموعةً بالمؤسسة — القمّة أوّلًا ثم فروعها (rosterByRoot)
  function byRoot(rows) {
    if (!rows.length) return [{ name: null, top: null, rows: rows }];
    var groups = groupBy(rows, function (r) { return g(r, 'root_no') || '-'; });
    groups.forEach(function (x) { x.name = g(x.rows[0], 'root_name') || null; x.top = g(x.rows[0], 'top_name') || null; });
    return groups.sort(function (a, b) {
      var t = cmpAr(a.top || '', b.top || '');
      if (t) return t;
      var at = a.name === a.top, bt = b.name === b.top;
      if (at !== bt) return at ? -1 : 1;
      return cmpAr(a.name || '', b.name || '');
    });
  }

  // رأس صفحات المؤسسة: القمّة ثم التابعة ثم المركز المختار — كلٌّ سطرٌ في الوسط
  function headOf(grp, centerName) {
    var top = grp.top || grp.name;
    var branch = grp.name && grp.name !== top ? grp.name : null;
    var center = centerName && centerName !== top && centerName !== branch ? centerName : null;
    return { top: top, branch: branch, center: center };
  }

  function rosterSection(o) {
    // o: { title, top, branch, center, criteria, issued, cols, rows }
    var base = o.cols.reduce(function (s, c) { return s + c.w; }, 0);
    var landscape = 20 + base > 547 * 1.1;
    var W = landscape ? 1060 : 740;
    var k = (W - 28) / base;
    var head = '<tr><th style="width:28px;background:#e0e0e0">م</th>' + o.cols.map(function (c) {
      return '<th style="width:' + Math.round(c.w * k) + 'px;background:#e0e0e0">' + esc(c.label) + '</th>';
    }).join('') + '</tr>';
    var body = o.rows.map(function (r, i) {
      var bg = i % 2 ? ' style="background:#f5f5f5"' : '';
      return '<tr' + bg + '><td>' + (i + 1) + '</td>' + o.cols.map(function (c) {
        var v = esc(c.v(r));
        return c.latin ? '<td class="ltr">' + v + '</td>' : '<td class="r"' + (c.key === 'name' ? ' style="font-weight:700"' : '') + '>' + v + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return {
      landscape: landscape,
      html: PDF_CSS + '<div class="rpx" style="width:' + W + 'px;font-size:11px">' +
        '<div class="rpx-bar">' + esc(o.title) + '</div>' +
        (o.top ? '<div style="text-align:center;font-weight:700;font-size:15px;color:#10375C;margin-top:5px">' + esc(o.top) + '</div>' : '') +
        (o.branch ? '<div style="text-align:center;font-weight:700;font-size:13.5px">' + esc(o.branch) + '</div>' : '') +
        (o.center ? '<div style="text-align:center;font-size:13px">' + esc(o.center) + '</div>' : '') +
        '<div style="font-size:11.5px;margin:4px 0 6px">' + esc(o.criteria) + '</div>' +
        '<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table>' +
        '<div style="font-size:10px;margin-top:5px">' + esc(o.issued) + '</div></div>',
    };
  }

  async function buildRoster() {
    var cols = ROSTER_COLS.filter(function (c) { return crit.cols.indexOf(c.key) !== -1; });
    var j = await getJson('sv/report/students', 120000);
    var rows = Array.isArray(j.rows) ? j.rows : [];
    var stSet = crit.statuses;
    var chosen = crit.circle ? circleOf(crit.circle) : null;
    rows = rows.filter(function (r) {
      if (crit.circle && toI(r.circle_no) !== Number(crit.circle)) return false;
      if (stSet && stSet.indexOf(g(r, 'status')) === -1) return false;
      return true;
    });
    if (!rows.length) return { empty: true, emptyMsg: 'لا طلاب بهذه الحالات' + (chosen ? ' في حلقة ' + chosen.circleName : ' في حلقاتك') + '.' };
    var byCircle = crit.cols.indexOf('circle') !== -1;
    rows.sort(function (a, b) {
      if (byCircle) { var c = cmpAr(g(a, 'circle_name'), g(b, 'circle_name')); if (c) return c; }
      return cmpAr(g(a, 'name'), g(b, 'name'));
    });
    var statusNames = (crit._statusOpts || []).filter(function (s) { return !stSet || stSet.indexOf(s.code) !== -1; }).map(function (s) { return s.name; });
    var title = 'كشف بيانات الطلاب';
    var issued = 'صدر في ' + dmy(ymd(new Date()));
    var groups = byRoot(rows);

    function criteria(n) {
      return [n + ' طالبًا', chosen ? 'الحلقة: ' + chosen.circleName : 'كل حلقاتي',
        statusNames.length && crit._statusOpts && statusNames.length < crit._statusOpts.length ? 'الحالة: ' + statusNames.join('، ') : ''].filter(Boolean).join(' · ');
    }
    var built = groups.map(function (grp) {
      var h = headOf(grp, null);
      return rosterSection({ title: title, top: h.top, branch: h.branch, center: h.center, criteria: criteria(grp.rows.length), issued: issued, cols: cols, rows: grp.rows });
    });

    function sheets() {
      return groups.map(function (grp) {
        var h = headOf(grp, null);
        var lines = [title, h.top, h.branch].filter(Boolean);
        var aoa = lines.map(function (l) { return [l]; });
        aoa.push([criteria(grp.rows.length) + ' · ' + issued]);
        var merges = aoa.map(function (_, i) { return mergeRow(i, 0, cols.length); });
        aoa.push(['م'].concat(cols.map(function (c) { return c.label; })));
        grp.rows.forEach(function (r, i) { aoa.push([i + 1].concat(cols.map(function (c) { return c.v(r); }))); });
        return { name: groups.length === 1 || !grp.name ? title : grp.name, aoa: aoa, merges: merges, cols: [6].concat(cols.map(function (c) { return c.xl; })) };
      });
    }

    return {
      count: rows.length + ' طالبًا', landscape: built[0].landscape,
      fileName: fileSafe(title + (chosen ? ' - ' + chosen.circleName : '')),
      pdf: function () { return built.map(function (b) { return b.html; }); },
      xlsx: sheets,
    };
  }

  /* =========================================================
     📝 خلاصة اختبارات الطلاب (exams_summary_pdf.dart)
     ========================================================= */
  function num2(s) {
    var v = parseFloat(String(s || '').trim());
    if (isNaN(v)) return String(s || '').trim();
    return v === Math.round(v) ? String(Math.round(v)) : v.toFixed(2).replace(/0$/, '');
  }

  async function buildExams() {
    var q = [];
    if (crit.from) q.push('date_from=' + crit.from);
    if (crit.to) q.push('date_to=' + crit.to);
    var j = await getJson('sv/report/exams-summary' + (q.length ? '?' + q.join('&') : ''), 120000);
    var rows = Array.isArray(j.rows) ? j.rows : [];
    var chosen = crit.circle ? circleOf(crit.circle) : null;
    // الجواب بلا رقم الحلقة ⇒ الحلقة المختارة باسمها (حلقات المستخدم أسماؤها مميّزة في الغالب)
    if (chosen) rows = rows.filter(function (r) { return g(r, 'circle_name') === String(chosen.circleName || '').trim(); });
    if (!rows.length) return { empty: true, emptyMsg: 'لا اختبارات ناجحة' + (crit.from ? ' في هذه الفترة' : '') + (chosen ? ' لطلاب حلقة ' + chosen.circleName : ' لطلاب حلقاتك') + '.' };
    var title = 'خلاصة اختبارات الطلاب';
    var period = crit.from || crit.to;
    var notes = ['الجزء من: أوّل اختبار · الجزء إلى: آخر اختبار',
      'الأجزاء المنجزة: أجزاءٌ مختلفة نجح فيها (لا يتكرّر الجزء)',
      'المعدّل: متوسّط درجات اختباراته (عدا السرد والإلكتروني)',
      'التقدير: بفئات آخر اختبار، كشهادة الحفل'].concat(period ? ['الحساب كلّه على الاختبارات الناجحة في الفترة وحدها'] : []);
    var issued = 'صدر في ' + dmy(ymd(new Date()));
    var exams = rows.reduce(function (n, r) { return n + toI(r.exams_cnt); }, 0);
    var groups = byRoot(rows);

    var COLS = function (rs) {
      var multi = {}; rs.forEach(function (r) { multi[g(r, 'center_name')] = 1; });
      return [
        ['الاسم', 5.2, function (r) { return g(r, 'name'); }, false, true],
        ['رقم الهوية', 2.3, function (r) { return g(r, 'id_no'); }, true],
        ['تاريخ الميلاد', 2.3, function (r) { return dmy(g(r, 'birth_date')); }, true],
        ['الجزء<br>من', 1.2, function (r) { return g(r, 'part_from'); }, true],
        ['الجزء<br>إلى', 1.2, function (r) { return g(r, 'part_to'); }, true],
        ['الأجزاء<br>المنجزة', 1.5, function (r) { return g(r, 'parts_done'); }, true],
        ['المعدّل', 1.6, function (r) { return num2(g(r, 'avg_pct')); }, true],
        ['التقدير', 2.2, function (r) { return g(r, 'grade'); }],
        ['تاريخ آخر<br>اختبار', 2.3, function (r) { return dmy(g(r, 'last_date')); }, true],
        ['الحلقة', 3.6, function (r) { return g(r, 'circle_name'); }],
      ].concat(Object.keys(multi).length > 1 ? [['المركز', 3, function (r) { return g(r, 'center_name'); }]] : []);
    };

    function section(grp) {
      var h = headOf(grp, null), rs = grp.rows, cols = COLS(rs);
      var flex = 0.8 + cols.reduce(function (s, c) { return s + c[1]; }, 0);
      var W = 1060, unit = W / flex;
      var byGrade = {};
      rs.forEach(function (r) { var x = g(r, 'grade'); if (x) byGrade[x] = (byGrade[x] || 0) + 1; });
      var ex = rs.reduce(function (n, r) { return n + toI(r.exams_cnt); }, 0);
      var chips = [['طالبًا', rs.length, '#123D68'], ['اختبارًا ناجحًا', ex, '#2E7D4F']].concat(
        Object.keys(byGrade).sort(function (a, b) { return byGrade[b] - byGrade[a]; }).map(function (k) { return [k, byGrade[k], '#1D5B98']; }));
      var head = '<tr><th style="width:' + Math.round(0.8 * unit) + 'px">م</th>' + cols.map(function (c) {
        return '<th style="width:' + Math.round(c[1] * unit) + 'px">' + c[0] + '</th>';
      }).join('') + '</tr>';
      var body = rs.map(function (r, i) {
        return '<tr' + (i % 2 ? ' style="background:#FBF6E8"' : '') + '><td class="ltr">' + (i + 1) + '</td>' + cols.map(function (c) {
          var v = esc(c[2](r));
          return c[3] ? '<td class="ltr">' + v + '</td>' : '<td class="r"' + (c[4] ? ' style="font-weight:700"' : '') + '>' + v + '</td>';
        }).join('') + '</tr>';
      }).join('');
      var periodHtml = period ? '<div style="text-align:center;color:#5B6878;font-size:13px;margin-top:3px">الفترة: من <b class="ltr" style="color:#1F2A37">' +
        esc(crit.from ? dmy(crit.from) : 'البداية') + '</b> إلى <b class="ltr" style="color:#1F2A37">' + esc(crit.to ? dmy(crit.to) : 'اليوم') + '</b></div>' : '';
      return PDF_CSS + '<style>.rpx .rpe th,.rpx .rpe td{border:1px solid #DBE3EC;padding:4px 5px;font-size:12px !important;color:#1F2A37 !important}.rpx .rpe th{background:#EEF4FA;color:#123D68 !important}</style>' +
        '<div class="rpx" style="width:' + W + 'px">' +
        '<div style="border-bottom:2.5px solid #1D5B98;padding-bottom:8px;text-align:center">' +
        '<div style="color:#C9A23A;font-weight:700;font-size:12px">تطبيق الصفوة لمتابعة الحلقات القرآنية</div>' +
        (h.top ? '<div style="color:#123D68;font-weight:700;font-size:17px;margin-top:3px">' + esc(h.top) + '</div>' : '') +
        (h.branch ? '<div style="font-weight:700;font-size:15px">' + esc(h.branch) + '</div>' : '') +
        '<div style="color:#123D68;font-weight:800;font-size:25px;margin-top:3px">' + title + '</div>' +
        (chosen ? '<div style="font-weight:700;font-size:15px">حلقة ' + esc(chosen.circleName) + '</div>' : '') + periodHtml + '</div>' +
        '<div class="rp-keep" style="display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:10px 0">' + chips.map(function (c) {
          return '<span style="background:#EEF4FA;border:1px solid #DBE3EC;border-radius:8px;padding:4px 12px;font-size:13px"><b style="color:' + c[2] + ';font-size:17px">' + c[1] + '</b> ' + esc(c[0]) + '</span>';
        }).join('') + '</div>' +
        '<table class="rpe"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>' +
        '<div class="rp-keep" style="margin-top:10px;background:#FBF6E8;border:1px solid #DBE3EC;border-radius:6px;padding:8px;font-size:11px;color:#5B6878">' +
        '<b style="color:#123D68">طريقة الحساب</b>' + notes.map(function (n) { return '<div>• ' + esc(n) + '</div>'; }).join('') + '</div>' +
        '<div style="font-size:9.5px;color:#5B6878;margin-top:6px">تطبيق الصفوة لمتابعة الحلقات القرآنية — ' + title + (h.top ? ' · ' + esc(h.branch || h.top) : '') + ' · ' + issued + '</div></div>';
    }

    function sheets() {
      return groups.map(function (grp) {
        var h = headOf(grp, null), cols = COLS(grp.rows);
        var aoa = [title, h.top, h.branch].filter(Boolean).map(function (l) { return [l]; });
        aoa.push([[grp.rows.length + ' طالبًا', exams + ' اختبارًا ناجحًا', chosen ? 'الحلقة: ' + chosen.circleName : 'كل حلقاتي',
          period ? 'الفترة: ' + (crit.from ? dmy(crit.from) : 'البداية') + ' — ' + (crit.to ? dmy(crit.to) : 'اليوم') : '', issued].filter(Boolean).join(' · ')]);
        var merges = aoa.map(function (_, i) { return mergeRow(i, 0, cols.length); });
        aoa.push(['م'].concat(cols.map(function (c) { return c[0].replace('<br>', ' '); })));
        grp.rows.forEach(function (r, i) { aoa.push([i + 1].concat(cols.map(function (c) { return c[2](r); }))); });
        aoa.push([]);
        notes.forEach(function (n) { aoa.push([n]); merges.push(mergeRow(aoa.length - 1, 0, cols.length)); });
        return { name: groups.length === 1 || !grp.name ? title : grp.name, aoa: aoa, merges: merges, cols: [6, 34, 13, 13, 9, 9, 12, 10, 16, 13, 20, 18] };
      });
    }

    return {
      count: rows.length + ' طالبًا · ' + exams + ' اختبارًا ناجحًا', landscape: true,
      fileName: fileSafe(title + (chosen ? ' - ' + chosen.circleName : '') + (period ? ' - ' + periodName(crit.from, crit.to) : '')),
      pdf: function () { return groups.map(section); },
      xlsx: sheets,
    };
  }

  var BUILDERS = { placement: buildPlacement, recitation: buildRecitation, monthly: buildMonthly, summary: buildSummary, roster: buildRoster, exams: buildExams };

  /* ---------- الفتح والإغلاق ---------- */
  function openCircleReports() {
    ui.view = 'list'; ui.rep = null; ui.msg = ui.err = '';
    ensureScreen().style.display = 'flex';
    document.body.classList.add('rp-open');
    render();
    centerMap();   // أسماء المؤسسات في الخلفية
  }
  function closeCircleReports() {
    var el = document.getElementById('rpScreen');
    if (el) el.style.display = 'none';
    document.body.classList.remove('rp-open');
  }
  document.addEventListener('keydown', function (e) {
    var el = document.getElementById('rpScreen');
    if (e.key !== 'Escape' || !el || el.style.display === 'none') return;
    if (document.querySelector('.modal-overlay[style*="flex"]')) return;
    if (ui.view === 'crit') { ui.view = 'list'; ui.rep = null; render(); } else closeCircleReports();
  });
  window.addEventListener('online', function () { var el = document.getElementById('rpScreen'); if (el && el.style.display !== 'none') render(); });
  window.addEventListener('offline', function () { var el = document.getElementById('rpScreen'); if (el && el.style.display !== 'none') render(); });

  var CSS =
    '#rpScreen{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2000;background:var(--bg,#f8f9fa);flex-direction:column}' +
    'body.rp-open{overflow:hidden}' +
    '.rp-bar{display:flex;align-items:center;gap:6px;padding:10px 12px;padding-top:calc(10px + env(safe-area-inset-top));background:#fff;border-bottom:1px solid #e2e8f0}' +
    '.rp-title{flex:1;font-size:18px;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.rp-icon{background:transparent;color:#334155;width:40px;height:40px;border-radius:50%;padding:0;font-size:18px;flex-shrink:0}' +
    '.rp-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 12px calc(24px + env(safe-area-inset-bottom));max-width:760px;width:100%;margin:0 auto;box-sizing:border-box}' +
    '.rp-center{text-align:center;color:#475569;padding:40px 16px;display:flex;flex-direction:column;align-items:center;gap:12px;font-size:15px;line-height:1.7}' +
    '.rp-big{font-size:38px;color:#94a3b8}' +
    '.rp-item{display:flex;align-items:center;gap:12px;width:100%;text-align:start;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:12px;margin-bottom:10px;color:#0f172a;box-shadow:0 1px 2px #0000000d}' +
    '.rp-ic{width:42px;height:42px;border-radius:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--c);background:#f1f5f9}' +
    '@supports (background:color-mix(in srgb,red 10%,#fff)){.rp-ic{background:color-mix(in srgb,var(--c) 14%,#fff)}}' +
    '.rp-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.rp-t b{font-size:15px}.rp-t small{color:#64748b;font-size:12.5px;line-height:1.5}' +
    '.rp-go{color:#94a3b8;font-size:13px}' +
    '.rp-desc{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;font-size:14px;line-height:1.7;color:#334155;margin-bottom:6px}' +
    '.rp-lbl{display:block;font-weight:700;font-size:14px;margin:14px 0 6px;color:#0f172a}.rp-lbl small{font-weight:400;color:#64748b}' +
    '.rp-select{width:100%;border:1px solid #dee2e6;border-radius:12px;padding:10px 12px;font-size:15px;background:#fff;box-sizing:border-box}' +
    '.rp-fixed{border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;background:#f8fafc;font-size:15px}' +
    '.rp-checks{display:flex;flex-wrap:wrap;gap:6px 8px}' +
    '.rp-chk{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #dee2e6;border-radius:20px;padding:6px 12px;font-size:13.5px}' +
    '.rp-chk input{width:16px;height:16px;margin:0}.rp-chk.locked{opacity:.7}' +
    '.rp-muted{color:#64748b;font-size:13px}' +
    '.rp-actions{display:flex;gap:10px;margin-top:18px}' +
    '.rp-btn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--primary);color:#fff;border-radius:22px;padding:12px 16px;font-size:15px;font-weight:600}' +
    '.rp-btn:disabled{opacity:.55}' +
    '.rp-outline{background:#fff;color:var(--primary);border:1px solid var(--primary-line,#c6dafc)}' +
    '.rp-note{display:flex;gap:8px;align-items:flex-start;border-radius:12px;padding:10px;margin-top:12px;font-size:14px;line-height:1.6;border:1px solid;white-space:pre-line}' +
    '.rp-note i{margin-top:4px;font-size:13px}' +
    '.rp-calm{background:#f1f5f9;color:#475569;border-color:#47556940}' +
    '.rp-amber{background:#fffbeb;color:#92400e;border-color:#92400e40;margin:0 0 10px}' +
    '.rp-rose{background:#fff1f2;color:#9f1239;border-color:#9f123940}';
  var st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  window.openCircleReports = openCircleReports;
  window.closeCircleReports = closeCircleReports;
  window.QmcReports = { anyVisible: anyVisible, visibleReports: visibleReports,
    // للفحص: بناء تقريرٍ بمعايير معيّنة بلا شاشة
    _build: function (id, c) { crit = Object.assign({ circle: null, from: '', to: '', statuses: null, cols: null }, c || {}); return BUILDERS[id](); } };
})();
