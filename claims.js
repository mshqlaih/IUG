/* 🚌 مصروفاتي (2026-11-14) — نظير lib/screens/ledger/my_claims_screen.dart و
 * LedgerService (المطالبات) في تطبيق أندرويد. QMC_LEDGER_PKG — docs/ledger/:
 *   GET  sv/claims?root=                        ⇒ {root_no, root_name, roots, gaza_today, categories, claims}
 *   POST sv/claims {action:SAVE|DELETE, client_id, root_no, cat_id, date, amount, description}
 *   POST sv/ledger/receipt?kind=C&cid=…         (جسمٌ ثنائيّ: صورة JPEG أو PDF)
 *   GET  sv/ledger/receipt?kind=C&cid=…
 * الاسم من التوكن. القدرة LEDGER_CLAIM (USER_ACCESS.capabilities) تُظهر البند.
 *
 * 📴 يعمل بلا اتصال كأندرويد: آخر نسخةٍ في localStorage `claims:<user>:<root>`،
 *    والمطالبة تُسجَّل بمعرّفٍ من الجهاز (client_id) فتدخل طابور `claims_queue:<user>`
 *    يُرفع عند الفتح وعند عودة الشبكة، والسيرفر يحدّث الصفّ نفسه إن وصل مرّتين.
 *    المرفوض يُعرض مرّة (`claims_rej:<user>`). المفاتيح باسم صاحبها ⇒ لا تُورَّث.
 * السقف الشهريّ يُفحص هنا وعلى السيرفر: تجاوزُه يُمنع. والمطالبة خلال 90 يومًا.
 */
