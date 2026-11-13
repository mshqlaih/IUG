/* 🧑‍🏫 يوم المحفّظ (2026-11-13) — نظير lib/widgets/teacher_day_card.dart
 * و lib/models/teacher_day.dart و TeacherDayService في أندرويد.
 *
 * النقطة (QMC_TEACHER_DAY_PKG — docs/teacher_day/ و docs/teacher_excuse/):
 *   GET  org/teacher-day?work_date=&what=&circle_no=   ⇒ mine · subs · manage
 *   GET  org/teacher-day?work_date=YYYY-MM-DD&what=colleagues&circle_no=N ⇒ items
 *   POST org/teacher-day {action: SELF_ABSENT · SELF_CANCEL, work_date, sub_id_no,
 *                         sub_name, no_session, notes, …}  — كل المفاتيح دائمًا (الغائب ⇒ 555)
 *
 * في الرئيسية (تحت «مواعيدي»):
 *  · 🔁 «نيابةً اليوم»: حلقةٌ كُلّفتُ بها بديلًا — اللمس يفتح النشاط.
 *  · 👤 «حلقاتي اليوم» + «لن أحضر» (اليوم أو الأيام السبعة القادمة) والتراجع.
 *  · 🧑‍💼 «المحفّظون اليوم» لمن يدير الحلقات — خلاصةٌ قراءةً (الإدارة في أندرويد).
 * وفي تبويب النشاط شريط «نيابةً: …» ما دام التكليف ساريًا.
 * نسخة الجهاز localStorage `teacher_day:<user>` تُعرض دون اتصال (والإرسال يلزمه اتصال).
 */
