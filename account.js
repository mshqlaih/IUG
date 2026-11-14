/* ✉️ البريد الإلكتروني (2026-10-28) — نظير lib/widgets/email_verify_dialog.dart
 * و lib/services/account_service.dart في تطبيق أندرويد.
 *
 * المسارات نفسها (QMC_USER_ACCOUNT_PKG — docs/ords_user_account.sql):
 *   GET  user/account/status            ⇒ email_status (VERIFIED/UNVERIFIED/SHARED/EMPTY) + email
 *   POST user/account/email/send-code   {email}
 *   POST user/account/email/verify      {code}
 * الاسم من التوكن (X-Device-Id يحقنه QMC.apiFetch) — لا يُرسَل.
 *
 * المداخل: سطر «البريد الإلكتروني» في الإعدادات (حسابي وحلقاتي)، وتنبيه
 * EMAIL_UNVERIFIED في الرسائل (inbox.js). كان IUG يرى التنبيه ولا يستطيع التأكيد.
 */
(function () {
  'use strict';

  var EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  var RESEND_GAP = 60;   // يطابق c_code_gap_sec في QMC_USER_ACCOUNT_PKG

  var st = null;   // { status, email } — آخر حالة من السيرفر
  var ui = { codeStep: false, busy: false, error: '', sentMsg: '', cooldown: 0, timer: null, email: '' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function call(path, body) {
    try {
      var r = await QMC.apiFetch('user/account/' + path, body
        ? { method: 'POST', body: body, timeoutMs: 40000 }   // الإرسال ينتظر خادم البريد
        : { timeoutMs: 20000 });
      var d = await r.json().catch(function () { return {}; });
      d = (d && typeof d === 'object') ? d : {};
      var ok = r.status === 200 && d.status === 'success';
      var msg = d.message != null ? String(d.message)
        : (r.status === 404 ? 'الخدمة لم تُفعَّل على الخادم بعد' : 'تعذّر إتمام الطلب (رمز ' + r.status + ')');
      return { ok: ok, message: msg, data: d };
    } catch (_) {
      return { ok: false, message: 'تعذّر الاتصال بالخادم — تحقّق من الإنترنت وأعد المحاولة', data: {} };
    }
  }

  async function fetchStatus() {
    var r = await call('status');
    if (!r.ok) return { error: r.message };
    st = {
      status: String(r.data.email_status || '').toUpperCase(),
      email: r.data.email ? String(r.data.email) : ''
    };
    return st;
  }

  function statusLabel(s) {
    switch (s.status) {
      case 'VERIFIED': return '<span class="em-ok"><i class="fas fa-circle-check"></i> ' + esc(s.email) + '</span>';
      case 'UNVERIFIED': return '<span class="em-warn">' + esc(s.email) + ' — غير مؤكَّد</span>';
      case 'SHARED': return '<span class="em-warn">غير مسجَّل (المسجّل مشتركٌ مع غيرك)</span>';
      default: return '<span class="em-warn">غير مسجَّل</span>';
    }
  }

  /* ---------- سطر الإعدادات ---------- */
  async function refreshRow() {
    var td = document.getElementById('settingsEmail');
    if (!td) return;
    if (!navigator.onLine) {
      if (!st) td.innerHTML = '<span class="em-muted">يحتاج اتصالًا</span>';
      return;
    }
    if (!st) td.innerHTML = '<span class="em-muted">جارٍ الجلب…</span>';
    var s = await fetchStatus();
    td.innerHTML = s.error ? '<span class="em-muted">' + esc(s.error) + '</span>' : statusLabel(s);
    var btn = document.getElementById('settingsEmailBtn');
    if (btn && !s.error) {
      btn.querySelector('span').textContent = s.status === 'VERIFIED' ? 'تغيير البريد' : 'تأكيد البريد';
    }
  }

  /* ---------- الحوار: البريد ⇐ «أرسل الرمز» ⇐ الرمز ⇐ «تأكيد» ---------- */
  function ensureModal() {
    var ov = document.getElementById('emailModal');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'emailModal';
    ov.className = 'modal-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.style.display = 'none';
    ov.innerHTML = '<div class="modal-box em-box"></div>';
    document.body.appendChild(ov);
    return ov;
  }

  function intro() {
    switch (st && st.status) {
      case 'VERIFIED': return 'بريدك المؤكَّد: ' + st.email + '\nتستطيع تغييره ببريدٍ آخر تؤكّده.';
      case 'UNVERIFIED': return 'بريدك المسجّل لم يُؤكَّد بعد — تأكّد أنه بريدك ثم أكّده.';
      case 'SHARED': return 'البريد المسجّل لحسابك ليس بريدك (مشتركٌ مع حساباتٍ أخرى).';
      default: return 'لا بريد مسجّلًا لحسابك.';
    }
  }

  function render() {
    var box = document.querySelector('#emailModal .em-box');
    if (!box) return;
    var h = '<h4 class="modal-title"><i class="fas fa-at" style="color:var(--primary)"></i> البريد الإلكتروني</h4>';
    if (ui.error) h += '<div class="em-note em-err">' + esc(ui.error) + '</div>';
    if (!ui.codeStep) {
      h += '<div class="em-text">' + esc(intro()) + '</div>' +
        '<div class="em-sub">سجّل بريدك وأكّده برمزٍ يصلك عليه، ليصلك عليه رمز استعادة كلمة المرور إن نسيتها.</div>' +
        '<div class="em-note em-info">البريد اختياريّ — يمكنك «إلغاء» ويبقى لك تذكيرٌ في الرسائل. ' +
        'وإن نسيت كلمة المرور يُعيدها لك مدير مركزك.</div>' +
        '<div class="field"><label for="emInput">بريدك الإلكتروني</label>' +
        '<input type="email" id="emInput" dir="ltr" autocomplete="email" inputmode="email" ' +
        'placeholder="name@example.com" value="' + esc(ui.email) + '"' + (ui.busy ? ' disabled' : '') + '></div>';
    } else {
      h += '<div class="em-text">' + esc(ui.sentMsg || ('أرسلنا رمزًا إلى ' + ui.email)) + '</div>' +
        '<div class="em-sub">لم يصلك خلال دقيقة؟ تأكّد من العنوان، أو انظر في مجلّد الرسائل غير المرغوب فيها.</div>' +
        '<div class="field"><label for="emCode">الرمز (6 أرقام)</label>' +
        '<input type="text" id="emCode" class="em-code" dir="ltr" inputmode="numeric" autocomplete="one-time-code" ' +
        'maxlength="6"' + (ui.busy ? ' disabled' : '') + '></div>' +
        '<div class="em-links">' +
        '<button type="button" id="emChange"' + (ui.busy ? ' disabled' : '') + '><i class="fas fa-pen"></i> تغيير البريد</button>' +
        '<button type="button" id="emResend"' + (ui.busy || ui.cooldown > 0 ? ' disabled' : '') + '><i class="fas fa-rotate"></i> ' +
        (ui.cooldown > 0 ? 'أعد الإرسال (' + ui.cooldown + ')' : 'أعد الإرسال') + '</button></div>';
    }
    h += '<div class="modal-actions">' +
      '<button type="button" class="modal-btn modal-cancel" id="emCancel"' + (ui.busy ? ' disabled' : '') + '>إلغاء</button>' +
      '<button type="button" class="modal-btn modal-confirm" id="emGo"' + (ui.busy ? ' disabled' : '') + '>' +
      (ui.busy ? '<i class="fas fa-spinner fa-spin"></i>' : (ui.codeStep ? 'تأكيد' : 'أرسل الرمز')) + '</button></div>';
    box.innerHTML = h;

    var inp = document.getElementById(ui.codeStep ? 'emCode' : 'emInput');
    if (inp) {
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      if (ui.codeStep) inp.addEventListener('input', function () { inp.value = inp.value.replace(/\D/g, '').slice(0, 6); });
      if (!ui.busy) setTimeout(function () { try { inp.focus(); } catch (_) {} }, 50);
    }
    document.getElementById('emCancel').onclick = close;
    document.getElementById('emGo').onclick = go;
    var ch = document.getElementById('emChange');
    if (ch) ch.onclick = function () { ui.codeStep = false; ui.error = ''; render(); };
    var rs = document.getElementById('emResend');
    if (rs) rs.onclick = send;
  }

  function startCooldown() {
    clearInterval(ui.timer);
    ui.cooldown = RESEND_GAP;
    ui.timer = setInterval(function () {
      ui.cooldown--;
      if (ui.cooldown <= 0) clearInterval(ui.timer);
      var rs = document.getElementById('emResend');
      if (rs && !ui.busy) {
        rs.disabled = ui.cooldown > 0;
        rs.innerHTML = '<i class="fas fa-rotate"></i> ' + (ui.cooldown > 0 ? 'أعد الإرسال (' + ui.cooldown + ')' : 'أعد الإرسال');
      }
    }, 1000);
  }

  function go() { return ui.codeStep ? verify() : send(); }

  async function send() {
    if (ui.busy) return;
    if (!ui.codeStep) {
      var inp = document.getElementById('emInput');
      ui.email = inp ? inp.value.trim() : ui.email;
      if (!ui.email) { ui.error = 'أدخل بريدك الإلكتروني'; render(); return; }
      if (!EMAIL_RE.test(ui.email)) { ui.error = 'صيغة البريد غير صحيحة'; render(); return; }
    }
    ui.busy = true; ui.error = ''; render();
    var r = await call('email/send-code', { email: ui.email });
    ui.busy = false;
    if (r.ok) { ui.codeStep = true; ui.sentMsg = r.message; startCooldown(); }
    else ui.error = r.message;
    render();
  }

  async function verify() {
    if (ui.busy) return;
    var inp = document.getElementById('emCode');
    var code = inp ? inp.value.trim() : '';
    if (!/^\d{6}$/.test(code)) { ui.error = 'الرمز ستّة أرقام'; render(); return; }
    ui.busy = true; ui.error = ''; render();
    var r = await call('email/verify', { code: code });
    ui.busy = false;
    if (!r.ok) { ui.error = r.message; render(); return; }
    close();
    if (typeof showToast === 'function') showToast('✅ تم تأكيد بريدك');
    st = { status: 'VERIFIED', email: ui.email };
    refreshRow();
    // يزول تنبيه EMAIL_UNVERIFIED من الجرس
    if (window.QMC_INBOX && QMC_INBOX.fetch) QMC_INBOX.fetch().then(function () {
      if (window.QMC_INBOX.refreshUi) QMC_INBOX.refreshUi();
    }).catch(function () {});
  }

  function close() {
    clearInterval(ui.timer);
    var ov = document.getElementById('emailModal');
    if (ov) ov.style.display = 'none';
  }

  /** يجلب الحالة ثم يفتح الحوار — للتأكيد أو لتغيير بريدٍ مؤكَّد. */
  async function openEmailSettings() {
    if (!navigator.onLine) {
      if (typeof showToast === 'function') showToast('تأكيد البريد يحتاج اتصالًا بالإنترنت');
      return;
    }
    if (typeof showToast === 'function') showToast('جارٍ جلب حالة البريد…');
    var s = await fetchStatus();
    if (s.error) {
      if (typeof showAlert === 'function') showAlert({ title: 'تعذّر جلب حالة البريد', message: s.error, icon: '⚠️' });
      return;
    }
    ui = { codeStep: false, busy: false, error: '', sentMsg: '', cooldown: 0, timer: null, email: s.email || '' };
    ensureModal().style.display = 'flex';
    render();
  }

  /* ===================================================================
     🔑 تغيير كلمة المرور (2026-11-14) — نظير change_password_dialog.dart
     POST user/account/change-password {old_password, new_password} — الاسم من
     التوكن. ⚠️ المفتاحان يُرسَلان دائمًا (الغائب لا يُربط في ORDS ⇒ 555).
     القواعد مرآة password_problem في QMC_USER_ACCOUNT_PKG (وpassword_rules.dart)،
     والسيرفر هو الحَكَم. IUG لا يحفظ كلمة المرور ⇒ لا «تذكّرني» يُحدَّث.
     =================================================================== */
  var MIN_PW = 6;   // c_min_pw_len
  var pw = { busy: false, error: '', show: false };

  function newPasswordProblem(s, current, ids) {
    if (!s) return 'أدخل كلمة المرور الجديدة';
    // شاشة الدخول تقصّ المسافات الطرفية ⇒ كلمةٌ بها لا يُدخل بها أبدًا
    if (s !== s.trim()) return 'لا تبدأ ولا تنتهِ بمسافة';
    if (s.length < MIN_PW) return MIN_PW + ' أحرف على الأقل';
    if (current && s === current) return 'مطابقة لكلمة المرور الحالية';
    if (ids.some(function (i) { return i && s.toUpperCase() === String(i).toUpperCase(); })) {
      return 'لا تجعلها رقم هويتك — تلك هي الافتراضية المعروفة';
    }
    return null;
  }

  function pwField(id, label, hint) {
    return '<div class="field"><label for="' + id + '">' + label + '</label>' +
      '<input type="' + (pw.show ? 'text' : 'password') + '" id="' + id + '" dir="ltr" autocomplete="' +
      (id === 'pwOld' ? 'current-password' : 'new-password') + '"' + (pw.busy ? ' disabled' : '') + '>' +
      (hint ? '<small class="field-hint">' + hint + '</small>' : '') + '</div>';
  }

  function renderPw(keep) {
    var box = document.querySelector('#pwModal .em-box');
    if (!box) return;
    var vals = {};
    ['pwOld', 'pwNew', 'pwNew2'].forEach(function (k) { var e = document.getElementById(k); vals[k] = e ? e.value : ''; });
    box.innerHTML = '<h4 class="modal-title"><i class="fas fa-key" style="color:var(--primary)"></i> تغيير كلمة المرور</h4>' +
      (pw.error ? '<div class="em-note em-err">' + esc(pw.error) + '</div>' : '') +
      pwField('pwOld', 'كلمة المرور الحالية') +
      pwField('pwNew', 'كلمة المرور الجديدة', MIN_PW + ' أحرف على الأقل، ويُستحسن خلط الأرقام بالحروف') +
      pwField('pwNew2', 'تأكيد كلمة المرور الجديدة') +
      '<label class="pw-show"><input type="checkbox" id="pwShow"' + (pw.show ? ' checked' : '') + '> إظهار كلمات المرور</label>' +
      '<div class="modal-actions">' +
      '<button type="button" class="modal-btn modal-cancel" id="pwCancel"' + (pw.busy ? ' disabled' : '') + '>إلغاء</button>' +
      '<button type="button" class="modal-btn modal-confirm" id="pwGo"' + (pw.busy ? ' disabled' : '') + '>' +
      (pw.busy ? '<i class="fas fa-spinner fa-spin"></i> جارٍ الحفظ' : 'حفظ') + '</button></div>';
    if (keep) ['pwOld', 'pwNew', 'pwNew2'].forEach(function (k) { document.getElementById(k).value = vals[k]; });
    document.getElementById('pwCancel').onclick = closePw;
    document.getElementById('pwGo').onclick = savePw;
    document.getElementById('pwShow').onchange = function () { pw.show = this.checked; renderPw(true); };
    document.getElementById('pwNew2').addEventListener('keydown', function (e) { if (e.key === 'Enter') savePw(); });
    if (!keep && !pw.busy) setTimeout(function () { try { document.getElementById('pwOld').focus(); } catch (_) {} }, 50);
  }

  async function savePw() {
    if (pw.busy) return;
    var cur = document.getElementById('pwOld').value.trim();
    var nw = document.getElementById('pwNew').value;
    var nw2 = document.getElementById('pwNew2').value;
    var user = (window.QMC && QMC.getUserName()) || '';
    var bad = !cur ? 'أدخل كلمة المرور الحالية'
      : newPasswordProblem(nw, cur, [user])
      || (nw2 !== nw ? 'تأكيد الجديدة غير مطابق لها' : null);
    if (bad) { pw.error = bad; renderPw(true); return; }
    if (!navigator.onLine) { pw.error = 'تغيير كلمة المرور يحتاج اتصالًا بالإنترنت'; renderPw(true); return; }
    pw.busy = true; pw.error = ''; renderPw(true);
    var r = await call('change-password', { old_password: cur, new_password: nw });
    pw.busy = false;
    if (!r.ok) { pw.error = r.message || 'تعذّر تغيير كلمة المرور'; renderPw(true); return; }
    closePw();
    if (typeof showToast === 'function') showToast('✅ تمّ تغيير كلمة المرور — استعملها في الدخول القادم');
  }

  function closePw() {
    var ov = document.getElementById('pwModal');
    if (ov) ov.style.display = 'none';
  }

  function openChangePassword() {
    var ov = document.getElementById('pwModal');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'pwModal';
      ov.className = 'modal-overlay';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      ov.innerHTML = '<div class="modal-box em-box"></div>';
      document.body.appendChild(ov);
    }
    pw = { busy: false, error: '', show: false };
    ov.style.display = 'flex';
    renderPw(false);
  }

  /* ===================================================================
     🛡 صلاحياتي (2026-11-14) — نظير _PersonTab/_serverView في access_center_screen.dart
     GET sv/access/person/:id_no — صورةُ صاحب الحساب وحده (السيرفر يفرض ذلك).
     قراءةٌ بلا تخزين: الصورةُ لحظيّة، ونسخةٌ قديمة تُجيب عن «لماذا» بجوابِ أمس.
     =================================================================== */
  var VIA = { SEAT: 'مقعد وظيفي', CENTER_ADMIN: 'مدير المركز بالتعيين', REGION_ADMIN: 'مدير المنطقة بالتعيين',
              TEACHER: 'يحفّظ فيه حلقة', FIXED: 'الرقم المثبَّت' };
  var ROLE = { M: 'معلّم', A: 'مساعد', Q: 'متابِع', S: 'بديل' };
  var accSeq = 0;

  function up(v) { return v == null ? '' : String(v).toUpperCase(); }
  function rows(v) { return Array.isArray(v) ? v.filter(function (x) { return x && typeof x === 'object'; }) : []; }

  // نسخة PersonCapSource.label
  function sourceLabel(s) {
    var kind = up(s.kind), eff = up(s.effect), active = up(s.active) !== 'N', applies = up(s.applies) !== 'N';
    switch (kind) {
      case 'FLOOR': return 'مبرمج — يمرّ في كل شيء';
      case 'PERSON':
        var where = [s.root_name, s.center_name].filter(Boolean).join(' · ');
        return (eff === 'D' ? 'سحبٌ فرديّ' : 'منحةٌ فرديّة') + (where ? ' — ' + where : '') +
          (s.valid_to ? ' حتى ' + s.valid_to : '') + (active ? '' : ' (غير سارية الآن)');
      case 'JOB':
        return 'بمسمّاه: ' + (s.job_name || '—') + (s.seat_name ? ' — ' + s.seat_name : '') +
          (applies ? '' : ' (لا يسري: شرط المقعد أو المدّة)');
      case 'ASSIGNED': return 'مديرٌ بالتعيين' + (s.root_name ? ' — ' + s.root_name : '');
      default: return kind;
    }
  }
  function srcBlocks(s) { return up(s.kind) === 'PERSON' && up(s.effect) === 'D' && up(s.active) !== 'N'; }
  function srcIneffective(s) {
    return (up(s.kind) === 'JOB' && up(s.applies) === 'N') || (up(s.kind) === 'PERSON' && up(s.active) === 'N');
  }

  function examTypesLabel(raw) {
    return String(raw || '').split(':').map(function (x) { return x.trim(); }).filter(Boolean).map(function (c) {
      try {
        var n = typeof translateLookup === 'function' ? translateLookup('EXAM_TYPE', c) : '';
        return n && n !== 'غير معروف' && String(n) !== c ? n : c;
      } catch (_) { return c; }
    }).join('، ');
  }

  function facts(title, lines) {
    return '<details class="acc-facts"><summary>' + esc(title) + ' (' + lines.length + ')</summary>' +
      (lines.length ? lines.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('')
        : '<div class="em-muted">لا شيء</div>') + '</details>';
  }

  function renderAccess(p) {
    var caps = rows(p.capabilities).map(function (c) {
      return { name: c.name || c.code || '', desc: c.desc, has: up(c.has) === 'Y', sources: rows(c.sources) };
    });
    var seats = rows(p.seats).map(function (s) {
      return (s.job_name || ('مسمّى ' + s.job_no)) + ' — ' + (s.center_name || ('مركز ' + s.center_no));
    });
    var granted = caps.filter(function (c) { return c.has; }).length;
    // الممنوح أوّلًا: سؤال «ماذا أستطيع؟» قبل «ما لا أستطيع»
    caps.sort(function (a, b) { return (b.has ? 1 : 0) - (a.has ? 1 : 0); });

    var h = '<div class="acc-head"><b>' + esc(p.name || ('هوية ' + p.id_no)) + '</b>' +
      '<span class="acc-id">' + esc(p.id_no || '') + '</span><div class="acc-seats">' +
      (seats.length ? seats.map(function (s) { return '<span><i class="fas fa-id-badge"></i> ' + esc(s) + '</span>'; }).join('')
        : '<span>بلا مقعدٍ وظيفي</span>') + '</div>' +
      (caps.length ? '<div class="acc-count">يملك ' + granted + ' من ' + caps.length + ' قدرة</div>' : '') + '</div>';

    if (caps.length) {
      h += '<div class="more-h">القدرات</div><div class="acc-caps">' + caps.map(function (c) {
        var blocked = c.sources.some(srcBlocks);
        var active = c.sources.filter(function (s) { return !srcIneffective(s) && !srcBlocks(s); });
        var summary = c.has ? (active.length ? sourceLabel(active[0]) : 'نعم') : blocked ? 'مسحوبةٌ منه' : 'لا';
        var cls = c.has ? 'yes' : blocked ? 'blocked' : 'no';
        var icon = c.has ? 'fa-circle-check' : blocked ? 'fa-ban' : 'fa-circle-minus';
        return '<details class="acc-cap ' + cls + '"><summary><i class="fas ' + icon + '"></i>' +
          '<span><b>' + esc(c.name) + '</b><small>' + esc(summary) + '</small></span></summary>' +
          (c.desc ? '<div class="acc-kv"><em>يفتح</em>' + esc(c.desc) + '</div>' : '') +
          (c.sources.length ? c.sources.map(function (s) {
            return '<div class="acc-src' + (srcIneffective(s) ? ' off' : '') + '"><i class="fas ' +
              (srcBlocks(s) ? 'fa-ban' : srcIneffective(s) ? 'fa-hourglass-end' : 'fa-turn-down') + '"></i> ' +
              esc(sourceLabel(s)) + '</div>';
          }).join('') : '<div class="acc-kv"><em>من أين</em>لا منحة تخصّه — لا بمسمّاه ولا باسمه</div>') +
          '</details>';
      }).join('') + '</div>';
    } else {
      h += '<div class="em-note em-info">السيرفر لم يُرسل القدرات المحسوبة — تظهر هنا العلاقات وحدها.</div>';
    }

    h += '<div class="more-h">علاقاتٌ تفتح أبوابًا (لا تُمنح)</div><div class="acc-rel">' +
      facts('حلقاتي', rows(p.circles).map(function (c) {
        return (c.circle_name || c.circle_no) + '  ·  ' + (c.center_name || '') + '  ·  ' + (ROLE[up(c.emp_role)] || c.emp_role || '');
      })) +
      facts('لجاني الفعّالة', rows(p.sessions).map(function (s) {
        return (s.session_name || s.session_id) + '  ·  ' + (s.center_name || '') + '  ·  ' +
          (s.exam_types ? examTypesLabel(s.exam_types) : '—');
      })) +
      facts('المراكز التي أراها', rows(p.centers).map(function (c) {
        return (c.center_name || c.center_no) + '  ·  ' + (up(c.priv) === 'M' ? 'يدير' : 'يرى') + '  ·  ' + (VIA[up(c.via)] || c.via || '');
      })) + '</div>' +
      '<p class="acc-foot">«لماذا لا أرى كذا؟» — جوابه هنا: لكل قدرةٍ مصدرُها. وما تحتاجه ولا تملكه يمنحه مدير مؤسستك.</p>';
    return h;
  }

  async function loadAccess() {
    var box = document.getElementById('accessBody');
    if (!box) return;
    var seq = ++accSeq;
    var user = (window.QMC && QMC.getUserName()) || '';
    if (!navigator.onLine) {
      box.innerHTML = '<div class="em-note em-info"><i class="fas fa-wifi"></i> صلاحياتك تُقرأ من السيرفر لحظتها — تحتاج اتصالًا.</div>';
      return;
    }
    box.innerHTML = '<div class="em-muted" style="padding:12px 4px"><i class="fas fa-spinner fa-spin"></i> جارٍ جلب صلاحياتك…</div>';
    var msg = null, p = null;
    try {
      var r = await QMC.apiFetch('sv/access/person/' + encodeURIComponent(String(user).trim()), { timeoutMs: 20000 });
      var raw = await r.text();
      var d = null; try { d = JSON.parse(raw); } catch (_) {}
      if (r.status === 404 || r.status === 405) msg = 'صفحة الصلاحيات لم تُفعَّل على السيرفر بعد.';
      else if (r.status !== 200) msg = (d && d.message) || (r.status === 401 ? 'انتهت الجلسة — سجّل الدخول من جديد' : 'تعذّر جلب صلاحياتك (رمز ' + r.status + ')');
      else if (!d || typeof d !== 'object') msg = 'ردّ السيرفر ليس مفهومًا';
      else p = d;
    } catch (_) { msg = 'تعذّر الاتصال بالسيرفر — تحقّق من الشبكة'; }
    if (seq !== accSeq) return;
    box.innerHTML = p ? renderAccess(p)
      : '<div class="em-note em-err">' + esc(msg) + '</div><button type="button" class="em-row-btn" onclick="QmcAccount.loadAccess()">' +
        '<i class="fas fa-rotate"></i> إعادة المحاولة</button>';
  }

  var CSS =
    '.pw-show{display:flex;align-items:center;gap:8px;font-weight:500;margin:-2px 0 12px;font-size:13.5px;color:#5f6368}' +
    '.pw-show input{width:auto;min-height:0}' +
    '.acc-head{display:flex;flex-direction:column;gap:2px}' +
    '.acc-head b{font-size:17px;color:#111827}.acc-id{font-size:12.5px;color:#6b7280}' +
    '.acc-seats{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
    '.acc-seats span{background:#f1f3f6;border-radius:999px;padding:4px 10px;font-size:12.5px;color:#374151}' +
    '.acc-count{margin-top:10px;padding-top:10px;border-top:1px solid #eceff3;font-weight:700;color:#374151}' +
    '.acc-caps,.acc-rel{background:#fff;border:1px solid #e6eaef;border-radius:16px;overflow:hidden}' +
    '.acc-cap+.acc-cap,.acc-facts+.acc-facts{border-top:1px solid #eef1f4}' +
    '.acc-cap summary,.acc-facts summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:12px;padding:12px 14px;min-height:52px}' +
    '.acc-cap summary::-webkit-details-marker,.acc-facts summary::-webkit-details-marker{display:none}' +
    '.acc-cap summary>i{font-size:18px;flex:none}' +
    '.acc-cap summary span{display:flex;flex-direction:column;min-width:0}' +
    '.acc-cap summary b{font-size:14.5px;color:#111827}.acc-cap summary small{font-size:12.5px;color:#6b7280}' +
    '.acc-cap.yes summary>i{color:#17764a}.acc-cap.blocked summary>i{color:#9f1239}.acc-cap.no summary>i{color:#9aa3af}' +
    '.acc-cap.no summary b{font-weight:500;color:#4b5563}' +
    '.acc-cap[open]{background:#fafbfd}.acc-cap>div{padding:0 14px 6px 44px;font-size:13px;color:#374151;line-height:1.6}' +
    '.acc-cap>div:last-child{padding-bottom:12px}.acc-src.off{color:#9aa3af}.acc-src i{color:#6b7280;font-size:11px}' +
    '.acc-kv em{font-style:normal;color:#6b7280;margin-left:8px}' +
    '.acc-facts summary{font-weight:700;font-size:14px;color:#374151;justify-content:space-between}' +
    '.acc-facts summary::after{content:"\\f107";font-family:"Font Awesome 6 Free";font-weight:900;color:#9aa3af}' +
    '.acc-facts[open] summary::after{content:"\\f106"}' +
    '.acc-facts>div{padding:0 14px 8px;font-size:13px;color:#374151;line-height:1.7}' +
    '.acc-foot{font-size:12.5px;color:#6b7280;margin:12px 4px 0;line-height:1.6}' +
    '.em-box{text-align:right;max-width:420px}' +
    '.em-box .modal-title{display:flex;align-items:center;gap:8px}' +
    '.em-text{white-space:pre-line;color:#202124;font-size:14px;line-height:1.7;margin-bottom:6px}' +
    '.em-sub{color:#5f6368;font-size:12.5px;line-height:1.6;margin-bottom:10px}' +
    '.em-note{border-radius:10px;padding:8px 12px;font-size:13px;line-height:1.6;margin-bottom:12px}' +
    '.em-info{background:var(--primary-wash);color:var(--primary-dark)}' +
    '.em-err{background:#fce8e6;color:#b3261e}' +
    '.em-box .field{margin-bottom:12px}' +
    '.em-box input[type=email]{text-align:left}' +
    '.em-code{text-align:center;font-size:24px !important;letter-spacing:8px;font-weight:800}' +
    '.em-links{display:flex;justify-content:space-between;gap:8px;margin:-4px 0 14px}' +
    '.em-links button{background:transparent;color:var(--primary);padding:6px 4px;font-size:13px}' +
    '.em-ok{color:#137333}.em-warn{color:#b26a00}.em-muted{color:#80868b;font-weight:400}' +
    '.em-row-btn{width:100%;margin-top:10px;background:var(--primary-wash);color:var(--primary-dark)}';
  (function injectCss() {
    var s = document.createElement('style');
    s.id = 'accountStyle';
    s.textContent = CSS;
    document.head.appendChild(s);
  })();

  window.openEmailSettings = openEmailSettings;
  window.openChangePassword = openChangePassword;
  window.QmcAccount = { refreshRow: refreshRow, openEmailSettings: openEmailSettings,
                        openChangePassword: openChangePassword, loadAccess: loadAccess };
})();
