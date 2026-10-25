// ============================================================================
// inbox.js — صندوق الرسائل + إشعارات الجوال (نسخة inbox_service.dart و
//            push_notifications_screen.dart في Flutter)
// ----------------------------------------------------------------------------
// المصدر: Inbox/getMessages/{user} (QMC_INBOX_PKG.messages_json) — إعلانات
//   مُنشأة + تنبيهات محسوبة. درجة الظهور `display` يقرّرها السيرفر:
//   BELL جرس وحده · BANNER شريط أعلى الشاشة · DIALOG نافذة مرّة في اليوم.
// التخزين: localStorage بمفتاح صاحبه (inbox_cache:<user> و inbox_seen:<user>)
//   فلا يرث الحساب التالي على الجهاز رسائل من قبله ولا إقراراته.
// ⚠️ كالأصل: الإقرار بالقراءة فعلُ إنسان ⇒ يُثبَّت محليًّا أوّلًا ولا يُمسح
//   مع السحب، وما لم يصل السيرفر يُعاد مع كل سحب (المفتاح P<id>).
// ⚠️ بلا ?? ولا ?. — متصفحات أندرويد القديمة ترفض الملف كلّه (انظر api.js).
// ============================================================================
(function () {
  var REFRESH_MS = 10 * 60 * 1000;   // سحبٌ عند العودة إلى التطبيق بعد 10 دقائق
  var ROW_LABELS = {                  // kInboxRowLabels
    name: 'الاسم', teacher: 'المحفّظ', circle: 'الحلقة',
    last_activity: 'آخر نشاط', missed_days: 'أيام بلا تحفيظ',
    last_session: 'آخر حصة', missed_sessions: 'حصص بلا تسجيل',
    no_appt: 'قرّاء بلا موعد', days_idle: 'الأيام', count: 'العدد'
  };

  function user() { return String(QMC.getUserName() || '').trim(); }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function readJson(key, dflt) {
    try { var v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? dflt : v; }
    catch (_) { return dflt; }
  }
  function writeJson(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (_) {}
  }

  /* ---------- المخزن ---------- */
  function cacheKey() { return 'inbox_cache:' + user(); }
  function seenKey() { return 'inbox_seen:' + user(); }
  function loadCache() { return readJson(cacheKey(), { fetchedAt: null, items: [] }); }
  function seen() { return readJson(seenKey(), {}); }
  function putSeen(k, v) {
    var s = seen();
    if (v === null) delete s[k]; else s[k] = v;
    writeJson(seenKey(), s);
  }

  function parseData(m) {
    var d = m.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { d = null; } }
    return (d && typeof d === 'object') ? d : {};
  }

  // الإعلان برقمه، والتنبيه برمزه **ونطاقه** — LAGGING_TEACHERS رسالةٌ لكل (مركز · جنس)
  function localKey(m) {
    if (m.id != null) return 'A' + m.id;
    var d = parseData(m);
    var g = String(d.gender || '').toUpperCase();
    var scope = [d.center_no, (g === 'M' || g === 'F') ? g : null]
      .filter(function (v) { return v != null && v !== ''; }).join('_');
    var base = 'C' + (m.code || m.title || '');
    return scope ? base + '#' + scope : base;
  }

  function normalize(j) {
    var disp = String(j.display || '').toUpperCase();
    var m = {
      id: (j.id == null || j.id === '') ? null : Number(j.id),
      kind: j.kind ? String(j.kind) : 'ANNOUNCEMENT',
      code: j.code ? String(j.code) : null,
      severity: j.severity ? String(j.severity) : 'INFO',
      title: j.title ? String(j.title) : '',
      body: j.body ? String(j.body) : '',
      created_at: j.created_at ? String(j.created_at) : null,
      read: String(j.read || '').toUpperCase() === 'Y',
      data: parseData(j),
      // درجة مجهولة (سيرفر أحدث) ⇒ الجرس: لا نقاطع بما لا نفهمه
      display: (disp === 'DIALOG' || disp === 'BANNER') ? disp : 'BELL'
    };
    m.key = localKey(m);
    return m;
  }

  function isAnn(m) { return m.kind === 'ANNOUNCEMENT'; }
  function isAlert(m) { return m.kind === 'ALERT'; }
  function isRead(m) { return m.read || (isAnn(m) && seen()['R' + m.key] != null); }

  function all() {
    var items = (loadCache().items || []).slice();
    function rank(m) {
      return (m.severity === 'URGENT' ? 4 : 0) + (isRead(m) ? 0 : 2) + (isAlert(m) ? 1 : 0);
    }
    items.sort(function (a, b) {
      var r = rank(b) - rank(a);
      if (r) return r;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
    return items;
  }

  // التنبيهات المحسوبة تُعدّ دائمًا (لا قراءة لها)
  function unreadCount() {
    return all().filter(function (m) { return isAlert(m) || !isRead(m); }).length;
  }

  /* ---------- الشبكة ---------- */
  var inFlight = null;

  // طلبٌ واحد في كل لحظة — الإقلاع وعودة الشبكة قد ينطلقان معًا
  function fetchMessages() {
    if (inFlight) return inFlight;
    inFlight = doFetch().then(function (n) { inFlight = null; return n; },
                              function (e) { inFlight = null; throw e; });
    return inFlight;
  }

  async function doFetch() {
    var u = user();
    if (!u || !navigator.onLine) return 0;
    var res = await QMC.apiFetch('Inbox/getMessages/' + encodeURIComponent(u));
    if (res.status !== 200) throw new Error('تعذّر جلب الرسائل (رمز ' + res.status + ')');
    var body = await res.json().catch(function () { return null; });
    if (u !== user()) return 0;   // خرج صاحب الطلب أثناءه
    var items = (body && body.items) || [];
    var raw = [];
    if (items.length) {
      raw = items[0].messages || [];
      if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (_) { raw = []; } }
      if (!Array.isArray(raw)) raw = [];
    }
    var list = raw.filter(function (x) { return x && typeof x === 'object'; }).map(normalize);
    writeJson(cacheKey(), { fetchedAt: new Date().toISOString(), items: list });
    await flushPendingReads();
    return list.length;
  }

  async function postRead(id) {
    try {
      var res = await QMC.apiFetch('Inbox/markRead', {
        method: 'POST', timeoutMs: 15000,
        // كل مفتاح يذكره المعالج يُرسَل — الغائب لا يُربط ⇒ 555
        body: { username: user(), announcement_id: id }
      });
      if (res.status !== 200) return false;
      var d = await res.json().catch(function () { return null; });
      return !d || typeof d !== 'object' || d.status === 'success';
    } catch (_) { return false; }
  }

  async function markRead(m) {
    if (!isAnn(m) || m.id == null || isRead(m)) return;
    putSeen('R' + m.key, new Date().toISOString());
    if (!(await postRead(m.id))) putSeen('P' + m.id, new Date().toISOString());
  }

  async function flushPendingReads() {
    var s = seen();
    var keys = Object.keys(s).filter(function (k) { return k.charAt(0) === 'P'; });
    for (var i = 0; i < keys.length; i++) {
      var id = parseInt(keys[i].substring(1), 10);
      if (isNaN(id) || (await postRead(id))) putSeen(keys[i], null);
    }
  }

  /* ---------- الأنماط ---------- */
  var CSS = [
    '.inbox-btn{position:relative;background:#e8f0fe;color:#1967d2;padding:8px 12px}',
    '.inbox-btn:hover{background:#d2e3fc}',
    '.inbox-badge{position:absolute;top:-6px;left:-6px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;',
    'background:#d93025;color:#fff;font-size:11px;font-weight:700;line-height:18px;text-align:center;display:none}',
    '.inbox-banner{display:flex;align-items:flex-start;gap:10px;max-width:1000px;margin:10px auto 0;padding:10px 14px;',
    'border-radius:12px;font-size:14px;line-height:1.6;cursor:pointer}',
    '.inbox-banner .ib-text{flex:1;min-width:0}',
    '.inbox-banner .ib-close{background:transparent;color:inherit;padding:2px 8px;font-size:16px;flex-shrink:0}',
    '.sev-INFO{background:#e8f0fe;border:1px solid #c6dafc;color:#174ea6}',
    '.sev-WARN{background:#fef7e0;border:1px solid #fde293;color:#8a5a00}',
    '.sev-URGENT{background:#fce8e6;border:1px solid #f6aea9;color:#a50e0e}',
        // تحت appModal (3000): نافذة التأكيد تُفتح من فوق الصندوق
    '#inboxSheet{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2900;background:rgba(32,33,36,.45);display:none}',
    '#inboxSheet .is-panel{position:absolute;top:0;bottom:0;right:0;width:100%;max-width:560px;background:#f8f9fa;',
    'display:flex;flex-direction:column;box-shadow:0 0 24px rgba(0,0,0,.2)}',
    '#inboxSheet .is-head{display:flex;align-items:center;gap:8px;padding:12px 16px;background:#fff;border-bottom:1px solid #e0e3e7;',
    'padding-top:calc(12px + env(safe-area-inset-top))}',
    '#inboxSheet .is-head h3{flex:1;margin:0;font-size:17px;color:#202124}',
    '#inboxSheet .is-head button{background:transparent;color:#5f6368;padding:6px 10px;font-size:16px}',
    '#inboxSheet .is-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 16px 32px}',
    '.is-meta{color:#5f6368;font-size:12px;margin:0 0 10px}',
    '.is-card{background:#fff;border:1px solid #e0e3e7;border-radius:14px;padding:12px 14px;margin-bottom:10px}',
    '.is-card.unread{border-right:4px solid #1a73e8}',
    '.is-card.URGENT{border-right:4px solid #d93025}',
    '.is-card .t{font-weight:700;color:#202124;font-size:15px;margin-bottom:2px}',
    '.is-card .s{color:#5f6368;font-size:12px;margin-bottom:6px}',
    '.is-card .b{white-space:pre-wrap;line-height:1.7;color:#3c4043;font-size:14px}',
    '.is-card .f{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;color:#80868b;font-size:12px}',
    '.is-card .f button{background:#e8f0fe;color:#1967d2;padding:6px 12px;font-size:13px}',
    '.is-rows{margin-top:8px;overflow-x:auto;border:1px solid #e0e3e7;border-radius:8px}',
    '.is-rows table{border-collapse:collapse;width:100%;font-size:12px}',
    '.is-rows th{background:#f1f3f4;font-weight:700;text-align:right;padding:6px;white-space:nowrap}',
    '.is-rows td{padding:5px 6px;border-top:1px solid #f1f3f4}',
    '.is-empty{text-align:center;color:#5f6368;padding:28px 8px;line-height:1.8}',
    '.is-sec{font-weight:700;color:#455a64;font-size:14px;margin:20px 0 8px}',
    '.is-push{background:#fff;border:1px solid #e0e3e7;border-radius:14px;padding:14px;line-height:1.7;font-size:14px;color:#3c4043}',
    '.is-push .btnrow{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}',
    '.is-push .btnrow button,.is-push .btnrow a{background:#1a73e8;color:#fff;padding:9px 14px;border-radius:10px;',
    'text-decoration:none;font-size:14px;font-weight:600;display:inline-flex;align-items:center;gap:6px}',
    '.is-push .btnrow .sec{background:#e8f0fe;color:#1967d2}',
    '.is-code{font-size:28px;font-weight:800;letter-spacing:6px;text-align:center;direction:ltr;margin:10px 0;color:#202124}',
    '.is-dev{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #f1f3f4}',
    '.is-dev:first-child{border-top:0}',
    '.is-dev .n{flex:1}',
    '.is-dev button{background:transparent;color:#c5221f;padding:4px 8px}',
    '.is-steps{margin:6px 0 0;padding-right:18px}'
  ].join('');

  function injectCss() {
    if (document.getElementById('inboxStyle')) return;
    var st = document.createElement('style');
    st.id = 'inboxStyle';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------- الجرس والأشرطة ---------- */
  function renderBadge() {
    var b = document.getElementById('inboxBadge');
    if (!b) return;
    var n = unreadCount();
    b.textContent = n > 99 ? '99+' : String(n);
    b.style.display = n ? 'inline-block' : 'none';
  }

  function scopeLabel(m) {
    var d = m.data || {};
    var bits = [];
    if (d.center_name) bits.push(String(d.center_name));
    else if (d.center_no != null && d.center_no !== '') bits.push('مركز ' + d.center_no);
    var g = String(d.gender || '').toUpperCase();
    if (g === 'M') bits.push('حلقات الطلاب');
    if (g === 'F') bits.push('حلقات الطالبات');
    return bits.join(' · ');
  }

  function banners() {
    var s = seen(), t = today();
    return all().filter(function (m) {
      return m.display === 'BANNER' && !(isAnn(m) && isRead(m)) && s['B' + m.key] !== t;
    });
  }

  function renderBanners() {
    var host = document.getElementById('inboxBanners');
    if (!host) return;
    host.innerHTML = banners().map(function (m) {
      var sev = esc(m.severity);
      return '<div class="inbox-banner sev-' + sev + '" data-key="' + esc(m.key) + '">' +
        '<i class="fas fa-bullhorn" style="margin-top:4px"></i>' +
        '<div class="ib-text"><b>' + esc(m.title) + '</b>' +
        (m.body ? '<div>' + esc(m.body.length > 160 ? m.body.substring(0, 160) + '…' : m.body) + '</div>' : '') +
        '</div><button type="button" class="ib-close" title="إخفاء لبقيّة اليوم" aria-label="إخفاء">✕</button></div>';
    }).join('');
    Array.prototype.forEach.call(host.querySelectorAll('.inbox-banner'), function (el) {
      var key = el.getAttribute('data-key');
      el.querySelector('.ib-close').onclick = function (e) {
        e.stopPropagation();
        putSeen('B' + key, today());   // يعود غدًا إن بقي سببه قائمًا
        renderBanners();
      };
      el.onclick = function () { openInbox(); };
    });
  }

  function refreshUi() {
    renderBadge();
    renderBanners();
    var sheet = document.getElementById('inboxSheet');
    if (sheet && sheet.style.display === 'block') renderList();
  }

  /* ---------- النافذة اليومية (DIALOG) ---------- */
  var dialogsShown = false;

  async function showPendingDialogs() {
    if (dialogsShown) return;
    dialogsShown = true;
    var s = seen(), t = today();
    var list = all().filter(function (m) {
      return m.display === 'DIALOG' && !(isAnn(m) && isRead(m)) && s[m.key] !== t;
    });
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      putSeen(m.key, t);   // مرّةً في اليوم — وإلا تعلّم المستخدم إغلاقها بلا قراءة
      var extra = (m.data && Array.isArray(m.data.rows) && m.data.rows.length)
        ? '\n\n(التفاصيل في «الرسائل»)' : '';
      var scope = scopeLabel(m);
      var ok = await showConfirm({
        title: m.title || 'رسالة',
        message: (scope ? scope + '\n\n' : '') + m.body + extra,
        icon: m.severity === 'URGENT' ? '🔴' : (isAlert(m) ? '🔔' : '📢'),
        confirmText: isAnn(m) ? 'اطّلعت' : 'الرسائل',
        cancelText: 'لاحقًا'
      });
      if (ok) {
        if (isAnn(m)) await markRead(m);
        else { openInbox(); break; }
      }
    }
    refreshUi();
  }

  /* ---------- شاشة الرسائل ---------- */
  function ensureSheet() {
    var sheet = document.getElementById('inboxSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'inboxSheet';
    sheet.setAttribute('role', 'dialog');
    sheet.innerHTML =
      '<div class="is-panel">' +
        '<div class="is-head">' +
          '<h3><i class="fas fa-bell"></i> الرسائل والإشعارات</h3>' +
          '<button type="button" id="inboxRefreshBtn" title="تحديث"><i class="fas fa-rotate"></i></button>' +
          '<button type="button" id="inboxCloseBtn" title="إغلاق">✕</button>' +
        '</div>' +
        '<div class="is-body"><div id="inboxList"></div><div id="inboxPush"></div></div>' +
      '</div>';
    document.body.appendChild(sheet);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) closeInbox(); });
    document.getElementById('inboxCloseBtn').onclick = closeInbox;
    document.getElementById('inboxRefreshBtn').onclick = function () { refreshNow(true); };
    return sheet;
  }

  function rowsTable(rows) {
    var keys = Object.keys(rows[0]).filter(function (k) {
      return rows.some(function (r) { return r[k] != null && r[k] !== ''; });
    });
    if (!keys.length) return '';
    var h = '<div class="is-rows"><table><tr>' + keys.map(function (k) {
      return '<th>' + esc(ROW_LABELS[k] || k) + '</th>';
    }).join('') + '</tr>';
    rows.forEach(function (r) {
      h += '<tr>' + keys.map(function (k) {
        return '<td>' + esc(r[k] == null || r[k] === '' ? '—' : r[k]) + '</td>';
      }).join('') + '</tr>';
    });
    return h + '</table></div>';
  }

  function stamp(iso) {
    var s = String(iso || '');
    return s.length >= 16 ? s.substring(0, 16).replace('T', ' ') : s;
  }

  var listMsg = '';

  function renderList() {
    var host = document.getElementById('inboxList');
    if (!host) return;
    var items = all();
    var fetched = loadCache().fetchedAt;
    var h = '<p class="is-meta">' +
      (fetched ? 'آخر تحديث: ' + esc(stamp(new Date(fetched).toLocaleString('sv-SE'))) : 'لم تُجلب الرسائل بعد') +
      (navigator.onLine ? '' : ' · دون اتصال') +
      (listMsg ? ' · ' + esc(listMsg) : '') + '</p>';
    if (!items.length) {
      h += '<div class="is-empty"><i class="fas fa-inbox" style="font-size:30px;opacity:.5"></i><br>' +
           'لا رسائل الآن.</div>';
    }
    items.forEach(function (m) {
      var read = isRead(m), scope = scopeLabel(m);
      var rows = (m.data && Array.isArray(m.data.rows)) ? m.data.rows.filter(function (r) {
        return r && typeof r === 'object';
      }) : [];
      h += '<div class="is-card' + (m.severity === 'URGENT' ? ' URGENT' : (!read && isAnn(m) ? ' unread' : '')) + '">' +
        '<div class="t">' + (isAlert(m) ? '🔔 ' : '📢 ') + esc(m.title) + '</div>' +
        (scope ? '<div class="s">' + esc(scope) + '</div>' : '') +
        (m.body ? '<div class="b">' + esc(m.body) + '</div>' : '') +
        (rows.length ? rowsTable(rows) : '') +
        '<div class="f"><span>' + esc(m.created_at ? stamp(m.created_at) : (isAlert(m) ? 'تنبيه محسوب' : '')) +
        (m.data && m.data.end_at ? ' · حتى ' + esc(m.data.end_at) : '') + '</span>' +
        (isAnn(m) && !read && m.id != null
          ? '<button type="button" data-read="' + esc(m.key) + '">تمّ الاطلاع</button>'
          : (isAnn(m) ? '<span>✓ مقروءة</span>' : '')) +
        '</div></div>';
    });
    host.innerHTML = h;
    Array.prototype.forEach.call(host.querySelectorAll('button[data-read]'), function (b) {
      b.onclick = async function () {
        var key = b.getAttribute('data-read');
        var m = all().filter(function (x) { return x.key === key; })[0];
        if (!m) return;
        b.disabled = true;
        await markRead(m);
        refreshUi();
      };
    });
  }

  async function refreshNow(manual) {
    if (!navigator.onLine) {
      listMsg = manual ? 'تحتاج اتصالًا للتحديث' : '';
      refreshUi();
      return;
    }
    listMsg = manual ? 'جارٍ التحديث…' : '';
    if (manual) renderList();
    try {
      await fetchMessages();
      listMsg = '';
      try { localStorage.setItem('inbox_last_try', String(Date.now())); } catch (_) {}
    } catch (e) {
      listMsg = (e && e.message) ? e.message : 'تعذّر التحديث';
      console.warn('inbox:', e);
    }
    refreshUi();
  }

  function openInbox() {
    injectCss();
    var sheet = ensureSheet();
    sheet.style.display = 'block';
    document.body.style.overflow = 'hidden';
    renderList();
    renderPush();
    refreshNow(false);
  }

  function closeInbox() {
    var sheet = document.getElementById('inboxSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
  }

  /* ---------- إشعارات الجوال (push/* — QMC_PUSH_PKG، التطبيق 102) ----------
     الاشتراك لا يتمّ هنا: يتمّ في صفحة «إشعارات الصفوة» (APEX 102)، ودورنا
     رابطٌ يُدخل إليها بلا كلمة مرور + رمز 6 أرقام للآيفون (الصفحة المثبَّتة
     على الشاشة الرئيسية لا تشارك Safari جلسته). */
  function isIOS() {
    var ua = navigator.userAgent || '';
    return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }

  async function pushCall(path, body) {
    try {
      var res = await QMC.apiFetch('push/' + path, body
        ? { method: 'POST', body: body, timeoutMs: 40000 }
        : { timeoutMs: 20000 });
      var d = await res.json().catch(function () { return null; });
      if (!d || typeof d !== 'object') d = {};
      var ok = res.status === 200 && d.status === 'success';
      var msg = d.message ? String(d.message)
        : (res.status === 404 ? 'الخدمة لم تُفعَّل على الخادم بعد'
                              : 'تعذّر إتمام الطلب (رمز ' + res.status + ')');
      return { ok: ok, message: msg, data: d };
    } catch (_) {
      return { ok: false, message: 'تعذّر الاتصال بالخادم — تحقّق من الإنترنت وأعد المحاولة', data: {} };
    }
  }

  var pushState = { devices: undefined, url: null, code: null, until: 0, msg: '' };

  function browserName(b) {
    return { Edge: 'متصفّح Edge', Chrome: 'متصفّح Chrome', Firefox: 'متصفّح Firefox',
             Safari: 'آيفون (Safari)' }[b] || 'متصفّح آخر';
  }

  function renderPush() {
    var host = document.getElementById('inboxPush');
    if (!host) return;
    var ios = isIOS();
    var codeValid = pushState.code && Date.now() < pushState.until;
    var h = '<div class="is-sec">🔔 إشعارات الجوال</div><div class="is-push">' +
      'تصلك رسائل البرنامج وإعلاناته في إشعارات الجوال ولو كان التطبيق مغلقًا. ' +
      'تُفعَّل لكل جهازٍ مرّةً واحدة.';

    var d = pushState.devices;
    h += '<div style="margin-top:10px">';
    if (d === undefined) h += '<span style="color:#5f6368">جارٍ جلب أجهزتك…</span>';
    else if (d === null) h += '<span style="color:#5f6368">تعذّر جلب أجهزتك الآن — تحتاج اتصالًا.</span>';
    else if (!d.length) h += '<span style="color:#5f6368">لا يصلك إشعارٌ على أيّ جهازٍ بعد.</span>';
    else d.forEach(function (x) {
      h += '<div class="is-dev"><i class="fas ' + (x.browser === 'Safari' ? 'fa-mobile-screen-button' : 'fa-display') + '"></i>' +
        '<span class="n">' + esc(browserName(x.browser)) +
        (x.created_on ? ' <small style="color:#80868b">منذ ' + esc(String(x.created_on).substring(0, 10)) + '</small>' : '') +
        '</span><button type="button" data-dev="' + esc(x.id) + '" title="إيقاف على هذا الجهاز"><i class="fas fa-bell-slash"></i></button></div>';
    });
    h += '</div>';

    if (codeValid) {
      h += '<div style="margin-top:12px;padding-top:10px;border-top:1px solid #f1f3f4">' +
        (ios
          ? '<b>على الآيفون (iOS 16.4 فأحدث):</b><ol class="is-steps">' +
            '<li>اضغط «فتح صفحة الإشعارات» فتُفتح في Safari.</li>' +
            '<li>من Safari: زرّ المشاركة <i class="fas fa-arrow-up-from-bracket"></i> ثم «إضافة إلى الشاشة الرئيسية».</li>' +
            '<li>افتح «إشعارات الصفوة» من الشاشة الرئيسية، وادخل برقم هويّتك والرمز أدناه.</li>' +
            '<li>اضغط «تفعيل» ثم «سماح».</li></ol>'
          : 'اضغط «فتح صفحة الإشعارات» ثم «تفعيل» و«سماح». إن طلبت الصفحة الدخول فاستعمل رقم هويّتك والرمز:') +
        '<div class="is-code">' + esc(pushState.code.split('').join(' ')) + '</div>' +
        '<div style="text-align:center;color:#80868b;font-size:12px">الرمز صالحٌ حتى ' +
        esc(new Date(pushState.until).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })) + '</div>' +
        '<div class="btnrow">' +
          '<a href="' + esc(pushState.url) + '" target="_blank" rel="noopener"><i class="fas fa-up-right-from-square"></i> فتح صفحة الإشعارات</a>' +
          '<button type="button" class="sec" id="pushCopyCode"><i class="fas fa-copy"></i> نسخ الرمز</button>' +
          '<button type="button" class="sec" id="pushCopyLink"><i class="fas fa-link"></i> نسخ الرابط</button>' +
        '</div></div>';
    }

    h += '<div class="btnrow">' +
      '<button type="button" id="pushEnableBtn"><i class="fas fa-bell"></i> ' +
      (codeValid ? 'رابط ورمز جديدان' : 'تفعيل الإشعارات على جهاز') + '</button>' +
      (d && d.length ? '<button type="button" class="sec" id="pushTestBtn"><i class="fas fa-paper-plane"></i> إشعارٌ تجريبيّ</button>' : '') +
      '</div>' +
      (pushState.msg ? '<div style="margin-top:8px;color:#5f6368">' + esc(pushState.msg) + '</div>' : '') +
      '<div style="margin-top:10px;color:#5f6368;font-size:13px">لم يصلك الإشعار؟ تأكّد أنّ الإشعارات مسموحةٌ في إعدادات الجهاز ' +
      (ios ? '(الإعدادات ⇐ الإشعارات ⇐ إشعارات الصفوة).' : 'للمتصفّح وللموقع.') + '</div>' +
      '</div>';
    host.innerHTML = h;

    var en = document.getElementById('pushEnableBtn');
    if (en) en.onclick = enablePush;
    var tb = document.getElementById('pushTestBtn');
    if (tb) tb.onclick = async function () {
      tb.disabled = true;
      var r = await pushCall('test', {});
      pushState.msg = r.ok ? ('✅ ' + r.message) : ('❌ ' + r.message);
      renderPush();
    };
    var cc = document.getElementById('pushCopyCode');
    if (cc) cc.onclick = function () { copyText(pushState.code); };
    var cl = document.getElementById('pushCopyLink');
    if (cl) cl.onclick = function () { copyText(pushState.url); };
    Array.prototype.forEach.call(host.querySelectorAll('button[data-dev]'), function (b) {
      b.onclick = async function () {
        var ok = await showConfirm({ title: 'إيقاف الإشعارات', message: 'إيقاف الإشعارات على هذا الجهاز؟',
                                     confirmText: 'إيقاف', danger: true, icon: '🔕' });
        if (!ok) return;
        var r = await pushCall('device/remove', { id: b.getAttribute('data-dev') });
        pushState.msg = r.ok ? '' : ('❌ ' + r.message);
        loadDevices();
      };
    });

    if (d === undefined) loadDevices();
  }

  function copyText(t) {
    if (!t) return;
    var done = function () { showToast('✅ نُسخ'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(done, function () { prompt('انسخ:', t); });
    } else {
      prompt('انسخ:', t);
    }
  }

  var loadingDevices = false;
  async function loadDevices() {
    if (loadingDevices) return;
    loadingDevices = true;
    var r = navigator.onLine ? await pushCall('devices') : { ok: false };
    loadingDevices = false;
    pushState.devices = r.ok
      ? ((r.data.items || []).map(function (m) {
          return { id: String(m.id == null ? '' : m.id), browser: String(m.browser || 'other'), created_on: m.created_on };
        }))
      : null;
    renderPush();
  }

  async function enablePush() {
    var b = document.getElementById('pushEnableBtn');
    if (b) b.disabled = true;
    pushState.msg = '';
    var r = await pushCall('token', {});
    if (!r.ok || !r.data.url) {
      pushState.msg = '❌ ' + r.message;
      renderPush();
      return;
    }
    pushState.url = String(r.data.url);
    pushState.code = String(r.data.code || '');
    pushState.until = Date.now() + (Number(r.data.code_ttl_sec) || 600) * 1000;
    // ⚠️ لا window.open هنا: بعد انتظار الشبكة يحجبه Safari (ليس ضغطة المستخدم
    //    مباشرةً) — فيُعرض رابطٌ يضغطه هو.
    renderPush();
  }

  /* ---------- الإقلاع ---------- */
  async function boot() {
    if (!user()) return;
    injectCss();
    refreshUi();   // المخزون أوّلًا ليعمل دون اتصال
    if (!navigator.onLine) return;
    await refreshNow(false);
    showPendingDialogs();
  }

  window.addEventListener('load', function () { setTimeout(boot, 1500); });
  window.addEventListener('online', function () { refreshNow(false); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !user()) return;
    var last = 0;
    try { last = Number(localStorage.getItem('inbox_last_try') || 0); } catch (_) {}
    if (Date.now() - last > REFRESH_MS) refreshNow(false);
  });
  document.addEventListener('keydown', function (e) {
    var sheet = document.getElementById('inboxSheet');
    if (e.key === 'Escape' && sheet && sheet.style.display === 'block' &&
        !(typeof _modalResolve !== 'undefined' && _modalResolve)) closeInbox();
  });

  window.openInbox = openInbox;
  window.closeInbox = closeInbox;
  window.QMC_INBOX = { fetch: fetchMessages, all: all, unreadCount: unreadCount };
})();
