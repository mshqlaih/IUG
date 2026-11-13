/* 📝 حالات طلاب الحلقة وطلبات تغييرها (2026-11-13) — نظير
 * circle_status_screen.dart و student_status_dialog.dart (requestOnly)
 * و status_requests_screen.dart و status_suggest.dart في أندرويد.
 *
 * النقاط (QMC_ORG_PKG §31 — docs/status_requests/ و status_requests_all/):
 *   GET  org/students?circle_no=          ⇒ الطلاب وحالاتهم وحضورهم (att) وأيام الانعقاد
 *   GET  org/student/status-log?sid=      ⇒ الأسباب · req_targets · نافذة الاستبدال · المعلّق
 *   POST org/status-request {action: SUBMIT|CANCEL|APPROVE|REJECT, …}
 *   GET  org/status-requests?center_no=   ⇒ ما ينتظر قراري · طلباتي · ما بُتّ فيه
 *
 * المعلّم يطلب «منقطع» (كل المؤسسات)، وفي مؤسسات سقف المعتمدين معتمد ⇄ إضافي
 * والاستبدال في نافذته. يوافق المدير أو مساعده فتتغيّر الحالة تلقائيًّا.
 * ما لا يُطلب (غير ذلك من الحالات) لإدارة المركز. كلّه يلزمه اتصال.
 * المدخل: زرّ «حالات الطلاب» في رأس «طلابي»، ورسالتا STATUS_REQUESTS
 * و STATUS_REQ_DECIDED في الصندوق.
 */
