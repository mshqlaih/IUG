/* 🖼️ مشاركة النشاط بطاقةً ونصًّا منسّقًا (2026-11-13) — نظير
 * lib/reports/activity_share.dart و activity_actions.dart في أندرويد.
 *
 * «مشاركة» في تقرير الأنشطة تفتح نافذةً بأربعة أشكال (يُحفظ آخرها على الجهاز):
 *   · النصّ المعتاد (كما كان) · بطاقة + نصّ منسّق · البطاقة وحدها · النصّ المنسّق وحده
 * البطاقة لكل حلقةٍ ويوم، تُرسم على الجهاز (canvas) 1080×1350 PNG — بلا إنترنت.
 * ⚠️ أسماء الغائبين ليست في البطاقة عمدًا: الصورة تُتداول، والنصّ يحملها.
 * ⚠️ iOS يرفض navigator.share بعد انتظارٍ طويل ⇒ تُرسم البطاقة أوّلًا وتُعرض،
 *    ثم «مشاركة» بلمسةٍ جديدة.
 * شعار المؤسسة واسمها من نسخة الرئيسية (org_brand:<user>) — مؤسسة المستخدم؛
 * العميل لا يعرف مؤسسة الحلقة نفسها (لا root في getUserCircles).
 */
(function () {
  'use strict';

  var APP_NAME = 'تطبيق الصفوة لمتابعة الحلقات القرآنية';
  var CAPTION_MAX = 1000;   // واتساب يقطع تعليق الصورة عند 1024
  var MODES = [
    ['classic', 'النصّ المعتاد', 'fa-comment'],
    ['cardAndText', 'بطاقة + نصّ منسّق', 'fa-image'],
    ['cardOnly', 'البطاقة وحدها', 'fa-panorama'],
    ['richText', 'النصّ المنسّق وحده', 'fa-align-right']
  ];

  function esc(v) { return typeof escapeHtml === 'function' ? escapeHtml(v) : String(v == null ? '' : v); }
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (_) { return null; } }
  function toast(m) { if (typeof showToast === 'function') showToast(m); }
  function user() { try { return typeof getCurrentUser === 'function' ? String(getCurrentUser() || '') : ''; } catch (_) { return ''; } }
  function lastMode() {
    try { var v = localStorage.getItem('activity_share_mode'); return MODES.some(function (m) { return m[0] === v; }) ? v : 'classic'; }
    catch (_) { return 'classic'; }
  }
  function saveMode(m) { try { localStorage.setItem('activity_share_mode', m); } catch (_) {} }

  // ── البيانات ──
  function typeOf(r) { return Number(r.type); }
  function isAbsent(t) { return t === 4 || t === 5; }
  function isPart(t) { return t === 6 || t === 7; }
  function isReview(t) { return t === 2 || t === 22; }
  function pagesOf(r) { return parseFloat(r.amount) || 0; }
  function fmtPages(p) { return (Math.round(p * 10) / 10).toFixed(1); }
  function gradeName(g) {
    if (g == null || g === '' || Number(g) === 0) return '';
    var n = typeof translateLookup === 'function' ? translateLookup('ACTIVITY_GRADE', g) : '';
    return n && String(n) !== String(g) ? String(n) : '';
  }
  function typeName(r) {
    return typeof activityTypeName === 'function' ? activityTypeName(typeOf(r)) : 'نوع ' + r.type;
  }

  var _names = {};
  function studentName(r) {
    var k = Number(r.student);
    if (_names[k]) return _names[k];
    var s = (typeof _studentsCache !== 'undefined' ? _studentsCache : []).find(function (x) { return Number(x.id) === k; });
    var n = (typeof tripleStudentName === 'function' ? tripleStudentName(s) : '') || ('طالب ' + k);
    _names[k] = n;
    return n;
  }

  /* «سورة البقرة آية 155 …» ⇒ {sura, aya} */
  function ayah(id) {
    if (!id || typeof AYAH_REVERSE === 'undefined') return null;
    var m = /^سورة\s+(.+?)\s+آية\s+(\d+)/.exec(String(AYAH_REVERSE[id] || ''));
    return m ? { sura: m[1].trim(), aya: m[2] } : null;
  }
  /* «الشعراء *(123–192)*» أو «الصافات *(127)* ← ص *(16)*» — أرقامٌ غامقة بين قوسين */
  function rangeText(r) {
    var f = ayah(r.fromRange), t = ayah(r.toRange);
    if (!f || !t) return '';
    if (f.sura === t.sura) return f.aya === t.aya ? f.sura + ' *(' + f.aya + ')*' : f.sura + ' *(' + f.aya + '–' + t.aya + ')*';
    return f.sura + ' *(' + f.aya + ')* ← ' + t.sura + ' *(' + t.aya + ')*';
  }
  function partText(r) {
    var J = typeof JUZ_NAMES !== 'undefined' ? JUZ_NAMES : {};
    var f = J[r.partFrom] || '', t = J[r.partTo] || '';
    if (!f) return t;
    if (!t || f === t) return f;
    return f + ' – ' + t;
  }

  function dayLabel(date) {
    var W = window.QmcWelcome;
    var g = W && W.gregorianLabel ? W.gregorianLabel(date) + ' ' + date.getFullYear() : date.toLocaleDateString('ar');
    var h = W && W.hijriLabel ? W.hijriLabel(date) : null;
    return h ? g + ' · ' + h : g;
  }
  function parseDay(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
  }

  /* حلقةٌ ويوم — وحدة البطاقة ووحدة كتلة النصّ */
  async function groupDays(records) {
    _names = {};
    var circles = {};
    try { (await getCirclesFromDb()).forEach(function (c) { circles[Number(c.circleNo)] = c; }); } catch (_) {}
    var studs = typeof _studentsCache !== 'undefined' ? _studentsCache : [];
    var map = {}, order = [];
    records.forEach(function (r) {
      var s = studs.find(function (x) { return Number(x.id) === Number(r.student); });
      var cno = s && s.circleNo != null ? Number(s.circleNo) : 0;
      var k = cno + '|' + String(r.date).substring(0, 10);
      if (!map[k]) { map[k] = { circleNo: cno, date: parseDay(r.date), acts: [] }; order.push(k); }
      map[k].acts.push(r);
    });
    var out = order.map(function (k) {
      var d = map[k], c = circles[d.circleNo];
      var name = c && c.circleName ? String(c.circleName).trim() : (d.circleNo ? 'حلقة ' + d.circleNo : 'الحلقة');
      d.title = name.indexOf('حلقة') === 0 ? name : 'حلقة ' + name;
      d.circleName = name;
      d.centerName = c && c.centerName ? String(c.centerName).trim() : '';
      d.dateLabel = dayLabel(d.date);
      return d;
    });
    out.sort(function (a, b) { return (a.date - b.date) || a.circleName.localeCompare(b.circleName, 'ar'); });
    return out;
  }

  /* الأرقام بالطالب لا بالصفّ (DayStats.of) */
  function stats(d) {
    var present = {}, excused = {}, unexcused = {}, silent = {}, other = {};
    d.acts.forEach(function (a) { if (!isAbsent(typeOf(a))) present[a.student] = 1; });
    d.acts.forEach(function (a) { if (!present[a.student] && typeOf(a) === 4) excused[a.student] = 1; });
    d.acts.forEach(function (a) { if (!present[a.student] && !excused[a.student] && typeOf(a) === 5) unexcused[a.student] = 1; });
    d.acts.forEach(function (a) {
      var t = typeOf(a);
      if (t === 3) silent[a.student] = 1;
      else if (!isAbsent(t)) other[a.student] = 1;
    });
    Object.keys(other).forEach(function (k) { delete silent[k]; });
    var pages = 0, review = 0, excellent = 0, per = {};
    d.acts.forEach(function (a) {
      var t = typeOf(a);
      if ((t === 1 || isReview(t)) && Number(a.rating) === 1) excellent++;
      if (isReview(t)) review += pagesOf(a);
      if (t !== 1) return;
      pages += pagesOf(a);
      var p = per[a.student] || { p: 0, g: null, r: a };
      var ng = a.rating == null || a.rating === '' ? null : Number(a.rating);
      p.p += pagesOf(a);
      if (p.g == null || (ng != null && ng < p.g)) p.g = ng;
      per[a.student] = p;
    });
    var top = Object.keys(per).map(function (k) { return per[k]; }).filter(function (x) { return x.p > 0; })
      .sort(function (a, b) { return (b.p - a.p) || ((a.g == null ? 9 : a.g) - (b.g == null ? 9 : b.g)); })
      .slice(0, 3).map(function (x) { return { name: studentName(x.r), pages: x.p }; });
    var exams = d.acts.filter(function (a) { return isPart(typeOf(a)); })
      .sort(function (a, b) { return (parseFloat(b.mark) || 0) - (parseFloat(a.mark) || 0); });
    var P = Object.keys(present).length, E = Object.keys(excused).length, U = Object.keys(unexcused).length;
    var total = P + E + U;
    return { present: P, excused: E, unexcused: U, silent: Object.keys(silent).length, total: total,
      percent: total ? Math.round(P * 100 / total) : 0, pages: pages, review: review, excellent: excellent, exams: exams, top: top };
  }

  // ── النصّ المنسّق ──
  var GRADE_ICON = { 1: '🌟', 2: '✨', 3: '👍', 4: '▫️' };
  var TYPE_ICON = { 1: '📖', 2: '🔄', 22: '🔄', 6: '🏆', 7: '📚' };
  var INDENT = '      ';   // المسافة العادية في أوّل السطر يبتلعها واتساب

  function noteLine(lines, a) {
    var n = String(a.notes || '').replace(/\s+/g, ' ').trim();
    if (!n) return;
    lines.push(n.indexOf('*') !== -1 || n.indexOf('_') !== -1 ? INDENT + '↩ 📝 ' + n : INDENT + '↩ 📝 _' + n + '_');
  }

  function writeDay(lines, d) {
    var s = stats(d);
    lines.push('🕌 *' + d.title + '*');
    lines.push('_' + d.dateLabel + '_');
    lines.push('');
    lines.push('> 📊 *حصاد اليوم*');
    lines.push('> ✅ الحضور *' + s.present + ' / ' + s.total + '* · ' + s.percent + '٪' + (s.silent > 0 ? ' · منهم لم يُسمّع *' + s.silent + '*' : ''));
    var l3 = [];
    if (s.pages > 0) l3.push('📖 صفحات التسميع *' + fmtPages(s.pages) + '*');
    if (s.review > 0) l3.push('🔁 المراجعة *' + fmtPages(s.review) + '*');
    if (s.exams.length) l3.push('🏆 اختبارات *' + s.exams.length + '*');
    if (l3.length) lines.push('> ' + l3.join(' · '));

    var byType = {};
    d.acts.forEach(function (a) { var t = typeOf(a); (byType[t] = byType[t] || []).push(a); });
    var known = [1, 2, 22, 3, 4, 5, 6, 7];
    var order = [1, 2, 22, 6, 7].concat(Object.keys(byType).map(Number).filter(function (t) { return known.indexOf(t) === -1; }), [3, 4, 5]);
    order.forEach(function (t) {
      var list = byType[t];
      if (!list || !list.length) return;
      lines.push('');
      if (t === 1 || isReview(t)) {
        lines.push(TYPE_ICON[t] + ' *' + typeName(list[0]) + '*');
        var byG = {};
        list.forEach(function (a) { var g = a.rating == null || a.rating === '' || Number(a.rating) === 0 ? 'x' : String(Number(a.rating)); (byG[g] = byG[g] || []).push(a); });
        var gs = Object.keys(byG).sort(function (x, y) { return (x === 'x' ? 99 : +x) - (y === 'x' ? 99 : +y); });
        gs.forEach(function (g) {
          var rows = byG[g].sort(function (x, y) { return pagesOf(y) - pagesOf(x); });
          var gn = g === 'x' ? '' : gradeName(g);
          if (gn) lines.push((GRADE_ICON[g] || '▫️') + ' _' + gn + '_');
          else if (g === 'x' && gs.length > 1) lines.push('▫️ _بلا تقدير_');
          rows.forEach(function (a, i) {
            var rg = rangeText(a);
            lines.push((i + 1) + '. *' + studentName(a) + '*' + (rg ? ' · ' + rg : '') + ' · ' + fmtPages(pagesOf(a)) + ' ص');
            noteLine(lines, a);
          });
        });
      } else if (isPart(t)) {
        lines.push(TYPE_ICON[t] + ' *' + typeName(list[0]) + '*');
        list.slice().sort(function (x, y) { return (parseFloat(y.mark) || 0) - (parseFloat(x.mark) || 0); }).forEach(function (a, i) {
          var g = gradeName(a.rating);
          var parts = [partText(a)];
          if ((parseFloat(a.mark) || 0) > 0) parts.push('*' + a.mark + '*');
          if (g) parts.push(g);
          lines.push((i + 1) + '. *' + studentName(a) + '* · ' + parts.filter(Boolean).join(' · '));
          noteLine(lines, a);
        });
      } else if (t === 3 || t === 4 || t === 5) {
        var hd = t === 3 ? '🟢 *حضر ولم يُسمِّع*' : t === 4 ? '🟡 *غياب بعذر*' : '🔴 *غياب بلا عذر*';
        lines.push(hd + ' *' + list.length + '*');
        list.forEach(function (a) { lines.push('- ' + studentName(a)); noteLine(lines, a); });
        if (t === 5) lines.push('_نرجو من أولياء الأمور متابعة أبنائهم مع معلّم الحلقة._');
      } else {
        lines.push('❓ *' + typeName(list[0]) + '*');
        list.forEach(function (a) { lines.push('- ' + studentName(a)); noteLine(lines, a); });
      }
    });
  }

  function richText(days) {
    if (!days.length) return '_لا توجد أنشطة لعرضها_';
    var lines = [];
    days.forEach(function (d, i) {
      if (i > 0) { lines.push(''); lines.push('━━━━━━━━━━━━'); lines.push(''); }
      writeDay(lines, d);
    });
    lines.push('');
    lines.push('_' + APP_NAME + '_');
    return lines.join('\n');
  }

  // ── البطاقة (canvas) ──
  var W = 540, H = 675, SCALE = 2;
  var C = { green: '#0F5C43', green2: '#167A59', gold: '#B8893A', paper: '#FBF8F1', ink: '#12352A', soft: '#EEF3EC', muted: '#5B6E64', tile: '#E3E9E2' };
  var TAJ = "'QmcTajawal','Segoe UI',Tahoma,sans-serif", AMIRI = "'QmcAmiri','Amiri',serif";

  function font(size, bold, fam) { return (bold ? 'bold ' : '') + size + 'px ' + (fam || TAJ); }
  /* يقصّ النصّ بـ«…» ليتّسع في [maxW] */
  function fit(ctx, s, maxW) {
    s = String(s || '');
    if (ctx.measureText(s).width <= maxW) return s;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }
  /* نصٌّ عربيّ ملاصقٌ لـ[right] ⇒ عرضه */
  function textR(ctx, s, right, y, size, color, bold, fam, maxW) {
    ctx.font = font(size, bold, fam);
    ctx.fillStyle = color;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    var t = fit(ctx, s, maxW || W);
    ctx.fillText(t, right, y);
    return ctx.measureText(t).width;
  }
  function textC(ctx, s, cx, y, size, color, bold, dir, maxW) {
    ctx.font = font(size, bold);
    ctx.fillStyle = color;
    ctx.direction = dir || 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(fit(ctx, s, maxW || W), cx, y);
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function loadLogo() {
    var u = user();
    var b = u ? lsGet('org_brand:' + u) : null;
    var w = u ? lsGet('welcome:' + u) : null;
    var name = (w && w.root_name) || (b && b.name) || '';
    if (!b || !b.b64) return Promise.resolve({ img: null, name: name });
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () { res({ img: im, name: name }); };
      im.onerror = function () { res({ img: null, name: name }); };
      im.src = 'data:image/png;base64,' + b.b64;
    });
  }

  async function fontsReady() {
    try {
      if (document.fonts && document.fonts.load) {
        await Promise.all([document.fonts.load(font(16, false)), document.fonts.load(font(16, true)),
          document.fonts.load(font(32, true, AMIRI))]);
      }
    } catch (_) {}
  }

  function paintHeader(ctx, d, org) {
    var m = 24;
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, W, H);
    var g = ctx.createLinearGradient(W, 0, 0, 214);
    g.addColorStop(0, C.green); g.addColorStop(1, C.green2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, 214);
    ctx.beginPath();
    ctx.moveTo(0, 196);
    ctx.quadraticCurveTo(W / 2, 236, W, 196);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = C.paper;
    ctx.fill();

    var nameRight = W - m;
    if (org.img) {
      var r = 30, cx = W - m - r, cy = m + r;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r - 4, 0, Math.PI * 2); ctx.clip();
      var box = (r - 7) * 2, iw = org.img.naturalWidth || box, ih = org.img.naturalHeight || box;
      var k = Math.min(box / iw, box / ih);
      ctx.drawImage(org.img, cx - iw * k / 2, cy - ih * k / 2, iw * k, ih * k);
      ctx.restore();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = C.gold; ctx.stroke();
      nameRight = W - m - r * 2 - 12;
    }
    var top = String(org.name || '').trim(), sub = String(d.centerName || '').trim();
    var lines = [];
    if (top) lines.push(top);
    if (sub && sub !== top) lines.push(sub);
    var oy = lines.length === 2 ? m + 8 : m + 19;
    lines.forEach(function (t, i) {
      textR(ctx, t, nameRight, oy, i === 0 ? 15 : 13, i === 0 ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.8)', i === 0, null, nameRight - m);
      oy += (i === 0 ? 15 : 13) * 1.3;
    });
    var ty = (!org.img && !lines.length) ? 52 : 94;
    textR(ctx, d.title, W - m, ty, 32, '#fff', true, AMIRI, W - m * 2);
    textR(ctx, d.dateLabel, W - m, ty + 52, 14.5, 'rgba(255,255,255,.9)', false, null, W - m * 2);
  }

  function paintTiles(ctx, tiles) {
    var ty = 196, th = 72, gap = 10, tm = 22, n = Math.max(1, Math.min(4, tiles.length));
    var tw = (W - tm * 2 - gap * (n - 1)) / n;
    tiles.forEach(function (t, i) {
      var x = W - tm - (i + 1) * tw - i * gap;
      rrect(ctx, x, ty, tw, th, 12);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = C.tile; ctx.lineWidth = 1; ctx.stroke();
      // الرقم وذيله الصغير (ltr)
      ctx.font = font(26, true); var w1 = ctx.measureText(t[0]).width;
      ctx.font = font(14, false); var w2 = t[1] ? ctx.measureText(t[1]).width : 0;
      var sx = x + tw / 2 - (w1 + w2) / 2;
      ctx.direction = 'ltr'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.font = font(26, true); ctx.fillStyle = C.green; ctx.fillText(t[0], sx, ty + 8);
      if (t[1]) { ctx.font = font(14, false); ctx.fillStyle = C.muted; ctx.fillText(t[1], sx + w1, ty + 18); }
      textC(ctx, t[2], x + tw / 2, ty + 44, 12.5, C.muted, false, 'rtl', tw - 8);
    });
    return ty + th;
  }

  function head(ctx, y, t, count) {
    var m = 24;
    var w = textR(ctx, t, W - m, y, 16, C.gold, true, null, W - m * 2);
    if (count) textR(ctx, count, W - m - w - 8, y + 3, 13, C.muted);
    return y + 26;
  }

  function knightRow(ctx, y, i, name, pages) {
    var m = 24, rh = 36, medals = ['#C9A03F', '#9AA5A8', '#B07A4C'];
    rrect(ctx, m, y, W - m * 2, rh, 10); ctx.fillStyle = C.soft; ctx.fill();
    var mx = W - m - 22, my = y + rh / 2;
    ctx.beginPath(); ctx.arc(mx, my, 13, 0, Math.PI * 2); ctx.fillStyle = medals[i % 3]; ctx.fill();
    textC(ctx, String(i + 1), mx, my - 9, 14, '#fff', true, 'ltr');
    var pt = fmtPages(pages) + ' ص';
    ctx.font = font(15, true);
    var pw = ctx.measureText(pt).width;
    ctx.direction = 'rtl'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = C.green;
    ctx.fillText(pt, m + 14, y + (rh - 19) / 2);
    textR(ctx, name, W - m - 44, y + (rh - 21) / 2, 16, C.ink, true, null, W - m * 2 - 44 - pw - 30);
    return y + rh + 6;
  }

  function paintCard(ctx, d, s, org) {
    var m = 24;
    paintHeader(ctx, d, org);
    var tiles = [
      [String(s.present), '/' + s.total, 'الحضور'],
      s.review > 0 ? [fmtPages(s.pages), ' +' + fmtPages(s.review), 'تسميع + مراجعة'] : [fmtPages(s.pages), null, 'صفحة تسميع'],
      [String(s.excellent), null, 'ممتاز'],
      [String(s.exams.length), null, 'اختبار']
    ];
    var y = paintTiles(ctx, tiles) + 18;
    if (s.top.length) {
      y = head(ctx, y, 'فرسان اليوم');
      s.top.forEach(function (t, i) { y = knightRow(ctx, y, i, t.name, t.pages); });
      y += 12;
    }
    if (s.exams.length) {
      var rows = s.top.length ? 1 : 2;
      var shown = s.exams.slice(0, rows * 2), more = s.exams.length - shown.length;
      y = head(ctx, y, 'مبارك الاختبار', more > 0 ? '+ ' + more + ' في الرسالة' : null);
      var bh = 66, bg = 10, bw = (W - m * 2 - bg) / 2;
      shown.forEach(function (a, i) {
        var x = W - m - (i % 2 + 1) * bw - (i % 2) * bg, by = y + Math.floor(i / 2) * (bh + bg);
        rrect(ctx, x, by, bw, bh, 10); ctx.fillStyle = '#FFFCF4'; ctx.fill();
        ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(184,137,58,.7)'; ctx.stroke();
        var mark = (parseFloat(a.mark) || 0) > 0 ? String(a.mark) : '', markW = 0;
        if (mark) {
          ctx.font = font(24, true); ctx.fillStyle = C.green; ctx.direction = 'ltr'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText(mark, x + 12, by + (bh - 31) / 2);
          markW = ctx.measureText(mark).width + 12;
        }
        var inner = bw - 24 - markW;
        textR(ctx, studentName(a), x + bw - 12, by + 9, 15, C.ink, true, null, inner);
        var g = gradeName(a.rating);
        textR(ctx, [partText(a), g].filter(Boolean).join(' · '), x + bw - 12, by + 36, 12.5, C.muted, false, null, inner);
      });
      y += Math.ceil(shown.length / 2) * (bh + bg) + 8;
    }
    // عدّادات الحضور
    var chips = [['حضر ' + s.present, '#E1F1E6', '#17643F']];
    if (s.silent > 0) chips.push(['منهم لم يُسمّع ' + s.silent, '#EDEFEA', '#4F5D55']);
    if (s.excused > 0) chips.push(['بعذر ' + s.excused, '#FBF0D6', '#8A6212']);
    if (s.unexcused > 0) chips.push(['بلا عذر ' + s.unexcused, '#F8E0DC', '#9A2F22']);
    var cx = W - m;
    chips.forEach(function (c) {
      ctx.font = font(14, true);
      var w = ctx.measureText(c[0]).width + 26;
      rrect(ctx, cx - w, y, w, 30, 15); ctx.fillStyle = c[1]; ctx.fill();
      textR(ctx, c[0], cx - 13, y + 7, 14, c[2], true);
      cx -= w + 8;
    });
    // التذييل
    var fy = H - 74;
    ctx.beginPath(); ctx.moveTo(m, fy); ctx.lineTo(W - m, fy); ctx.strokeStyle = '#E6E1D5'; ctx.lineWidth = 1; ctx.stroke();
    textR(ctx, '«خيرُكم مَن تعلَّم القرآنَ وعلَّمه»', W - m, fy + 10, 17, C.green, true, AMIRI);
    textR(ctx, APP_NAME, W - m, fy + 42, 12.5, C.muted);
  }

  async function buildCards(days) {
    await fontsReady();
    var org = await loadLogo();
    var out = [];
    for (var i = 0; i < days.length; i++) {
      var d = days[i];
      var cv = document.createElement('canvas');
      cv.width = W * SCALE; cv.height = H * SCALE;
      var ctx = cv.getContext('2d');
      ctx.scale(SCALE, SCALE);
      paintCard(ctx, d, stats(d), org);
      var blob = await new Promise(function (res) { cv.toBlob(res, 'image/png'); });
      if (!blob) continue;
      var mm = String(d.date.getMonth() + 1).padStart(2, '0'), dd = String(d.date.getDate()).padStart(2, '0');
      var fname = ('نشاط ' + d.title + ' ' + d.date.getFullYear() + '-' + mm + '-' + dd).replace(/[\\/:*?"<>|]/g, '-') + '.png';
      out.push({ blob: blob, name: fname, url: URL.createObjectURL(blob) });
    }
    return out;
  }

  // ── النافذة ──
  function overlay(inner) {
    var old = document.getElementById('shareActModal');
    if (old) old.remove();
    var o = document.createElement('div');
    o.id = 'shareActModal';
    o.className = 'modal-overlay';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.style.display = 'flex';
    o.innerHTML = '<div class="modal-box sh-box">' + inner + '</div>';
    document.body.appendChild(o);
    return o;
  }

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); toast('نُسخ النصّ — الصقه في واتساب'); }
    catch (_) { toast('تعذّر النسخ على هذا المتصفح'); }
  }

  /* المدخل: «مشاركة» في سطر نشاط اليوم في «طلابي» ([records] و[day])،
     أو زرّ التقرير (ما يعرضه) */
  async function openActivityShare(records, day) {
    var recs = Array.isArray(records) ? records
      : (typeof lastDisplayedRecords !== 'undefined' ? lastDisplayedRecords : []);
    if (!recs || !recs.length) {
      if (typeof showAlert === 'function') showAlert('لا توجد سجلات لمشاركتها بهذه التصفية');
      return;
    }
    injectCss();
    var days = await groupDays(recs);
    var rich = richText(days);
    var classic = typeof buildClassicReportText === 'function'
      ? await buildClassicReportText(Array.isArray(records) ? recs : null, day || null) : null;
    var mode = lastMode();
    var cards = null, building = false;

    var o = overlay('<h4 class="modal-title"><i class="fas fa-share-nodes"></i> مشاركة النشاط</h4>' +
      '<div class="sh-sub">' + esc(days.length === 1 ? days[0].title + ' — ' + days[0].dateLabel : days.length + ' حلقة/يوم') + '</div>' +
      '<div class="sh-modes" id="shModes"></div><div id="shPrev"></div>' +
      '<div class="modal-actions" id="shActs"></div>');

    function cleanup() { (cards || []).forEach(function (c) { try { URL.revokeObjectURL(c.url); } catch (_) {} }); }
    function close() { cleanup(); o.remove(); }
    function isCard() { return mode === 'cardAndText' || mode === 'cardOnly'; }
    function textFor() { return mode === 'classic' ? classic : (mode === 'cardOnly' ? null : rich); }

    function draw() {
      o.querySelector('#shModes').innerHTML = MODES.map(function (m) {
        return '<button type="button" class="sh-mode' + (mode === m[0] ? ' on' : '') + '" data-mode="' + m[0] + '"' +
          (m[0] === 'classic' && !classic ? ' disabled' : '') + '><i class="fas ' + m[2] + '"></i> ' + esc(m[1]) + '</button>';
      }).join('');
      var prev = o.querySelector('#shPrev'), h = '';
      if (isCard()) {
        if (building || !cards) h += '<div class="sh-wait"><i class="fas fa-spinner fa-spin"></i> جارٍ رسم البطاقة…</div>';
        else if (!cards.length) h += '<div class="sh-wait">تعذّر رسم البطاقة على هذا المتصفح</div>';
        else h += '<div class="sh-cards">' + cards.map(function (c) { return '<img src="' + c.url + '" alt="">'; }).join('') + '</div>';
        if (mode === 'cardAndText') h += '<div class="sh-note">أسماء الغائبين في النصّ لا في الصورة.' +
          (rich.length > CAPTION_MAX ? ' والنصّ طويل ⇒ أرسل الصورة ثم «نسخ النصّ» رسالةً ثانية.' : '') + '</div>';
      }
      var t = textFor();
      if (t) h += '<pre class="sh-text">' + esc(t) + '</pre>';
      prev.innerHTML = h;
      var a = '<button type="button" class="modal-btn modal-cancel" data-sh="close">إغلاق</button>';
      if (t) a += '<button type="button" class="modal-btn modal-cancel" data-sh="copy"><i class="fas fa-copy"></i> نسخ النصّ</button>';
      if (isCard() && cards && cards.length) a += '<button type="button" class="modal-btn modal-cancel" data-sh="save"><i class="fas fa-download"></i> حفظ</button>';
      a += '<button type="button" class="modal-btn modal-confirm" data-sh="share"' + (isCard() && (!cards || !cards.length) ? ' disabled' : '') +
        '><i class="fas fa-share"></i> مشاركة</button>';
      o.querySelector('#shActs').innerHTML = a;
    }

    async function ensureCards() {
      if (cards || building) return;
      building = true; draw();
      try { cards = await buildCards(days); } catch (e) { console.warn('share card:', e); cards = []; }
      building = false;
      if (document.body.contains(o)) draw();
    }

    async function share() {
      var t = textFor();
      if (!isCard()) { close(); if (typeof shareTextSafely === 'function') shareTextSafely(t); return; }
      var files = cards.map(function (c) { return new File([c.blob], c.name, { type: 'image/png' }); });
      var withText = mode === 'cardAndText' && t && t.length <= CAPTION_MAX;
      try {
        if (navigator.canShare && navigator.canShare({ files: files })) {
          await navigator.share(withText ? { files: files, text: t } : { files: files });
          if (mode === 'cardAndText' && !withText) toast('أُرسلت الصورة — «نسخ النصّ» للرسالة الثانية');
          return;
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        console.warn('share files:', err);
      }
      save();
      if (mode === 'cardAndText') copyText(t);
    }
    function save() {
      (cards || []).forEach(function (c) {
        var a = document.createElement('a');
        a.href = c.url; a.download = c.name;
        document.body.appendChild(a); a.click(); a.remove();
      });
    }

    o.addEventListener('click', function (ev) {
      if (ev.target === o) { close(); return; }
      var b = ev.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.mode) { mode = b.dataset.mode; saveMode(mode); draw(); if (isCard()) ensureCards(); }
      else if (b.dataset.sh === 'close') close();
      else if (b.dataset.sh === 'copy') copyText(textFor());
      else if (b.dataset.sh === 'save') save();
      else if (b.dataset.sh === 'share') share();
    });
    if (!classic && mode === 'classic') mode = 'richText';
    draw();
    if (isCard()) ensureCards();
  }

  function injectCss() {
    if (document.getElementById('shCss')) return;
    var st = document.createElement('style');
    st.id = 'shCss';
    st.textContent =
      '.sh-box{text-align:start;max-width:520px;max-height:90vh;overflow:auto}' +
      // الأزرار ثابتةٌ أسفل النافذة بهامشٍ عمّا فوقها، والنصّ الطويل يمرّ تحتها
      '.sh-box .modal-actions{position:sticky;bottom:0;background:#fff;margin-top:14px;padding-top:12px;' +
      'border-top:1px solid #eef0f3;flex-wrap:wrap;z-index:1}' +
      '.sh-box .modal-actions .modal-btn{min-width:calc(50% - 5px)}' +
      '@media (min-width:480px){.sh-box .modal-actions .modal-btn{min-width:0}}' +
      '.sh-sub{font-size:12.5px;color:#6b7280;margin:-4px 0 10px}' +
      '.sh-modes{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px}' +
      '.sh-mode{background:#fff;color:#334155;border:1px solid #cbd5e1;border-radius:12px;padding:9px 8px;font:inherit;font-size:13px;cursor:pointer;text-align:start}' +
      '.sh-mode.on{background:var(--primary-wash,#e8f0fe);color:var(--primary-dark,#0d47a1);border-color:var(--primary);font-weight:600}' +
      '.sh-mode:disabled{opacity:.45}' +
      '.sh-cards{display:flex;flex-direction:column;gap:8px;align-items:center}' +
      '.sh-cards img{width:100%;max-width:320px;border-radius:12px;box-shadow:0 2px 8px #0002}' +
      '.sh-wait{text-align:center;color:#6b7280;padding:24px}' +
      '.sh-note{font-size:12px;color:#6b7280;margin:8px 0}' +
      '.sh-text{white-space:pre-wrap;word-break:break-word;font:inherit;font-size:12.5px;line-height:1.6;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px;max-height:240px;overflow:auto;margin:8px 0 0;direction:rtl;text-align:right}' +
      'html.qmc-dark .sh-cards img{filter:invert(1) hue-rotate(180deg)}';
    document.head.appendChild(st);
  }

  window.openActivityShare = openActivityShare;
  // للفحص
  window.QmcShareCard = { richText: richText, groupDays: groupDays, stats: stats, buildCards: buildCards };
})();
