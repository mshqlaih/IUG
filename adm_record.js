// ============================================================================
// adm_record.js — 🗂 «سجلّي الإداريّ» (نسخة my_adm_record_screen.dart)
// ----------------------------------------------------------------------------
// ما صدر في حقّ المستخدم من شكرٍ وإجراءات، ولصاحب الإجراء أن يكتب ردّه عليه
// أو يعدّله أو يحذفه (يُرسَل فارغًا).
//   GET  org/adm-mine                              ⇒ {items:[…]}
//   POST org/adm {action:'REPLY', action_id, text} ⇒ {status, message}
// ⚠️ الأخطاء المنطقية تصل بـ200 و status:error — الرسالة تُعرض كما هي.
// 🔒 متّصلٌ فقط ولا شيء يُخزَّن على الجهاز — سجلّاتٌ شخصيّة (كأندرويد).
// المداخل: زرّ «سجلّي الإداريّ» في الإعدادات (حسابي وحلقاتي)، وزرّ «ردّك» على
//   رسالة الإجراء في الصندوق (inbox.js) يفتح السجلّ على خطابها.
// ⚠️ بلا ?? ولا ?. — متصفحات أندرويد القديمة ترفض الملف كلّه (انظر api.js).
// ============================================================================
(function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var CSS = [
    // فوق صندوق الرسائل (2900) وتحت appModal (3000)
    '#admSheet{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2950;background:rgba(32,33,36,.45);display:none}',
    '#admSheet .as-panel{position:absolute;top:0;bottom:0;right:0;width:100%;max-width:560px;background:#f8f9fa;',
    'display:flex;flex-direction:column;box-shadow:0 0 24px rgba(0,0,0,.2)}',
    '#admSheet .as-head{display:flex;align-items:center;gap:8px;padding:12px 16px;background:#fff;border-bottom:1px solid #e0e3e7;',
    'padding-top:calc(12px + env(safe-area-inset-top))}',
    '#admSheet .as-head h3{flex:1;margin:0;font-size:17px;color:#202124}',
    '#admSheet .as-head button{background:transparent;color:#5f6368;padding:6px 10px;font-size:16px}',
    '#admSheet .as-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 16px 32px}',
    '.as-note{color:#5f6368;font-size:13px;line-height:1.7;margin:0 0 10px}',
    '.as-card{background:#fff;border:1px solid #e0e3e7;border-radius:14px;padding:12px 14px;margin-bottom:10px;line-height:1.7}',
    '.as-card.focus{box-shadow:0 0 0 2px var(--primary)}',
    '.as-card .t{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px}',
    '.as-card .t .d{margin-right:auto;font-weight:400;color:#80868b;font-size:12px}',
    '.as-card .t.struck span.n{text-decoration:line-through;color:#80868b}',
    '.as-chip{font-size:11px;font-weight:600;padding:1px 8px;border-radius:10px;background:#f1f3f4;color:#455a64}',
    '.as-card .s{color:#5f6368;font-size:12.5px}',
    '.as-card .r{white-space:pre-wrap;color:#3c4043;font-size:14px;margin:6px 0 2px}',
    '.as-reply{background:#f1f3f4;border-radius:8px;padding:8px;font-size:13px;margin-top:6px;white-space:pre-wrap}',
    '.as-btns{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:6px;margin-top:8px}',
    '.as-btns button{background:var(--primary-wash);color:var(--primary);padding:6px 12px;font-size:13px}',
    '.as-btns button.main{background:var(--primary);color:#fff}',
    '.as-edit textarea{width:100%;box-sizing:border-box;min-height:96px;margin-top:8px;padding:8px;border:1px solid #dadce0;',
    'border-radius:8px;font:inherit;font-size:16px;line-height:1.6;resize:vertical}',
    '.as-msg{font-size:13px;margin-top:6px}',
    '.as-empty{text-align:center;color:#5f6368;padding:28px 8px;line-height:1.8}'
  ].join('');

  function injectCss() {
    if (document.getElementById('admStyle')) return;
    var st = document.createElement('style');
    st.id = 'admStyle';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------- الشبكة ---------- */
  async function call(path, body) {
    if (!navigator.onLine) throw new Error('سجلّك الإداريّ يحتاج اتصالًا — لا يُحفظ على الجهاز.');
    var res;
    try {
      res = await QMC.apiFetch(path, body
        ? { method: 'POST', body: body, timeoutMs: 40000 }
        : { timeoutMs: 40000 });
    } catch (_) {
      throw new Error('تعذّر الوصول إلى السيرفر — أعد المحاولة');
    }
    var d = await res.json().catch(function () { return null; });
    if (res.status === 200 && d && typeof d === 'object' && d.status !== 'error') return d;
    var msg = (d && d.message) ? String(d.message) : '';
    if (!msg && (res.status === 404 || res.status === 405)) msg = 'الخدمة غير مفعّلة على السيرفر بعد';
    throw new Error(msg || ('تعذّر الطلب (رمز ' + res.status + ')'));
  }

  /* ---------- الحالة ---------- */
  var st = { items: null, error: '', focus: null, editing: null, sending: false, msg: {} };

  function levelColor(a) {
    if (a.kind === 'THANKS') return '#188038';
    var n = Number(a.level_no) || 1;
    return n <= 1 ? '#b06000' : (n === 2 ? '#e8710a' : '#c5221f');
  }

  function title(a) {
    return a.kind === 'THANKS' ? 'شكرٌ وتقدير' : (a.level_name || ('إجراء ' + (a.level_no || '')));
  }

  function statusLabel(a) {
    return { DRAFT: 'بانتظار الإبلاغ', EXEMPT: 'أُعفي منه', CANCELLED: 'ملغًى' }[a.status] || '';
  }

  function effectText(a) {
    if (a.end_mode === 'DISMISS') return 'فصل المعلّم من الحلقة';
    if (a.class_before && a.class_after) return 'تصنيف الحلقة من «' + a.class_before + '» إلى «' + a.class_after + '»';
    return '';
  }

  function card(a) {
    var id = String(a.action_id);
    var struck = a.status === 'EXEMPT' || a.status === 'CANCELLED';
    var color = struck ? '#80868b' : levelColor(a);
    var lbl = statusLabel(a), eff = effectText(a);
    var thanks = a.kind === 'THANKS';
    var h = '<div class="as-card' + (st.focus && st.focus === a.letter_no ? ' focus' : '') + '" data-id="' + esc(id) + '">' +
      '<div class="t' + (struck ? ' struck' : '') + '" style="color:' + color + '">' +
        '<i class="fas ' + (thanks ? 'fa-award' : 'fa-file-signature') + '"></i>' +
        '<span class="n">' + esc(title(a)) + '</span>' +
        (lbl ? '<span class="as-chip">' + esc(lbl) + '</span>' : '') +
        '<span class="d">' + esc(a.date || '') + '</span></div>';
    if (a.circle_name) {
      h += '<div class="s">حلقة «' + esc(a.circle_name) + '»' + (a.center_name ? ' · ' + esc(a.center_name) : '') + '</div>';
    }
    if (a.reason) h += '<div class="r">' + esc(a.reason) + '</div>';
    if (eff) h += '<div class="s">الأثر: ' + esc(eff) + '</div>';
    (Array.isArray(a.violations) ? a.violations : []).forEach(function (v) {
      h += '<div class="s">• ' + esc(v.type_name || '') + ' — ' + esc(v.date || '') +
           (v.evidence ? ': ' + esc(v.evidence) : '') + '</div>';
    });
    if (a.exempt_note) {
      h += '<div class="s">' + (a.status === 'EXEMPT' ? 'سبب الإعفاء' : 'سبب الإلغاء') + ': ' + esc(a.exempt_note) + '</div>';
    }
    h += '<div class="s">خطاب ' + esc(a.letter_no || '') +
         (a.edited_at ? ' · عُدّل ' + esc(a.edited_at) : '') +
         (a.read_at ? ' · اطّلعتَ ' + esc(a.read_at) : '') + '</div>';

    if (st.editing === id) {
      h += '<div class="as-edit"><textarea id="admReplyText" maxlength="2000" ' +
           'placeholder="توضيحك للإدارة…">' + esc(a._draft != null ? a._draft : (a.reply_text || '')) + '</textarea>' +
           '<div class="as-btns">' +
             '<button type="button" data-cancel="1"' + (st.sending ? ' disabled' : '') + '>إلغاء</button>' +
             '<button type="button" class="main" data-send="' + esc(id) + '"' + (st.sending ? ' disabled' : '') + '>' +
               '<i class="fas fa-paper-plane"></i> ' + (st.sending ? 'جارٍ الإرسال…' : 'إرسال') + '</button>' +
           '</div></div>';
    } else {
      if (a.reply_text) {
        h += '<div class="as-reply"><b>ردّك</b>' + (a.reply_at ? ' (' + esc(a.reply_at) + ')' : '') + ': ' + esc(a.reply_text) + '</div>';
      }
      if (!thanks) {
        h += '<div class="as-btns"><button type="button" data-reply="' + esc(id) + '">' +
             '<i class="fas fa-reply"></i> ' + (a.reply_text ? 'تعديل ردّك' : 'ردّك') + '</button></div>';
      }
    }
    var m = st.msg[id];
    if (m) h += '<div class="as-msg" style="color:' + (m.ok ? '#188038' : '#c5221f') + '">' + esc(m.text) + '</div>';
    return h + '</div>';
  }

  function render() {
    var host = document.getElementById('admList');
    if (!host) return;
    var h = '<p class="as-note">ما صدر في حقّك من إجراءاتٍ وشكر. لك أن تكتب ردّك على أيّ إجراءٍ فيصل إلى الإدارة، ' +
            'وتعدّله متى شئت (ويُحذف إن أرسلته فارغًا).</p>';
    if (st.error) {
      h += '<div class="as-empty">' + esc(st.error) +
           '<div class="as-btns" style="justify-content:center"><button type="button" id="admRetry">إعادة المحاولة</button></div></div>';
    } else if (st.items === null) {
      h += '<div class="as-empty"><i class="fas fa-spinner fa-spin"></i> جارٍ الجلب…</div>';
    } else if (!st.items.length) {
      h += '<div class="as-empty">لا شيء في سجلّك — بارك الله في جهدك.</div>';
    } else {
      h += st.items.map(card).join('');
    }
    host.innerHTML = h;
    wire(host);
  }

  function find(id) {
    return (st.items || []).filter(function (a) { return String(a.action_id) === String(id); })[0];
  }

  function wire(host) {
    var rt = document.getElementById('admRetry');
    if (rt) rt.onclick = load;
    Array.prototype.forEach.call(host.querySelectorAll('button[data-reply]'), function (b) {
      b.onclick = function () {
        st.editing = b.getAttribute('data-reply');
        delete st.msg[st.editing];
        var a = find(st.editing);
        if (a) a._draft = null;
        render();
        var ta = document.getElementById('admReplyText');
        if (ta) { ta.focus(); ta.scrollIntoView({ block: 'center' }); }
      };
    });
    Array.prototype.forEach.call(host.querySelectorAll('button[data-cancel]'), function (b) {
      b.onclick = function () { st.editing = null; render(); };
    });
    Array.prototype.forEach.call(host.querySelectorAll('button[data-send]'), function (b) {
      b.onclick = function () { send(b.getAttribute('data-send')); };
    });
  }

  async function send(id) {
    var a = find(id);
    var ta = document.getElementById('admReplyText');
    if (!a || !ta || st.sending) return;
    var text = ta.value.trim();
    if (!text && !a.reply_text) { showToast('اكتب ردّك أوّلًا'); return; }
    st.sending = true;
    a._draft = ta.value;
    render();
    try {
      var r = await call('org/adm', { action: 'REPLY', action_id: Number(id), text: text });
      st.editing = null;
      st.msg[id] = { ok: true, text: '✅ ' + (r.message || 'وصل ردّك إلى الإدارة') };
      st.sending = false;
      await load(true);
    } catch (e) {
      st.sending = false;
      st.msg[id] = { ok: false, text: '❌ ' + ((e && e.message) || 'تعذّر الإرسال') };
      render();   // النصّ من a._draft — لا يضيع ما كتبه
    }
  }

  async function load(keepMsg) {
    st.error = '';
    if (!keepMsg) st.msg = {};
    if (st.items === null) render();
    try {
      var d = await call('org/adm-mine');
      st.items = Array.isArray(d.items) ? d.items.filter(function (x) { return x && typeof x === 'object'; }) : [];
    } catch (e) {
      st.items = st.items || null;
      st.error = (e && e.message) || 'تعذّر الجلب';
    }
    render();
    if (st.focus) {
      var el = document.querySelector('#admList .as-card.focus');
      if (el) el.scrollIntoView({ block: 'start' });
    }
  }

  /* ---------- الشاشة ---------- */
  function ensureSheet() {
    var sheet = document.getElementById('admSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'admSheet';
    sheet.setAttribute('role', 'dialog');
    sheet.innerHTML =
      '<div class="as-panel">' +
        '<div class="as-head">' +
          '<h3><i class="fas fa-folder-open"></i> سجلّي الإداريّ</h3>' +
          '<button type="button" id="admRefreshBtn" title="تحديث"><i class="fas fa-rotate"></i></button>' +
          '<button type="button" id="admCloseBtn" title="إغلاق">✕</button>' +
        '</div>' +
        '<div class="as-body"><div id="admList"></div></div>' +
      '</div>';
    document.body.appendChild(sheet);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) close(); });
    document.getElementById('admCloseBtn').onclick = close;
    document.getElementById('admRefreshBtn').onclick = function () { load(false); };
    return sheet;
  }

  // letterNo اختياريّ: يُبرز خطاب الرسالة التي جاء منها
  function open(letterNo) {
    injectCss();
    var sheet = ensureSheet();
    st.focus = letterNo || null;
    st.editing = null;
    st.items = null;
    sheet.style.display = 'block';
    document.body.style.overflow = 'hidden';
    load(false);
  }

  function close() {
    var sheet = document.getElementById('admSheet');
    if (sheet) sheet.style.display = 'none';
    var inbox = document.getElementById('inboxSheet');
    document.body.style.overflow = (inbox && inbox.style.display === 'block') ? 'hidden' : '';
  }

  // رسالة إجراءٍ في الصندوق؟ نصّها يذكر «سجلّي الإداريّ» — والتشكيل يُزال قبل المقارنة
  function letterOf(body) {
    var plain = String(body || '').replace(/[ً-ْ]/g, '');
    if (plain.indexOf('سجلي الإداري') < 0) return null;
    var m = plain.match(/رقم الخطاب[:：]?\s*([0-9]+\/[0-9]+\/[0-9]+)/);
    return m ? m[1] : '';
  }

  document.addEventListener('keydown', function (e) {
    var sheet = document.getElementById('admSheet');
    if (e.key === 'Escape' && sheet && sheet.style.display === 'block' &&
        !(typeof _modalResolve !== 'undefined' && _modalResolve)) {
      e.stopImmediatePropagation();
      close();
    }
  }, true);

  window.openAdmRecord = function () { open(null); };
  window.QmcAdm = { open: open, close: close, letterOf: letterOf };
})();
