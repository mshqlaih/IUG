/* 🕓 موعد الحلقة (2026-11-02) — نظير lib/screens/circle_schedule_screen.dart
 * و circle_schedule_pdf.dart في تطبيق أندرويد، لمعلّم الحلقة وحده (حلقاتي).
 *
 * النقطة نفسها (QMC_ORG_PKG §21 — docs/ords_circle_schedule.sql):
 *   GET  org/circle-schedule            ⇒ حلقات المستخدم التي يعلّم فيها
 *   POST org/circle-schedule  {action: SAVE · CLEAR · CHECK_IN · CHECK_OUT, circle_no, …}
 * الاسم من التوكن (X-Device-Id يحقنه QMC.apiFetch) — لا يُرسَل.
 *
 * · يُدخل المعلّم أيام حلقته وساعاتها ومكانها مرّةً، ثم يُقفل عليه.
 * · «وصلتُ» و«انصرفتُ» بوقت الخادم في غزة — في المؤسسات التي فعّلته.
 * · جدول الأسبوع PDF (مواعيد حلقاتي): صفٌّ لكل حلقة وعمودٌ لكل يوم من السبت.
 * القراءة دون اتصال من نسخة الجهاز (localStorage `sched_mine:<user>`)، والحفظ يلزمه اتصال.
 * المدخل: زرّ «موعد الحلقة» في رأس «طلابي».
 */
