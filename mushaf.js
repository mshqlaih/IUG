// ============================================================================
// mushaf.js — 📖 تحديد آيات النشاط من المصحف (نظير QuranLoaderScreen في Flutter)
// ----------------------------------------------------------------------------
// • النصّ من `getQuran?pageNo=` (QMC_AYAT — مصحف المراكز V1، كتطبيق أندرويد)،
//   صفحةً صفحة عند فتحها، ويُحفظ في قاعدة IndexedDB مستقلّة (QmcMushaf) فيعمل
//   ما فُتح مرّةً دون اتصال. و«تنزيل المصحف كاملًا» يحفظ الـ604 كلّها.
//   ⚠️ قاعدةٌ مستقلّة لا مخزنٌ في QuranProjectDB: إضافة مخزنٍ هناك ترفع رقم
//      إصدارها، وsw.js وlogin.html يفتحانها بلا رقم.
// • النسخة: `getAyat?limit=1` ⇒ version_no (كـAyatService في Flutter). تغيّرها
//   يمسح النصّ المحفوظ فيُعاد جلبه — تصحيحٌ في QMC_AYAT يصل الآيفون أيضًا.
// • الاختيار كأندرويد: ضغطةٌ للبداية وثانيةٌ للنهاية، ويُحفظ الترتيب كما ضُغط
//   (التسميع العكسي)، ثم يُملأ «الآية من/إلى» وتُغلق النافذة.
// • العرض 15 سطرًا كمصحف المراكز (افتراضيًّا) أو نصٌّ متّصل بزرّ؛ والتكبير
//   متّصلٌ دائمًا — كما في أندرويد. انظر «صفحة الأسطر» أدناه.
// ⚠️ بلا ?? ولا ?. — متصفّحات أندرويد القديمة ترفض الملف كلّه (كما في api.js).
// ============================================================================
(function () {
  var DB_NAME = 'QmcMushaf';
  var STORE = 'pages';
  var PAGES = 604;
  var LS_VER = 'mushaf_text_version';
  var LS_FONT = 'mushaf_font_px';
  var LS_NIGHT = 'mushaf_night';
  var LS_LAST = 'mushaf_last_page';
  var LS_LINES = 'mushaf_lines_mode';
  var BASE_FONT = 24;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

  // ── التخزين ────────────────────────────────────────────────────────────
  var _dbp = null;
  function openDb() {
    if (_dbp) return _dbp;
    _dbp = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { _dbp = null; reject(req.error); };
    });
    return _dbp;
  }
  function idb(mode, fn) {
    return openDb().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction(STORE, mode);
        var r = fn(tx.objectStore(STORE));
        tx.oncomplete = function () { resolve(r ? r.result : undefined); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function readPage(p) { return idb('readonly', function (s) { return s.get(p); }).catch(function () { return null; }); }
  function writePage(p, items) { return idb('readwrite', function (s) { s.put(items, p); }).catch(function () {}); }
  function storedKeys() { return idb('readonly', function (s) { return s.getAllKeys(); }).catch(function () { return []; }); }
  function clearPages() { return idb('readwrite', function (s) { s.clear(); }).catch(function () {}); }

  // ── الشبكة ────────────────────────────────────────────────────────────
  function fetchPage(p) {
    return QMC.apiFetch('getQuran?pageNo=' + p, { timeoutMs: 20000 })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (body) {
        var rows = (body && body.items) || [];
        if (!rows.length) throw new Error('صفحة فارغة');
        var items = rows.map(function (r) {
          return {
            t: Number(r.tagno),
            a: Number(r.aya_no),
            x: r.aya_othmany || r.aya_diacritics || r.aya || ''
          };
        }).sort(function (a, b) { return a.t - b.t; });
        return writePage(p, items).then(function () { return items; });
      });
  }

  function getPage(p) {
    return readPage(p).then(function (items) {
      if (items && items.length) return items;
      return fetchPage(p);
    });
  }

  // مرّةً في الجلسة: تغيّر نسخة الآيات على السيرفر يمسح النصّ المحفوظ
  var _verChecked = false;
  function checkVersion() {
    if (_verChecked || !navigator.onLine) return Promise.resolve();
    _verChecked = true;
    return QMC.apiFetch('getAyat?limit=1', { timeoutMs: 15000 })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (body) {
        var it = body && body.items && body.items[0];
        var v = it && it.version_no != null ? String(it.version_no) : null;
        if (!v) return;
        var local = lsGet(LS_VER);
        if (local === v) return;
        lsSet(LS_VER, v);
        // أوّل مرّة (لا نسخة محليّة) يُمسح كذلك: ما حُفظ قبلها مجهول النسخة
        return clearPages().then(function () { _cache = {}; _models = {}; });
      })
      .catch(function () { _verChecked = false; });
  }

  // ── بيانات مساعدة من quran_data.js ───────────────────────────────────
  function meta(tag) {
    if (typeof QURAN_DATA === 'undefined') return null;
    var d = QURAN_DATA[tag];
    if (d && d.id === tag) return d;
    for (var i = 0; i < QURAN_DATA.length; i++) if (QURAN_DATA[i].id === tag) return QURAN_DATA[i];
    return null;
  }
  function suraName(s) {
    if (typeof buildSurahIndex === 'function') buildSurahIndex();
    var m = window.SURAH_BY_NUM && window.SURAH_BY_NUM[s];
    return m ? m.name : ('سورة ' + s);
  }
  function ayaLabel(tag) {
    var l = window.AYAH_REVERSE && window.AYAH_REVERSE[tag];
    if (l) return l;
    var d = meta(tag);
    return d ? d.l : String(tag);
  }
  // «الليل ١٢» لسطر الحالة — الاسم الكامل (بالصفحة والجزء) يلتفّ على سطرين
  function shortLabel(tag) {
    var d = meta(tag);
    return d ? suraName(d.s) + ' ' + toArabicDigits(d.a) : ayaLabel(tag);
  }
  function toArabicDigits(n) {
    return String(n).replace(/[0-9]/g, function (c) { return '٠١٢٣٤٥٦٧٨٩'.charAt(+c); });
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // نسخة stripLeadingBasmala (lib/utils/quran_text.dart): يتجاهل التشكيل
  // والتطويل ويوحّد الألف، ويأخذ حركة آخر حرف معه
  function skippable(ch) {
    if (ch === ' ' || ch === 'ـ') return true;
    var c = ch.charCodeAt(0);
    return (c >= 0x0610 && c <= 0x061A) || (c >= 0x064B && c <= 0x065F) ||
           c === 0x0670 || (c >= 0x06D6 && c <= 0x06ED);
  }
  function normLetter(ch) {
    if ('أإآاٱ'.indexOf(ch) !== -1) return 'ا';
    if ('ىی'.indexOf(ch) !== -1) return 'ي';
    return ch;
  }
  function stripBasmala(text) {
    var target = 'بسماللهالرحمنالرحيم', ti = 0, cut = 0;
    for (var i = 0; i < text.length && ti < target.length; i++) {
      var ch = text.charAt(i);
      if (skippable(ch)) continue;
      if (normLetter(ch) === target.charAt(ti)) { ti++; cut = i + 1; }
      else return text;
    }
    if (ti < target.length) return text;
    while (cut < text.length && skippable(text.charAt(cut))) cut++;
    return text.substring(cut);
  }

  // ── 📖 صفحة الأسطر (15 سطرًا، أو 8 في الصفحتين الأوليين) ────────────────
  // نقلٌ من lib/utils/mushaf_lines.dart و_computeLinesPage/_buildLinesPage في
  // quran_loader_screen.dart — لحفص وحده. أسطر كل آية (ls/le) من quran_data.js
  // (مولَّدٌ من getAyat، ونسخته QURAN_DATA_VERSION)، والكلمة التي ينكسر عندها
  // السطر من mushaf/hafs_lines.json (نسخة assets/mushaf). أيّ تغييرٍ في أحدهما
  // هناك يُنقل هنا. صفحةٌ لا تتّسق بياناتها ⇒ العرض المتّصل تلقائيًّا.
  var REF = 20;                         // _LinesPage.ref
  var MARK_ONLY = /^[ۖ-ۭ]+$/;  // علامة وقفٍ مفردة (و۞ ۩)

  function lineTokens(text) {
    var out = [];
    text.split(/\s+/).forEach(function (t) {
      if (!t) return;
      if (MARK_ONLY.test(t)) {
        if (t === '۞' || !out.length) out.push(t);
        else out[out.length - 1] = out[out.length - 1] + ' ' + t;
      } else if (out.length && out[out.length - 1] === '۞') {
        out[out.length - 1] = out[out.length - 1] + ' ' + t;
      } else {
        out.push(t);
      }
    });
    return out;
  }

  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }

  // ayat: [{ls, le, widths, breaks}] ⇒ سطر كل كلمة، أو null إن تناقضت البيانات
  function assignLines(ayat, space) {
    var w = [], owner = [], fixed = [];
    ayat.forEach(function (x, a) {
      var n = x.widths.length, br = x.breaks;
      var useBr = br && br.length === x.le - x.ls + 1 && sum(br) === n;
      var line = x.ls, left = useBr ? br[0] : 0;
      for (var t = 0; t < n; t++) {
        w.push(x.widths[t] + space);
        owner.push(a);
        if (x.ls === x.le) fixed.push(x.ls);
        else if (useBr) {
          while (left === 0) { line++; left = br[line - x.ls]; }
          fixed.push(line);
          left--;
        } else fixed.push(null);
      }
    });
    var n = w.length;
    if (!n) return [];
    var set = {};
    ayat.forEach(function (x) { for (var l = x.ls; l <= x.le; l++) set[l] = true; });
    var lines = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
    var pre = [0];
    for (var i = 0; i < n; i++) pre.push(pre[i] + w[i]);
    var target = pre[n] / lines.length;
    var INF = Infinity, dp = [], back = [];
    for (var j = 0; j < lines.length; j++) {
      dp.push(new Array(n + 1).fill(INF));
      back.push(new Array(n + 1).fill(-1));
    }
    for (j = 0; j < lines.length; j++) {
      var l = lines[j];
      for (i = 0; i < n; i++) {
        var base = j === 0 ? (i === 0 ? 0 : INF) : dp[j - 1][i];
        if (base === INF) continue;
        for (var k = i + 1; k <= n; k++) {
          var t = k - 1, x = ayat[owner[t]];
          var first = t === 0 || owner[t - 1] !== owner[t];
          var last = t === n - 1 || owner[t + 1] !== owner[t];
          if (l < x.ls || l > x.le || (first && x.ls !== l) || (last && x.le !== l) ||
              (fixed[t] !== null && fixed[t] !== l)) break;
          var d = pre[k] - pre[i] - target, c = base + d * d;
          if (c < dp[j][k]) { dp[j][k] = c; back[j][k] = i; }
        }
      }
    }
    if (dp[lines.length - 1][n] === INF) return null;
    var out = new Array(n), kk = n;
    for (j = lines.length - 1; j >= 0; j--) {
      var ii = back[j][kk];
      for (t = ii; t < kk; t++) out[t] = lines[j];
      kk = ii;
    }
    return out;
  }

  // الأسطر الخالية ⇒ {سطر: [النوع 'h'|'b'|'e', السورة]} (blankLines، حفص)
  function blankLines(lineCount, textLines, firstLineOfSura, lastSura, nextStartsSura) {
    var out = {}, suraAt = {};
    Object.keys(firstLineOfSura).forEach(function (s) { suraAt[firstLineOfSura[s]] = Number(s); });
    function noBasmala(s) { return s === 1 || s === 9; }
    var l = 1;
    while (l <= lineCount) {
      if (textLines[l]) { l++; continue; }
      var end = l;
      while (end + 1 <= lineCount && !textLines[end + 1]) end++;
      var next = suraAt[end + 1];
      if (next != null) {
        if (noBasmala(next)) out[end] = ['h', next];
        else {
          out[end] = ['b', next];
          if (end - 1 >= l) out[end - 1] = ['h', next];
        }
      } else if (end === lineCount && nextStartsSura && lastSura < 114) {
        var s = lastSura + 1;
        out[l] = ['h', s];
        if (l + 1 <= end && !noBasmala(s)) out[l + 1] = ['b', s];
      }
      for (var x = l; x <= end; x++) if (!out[x]) out[x] = ['e', 0];
      l = end + 1;
    }
    return out;
  }

  // الخطّ وملفّ الكسر مرّةً واحدة؛ فشلُ الملف ⇒ الكسر كلّه بالعرض
  var _breaks = null, _assets = null;
  function lineAssets() {
    if (_assets) return _assets;
    var font = (document.fonts && document.fonts.load)
      ? document.fonts.load(REF + 'px "QmcQuran"').catch(function () {})
      : Promise.resolve();
    var br = fetch('mushaf/hafs_lines.json')
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (j) { _breaks = j || {}; });
    _assets = Promise.all([font, br]);
    return _assets;
  }

  var _ctx = null;
  function measure(s) {
    if (!_ctx) {
      _ctx = document.createElement('canvas').getContext('2d');
      _ctx.font = REF + 'px "QmcQuran"';
    }
    return _ctx.measureText(s).width;
  }

  function ayaText(it, s) {
    // بسملة الفاتحة آيتها الأولى فلا تُحذف
    return (it.a === 1 && s !== 1 ? stripBasmala(it.x) : it.x).trim();
  }
  function markOf(a) { return '﴿' + toArabicDigits(a) + '﴾'; }

  // نموذج الصفحة: {lineCount, segs{سطر:[{t, words, end}]}, refWidth{سطر}, blank, opening}
  function computeLinesPage(page, items) {
    var lineCount = page <= 2 ? 8 : 15;
    _ctx = null;  // الخطّ قد حُمّل بعد أوّل قياس
    var space = Math.max(measure('ب ب') - 2 * measure('ب'), 1);
    var rows = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i], m = meta(it.t);
      if (!m || m.ls < 1 || m.le < m.ls || m.le > lineCount) return null;
      var tok = lineTokens(ayaText(it, m.s));
      if (!tok.length) return null;
      var ws = tok.map(measure);
      rows.push({ it: it, s: m.s, ls: m.ls, le: m.le, tok: tok, ws: ws });
    }
    if (!rows.length) return null;
    var las = rows.map(function (r) {
      var widths = r.ws.slice();
      // علامة نهاية الآية مع آخر كلماتها — حيث تنتهي
      widths[widths.length - 1] += space + measure(markOf(r.it.a));
      return { ls: r.ls, le: r.le, widths: widths, breaks: _breaks ? _breaks[r.it.t] : null };
    });
    var at = assignLines(las, space);
    if (!at) return null;

    var segs = {}, refWidth = {}, f = 0;
    rows.forEach(function (r, a) {
      for (var t = 0; t < r.tok.length; t++, f++) {
        var l = at[f];
        var row = segs[l] || (segs[l] = []);
        if (!row.length || row[row.length - 1].t !== r.it.t) row.push({ t: r.it.t, a: r.it.a, words: [], end: false });
        var seg = row[row.length - 1];
        seg.words.push(r.tok[t]);
        if (t === r.tok.length - 1) seg.end = true;
        refWidth[l] = (refWidth[l] != null ? refWidth[l] : -space) + las[a].widths[t] + space;
      }
    });
    var textLines = {}, firstLine = {};
    Object.keys(segs).forEach(function (l) { textLines[l] = true; });
    rows.forEach(function (r) { if (r.it.a === 1) firstLine[r.s] = r.ls; });
    var nx = meta(rows[rows.length - 1].it.t + 1);
    var blank = blankLines(lineCount, textLines, firstLine, rows[rows.length - 1].s, !!(nx && nx.a === 1));
    return { lineCount: lineCount, segs: segs, refWidth: refWidth, blank: blank, opening: page <= 2 };
  }

  // الأسطر بنسخة الآيات التي وُلّد منها quran_data.js؛ نسخةٌ أحدث على السيرفر
  // ⇒ ls/le قد تكون قديمة ⇒ المتّصل حتى يُعاد توليد الملف
  function linesDataFresh() {
    if (typeof QURAN_DATA_VERSION === 'undefined') return false;
    var v = lsGet(LS_VER);
    return !v || v === String(QURAN_DATA_VERSION);
  }

  function renderLinesPage(p) {
    var body = S.el.querySelector('#musBody');
    var padH = 10, padV = 6;
    var W = body.clientWidth - 2 * padH;
    var h = (body.clientHeight - 2 * padV) / 15;
    var widths = Object.keys(p.refWidth).map(function (k) { return p.refWidth[k]; })
      .sort(function (a, b) { return a - b; });
    var typical = p.opening ? widths[widths.length - 1] / 0.8
                            : widths[Math.round((widths.length - 1) * 0.85)];
    var font = Math.min(REF * W / typical, h / 1.6);

    var html = '<div class="mus-lines" style="padding:' + padV + 'px ' + padH + 'px">';
    for (var l = 1; l <= p.lineCount; l++) {
      html += '<div class="mus-line" style="height:' + h + 'px;width:' + W + 'px">';
      var segs = p.segs[l];
      if (segs) {
        var gaps = -1;
        segs.forEach(function (s) { gaps += s.words.length + (s.end ? 1 : 0); });
        var extra = W - p.refWidth[l] * font / REF;
        var spacing = !p.opening && extra > 0 && gaps > 0 && extra / gaps < font * 1.5 ? extra / gaps : 0;
        html += '<span class="mus-ltext" style="font-size:' + font + 'px;word-spacing:' + spacing + 'px">' +
          segs.map(function (s) {
            return '<span class="mus-aya" data-t="' + s.t + '">' + esc(s.words.join(' ')) +
              (s.end ? ' <span class="mus-mark">' + markOf(s.a) + '</span>' : '') + '</span>';
          }).join(' ') + '</span>';
      } else {
        var b = p.blank[l];
        if (b && b[0] === 'h') {
          html += '<div class="mus-lhead" style="height:' + (h * 0.86) + 'px;font-size:' + (font * 0.95) + 'px">' +
                  '﴿ سورة ' + esc(suraName(b[1])) + ' ﴾</div>';
        } else if (b && b[0] === 'b') {
          html += '<span class="mus-ltext mus-lbasmala" style="font-size:' + (font * 1.05) + 'px">' +
                  'بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ</span>';
        }
      }
      html += '</div>';
    }
    body.innerHTML = html + '</div>';
    // FittedBox(scaleDown): سطرٌ زاد على العرض يُصغَّر خطُّه وحده
    var texts = body.querySelectorAll('.mus-ltext');
    for (var i = 0; i < texts.length; i++) {
      var ow = texts[i].offsetWidth;
      if (ow > W) texts[i].style.fontSize = (parseFloat(texts[i].style.fontSize) * W / ow * 0.99) + 'px';
    }
  }

  // ── الواجهة ───────────────────────────────────────────────────────────
  var S = {
    el: null, page: 1, items: [], start: null, end: null, suggest: null,
    night: lsGet(LS_NIGHT) === '1',
    font: Math.min(40, Math.max(16, Number(lsGet(LS_FONT)) || BASE_FONT)),
    // 📖 15 سطرًا افتراضيًّا (كأندرويد)؛ والتكبير يعود إلى المتّصل
    lines: lsGet(LS_LINES) !== '0',
    token: 0
  };
  var _cache = {}, _models = {};
  function zoomed() { return S.font !== BASE_FONT; }

  function injectStyle() {
    if (document.getElementById('mushafStyle')) return;
    var css =
      '@font-face{font-family:"QmcQuran";src:url("mushaf/QuranFont.ttf") format("truetype");font-display:swap}' +
      '#mushafOverlay{position:fixed;inset:0;top:0;left:0;right:0;bottom:0;z-index:3000;display:flex;flex-direction:column;' +
      'background:#FBF7EC;color:#1A1A1A;direction:rtl;font-family:inherit}' +
      '#mushafOverlay.night{background:#14110D;color:#EDE3C8}' +
      '.mus-bar{display:flex;align-items:center;gap:6px;padding:8px 10px;padding-top:max(8px,env(safe-area-inset-top));' +
      'background:#F1E8D2;border-bottom:1px solid rgba(0,0,0,.08);flex:0 0 auto}' +
      '#mushafOverlay.night .mus-bar{background:#1E1A14;border-color:rgba(255,255,255,.08)}' +
      '.mus-title{flex:1;min-width:0;font-size:14px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.mus-title b{color:#1B5E20}#mushafOverlay.night .mus-title b{color:#9CCC65}' +
      '.mus-btn{border:0;background:transparent;color:inherit;font-size:18px;min-width:38px;height:38px;border-radius:10px;cursor:pointer}' +
      '.mus-btn:active{background:rgba(0,0,0,.08)}.mus-btn:disabled{opacity:.35}' +
      '.mus-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:14px 18px 24px;touch-action:pan-y}' +
      '.mus-head{margin:10px auto 6px;max-width:420px;text-align:center;border:2px solid #B89243;border-radius:12px;' +
      'padding:4px 10px;font-size:18px;font-weight:bold;color:#1B5E20}' +
      '#mushafOverlay.night .mus-head{color:#9CCC65}' +
      '.mus-basmala{text-align:center;font-family:"QmcQuran",serif;margin:4px 0 8px}' +
      '.mus-text{font-family:"QmcQuran","Amiri",serif;line-height:2.1;text-align:justify;margin:0}' +
      '.mus-aya{cursor:pointer;border-radius:6px;-webkit-tap-highlight-color:transparent}' +
      '.mus-mark{color:#B89243;font-weight:bold;white-space:nowrap}' +
      '.mus-aya.sug{background:rgba(255,193,7,.45)}' +
      '.mus-aya.sel{background:rgba(27,94,32,.28);font-weight:bold}' +
      '#mushafOverlay.night .mus-aya.sel{background:rgba(107,142,90,.45)}' +
      '.mus-body.lines{overflow:hidden;padding:0}' +
      '.mus-lines{height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;align-items:center}' +
      '.mus-line{display:flex;align-items:center;justify-content:center;flex:0 0 auto}' +
      '.mus-ltext{display:inline-block;white-space:nowrap;line-height:1.25;font-family:"QmcQuran","Amiri",serif}' +
      '.mus-lbasmala{font-weight:bold}' +
      // العريض يُطيل السطر بعد قياسه فيخرج عن الحافّة — التلوين يكفي هنا
      '.mus-lines .mus-aya.sel{font-weight:normal}' +
      '.mus-lhead{width:100%;display:flex;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden;' +
      'border:1.4px solid #B89243;border-radius:8px;font-family:"QmcQuran","Amiri",serif;font-weight:bold;color:#1B5E20;' +
      'background:linear-gradient(90deg,rgba(27,94,32,.10),rgba(184,146,67,.12),rgba(27,94,32,.10))}' +
      '#mushafOverlay.night .mus-lhead{color:#9CCC65}' +
      '.mus-btn.on{color:#1B5E20;background:rgba(27,94,32,.12)}#mushafOverlay.night .mus-btn.on{color:#9CCC65}' +
      '.mus-msg{text-align:center;padding:40px 16px;line-height:1.9;font-size:15px}' +
      '.mus-foot{flex:0 0 auto;border-top:1px solid rgba(0,0,0,.08);background:#F1E8D2;' +
      'padding:8px 10px;padding-bottom:max(8px,env(safe-area-inset-bottom))}' +
      '#mushafOverlay.night .mus-foot{background:#1E1A14;border-color:rgba(255,255,255,.08)}' +
      '.mus-status{font-size:13.5px;text-align:center;min-height:20px;margin-bottom:6px;line-height:1.5}' +
      '.mus-status a{color:#1a73e8;cursor:pointer;margin-right:8px}' +
      '.mus-nav{display:flex;align-items:center;gap:6px}' +
      '.mus-nav input{width:64px;text-align:center;font-size:15px;padding:6px;border:1px solid #ccc;border-radius:8px;background:#fff;color:#222}' +
      '.mus-nav select{flex:1;min-width:0;font-size:14px;padding:6px;border:1px solid #ccc;border-radius:8px;background:#fff;color:#222}' +
      '.mushaf-open-btn{float:left;border:1px solid #c8e6c9;background:#e8f5e9;color:#1b5e20;border-radius:16px;' +
      'padding:2px 10px;font-size:13px;font-weight:normal;cursor:pointer}';
    var st = document.createElement('style');
    st.id = 'mushafStyle';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function build() {
    injectStyle();
    var el = document.createElement('div');
    el.id = 'mushafOverlay';
    el.innerHTML =
      '<div class="mus-bar">' +
        '<button class="mus-btn" data-act="close" title="إغلاق"><i class="fas fa-xmark"></i></button>' +
        '<div class="mus-title" id="musTitle"></div>' +
        '<button class="mus-btn" data-act="lines" title="صفحة المصحف 15 سطرًا / نصّ متّصل"><i class="fas fa-align-justify"></i></button>' +
        '<button class="mus-btn" data-act="smaller" title="تصغير الخط"><i class="fas fa-magnifying-glass-minus"></i></button>' +
        '<button class="mus-btn" data-act="bigger" title="تكبير الخط"><i class="fas fa-magnifying-glass-plus"></i></button>' +
        '<button class="mus-btn" data-act="night" title="الوضع الليلي"><i class="fas fa-moon"></i></button>' +
        '<button class="mus-btn" data-act="download" title="تنزيل المصحف للعمل دون اتصال"><i class="fas fa-download"></i></button>' +
      '</div>' +
      '<div class="mus-body" id="musBody"></div>' +
      '<div class="mus-foot">' +
        '<div class="mus-status" id="musStatus"></div>' +
        '<div class="mus-nav">' +
          '<button class="mus-btn" data-act="prev" title="الصفحة السابقة"><i class="fas fa-chevron-right"></i></button>' +
          '<input id="musPageIn" type="number" inputmode="numeric" min="1" max="604" title="رقم الصفحة">' +
          '<select id="musSura" title="انتقل إلى سورة"><option value="">— انتقل إلى سورة —</option></select>' +
          '<button class="mus-btn" data-act="next" title="الصفحة التالية"><i class="fas fa-chevron-left"></i></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);

    if (typeof buildSurahIndex === 'function') {
      var sel = el.querySelector('#musSura');
      buildSurahIndex().forEach(function (su) {
        var o = document.createElement('option');
        o.value = su.firstId;
        o.textContent = su.s + '. ' + su.name;
        sel.appendChild(o);
      });
      sel.onchange = function () {
        var d = meta(Number(sel.value));
        sel.value = '';
        if (d) loadPage(d.p, d.id);
      };
    }

    el.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-act]') : null;
      if (b) return act(b.getAttribute('data-act'));
      var a = e.target.closest ? e.target.closest('.mus-aya') : null;
      if (a) onAyaTap(Number(a.getAttribute('data-t')));
    });
    el.querySelector('#musPageIn').addEventListener('change', function () {
      var p = Math.round(Number(this.value));
      if (p >= 1 && p <= PAGES) loadPage(p); else this.value = S.page;
    });

    // السحب: الصفحة التالية يسارَ الحالية كالمصحف الورقي ⇒ السحب يمينًا يقلب للأمام
    var x0 = null, y0 = null;
    var body = el.querySelector('#musBody');
    body.addEventListener('touchstart', function (e) {
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    body.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 50) act(dx > 0 ? 'next' : 'prev');
    }, { passive: true });

    // تدوير الجوال يغيّر عرض السطر وارتفاعه
    var rt = null;
    window.addEventListener('resize', function () {
      if (S.el.style.display === 'none') return;
      clearTimeout(rt);
      rt = setTimeout(reRender, 150);
    });

    S.el = el;
  }

  function act(a) {
    if (a === 'close') return close();
    if (a === 'next' && S.page < PAGES) return loadPage(S.page + 1);
    if (a === 'prev' && S.page > 1) return loadPage(S.page - 1);
    if (a === 'night') { S.night = !S.night; lsSet(LS_NIGHT, S.night ? '1' : '0'); return applyLook(); }
    // التكبير والتصغير نصٌّ متّصل (الأسطر تملأ الصفحة بحجمٍ محسوب)
    if (a === 'bigger') { S.font = Math.min(40, S.font + 2); lsSet(LS_FONT, S.font); applyLook(); return reRender(); }
    if (a === 'smaller') { S.font = Math.max(16, S.font - 2); lsSet(LS_FONT, S.font); applyLook(); return reRender(); }
    if (a === 'lines') {
      // زرّ الأسطر يعيد الحجم الطبيعيّ — وإلا بقي التكبير يحجبها
      S.lines = zoomed() ? true : !S.lines;
      S.font = BASE_FONT;
      lsSet(LS_LINES, S.lines ? '1' : '0'); lsSet(LS_FONT, S.font);
      applyLook();
      return reRender();
    }
    if (a === 'download') return downloadAll();
    if (a === 'reset') { S.start = null; S.end = null; paintSelection(); return status(); }
  }

  function applyLook() {
    S.el.classList.toggle('night', S.night);
    S.el.querySelector('#musBody').style.fontSize = S.font + 'px';
    S.el.querySelector('[data-act="lines"]').classList.toggle('on', S.lines && !zoomed());
  }

  function wantLines() { return S.lines && !zoomed() && linesDataFresh(); }

  // الصفحة المعروضة نفسها بالوضع الجديد (أو بعد تغيّر حجم الشاشة)
  function reRender() {
    if (!S.items.length) return;
    var my = S.token;
    (wantLines() ? lineAssets() : Promise.resolve()).then(function () {
      if (my === S.token) render();
    });
  }

  function status(text) {
    var box = S.el.querySelector('#musStatus');
    if (text != null) { box.innerHTML = text; return; }
    if (S.start != null) {
      box.innerHTML = 'البداية: <b>' + esc(shortLabel(S.start)) + '</b> — اضغط آية النهاية' +
        '<a data-act="reset">إلغاء</a>';
    } else {
      box.textContent = 'اضغط آية البداية ثم آية النهاية';
    }
  }

  function loadPage(p, focusTag, hop) {
    var my = ++S.token;
    S.page = p;
    lsSet(LS_LAST, p);
    S.el.querySelector('#musPageIn').value = p;
    S.el.querySelector('[data-act="prev"]').disabled = p <= 1;
    S.el.querySelector('[data-act="next"]').disabled = p >= PAGES;
    var body = S.el.querySelector('#musBody');
    var cached = _cache[p];
    if (!cached) body.innerHTML = '<div class="mus-msg">جارٍ التحميل…</div>';

    (cached ? Promise.resolve(cached) : getPage(p)).then(function (items) {
      // الأسطر تُقاس بالخطّ نفسه ⇒ تنتظر تحميله وملفّ الكسر (مرّةً واحدة)
      return (wantLines() ? lineAssets() : Promise.resolve()).then(function () { return items; });
    }).then(function (items) {
      if (my !== S.token) return;
      _cache[p] = items;
      // صفحة الآية من quran_data.js قد تخالف صفحات الخادم في مواضع قليلة
      // (QMC_AYAT صُحّح إلى V1 بعده) ⇒ خطوةٌ واحدة إلى الجارة
      if (focusTag && !hop && items.length) {
        if (focusTag < items[0].t && p > 1) return loadPage(p - 1, focusTag, true);
        if (focusTag > items[items.length - 1].t && p < PAGES) return loadPage(p + 1, focusTag, true);
      }
      S.items = items;
      render();
      // صفحة الأسطر تملأ الشاشة بلا تمرير ⇒ لا scrollIntoView فيها (يُزيح المحجوب)
      var target = focusTag && !body.classList.contains('lines') &&
                   body.querySelector('.mus-aya[data-t="' + focusTag + '"]');
      if (target && target.scrollIntoView) {
        try { target.scrollIntoView({ block: 'center' }); } catch (_) { target.scrollIntoView(); }
      } else {
        body.scrollTop = 0;
      }
      prefetch(p + 1);
    }).catch(function () {
      if (my !== S.token) return;
      S.items = [];
      body.innerHTML = '<div class="mus-msg">تعذّر تحميل الصفحة ' + p +
        (navigator.onLine ? '.<br>أعد المحاولة بعد قليل.'
                          : ' — لا اتصال، ولم تُحفظ على الجهاز بعد.<br>' +
                            'نزِّل المصحف كاملًا (<i class="fas fa-download"></i>) وأنت متصل ليعمل دون اتصال.') +
        '</div>';
      setTitle(p);
    });
  }

  // الصفحة التالية في الخلفية: التقليب للأمام هو الغالب في التسميع
  function prefetch(p) {
    if (p > PAGES || _cache[p] || !navigator.onLine) return;
    getPage(p).then(function (items) { _cache[p] = items; }).catch(function () {});
  }

  function setTitle(p) {
    var first = S.items.length ? meta(S.items[0].t) : null;
    S.el.querySelector('#musTitle').innerHTML = first
      // رقم الصفحة في الأسفل (حقل الانتقال) — لا يُكرَّر هنا فيُقصّ العنوان
      ? '<b>' + esc(suraName(first.s)) + '</b> · ج ' + toArabicDigits(first.j)
      : 'ص ' + toArabicDigits(p);
  }

  function render() {
    setTitle(S.page);
    var body = S.el.querySelector('#musBody');
    if (wantLines() && _breaks) {
      var model = _models[S.page];
      if (model === undefined) {
        try { model = computeLinesPage(S.page, S.items); }
        catch (e) { model = null; }
        _models[S.page] = model;
      }
      if (model) {
        body.classList.add('lines');
        body.scrollTop = 0;
        renderLinesPage(model);
        paintSelection();
        return;
      }
      // بياناتٌ لا تتّسق لهذه الصفحة ⇒ المتّصل
    }
    body.classList.remove('lines');
    var html = '', open = false;
    S.items.forEach(function (it) {
      if (it.a === 1 || !open) {
        if (open) html += '</p>';
        if (it.a === 1) {
          var m = meta(it.t);
          var s = m ? m.s : 0;
          html += '<div class="mus-head">سورة ' + esc(m ? suraName(s) : '') + '</div>';
          // الفاتحة بسملتها آيتها الأولى، والتوبة بلا بسملة
          if (s !== 1 && s !== 9) html += '<div class="mus-basmala">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</div>';
        }
        html += '<p class="mus-text">';
        open = true;
      }
      var m2 = it.a === 1 ? meta(it.t) : null;
      var text = (it.a === 1 && m2 && m2.s !== 1) ? stripBasmala(it.x) : it.x;
      html += '<span class="mus-aya" data-t="' + it.t + '">' + esc(text.trim()) +
              ' <span class="mus-mark">﴿' + toArabicDigits(it.a) + '﴾</span></span> ';
    });
    if (open) html += '</p>';
    S.el.querySelector('#musBody').innerHTML = html;
    paintSelection();
  }

  function paintSelection() {
    var lo = null, hi = null;
    if (S.start != null) {
      var e = S.end != null ? S.end : S.start;
      lo = Math.min(S.start, e); hi = Math.max(S.start, e);
    }
    var spans = S.el.querySelectorAll('.mus-aya');
    for (var i = 0; i < spans.length; i++) {
      var t = Number(spans[i].getAttribute('data-t'));
      var sel = lo != null && t >= lo && t <= hi;
      spans[i].classList.toggle('sel', sel);
      spans[i].classList.toggle('sug', !sel && lo == null && t === S.suggest);
    }
  }

  function onAyaTap(tag) {
    if (S.start == null || S.end != null) {
      S.start = tag; S.end = null;
      paintSelection();
      status();
      return;
    }
    // الترتيب كما ضُغط: النهاية قبل البداية = تسميعٌ عكسيّ (كأندرويد)
    S.end = tag;
    paintSelection();
    apply(S.start, S.end);
    setTimeout(close, 180);
  }

  function setField(textId, hiddenId, tag) {
    var t = document.getElementById(textId), h = document.getElementById(hiddenId);
    if (t) t.value = ayaLabel(tag);
    if (h) h.value = tag;
  }
  function apply(from, to) {
    setField('rangeFromText', 'rangeFrom', from);
    setField('rangeToText', 'rangeTo', to);
    if (typeof showToast === 'function') showToast('تم تحديد الآيات من المصحف');
  }

  function close() {
    S.token++;
    if (S.el) S.el.style.display = 'none';
    document.documentElement.style.overflow = '';
  }

  // ── التنزيل الكامل ────────────────────────────────────────────────────
  var _downloading = false;
  function downloadAll() {
    if (_downloading) return;
    if (!navigator.onLine) { status('التنزيل يلزمه اتصال.'); return; }
    _downloading = true;
    storedKeys().then(function (keys) {
      var have = {};
      (keys || []).forEach(function (k) { have[k] = true; });
      var missing = [];
      for (var p = 1; p <= PAGES; p++) if (!have[p]) missing.push(p);
      if (!missing.length) { status('✅ المصحف محفوظ كاملًا على الجهاز (604 صفحة)'); return; }
      var total = missing.length, done = 0, failed = [];
      function step(list) {
        var i = 0;
        function worker() {
          if (i >= list.length) return Promise.resolve();
          var p = list[i++];
          return fetchPage(p).then(function () {}, function () { failed.push(p); })
            .then(function () {
              done++;
              status('تنزيل المصحف… ' + Math.min(done, total) + ' / ' + total);
              return worker();
            });
        }
        var ws = [];
        for (var w = 0; w < 6; w++) ws.push(worker());
        return Promise.all(ws);
      }
      status('تنزيل المصحف… 0 / ' + total);
      return step(missing).then(function () {
        if (!failed.length) return;
        var retry = failed.slice(); failed = []; done = total - retry.length;
        return step(retry);
      }).then(function () {
        status(failed.length
          ? '⚠️ نُزِّلت ' + (total - failed.length) + ' صفحة وتعذّرت ' + failed.length + ' — أعد المحاولة'
          : '✅ نُزِّل المصحف كاملًا — يعمل الآن دون اتصال');
      });
    }).catch(function () {
      status('تعذّر التنزيل — أعد المحاولة');
    }).then(function () { _downloading = false; });
  }

  // زرّ «من المصحف» في النموذج يلزمه تنسيقه قبل أوّل فتح (والخطّ لا يُنزَّل
  // إلا حين يُستعمل)
  injectStyle();

  // ── المدخل ────────────────────────────────────────────────────────────
  // يُفتح على «الآية من» إن مُلئت (يملؤها التطبيق بالآية التالية عند اختيار
  // النوع) وتُميَّز بالكهرمانيّ، وإلا على آخر صفحةٍ فُتحت.
  window.openMushafPicker = function () {
    if (typeof QMC === 'undefined') return;
    if (!S.el) build();
    S.el.style.display = 'flex';
    document.documentElement.style.overflow = 'hidden';
    applyLook();
    S.start = null; S.end = null;
    var h = document.getElementById('rangeFrom');
    var tag = h ? Number(h.value) : 0;
    var d = tag > 0 ? meta(tag) : null;
    S.suggest = d ? tag : null;
    status();
    // فحص النسخة لا يؤخّر الفتح أكثر من 3 ثوانٍ على شبكةٍ بطيئة
    Promise.race([checkVersion(), new Promise(function (r) { setTimeout(r, 3000); })]).then(function () {
      if (d) loadPage(d.p, tag);
      else loadPage(Math.min(PAGES, Math.max(1, Number(lsGet(LS_LAST)) || 1)));
    });
  };
})();
