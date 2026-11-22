/* 🌾 حصاد الشهر لمعلّم الحلقة ومعلّم الدورة (2026-11-02) — نظير
 * lib/screens/harvest_screen.dart (_circleSlides · _courseSlides) و
 * lib/services/harvest_service.dart في تطبيق أندرويد.
 *
 * النقطة نفسها (QMC_HARVEST_PKG — docs/harvest/):
 *   GET org/harvest?ym=YYYY-MM   ⇒ { ym, prev_ym, items: [{kind, no, cur, prev}] }
 * الاسم من التوكن (X-Device-Id يحقنه QMC.apiFetch). هنا بنود CIRCLE وCOURSE
 * ودائرة التجويد (CENTER نوعه TAJW — لمشرف الدورات، 2026-11-14).
 * حصاد المركز للمدير ومساعده ومشرف الحلقات لم يُنقل (قرار المستخدم 11-14: يبقى في أندرويد).
 *
 * · بطاقةٌ ذهبية «حصاد <الشهر>» في الرئيسية أعلى «يحتاج تدخّلك» (#whHarvest، كأندرويد
 *   منذ 2026-11-13؛ كانت أعلى «طلابي» و«دوراتي»).
 * · يُفتح وحده مرّةً في الشهر من اليوم 1 إلى 5 بعد فتح التطبيق
 *   (localStorage `harvest_seen:<ym>:<user>` — المفتاح نفسه في أندرويد).
 * · الشرائح ومقارنتها بالشهر السابق كما في أندرويد، و«مشاركة صورة» للشريحة
 *   (html2canvas داخل html2pdf.bundle).
 * نسخة الجهاز: localStorage `harvest:<ym>:<user>` للعرض دون اتصال.
 */
