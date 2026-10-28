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

  var CSS =
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
  window.QmcAccount = { refreshRow: refreshRow, openEmailSettings: openEmailSettings };
})();