(function () {
  'use strict';

  var state = { user: null, data: null, at: 0, cached: false, busy: false, loading: null };
  var fetchedSubs = {};   // حلقات إنابةٍ طُلب تنزيلها في هذا التشغيل

  // ── أدوات ──
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function str(v) { var t = v == null ? '' : String(v).trim(); return (t === '' || t === 'null') ? null : t; }
  function int(v) { var n = parseInt(v, 10); return isNaN(n) ? null : n; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDay(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function diffDays(a, b) {
    return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
  }
  function user() {
    try { return typeof getCurrentUser === 'function' ? String(getCurrentUser() || '') : String(localStorage.getItem('user_name') || ''); }
    catch (_) { return ''; }
  }
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function toast(m) { if (typeof showToast === 'function') showToast(m); }

  /* «4:30 عصرًا» (ApptClock.clock) */
  function clockOf(min) {
    if (min == null) return null;
    var h = Math.floor(min / 60) % 24;
    var per = h < 4 ? 'ليلًا' : h < 12 ? 'صباحًا' : h < 15 ? 'ظهرًا' : h < 18 ? 'عصرًا' : 'مساءً';
    return (h % 12 === 0 ? 12 : h % 12) + ':' + pad(min % 60) + ' ' + per;
  }

  var WEEK_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  /* «اليوم» · «غدًا» · «الأحد 15/11» (dayWord) */
  function dayWord(d, today) {
    var n = diffDays(today, d);
    if (n === 0) return 'اليوم';
    if (n === 1) return 'غدًا';
    if (n === -1) return 'أمس';
    return WEEK_NAMES[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
  }
  function yn(v) { return v === 'Y' ? true : (v === 'N' ? false : null); }

  // ── النموذج (TeacherDay.fromJson) ──
  function parse(j) {
    var now = new Date();
    var today = parseDay(j.today) || new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var mine = (Array.isArray(j.mine) ? j.mine : []).map(function (m) {
      return {
        date: parseDay(m.date) || new Date(2000, 0, 1),
        circleNo: int(m.circle_no) || 0,
        circleName: str(m.circle_name) || ('حلقة ' + m.circle_no),
        startMin: int(m.start_min),
        offName: str(m.off_name),
        absent: m.absent === 'Y',
        absentSelf: m.absent_self === 'Y',
        checkedIn: m.checked_in === 'Y',
        proposedName: str(m.proposed_name),
        subName: str(m.sub_name),
        excused: yn(m.excused),
        subExt: str(m.sub_ext),
        noSession: m.no_session === 'Y'
      };
    });
    var subs = (Array.isArray(j.subs) ? j.subs : []).map(function (s) {
      var d = parseDay(s.date) || new Date(2000, 0, 1);
      var u = parseDay(s.until);
      if (!u) { u = new Date(d); u.setDate(u.getDate() + 3); }
      return {
        date: d, until: u,
        circleNo: int(s.circle_no) || 0,
        circleName: str(s.circle_name) || ('حلقة ' + s.circle_no),
        absentName: str(s.absent_name)
      };
    });
    var manage = null;
    if (j.manage && typeof j.manage === 'object') {
      manage = {
        off: int(j.manage.off) || 0,
        circles: (Array.isArray(j.manage.circles) ? j.manage.circles : []).map(function (c) {
          return {
            circleName: str(c.circle_name) || ('حلقة ' + c.circle_no),
            startMin: int(c.start_min),
            covered: c.sub_id_no != null || !!str(c.sub_ext) || c.no_session === 'Y',
            teachers: (Array.isArray(c.teachers) ? c.teachers : []).map(function (t) {
              return { name: str(t.name) || String(t.id_no || ''), status: str(t.status) || '', self: t.self === 'Y' };
            })
          };
        })
      };
    }
    return {
      today: today,
      nowMin: int(j.now_min) != null ? int(j.now_min) : now.getHours() * 60 + now.getMinutes(),
      mine: mine, subs: subs, manage: manage
    };
  }

  function coverText(m) {
    return m.subName ? 'البديل ' + m.subName
      : m.subExt ? 'تتابعها ' + m.subExt
        : m.noSession ? 'لا تنعقد'
          : m.proposedName ? 'اقترحتَ ' + m.proposedName : null;
  }
  function uniqDays(list) {
    var seen = {}, out = [];
    list.forEach(function (d) { var k = ymd(d); if (!seen[k]) { seen[k] = 1; out.push(d); } });
    return out.sort(function (a, b) { return a - b; });
  }
  function myToday(d) { return d.mine.filter(function (m) { return diffDays(d.today, m.date) === 0; }); }
  function myDays(d) { return uniqDays(d.mine.filter(function (m) { return !m.offName; }).map(function (m) { return m.date; })); }
  function myAbsentDays(d) { return uniqDays(d.mine.filter(function (m) { return m.absent; }).map(function (m) { return m.date; })); }
  function activeSubs(d) {
    if (!d) return [];
    return d.subs.filter(function (s) { return diffDays(s.date, d.today) >= 0 && diffDays(d.today, s.until) >= 0; });
  }

  // ── الشبكة ──
  async function call(query, body) {
    try {
      var path = 'org/teacher-day' + (query ? '?' + query : '');
      var r = await QMC.apiFetch(path, body ? { method: 'POST', body: body, timeoutMs: 30000 } : { timeoutMs: 25000 });
      var j = await r.json().catch(function () { return {}; });
      j = (j && typeof j === 'object') ? j : {};
      var msg = j.message != null ? String(j.message)
        : (r.status === 404 ? 'الخدمة لم تُفعَّل على الخادم بعد' : 'تعذّر إتمام الطلب (رمز ' + r.status + ')');
      return { ok: j.status === 'success', message: msg, data: j, offline: false };
    } catch (_) {
      return { ok: false, message: 'تعذّر الاتصال بالخادم — تحقّق من الإنترنت وأعد المحاولة', data: {}, offline: true };
    }
  }

  function syncUser() {
    var u = user();
    if (u === state.user) return u;
    state.user = u;
    state.data = null; state.at = 0; state.cached = false;
    var c = u ? lsGet('teacher_day:' + u) : null;
    if (c && c.data) { state.data = parse(c.data); state.at = c.at || 0; state.cached = true; }
    return u;
  }

  /* يجلب يوم اليوم — صامتٌ عند الفشل (تبقى نسخة الجهاز) */
  function refresh() {
    var u = syncUser();
    if (!u || !window.QMC) return Promise.resolve();
    if (state.loading) return state.loading;
    state.loading = (async function () {
      var r = await call('work_date=&what=&circle_no=');
      if (r.ok && user() === u) {
        state.data = parse(r.data);
        state.at = Date.now();
        state.cached = false;
        lsSet('teacher_day:' + u, { at: state.at, data: r.data });
        ensureSubCircles();
      } else if (r.offline) {
        state.cached = !!state.data;
      }
    })().finally(function () { state.loading = null; repaint(); });
    return state.loading;
  }

  /* كُلّف بحلقةٍ لم تنزل إلى الجهاز ⇒ تُجلب الحلقات والطلاب مرّةً (_ensureSubCircles) */
  async function ensureSubCircles() {
    var subs = activeSubs(state.data);
    if (!subs.length || typeof getCirclesFromDb !== 'function') return;
    var have = {};
    try {
      (await getCirclesFromDb()).forEach(function (c) {
        var r = String(c.empRole || '').trim().toUpperCase();
        if (r === 'M' || r === 'A' || r === 'S') have[Number(c.circleNo)] = true;
      });
    } catch (_) { return; }
    var missing = subs.filter(function (s) {
      var k = s.circleNo + '_' + ymd(s.date);
      return !have[s.circleNo] && !fetchedSubs[k];
    });
    if (!missing.length) return;
    missing.forEach(function (s) { fetchedSubs[s.circleNo + '_' + ymd(s.date)] = true; });
    try {
      if (typeof fetchAndStoreCircles === 'function') await fetchAndStoreCircles();
      if (typeof pullRecordsFromServer === 'function') await pullRecordsFromServer();
    } catch (e) { console.warn('تعذّر تنزيل حلقة الإنابة:', e); }
    paintActivity();
  }

  // ── الرسم في الرئيسية ──
  function frame(color, icon, title, body, act) {
    return '<div class="td-card' + (act ? ' td-tap' : '') + '"' + (act ? ' data-td="' + act + '" role="button" tabindex="0"' : '') + '>' +
      '<div class="td-ic" style="color:' + color + ';background:' + color + '1a"><i class="fas ' + icon + '"></i></div>' +
      '<div class="td-b"><div class="td-h" style="color:' + color + '">' + esc(title) + '</div>' + body + '</div>' +
      (act ? '<i class="fas fa-chevron-left td-chev"></i>' : '') + '</div>';
  }

  function subTile(d, s) {
    return frame('#B45309', 'fa-right-left', 'نيابةً ' + dayWord(s.date, d.today),
      '<div class="td-line">' + esc('حلقة ' + s.circleName + (s.absentName ? ' عن ' + s.absentName : '') +
        ' — أدخل نشاطها من تبويب النشاط حتى ' + s.until.getDate() + '/' + (s.until.getMonth() + 1)) + '</div>',
      'activity');
  }

  function mineTile(d) {
    var today = myToday(d);
    var upcoming = myAbsentDays(d).filter(function (x) { return diffDays(d.today, x) !== 0; });
    var h = '';
    if (!today.length) h += '<div class="td-line td-muted">لا حلقة لك اليوم</div>';
    today.forEach(function (m) {
      var t = clockOf(m.startMin), st, col;
      if (m.offName) { st = m.offName; col = '#616161'; }
      else if (m.absent) {
        var cv = coverText(m);
        st = (m.absentSelf ? 'أبلغتَ بغيابك'
          : m.excused === true ? 'سجّلتك الإدارة غائبًا بإذن' : 'سجّلتك الإدارة غائبًا بدون إذن') + (cv ? ' · ' + cv : '');
        col = '#C62828';
      } else if (m.checkedIn) { st = 'سجّلتَ وصولك'; col = '#2E7D32'; }
      else { st = t ? 'الساعة ' + t : 'اليوم'; col = '#6b7280'; }
      h += '<div class="td-line"><b>' + esc(m.circleName) + '</b> <span style="color:' + col + '">· ' + esc(st) + '</span></div>';
    });
    if (upcoming.length) {
      h += '<div class="td-line td-red">أبلغتَ بغيابك: ' + esc(upcoming.map(function (x) { return dayWord(x, d.today); }).join('، ')) + '</div>';
    }
    var cancel = [];
    if (today.some(function (m) { return m.absent && m.absentSelf; })) cancel.push(d.today);
    upcoming.forEach(function (x) {
      if (d.mine.some(function (m) { return diffDays(m.date, x) === 0 && m.absentSelf; })) cancel.push(x);
    });
    var off = state.busy || state.cached || !navigator.onLine;
    h += '<div class="td-acts"><button type="button" class="td-absent" data-td="absent"' + (off ? ' disabled' : '') + '>' +
      '<i class="fas fa-calendar-xmark"></i> لن أحضر</button>';
    cancel.forEach(function (x) {
      h += '<button type="button" class="td-undo" data-td="cancel" data-date="' + ymd(x) + '"' + (off ? ' disabled' : '') + '>' +
        '<i class="fas fa-rotate-left"></i> سأحضر ' + esc(dayWord(x, d.today)) + '</button>';
    });
    h += '</div>';
    if (state.cached) h += '<div class="td-line td-muted" style="font-size:12px">نسخة الجهاز — الإبلاغ يحتاج اتصالًا</div>';
    return frame('#303F9F', 'fa-calendar-check', 'حلقاتي اليوم', h, null);
  }

  function manageTile(d) {
    var m = d.manage;
    var body;
    if (!m.circles.length) {
      body = '<div class="td-line td-muted">' + (m.off > 0 ? 'لا حلقات اليوم — ' + m.off + ' في إجازة' : 'لا حلقات اليوم') + '</div>';
    } else {
      var all = [], present = 0, absent = 0, unknown = 0, self = {}, noSub = [];
      m.circles.forEach(function (c) {
        var started = !(c.startMin != null && d.nowMin < c.startMin);
        c.teachers.forEach(function (t) {
          all.push(t);
          if (t.status === 'IN' || t.status === 'ENTERED' || t.status === 'PRESENT') present++;
          else if (t.status === 'ABSENT') { absent++; if (t.self) self[t.name] = 1; }
          else if (started) unknown++;
        });
        if (c.teachers.length && c.teachers.every(function (t) { return t.status === 'ABSENT'; }) && !c.covered) noSub.push(c.circleName);
      });
      body = '<div class="td-line"><b>✅ ' + present + ' حاضر' + (absent ? ' · ⛔ ' + absent + ' غائب' : '') +
        (unknown ? ' · ❔ ' + unknown + ' لم يُعرف' : '') + '</b>  —  ' + m.circles.length + ' حلقة</div>';
      var selfN = Object.keys(self);
      if (selfN.length) body += '<div class="td-line td-red">أبلغ بغيابه: ' + esc(selfN.join('، ')) + '</div>';
      if (noSub.length) {
        body += '<div class="td-line td-red">🔴 بلا بديل: ' + esc(noSub.slice(0, 3).join('، ')) +
          (noSub.length > 3 ? ' و' + (noSub.length - 3) + ' غيرها' : '') + '</div>';
      }
      body += '<div class="td-line td-muted" style="font-size:12px">تسجيل الحضور وتعيين البديل من تطبيق أندرويد</div>';
    }
    return frame('#00695C', 'fa-users', 'المحفّظون اليوم', body, null);
  }

  function homeHtml() {
    syncUser();
    var d = state.data;
    if (!d) return '';
    var h = '';
    activeSubs(d).forEach(function (s) { h += subTile(d, s); });
    if (d.mine.length) h += mineTile(d);
    if (d.manage) h += manageTile(d);
    return h;
  }

  function paintHome() {
    var el = document.getElementById('whTday');
    if (!el) return;
    injectCss();
    var h = homeHtml();
    el.innerHTML = h;
    el.style.display = h ? '' : 'none';
    if (!el._bound) { el.addEventListener('click', onHomeClick); el._bound = true; }
  }

  /* شريط «نيابةً» في تبويب النشاط */
  function paintActivity() {
    var el = document.getElementById('subBanner');
    if (!el) return;
    syncUser();
    injectCss();
    var subs = activeSubs(state.data);
    if (!subs.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = subs.map(function (s) {
      return '<div class="td-sub"><i class="fas fa-right-left"></i><span>' + esc('نيابةً: حلقة ' + s.circleName +
        (s.absentName ? ' عن ' + s.absentName : '') + ' — يوم ' + s.date.getDate() + '/' + (s.date.getMonth() + 1) +
        '، والإدخال حتى ' + s.until.getDate() + '/' + (s.until.getMonth() + 1) +
        '. اختر تاريخ يوم الغياب، ويُوسَم ما تُدخله باسمك.') + '</span></div>';
    }).join('');
  }

  function repaint() { paintHome(); paintActivity(); }

  function onHomeClick(e) {
    var el = e.target.closest('[data-td]');
    if (!el || el.disabled) return;
    var act = el.dataset.td;
    var d = state.data;
    if (!d) return;
    if (act === 'activity') {
      var b = document.querySelector('.tab-btn[data-tab="activityTab"]');
      if (b && typeof openTab === 'function') openTab('activityTab', b);
    } else if (act === 'absent') openAbsent(d);
    else if (act === 'cancel') cancelAbsent(d, parseDay(el.dataset.date));
  }

  // ── الإرسال ──
  async function post(body) {
    state.busy = true; paintHome();
    var full = {
      action: body.action, work_date: body.work_date, circle_no: null, emp_no: null,
      sub_id_no: body.sub_id_no || null, mark_status: null,
      notes: body.notes || null, sub_name: body.sub_name || null, no_session: body.no_session ? 'Y' : null
    };
    var r = await call(null, full);
    state.busy = false;
    toast(r.message);
    if (r.ok) await refresh(); else paintHome();
    return r;
  }

  async function cancelAbsent(d, date) {
    if (!date) return;
    var ok = await showConfirm({
      title: 'ستحضر ' + dayWord(date, d.today) + '؟',
      message: 'يُلغى غيابك، ويصل إدارةَ المركز إشعارٌ بذلك، ويُلغى تكليف البديل إن عُيّن.',
      confirmText: 'نعم، سأحضر', icon: '↩️'
    });
    if (ok) await post({ action: 'SELF_CANCEL', work_date: ymd(date) });
  }

  // ── ورقة «لن أحضر» ──
  var COVERS = [['later', 'لم أقرّر بعد'], ['colleague', 'زميلٌ معلّم'], ['named', 'طالبة أو غيرها'], ['none', 'لا تنعقد']];

  function overlay(id, inner) {
    var old = document.getElementById(id);
    if (old) old.remove();
    var o = document.createElement('div');
    o.id = id;
    o.className = 'modal-overlay';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.style.display = 'flex';
    o.innerHTML = '<div class="modal-box td-box">' + inner + '</div>';
    o.addEventListener('click', function (ev) {
      if (ev.target === o || ev.target.closest('[data-close]')) o.remove();
    });
    document.body.appendChild(o);
    return o;
  }

  function openAbsent(d) {
    var absentSet = {};
    myAbsentDays(d).forEach(function (x) { absentSet[ymd(x)] = 1; });
    var days = myDays(d).filter(function (x) { return !absentSet[ymd(x)]; });
    if (!days.length) { toast('لا حلقة لك في الأيام السبعة القادمة لم تُبلغ عنها'); return; }
    var f = { date: days[0], cover: 'later', sub: null };

    var o = overlay('tdAbsentModal',
      '<h4 class="modal-title">لن أحضر</h4>' +
      '<p class="td-p">يُحسب غيابك بإذن لأنك أبلغتَ مسبقًا، ويصل إدارةَ المركز إشعار. ويمكنك التراجع ما لم ينقضِ اليوم.</p>' +
      '<div class="td-lbl">اليوم</div><div class="td-chips" id="tdDays"></div>' +
      '<div class="td-p td-muted" id="tdCircles"></div>' +
      '<label class="td-lbl" for="tdNotes">السبب (اختياريّ)</label>' +
      '<input type="text" id="tdNotes" class="td-in" maxlength="300" placeholder="مرض · سفر · ظرف طارئ…">' +
      '<div class="td-lbl">من يتابع حلقتك؟</div><div class="td-chips" id="tdCovers"></div>' +
      '<div id="tdCoverBox"></div>' +
      '<div class="modal-actions"><button type="button" class="modal-btn modal-cancel" data-close>إلغاء</button>' +
      '<button type="button" class="modal-btn modal-confirm td-send" id="tdSend"></button></div>');

    var nameVal = '';
    function circlesOf(date) {
      return d.mine.filter(function (m) { return diffDays(m.date, date) === 0 && !m.offName; });
    }
    function ready() {
      if (f.cover === 'colleague') return !!f.sub;
      if (f.cover === 'named') return nameVal.trim() !== '';
      return true;
    }
    function draw() {
      o.querySelector('#tdDays').innerHTML = days.map(function (x, i) {
        return '<button type="button" class="td-chip' + (diffDays(x, f.date) === 0 ? ' on' : '') + '" data-day="' + i + '">' +
          esc(dayWord(x, d.today)) + '</button>';
      }).join('');
      o.querySelector('#tdCircles').textContent = 'حلقاتك فيه: ' + circlesOf(f.date).map(function (c) {
        return c.circleName + (c.startMin != null ? ' (' + clockOf(c.startMin) + ')' : '');
      }).join('، ');
      o.querySelector('#tdCovers').innerHTML = COVERS.map(function (c) {
        return '<button type="button" class="td-chip' + (f.cover === c[0] ? ' on' : '') + '" data-cover="' + c[0] + '">' + esc(c[1]) + '</button>';
      }).join('');
      var box = o.querySelector('#tdCoverBox');
      if (f.cover === 'colleague') {
        box.innerHTML = '<div class="td-row"><span>' + esc(f.sub ? 'تقترح: ' + f.sub.name : 'اختر زميلًا — والمدير يعتمده أو يغيّره') + '</span>' +
          '<button type="button" class="td-pick" id="tdPick"><i class="fas fa-user-magnifying-glass"></i> ' + (f.sub ? 'غيّره' : 'اختر') + '</button></div>';
      } else if (f.cover === 'named') {
        box.innerHTML = '<label class="td-lbl" for="tdName">اسمها</label>' +
          '<input type="text" id="tdName" class="td-in" maxlength="100" placeholder="طالبة من الحلقة أو غيرها" value="' + esc(nameVal) + '">' +
          '<div class="td-p td-muted">تتابع الحلقة وتدوّن، وتُدخل أنت النشاط بعدُ</div>';
      } else if (f.cover === 'none') {
        box.innerHTML = '<div class="td-p td-muted">لا يأتي الطلاب ذلك اليوم، ولا يُعدّ يومًا فائتًا بلا إدخال.</div>';
      } else {
        box.innerHTML = '<div class="td-p td-muted">تعيّن الإدارة بديلًا.</div>';
      }
      var send = o.querySelector('#tdSend');
      send.innerHTML = '<i class="fas fa-paper-plane"></i> أبلغ بغيابي ' + esc(dayWord(f.date, d.today));
      send.disabled = !ready();
    }
    o.addEventListener('click', async function (ev) {
      var t = ev.target.closest('button');
      if (!t) return;
      if (t.dataset.day != null) { f.date = days[+t.dataset.day]; f.sub = null; draw(); }
      else if (t.dataset.cover) { f.cover = t.dataset.cover; draw(); }
      else if (t.id === 'tdPick') {
        var c = circlesOf(f.date)[0];
        if (!c) return;
        var col = await pickColleague(c.circleNo, f.date, 'اقترح زميلًا يحلّ محلّك ' + dayWord(f.date, d.today));
        if (col) { f.sub = col; draw(); }
      } else if (t.id === 'tdSend') {
        if (!ready()) return;
        t.disabled = true;
        var r = await post({
          action: 'SELF_ABSENT', work_date: ymd(f.date),
          notes: o.querySelector('#tdNotes').value.trim(),
          sub_id_no: f.cover === 'colleague' && f.sub ? f.sub.idNo : null,
          sub_name: f.cover === 'named' ? nameVal.trim() : null,
          no_session: f.cover === 'none'
        });
        if (r.ok) o.remove(); else t.disabled = false;
      }
    });
    o.addEventListener('input', function (ev) {
      if (ev.target.id === 'tdName') {
        nameVal = ev.target.value;
        o.querySelector('#tdSend').disabled = !ready();
      }
    });
    draw();
  }

  /* من يصلح بديلًا لهذه الحلقة في ذلك اليوم — يُرجع {idNo, name} أو null */
  function pickColleague(circleNo, date, title) {
    return new Promise(async function (resolve) {
      var r = await call('work_date=' + ymd(date) + '&what=colleagues&circle_no=' + circleNo);
      if (!r.ok) { toast(r.message); resolve(null); return; }
      var all = (Array.isArray(r.data.items) ? r.data.items : []).map(function (c) {
        return {
          idNo: int(c.id_no) || 0, name: str(c.name) || String(c.id_no || ''),
          centerName: str(c.center_name), sameCenter: c.same_center === 'Y',
          busy: c.busy === 'Y', absent: c.absent === 'Y', busyAt: int(c.busy_at)
        };
      });
      function hint(c) {
        if (c.absent) return 'غائبٌ ذلك اليوم';
        if (c.busy) { var t = clockOf(c.busyAt); return t ? 'له حلقةٌ الساعة ' + t : 'له حلقةٌ ذلك اليوم'; }
        return 'لا حلقة له ذلك اليوم';
      }
      var done = false;
      var o = overlay('tdColModal',
        '<h4 class="modal-title">' + esc(title) + '</h4>' +
        '<input type="search" id="tdColQ" class="td-in" placeholder="ابحث بالاسم">' +
        '<div class="td-cols" id="tdColList"></div>' +
        '<div class="modal-actions"><button type="button" class="modal-btn modal-cancel" data-close>إغلاق</button></div>');
      function norm(s) { return typeof normalizeAr === 'function' ? normalizeAr(String(s || '')) : String(s || ''); }
      function draw(q) {
        q = norm(q).trim();
        var list = q ? all.filter(function (c) { return norm(c.name).indexOf(q) !== -1; }) : all;
        o.querySelector('#tdColList').innerHTML = list.length ? list.map(function (c) {
          var i = all.indexOf(c);
          var icon = c.absent ? 'fa-circle-xmark' : c.busy ? 'fa-clock' : 'fa-user';
          var col = c.absent ? '#E57373' : c.busy ? '#F57C00' : '#2E7D32';
          return '<button type="button" class="td-col" data-i="' + i + '"' + (c.absent ? ' disabled' : '') + '>' +
            '<i class="fas ' + icon + '" style="color:' + col + '"></i><span><b>' + esc(c.name) + '</b><small>' +
            esc([hint(c)].concat(!c.sameCenter && c.centerName ? [c.centerName] : []).join(' · ')) + '</small></span></button>';
        }).join('') : '<div class="td-p td-muted" style="text-align:center;padding:16px">لا أحد بهذا الاسم</div>';
      }
      o.addEventListener('input', function (ev) { if (ev.target.id === 'tdColQ') draw(ev.target.value); });
      o.addEventListener('click', function (ev) {
        var b = ev.target.closest('.td-col');
        if (b && !b.disabled) { done = true; o.remove(); resolve(all[+b.dataset.i]); }
      });
      // الإغلاق بلا اختيار
      new MutationObserver(function (_, obs) {
        if (!document.body.contains(o)) { obs.disconnect(); if (!done) resolve(null); }
      }).observe(document.body, { childList: true });
      draw('');
    });
  }

  // ── الأنماط ──
  function injectCss() {
    if (document.getElementById('tdCss')) return;
    var st = document.createElement('style');
    st.id = 'tdCss';
    st.textContent =
      '#whTday{display:flex;flex-direction:column;gap:10px}' +
      '.td-card{display:flex;align-items:flex-start;gap:12px;padding:12px 12px 12px 8px;border-radius:14px;background:#fff;border:1px solid #e0e0e0}' +
      '.td-tap{cursor:pointer}' +
      '.td-ic{width:46px;height:46px;flex:0 0 46px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:21px}' +
      '.td-b{flex:1;min-width:0}' +
      '.td-h{font-size:13px;font-weight:700;margin-bottom:4px}' +
      '.td-line{font-size:13.5px;line-height:1.45;margin-bottom:2px}' +
      '.td-muted{color:#6b7280}.td-red{color:#C62828;font-size:12.5px}' +
      '.td-chev{color:#9e9e9e;align-self:center}' +
      '.td-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}' +
      '.td-absent{background:#fff;color:#C62828;border:1px solid #EF9A9A;border-radius:18px;padding:6px 12px;font:inherit;font-size:13.5px;cursor:pointer}' +
      '.td-undo{background:transparent;color:var(--primary);border:0;border-radius:18px;padding:6px 8px;font:inherit;font-size:13.5px;cursor:pointer}' +
      '.td-absent:disabled,.td-undo:disabled{opacity:.45;cursor:default}' +
      '.td-sub{display:flex;gap:8px;align-items:flex-start;padding:10px;margin-bottom:10px;border-radius:10px;background:#FFF8E1;color:#3E2723;font-size:13px;line-height:1.5;grid-column:1/-1}' +
      '.td-sub i{color:#B45309;margin-top:3px}' +
      '.td-box{text-align:start;max-height:88vh;overflow:auto;max-width:480px}' +
      '.td-box .modal-actions{margin-top:16px}' +
      '.td-p{font-size:13px;line-height:1.55;margin:4px 0 8px}' +
      '.td-lbl{display:block;font-weight:600;font-size:14px;margin:12px 0 6px}' +
      '.td-chips{display:flex;flex-wrap:wrap;gap:6px}' +
      '.td-chip{background:#fff;color:#334155;border:1px solid #cbd5e1;border-radius:18px;padding:7px 12px;font:inherit;font-size:13.5px;cursor:pointer}' +
      '.td-chip.on{background:var(--primary-wash,#e8f0fe);color:var(--primary-dark,#0d47a1);border-color:var(--primary);font-weight:600}' +
      '.td-in{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font:inherit;font-size:15px;margin-bottom:4px}' +
      '.td-row{display:flex;align-items:center;gap:8px;font-size:13.5px;margin-top:6px}.td-row span{flex:1}' +
      '.td-pick{background:var(--primary-wash,#e8f0fe);color:var(--primary-dark,#0d47a1);border:0;border-radius:18px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}' +
      '.td-send{background:#C62828!important}.td-send:disabled{opacity:.5}' +
      '.td-cols{max-height:55vh;overflow:auto;margin-top:8px}' +
      '.td-col{display:flex;gap:10px;align-items:center;width:100%;text-align:start;background:#fff;border:0;border-bottom:1px solid #f0f0f0;padding:10px 4px;font:inherit;cursor:pointer;color:inherit}' +
      '.td-col:disabled{opacity:.5;cursor:default}' +
      '.td-col span{display:flex;flex-direction:column}.td-col small{color:#6b7280;font-size:12px}';
    document.head.appendChild(st);
  }

  window.QmcTeacherDay = {
    refresh: refresh,
    paintHome: paintHome,
    paintActivity: paintActivity,
    homeHtml: homeHtml,
    /* تكليفي الساري لهذه الحلقة — لوسم «نيابةً عن …» */
    activeSubFor: function (circleNo) {
      return activeSubs(state.data).filter(function (s) { return s.circleNo === Number(circleNo); })[0] || null;
    }
  };
})();