(function () {
  'use strict';

  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var CUR = { ILS: '₪', USD: '$', JOD: 'د.أ' };
  var st = { data: null, root: null, month: '', offline: false, savedAt: null, error: '', loading: false };
  var form = null;   // { claim, cat, busy, error, receipt:{b64,type,name} }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function user() { return (window.QMC && QMC.getUserName()) || ''; }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } }
  function num(v) { if (v == null || v === '') return null; var n = Number(v); return isNaN(n) ? null : n; }

  function fmt(v) {
    v = Number(v) || 0;
    var neg = v < 0, a = Math.abs(v), whole = Math.trunc(a), frac = Math.round((a - whole) * 100);
    var s = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (frac > 0) s += frac % 10 === 0 ? '.' + (frac / 10) : '.' + String(frac).padStart(2, '0');
    return (neg ? '-' : '') + s;
  }
  function money(v, cur) { return fmt(v) + ' ' + (CUR[cur] || cur || ''); }
  function monthLabel(ym) { var m = parseInt(String(ym).substr(5, 2), 10); return m >= 1 && m <= 12 ? MONTHS[m - 1] + ' ' + ym.substr(0, 4) : ym; }
  function dayLabel(d) { var p = String(d).split('-'); var m = parseInt(p[1], 10); return p.length >= 3 && m >= 1 ? parseInt(p[2], 10) + ' ' + MONTHS[m - 1] : d; }
  function parseYmd(s) { var p = String(s || '').split('-').map(Number); return p.length >= 3 && p[0] ? new Date(p[0], p[1] - 1, p[2]) : null; }
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  // «١٢٫٥» و«12,5» ⇒ 12.5
  function parseAmount(s) {
    s = String(s || '').trim().replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); })
      .replace(/[٫,]/g, '.').replace(/\s/g, '');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    return Number(s);
  }

  /* ---------- النموذج (نسخة LedgerClaim/ClaimsData) ---------- */
  function normClaim(j) {
    return {
      id: num(j.claim_id), clientId: String(j.client_id || ''), catId: num(j.cat_id) || 0,
      date: String(j.date || ''), amount: num(j.amount) || 0, currency: String(j.currency || 'ILS'),
      description: String(j.description || ''), state: String(j.state || 'P') || 'P',
      approvedAmount: num(j.approved_amount), note: String(j.note || ''),
      hasReceipt: j.has_receipt === 'Y' || j.has_receipt === true, cap: num(j.cap) || 0,
      pending: j._pending === true, receiptPending: j._receipt_pending === true
    };
  }
  function toJson(c) {
    return { claim_id: c.id, client_id: c.clientId, cat_id: c.catId, date: c.date, amount: c.amount,
             currency: c.currency, description: c.description, state: c.state, approved_amount: c.approvedAmount,
             note: c.note, has_receipt: c.hasReceipt ? 'Y' : 'N', cap: c.cap };
  }
  function monthOf(c) { return c.date.substr(0, 7); }
  // المعتمد لما قُرّر، والمطلوب لما ينتظر، ولا شيء للمردود
  function counted(c) { return c.state === 'R' ? 0 : (c.state === 'A' || c.state === 'D') ? (c.approvedAmount != null ? c.approvedAmount : c.amount) : c.amount; }
  function stateLabel(c) {
    return { P: c.pending ? 'لم تُرسل بعد' : 'بانتظار الاعتماد', A: 'اعتُمدت — تنتظر الصرف', R: 'رُدّت', D: 'صُرفت' }[c.state] || c.state;
  }
  function parseData(j) {
    return {
      raw: j, rootNo: num(j.root_no) || 0, rootName: String(j.root_name || ''),
      roots: (j.roots || []).map(function (r) { return { rootNo: num(r.root_no) || 0, name: String(r.root_name || '') }; }),
      today: String(j.gaza_today || ymd(new Date())),
      categories: (j.categories || []).map(function (c) {
        return { id: num(c.cat_id) || 0, name: String(c.name || ''), currency: String(c.currency || 'ILS') || 'ILS', cap: num(c.cap) || 0 };
      }),
      claims: (j.claims || []).map(normClaim)
    };
  }
  function category(id) { return st.data ? st.data.categories.filter(function (c) { return c.id === id; })[0] : null; }
  function usedIn(cat, month, except) {
    return st.data.claims.filter(function (c) { return c.catId === cat && monthOf(c) === month && c.clientId !== except; })
      .reduce(function (s, c) { return s + counted(c); }, 0);
  }

  /* ---------- الشبكة ---------- */
  function Rejected(msg) { this.message = msg; this.rejected = true; }
  async function readJson(r) { var t = await r.text().catch(function () { return ''; }); try { return JSON.parse(t); } catch (_) { return null; } }
  function msgOf(r, d) {
    if (d && d.message) return String(d.message);
    if (r.status === 404 || r.status === 405) return 'المصروفات لم تُفعَّل على السيرفر بعد (رمز ' + r.status + ')';
    if (r.status === 555) return 'خدمة المصروفات معطّلة على السيرفر (555) — راجع الإدارة';
    return 'تعذّر إتمام الطلب (رمز ' + r.status + ')';
  }
  // الرمي: Rejected = رفضٌ من السيرفر (لا يُعاد) · غيره = انقطاع (يبقى في الطابور)
  async function get(q) {
    var r = await QMC.apiFetch('sv/claims' + (q ? '?' + q : ''), { timeoutMs: 30000 });
    var d = await readJson(r);
    if (r.status === 200 && d && d.status === 'success') return d;
    throw new Rejected(msgOf(r, d));
  }
  async function post(body) {
    var r = await QMC.apiFetch('sv/claims', { method: 'POST', body: body, timeoutMs: 40000 });
    var d = await readJson(r);
    if (r.status === 200 && d && d.status === 'success') return d;
    throw new Rejected(msgOf(r, d));
  }
  function b64ToBytes(b64) { var s = atob(b64), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  async function uploadReceipt(cid, rc) {
    var headers = { 'Content-Type': rc.type, 'X-Platform': 'web' };
    var did = QMC.getDeviceId(); if (did) headers['X-Device-Id'] = did;
    var r = await fetch(QMC.BASE + '/sv/ledger/receipt?kind=C&cid=' + encodeURIComponent(cid),
      { method: 'POST', headers: headers, body: b64ToBytes(rc.b64) });
    if (r.status !== 200) throw new Rejected(msgOf(r, await readJson(r)));
  }

  /* ---------- الطابور ---------- */
  function qKey() { return 'claims_queue:' + user(); }
  function queue() { return lsGet(qKey()) || []; }
  function setQueue(q) {
    if (!lsSet(qKey(), q)) throw new Error('ذاكرة الجهاز ممتلئة — لم تُحفظ المطالبة؛ صغّر صورة الإيصال أو احذفها');
  }
  function enqueue(op) {
    var q = queue();
    if (op.t === 'claim') {
      var i = q.findIndex(function (x) { return x.t === 'claim' && x.claim.client_id === op.claim.client_id; });
      if (i >= 0) { q[i] = op; setQueue(q); return; }
    }
    if (op.t === 'receipt') q = q.filter(function (x) { return !(x.t === 'receipt' && x.cid === op.cid); });
    q.push(op);
    setQueue(q);
  }
  function pendingCount() { return queue().filter(function (x) { return x.t !== 'receipt'; }).length; }

  var flushing = null;
  function flush() {
    if (flushing) return flushing;
    flushing = (async function () {
      if (!navigator.onLine || !user()) return;
      var q = queue(), rej = lsGet('claims_rej:' + user()) || [], changed = false;
      while (q.length) {
        var op = q[0];
        try {
          if (op.t === 'claim') await post(Object.assign({ action: 'SAVE' }, op.body));
          else if (op.t === 'claim_del') await post({ action: 'DELETE', client_id: op.cid });
          else if (op.t === 'receipt') await uploadReceipt(op.cid, op);
        } catch (e) {
          if (!e || !e.rejected) break;   // انقطاع ⇒ يبقى ويُعاد لاحقًا
          rej.push((op.t === 'claim' ? (op.label || 'مطالبة') + ': ' : op.t === 'receipt' ? 'إيصال: ' : 'حذف: ') + e.message);
          // رُفضت المطالبة ⇒ إيصالها لا مكان له
          if (op.t === 'claim') q = q.filter(function (x) { return !(x.t === 'receipt' && x.cid === op.body.client_id); });
        }
        q.shift(); changed = true;
        setQueue(q);
      }
      if (changed) lsSet('claims_rej:' + user(), rej);
    })().finally(function () { flushing = null; });
    return flushing;
  }

  function applyQueue(data) {
    queue().forEach(function (op) {
      if (op.t === 'claim' && Number(op.root) === data.rootNo) {
        var c = normClaim(op.claim); c.pending = true;
        var i = data.claims.findIndex(function (x) { return x.clientId === c.clientId; });
        if (i >= 0) data.claims[i] = c; else data.claims.push(c);
      } else if (op.t === 'claim_del') {
        data.claims = data.claims.filter(function (x) { return x.clientId !== op.cid; });
      } else if (op.t === 'receipt') {
        data.claims.forEach(function (x) { if (x.clientId === op.cid) x.receiptPending = true; });
      }
    });
    data.claims.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }

  function snapKey(root) { return 'claims:' + user() + ':' + root; }
  // نسخة الجهاز تتبع ما أُرسل الآن — فلا يختفي من القائمة بلا اتصال
  function patchSnap(root, c, serverId, remove) {
    var j = lsGet(snapKey(root)); if (!j) return;
    j.claims = (j.claims || []).filter(function (x) { return x.client_id !== c.clientId; });
    if (!remove) { var o = toJson(c); o.claim_id = serverId || c.id; j.claims.push(o); }
    lsSet(snapKey(root), j);
  }

  /* ---------- التحميل ---------- */
  async function load() {
    st.loading = !st.data; st.error = ''; render();
    try { await flush(); } catch (_) {}
    var root = st.root || lsGet('claims_root:' + user());
    try {
      var d = await get(root ? 'root=' + encodeURIComponent(root) : '');
      var data = parseData(d);
      lsSet(snapKey(data.rootNo), d);
      lsSet('claims_at:' + user() + ':' + data.rootNo, new Date().toISOString());
      lsSet('claims_root:' + user(), data.rootNo);
      applyQueue(data);
      st.data = data; st.root = data.rootNo; st.offline = false;
    } catch (e) {
      if (e && e.rejected) { st.error = e.message; st.data = null; }
      else {
        var raw = root ? lsGet(snapKey(root)) : null;
        if (!raw) st.error = 'لا اتصال، ولم تُفتح مصروفاتك على هذا الجهاز متّصلًا من قبل — افتحها مرّةً بالشبكة فتعمل بعدها بلا اتصال';
        else {
          var dd = parseData(raw); applyQueue(dd);
          st.data = dd; st.root = dd.rootNo; st.offline = true;
          st.savedAt = lsGet('claims_at:' + user() + ':' + root);
        }
      }
    }
    if (st.data && !st.month) st.month = st.data.today.substr(0, 7);
    st.loading = false;
    render();
    var rej = lsGet('claims_rej:' + user()) || [];
    if (rej.length) {
      lsSet('claims_rej:' + user(), []);
      if (typeof showAlert === 'function') showAlert({ title: 'لم تُقبل بعض المطالبات المرسلة لاحقًا', message: rej.map(function (x) { return '• ' + x; }).join('\n'), icon: '⚠️' });
    }
  }

  /* ---------- الصفحة ---------- */
  function capCard(c) {
    var used = usedIn(c.id, st.month), noCap = c.cap <= 0, ratio = noCap ? 0 : Math.min(1, used / c.cap);
    return '<div class="cl-cap"><div class="cl-cap-h"><b>' + esc(c.name) + '</b><span class="' + (noCap ? 'cl-warn' : '') + '">' +
      (noCap ? 'لم يُحدَّد سقفك بعد' : fmt(used) + ' من ' + money(c.cap, c.currency)) + '</span></div>' +
      (noCap ? '' : '<div class="cl-bar"><i class="' + (ratio >= 1 ? 'full' : '') + '" style="width:' + Math.round(ratio * 100) + '%"></i></div>' +
        '<small>الباقي ' + money(Math.max(0, c.cap - used), c.currency) + '</small>') + '</div>';
  }

  function claimRow(c) {
    var cat = category(c.catId), editable = c.state === 'P';
    var sub = [dayLabel(c.date)];
    if (c.description) sub.push(c.description);
    if (c.approvedAmount != null && c.approvedAmount !== c.amount) sub.push('اعتُمد ' + money(c.approvedAmount, c.currency));
    if (c.note) sub.push('ملاحظة الإدارة: ' + c.note);
    return '<div class="cl-row' + (editable ? ' tap' : '') + '"' + (editable ? ' data-edit="' + esc(c.clientId) + '"' : '') + '>' +
      '<div class="cl-row-t"><b>' + esc((cat ? cat.name : '') + ' — ' + money(c.amount, c.currency)) + '</b>' +
      '<span class="cl-tag s-' + esc(c.state) + '">' + (c.pending ? '<i class="fas fa-cloud-arrow-up"></i> ' : '') + esc(stateLabel(c)) + '</span></div>' +
      '<small>' + esc(sub.join(' · ')) + '</small><div class="cl-row-a">' +
      ((c.hasReceipt || c.receiptPending) ? '<button type="button" data-receipt="' + esc(c.clientId) + '"><i class="fas fa-receipt"></i> الإيصال</button>' : '') +
      (editable ? '<button type="button" data-del="' + esc(c.clientId) + '"><i class="fas fa-trash"></i> حذف</button>' : '') + '</div></div>';
  }

  function render() {
    var box = document.getElementById('claimsBody');
    if (!box) return;
    if (st.loading) { box.innerHTML = '<div class="em-muted" style="padding:12px 4px"><i class="fas fa-spinner fa-spin"></i> جارٍ التحميل…</div>'; return; }
    var d = st.data;
    if (!d) {
      box.innerHTML = '<div class="cl-note err">' + esc(st.error || 'تعذّر التحميل') + '</div>' +
        '<button type="button" class="em-row-btn" data-act="reload"><i class="fas fa-rotate"></i> إعادة المحاولة</button>';
      return;
    }
    var months = {}; months[d.today.substr(0, 7)] = 1;
    d.claims.forEach(function (c) { months[monthOf(c)] = 1; });
    var ms = Object.keys(months).sort().reverse().slice(0, 6);
    var list = d.claims.filter(function (c) { return monthOf(c) === st.month; });
    var pend = pendingCount();

    var h = '<div class="cl-top"><span>' + esc(d.rootName) + '</span>' +
      (d.roots.length > 1 ? '<button type="button" data-act="root"><i class="fas fa-right-left"></i> تبديل المؤسسة</button>' : '') +
      '<button type="button" data-act="reload"><i class="fas fa-rotate"></i> تحديث</button></div>';
    if (st.offline || pend) {
      h += '<div class="cl-note warn"><i class="fas fa-cloud-arrow-up"></i> ' + esc([
        st.offline ? 'بلا اتصال — ما تسجّله يُحفظ على الجهاز ويُرسل وحده عند عودة الشبكة.' : '',
        pend ? pend + ' لم يُرسل بعد.' : ''].filter(Boolean).join(' ')) + '</div>';
    }
    h += '<div class="day-filter cl-months">' + ms.map(function (m) {
      return '<button type="button" class="' + (m === st.month ? 'on' : '') + '" data-month="' + m + '">' + esc(monthLabel(m)) + '</button>';
    }).join('') + '</div>';
    if (!d.categories.length) h += '<div class="cl-note">لا أنواع مصروفاتٍ يُطالب بها في مؤسستك بعد — تضبطها الإدارة من «دفتر الصندوق».</div>';
    else h += d.categories.map(capCard).join('') +
      '<button type="button" class="btn-save cl-new" data-act="new"><i class="fas fa-plus"></i> مصروفٌ جديد</button>';
    h += list.length ? '<div class="cl-list">' + list.map(claimRow).join('') + '</div>'
      : '<div class="cl-note tip"><i class="fas fa-lightbulb"></i> لم تسجّل مصروفاتٍ في ' + esc(monthLabel(st.month)) +
        '. «مصروفٌ جديد» لكل مرّةٍ دفعتَ فيها مواصلات أو رصيد جوال للعمل، بتاريخها.</div>';
    box.innerHTML = h;
  }

  function onClick(e) {
    var b = e.target.closest('[data-act],[data-month],[data-edit],[data-del],[data-receipt]');
    if (!b) return;
    if (b.dataset.month) { st.month = b.dataset.month; return render(); }
    if (b.dataset.del) { e.stopPropagation(); return del(b.dataset.del); }
    if (b.dataset.receipt) { e.stopPropagation(); return showReceipt(b.dataset.receipt); }
    if (b.dataset.edit) return openForm(st.data.claims.filter(function (c) { return c.clientId === b.dataset.edit; })[0]);
    var a = b.dataset.act;
    if (a === 'reload') load();
    else if (a === 'new') openForm(null);
    else if (a === 'root') pickRoot();
  }

  async function pickRoot() {
    var d = st.data;
    var o = document.createElement('div');
    o.className = 'modal-overlay'; o.style.display = 'flex';
    o.innerHTML = '<div class="modal-box" style="text-align:start;max-width:420px"><h4 class="modal-title">مصروفاتي في أيّ مؤسسة؟</h4>' +
      d.roots.map(function (r) { return '<button type="button" class="act-menu-row" data-root="' + r.rootNo + '"><i class="fas fa-building"></i><span>' + esc(r.name) + '</span></button>'; }).join('') +
      '<div class="modal-actions"><button type="button" class="modal-btn modal-cancel" data-x>إلغاء</button></div></div>';
    o.addEventListener('click', function (ev) {
      var r = ev.target.closest('[data-root]');
      if (ev.target === o || ev.target.closest('[data-x]') || r) o.remove();
      if (r && Number(r.dataset.root) !== d.rootNo) { st.root = Number(r.dataset.root); st.data = null; st.month = ''; load(); }
    });
    document.body.appendChild(o);
  }

  async function del(cid) {
    var c = st.data.claims.filter(function (x) { return x.clientId === cid; })[0];
    if (!c) return;
    var cat = category(c.catId);
    var ok = await showConfirm({ title: 'حذف المطالبة؟', message: (cat ? cat.name + ' ' : '') + money(c.amount, c.currency) + ' بتاريخ ' + dayLabel(c.date),
                                 confirmText: 'حذف', danger: true, icon: '🗑️' });
    if (!ok) return;
    var root = st.data.rootNo;
    // في الطابور ولم يصل السيرفر قطّ ⇒ يُمحى من الطابور وحده
    var q = queue();
    if (c.id == null && q.some(function (x) { return x.t === 'claim' && x.claim.client_id === cid; })) {
      setQueue(q.filter(function (x) { return !((x.t === 'claim' && x.claim.client_id === cid) || (x.t === 'receipt' && x.cid === cid)); }));
      showToast('حُذفت');
      return load();
    }
    try {
      await post({ action: 'DELETE', client_id: cid });
      patchSnap(root, c, null, true);
      showToast('حُذفت');
    } catch (e) {
      if (e && e.rejected) return showAlert({ title: 'تعذّر الحذف', message: e.message, icon: '⚠️' });
      enqueue({ t: 'claim_del', root: root, cid: cid });
      showToast('حُذفت على الجهاز — يُبلَّغ السيرفر عند الاتصال');
    }
    load();
  }

  /* ---------- الإيصال ---------- */
  // صورةٌ تُصغَّر (1600 بكسل، JPEG) كي تتّسع لذاكرة الجهاز بلا اتصال · PDF كما هو (حتى 3 ميغا)
  function readReceipt(file) {
    return new Promise(function (resolve, reject) {
      if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) {
        if (file.size > 3 * 1024 * 1024) return reject(new Error('ملفّ PDF أكبر من 3 ميغا — صوّر الإيصال بدلًا منه'));
        var fr = new FileReader();
        fr.onload = function () { resolve({ b64: String(fr.result).split(',')[1], type: 'application/pdf', name: file.name }); };
        fr.onerror = function () { reject(new Error('تعذّرت قراءة الملفّ')); };
        return fr.readAsDataURL(file);
      }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.width, img.height));
        var cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        resolve({ b64: cv.toDataURL('image/jpeg', 0.8).split(',')[1], type: 'image/jpeg', name: file.name });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('الملفّ ليس صورةً مفهومة')); };
      img.src = url;
    });
  }

  async function showReceipt(cid) {
    var blob = null;
    var op = queue().filter(function (x) { return x.t === 'receipt' && x.cid === cid; })[0];
    try {
      if (op) blob = new Blob([b64ToBytes(op.b64)], { type: op.type });
      else {
        if (!navigator.onLine) return showToast('لا اتصال — الإيصال يُجلب من السيرفر');
        showToast('جارٍ جلب الإيصال…');
        var headers = { 'X-Platform': 'web' }, did = QMC.getDeviceId(); if (did) headers['X-Device-Id'] = did;
        var r = await fetch(QMC.BASE + '/sv/ledger/receipt?kind=C&cid=' + encodeURIComponent(cid), { headers: headers });
        if (r.status !== 200 || /json/.test(r.headers.get('content-type') || '')) throw new Rejected(msgOf(r, await readJson(r)));
        blob = await r.blob();
      }
    } catch (e) { return showAlert({ title: 'تعذّر جلب الإيصال', message: (e && e.message) || 'خطأ غير معروف', icon: '⚠️' }); }
    var url = URL.createObjectURL(blob), pdf = /pdf/.test(blob.type);
    var o = document.createElement('div');
    o.className = 'modal-overlay'; o.style.display = 'flex';
    o.innerHTML = '<div class="modal-box cl-receipt"><h4 class="modal-title">الإيصال</h4>' +
      (pdf ? '<a class="em-row-btn" href="' + url + '" target="_blank" rel="noopener"><i class="fas fa-file-pdf"></i> فتح ملفّ PDF</a>'
        : '<img src="' + url + '" alt="صورة الإيصال">') +
      '<div class="modal-actions"><button type="button" class="modal-btn modal-cancel" data-x>إغلاق</button></div></div>';
    o.addEventListener('click', function (ev) {
      if (ev.target === o || ev.target.closest('[data-x]')) { o.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); }
    });
    document.body.appendChild(o);
  }

  /* ---------- نموذج المطالبة (نسخة _ClaimForm) ---------- */
  function defaultDate() {
    var today = parseYmd(st.data.today) || new Date();
    var p = st.month.split('-').map(Number);
    var last = new Date(p[0], p[1], 0);   // آخر يومٍ في الشهر المعروض
    return ymd(last < today ? last : today);
  }

  function openForm(c) {
    var d = st.data;
    form = { claim: c || null, cat: c ? c.catId : (d.categories.length === 1 ? d.categories[0].id : null),
             busy: false, error: '', receipt: null };
    var o = document.getElementById('claimForm');
    if (!o) {
      o = document.createElement('div');
      o.id = 'claimForm'; o.className = 'modal-overlay';
      o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
      o.innerHTML = '<div class="modal-box cl-form"></div>';
      o.addEventListener('click', function (ev) { if (ev.target === o && !form.busy) o.style.display = 'none'; });
      document.body.appendChild(o);
    }
    o.style.display = 'flex';
    renderForm(true);
  }

  function leftFor(cat, date) {
    var c = category(cat);
    if (!c || !date) return null;
    return c.cap - usedIn(c.id, date.substr(0, 7), form.claim ? form.claim.clientId : null);
  }

  function renderForm(first) {
    var box = document.querySelector('#claimForm .cl-form');
    var d = st.data, c = category(form.cat);
    var keep = first ? null : { date: (document.getElementById('clDate') || {}).value, amount: (document.getElementById('clAmount') || {}).value,
                                desc: (document.getElementById('clDesc') || {}).value };
    var date = keep ? keep.date : (form.claim ? form.claim.date : defaultDate());
    var today = parseYmd(d.today) || new Date(), min = new Date(today); min.setDate(min.getDate() - 90);
    var left = c ? leftFor(c.id, date) : null;
    box.innerHTML = '<h4 class="modal-title">' + (form.claim ? 'تعديل المطالبة' : 'مصروفٌ جديد') + '</h4>' +
      '<label class="cl-lbl">نوع المصروف</label><div class="day-filter">' + d.categories.map(function (x) {
        return '<button type="button" class="' + (x.id === form.cat ? 'on' : '') + '" data-cat="' + x.id + '"' + (form.busy ? ' disabled' : '') + '>' + esc(x.name) + '</button>';
      }).join('') + '</div>' +
      '<div class="field"><label for="clDate">تاريخ المصروف</label><input type="date" id="clDate" value="' + esc(date || '') +
        '" min="' + ymd(min) + '" max="' + ymd(today) + '"' + (form.busy ? ' disabled' : '') + '></div>' +
      '<div class="field"><label for="clAmount">المبلغ' + (c ? ' (' + esc(CUR[c.currency] || c.currency) + ')' : '') + '</label>' +
        '<input type="text" id="clAmount" inputmode="decimal" dir="ltr" value="' + esc(keep ? keep.amount : (form.claim ? String(form.claim.amount) : '')) + '"' + (form.busy ? ' disabled' : '') + '>' +
        (c && left != null ? '<small class="field-hint">' + (c.cap <= 0 ? 'لم يُحدَّد سقفك في هذا النوع بعد'
          : 'الباقي من سقف ' + esc(monthLabel(String(date).substr(0, 7))) + ': ' + money(Math.max(0, left), c.currency)) + '</small>' : '') + '</div>' +
      '<div class="field"><label for="clDesc">البيان — اختياريّ</label><textarea id="clDesc" rows="2" maxlength="500" placeholder="مثل: زيارة حلقات الشجاعية · تعبئة رصيد"' +
        (form.busy ? ' disabled' : '') + '>' + esc(keep ? keep.desc : (form.claim ? form.claim.description : '')) + '</textarea></div>' +
      '<label class="cl-file' + (form.busy ? ' off' : '') + '"><i class="fas fa-receipt"></i> ' +
        (form.receipt ? '✓ ' + esc(form.receipt.name) + ' — تغيير' : 'إرفاق صورة الإيصال — اختياريّ') +
        '<input type="file" id="clFile" accept="image/*,application/pdf"' + (form.busy ? ' disabled' : '') + '></label>' +
      (form.error ? '<div class="cl-note err">' + esc(form.error) + '</div>' : '') +
      '<div class="modal-actions"><button type="button" class="modal-btn modal-cancel" id="clCancel"' + (form.busy ? ' disabled' : '') + '>إلغاء</button>' +
      '<button type="button" class="modal-btn modal-confirm" id="clSave"' + (form.busy ? ' disabled' : '') + '>' +
      (form.busy ? '<i class="fas fa-spinner fa-spin"></i> جارٍ الحفظ…' : '<i class="fas fa-paper-plane"></i> حفظ وإرسال للاعتماد') + '</button></div>';

    box.querySelectorAll('[data-cat]').forEach(function (b) { b.onclick = function () { form.cat = Number(b.dataset.cat); renderForm(false); }; });
    document.getElementById('clDate').onchange = function () { renderForm(false); };
    document.getElementById('clCancel').onclick = function () { document.getElementById('claimForm').style.display = 'none'; };
    document.getElementById('clSave').onclick = save;
    document.getElementById('clFile').onchange = async function () {
      var f = this.files && this.files[0];
      if (!f) return;
      try { form.receipt = await readReceipt(f); form.error = ''; }
      catch (e) { form.error = e.message; }
      renderForm(false);
    };
  }

  function check(date, amount) {
    var c = category(form.cat);
    if (!c) return 'اختر نوع المصروف';
    var dt = parseYmd(date), today = parseYmd(st.data.today) || new Date();
    if (!dt) return 'اختر تاريخ المصروف';
    if (dt > today) return 'التاريخ في المستقبل';
    if ((today - dt) / 86400000 > 90) return 'المطالبة عن مصروفٍ خلال آخر 90 يومًا';
    if (amount == null || amount <= 0) return 'اكتب المبلغ';
    if (c.cap <= 0) return 'لم تحدّد الإدارة سقفك في «' + c.name + '» بعد — راجعها';
    var left = leftFor(c.id, date) || 0;
    if (amount > left + 0.001) {
      return 'يتجاوز سقف «' + c.name + '» (' + money(c.cap, c.currency) + ' شهريًّا): الباقي لك في ' +
        monthLabel(date.substr(0, 7)) + ' ' + money(Math.max(0, left), c.currency);
    }
    return null;
  }

  async function save() {
    if (form.busy) return;
    var date = document.getElementById('clDate').value;
    var amount = parseAmount(document.getElementById('clAmount').value);
    var desc = document.getElementById('clDesc').value.trim();
    var bad = check(date, amount);
    if (bad) { form.error = bad; return renderForm(false); }
    var old = form.claim, c = category(form.cat), root = st.data.rootNo;
    var claim = { id: old ? old.id : null, clientId: old ? old.clientId : 'c-' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36),
                  catId: form.cat, date: date, amount: amount, currency: c.currency, description: desc, state: 'P',
                  approvedAmount: null, note: '', hasReceipt: old ? old.hasReceipt : false, cap: c.cap };
    var body = { client_id: claim.clientId, root_no: String(root), cat_id: String(claim.catId), date: date,
                 amount: String(amount), description: desc };
    form.busy = true; form.error = ''; renderForm(false);
    var rc = form.receipt, online = false;
    try {
      // في الطابور سلفًا ⇒ يُحدَّث هناك (لا يسبق إرسالٌ مباشرٌ نسخةً لم تصل)
      var queued = queue().some(function (x) { return x.t === 'claim' && x.claim.client_id === claim.clientId; });
      if (!queued && navigator.onLine) {
        try {
          var r = await post(Object.assign({ action: 'SAVE' }, body));
          patchSnap(root, claim, num(r.id), false);
          online = true;
          if (rc) {
            try { await uploadReceipt(claim.clientId, rc); }
            catch (e) { if (e && e.rejected) throw e; enqueue({ t: 'receipt', cid: claim.clientId, b64: rc.b64, type: rc.type }); }
          }
        } catch (e) { if (e && e.rejected) throw e; }
      }
      if (!online) {
        var lbl = (c ? c.name : '') + ' ' + money(amount, c.currency) + ' بتاريخ ' + dayLabel(date);
        enqueue({ t: 'claim', root: root, claim: toJson(claim), body: body, label: lbl });
        if (rc) enqueue({ t: 'receipt', cid: claim.clientId, b64: rc.b64, type: rc.type });
      }
    } catch (e) {
      form.busy = false; form.error = (e && e.message) || 'تعذّر الحفظ';
      return renderForm(false);
    }
    document.getElementById('claimForm').style.display = 'none';
    st.month = date.substr(0, 7);
    showToast(online ? 'أُرسلت المطالبة للاعتماد' : 'حُفظت على الجهاز — تُرسل وحدها عند عودة الاتصال');
    load();
  }

  /* ---------- الأنماط ---------- */
  var CSS =
    '#claimsBody{display:flex;flex-direction:column;gap:10px}' +
    '.cl-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.cl-top span{flex:1;font-weight:700;color:#374151;min-width:0}' +
    '.cl-top button{width:auto;margin:0;background:#fff;border:1px solid #dfe5ec;color:#374151;border-radius:999px;padding:7px 12px;font-size:12.5px;font-weight:700}' +
    '.cl-note{border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.6;background:#eef3f8;color:#334155}' +
    '.cl-note.warn{background:#fff7e6;color:#92400e}.cl-note.err{background:#fff1f2;color:#9f1239}.cl-note.tip{background:#f3f6fa;color:#475569}' +
    '.cl-cap{background:#fff;border:1px solid #e6eaef;border-radius:14px;padding:12px 14px}' +
    '.cl-cap-h{display:flex;justify-content:space-between;gap:8px;align-items:baseline}.cl-cap-h b{font-size:15px;color:#111827}' +
    '.cl-cap-h span{font-size:13px;color:#374151;font-variant-numeric:tabular-nums}.cl-warn{color:#92400e !important}' +
    '.cl-bar{height:8px;border-radius:99px;background:#e8ecf1;overflow:hidden;margin:8px 0 4px}' +
    '.cl-bar i{display:block;height:100%;background:#2bb673;border-radius:99px}.cl-bar i.full{background:#b45309}' +
    '.cl-cap small{font-size:12px;color:#6b7280}' +
    '.cl-new{width:100%;margin:2px 0}' +
    '.cl-list{background:#fff;border:1px solid #e6eaef;border-radius:16px;overflow:hidden}' +
    '.cl-row{padding:12px 14px;display:flex;flex-direction:column;gap:3px}.cl-row+.cl-row{border-top:1px solid #eef1f4}' +
    '.cl-row.tap{cursor:pointer}.cl-row-t{display:flex;gap:8px;align-items:center;justify-content:space-between}' +
    '.cl-row-t b{font-size:14.5px;color:#111827}.cl-row small{font-size:12.5px;color:#6b7280;line-height:1.5}' +
    '.cl-tag{flex:none;font-size:11.5px;font-weight:800;border-radius:999px;padding:4px 9px;white-space:nowrap}' +
    '.cl-tag.s-P{background:#fcefd9;color:#92400e}.cl-tag.s-A{background:#e0f2f1;color:#00695c}' +
    '.cl-tag.s-D{background:#e1f3e9;color:#17764a}.cl-tag.s-R{background:#fbe6e9;color:#9f1239}' +
    '.cl-row-a{display:flex;gap:6px}.cl-row-a:empty{display:none}' +
    '.cl-row-a button{width:auto;margin:4px 0 0;background:#f5f7f9;border:1px solid #edf0f3;color:#374151;border-radius:10px;padding:6px 10px;font-size:12.5px}' +
    '.cl-form{text-align:start;max-width:460px}.cl-lbl{display:block;font-size:12.5px;font-weight:700;color:#4b5563;margin:0 0 6px}' +
    '.cl-form .day-filter{margin-bottom:12px}.cl-form .field{margin-bottom:12px}.cl-form textarea{width:100%;resize:vertical}' +
    '.cl-file{display:flex;align-items:center;gap:8px;border:1.5px dashed #cfd7e1;border-radius:12px;padding:12px;cursor:pointer;font-size:13.5px;color:#374151;margin-bottom:12px}' +
    '.cl-file input{display:none}.cl-file.off{opacity:.6;pointer-events:none}' +
    '.cl-receipt{max-width:520px}.cl-receipt img{width:100%;border-radius:12px;max-height:70vh;object-fit:contain}';
  (function () { var s = document.createElement('style'); s.id = 'claimsStyle'; s.textContent = CSS; document.head.appendChild(s); })();

  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#claimsBody')) onClick(e); });
  window.addEventListener('online', function () { flush().catch(function () {}); });
  window.addEventListener('load', function () { setTimeout(function () { if (user() && pendingCount()) flush().catch(function () {}); }, 4000); });

  window.QmcClaims = { open: load, flush: flush, pendingCount: pendingCount };
})();