(function () {
  'use strict';

  var ui = { view: 'list', circle: null, data: null, error: '', loading: false, reqs: null, reqErr: '', openReq: null };

  // ── أدوات ──
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function str(v) { var t = v == null ? '' : String(v).trim(); return (t === '' || t === 'null') ? null : t; }
  function int(v) { var n = parseInt(v, 10); return isNaN(n) ? null : n; }
  function toast(m) { if (typeof showToast === 'function') showToast(m); }
  function dmy(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? (+m[3]) + '/' + (+m[2]) + '/' + m[1] : String(iso || '');
  }
  function dm(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? (+m[3]) + '/' + (+m[2]) : String(iso || '');
  }

  async function call(path, body) {
    try {
      var r = await QMC.apiFetch(path, body ? { method: 'POST', body: body, timeoutMs: 30000 } : { timeoutMs: 25000 });
      var j = await r.json().catch(function () { return {}; });
      j = (j && typeof j === 'object') ? j : {};
      var msg = j.message != null ? String(j.message)
        : (r.status === 404 ? 'الخدمة لم تُفعَّل على الخادم بعد' : 'تعذّر إتمام الطلب (رمز ' + r.status + ')');
      return { ok: j.status === 'success', message: msg, data: j };
    } catch (_) {
      return { ok: false, message: 'تعذّر الاتصال بالخادم — تحقّق من الإنترنت وأعد المحاولة', data: {} };
    }
  }

  var KIND_LABEL = { DROP: 'منقطع', EXTRA: 'معتمد ⇐ إضافي', APPROVE: 'إضافي ⇐ معتمد', SWAP: 'استبدال' };
  function kindLabel(k) { return KIND_LABEL[k] || k; }

  // ── النماذج ──
  function parseStudents(j) {
    return {
      centerNo: int(j.center_no) || 0,
      approvedCap: int(j.approved_cap),
      sessionDays: Array.isArray(j.session_days) ? j.session_days.map(String) : [],
      statuses: (Array.isArray(j.statuses) ? j.statuses : []).map(function (s) {
        return { code: String(s.code || ''), name: String(s.name || ''), enrolled: s.enrolled === 'Y' };
      }),
      students: (Array.isArray(j.students) ? j.students : []).map(function (s) {
        var a = s.att && typeof s.att === 'object' ? s.att : {};
        return {
          studentNo: int(s.student_no) || 0,
          idNo: String(s.id_no || ''),
          name: String(s.name || '').trim(),
          status: String(s.status || '').trim(),
          enrolled: s.enrolled === 'Y',
          registerDate: str(s.register_date),
          pendingReq: str(s.pending_req),
          lastPresent: str(a.last_present),
          present60: int(a.present) || 0,
          pages60: parseFloat(a.pages) || 0
        };
      })
    };
  }

  function parseLog(j) {
    var p = j.pending && typeof j.pending === 'object' && int(j.pending.req_id) != null ? {
      reqId: int(j.pending.req_id), kind: String(j.pending.kind || ''),
      requestedAt: str(j.pending.requested_at), requestedBy: str(j.pending.requested_by),
      mine: j.pending.mine === 'Y', partner: str(j.pending.partner)
    } : null;
    var targets = {};
    String(j.req_targets || '').split(',').forEach(function (c) { c = c.trim(); if (c) targets[c] = 1; });
    return {
      canDismiss: j.can_dismiss === 'Y',
      dismissedCode: String(j.dismissed_code || '2'),
      reasonMin: int(j.reason_min) || 10,
      reasons: (Array.isArray(j.reasons) ? j.reasons : []).map(function (r) { return { code: String(r.code || ''), name: String(r.name || '') }; }),
      items: Array.isArray(j.items) ? j.items : [],
      reqTargets: targets,
      approvedCap: int(j.approved_cap),
      approvedCnt: int(j.approved_cnt),
      swapUntil: str(j.swap_until),
      swapNext: str(j.swap_next),
      pending: p,
      swapPartners: (Array.isArray(j.swap_partners) ? j.swap_partners : []).filter(function (x) { return int(x.student_no) != null; })
        .map(function (x) { return { studentNo: int(x.student_no), name: String(x.name || '').trim() }; })
    };
  }

  // ── 💡 المقترحات (status_suggest.dart) ──
  var DROP_MISSED = 6, DROP_DAYS = 14, MIN_SESSIONS = 8, WEAK = 0.5, STRONG = 0.8;

  function suggest(d) {
    var days = d.sessionDays;
    if (days.length < MIN_SESSIONS) return [];
    var today = new Date();
    var atts = [];
    d.students.forEach(function (s) {
      if (!s.enrolled || s.pendingReq) return;
      var reg = (s.registerDate || '').length >= 10 ? s.registerDate.substring(0, 10) : '';
      var since = days.filter(function (x) { return x >= reg; });
      var lp = s.lastPresent || '';
      var missed = since.filter(function (x) { return x > lp; }).length;
      var sessions = since.length;
      var rate = sessions === 0 ? null : Math.min(s.present60, sessions) / sessions;
      atts.push({ s: s, sessions: sessions, missed: missed, rate: rate, lastDate: s.lastPresent || reg });
    });
    function rateText(a) {
      var pct = Math.round((a.rate || 0) * 100);
      var pg = a.s.pages60 === Math.round(a.s.pages60) ? String(Math.round(a.s.pages60)) : a.s.pages60.toFixed(1);
      return 'حضر ' + Math.min(a.s.present60, a.sessions) + ' من ' + a.sessions + ' لقاءً في الشهرين (' + pct + '٪) · سمّع ' + pg + ' صفحة';
    }
    var out = [], dropped = {};
    atts.forEach(function (a) {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(a.lastDate || '');
      var gap = m ? Math.floor((today - new Date(+m[1], +m[2] - 1, +m[3])) / 86400000) : 9999;
      if (a.missed < DROP_MISSED || gap < DROP_DAYS) return;
      dropped[a.s.studentNo] = 1;
      var since = a.s.lastPresent == null ? 'لم يُسجَّل له حضورٌ منذ تسجيله' : 'آخر حضورٍ له ' + dm(a.s.lastPresent);
      var seat = d.approvedCap != null && a.s.status === '1' ? ' — وبانقطاعه يخلو مقعدٌ معتمد' : '';
      out.push({
        student: a.s, kind: 'DROP',
        why: since + '، وانعقدت الحلقة بعده ' + a.missed + ' مرّةً دونه' + seat,
        prefill: {
          status: '3', why: since + '، وانعقدت الحلقة بعده ' + a.missed + ' مرّةً دونه.', reasonCode: 'ABS',
          reasonText: a.s.lastPresent == null
            ? 'لم يحضر إلى الحلقة منذ تسجيله فيها (' + a.missed + ' لقاءً).'
            : 'انقطع عن الحلقة منذ ' + dm(a.s.lastPresent) + ' ولم يحضر ' + a.missed + ' لقاءً متتاليًا.'
        }
      });
    });
    var cap = d.approvedCap;
    if (cap != null) {
      var rated = atts.filter(function (a) { return !dropped[a.s.studentNo] && a.sessions >= MIN_SESSIONS && a.rate != null; });
      var weak = rated.filter(function (a) { return a.s.status === '1' && a.rate < WEAK; })
        .sort(function (x, y) { return (x.rate - y.rate) || (x.s.pages60 - y.s.pages60); });
      var strong = rated.filter(function (a) { return a.s.status === '5' && a.rate >= STRONG; })
        .sort(function (x, y) { return (y.rate - x.rate) || (y.s.pages60 - x.s.pages60); });
      var seats = cap - d.students.filter(function (s) { return s.status === '1'; }).length;
      var w = 0;
      strong.forEach(function (a) {
        if (seats > 0) {
          seats--;
          out.push({ student: a.s, kind: 'APPROVE', why: rateText(a) + ' — وفي الحلقة مقعدٌ معتمدٌ شاغر',
            prefill: { status: '1', why: rateText(a) + '، وفي الحلقة مقعدٌ شاغر.' } });
        } else if (w < weak.length) {
          var o = weak[w++];
          out.push({ student: o.s, kind: 'SWAP', partner: a.s,
            why: 'معتمد: ' + rateText(o) + '\n' + a.s.name + ' إضافي: ' + rateText(a),
            prefill: { status: '5', partner: a.s.studentNo,
              why: 'استبداله بـ' + a.s.name + ': هو ' + rateText(o) + '، و' + a.s.name + ' ' + rateText(a) + '.' } });
        } else {
          out.push({ student: a.s, kind: 'WAIT', why: rateText(a) });
        }
      });
      for (; w < weak.length; w++) {
        var ow = weak[w];
        out.push({ student: ow.s, kind: 'EXTRA', why: rateText(ow) + ' — حضوره دون ' + Math.round(WEAK * 100) + '٪',
          prefill: { status: '5', why: rateText(ow) + '.' } });
      }
    }
    return out;
  }
  function tipAction(t) {
    return t.kind === 'DROP' ? 'طلب «منقطع»' : t.kind === 'EXTRA' ? 'طلب «إضافي»' : t.kind === 'APPROVE' ? 'طلب «معتمد»'
      : t.kind === 'SWAP' ? 'استبداله بـ' + (t.partner ? t.partner.name : '') : 'يستحقّ الاعتماد عند خلوّ مقعد';
  }
  var TIP_ICON = { DROP: ['fa-user-slash', '#B91C1C'], EXTRA: ['fa-arrow-down', '#B45309'], APPROVE: ['fa-arrow-up', '#15803D'],
    SWAP: ['fa-right-left', '#1D4ED8'], WAIT: ['fa-hourglass-half', '#64748B'] };

  // ── الشاشة ──
  function ensureScreen() {
    var el = document.getElementById('srScreen');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'srScreen';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.style.display = 'none';
    el.innerHTML = '<div class="sr-bar"></div><div class="sr-body"></div>';
    el.addEventListener('click', onClick);
    document.body.appendChild(el);
    return el;
  }

  function iconBtn(act, icon, title) {
    return '<button type="button" class="sr-icon" data-act="' + act + '" title="' + title + '" aria-label="' + title + '"><i class="fas ' + icon + '"></i></button>';
  }

  function render() {
    var el = ensureScreen();
    var bar = el.querySelector('.sr-bar'), body = el.querySelector('.sr-body');
    if (ui.view === 'reqs') {
      // من الصندوق بلا حلقةٍ مختارة ⇒ الرجوع يُغلق
      bar.innerHTML = iconBtn(ui.circle ? 'back' : 'close', 'fa-arrow-right', 'رجوع') + '<div class="sr-title">طلبات الحالة</div>' +
        iconBtn('reload', 'fa-rotate', 'تحديث');
      body.innerHTML = reqsHtml();
      return;
    }
    bar.innerHTML = iconBtn('close', 'fa-arrow-right', 'رجوع') +
      '<div class="sr-title">' + esc('حالات طلاب ' + (ui.circle ? ui.circle.name : '')) + '</div>' +
      '<button type="button" class="help-btn" data-help="circleStatus" title="شرح الشاشة" aria-label="شرح الشاشة"><i class="fas fa-question"></i></button>' +
      iconBtn('reqs', 'fa-id-card', 'طلباتي') + iconBtn('reload', 'fa-rotate', 'تحديث');
    body.innerHTML = listHtml();
    if (typeof _helpMarkDots === 'function') { try { _helpMarkDots(); } catch (_) {} }
  }

  function note(cls, icon, text) {
    return '<div class="sr-note ' + cls + '"><i class="fas ' + icon + '"></i><span>' + esc(text) + '</span></div>';
  }

  function listHtml() {
    if (ui.loading && !ui.data) return '<div class="sr-center"><i class="fas fa-spinner fa-spin"></i> جارٍ جلب الطلاب…</div>';
    var d = ui.data;
    if (!d) {
      return '<div class="sr-center">' + esc(ui.error || 'تعذّر جلب الطلاب') +
        '<button type="button" class="sr-btn" data-act="reload"><i class="fas fa-rotate"></i> أعد المحاولة</button></div>';
    }
    var cap = d.approvedCap;
    var h = note('sr-blue', 'fa-circle-info', cap != null
      ? 'المس الطالب لتطلب جعله منقطعًا، أو نقله بين معتمد وإضافي (أو استبداله) في نافذة الاستبدال. يوافق المدير أو مساعده فتتغيّر الحالة تلقائيًّا ويصلك إشعار.'
      : 'المس الطالب لتطلب جعله منقطعًا. يوافق المدير أو مساعده فتتغيّر الحالة تلقائيًّا ويصلك إشعار.');
    var tips = suggest(d);
    ui.tips = tips;
    if (tips.length) {
      h += '<details class="sr-tips" open><summary><i class="fas fa-lightbulb"></i> مقترحات (' + tips.length + ')' +
        '<small>من الحضور المرفوع للسيرفر في الشهرين الأخيرين — ما لم يُرفع من جهازك بعدُ لا يُحسب. المس الاقتراح لتراجعه وترسله.</small></summary>';
      tips.forEach(function (t, i) {
        var ic = TIP_ICON[t.kind] || TIP_ICON.WAIT;
        h += '<button type="button" class="sr-tip" data-act="tip" data-i="' + i + '"' + (t.prefill ? '' : ' disabled') + '>' +
          '<i class="fas ' + ic[0] + '" style="color:' + ic[1] + '"></i><span><b>' + esc(t.student.name + ' — ' + tipAction(t)) + '</b>' +
          '<small>' + esc(t.why).replace(/\n/g, '<br>') + '</small></span></button>';
      });
      h += '</details>';
    }
    function byReg(a, b) { return (a.registerDate || '').localeCompare(b.registerDate || '') || (a.studentNo - b.studentNo); }
    if (cap == null) {
      var all = d.students.filter(function (s) { return s.enrolled; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
      h += head('الطلاب', String(all.length));
      all.forEach(function (s, i) { h += tile(s, i + 1); });
      return h;
    }
    var approved = d.students.filter(function (s) { return s.status === '1'; }).sort(byReg);
    var extra = d.students.filter(function (s) { return s.status === '5'; }).sort(byReg);
    var rest = d.students.filter(function (s) { return s.enrolled && s.status !== '1' && s.status !== '5'; });
    h += head('المعتمدون', approved.length + ' من ' + cap);
    approved.forEach(function (s, i) { h += tile(s, i + 1); });
    if (extra.length) { h += head('الإضافيّون', String(extra.length)); extra.forEach(function (s, i) { h += tile(s, cap + i + 1); }); }
    if (rest.length) { h += head('قيد القبول', String(rest.length)); rest.forEach(function (s) { h += tile(s, null); }); }
    return h;
  }
  function head(t, n) { return '<div class="sr-head"><b>' + esc(t) + '</b><span>' + esc(n) + '</span></div>'; }
  function tile(s, seq) {
    return '<button type="button" class="sr-tile" data-act="student" data-no="' + s.studentNo + '">' +
      '<span class="sr-seq">' + (seq == null ? '•' : seq) + '</span><span class="sr-tb"><b>' + esc(s.name || 'هوية ' + s.idNo) + '</b>' +
      (s.pendingReq ? '<small class="sr-amber">⏳ طلبٌ ينتظر الموافقة: ' + esc(kindLabel(s.pendingReq)) + '</small>'
        : '<small>هوية ' + esc(s.idNo) + '</small>') + '</span><i class="fas fa-flag sr-flag"></i></button>';
  }

  // ── قائمة الطلبات ──
  var STATE = { P: ['بانتظار الموافقة', 'fa-hourglass-half', '#B45309'], A: ['وُوفق', 'fa-circle-check', '#15803D'],
    R: ['رُدّ', 'fa-circle-xmark', '#B91C1C'], C: ['سُحب', 'fa-rotate-left', '#64748B'] };
  function parseReq(j) {
    return {
      reqId: int(j.req_id) || 0, kind: String(j.kind || ''), state: String(j.state || ''),
      toDecide: j.to_decide === 'Y', mine: j.mine === 'Y', idNo: String(j.id_no || ''),
      name: String(j.name || '').trim(), currentName: str(j.current_name), inName: str(j.in_name),
      circleName: String(j.circle_name || ''), centerName: String(j.center_name || ''),
      oldName: str(j.old_name), newName: str(j.new_name), reasonName: str(j.reason_name),
      reasonText: str(j.reason_text), internalNote: str(j.internal_note),
      requestedBy: str(j.requested_by), requestedAt: str(j.requested_at),
      decidedBy: str(j.decided_by), decidedAt: str(j.decided_at), decisionNote: str(j.decision_note),
      approvedCnt: int(j.approved_cnt), approvedCap: int(j.approved_cap)
    };
  }
  function changeLabel(q) {
    return q.kind === 'SWAP' ? 'معتمد ⇐ إضافي، ويحلّ محلّه ' + (q.inName || 'إضافيّ')
      : (q.oldName || '') + ' ⇐ ' + (q.newName || kindLabel(q.kind));
  }

  async function loadReqs() {
    ui.reqs = null; ui.reqErr = '';
    render();
    var cn = ui.data && ui.data.centerNo ? ui.data.centerNo : '';
    var r = await call('org/status-requests?center_no=' + cn);
    if (!r.ok) { ui.reqErr = r.message; render(); return; }
    ui.reqs = {
      canDecide: r.data.can_decide === 'Y', swapUntil: str(r.data.swap_until), swapNext: str(r.data.swap_next),
      items: (Array.isArray(r.data.items) ? r.data.items : []).map(parseReq)
    };
    render();
    if (ui.openReq != null) {
      var q = ui.reqs.items.filter(function (x) { return x.reqId === ui.openReq; })[0];
      ui.openReq = null;
      if (q) openReq(q);
    }
  }

  function reqsHtml() {
    if (!ui.reqs) {
      return ui.reqErr ? '<div class="sr-center">' + esc(ui.reqErr) +
        '<button type="button" class="sr-btn" data-act="reload"><i class="fas fa-rotate"></i> أعد المحاولة</button></div>'
        : '<div class="sr-center"><i class="fas fa-spinner fa-spin"></i> جارٍ الجلب…</div>';
    }
    var p = ui.reqs, h = '';
    if (ui.data) {
      h += p.swapUntil
        ? note('sr-green', 'fa-lock-open', 'نافذة الاستبدال (معتمد ⇄ إضافي) مفتوحةٌ حتى ' + dmy(p.swapUntil))
        : note('sr-calm', 'fa-lock', 'نافذة الاستبدال مغلقة' + (p.swapNext ? ' — تُفتح ' + dmy(p.swapNext) : ' — يفتحها المدير من شاشة الفصل') + '. وطلب «منقطع» متاحٌ دائمًا.');
    }
    var toDecide = p.items.filter(function (x) { return x.toDecide; });
    var mine = p.items.filter(function (x) { return x.mine && !x.toDecide; });
    var decided = p.items.filter(function (x) { return !x.toDecide && !x.mine && x.state !== 'P'; });
    if (p.canDecide) {
      h += head('بانتظار موافقتك', String(toDecide.length));
      h += toDecide.length ? toDecide.map(reqTile).join('') : '<div class="sr-empty">✅ لا طلبات بانتظارك</div>';
    }
    if (mine.length || !p.canDecide) {
      h += head('طلباتي', String(mine.length));
      h += mine.length ? mine.map(reqTile).join('') : '<div class="sr-empty">لم ترسل طلبًا بعد — المس طالبًا في «حالات الطلاب»</div>';
    }
    if (decided.length) { h += head('ما بُتّ فيه (30 يومًا)', String(decided.length)); h += decided.map(reqTile).join(''); }
    return h;
  }
  function reqTile(q) {
    var s = STATE[q.state] || ['' + q.state, 'fa-circle', '#64748B'];
    return '<button type="button" class="sr-tile" data-act="req" data-id="' + q.reqId + '">' +
      '<i class="fas ' + s[1] + '" style="color:' + s[2] + ';font-size:20px;width:30px"></i><span class="sr-tb"><b>' +
      esc(q.name || 'هوية ' + q.idNo) + '</b><small>' + esc(changeLabel(q)) + '<br>' +
      esc(q.circleName + ' · ' + s[0] + (q.requestedAt ? ' · ' + q.requestedAt : '')) + '</small></span>' +
      '<i class="fas fa-chevron-left sr-flag"></i></button>';
  }

  // ── النوافذ ──
  function overlay(id, inner) {
    var old = document.getElementById(id);
    if (old) old.remove();
    var o = document.createElement('div');
    o.id = id;
    o.className = 'modal-overlay';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.style.display = 'flex';
    o.innerHTML = '<div class="modal-box sr-box">' + inner + '</div>';
    o.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-close]')) o.remove();
    });
    document.body.appendChild(o);
    return o;
  }

  function openReq(q) {
    function row(k, v) { return v ? '<div class="sr-kv"><b>' + esc(k) + ':</b> ' + esc(v) + '</div>' : ''; }
    var pending = q.state === 'P';
    var h = '<h4 class="modal-title">' + (q.kind === 'SWAP' ? 'طلب استبدال' : 'طلب تغيير حالة') + '</h4>' +
      '<div style="font-weight:600">' + esc(q.name || 'هوية ' + q.idNo) + '</div>' +
      '<div class="sr-muted">' + esc('هوية ' + q.idNo + ' · ' + q.circleName + ' · ' + q.centerName) + '</div>' +
      row('المطلوب', changeLabel(q)) +
      (q.kind === 'SWAP' ? row('يصير معتمدًا', q.inName) : '') +
      (pending ? row('حالته الآن', q.currentName) : '') +
      row('السبب', q.reasonName) +
      row(q.kind === 'DROP' ? 'السبب بالتفصيل' : 'ملاحظة المعلّم', q.reasonText) +
      row('ملاحظة داخلية', q.internalNote) +
      row('طلبه', [q.requestedBy, q.requestedAt].filter(Boolean).join(' · ')) +
      (q.approvedCap != null && q.kind !== 'DROP' ? row('المقاعد', 'المعتمدون في الحلقة الآن ' + (q.approvedCnt || 0) + ' من ' + q.approvedCap) : '') +
      (!pending ? row('النتيجة', (STATE[q.state] || [q.state])[0]) + row('بتّ فيه', [q.decidedBy, q.decidedAt].filter(Boolean).join(' · ')) +
        row('ملاحظة الإدارة', q.decisionNote) : '') +
      (q.toDecide ? '<label class="sr-lbl" for="srDecNote">ملاحظة للمعلّم <small>(إلزاميّة عند الردّ)</small></label>' +
        '<textarea id="srDecNote" class="sr-in" rows="2" maxlength="500"></textarea>' : '') +
      '<div class="sr-err" id="srReqErr"></div>' +
      '<div class="modal-actions"><button type="button" class="modal-btn modal-cancel" data-close>إغلاق</button>' +
      (q.mine && pending && !q.toDecide ? '<button type="button" class="modal-btn modal-cancel" data-do="CANCEL"><i class="fas fa-rotate-left"></i> سحب الطلب</button>' : '') +
      (q.toDecide ? '<button type="button" class="modal-btn modal-cancel" data-do="REJECT">ردّ</button>' +
        '<button type="button" class="modal-btn modal-confirm" data-do="APPROVE"><i class="fas fa-check"></i> موافقة</button>' : '') +
      '</div>';
    var o = overlay('srReqModal', h);
    o.addEventListener('click', async function (ev) {
      var b = ev.target.closest('[data-do]');
      if (!b) return;
      var action = b.dataset.do;
      var nt = o.querySelector('#srDecNote');
      var noteV = nt ? nt.value.trim() : '';
      var err = o.querySelector('#srReqErr');
      if (action === 'REJECT' && noteV.length < 3) { err.textContent = 'اكتب سبب الردّ — يراه المعلّم'; return; }
      o.querySelectorAll('[data-do]').forEach(function (x) { x.disabled = true; });
      err.textContent = '';
      var r = await call('org/status-request', { action: action, req_id: q.reqId, note: noteV || null });
      if (!r.ok) {
        err.textContent = r.message;
        o.querySelectorAll('[data-do]').forEach(function (x) { x.disabled = false; });
        return;
      }
      toast('✅ ' + r.message);
      o.remove();
      loadReqs();
      if (ui.circle) loadStudents(true);
    });
  }

  /* نافذة الحالة (requestOnly) — prefill من المقترح */
  async function openStatus(s, prefill) {
    var d = ui.data;
    if (!d) return;
    var f = { status: s.status, reason: null, text: '', note: '', swap: false, partner: null, saving: false, err: '' };
    if (prefill) {
      f.status = prefill.status; f.reason = prefill.reasonCode || null; f.text = prefill.reasonText || '';
      f.partner = prefill.partner || null; f.swap = prefill.partner != null;
    }
    var log = null, loadErr = '';
    var o = overlay('srStatusModal', '<h4 class="modal-title">' + esc('حالة ' + (s.name || s.idNo)) + '</h4><div id="srStBody">' +
      '<div class="sr-center"><i class="fas fa-spinner fa-spin"></i> جارٍ جلب سجلّ الحالة…</div></div>' +
      '<div class="modal-actions"><button type="button" class="modal-btn modal-cancel" data-close>إلغاء</button>' +
      '<button type="button" class="modal-btn modal-confirm" id="srStSave" disabled>إرسال الطلب</button></div>');

    function target() { return d.statuses.filter(function (x) { return x.code === f.status; })[0]; }
    function changed() { return f.status !== s.status; }
    function needsReason() { var t = target(); return changed() && !(t ? t.enrolled : true); }
    function asRequest() { return changed() && !!(log && log.reqTargets[f.status]); }
    function isPair() { return (s.status === '1' && f.status === '5') || (s.status === '5' && f.status === '1'); }
    function hasSeat() { return !log || log.approvedCap == null || (log.approvedCnt || 0) < log.approvedCap; }
    function kind() {
      if (!asRequest()) return null;
      if (f.status === '3') return 'DROP';
      if (!isPair()) return null;
      if (f.swap) return 'SWAP';
      return s.status === '1' ? 'EXTRA' : 'APPROVE';
    }
    function valid() {
      if (!changed() || !log) return false;
      // شاشة المعلّم: ما لا يُطلب لإدارة المركز
      if (!asRequest()) return false;
      if (log.pending) return false;
      var k = kind();
      if (!k) return false;
      if (k !== 'DROP' && !log.swapUntil) return false;
      if (k === 'SWAP' && f.partner == null) return false;
      if (k === 'APPROVE' && !hasSeat()) return false;
      if (!needsReason()) return true;
      return !!f.reason && f.text.trim().length >= log.reasonMin;
    }

    function statusRow(st) {
      var cur = st.code === s.status;
      var needs = !cur && !!log.reqTargets[st.code];
      var pair = (s.status === '1' && st.code === '5') || (s.status === '5' && st.code === '1');
      var lockedReq = needs && (log.pending || (pair && !log.swapUntil) || (st.code !== '3' && !pair));
      var lockedOnly = !cur && !needs;
      var locked = lockedReq || lockedOnly;
      var sub;
      if (lockedOnly) sub = 'لمدير المركز ومساعده';
      else if (cur) sub = 'الحالة الحاليّة';
      else if (needs && log.pending) sub = 'بعد البتّ في الطلب المعلّق';
      else if (needs && pair && !log.swapUntil) sub = 'الاستبدال مغلق' + (log.swapNext ? ' — يُفتح ' + dmy(log.swapNext) : '');
      else if (needs && st.code !== '3' && !pair) sub = 'لمدير المركز ومساعده';
      else sub = st.code === '3' ? 'بطلبٍ يوافق عليه المدير أو مساعده — يلزمه سبب' : 'بطلبٍ يوافق عليه المدير أو مساعده';
      return '<label class="sr-radio' + (locked && !cur ? ' off' : '') + '"><input type="radio" name="srSt" value="' + esc(st.code) + '"' +
        (f.status === st.code ? ' checked' : '') + (locked || f.saving ? ' disabled' : '') + '><span><b>' + esc(st.name) +
        '</b><small>' + esc(sub) + '</small></span></label>';
    }

    function draw() {
      var b = o.querySelector('#srStBody');
      var save = o.querySelector('#srStSave');
      if (!log) {
        b.innerHTML = '<div class="sr-err">' + esc(loadErr || 'تعذّر جلب سجلّ الحالة') + '</div>' +
          '<button type="button" class="sr-btn" id="srStRetry"><i class="fas fa-rotate"></i> إعادة المحاولة</button>';
        save.disabled = true;
        return;
      }
      var h = '';
      if (log.pending) {
        var p = log.pending;
        var what = p.kind === 'SWAP' ? 'استبدال' + (p.partner ? ' مع ' + p.partner : '') : kindLabel(p.kind);
        h += '<div class="sr-pend"><b><i class="fas fa-hourglass-half"></i> طلبٌ ينتظر الموافقة: ' + esc(what) + '</b>' +
          '<small>' + esc([p.requestedBy ? 'طلبه ' + p.requestedBy : '', p.requestedAt || ''].filter(Boolean).join(' · ')) + '</small>' +
          (p.mine ? '<button type="button" class="sr-link" id="srWithdraw"' + (f.saving ? ' disabled' : '') + '><i class="fas fa-rotate-left"></i> سحب الطلب</button>' : '') + '</div>';
      } else {
        if (prefill) h += note('sr-green', 'fa-lightbulb', '💡 ' + prefill.why + '\nراجع الاختيار والسبب قبل الإرسال.');
        var quota = log.approvedCap != null;
        var swapLine = !quota ? '' : log.swapUntil ? ' نافذة الاستبدال مفتوحةٌ حتى ' + dmy(log.swapUntil) + '.'
          : ' نافذة الاستبدال (معتمد ⇄ إضافي) مغلقة' + (log.swapNext ? ' — تُفتح ' + dmy(log.swapNext) : '') + '.';
        if (Object.keys(log.reqTargets).length) {
          h += note('sr-blue', 'fa-id-card', (quota ? '«منقطع» والانتقال بين معتمد وإضافي' : '«منقطع»') +
            ' بطلبٍ يوافق عليه المدير أو مساعده، فتتغيّر الحالة تلقائيًّا.' + swapLine);
        }
      }
      d.statuses.forEach(function (st) { h += statusRow(st); });
      if (asRequest() && isPair()) {
        var fromApproved = s.status === '1', closed = !log.swapUntil, partners = log.swapPartners;
        var alone = fromApproved ? 'يصير إضافيًّا وحده (يخلو مقعدٌ معتمد)' : hasSeat() ? 'يصير معتمدًا في مقعدٍ شاغر' : 'يصير معتمدًا — لا مقعد شاغر الآن';
        h += '<hr class="sr-hr"><label class="sr-radio"><input type="radio" name="srSw" value="0"' + (!f.swap ? ' checked' : '') +
          (f.saving || closed || (!fromApproved && !hasSeat()) ? ' disabled' : '') + '><span><b>' + esc(alone) + '</b></span></label>' +
          '<label class="sr-radio"><input type="radio" name="srSw" value="1"' + (f.swap ? ' checked' : '') +
          (f.saving || closed || !partners.length ? ' disabled' : '') + '><span><b>' +
          esc(fromApproved ? 'استبدالٌ: يحلّ محلّه إضافيّ' : 'استبدالٌ: يحلّ محلّ معتمد') + '</b>' +
          (!partners.length ? '<small>' + esc(fromApproved ? 'لا إضافيّ في الحلقة بلا طلبٍ معلّق' : 'لا معتمد في الحلقة بلا طلبٍ معلّق') + '</small>' : '') +
          '</span></label>';
        if (f.swap && partners.length) {
          h += '<label class="sr-lbl" for="srPartner">' + (fromApproved ? 'الإضافيّ الذي يحلّ محلّه' : 'المعتمد الذي يخرج') + '</label>' +
            '<select id="srPartner" class="sr-in"><option value="">— اختر —</option>' + partners.map(function (p) {
              return '<option value="' + p.studentNo + '"' + (f.partner === p.studentNo ? ' selected' : '') + '>' + esc(p.name) + '</option>';
            }).join('') + '</select>';
        }
        h += '<label class="sr-lbl" for="srText">ملاحظة للمدير (اختيارية)</label>' +
          '<textarea id="srText" class="sr-in" rows="2" maxlength="500" placeholder="لماذا هذا التغيير؟">' + esc(f.text) + '</textarea>';
      }
      if (needsReason()) {
        h += '<hr class="sr-hr"><label class="sr-lbl" for="srReason">السبب</label><select id="srReason" class="sr-in"><option value="">— اختر —</option>' +
          log.reasons.map(function (r) { return '<option value="' + esc(r.code) + '"' + (f.reason === r.code ? ' selected' : '') + '>' + esc(r.name) + '</option>'; }).join('') +
          '</select><label class="sr-lbl" for="srText">السبب بالتفصيل</label>' +
          '<textarea id="srText" class="sr-in" rows="3" maxlength="1000" placeholder="مثال: غاب عن الحلقة شهرًا كاملًا دون عذر رغم التواصل مع وليّ الأمر">' + esc(f.text) + '</textarea>' +
          '<div class="sr-muted" id="srMin">يراه وليّ الأمر في تطبيقه — اكتبه بأسلوبٍ لائقٍ واضح' +
          (f.text.trim().length < log.reasonMin ? ' · ' + log.reasonMin + ' أحرف على الأقل' : '') + '</div>' +
          '<label class="sr-lbl" for="srNote">ملاحظة داخلية (اختيارية)</label>' +
          '<textarea id="srNote" class="sr-in" rows="2" maxlength="1000">' + esc(f.note) + '</textarea>' +
          '<div class="sr-muted">لا يراها وليّ الأمر — لإدارة المركز ومعلّم الحلقة. ويصل الطلب إلى المدير ومساعده، وتتغيّر الحالة بعد موافقتهما.</div>';
      }
      if (f.err) h += '<div class="sr-err">' + esc(f.err) + '</div>';
      if (log.items.length) {
        h += '<details class="sr-hist"><summary>سجلّ الحالة (' + log.items.length + ')</summary>' + log.items.map(function (it) {
          var lines = [[it.changed_at, it.changed_by, it.circle_name ? 'حلقة ' + it.circle_name : '', it.source === 'REQUEST' ? 'بموافقةٍ على طلب' : '']
            .filter(Boolean).join(' · ')];
          if (it.reason_text) lines.push(it.reason_text);
          if (it.internal_note) lines.push('داخليّ: ' + it.internal_note);
          return '<div class="sr-hrow"><b>' + esc((it.old_name || it.old_status || '—') + ' ⇐ ' + (it.new_name || it.new_status || '') +
            (it.reason_name ? ' · ' + it.reason_name : '')) + '</b><small>' + lines.map(esc).join('<br>') + '</small></div>';
        }).join('') + '</details>';
      } else {
        h += '<div class="sr-muted" style="margin-top:8px">لا تغييرات مسجَّلة لهذا الطالب بعد.</div>';
      }
      b.innerHTML = h;
      save.disabled = f.saving || !valid();
      save.innerHTML = f.saving ? '<i class="fas fa-spinner fa-spin"></i>' : 'إرسال الطلب';
    }

    async function load() {
      var r = await call('org/student/status-log?sid=' + s.studentNo);
      if (!document.body.contains(o)) return;
      if (r.ok) {
        log = parseLog(r.data);
        if (f.partner != null && !log.swapPartners.some(function (x) { return x.studentNo === f.partner; })) f.partner = null;
        if (prefill && !log.reqTargets[f.status]) f.status = s.status;
      } else loadErr = r.message;
      draw();
    }

    o.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t.name === 'srSt') {
        f.status = t.value; f.err = '';
        f.swap = s.status === '5' && t.value === '1' && !hasSeat();
        f.partner = null;
        draw();
      } else if (t.name === 'srSw') { f.swap = t.value === '1'; f.partner = null; draw(); }
      else if (t.id === 'srPartner') { f.partner = int(t.value); draw(); }
      else if (t.id === 'srReason') { f.reason = t.value || null; draw(); }
    });
    o.addEventListener('input', function (ev) {
      var t = ev.target;
      if (t.id === 'srText') {
        f.text = t.value;
        var m = o.querySelector('#srMin');
        if (m && log) m.textContent = 'يراه وليّ الأمر في تطبيقه — اكتبه بأسلوبٍ لائقٍ واضح' +
          (f.text.trim().length < log.reasonMin ? ' · ' + log.reasonMin + ' أحرف على الأقل' : '');
        o.querySelector('#srStSave').disabled = f.saving || !valid();
      } else if (t.id === 'srNote') f.note = t.value;
    });
    o.addEventListener('click', async function (ev) {
      var t = ev.target.closest('button');
      if (!t) return;
      if (t.id === 'srStRetry') { loadErr = ''; o.querySelector('#srStBody').innerHTML = '<div class="sr-center"><i class="fas fa-spinner fa-spin"></i></div>'; load(); }
      else if (t.id === 'srWithdraw') {
        f.saving = true; draw();
        var r = await call('org/status-request', { action: 'CANCEL', req_id: log.pending.reqId, note: null });
        if (r.ok) { toast('✅ ' + r.message); o.remove(); loadStudents(true); return; }
        f.saving = false; f.err = r.message; draw();
      } else if (t.id === 'srStSave') {
        if (!valid()) return;
        f.saving = true; f.err = ''; draw();
        var k = kind();
        // الاستبدال دائمًا: المعتمد يخرج (student_no) والإضافيّ يدخل (in_student_no)
        var outNo = k === 'SWAP' && s.status === '5' ? f.partner : s.studentNo;
        var inNo = k === 'SWAP' ? (s.status === '5' ? s.studentNo : f.partner) : null;
        var r2 = await call('org/status-request', {
          action: 'SUBMIT', kind: k, student_no: outNo, in_student_no: inNo,
          reason_code: k === 'DROP' ? f.reason : null,
          reason_text: f.text.trim() || null,
          internal_note: f.note.trim() || null
        });
        if (r2.ok) { toast('📝 ' + r2.message); o.remove(); loadStudents(true); return; }
        f.saving = false; f.err = r2.message; draw();
      }
    });
    load();
  }

  // ── التحميل والتفاعل ──
  async function loadStudents(keep) {
    if (!ui.circle) return;
    ui.loading = true;
    if (!keep) { ui.data = null; ui.error = ''; }
    render();
    var r = await call('org/students?circle_no=' + ui.circle.no);
    ui.loading = false;
    if (r.ok) { ui.data = parseStudents(r.data); ui.error = ''; }
    else if (!keep || !ui.data) { ui.data = null; ui.error = r.message; }
    else toast(r.message);
    if (ui.view === 'list') render();
  }

  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var act = el.dataset.act;
    if (act === 'close') close();
    else if (act === 'back') { ui.view = 'list'; render(); }
    else if (act === 'reload') { if (ui.view === 'reqs') loadReqs(); else loadStudents(true); }
    else if (act === 'reqs') { ui.view = 'reqs'; loadReqs(); }
    else if (act === 'req') {
      var q = ui.reqs && ui.reqs.items.filter(function (x) { return x.reqId === +el.dataset.id; })[0];
      if (q) openReq(q);
    } else if (act === 'student') {
      var s = ui.data && ui.data.students.filter(function (x) { return x.studentNo === +el.dataset.no; })[0];
      if (s) openStatus(s, null);
    } else if (act === 'tip') {
      var t = ui.tips && ui.tips[+el.dataset.i];
      if (t && t.prefill) openStatus(t.student, t.prefill);
    }
  }

  function show() {
    ensureScreen().style.display = 'flex';
    document.body.classList.add('sr-open');
  }
  function close() {
    var el = document.getElementById('srScreen');
    if (el) el.style.display = 'none';
    document.body.classList.remove('sr-open');
    if (typeof refreshAll === 'function') refreshAll();
  }

  /* حلقاتي التي أعلّم فيها (M · A · S)، وإلا كلّها إن لم تصل الأدوار */
  async function myCircles() {
    var list = typeof getCirclesFromDb === 'function' ? await getCirclesFromDb() : [];
    var byRole = list.some(function (c) { return String(c.empRole || '').trim() !== ''; });
    return list.filter(function (c) {
      var r = String(c.empRole || '').trim().toUpperCase();
      return !byRole || r === 'M' || r === 'A' || r === 'S';
    }).map(function (c) { return { no: Number(c.circleNo), name: c.circleName || ('حلقة ' + c.circleNo) }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
  }

  async function openCircleStatus() {
    if (!navigator.onLine) { toast('حالات الطلاب تحتاج اتصالًا'); return; }
    var circles = await myCircles();
    if (!circles.length) { toast('لم تُجلب حلقاتك بعد — حدّث بياناتك من الإعدادات'); return; }
    var go = function (c) { ui.circle = c; ui.view = 'list'; show(); loadStudents(false); };
    if (circles.length === 1) { go(circles[0]); return; }
    // 🕌 الحلقة الحالية مختارة ⇒ هي بلا سؤال
    var scope = typeof currentCircleScope === 'function' ? currentCircleScope() : null;
    var hit = circles.filter(function (c) { return c.no === scope; })[0];
    if (hit) { go(hit); return; }
    var o = overlay('srPickModal', '<h4 class="modal-title">اختر الحلقة</h4>' + circles.map(function (c, i) {
      return '<button type="button" class="sr-tile" data-pick="' + i + '"><span class="sr-tb"><b>' + esc(c.name) + '</b></span></button>';
    }).join('') + '<div class="modal-actions"><button type="button" class="modal-btn modal-cancel" data-close>إلغاء</button></div>');
    o.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-pick]');
      if (b) { o.remove(); go(circles[+b.dataset.pick]); }
    });
  }

  /* من الصندوق: طلبات الحالة (والطلب [reqId] مفتوحًا) */
  function openStatusRequests(reqId) {
    if (!navigator.onLine) { toast('طلبات الحالة تحتاج اتصالًا'); return; }
    ui.circle = null; ui.data = null; ui.view = 'reqs';
    ui.openReq = reqId != null && !isNaN(reqId) ? Number(reqId) : null;
    show();
    loadReqs();
  }

  document.addEventListener('keydown', function (e) {
    var el = document.getElementById('srScreen');
    if (e.key !== 'Escape' || !el || el.style.display === 'none') return;
    if (document.querySelector('.modal-overlay[style*="flex"]')) return;
    if (ui.view === 'reqs' && ui.circle) { ui.view = 'list'; render(); } else close();
  });

  var CSS =
    '#srScreen{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2000;background:var(--bg,#f8f9fa);flex-direction:column}' +
    'body.sr-open{overflow:hidden}' +
    '.sr-bar{display:flex;align-items:center;gap:6px;padding:10px 12px;padding-top:calc(10px + env(safe-area-inset-top));background:#fff;border-bottom:1px solid #e2e8f0}' +
    '.sr-title{flex:1;font-size:17px;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.sr-icon{background:transparent;color:#334155;width:40px;height:40px;border-radius:50%;padding:0;font-size:18px;flex-shrink:0;border:0;cursor:pointer}' +
    '.sr-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 10px calc(24px + env(safe-area-inset-bottom));max-width:760px;width:100%;margin:0 auto;box-sizing:border-box}' +
    '.sr-center{text-align:center;color:#475569;padding:36px 16px;display:flex;flex-direction:column;align-items:center;gap:12px;font-size:15px}' +
    '.sr-note{display:flex;gap:8px;align-items:flex-start;border-radius:12px;padding:10px 12px;margin-bottom:8px;font-size:13px;line-height:1.6;white-space:pre-line}' +
    '.sr-note i{margin-top:4px}' +
    '.sr-blue{background:#EFF6FF;color:#1E3A8A}.sr-green{background:#F0FDF4;color:#14532D}.sr-calm{background:#F1F5F9;color:#334155}' +
    '.sr-tips{background:#F0FDF4;border:1px solid #86EFAC;border-radius:12px;padding:8px;margin:10px 0}' +
    '.sr-tips summary{cursor:pointer;font-weight:700;color:#14532D;list-style:none}.sr-tips summary i{margin-inline-end:6px}' +
    '.sr-tips summary small{display:block;font-weight:400;font-size:11.5px;color:#166534;margin-top:2px}' +
    '.sr-tip{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:start;background:#fff;border:0;border-radius:10px;padding:10px;margin-top:6px;font:inherit;color:inherit;cursor:pointer}' +
    '.sr-tip:disabled{cursor:default}.sr-tip i{margin-top:3px;width:20px;text-align:center}' +
    '.sr-tip span,.sr-tb{display:flex;flex-direction:column;min-width:0;flex:1}.sr-tip small,.sr-tb small{font-size:12px;color:#475569;line-height:1.5}' +
    '.sr-head{display:flex;gap:8px;align-items:baseline;margin:14px 6px 4px}.sr-head b{font-size:14px;color:#334155}.sr-head span{font-size:13px;color:#64748B}' +
    '.sr-tile{display:flex;gap:10px;align-items:center;width:100%;text-align:start;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px;margin:4px 0;font:inherit;color:inherit;cursor:pointer}' +
    '.sr-seq{width:30px;height:30px;flex:0 0 30px;border-radius:50%;background:#E8F5E9;color:#2E7D32;font-size:12px;display:flex;align-items:center;justify-content:center}' +
    '.sr-flag{color:#94a3b8}.sr-amber{color:#92400E!important}' +
    '.sr-empty{text-align:center;color:#9e9e9e;padding:16px}' +
    '.sr-btn{display:inline-flex;align-items:center;gap:6px;background:var(--primary);color:#fff;border:0;border-radius:22px;padding:9px 16px;font:inherit;font-size:14px;cursor:pointer}' +
    '.sr-box{text-align:start;max-height:88vh;overflow:auto;max-width:500px}' +
    '.sr-box .modal-actions{margin-top:16px}' +
    '.sr-radio{display:flex;gap:10px;align-items:flex-start;padding:7px 2px;cursor:pointer}.sr-radio.off{opacity:.55;cursor:default}' +
    '.sr-radio input{width:18px;height:18px;margin-top:3px;accent-color:var(--primary);flex-shrink:0}' +
    '.sr-radio span{display:flex;flex-direction:column}.sr-radio small{font-size:11.5px;color:#64748B}' +
    '.sr-lbl{display:block;font-weight:600;font-size:13.5px;margin:10px 0 4px}' +
    '.sr-in{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:10px;padding:9px;font:inherit;font-size:14.5px;background:#fff}' +
    '.sr-muted{font-size:12px;color:#64748B;line-height:1.5}' +
    '.sr-err{color:#C62828;font-size:13px;margin-top:8px;line-height:1.5}' +
    '.sr-hr{border:0;border-top:1px solid #e5e7eb;margin:10px 0}' +
    '.sr-pend{background:#FFFBEB;border:1px solid #F59E0B59;border-radius:12px;padding:10px 12px;margin-bottom:8px;color:#92400E;display:flex;flex-direction:column;gap:3px}' +
    '.sr-pend small{font-size:12px}' +
    '.sr-link{align-self:flex-start;background:transparent;border:0;color:var(--primary);font:inherit;font-size:13px;padding:4px 0;cursor:pointer}' +
    '.sr-hist{margin-top:10px}.sr-hist summary{cursor:pointer;font-size:14px}' +
    '.sr-hrow{padding:6px 0;border-bottom:1px solid #f1f5f9}.sr-hrow b{display:block;font-size:13px}.sr-hrow small{font-size:12px;color:#64748B}' +
    '.sr-kv{font-size:13.5px;margin-top:6px;line-height:1.5}' +
    '.status-open-btn{display:inline-flex;align-items:center;gap:6px;background:var(--primary-wash,#e8f0fe);color:var(--primary-dark,#0d47a1);border:0;border-radius:20px;padding:7px 12px;font-size:13.5px;font-weight:600;white-space:nowrap;cursor:pointer}';
  (function injectCss() {
    var st = document.createElement('style');
    st.id = 'statusReqStyle';
    st.textContent = CSS;
    document.head.appendChild(st);
  })();

  window.openCircleStatus = openCircleStatus;
  window.openStatusRequests = openStatusRequests;
})();
