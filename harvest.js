/* 🌾 حصاد الشهر لمعلّم الدورة (2026-11-02) — نظير lib/screens/harvest_screen.dart
 * (_courseSlides) و lib/services/harvest_service.dart في تطبيق أندرويد.
 *
 * النقطة نفسها (QMC_HARVEST_PKG — docs/harvest/):
 *   GET org/harvest?ym=YYYY-MM   ⇒ { ym, prev_ym, items: [{kind, no, cur, prev}] }
 * الاسم من التوكن (X-Device-Id يحقنه QMC.apiFetch). هنا بنود COURSE وحدها.
 *
 * · بطاقةٌ ذهبية «حصاد <الشهر>» أعلى «دوراتي» طوال الشهر.
 * · يُفتح وحده مرّةً في الشهر من اليوم 1 إلى 5 عند فتح «دوراتي»
 *   (localStorage `harvest_seen:<ym>:<user>` — المفتاح نفسه في أندرويد).
 * · الشرائح: الجلسات · الحضور · التقييم · الخلاصة، ومقارنةٌ بالشهر السابق،
 *   و«مشاركة صورة» للشريحة (html2canvas داخل html2pdf.bundle).
 * نسخة الجهاز: localStorage `harvest:<ym>:<user>` للعرض دون اتصال.
 */