(function () {
  'use strict';

  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  var hv = null;          // { ym, prevYm, month, prevMonth, items }
  var hvUser = null;      // صاحب hv — تبديل المستخدم لا يُعيد تحميل الصفحة
  var st = { list: [], item: 0, slide: 0, sharing: false };   // list: بنود الشاشة المفتوحة

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
    // (2026-11-14، كأندرويد _pct) الأساس الصغير يضخّم النسبة (من 4 إلى 9 = ↑ 125٪) ⇒ الفرق بالعدد تحت 20
    if (prev < 20) {
      var a = Math.round(cur - prev);
      if (a === 0) return ['كما في ' + hv.prevMonth, null];
      return [(a > 0 ? '↑' : '↓') + ' ' + Math.abs(a) + ' عن ' + hv.prevMonth, a > 0];
    }
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
  /* ⏳ (2026-11-22، نظير Harvest.provisional في harvest_service.dart) آخر بناءٍ
     للحصاد فجر اليوم 5 من الشهر التالي (00:30 غزة) + ساعةٌ احتياطًا؛ ما جُلب
     قبله أوّليّ، يُكتب عليه ويُجلب من جديد كل 10 دقائق */
  var AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  function finalAt(ym) {
    var y = Number(String(ym).substr(0, 4)), m = Number(String(ym).substr(5, 2));
    return y && m ? new Date(y, m, 5, 1, 30) : null;   // m (1-12) = فهرس الشهر التالي
  }
  function provisional(h) {
    var f = h && finalAt(h.ym);
    return !!(f && h.at && h.at < f.getTime());
  }
  function provisionalNote(h) {
    if (h && h.live) {
      return 'أرقام ' + h.period + ' — تتجدّد كل ليلة، والمقارنة بالأيام نفسها من ' + arMonth(h.prevYm);
    }
    if (!provisional(h)) return null;
    var f = finalAt(h.ym), last = new Date(f.getFullYear(), f.getMonth(), 4);
    var mon = arMonth(f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0'));
    return 'أرقامٌ أوّليّة — تكتمل فجر ' + AR_DAYS[f.getDay()] + ' 5 ' + mon +
      ' بما يُرصد حتى نهاية ' + AR_DAYS[last.getDay()] + ' 4 ' + mon;
  }
  function provisionalShort(h) {
    if (!provisional(h)) return null;
    var f = finalAt(h.ym);
    return 'أرقامٌ أوّليّة حتى فجر 5 ' + arMonth(f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0'));
  }

  async function load(force) {
    var want = lastMonthYm();
    var stale = hv && provisional(hv) && Date.now() - (hv.fetched || 0) > 10 * 60 * 1000;
    if (!force && !stale && hv && hv.ym === want && hvUser === user()) return hv;
    var key = 'harvest:' + want + ':' + user();
    var data = null;
    try {
      var r = await QMC.apiFetch('org/harvest?ym=' + encodeURIComponent(want), { timeoutMs: 25000 });
      var d = await r.json().catch(function () { return null; });
      if (d && d.status === 'success') {
        data = d;
        d._at = Date.now();
        try { localStorage.setItem(key, JSON.stringify(d)); } catch (_) {}
      } else return null;   // رفضٌ من السيرفر (لا حصاد له) — لا يُعرض شيء
    } catch (_) {
      try { data = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { data = null; }
    }
    if (!data) return null;
    var got = shape(data, want);
    hvUser = user();
    // «هذا الشهر» مفتوح ⇒ الشهر الماضي يُحفظ ليعود عند الإغلاق، ولا يحلّ محلّ المعروض
    if (hv && hv.live) { hvBase = got; return got; }
    hv = got;
    return hv;
  }

  /** ردّ org/harvest ⇐ حصادٌ للعرض. 🌾 (2026-11-22، نظير Harvest في Flutter) live = الشهر
   *  الجاري حتى أمس: العنوان «نوفمبر حتى الآن» والمقارنة «الأيام نفسها من أكتوبر» */
  function shape(data, want) {
    var items = (Array.isArray(data.items) ? data.items : []).filter(function (x) {
      // 📚 (2026-11-14) دائرة التجويد لمشرف الدورات: CENTER نوعه TAJW (من الدورات لا الحلقات).
      //    حصاد المركز (CENTER غير TAJW) للمدير ومشرف الحلقات يبقى في أندرويد.
      return x && x.cur && typeof x.cur === 'object' &&
        (x.kind === 'CIRCLE' || x.kind === 'COURSE' || (x.kind === 'CENTER' && x.cur.type === 'TAJW' && x.own !== true));
    }).map(function (x) {
      return {
        kind: x.kind === 'CENTER' ? 'TAJW' : x.kind, no: x.no, cur: x.cur, prev: x.prev && typeof x.prev === 'object' ? x.prev : null,
        name: x.kind === 'CIRCLE' ? circleName(x.cur.name) : String(x.cur.name || '')
      };
    });
    var ym = String(data.ym || want);
    var live = data.live && typeof data.live === 'object' ? Number(data.live.days) || null : null;
    var y = ym.substr(0, 4);
    // at = متى جاء من السيرفر (المحفوظ بتاريخ حفظه)، fetched = آخر محاولة جلب
    return { ym: ym, prevYm: String(data.prev_ym || ''), items: items, live: live,
             month: live ? arMonth(ym) + ' حتى الآن' : arMonth(ym),
             prevMonth: live ? 'الأيام نفسها من ' + arMonth(data.prev_ym) : arMonth(data.prev_ym),
             period: !live ? arMonth(ym) + ' ' + y : (live === 1 ? '1 ' : '1–' + live + ' ') + arMonth(ym) + ' ' + y,
             at: Number(data._at) || 0, fetched: Date.now() };
  }

  /** 🌾 «هذا الشهر حتى الآن» — يُعرض بدل حصاد الشهر الماضي حتى يُغلق */
  var hvBase = null;
  async function openLive() {
    var now = new Date();
    var ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    var d = null;
    try {
      var r = await QMC.apiFetch('org/harvest?ym=' + encodeURIComponent(ym), { timeoutMs: 25000 });
      d = await r.json().catch(function () { return null; });
    } catch (_) { d = null; }
    var live = d && d.status === 'success' && d.live ? shape(d, ym) : null;
    if (!live || !live.items.length) {
      if (typeof showToast === 'function') showToast('لا أرقام لـ' + arMonth(ym) + ' بعد — تُحسب كل ليلة حتى اليوم السابق');
      return;
    }
    hvBase = hv;
    hv = live;
    st = { list: live.items, item: 0, slide: 0, sharing: false };
    render();
  }

  function seenKey(ym) { return 'harvest_seen:' + ym + ':' + user(); }

  /** «حلقة X» — إلا إن بدأ الاسم بها («حلقة الشيخ صائب» لا «حلقة حلقة …») */
  function circleName(name) {
    var s = String(name == null ? '' : name).trim();
    return s.indexOf('حلقة') === 0 ? s : 'حلقة ' + s;
  }

  /** 🏠 (2026-11-13) بطاقةٌ واحدة في الرئيسية لكل البنود (حلقات ودورات) — كأندرويد
   *  (أعلى «يحتاج تدخّلك»)؛ كانت أعلى «طلابي» وأعلى «دوراتي». [kind] فارغ = الكلّ */
  function paintSlot(id, kind, h) {
    var box = document.getElementById(id);
    if (!box) return;
    var mine = h ? h.items.filter(function (i) { return !kind || i.kind === kind; }) : [];
    if (!mine.length) { box.innerHTML = teaserHtml(); return; }
    var names = mine.map(function (i) { return i.name; });
    // 🔢 (2026-11-14) الرقم الأبرز على البطاقة نفسها — شريحةُ البند الأولى — لا الاسم وحده
    var lead = null;
    try { lead = slidesOf(mine[0])[0]; } catch (_) { lead = null; }
    var headline = lead && lead.big != null
      ? lead.big + ' ' + (lead.unit || '') + (lead.delta ? ' · ' + lead.delta : '') : '';
    var what = names.length > 1
      ? names.length + ' بطاقات: ' + names.slice(0, 2).join(' · ') + (names.length > 2 ? ' …' : '')
      : names[0];
    var single = names.length === 1 && headline;
    box.innerHTML = '<button type="button" class="hv-entry" onclick="QmcHarvest.open(' + (kind ? '\'' + kind + '\'' : '') + ')">' +
      '<span class="hv-entry-icon"><i class="fas fa-wand-magic-sparkles"></i></span>' +
      '<span class="hv-entry-text"><b>حصاد ' + esc(h.month) + (single ? ' · ' + esc(what) : '') + '</b><span>' +
      esc(single ? headline : what) + '</span>' +
      (provisionalShort(h) ? '<span class="hv-prov">' + esc(provisionalShort(h)) + '</span>' : '') + '</span>' +
      (single ? '<span class="hv-entry-big">' + esc(lead.big) + '</span>' : '<i class="fas fa-chevron-left hv-entry-go"></i>') + '</button>' +
      teaserHtml();
  }

  /* ⏳ (2026-11-22) تشويق الحصاد قبل إعلانه — نسخة HarvestTeaser في harvest_service.dart
     (أيّ تغييرٍ في النصوص هناك يُنقل). org/harvest/teaser: عدّادٌ + أرقامٌ مجمّعة بلا أسماء */
  var teaser = null;
  async function loadTeaser() {
    try {
      var r = await QMC.apiFetch('org/harvest/teaser', { timeoutMs: 25000 });
      var d = await r.json().catch(function () { return null; });
      teaser = d && d.status === 'success' ? d : null;
    } catch (_) { teaser = null; }
  }
  function arCircles(n) {
    return n === 1 ? 'حلقة واحدة' : n === 2 ? 'حلقتان' : n >= 3 && n <= 10 ? n + ' حلقات' : n + ' حلقة';
  }
  function teaserDaysLeft(t) {
    var p = String(t.reveal || '').split('-');
    if (p.length !== 3) return 0;
    var rv = new Date(+p[0], +p[1] - 1, +p[2]);
    var n = new Date(); n = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.round((rv - n) / 86400000);
  }
  function teaserHtml() {
    var t = teaser;
    var roots = t && Array.isArray(t.roots) ? t.roots : [];
    var d = t ? teaserDaysLeft(t) : 0;
    if (!t || t.show !== true || !roots.length || d <= 0) return '';
    var when = d === 1 ? 'غدًا' : d === 2 ? 'بعد يومين' : d <= 10 ? 'بعد ' + d + ' أيام' : 'بعد ' + d + ' يومًا';
    var p = String(t.reveal).split('-');
    var rv = new Date(+p[0], +p[1] - 1, +p[2]);
    var DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    var lines = [];
    var m = t.mine && typeof t.mine === 'object' ? t.mine : null;
    roots.slice(0, 2).forEach(function (r, k) {
      var on = Number(r.on_track) || 0, pages = Number(r.pages) || 0, name = String(r.name || '');
      lines.push(on > 0
        ? '🏅 ' + arCircles(on) + ' في ' + name + ' على طريق وسام «الرصد بيومه» حتى أمس'
        : '🏅 لا حلقة في ' + name + ' على طريق وسام «الرصد بيومه» بعد — كن الأوّل');
      if (k === 0 && m && Number(m.circles) > 0 && on > 0) {
        var one = Number(m.circles) === 1, mo = Number(m.on_track) || 0;
        lines.push(mo === 0 ? (one ? 'حلقتك ليست' : 'حلقاتك ليست') + ' منها بعد — ارصد كل يومٍ بتاريخه'
          : mo === Number(m.circles) ? (one ? '✅ وحلقتك منها' : '✅ وحلقاتك كلّها منها')
          : '✅ ' + mo + ' من حلقاتك منها');
      }
      if (pages > 0) lines.push('📖 ' + pages.toLocaleString('en-US') + ' صفحة حفظًا ومراجعةً في ' + arCircles(Number(r.circles) || 0) + ' حتى أمس');
    });
    return '<div class="hv-teaser"><span class="hv-entry-icon" dir="ltr">' + d + '</span><span class="hv-entry-text">' +
      '<b>⏳ حصاد ' + esc(arMonth(t.ym)) + ' يُعلن ' + when + '</b>' +
      '<span>صباح ' + DAYS[rv.getDay()] + ' ' + rv.getDate() + ' ' + MONTHS[rv.getMonth()] + '، إن شاء الله</span>' +
      lines.map(function (l) { return '<span class="hv-tl">' + esc(l) + '</span>'; }).join('') +
      '<span class="hv-prov">الترتيب والأوسمة والأعلى نموًّا تُكشف يوم الإعلان</span></span></div>';
  }

  /** البطاقة في الرئيسية من المحفوظ — بلا جلب (الرئيسية تعيد رسمها كثيرًا) */
  function paintHome() {
    paintSlot('whHarvest', null, hv && hvUser === user() ? hv : null);
  }

  /** الجلب + البطاقة + الفتح وحده مرّةً من 1 إلى 5 */
  async function refresh() {
    await loadTeaser();
    var h = await load(false);
    paintSlot('whHarvest', null, h);
    if (!h || !h.items.length) return;
    var seen = true;
    try { seen = localStorage.getItem(seenKey(h.ym)) === '1'; } catch (_) {}
    if (!seen && new Date().getDate() <= 5) {
      try { localStorage.setItem(seenKey(h.ym), '1'); } catch (_) {}
      open();
    }
  }

  /* ---------- الشرائح ---------- */
  function slidesOf(i) {
    return i.kind === 'CIRCLE' ? circleSlides(i) : i.kind === 'TAJW' ? tajwSlides(i) : courseSlides(i);
  }

  /* 📚 دائرة التجويد وحدها — نسخة _tajwSlides/_tajw(inOrg:false)/_tajwPoints في
     harvest_screen.dart (أيّ تغييرٍ هناك يُنقل). لوحة «الدوائر واحدةً واحدة» تخصّ حصاد
     المؤسسة (inOrg) فلم تُنقل. */
  // المعدود تحت رقمٍ كبير: «دورةٌ انعقدت · دورتان انعقدتا · دورات · دورةً»
  function cw(c, v, v2) { return c === 1 ? 'دورةٌ' + v : c === 2 ? 'دورتان' + v2 : c <= 10 ? 'دورات' + v : 'دورةً' + v; }
  // «دورةٌ واحدة انعقدت · دورتان انعقدتا · 5 دورات انعقدت»
  function crs(c, v, v2) {
    v = v || '';
    return c === 1 ? 'دورةٌ واحدة' + v : c === 2 ? 'دورتان' + (v2 == null ? v : v2) : c + ' ' + cw(c, v, v);
  }
  function tajwSlides(i) {
    var s = function (k) { return n(i, k) || 0; };
    var pv = function (k) { return i.prev ? (p(i, k) || 0) : null; };
    var courses = Math.round(s('courses')), idle = Math.round(s('idle')), visits = Math.round(s('visits'));
    var visited = Math.round(s('visited')), ended = Math.round(s('ended'));
    // حضور المعتمدين ٪ من مجموع السجلّات
    var att = s('recs') > 0 ? Math.round(100 * s('pres') / s('recs')) : null;
    var pr = pv('recs');
    var prevAtt = pr != null && pr > 0 ? Math.round(100 * pv('pres') / pr) : null;
    var out = [];

    var dc = pct(courses, pv('courses'));
    out.push(courses > 0
      ? { kicker: 'حصاد ' + hv.month, big: String(courses), unit: cw(courses, ' انعقدت', ' انعقدتا'),
          sub: f(s('sessions')) + ' جلسة · ' + f(s('students')) + ' متدرّبًا معتمدًا', delta: dc[0], up: dc[1] }
      : { kicker: 'حصاد ' + hv.month, big: '0', unit: 'دورة رُصد حضورها هذا الشهر',
          sub: idle > 0 ? crs(idle, ' مفتوحة', ' مفتوحتان') + ' بلا رصد' : null });

    var da = pts(att, prevAtt);
    if (att != null) {
      out.push({ kicker: 'الحضور', big: att + '٪', unit: 'حضور المتدرّبين المعتمدين',
        sub: f(s('pres')) + ' حضورًا من ' + f(s('recs')) + ' سجلًّا', delta: da[0], up: da[1] });
    }

    if (courses > 0) {
      var dv = pct(visits, pv('visits'));
      out.push({ kicker: 'الإشراف الميداني', big: String(visits),
        unit: visits === 1 ? 'زيارةٌ ميدانية' : visits === 2 ? 'زيارتان ميدانيّتان'
          : visits >= 3 && visits <= 10 ? 'زيارات ميدانية' : 'زيارةً ميدانية',
        sub: 'زِيرت ' + visited + ' من ' + courses + ' دورة منعقدة' +
          (idle > 0 ? '\n' + crs(idle, ' مفتوحة', ' مفتوحتان') + ' لم يُرصد حضورها' : ''),
        delta: dv[0], up: dv[1] });
    }

    if (i.cur.top_name != null) {
      out.push({ kicker: 'أعلى دورةٍ تقييمًا', big: f(n(i, 'top_eval')), unit: String(i.cur.top_name),
        sub: (i.cur.top_teacher || '') + '\nبالتقييم الجاري: الزيارات ورصد المعلّم والحضور وعدد المعتمدين' });
    }

    var ready = Math.round(s('ready'));
    if (ended > 0) {
      out.push({ kicker: 'الدورات المنتهية', big: String(ended), unit: cw(ended, ' انتهت', ' انتهتا') + ' هذا الشهر',
        sub: ready > 0 ? ready + ' منها مؤهّلة للكفالة'
          : 'تُحسم أهليّتها للكفالة باعتماد النتائج و«المتابعة من البداية»' });
    }

    // الخلاصة نقاطًا
    var points = [];
    if (courses === 0) points.push(['warn', 'لم يُرصد حضورٌ لأيّ دورة', 'في ' + hv.month]);
    else {
      points.push([dc[1] === false ? 'down' : dc[1] === true ? 'up' : 'info', crs(courses, ' انعقدت', ' انعقدتا'),
        f(s('sessions')) + ' جلسة' + (dc[0] ? ' · ' + dc[0] : '')]);
      if (att != null) {
        points.push([att >= 90 ? 'star' : da[1] === false ? 'down' : att < 75 ? 'warn' : 'info',
          'حضور المعتمدين ' + att + '٪', da[0]]);
      }
      var left = courses - visited;
      points.push(left > 0
        ? ['warn', crs(left, '') + ' بلا زيارة هذا الشهر', 'زِيرت ' + visited + ' من ' + courses]
        : ['star', 'زِيرت الدورات المنعقدة كلّها', null]);
    }
    if (idle > 0) points.push(['warn', crs(idle, ' مفتوحة', ' مفتوحتان') + ' بلا رصد', 'تُغلق بتاريخ انتهاء أو يُستأنف رصدها']);
    if (ended > 0) {
      points.push(['info', crs(ended, ' انتهت', ' انتهتا'),
        ready > 0 ? ready + ' منها مؤهّلة للكفالة' : 'لم تُحسم أهليّتها للكفالة بعد']);
    }
    out.push({ kicker: 'خلاصة ' + hv.month, points: points });
    return out;
  }

  /** «↑ 2 عن سبتمبر» — فرق عددين */
  function diff(cur, prev) {
    if (prev == null || prev === cur) return [null, null];
    return [(cur > prev ? '↑' : '↓') + ' ' + Math.abs(cur - prev) + ' عن ' + hv.prevMonth, cur > prev];
  }

  /* 📝 المسجّل والمحتسب — نسخة _raw/_rawOf/_review/_rawFoot في harvest_screen.dart:
     الحصاد يعدّ الصفحة مرّةً، والمسجّل يُذكر بجانبه متى زاد عليه. حصادٌ بلا rnew/rprev لا يعرض شيئًا */
  function isRaw(i) {
    return (n(i, 'rnew') || 0) > (n(i, 'pnew') || 0) + 0.5 || (n(i, 'rprev') || 0) > (n(i, 'prev') || 0) + 0.5;
  }
  function rawOf(counted, raw) { return raw != null && raw > counted + 0.5 ? 'من ' + f(raw) + ' مسجّلة' : null; }
  function review(prev, raw) {
    var r = rawOf(prev, raw);
    return r == null ? 'ومراجعة ' + f(prev) + ' صفحة' : 'ومراجعة ' + f(prev) + ' محتسبة ' + r;
  }
  function rawFoot(i) { return isRaw(i) ? 'الصفحة تُحتسب أوّل مرّة، وتكرارها مسجّلٌ ولا يُحتسب ثانيةً' : null; }

  // نسخة _circleSlides + _circlePoints
  function circleSlides(i) {
    var out = [];
    var pnew = n(i, 'pnew') || 0, prev = n(i, 'prev') || 0;
    var pages = pnew + prev;
    var prevPages = i.prev ? (p(i, 'pnew') || 0) + (p(i, 'prev') || 0) : null;
    var dp = pct(pages, prevPages);
    var days = n(i, 'days') || 0;
    // (2026-11-14، كأندرويد منذ 11-02) «تسميعٍ وسرد» لا «حفظٍ جديد»: الرقم يجمع النوعين 1 و7،
    // والمسجّل بجانب المحتسب متى زاد عليه (rnew/rprev)
    var raw = isRaw(i), dl = days + ' يومًا فيها نشاط';
    out.push(pnew > 0
      ? { kicker: 'حصاد ' + hv.month, big: f(pnew), unit: 'صفحة تسميعٍ وسرد' + (raw ? ' محتسبة' : ''),
          sub: raw ? [rawOf(pnew, n(i, 'rnew')), review(prev, n(i, 'rprev')), dl].filter(Boolean).join('\n')
            : 'ومراجعة ' + f(prev) + ' صفحة · ' + dl,
          delta: dp[0], up: dp[1], foot: rawFoot(i) }
      : { kicker: 'حصاد ' + hv.month, big: f(prev), unit: 'صفحة مراجعة' + (raw ? ' محتسبة' : ''),
          sub: [rawOf(prev, n(i, 'rprev')), dl].filter(Boolean).join('\n'),
          delta: dp[0], up: dp[1], foot: rawFoot(i) });

    var att = n(i, 'att') || 0;
    var da = pts(n(i, 'att'), p(i, 'att'));
    out.push({ kicker: 'الانتظام', big: att + '٪', unit: 'حضور طلاب الحلقة',
      sub: (n(i, 'regular') || 0) + ' من ' + (n(i, 'students') || 0) + ' حضروا 90٪ من لقاءاتهم فأكثر',
      delta: da[0], up: da[1] });

    // 🏅 (2026-11-22، نظير HarvestItem.onTime في Flutter) «الرصد بيومه» — يُقاس من 8 أيام
    var od = n(i, 'ot_days'), oo = n(i, 'ot_of');
    var ot = od != null && oo != null && oo >= 8
      ? { days: Math.round(od), of: Math.round(oo), badge: i.cur.ot_badge === 'Y' } : null;
    var otUnit = ot ? 'من ' + ot.of + ' ' + (ot.of <= 10 ? 'أيام' : 'يومًا') + ' رُصدت في يومها' : '';
    if (ot) out.push(ot.badge
      ? { kicker: '🏅 وسام «الرصد بيومه»', big: String(ot.days), unit: otUnit,
          sub: 'نالت الحلقة الوسام: رُصدت 90٪ من أيامها فأكثر في يومها، أوّلًا بأوّل', foot: 'انضباطٌ يُشكر عليه' }
      : { kicker: 'الرصد بيومه', big: Math.round(100 * ot.days / ot.of) + '٪', unit: 'من أيام الحلقة رُصدت في يومها',
          sub: ot.days + ' ' + otUnit + '\nالوسام لمن رصد 90٪ من أيامه في يومها، والأيام التي لم تُرصد أصلًا تُحسب متأخّرة' });

    var passed = Math.round(n(i, 'passed') || 0);
    var dx = diff(passed, p(i, 'passed'));
    out.push(passed > 0
      ? { kicker: 'الاختبارات', big: String(passed),
          unit: passed === 1 ? 'اختبارٌ ناجح أمام اللجنة' : passed === 2 ? 'اختباران ناجحان أمام اللجنة'
            : passed <= 10 ? 'اختباراتٍ ناجحة أمام اللجنة' : 'اختبارًا ناجحًا أمام اللجنة',
          sub: i.cur.best_name != null ? 'أعلى معدّل ' + f(n(i, 'best')) + ' لـ' + i.cur.best_name : null,
          delta: dx[0], up: dx[1] }
      : { kicker: 'الاختبارات', big: '0', unit: 'اختبار ناجح هذا الشهر',
          sub: 'الشهر الجديد فرصةٌ لترشيح من أتمّ جزءه' });

    var topOk = i.cur.top_name != null && (n(i, 'top_pnew') || 0) > 0;
    if (topOk) out.push({ kicker: 'الأكثر تسميعًا وسردًا', big: f(n(i, 'top_pnew')), unit: 'صفحة تسميعٍ وسرد', sub: String(i.cur.top_name) });

    var rank = n(i, 'rank'), ofN = n(i, 'of_n');
    var ranked = rank != null && ofN != null && ofN >= 3;
    if (ranked) {
      var pr = p(i, 'rank'), d = null, u = null;
      if (pr != null) {
        var m = Math.round(pr - rank), a = Math.abs(m);
        var w = a === 1 ? 'مرتبةً واحدة' : a === 2 ? 'مرتبتين' : a <= 10 ? a + ' مراتب' : a + ' مرتبة';
        d = m === 0 ? 'كما في ' + hv.prevMonth : (m > 0 ? 'صعدت ' : 'نزلت ') + w + ' عن ' + hv.prevMonth;
        u = m === 0 ? null : m > 0;
      }
      out.push({ kicker: 'ترتيب الحلقة', big: String(Math.round(rank)),
        unit: 'من ' + Math.round(ofN) + ' حلقة في ' + (i.cur.center || 'المركز'),
        sub: 'بدرجة التميّز: صفحات الحفظ والمراجعة والسرد واختبارات اللجنة بأوزان مؤسستك، لكل طالب، مضروبةً في الحضور',
        delta: d, up: u });
    }

    // الخلاصة نقاطًا
    var pd = pct(pages, prevPages);
    var points = [[pd[1] === true ? 'up' : pd[1] === false ? 'down' : 'info',
      f(pages) + ' صفحة تسميعٍ وسردٍ ومراجعة', pd[0] || 'أوّل شهرٍ للحلقة في الحصاد']];
    if (raw) points.push(['info', 'المسجّل ' + f((n(i, 'rnew') || 0) + (n(i, 'rprev') || 0)) + ' صفحة',
      'تُحتسب الصفحة أوّل مرّة، وتكرارها مسجّلٌ ولا يُحتسب ثانيةً']);
    var pa = pts(att, p(i, 'att'))[0];
    points.push(att >= 90 ? ['star', 'حضورٌ ممتاز ' + att + '٪', pa]
      : att >= 75 ? ['info', 'الحضور ' + att + '٪', 'يرتفع بمتابعة الغائبين' + (pa ? ' · ' + pa : '')]
        : ['warn', 'الحضور ' + att + '٪', 'يحتاج تواصلًا مع أولياء الأمور' + (pa ? ' · ' + pa : '')]);
    points.push(passed > 0
      ? ['star', passed === 1 ? 'اختبارٌ ناجح أمام اللجنة' : passed === 2 ? 'اختباران ناجحان أمام اللجنة'
          : passed <= 10 ? passed + ' اختباراتٍ ناجحة أمام اللجنة' : passed + ' اختبارًا ناجحًا أمام اللجنة',
          i.cur.best_name != null ? 'أعلاها ' + f(n(i, 'best')) + ' لـ' + i.cur.best_name : null]
      : ['warn', 'لا اختبار ناجح هذا الشهر', 'رشّح من أتمّ جزءه']);
    if (topOk) points.push(['star', 'الأكثر تسميعًا وسردًا: ' + i.cur.top_name, f(n(i, 'top_pnew')) + ' صفحة']);
    if (ot) {
      var otN = ot.days + ' من ' + ot.of + ' ' + (ot.of <= 10 ? 'أيام' : 'يومًا') + ' في يومها';
      points.push(ot.badge ? ['star', '🏅 وسام «الرصد بيومه»', otN] : ['info', 'رُصد ' + otN, 'الوسام عند 90٪']);
    }
    if (ranked) points.push([rank <= 3 ? 'star' : 'info', 'المرتبة ' + Math.round(rank) + ' من ' + Math.round(ofN), 'في ' + (i.cur.center || 'المركز')]);
    out.push({ kicker: 'خلاصة ' + hv.month, points: points, foot: 'بارك الله في الجهد' });
    return out;
  }

  // نسخة _courseSlides
  function courseSlides(i) {
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
      esc(hv.period) + '</span></div><div class="hv-main"><div class="hv-kicker">' + esc(s.kicker) + '</div>';
    if (s.points) {
      h += s.points.map(function (pt) {
        return '<div class="hv-point hv-' + pt[0] + '"><i class="fas ' + TONE_ICON[pt[0]] + '"></i><span><b>' + esc(pt[1]) + '</b>' +
          (pt[2] ? '<span class="hv-tail">  ' + esc(pt[2]) + '</span>' : '') + '</span></div>';
      }).join('') + (s.foot ? '<div class="hv-foot">' + esc(s.foot) + '</div>' : '');
    } else {
      h += '<div class="hv-big">' + esc(s.big) + '</div>' +
        (s.unit ? '<div class="hv-unit">' + esc(s.unit) + '</div>' : '') +
        (s.sub ? '<div class="hv-sub">' + esc(s.sub) + '</div>' : '') +
        (s.delta ? '<div class="hv-delta ' + (s.up == null ? '' : s.up ? 'up' : 'down') + '">' + esc(s.delta) + '</div>' : '') +
        (s.foot ? '<div class="hv-foot">' + esc(s.foot) + '</div>' : '');
    }
    var note = provisionalNote(hv);
    return h + '</div>' + (note ? '<div class="hv-prov-note">' + esc(note) + '</div>' : '') +
      '<div class="hv-brand">تطبيق الصفوة لمتابعة الحلقات القرآنية</div></div>';
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
    var it = st.list[st.item];
    var slides = slidesOf(it);
    if (st.slide >= slides.length) st.slide = slides.length - 1;
    var h = '<div class="hv-bar"><button type="button" class="hv-icon" data-act="close" title="رجوع" aria-label="رجوع">' +
      '<i class="fas fa-arrow-right"></i></button><div class="hv-title">حصاد ' + esc(hv.month) + '</div>' +
      // 🔒 (2026-11-22) الشهر الجاري قبل إعلانه للمدير والمبرمج (HARVEST_LIVE)
      (hv.live || typeof hasCapability !== 'function' || !hasCapability('HARVEST_LIVE') ? '' : '<button type="button" class="hv-live" data-act="live">هذا الشهر حتى الآن</button>') +
      '</div><div class="hv-body">';
    if (st.list.length > 1) {
      h += '<div class="hv-chips">' + st.list.map(function (x, k) {
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
    var count = slidesOf(st.list[st.item]).length;
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
      case 'live': return openLive();
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
      var it = st.list[st.item];
      var slides = slidesOf(it);
      // الغلاف ltr كي تبدأ البطاقة من x=0 فيُقصّ عرضها وحده من الحاوية
      var html = '<div style="direction:ltr"><div dir="rtl" class="hv-export">' + cardHtml(slides[st.slide], slides.length, it) + '</div></div>';
      var canvas = await html2pdf().set({ html2canvas: { scale: 3, width: 360, backgroundColor: null,
        onclone: window.QmcAppearance && QmcAppearance.lightClone } })   // 🌙 الصورة فاتحةٌ دائمًا
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

  /** [kind]: من بطاقة «طلابي» (CIRCLE) أو «دوراتي» (COURSE) — وبلا نوعٍ كلّها */
  function open(kind) {
    if (!hv) return;
    var list = kind ? hv.items.filter(function (i) { return i.kind === kind; }) : hv.items;
    if (!list.length) return;
    st = { list: list, item: 0, slide: 0, sharing: false };
    render();
    ensureScreen().style.display = 'flex';
    document.body.classList.add('hv-open');
  }

  function close() {
    // من «هذا الشهر» ⇒ يعود حصاد الشهر الماضي (البطاقة في الرئيسية له)
    if (hv && hv.live && hvBase) { hv = hvBase; hvBase = null; }
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
    '.hv-foot{margin-top:6px;font-size:14.5px;font-weight:600;color:' + GOLD + '}' +
    '.hv-brand{text-align:center;font-size:11px;color:#00000061}' +
    '.hv-live{margin-inline-start:auto;background:none;border:1px solid ' + GOLD + '80;color:' + GOLD + ';border-radius:16px;padding:5px 10px;font-size:12.5px;font-weight:600;white-space:nowrap}' +
    '.hv-prov-note{text-align:center;font-size:12px;font-weight:600;color:#92400e;line-height:1.4;margin-bottom:6px}' +
    '.hv-entry-text span.hv-prov{font-size:12px;font-weight:600;color:#92400e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.hv-export{width:360px}.hv-export .hv-main{flex:none;overflow:visible;padding:28px 0}' +
    '.hv-nav{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px}' +
    '.hv-btn{display:inline-flex;align-items:center;gap:6px;background:var(--primary);color:#fff;border-radius:22px;padding:9px 14px;font-size:14px}' +
    '.hv-btn:disabled{opacity:.45}' +
    '.hv-outline{background:#fff;color:var(--primary);border:1px solid var(--primary-line,#c6dafc)}' +
    '.hv-tonal{background:var(--primary-wash,#e8f0fe);color:var(--primary-dark,#0d47a1)}' +
    '.hv-entry{display:flex;align-items:center;gap:12px;width:100%;text-align:right;justify-content:flex-start;background:linear-gradient(90deg,' + GOLD_SOFT + ',#fffbeb);border:1px solid ' + GOLD + '59;border-radius:14px;padding:12px 14px;margin-bottom:12px;color:inherit;font-weight:400}' +
    '.hv-teaser{display:flex;align-items:flex-start;gap:12px;background:#fffbeb;border:1px solid ' + GOLD + '59;border-radius:14px;padding:12px 14px;margin-bottom:12px}' +
    '.hv-teaser .hv-entry-icon{font-size:20px;font-weight:800}' +
    '.hv-teaser .hv-entry-text span.hv-tl{color:#000000de;margin-top:2px}' +
    '.hv-teaser .hv-entry-text span.hv-prov{white-space:normal}' +
    '.hv-entry-icon{width:42px;height:42px;border-radius:11px;background:#fff;color:' + GOLD + ';display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}' +
    '.hv-entry-text{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}' +
    '.hv-entry-text b{font-size:15.5px;color:' + GOLD + '}.hv-entry-text span{font-size:13px;color:#00000089}' +
    '.hv-entry-go{color:' + GOLD + '}' +
    '.hv-entry-big{font-size:26px;font-weight:800;line-height:1;color:' + GOLD + ';direction:ltr;flex-shrink:0}';
  (function injectCss() {
    var s = document.createElement('style');
    s.id = 'harvestStyle';
    s.textContent = CSS;
    document.head.appendChild(s);
  })();

  window.QmcHarvest = { refresh: refresh, paintHome: paintHome, open: open, close: close };

  // بعد الإقلاع: البطاقتان، والفتح وحده 1–5 (كـ«اليوم» في أندرويد) — مهلةٌ كي لا يزاحم سحب البيانات
  window.addEventListener('load', function () {
    if (!window.QMC || !QMC.getUserName() || !QMC.getDeviceId()) return;
    setTimeout(function () { refresh().catch(function () {}); }, 2500);
  });
})();