(function () {
  'use strict';

  var DAY_NAMES = { 1: 'الأحد', 2: 'الاثنين', 3: 'الثلاثاء', 4: 'الأربعاء', 5: 'الخميس', 6: 'الجمعة', 7: 'السبت' };
  var WEEK = [7, 1, 2, 3, 4, 5, 6];   // الأسبوع يبدأ بالسبت في العرض

  var page = null;      // آخر ردّ مقروء
  var ui = { loading: false, error: '', tab: 'week', view: 'main', exporting: false };
  var ed = null;        // حال شاشة الإدخال

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function parseHm(v) {
    var p = String(v == null ? '' : v).split(':');
    if (p.length !== 2) return null;
    var h = parseInt(p[0], 10), m = parseInt(p[1], 10);
    return isNaN(h) || isNaN(m) ? null : h * 60 + m;
  }
  function range(s) { return hhmm(s.start) + '–' + hhmm(s.end); }
  function dayName(d) { return DAY_NAMES[d] || ''; }
  function dayRank(d) { return d % 7; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dayOf(d) { return d.getDay() + 1; }   // 1 الأحد … 7 السبت (CIRCLE_DAYS)
  function str(v) { var t = v == null ? '' : String(v).trim(); return t || null; }
  function toast(m) { if (typeof showToast === 'function') showToast(m); }

  /* ---------- الشبكة ---------- */
  async function call(body) {
    try {
      var r = await QMC.apiFetch('org/circle-schedule', body
        ? { method: 'POST', body: body, timeoutMs: 30000 }
        : { timeoutMs: 25000 });
      var d = await r.json().catch(function () { return {}; });
      d = (d && typeof d === 'object') ? d : {};
      // الجسم هو الحَكَم لا رمز HTTP (كـOrgService._call)
      var ok = d.status === 'success';
      var msg = d.message != null ? String(d.message)
        : (r.status === 404 ? 'الخدمة لم تُفعَّل على الخادم بعد' : 'تعذّر إتمام الطلب (رمز ' + r.status + ')');
      return { ok: ok, message: msg, data: d, offline: false };
    } catch (_) {
      return { ok: false, message: 'تعذّر الاتصال بالخادم — تحقّق من الإنترنت وأعد المحاولة', data: {}, offline: true };
    }
  }

  function cacheKey() { return 'sched_mine:' + (QMC.getUserName() || ''); }

  function parseCircle(j) {
    var slots = (Array.isArray(j.slots) ? j.slots : []).map(function (x) {
      var d = parseInt(x && x.day, 10), s = parseHm(x && x.start), e = parseHm(x && x.end);
      return isNaN(d) || s == null || e == null ? null : { day: d, start: s, end: e };
    }).filter(Boolean).sort(function (a, b) { return dayRank(a.day) - dayRank(b.day); });
    var c = {
      circleNo: parseInt(j.circle_no, 10) || 0,
      circleName: str(j.circle_name) || '',
      centerNo: parseInt(j.center_no, 10) || 0,
      centerName: str(j.center_name) || '',
      teachers: (Array.isArray(j.teachers) ? j.teachers : []).map(function (t) {
        return {
          name: str(t.name) || '',
          inAt: parseHm(t.in_at), outAt: parseHm(t.out_at),
          absent: t.absent === 'Y', isMe: t.is_me === 'Y'
        };
      }),
      place: str(j.place),
      setByName: str(j.set_by_name),
      setAt: str(j.set_at),
      canEdit: j.can_edit === 'Y',
      canManage: j.can_manage === 'Y',
      checkinOn: j.checkin === 'Y',
      lateGrace: isNaN(parseInt(j.late_grace, 10)) ? 5 : parseInt(j.late_grace, 10),
      slots: slots
    };
    c.hasSchedule = c.place != null && slots.length > 0;
    c.teacherNames = c.teachers.map(function (t) { return t.name; }).join('، ');
    c.locked = c.hasSchedule && !c.canEdit;
    c.me = c.teachers.filter(function (t) { return t.isMe; })[0] || null;
    return c;
  }

  function parsePage(j, cachedAt) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(j.gaza_now || ''));
    var gazaNow = m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : null;
    var gd = parseInt(j.gaza_day, 10);
    return {
      gazaNow: gazaNow,
      gazaDay: isNaN(gd) ? null : gd,
      circles: (Array.isArray(j.circles) ? j.circles : []).map(parseCircle),
      cachedAt: cachedAt || null,
      receivedAt: Date.now()
    };
  }

  /** ساعة غزة الآن: ساعة الخادم عند الردّ + ما مضى على الجهاز — لا من نسخةٍ محفوظة. */
  function gazaNowLive(p) {
    if (!p.gazaNow || p.cachedAt) return null;
    return new Date(p.gazaNow.getTime() + (Date.now() - p.receivedAt));
  }

  function slotOn(c, day) { return c.slots.filter(function (s) { return s.day === day; })[0] || null; }

  async function load() {
    ui.loading = true; ui.error = '';
    render();
    var r = await call(null);
    if (r.ok) {
      page = parsePage(r.data, null);
      try { localStorage.setItem(cacheKey(), JSON.stringify({ at: new Date().toISOString(), data: r.data })); } catch (_) {}
    } else if (r.offline) {
      var raw = null;
      try { raw = localStorage.getItem(cacheKey()); } catch (_) {}
      try {
        var j = raw ? JSON.parse(raw) : null;
        page = j ? parsePage(j.data || {}, new Date(j.at)) : null;
      } catch (_) { page = null; }
      if (!page) ui.error = 'لا اتصال، ولم تُنزَّل هذه البيانات للعمل دون اتصال بعد';
    } else {
      page = null;
      ui.error = r.message;
    }
    ui.loading = false;
    render();
  }

  /* ---------- حال المعلّم اليوم ---------- */
  // ⏱ الوصول بعد البدء بأكثر من هامش المؤسسة تأخّرٌ يُعدّ من ساعة البدء
  function attState(t, slot, nowMin, grace) {
    if (t.absent) return ['غيابٌ مسجّل', 'rose'];
    if (t.inAt != null) {
      var late = slot && t.inAt > slot.start + grace ? t.inAt - slot.start : 0;
      var text = 'الوصول ' + hhmm(t.inAt) + (late > 0 ? ' (تأخّر ' + late + ' د)' : '') +
        (t.outAt != null ? ' · الانصراف ' + hhmm(t.outAt) : '');
      return [text, late > 0 ? 'amber' : 'green'];
    }
    if (slot && nowMin < slot.start) return ['لم تبدأ بعد', 'calm'];
    return ['لا وصول مسجّلًا', 'amber'];
  }
  function chip(text, tone) { return '<span class="sc-chip sc-' + tone + '">' + esc(text) + '</span>'; }
  function note(tone, icon, text) {
    return '<div class="sc-note sc-' + tone + '"><i class="fas ' + icon + '"></i><span>' + esc(text) + '</span></div>';
  }

  /* ---------- الرسم ---------- */
  function ensureScreen() {
    var el = document.getElementById('schedScreen');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'schedScreen';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.style.display = 'none';
    el.innerHTML = '<div class="sc-bar"></div><div class="sc-body"></div>';
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    el.addEventListener('input', onInput);
    document.body.appendChild(el);
    return el;
  }

  function iconBtn(act, icon, title, disabled, extra) {
    return '<button type="button" class="sc-icon' + (extra || '') + '" data-act="' + act + '" title="' + title +
      '" aria-label="' + title + '"' + (disabled ? ' disabled' : '') + '><i class="fas ' + icon + '"></i></button>';
  }

  function render() {
    var el = ensureScreen();
    var bar = el.querySelector('.sc-bar');
    var body = el.querySelector('.sc-body');
    if (ui.view === 'edit' && ed) {
      bar.innerHTML = iconBtn('back', 'fa-arrow-right', 'رجوع') +
        '<div class="sc-title">موعد ' + esc(ed.circle.circleName) + '</div>';
      body.innerHTML = editHtml();
      refreshEditFooter();
      return;
    }
    var circles = page ? page.circles : [];
    bar.innerHTML = iconBtn('close', 'fa-arrow-right', 'رجوع') +
      '<div class="sc-title">موعد الحلقة</div>' +
      '<button type="button" class="help-btn" data-help="circleSchedule" title="شرح الشاشة" aria-label="شرح الشاشة"><i class="fas fa-question"></i></button>' +
      (circles.length ? iconBtn('pdf', ui.exporting ? 'fa-spinner fa-spin' : 'fa-file-pdf', 'جدول الأسبوع PDF', ui.exporting) : '') +
      iconBtn('reload', 'fa-rotate', 'تحديث', ui.loading);
    if (typeof _helpMarkDots === 'function') _helpMarkDots();

    if (ui.loading && !page) { body.innerHTML = '<div class="sc-center"><i class="fas fa-spinner fa-spin"></i></div>'; return; }
    if (!page) {
      body.innerHTML = '<div class="sc-center"><i class="fas fa-cloud-arrow-down sc-big"></i><div>' + esc(ui.error) +
        '</div><button type="button" class="sc-btn sc-outline" data-act="reload">أعد المحاولة</button></div>';
      return;
    }
    if (!circles.length) {
      body.innerHTML = '<div class="sc-center"><i class="fas fa-calendar-xmark sc-big"></i><div>لست معلّمًا في حلقةٍ فعّالة.</div></div>';
      return;
    }
    // الأسبوع يفيد من له حلقاتٌ عدّة؛ المعلّم بحلقةٍ واحدة تكفيه بطاقتها
    var tabs = circles.length > 1;
    var h = headerNotes() + todayPanel(circles);
    if (tabs) {
      h += '<div class="sc-tabs">' +
        '<button type="button" data-act="tab" data-tab="week" class="' + (ui.tab === 'week' ? 'on' : '') + '"><i class="fas fa-calendar-week"></i> الأسبوع</button>' +
        '<button type="button" data-act="tab" data-tab="list" class="' + (ui.tab === 'list' ? 'on' : '') + '"><i class="fas fa-list"></i> الحلقات</button></div>';
    }
    h += tabs && ui.tab === 'week' ? weekHtml(circles) : circles.map(function (c) { return cardHtml(c, false); }).join('');
    body.innerHTML = h;
  }

  /** فوق القائمتين: ساعة غزة، أو تنبيه نسخة الجهاز */
  function headerNotes() {
    if (page.cachedAt) return note('amber', 'fa-cloud-arrow-down', 'دون اتصال — من نسخة الجهاز (' + ymd(page.cachedAt) + ').');
    var now = gazaNowLive(page);
    return now ? note('calm', 'fa-clock', 'الآن في غزة: ' + dayName(dayOf(now)) + ' ' + hhmm(now.getHours() * 60 + now.getMinutes())) : '';
  }

  /** حلقاته التي تنعقد اليوم (أو لم يُسجَّل موعدها) بزرّي الوصول والانصراف */
  function todayPanel(circles) {
    var day = page.gazaDay;
    var teaching = circles.filter(function (c) { return c.me; });
    // ⚙️ اختياريٌّ لكل مؤسسة: لم تفعّله مؤسسة المعلّم ⇒ لا ذكر له أصلًا
    var mine = teaching.filter(function (c) {
      return c.checkinOn && (day == null || !c.hasSchedule || slotOn(c, day));
    });
    if (!mine.length) return '';
    if (page.cachedAt) return note('calm', 'fa-user-check', 'تسجيل الوصول والانصراف يلزمه اتصال — الوقت من الخادم.');
    var now = gazaNowLive(page);
    var nowMin = now ? now.getHours() * 60 + now.getMinutes() : 0;
    var h = '<div class="sc-today"><div class="sc-today-head"><i class="fas fa-user-check"></i> اليوم — وصولك وانصرافك</div>';
    mine.forEach(function (c) {
      var me = c.me;
      var slot = day == null ? null : slotOn(c, day);
      var st = attState(me, slot, nowMin, c.lateGrace);
      h += '<div class="sc-today-row"><div class="sc-row-top"><b>' + esc(c.circleName) + '</b>' +
        (slot ? '<span class="sc-time" dir="ltr">' + range(slot) + '</span>' : '') + '</div>' +
        '<div class="sc-wrap">' + chip(st[0], st[1]);
      if (!me.absent && me.inAt == null) {
        h += '<button type="button" class="sc-btn" data-act="checkin" data-c="' + c.circleNo + '"><i class="fas fa-right-to-bracket"></i> وصلتُ</button>';
      } else if (!me.absent && me.outAt == null) {
        h += '<button type="button" class="sc-btn sc-outline" data-act="checkout" data-c="' + c.circleNo + '"><i class="fas fa-right-from-bracket"></i> انصرفتُ</button>';
      }
      h += '</div></div>';
    });
    return h + '</div>';
  }

  function weekHtml(circles) {
    var today = page.cachedAt ? null : page.gazaDay;
    var now = gazaNowLive(page);
    var h = '';
    WEEK.forEach(function (day) {
      var isToday = day === today;
      var nowMin = isToday && now ? now.getHours() * 60 + now.getMinutes() : null;
      var rows = [];
      circles.forEach(function (c) { var s = slotOn(c, day); if (s) rows.push({ c: c, s: s }); });
      rows.sort(function (a, b) {
        return a.s.start !== b.s.start ? a.s.start - b.s.start : a.c.circleName.localeCompare(b.c.circleName, 'ar');
      });
      h += '<div class="sc-day' + (isToday ? ' today' : '') + '"><div class="sc-day-head"><b>' + dayName(day) + '</b>' +
        (isToday ? '<span class="sc-badge">اليوم</span>' : '') +
        '<span class="sc-count">' + (rows.length ? rows.length + ' حلقة' : 'لا حلقات') + '</span></div>';
      rows.forEach(function (r) {
        var c = r.c;
        h += '<button type="button" class="sc-day-row" data-act="open" data-c="' + c.circleNo + '">' +
          '<span class="sc-time sc-time-box" dir="ltr">' + range(r.s) + '</span><span class="sc-day-info">' +
          '<b>' + esc(c.circleName) + '</b>' +
          (c.teacherNames ? '<span>' + esc(c.teacherNames) + '</span>' : '') +
          (c.place ? '<span class="sc-muted sc-ellipsis">' + esc(c.place) + '</span>' : '');
        // ⏱ اليوم: وصول كل معلّمٍ وانصرافه
        if (nowMin != null && c.checkinOn && c.teachers.length) {
          h += '<span class="sc-wrap">' + c.teachers.map(function (t) {
            var st = attState(t, r.s, nowMin, c.lateGrace);
            return chip(c.teachers.length > 1 ? t.name.split(' ')[0] + ': ' + st[0] : st[0], st[1]);
          }).join('') + '</span>';
        }
        h += '</span></button>';
      });
      h += '</div>';
    });
    var missing = circles.filter(function (c) { return !c.hasSchedule; });
    if (missing.length) {
      h += note('calm', 'fa-clipboard-list', 'لم يُسجَّل موعدها بعد (' + missing.length + '): ' +
        missing.map(function (c) { return c.circleName; }).join('، '));
    }
    return h;
  }

  function slotsHtml(slots) {
    var same = slots.every(function (s) { return s.start === slots[0].start && s.end === slots[0].end; });
    if (same) {
      return '<div class="sc-wrap">' + slots.map(function (s) { return '<span class="sc-daychip">' + dayName(s.day) + '</span>'; }).join('') +
        '</div><div class="sc-line"><i class="fas fa-clock sc-muted"></i><span class="sc-time" dir="ltr">' + range(slots[0]) + '</span></div>';
    }
    return slots.map(function (s) {
      return '<div class="sc-line"><span class="sc-daychip sc-fixed">' + dayName(s.day) + '</span><span class="sc-time" dir="ltr">' + range(s) + '</span></div>';
    }).join('');
  }

  function cardHtml(c, flat) {
    var h = '<div class="' + (flat ? 'sc-card-flat' : 'sc-card') + '"><div class="sc-card-name">' + esc(c.circleName) + '</div>' +
      (c.teacherNames ? '<div class="sc-card-teachers">' + esc(c.teacherNames) + '</div>' : '');
    if (!c.hasSchedule) {
      h += note('calm', 'fa-clipboard-list', c.canEdit
        ? 'لم يُسجَّل موعد الحلقة بعد — أدخل أيامها وساعاتها ومكانها.'
        : 'لم يُسجَّل موعد الحلقة بعد.');
    } else {
      h += slotsHtml(c.slots) +
        '<div class="sc-line sc-place"><i class="fas fa-location-dot"></i><span>' + esc(c.place) + '</span></div>';
      if (c.setByName || c.setAt) {
        h += '<div class="sc-muted sc-small">آخر حفظ: ' + esc(c.setByName || '') + (c.setAt ? ' · ' + esc(c.setAt) : '') + '</div>';
      }
      if (c.locked) h += note('calm', 'fa-lock', 'سُجّل الموعد — تعديله من إدارة المركز.');
    }
    if (c.canEdit || (c.canManage && c.hasSchedule)) {
      h += '<div class="sc-actions">';
      if (c.canManage && c.hasSchedule) {
        h += '<button type="button" class="sc-link" data-act="clear" data-c="' + c.circleNo + '"><i class="fas fa-lock-open"></i> امحُ الموعد ليُدخله معلّم الحلقة</button>';
      }
      if (c.canEdit) {
        h += c.hasSchedule
          ? '<button type="button" class="sc-btn sc-outline" data-act="edit" data-c="' + c.circleNo + '"><i class="fas fa-pen"></i> عدّل الموعد</button>'
          : '<button type="button" class="sc-btn" data-act="edit" data-c="' + c.circleNo + '"><i class="fas fa-calendar-plus"></i> أدخل الموعد</button>';
      }
      h += '</div>';
    }
    return h + '</div>';
  }

  /* ---------- الإدخال ---------- */
  function startEdit(c) {
    var perDay = {};
    c.slots.forEach(function (s) { perDay[s.day] = { start: s.start, end: s.end }; });
    ed = {
      circle: c,
      days: c.slots.map(function (s) { return s.day; }),
      same: c.slots.every(function (s) { return s.start === c.slots[0].start && s.end === c.slots[0].end; }),
      start: c.slots.length ? c.slots[0].start : null,
      end: c.slots.length ? c.slots[0].end : null,
      perDay: perDay,
      place: c.place || '',
      saving: false,
      error: ''
    };
    ui.view = 'edit';
    render();
    var b = document.querySelector('#schedScreen .sc-body');
    if (b) b.scrollTop = 0;
  }

  /** أوّل حفظٍ للمعلّم: لا تعديل بعده إلا من الإدارة */
  function once() { return !ed.circle.canManage; }
  function hasDay(d) { return ed.days.indexOf(d) >= 0; }
  function orderedDays() { return WEEK.filter(hasDay); }
  function timeOf(d) {
    return ed.same ? { start: ed.start, end: ed.end } : (ed.perDay[d] || { start: ed.start, end: ed.end });
  }
  function missingList() {
    var m = [];
    if (!ed.days.length) m.push('اختر أيام الحلقة');
    if (ed.days.some(function (d) { var t = timeOf(d); return t.start == null || t.end == null; })) m.push('حدّد ساعة البدء والانتهاء');
    if (!ed.place.trim()) m.push('اكتب مكان الحلقة');
    return m;
  }
  function badRange() {
    var ds = orderedDays();
    for (var i = 0; i < ds.length; i++) {
      var t = timeOf(ds[i]);
      if (t.start != null && t.end != null && t.end <= t.start) {
        return 'الانتهاء قبل البدء' + (ed.same ? '' : ' يوم ' + dayName(ds[i]));
      }
    }
    return null;
  }

  function timeInput(field, day, value) {
    return '<label class="sc-time-field"><span>' + (field === 'start' ? 'البدء' : 'الانتهاء') + '</span>' +
      '<input type="time" dir="ltr" data-tf="' + field + '"' + (day ? ' data-day="' + day + '"' : '') +
      ' value="' + (value == null ? '' : hhmm(value)) + '"' + (ed.saving ? ' disabled' : '') + '></label>';
  }

  function editHtml() {
    var h = '';
    if (once()) h += note('amber', 'fa-circle-info', 'يُدخَل الموعد مرّةً واحدة، وتعديله بعد ذلك من إدارة المركز.');
    h += '<div class="sc-sec"><div class="sc-sec-title">أيام الحلقة</div><div class="sc-wrap">' +
      WEEK.map(function (d) {
        return '<button type="button" class="sc-daypick' + (hasDay(d) ? ' on' : '') + '" data-act="day" data-day="' + d + '"' +
          (ed.saving ? ' disabled' : '') + '>' + (hasDay(d) ? '<i class="fas fa-check"></i> ' : '') + dayName(d) + '</button>';
      }).join('') + '</div></div>';

    h += '<div class="sc-sec"><div class="sc-sec-title">الساعة</div><div class="sc-hint">بتوقيت غزة.</div>' +
      '<label class="sc-switch"><input type="checkbox" data-act="same"' + (ed.same ? ' checked' : '') + (ed.saving ? ' disabled' : '') + '>' +
      '<span><b>الساعة نفسها في كل الأيام</b><small>أطفئه إن اختلفت الساعة من يومٍ لآخر</small></span></label>';
    if (ed.same) {
      h += '<div class="sc-wrap">' + timeInput('start', 0, ed.start) + timeInput('end', 0, ed.end) + '</div>';
    } else if (!orderedDays().length) {
      h += '<div class="sc-muted">اختر الأيام أوّلًا.</div>';
    } else {
      orderedDays().forEach(function (d) {
        var t = timeOf(d);
        h += '<div class="sc-line sc-perday"><span class="sc-daychip sc-fixed">' + dayName(d) + '</span><span class="sc-wrap">' +
          timeInput('start', d, t.start) + timeInput('end', d, t.end) + '</span></div>';
      });
    }
    h += '</div>';

    h += '<div class="sc-sec"><div class="sc-sec-title">مكان الحلقة</div>' +
      '<div class="sc-hint">بالتفصيل: المسجد أو المبنى، والحيّ والشارع، والقاعة أو الطابق.</div>' +
      '<textarea id="scPlace" rows="3" maxlength="1000"' + (ed.saving ? ' disabled' : '') +
      ' placeholder="مثال: مسجد الهدى — حيّ الرمال، شارع الوحدة، الطابق الثاني، القاعة الشرقية">' + esc(ed.place) + '</textarea></div>';
    h += '<div id="scEditFoot"></div>';
    return h;
  }

  /** ما ينقص والخطأ وزرّ الحفظ — دون إعادة رسم الحقول (يبقى المؤشّر في المكان) */
  function refreshEditFooter() {
    var f = document.getElementById('scEditFoot');
    if (!f || !ed) return;
    var missing = missingList();
    f.innerHTML = (missing.length ? note('calm', 'fa-list-check', 'لإكمال الموعد: ' + missing.join(' · ')) : '') +
      (ed.error ? note('rose', 'fa-circle-exclamation', ed.error) : '') +
      '<button type="button" class="sc-btn sc-wide" data-act="save"' + (ed.saving || missing.length ? ' disabled' : '') + '>' +
      (ed.saving ? '<i class="fas fa-spinner fa-spin"></i>' : '<i class="fas fa-floppy-disk"></i>') + ' احفظ الموعد</button>';
  }

  async function save() {
    var bad = badRange();
    if (missingList().length || bad) { ed.error = bad || ''; refreshEditFooter(); return; }
    if (once()) {
      var ok = await showConfirm({
        title: 'حفظ موعد الحلقة', icon: '🕓',
        message: 'يُحفظ الموعد مرّةً واحدة، وتعديله بعد ذلك من إدارة المركز. راجع الأيام والساعات والمكان قبل الحفظ.',
        confirmText: 'احفظ', cancelText: 'أراجع'
      });
      if (!ok) return;
    }
    ed.saving = true; ed.error = '';
    render();
    var slots = orderedDays().map(function (d) {
      var t = timeOf(d);
      return d + '@' + hhmm(t.start) + '-' + hhmm(t.end);   // «7@16:00-18:00»
    }).join(',');
    var r = await call({ action: 'SAVE', circle_no: ed.circle.circleNo, place: ed.place.trim(), slots: slots });
    if (r.ok) {
      toast(r.message);
      ed = null; ui.view = 'main';
      load();
      return;
    }
    ed.saving = false;
    ed.error = r.offline ? 'حفظ الموعد يلزمه اتصال — ' + r.message : r.message;
    render();
  }

  /* ---------- الأفعال ---------- */
  function circleBy(no) {
    return (page ? page.circles : []).filter(function (c) { return c.circleNo === no; })[0] || null;
  }

  /** ⏱ وصولي أو انصرافي — الوقت من الخادم، فلا يُسجَّل دون اتصال */
  async function check(c, arrive) {
    var ok = await showConfirm({
      title: arrive ? 'تسجيل الوصول' : 'تسجيل الانصراف', icon: '⏱',
      message: (arrive ? 'وصولك' : 'انصرافك') + ' إلى «' + c.circleName + '» الآن، بساعة غزة. لا يُعدَّل بعد تسجيله.',
      confirmText: arrive ? 'وصلتُ' : 'انصرفتُ'
    });
    if (!ok) return;
    var r = await call({ action: arrive ? 'CHECK_IN' : 'CHECK_OUT', circle_no: c.circleNo });
    toast(r.offline ? 'تسجيل الوصول والانصراف يلزمه اتصال — الوقت من الخادم' : r.message);
    if (r.ok) load();
  }

  async function clearSchedule(c) {
    var ok = await showConfirm({
      title: 'محو موعد الحلقة', danger: true,
      message: 'يُمحى موعد «' + c.circleName + '» ومكانها، ويعود معلّمها يُدخله من جديد مرّةً واحدة.',
      confirmText: 'امحُ'
    });
    if (!ok) return;
    var r = await call({ action: 'CLEAR', circle_no: c.circleNo });
    toast(r.message);
    if (r.ok) load();
  }

  /** من جدول الأسبوع: بطاقة الحلقة في نافذة */
  function openCircle(c) {
    var ov = document.getElementById('schedCircleModal');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'schedCircleModal';
      ov.className = 'modal-overlay';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      ov.addEventListener('click', function (e) {
        if (e.target === ov) { ov.style.display = 'none'; return; }
        var b = e.target.closest && e.target.closest('[data-act]');
        if (!b) return;
        ov.style.display = 'none';
        if (b.dataset.act !== 'dismiss') act(b);
      });
      document.body.appendChild(ov);
    }
    ov.innerHTML = '<div class="modal-box sc-modal">' + cardHtml(c, true) +
      '<div class="modal-actions"><button type="button" class="modal-btn modal-cancel" data-act="dismiss">إغلاق</button></div></div>';
    ov.style.display = 'flex';
  }

  function act(b) {
    var a = b.dataset.act;
    var c = b.dataset.c ? circleBy(parseInt(b.dataset.c, 10)) : null;
    switch (a) {
      case 'close': return closeCircleSchedule();
      case 'back': ed = null; ui.view = 'main'; return render();
      case 'reload': return load();
      case 'pdf': return exportPdf();
      case 'tab': ui.tab = b.dataset.tab; return render();
      case 'open': return c && openCircle(c);
      case 'edit': return c && startEdit(c);
      case 'clear': return c && clearSchedule(c);
      case 'checkin': return c && check(c, true);
      case 'checkout': return c && check(c, false);
      case 'save': return save();
      case 'day': {
        var d = parseInt(b.dataset.day, 10);
        if (hasDay(d)) ed.days = ed.days.filter(function (x) { return x !== d; });
        else ed.days.push(d);
        ed.error = '';
        return render();
      }
    }
  }

  function onClick(e) {
    var b = e.target.closest && e.target.closest('button[data-act]');
    if (b && !b.disabled) act(b);
  }

  function onChange(e) {
    var t = e.target;
    if (!ed) return;
    if (t.dataset.act === 'same') {
      ed.same = t.checked; ed.error = '';
      // الانتقال إلى «لكل يومٍ ساعته» يبدأ بالموحّدة
      if (!ed.same) ed.days.forEach(function (d) { if (!ed.perDay[d]) ed.perDay[d] = { start: ed.start, end: ed.end }; });
      render();
    } else if (t.dataset.tf) {
      var m = parseHm(t.value);
      var d = parseInt(t.dataset.day || '0', 10);
      if (!d) ed[t.dataset.tf] = m;
      else {
        var cur = timeOf(d);
        ed.perDay[d] = { start: cur.start, end: cur.end };
        ed.perDay[d][t.dataset.tf] = m;
      }
      ed.error = '';
      refreshEditFooter();
    }
  }

  function onInput(e) {
    if (ed && e.target.id === 'scPlace') { ed.place = e.target.value; ed.error = ''; refreshEditFooter(); }
  }

  /* ---------- 🖨 PDF: مواعيد حلقاتي ---------- */
  function pdfHtml(circles) {
    var today = page.cachedAt ? null : page.gazaDay;
    var now = gazaNowLive(page);
    var missing = circles.filter(function (c) { return !c.hasSchedule; }).length;
    var info = [circles.length + ' حلقة'];
    if (missing) info.push('لم يُسجَّل موعدها: ' + missing);
    info.push('الساعات بتوقيت غزة');
    if (now) info.push('أُعدّ: ' + dayName(dayOf(now)) + ' ' + ymd(now) + ' ' + hhmm(now.getHours() * 60 + now.getMinutes()));
    var th = function (d) { return d === today ? ' class="t"' : ''; };
    var rows = circles.map(function (c) {
      return '<tr><td class="n">' + esc(c.circleName) + '</td><td class="tc">' + esc(c.teacherNames) + '</td>' +
        WEEK.map(function (d) { var s = slotOn(c, d); return '<td dir="ltr"' + th(d) + '>' + (s ? range(s) : '') + '</td>'; }).join('') +
        (c.hasSchedule ? '<td class="p">' + esc(c.place || '') + '</td>' : '<td class="m">لم يُسجَّل موعدها</td>') + '</tr>';
    }).join('');
    return '<div class="scp" dir="rtl"><style>' +
      '.scp{font-family:inherit;color:#0f172a;width:1040px;padding:4px}' +
      '.scp h1{font-size:20px;margin:0 0 4px}.scp .i{font-size:12px;color:#64748b;margin-bottom:10px}' +
      '.scp table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px}' +
      '.scp th,.scp td{border:1px solid #cbd5e1;padding:6px 4px;text-align:center;vertical-align:middle;word-wrap:break-word}' +
      '.scp th{background:#e2e8f0}.scp .t{background:#e0f2fe}.scp td.p{text-align:right;font-size:11px}' +
      '.scp td.m{color:#64748b}.scp td.tc{font-size:11px}.scp tr{page-break-inside:avoid}' +
      '</style><h1>مواعيد حلقاتي</h1><div class="i">' + esc(info.join(' · ')) + '</div>' +
      '<table><colgroup><col style="width:13%"><col style="width:13%">' + WEEK.map(function () { return '<col style="width:7.3%">'; }).join('') +
      '<col style="width:22.9%"></colgroup><thead><tr><th>الحلقة</th><th>المعلّم</th>' +
      WEEK.map(function (d) { return '<th' + th(d) + '>' + dayName(d) + '</th>'; }).join('') +
      '<th>المكان</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function deliver(blob, name) {
    if (typeof crDeliverFile === 'function') return crDeliverFile(blob, name, 'application/pdf');
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.parentNode.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  async function exportPdf() {
    if (!page || !page.circles.length || ui.exporting) return;
    if (typeof ensurePdfLibrary === 'function' && !await ensurePdfLibrary()) return;
    ui.exporting = true; render();
    try {
      var blob = await html2pdf().set({
        margin: [0.6, 0.6, 0.8, 0.6],
        filename: 'مواعيد_حلقاتي.pdf',
        image: { type: 'jpeg', quality: 0.92 },
        html2canvas: { scale: 2, backgroundColor: '#ffffff',
                       onclone: window.QmcAppearance && QmcAppearance.lightClone },   // 🌙 فاتحٌ دائمًا
        jsPDF: { unit: 'cm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['css', 'legacy'], avoid: 'tr' }
      }).from(pdfHtml(page.circles), 'string').outputPdf('blob');
      deliver(blob, 'مواعيد_حلقاتي.pdf');
    } catch (err) {
      if (typeof showAlert === 'function') showAlert({ title: 'تعذّر إعداد الملف', message: (err && err.message) || 'خطأ غير معروف', icon: '⚠️' });
    } finally {
      ui.exporting = false; render();
    }
  }

  /* ---------- الفتح والإغلاق ---------- */
  function openCircleSchedule() {
    ui.view = 'main'; ed = null;
    ensureScreen().style.display = 'flex';
    document.body.classList.add('sc-open');
    load();
  }

  function closeCircleSchedule() {
    var el = document.getElementById('schedScreen');
    if (el) el.style.display = 'none';
    document.body.classList.remove('sc-open');
    ed = null; ui.view = 'main';
  }

  document.addEventListener('keydown', function (e) {
    var el = document.getElementById('schedScreen');
    if (e.key !== 'Escape' || !el || el.style.display === 'none') return;
    if (document.querySelector('.modal-overlay[style*="flex"]')) return;   // نافذةٌ فوقها تُغلق أوّلًا
    if (ui.view === 'edit') { ed = null; ui.view = 'main'; render(); } else closeCircleSchedule();
  });

  var CSS =
    '#schedScreen{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2000;background:var(--bg,#f8f9fa);flex-direction:column}' +
    'body.sc-open{overflow:hidden}' +
    '.sc-bar{display:flex;align-items:center;gap:6px;padding:10px 12px;padding-top:calc(10px + env(safe-area-inset-top));background:#fff;border-bottom:1px solid #e2e8f0}' +
    '.sc-title{flex:1;font-size:18px;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.sc-icon{background:transparent;color:#334155;width:40px;height:40px;border-radius:50%;padding:0;font-size:18px;flex-shrink:0}' +
    '.sc-icon:disabled{opacity:.45}' +
    '.sc-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 12px calc(24px + env(safe-area-inset-bottom));max-width:760px;width:100%;margin:0 auto;box-sizing:border-box}' +
    '.sc-center{text-align:center;color:#475569;padding:40px 16px;display:flex;flex-direction:column;align-items:center;gap:12px;font-size:15px}' +
    '.sc-big{font-size:38px;color:#94a3b8}' +
    '.sc-note{display:flex;gap:8px;align-items:flex-start;border-radius:12px;padding:10px;margin-bottom:8px;font-size:14px;line-height:1.6;border:1px solid}' +
    '.sc-note i{margin-top:4px;font-size:13px}' +
    '.sc-calm{background:#f1f5f9;color:#475569;border-color:#47556940}' +
    '.sc-amber{background:#fffbeb;color:#92400e;border-color:#92400e40}' +
    '.sc-rose{background:#fff1f2;color:#9f1239;border-color:#9f123940}' +
    '.sc-green{background:#ecfdf5;color:#065f46;border-color:#065f4640}' +
    '.sc-chip{display:inline-block;border-radius:20px;padding:3px 9px;font-size:12.5px;border:none}' +
    '.sc-wrap{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center}' +
    '.sc-btn{display:inline-flex;align-items:center;gap:6px;background:var(--primary);color:#fff;border-radius:22px;padding:9px 16px;font-size:14px;font-weight:600}' +
    '.sc-btn:disabled{opacity:.5}' +
    '.sc-outline{background:#fff;color:var(--primary);border:1px solid var(--primary-line,#c6dafc)}' +
    '.sc-wide{width:100%;justify-content:center;padding:12px;margin-top:4px}' +
    '.sc-link{background:transparent;color:#9f1239;padding:6px 4px;font-size:13px}' +
    '.sc-today{background:#fff;border:1.4px solid var(--primary);border-radius:12px;padding:12px;margin-bottom:12px}' +
    '.sc-today-head{font-weight:700;font-size:15px}.sc-today-head i{color:var(--primary)}' +
    '.sc-today-row{border-top:1px solid #e2e8f0;margin-top:10px;padding-top:10px}' +
    '.sc-row-top{display:flex;justify-content:space-between;gap:8px;margin-bottom:6px;font-size:14px}' +
    '.sc-time{font-weight:600;font-size:14px;color:#0f172a}' +
    '.sc-tabs{display:flex;gap:6px;background:#e2e8f0;border-radius:12px;padding:4px;margin-bottom:10px}' +
    '.sc-tabs button{flex:1;background:transparent;color:#475569;border-radius:9px;padding:8px;font-size:14px}' +
    '.sc-tabs button.on{background:#fff;color:var(--primary-dark,#0d47a1);font-weight:700;box-shadow:0 1px 3px #0002}' +
    '.sc-day{background:#fff;border:1px solid #cbd5e1;border-radius:12px;margin-bottom:10px;overflow:hidden}' +
    '.sc-day.today{border:1.6px solid var(--primary)}' +
    '.sc-day-head{display:flex;align-items:center;gap:8px;padding:10px 12px 6px;font-size:16px}' +
    '.sc-badge{background:var(--primary-wash,#e8f0fe);color:var(--primary-dark,#0d47a1);border-radius:20px;padding:2px 8px;font-size:12px}' +
    '.sc-count{margin-inline-start:auto;font-size:13px;color:#475569}' +
    '.sc-day-row{display:flex;justify-content:flex-start;gap:10px;align-items:flex-start;width:100%;text-align:right;background:transparent;color:inherit;border-top:.5px solid #cbd5e1;border-radius:0;padding:8px 12px;font-weight:400}' +
    '.sc-time-box{background:#f1f5f9;border-radius:8px;padding:4px 0;width:96px;flex-shrink:0;text-align:center}' +
    '.sc-day-info{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;font-size:13px}.sc-day-info b{font-size:14px}' +
    '.sc-day-info .sc-wrap{margin-top:4px}' +
    '.sc-ellipsis{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.sc-muted{color:#475569}.sc-small{font-size:12px;margin-top:8px}' +
    '.sc-card{background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:14px;margin-bottom:10px}' +
    '.sc-card-name{font-size:16px;font-weight:700;color:#0f172a}' +
    '.sc-card-teachers{font-size:14px;margin:2px 0 10px}' +
    '.sc-card-flat .sc-card-teachers{margin-bottom:10px}' +
    '.sc-line{display:flex;align-items:center;gap:8px;margin-top:6px}' +
    '.sc-place{align-items:flex-start;margin-top:10px;font-size:14px}.sc-place i{color:var(--primary);margin-top:4px}' +
    '.sc-daychip{background:var(--primary-wash,#e8f0fe);color:var(--primary-dark,#0d47a1);border-radius:20px;padding:3px 10px;font-size:13px;text-align:center}' +
    '.sc-fixed{width:84px;flex-shrink:0;box-sizing:border-box}' +
    '.sc-actions{display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap;gap:8px;margin-top:10px}' +
    '.sc-modal{text-align:right;max-width:460px}' +
    '.sc-sec{margin-bottom:18px}.sc-sec-title{font-size:15px;font-weight:700;margin-bottom:2px}' +
    '.sc-hint{font-size:13px;color:#475569;margin-bottom:8px}' +
    '.sc-daypick{background:#fff;color:#334155;border:1px solid #cbd5e1;border-radius:20px;padding:7px 14px;font-size:14px;font-weight:400}' +
    '.sc-daypick.on{background:var(--primary-wash,#e8f0fe);color:var(--primary-dark,#0d47a1);border-color:var(--primary)}' +
    '.sc-switch{display:flex;gap:10px;align-items:flex-start;margin:6px 0 10px;cursor:pointer}' +
    '.sc-switch input{width:20px;height:20px;margin-top:3px;accent-color:var(--primary);flex-shrink:0}' +
    '.sc-switch span{display:flex;flex-direction:column}.sc-switch small{color:#475569;font-size:12.5px;font-weight:400}' +
    '.sc-time-field{display:inline-flex;align-items:center;gap:6px;font-size:14px}' +
    '.sc-time-field input{width:auto;min-width:110px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;font-size:15px;background:#fff}' +
    '.sc-perday{margin-bottom:8px}' +
    '#scPlace{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font-size:15px;font-family:inherit;resize:vertical}' +
    '.sched-open-btn{margin-inline-start:auto;display:inline-flex;align-items:center;gap:6px;background:var(--primary-wash,#e8f0fe);color:var(--primary-dark,#0d47a1);border-radius:20px;padding:7px 12px;font-size:13.5px;font-weight:600;white-space:nowrap}';
  (function injectCss() {
    var s = document.createElement('style');
    s.id = 'scheduleStyle';
    s.textContent = CSS;
    document.head.appendChild(s);
  })();

  window.openCircleSchedule = openCircleSchedule;
  window.closeCircleSchedule = closeCircleSchedule;
})();