(function () {
  'use strict';

  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  var hv = null;          // { ym, prevYm, month, prevMonth, items }
  var hvUser = null;      // صاحب hv — تبديل المستخدم لا يُعيد تحميل الصفحة
  var st = { item: 0, slide: 0, sharing: false };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function user() { return (window.QMC && QMC.getUserName()) || ''; }
  function arMonth(ym) {
    var m = parseInt(String(ym || '').substr(5, 2), 10);
    return m >= 1 && m <= 12 ? MONTHS[m - 1] : ym;
  }
  /** الشهر الماضي بتقويم الجهاز */
  function lastMonthYm() {
    var d = new Date();
    d = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1);
  }
  function num(v) { if (v == null || v === '') return null; var n = Number(v); return isNaN(n) ? null : n; }
  function n(i, k) { return num(i.cur[k]); }
  function p(i, k) { return i.prev ? num(i.prev[k]) : null; }
  function f(v) {
    if (v == null) return '0';
    var r = Math.round(v * 10) / 10;
    return r === Math.round(r) ? String(Math.round(r)) : r.toFixed(1);
  }

  /** «↑ 9٪ عن سبتمبر» — نسبة التغيّر؛ [null, null] إن لا أساس للمقارنة */
  function pct(cur, prev) {
    if (cur == null || prev == null || prev <= 0) return [null, null];
    var d = Math.round((cur - prev) / prev * 100);
    if (d === 0) return ['كما في ' + hv.prevMonth, null];
    return [(d > 0 ? '↑' : '↓') + ' ' + Math.abs(d) + '٪ عن ' + hv.prevMonth, d > 0];
  }
  /** «↑ 4 نقاط عن سبتمبر» — فرق نسبتين */
  function pts(cur, prev) {
    if (cur == null || prev == null) return [null, null];
    var d = Math.round(cur - prev);
    if (d === 0) return ['كما في ' + hv.prevMonth, null];
    var a = Math.abs(d);
    var w = a === 1 ? 'نقطة واحدة' : a === 2 ? 'نقطتين' : a <= 10 ? a + ' نقاط' : a + ' نقطة';
    return [(d > 0 ? '↑' : '↓') + ' ' + w + ' عن ' + hv.prevMonth, d > 0];
  }

  /* ---------- الجلب ---------- */
  async function load(force) {
    var want = lastMonthYm();
    if (!force && hv && hv.ym === want && hvUser === user()) return hv;
    var key = 'harvest:' + want + ':' + user();
    var data = null;
    try {
      var r = await QMC.apiFetch('org/harvest?ym=' + encodeURIComponent(want), { timeoutMs: 25000 });
      var d = await r.json().catch(function () { return null; });
      if (d && d.status === 'success') {
        data = d;
        try { localStorage.setItem(key, JSON.stringify(d)); } catch (_) {}
      } else return null;   // رفضٌ من السيرفر (لا حصاد له) — لا يُعرض شيء
    } catch (_) {
      try { data = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { data = null; }
    }
    if (!data) return null;
    var items = (Array.isArray(data.items) ? data.items : []).filter(function (x) {
      return x && x.kind === 'COURSE' && x.cur && typeof x.cur === 'object';
    }).map(function (x) {
      return { no: x.no, cur: x.cur, prev: x.prev && typeof x.prev === 'object' ? x.prev : null, name: String(x.cur.name || '') };
    });
    var ym = String(data.ym || want);
    hv = { ym: ym, prevYm: String(data.prev_ym || ''), month: arMonth(ym), prevMonth: arMonth(data.prev_ym), items: items };
    hvUser = user();
    return hv;
  }

  function seenKey(ym) { return 'harvest_seen:' + ym + ':' + user(); }

  /** بطاقة «دوراتي» + الفتح وحده مرّةً من 1 إلى 5 */
  async function refresh() {
    var box = document.getElementById('harvestCard');
    if (!box) return;
    var h = await load(false);
    if (!h || !h.items.length) { box.innerHTML = ''; return; }
    var names = h.items.map(function (i) { return i.name; });
    var what = names.length > 1
      ? names.length + ' بطاقات: ' + names.slice(0, 2).join(' · ') + (names.length > 2 ? ' …' : '')
      : names[0];
    box.innerHTML = '<button type="button" class="hv-entry" onclick="QmcHarvest.open()">' +
      '<span class="hv-entry-icon"><i class="fas fa-wand-magic-sparkles"></i></span>' +
      '<span class="hv-entry-text"><b>حصاد ' + esc(h.month) + '</b><span>' + esc(what) + '</span></span>' +
      '<i class="fas fa-chevron-left hv-entry-go"></i></button>';
    var seen = true;
    try { seen = localStorage.getItem(seenKey(h.ym)) === '1'; } catch (_) {}
    if (!seen && new Date().getDate() <= 5) {
      try { localStorage.setItem(seenKey(h.ym), '1'); } catch (_) {}
      open();
    }
  }

  /* ---------- الشرائح (نسخة _courseSlides) ---------- */
  function slidesOf(i) {
    var out = [];
    var ds = pct(n(i, 'sessions'), p(i, 'sessions'));
    out.push({ kicker: 'حصاد ' + hv.month, big: String(n(i, 'sessions') || 0), unit: 'جلسة',
      sub: 'مع ' + (n(i, 'students') || 0) + ' طالبًا', delta: ds[0], up: ds[1] });
    var da = pts(n(i, 'att'), p(i, 'att'));
    out.push({ kicker: 'الحضور', big: (n(i, 'att') || 0) + '٪', unit: 'حضور طلاب الدورة',
      sub: (n(i, 'perfect') || 0) > 0 ? n(i, 'perfect') + ' لم يغيبوا أبدًا' : null, delta: da[0], up: da[1] });
    if (n(i, 'avg') != null) out.push({ kicker: 'التقييم', big: f(n(i, 'avg')), unit: 'معدّل الطلاب حتى الآن' });
    var a = n(i, 'att') || 0;
    var perfect = Math.round(n(i, 'perfect') || 0);
    var points = [
      ['info', (n(i, 'sessions') || 0) + ' جلسة', ds[0]],
      a >= 90 ? ['star', 'حضورٌ ممتاز ' + a + '٪', 'انتظامٌ يُشكر عليه الجميع']
        : [a >= 75 ? 'info' : 'warn', 'الحضور ' + a + '٪', 'متابعة الغائبين ترفعه في الشهر القادم']
    ];
    if (perfect > 0) points.push(['star', perfect + ' لم يغيبوا أبدًا', null]);
    out.push({ kicker: 'خلاصة ' + hv.month, points: points });
    return out;
  }

  var TONE_ICON = { up: 'fa-arrow-trend-up', down: 'fa-arrow-trend-down', star: 'fa-trophy', warn: 'fa-flag', info: 'fa-circle-info' };

  function cardHtml(s, count, it) {
    var h = '<div class="hv-card"><div class="hv-progress">';
    for (var k = 0; k < count; k++) h += '<span class="' + (k <= st.slide ? 'on' : '') + '"></span>';
    h += '</div><div class="hv-meta"><span class="hv-ellipsis">' + esc(it.name) + '</span><span>' +
      esc(hv.month + ' ' + hv.ym.substr(0, 4)) + '</span></div><div class="hv-main"><div class="hv-kicker">' + esc(s.kicker) + '</div>';
    if (s.points) {
      h += s.points.map(function (pt) {
        return '<div class="hv-point hv-' + pt[0] + '"><i class="fas ' + TONE_ICON[pt[0]] + '"></i><span><b>' + esc(pt[1]) + '</b>' +
          (pt[2] ? '<span class="hv-tail">  ' + esc(pt[2]) + '</span>' : '') + '</span></div>';
      }).join('');
    } else {
      h += '<div class="hv-big">' + esc(s.big) + '</div>' +
        (s.unit ? '<div class="hv-unit">' + esc(s.unit) + '</div>' : '') +
        (s.sub ? '<div class="hv-sub">' + esc(s.sub) + '</div>' : '') +
        (s.delta ? '<div class="hv-delta ' + (s.up == null ? '' : s.up ? 'up' : 'down') + '">' + esc(s.delta) + '</div>' : '');
    }
    return h + '</div><div class="hv-brand">تطبيق الصفوة لمتابعة الحلقات القرآنية</div></div>';
  }

  /* ---------- الشاشة ---------- */
  function ensureScreen() {
    var el = document.getElementById('harvestScreen');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'harvestScreen';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.style.display = 'none';
    el.addEventListener('click', onClick);
    document.body.appendChild(el);
    return el;
  }

  function render() {
    var el = ensureScreen();
    var it = hv.items[st.item];
    var slides = slidesOf(it);
    if (st.slide >= slides.length) st.slide = slides.length - 1;
    var h = '<div class="hv-bar"><button type="button" class="hv-icon" data-act="close" title="رجوع" aria-label="رجوع">' +
      '<i class="fas fa-arrow-right"></i></button><div class="hv-title">حصاد ' + esc(hv.month) + '</div></div><div class="hv-body">';
    if (hv.items.length > 1) {
      h += '<div class="hv-chips">' + hv.items.map(function (x, k) {
        return '<button type="button" data-act="item" data-i="' + k + '" class="' + (k === st.item ? 'on' : '') + '">' + esc(x.name) + '</button>';
      }).join('') + '</div>';
    }
    h += '<div class="hv-stage" data-act="tap">' + cardHtml(slides[st.slide], slides.length, it) + '</div>' +
      '<div class="hv-nav">' +
      '<button type="button" class="hv-btn hv-outline" data-act="prev"' + (st.slide > 0 ? '' : ' disabled') + '><i class="fas fa-chevron-right"></i> السابق</button>' +
      '<button type="button" class="hv-btn hv-tonal" data-act="share"' + (st.sharing ? ' disabled' : '') + '>' +
      (st.sharing ? '<i class="fas fa-spinner fa-spin"></i>' : '<i class="fas fa-arrow-up-from-bracket"></i>') + ' مشاركة صورة</button>' +
      '<button type="button" class="hv-btn" data-act="next"' + (st.slide < slides.length - 1 ? '' : ' disabled') + '>التالي <i class="fas fa-chevron-left"></i></button>' +
      '</div></div>';
    el.innerHTML = h;
  }

  function go(d) {
    var count = slidesOf(hv.items[st.item]).length;
    var x = st.slide + d;
    if (x < 0 || x >= count) return;
    st.slide = x;
    render();
  }

  function onClick(e) {
    var b = e.target.closest && e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    switch (b.dataset.act) {
      case 'close': return close();
      case 'prev': return go(-1);
      case 'next': return go(1);
      case 'share': return share();
      case 'item': st.item = parseInt(b.dataset.i, 10) || 0; st.slide = 0; return render();
      case 'tap': {
        // الضغط على النصف الأيمن يعيد (الاتجاه من اليمين)، والأيسر يتقدّم
        var r = b.getBoundingClientRect();
        return go(e.clientX - r.left < r.width / 2 ? 1 : -1);
      }
    }
  }

  /** 📸 الشريحة صورةً بعرضٍ ثابت (360 × 3) بارتفاعها كلّه */
  async function share() {
    if (st.sharing) return;
    if (typeof ensurePdfLibrary === 'function' && !await ensurePdfLibrary()) return;
    st.sharing = true; render();
    try {
      var it = hv.items[st.item];
      var slides = slidesOf(it);
      // الغلاف ltr كي تبدأ البطاقة من x=0 فيُقصّ عرضها وحده من الحاوية
      var html = '<div style="direction:ltr"><div dir="rtl" class="hv-export">' + cardHtml(slides[st.slide], slides.length, it) + '</div></div>';
      var canvas = await html2pdf().set({ html2canvas: { scale: 3, width: 360, backgroundColor: null } })
        .from(html, 'string').toCanvas().get('canvas');
      var blob = await new Promise(function (res) { canvas.toBlob(res, 'image/png'); });
      if (!blob) throw new Error('تعذّر إنشاء الصورة');
      var name = 'حصاد ' + hv.month + ' - ' + it.name.replace(/[\\/:*?"<>|]/g, ' ') + ' ' + (st.slide + 1) + '.png';
      if (typeof crDeliverFile === 'function') crDeliverFile(blob, name, 'image/png');
      else {
        var url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.parentNode.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast('تعذّرت المشاركة: ' + ((err && err.message) || err));
    } finally {
      st.sharing = false; render();
    }
  }

  function open() {
    if (!hv || !hv.items.length) return;
    st = { item: 0, slide: 0, sharing: false };
    render();
    ensureScreen().style.display = 'flex';
    document.body.classList.add('hv-open');
  }

  function close() {
    var el = document.getElementById('harvestScreen');
    if (el) el.style.display = 'none';
    document.body.classList.remove('hv-open');
  }

  document.addEventListener('keydown', function (e) {
    var el = document.getElementById('harvestScreen');
    if (!el || el.style.display === 'none') return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') go(1);
    else if (e.key === 'ArrowRight') go(-1);
  });

  var GOLD = '#b7791f', GOLD_SOFT = '#f7ebd3';
  var CSS =
    '#harvestScreen{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2000;background:var(--bg,#f8f9fa);flex-direction:column}' +
    'body.hv-open{overflow:hidden}' +
    '.hv-bar{display:flex;align-items:center;gap:6px;padding:10px 12px;padding-top:calc(10px + env(safe-area-inset-top));background:#fff;border-bottom:1px solid #e2e8f0}' +
    '.hv-title{flex:1;font-size:18px;font-weight:700;color:#0f172a}' +
    '.hv-icon{background:transparent;color:#334155;width:40px;height:40px;border-radius:50%;padding:0;font-size:18px}' +
    '.hv-body{flex:1;display:flex;flex-direction:column;min-height:0;padding:10px 14px calc(12px + env(safe-area-inset-bottom));max-width:560px;width:100%;margin:0 auto;box-sizing:border-box}' +
    '.hv-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}' +
    '.hv-chips button{background:#fff;color:#334155;border:1px solid #cbd5e1;border-radius:20px;padding:6px 12px;font-size:13.5px;font-weight:500}' +
    '.hv-chips button.on{background:' + GOLD_SOFT + ';border-color:' + GOLD + ';color:#7a4f0e;font-weight:700}' +
    '.hv-stage{flex:1;min-height:0;display:flex;cursor:pointer;user-select:none;-webkit-user-select:none}' +
    '.hv-stage .hv-card{flex:1;min-height:0}' +
    '.hv-card{display:flex;flex-direction:column;border-radius:22px;background:linear-gradient(180deg,' + GOLD_SOFT + ',#fff);border:1px solid ' + GOLD + '40;padding:16px 20px 18px;box-sizing:border-box;color:#0f172a}' +
    '.hv-progress{display:flex;gap:4px}.hv-progress span{flex:1;height:3px;border-radius:2px;background:#d1d5db}.hv-progress span.on{background:' + GOLD + '}' +
    '.hv-meta{display:flex;justify-content:space-between;gap:8px;margin-top:10px;font-size:13px;color:#00000089}' +
    '.hv-ellipsis{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}' +
    '.hv-main{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:stretch;text-align:center;overflow-y:auto;padding:12px 0}' +
    '.hv-kicker{font-size:15px;font-weight:700;color:' + GOLD + ';margin-bottom:14px}' +
    '.hv-big{font-size:68px;font-weight:800;line-height:1.1;direction:ltr}' +
    '.hv-unit{font-size:18px;font-weight:600;margin-top:6px}' +
    '.hv-sub{font-size:14.5px;color:#00000089;line-height:1.5;margin-top:10px;white-space:pre-line}' +
    '.hv-delta{align-self:center;margin-top:14px;background:#fff;border:1px solid #e0e0e0;border-radius:20px;padding:4px 12px;font-size:13.5px;font-weight:600;color:#00000089}' +
    '.hv-delta.up{color:#166534}.hv-delta.down{color:#92400e}' +
    '.hv-point{display:flex;gap:10px;align-items:flex-start;text-align:right;border-radius:12px;padding:9px 12px;margin-bottom:8px;font-size:15px;line-height:1.5}' +
    '.hv-point i{margin-top:4px;font-size:16px}.hv-tail{color:#00000089}' +
    '.hv-up{background:#1665341a}.hv-up i{color:#166534}' +
    '.hv-down{background:#92400e12}.hv-down i{color:#92400e}' +
    '.hv-star{background:' + GOLD + '12}.hv-star i{color:' + GOLD + '}' +
    '.hv-warn{background:#9f123912}.hv-warn i{color:#9f1239}' +
    '.hv-info{background:#1d5f8a12}.hv-info i{color:#1d5f8a}' +
    '.hv-brand{text-align:center;font-size:11px;color:#00000061}' +
    '.hv-export{width:360px}.hv-export .hv-main{flex:none;overflow:visible;padding:28px 0}' +
    '.hv-nav{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px}' +
    '.hv-btn{display:inline-flex;align-items:center;gap:6px;background:var(--primary);color:#fff;border-radius:22px;padding:9px 14px;font-size:14px}' +
    '.hv-btn:disabled{opacity:.45}' +
    '.hv-outline{background:#fff;color:var(--primary);border:1px solid var(--primary-line,#c6dafc)}' +
    '.hv-tonal{background:var(--primary-wash,#e8f0fe);color:var(--primary-dark,#0d47a1)}' +
    '.hv-entry{display:flex;align-items:center;gap:12px;width:100%;text-align:right;justify-content:flex-start;background:linear-gradient(90deg,' + GOLD_SOFT + ',#fffbeb);border:1px solid ' + GOLD + '59;border-radius:14px;padding:12px 14px;margin-bottom:12px;color:inherit;font-weight:400}' +
    '.hv-entry-icon{width:42px;height:42px;border-radius:11px;background:#fff;color:' + GOLD + ';display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}' +
    '.hv-entry-text{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}' +
    '.hv-entry-text b{font-size:15.5px;color:' + GOLD + '}.hv-entry-text span{font-size:13px;color:#00000089}' +
    '.hv-entry-go{color:' + GOLD + '}';
  (function injectCss() {
    var s = document.createElement('style');
    s.id = 'harvestStyle';
    s.textContent = CSS;
    document.head.appendChild(s);
  })();

  window.QmcHarvest = { refresh: refresh, open: open, close: close };
})();
