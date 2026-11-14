/* 🎨 المظهر (2026-10-27) — نظير lib/theme/app_appearance.dart في تطبيق أندرويد.
 *
 * الثيم (لون التطبيق) · الوضع (نهاريّ/ليليّ/حسب الجهاز) · حجم الخطّ · نوع الخطّ.
 * الرموز نفسها في الحساب على السيرفر (QMC_USER_PREFS) فيتبع المستخدمَ على أجهزته:
 *   - يُقرأ مع الصلاحيات (getUserAccess ⇒ appearance) — app.js:loadUserAccess
 *   - ويُحفظ بـ POST user/account/appearance (docs/user_prefs/ في مستودع التطبيق)
 *
 * 🔑 الجهاز ذاكرةٌ سريعة والسيرفر مرجع: يُطبَّق المحفوظ هنا فور تحميل الصفحة
 *    (هذا الملفّ في <head> قبل الرسم)، ثم يصل مظهر الحساب فيُطبَّق إن اختلف.
 *    `pending` = غيّره هنا ولم يُرفع ⇒ الجهاز يغلب ويُرفع.
 *    القيمة الفارغة = لم يختر ⇒ يبقى شكل IUG كما كان، ولا تُرسَل (السيرفر
 *    يُبقي ما عنده — NVL في prefs_save_json) فلا يمحو اختيارًا من أندرويد.
 *
 * الليليّ (2026-11-14): ألوانٌ داكنة حقيقية لا مرشّح — `html.qmc-dark` + dark.css.
 *   كان قلبًا للصفحة كلّها بـinvert(1) hue-rotate(180deg): يُبهت الذهبيّ ويقلب
 *   ألوان الحالات (الأخضر يصير بنفسجيًّا) ويُثقل الرسم على الأجهزة الضعيفة.
 *   رموز الثيم في الليليّ تُشتقّ من لونه نفسه (mix): --primary أفتح ليُقرأ على
 *   الداكن، و--primary-dark نصٌّ فاتح، و--primary-wash/-line صبغةٌ داكنة.
 *   والتعبئة ذات النصّ الأبيض (أزرار، ترويسة) من --primary-fill/-fill-2 = لونا
 *   الثيم الأصليّان في الوضعين.
 *   ⚠️ التصدير (html2pdf) يأخذ نسخةً من الصفحة بصنفها ورموزها ⇒ `lightClone`
 *   في onclone لكل تصدير، فالـPDF والصور فاتحةٌ دائمًا.
 */
(function () {
  'use strict';

  var KEY = 'qmc_appearance';

  // «الأصليّ» هنا أزرق IUG نفسه (في أندرويد الرماديّ المزرقّ — أصليُّ كلٍّ منهما)
  var PRESETS = [
    { id: 'default', label: 'الأصليّ', p: '#1a73e8', d: '#0d47a1', w: '#e8f0fe', l: '#c6dafc' },
    { id: 'courses', label: 'الدورات', p: '#0e7a6b', d: '#0a5a4f', w: '#ddeeea', l: '#b9d9d2' },
    { id: 'green',   label: 'أخضر',    p: '#2e7d32', d: '#1b5e20', w: '#e8f5e9', l: '#c8e6c9' },
    { id: 'navy',    label: 'كحليّ',   p: '#303f9f', d: '#1a237e', w: '#e8eaf6', l: '#c5cae9' },
    { id: 'brown',   label: 'بنّيّ',   p: '#6d4c41', d: '#3e2723', w: '#efebe9', l: '#d7ccc8' },
    { id: 'purple',  label: 'بنفسجيّ', p: '#5e35b1', d: '#311b92', w: '#ede7f6', l: '#d1c4e9' }
  ];
  var MODES = [
    { id: 'light',  label: 'نهاريّ',     icon: 'fa-sun' },
    { id: 'dark',   label: 'ليليّ',      icon: 'fa-moon' },
    { id: 'system', label: 'حسب الجهاز', icon: 'fa-circle-half-stroke' }
  ];
  var SCALES = [
    { id: 's',  label: 'صغير', f: 0.9 },
    { id: 'm',  label: 'عاديّ', f: 1.0 },
    { id: 'l',  label: 'كبير', f: 1.1 },
    { id: 'xl', label: 'أكبر', f: 1.2 }
  ];
  var FONTS = [
    { id: 'tajawal', label: 'تجوّل',     family: "'QmcTajawal'" },
    { id: 'amiri',   label: 'أميري',     family: "'QmcAmiri'" },
    { id: 'system',  label: 'خطّ الجهاز', family: null }
  ];

  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; }
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
  }

  var state = load();
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function isDark() {
    if (state.mode === 'dark') return true;
    if (state.mode === 'system') return !!(media && media.matches);
    return false;
  }

  // ── الأنماط الثابتة: الخطّان، والليليّ، ولوحة الإعدادات ──
  var css =
    "@font-face{font-family:'QmcTajawal';src:url('fonts/Tajawal-Regular.ttf') format('truetype');font-display:swap}" +
    "@font-face{font-family:'QmcAmiri';src:url('fonts/Amiri-Regular.ttf') format('truetype');font-display:swap}" +
    // الليليّ: الرموز والسطوح في dark.css — هنا الخلفية وحدها كي لا يومض الأبيض قبل تحميله
    "html.qmc-dark{background:#0f141b;color-scheme:dark}" +
    '.ap-row{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 14px}' +
    '.ap-label{font-weight:700;margin-top:4px}' +
    '.ap-hint{font-size:12px;color:#5f6368;margin:0 0 6px}' +
    '.ap-sw{display:flex;flex-direction:column;align-items:center;gap:4px;width:78px;padding:8px 4px;' +
    'border:1px solid #dadce0;border-radius:12px;background:#fff;cursor:pointer;font-size:13px}' +
    '.ap-sw.on{border:2px solid var(--primary);font-weight:700}' +
    '.ap-sw i{display:block;width:44px;height:26px;border-radius:6px;overflow:hidden;' +
    'border:1px solid rgba(0,0,0,.08)}' +
    '.ap-sw i b{display:block;height:9px}' +
    '.ap-chip{border:1px solid #dadce0;border-radius:20px;background:#fff;padding:6px 14px;' +
    'cursor:pointer;font-size:14px;color:#3c4043}' +
    '.ap-chip.on{background:var(--primary-wash);border-color:var(--primary);color:var(--primary-dark);font-weight:700}';

  function injectCss() {
    if (document.getElementById('qmcAppearanceCss')) return;
    var st = document.createElement('style');
    st.id = 'qmcAppearanceCss';
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  // ── مزج لونين (#rrggbb) بنسبة t من الثاني — لاشتقاق رموز الليليّ من لون الثيم ──
  function rgb(h) { h = String(h).replace('#', ''); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function mix(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return '#' + [0, 1, 2].map(function (i) {
      var v = Math.round(x[i] + (y[i] - x[i]) * t);
      return (v < 16 ? '0' : '') + v.toString(16);
    }).join('');
  }
  var DARK_SURFACE = '#18202b';   // = --surface في dark.css

  // رموز الثيم في وضعٍ ما: ليليًّا مشتقّةٌ من لونه، ونهاريًّا كما هي
  function tokensOf(p, dark) {
    return dark
      ? { '--primary': mix(p.p, '#ffffff', 0.32), '--primary-dark': mix(p.p, '#ffffff', 0.62),
          '--primary-wash': mix(p.p, DARK_SURFACE, 0.78), '--primary-line': mix(p.p, DARK_SURFACE, 0.55) }
      : { '--primary': p.p, '--primary-dark': p.d, '--primary-wash': p.w, '--primary-line': p.l };
  }

  function setTokens(root, p, dark) {
    var t = tokensOf(p, dark);
    Object.keys(t).forEach(function (k) { root.style.setProperty(k, t[k]); });
    // التعبئة ذات النصّ الأبيض: لونا الثيم الأصليّان في الوضعين
    root.style.setProperty('--primary-fill', p.p);
    root.style.setProperty('--primary-fill-2', p.d);
    root.style.setProperty('--bs-primary', t['--primary']);
    root.style.setProperty('--bs-link-color', t['--primary']);
  }

  /* =======================================================================
     🌙 محوّل الألوان (2026-11-14) — يمرّ على كل قاعدة CSS (الملفّات والأنماط
     التي تحقنها ملفّات JS) وعلى الأنماط المضمّنة في العناصر، ويحوّل كل لونٍ
     صريح بحسب دوره، **محافظًا على صبغته** (الأخضر يبقى أخضر والذهبيّ ذهبيًّا):
       · خلفية/حدّ فاتح ⇒ داكنٌ من الصبغة نفسها (الأبيض ⇒ سطحٌ أزرق رماديّ)
       · نصّ داكن ⇒ فاتح؛ والنصّ الفاتح يبقى (هو على تعبئةٍ ملوّنة أصلًا)
       · لون الثيم خلفيةً (var(--primary)…) ⇒ --primary-fill: الأزرار بنصّها الأبيض
     بهذا تعمل كل شاشةٍ قادمة بلا قاعدةٍ ليليّة خاصّة. و dark.css فوقه للهويّة
     والسطوح الرئيسية (يُستثنى من التحويل). ⚠️ يُعكس كلّه عند العودة للنهاريّ.
     ======================================================================= */
  var Remap = (function () {
    var on = false, sheets = new WeakSet(), styles = new WeakSet(), undo = [], obs = null;
    // ⚠️ ما أنتجه المحوّل لا يُحوَّل ثانيةً، وعنصرٌ نمطُه كما كتبناه لا يُعاد:
    //    متغيّرٌ لونيّ مُعتَم يُقرأ في المرور التالي «نصًّا» فيُفتَّح — حلقةٌ لا تنتهي
    var produced = new Set(), lastAttr = new WeakMap();
    var PROPS = /^(color|background-color|background-image|border-(top|right|bottom|left)-color|outline-color|fill|stroke|text-decoration-color|caret-color|column-rule-color)$/;
    var SKIP_HREF = /dark\.css|fontawesome|all\.min\.css|eruda/;

    function toHsl(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
      if (d) {
        s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h *= 60;
      }
      return [h, s, l];
    }
    function toRgb(h, s, l) {
      function f(n) { var k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }
      return [f(0), f(8), f(4)];
    }
    function fmt(c, a) { return a >= 1 ? 'rgb(' + c.join(', ') + ')' : 'rgba(' + c.join(', ') + ', ' + (+a.toFixed(3)) + ')'; }

    // kind: fg نصّ · bg خلفية · line حدّ
    function mapRgba(r, g, b, a, kind) {
      var x = toHsl(r, g, b), h = x[0], s = x[1], l = x[2];
      if (kind === 'fg') {
        if (a < 0.05 || l >= 0.62) return null;                 // الفاتح على تعبئة يبقى
        return fmt(toRgb(h, s, 0.93 - l * 0.55), a);
      }
      if (a < 0.5) {                                             // شفّاف: أسودُ الظلّ ⇒ أبيضُ خفيف
        return l < 0.3 ? fmt([255, 255, 255], Math.min(a * 0.9, 0.5)) : null;
      }
      if (l <= 0.45) return null;                                // داكنٌ أو تعبئةٌ مشبعة: يبقى
      var neutral = s < 0.08;
      var h2 = neutral ? 215 : h, s2 = neutral ? 0.2 : Math.min(s, 0.5);
      var l2 = kind === 'line' ? 0.2 + (1 - l) * 0.55 : 0.135 + (1 - l) * 0.55;
      return fmt(toRgb(h2, s2, l2), a);
    }

    var HEX = /#([0-9a-f]{3,8})\b/gi, RGB = /rgba?\(([^)]+)\)/gi, KW = /\b(white|black)\b/gi;
    function mapLiterals(v, kind) {
      var out = v.replace(RGB, function (m, inner) {
        var p = inner.split(/[\s,\/]+/).filter(Boolean).map(function (t) { return t.indexOf('%') > 0 ? parseFloat(t) / 100 : parseFloat(t); });
        if (p.length < 3 || p.some(isNaN)) return m;
        var r = mapRgba(p[0], p[1], p[2], p.length > 3 ? p[3] : 1, kind);
        return r || m;
      }).replace(HEX, function (m, hx) {
        if (hx.length === 3 || hx.length === 4) hx = hx.split('').map(function (c) { return c + c; }).join('');
        if (hx.length !== 6 && hx.length !== 8) return m;
        var c = rgb(hx), a = hx.length === 8 ? parseInt(hx.substr(6, 2), 16) / 255 : 1;
        return mapRgba(c[0], c[1], c[2], a, kind) || m;
      }).replace(KW, function (m) {
        var w = m.toLowerCase() === 'white';
        return mapRgba(w ? 255 : 0, w ? 255 : 0, w ? 255 : 0, 1, kind) || m;
      });
      return out;
    }

    // لون الثيم في الخلفيات تعبئةٌ لنصٍّ أبيض ⇒ لونا الثيم الأصليّان
    function subVars(v) {
      return v.replace(/var\(--primary-dark(\s*,[^)]*)?\)/g, 'var(--primary-fill-2)')
              .replace(/var\(--primary(\s*,[^)]*)?\)/g, 'var(--primary-fill)')
              .replace(/var\(--ink\)/g, 'var(--ink-fill)');
    }

    // متغيّرٌ قيمته لونٌ صريح (--c:#1D5F8A;--s:#EFF6FF): الفاتح سطحٌ والداكن نصّ
    var ONE_COLOR = /^\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))\s*$/i;
    function mapVarColor(v) {
      var m = ONE_COLOR.exec(v);
      if (!m) return v;
      var c = m[1], r, g, b;
      if (c[0] === '#') {
        var hx = c.slice(1);
        if (hx.length <= 4) hx = hx.split('').map(function (x) { return x + x; }).join('');
        var q = rgb(hx); r = q[0]; g = q[1]; b = q[2];
      } else {
        var p = c.replace(/rgba?\(|\)/g, '').split(/[\s,\/]+/).map(parseFloat); r = p[0]; g = p[1]; b = p[2];
      }
      return mapLiterals(c, toHsl(r, g, b)[2] > 0.6 ? 'bg' : 'fg');
    }

    function kindOf(p) {
      if (p === 'color' || p === 'fill' || p === 'caret-color' || p === 'text-decoration-color') return 'fg';
      if (/border|outline|column-rule|stroke/.test(p)) return 'line';
      return 'bg';
    }

    // ⚖️ التحويل ثابتٌ على نتيجته (المحوَّل لا يتغيّر ثانيةً) ⇒ إعادة المرور آمنة،
    //    و force لأنماط عنصرٍ غيّرها JS بعد رسمه
    function doStyle(st, force) {
      if (!st || (!force && styles.has(st))) return;
      styles.add(st);
      var ops = [], shDone = false;
      for (var i = 0; i < st.length; i++) {
        var p = st[i], v = st.getPropertyValue(p);
        if (v && produced.has(v.trim())) continue;
        if (p.indexOf('--') === 0) {
          if (v) ops.push([p, mapVarColor(v), v]);
          continue;
        }
        if (!v) {
          // longhand لاختصارٍ فيه var(): القيمة في الاختصار نفسه
          if (!shDone && p.indexOf('background') === 0) {
            shDone = true;
            var sv = st.getPropertyValue('background');
            if (sv) ops.push(['background', sv.indexOf('color-mix') !== -1 ? mapLiterals(subVars(sv), 'bg') : subVars(sv), sv]);
          }
          continue;
        }
        if (!PROPS.test(p)) continue;
        var kind = kindOf(p);
        // color-mix(in srgb, var(--chip-color) 10%, #fff): الصريح فيه يُحوَّل — الأبيض سطحٌ داكن
        if (v.indexOf('color-mix') !== -1) {
          ops.push([p, mapLiterals(kind === 'bg' ? subVars(v) : v, kind), v]);
          continue;
        }
        if (v.indexOf('var(') !== -1) {
          if (kind === 'bg') ops.push([p, subVars(v), v]);
          continue;
        }
        ops.push([p, mapLiterals(v, kind), v]);
      }
      ops.forEach(function (o) {
        if (o[1] === o[2]) return;
        var pr = st.getPropertyPriority(o[0]);
        undo.push([st, o[0], o[2], pr]);
        st.setProperty(o[0], o[1], pr);
        produced.add(String(st.getPropertyValue(o[0])).trim());
      });
    }

    function doRules(rules) {
      for (var i = 0; i < rules.length; i++) {
        var r = rules[i];
        if (r.style) doStyle(r.style);
        if (r.cssRules) doRules(r.cssRules);
      }
    }

    function doSheet(sh) {
      if (!sh || sheets.has(sh)) return;
      var n = sh.ownerNode;
      if ((sh.href && SKIP_HREF.test(sh.href)) || (n && n.hasAttribute && n.hasAttribute('data-no-remap'))) { sheets.add(sh); return; }
      var rules;
      try { rules = sh.cssRules; } catch (_) { return; }   // لم يُحمَّل بعد
      if (!rules) return;
      sheets.add(sh);
      doRules(rules);
    }

    function doInline(e, force) {
      // ⚠️ لا عنصر الجذر: عليه رموز الثيم (setTokens) — تُحسب لا تُحوَّل
      if (e === document.documentElement) return;
      if (!force && styles.has(e.style)) return;
      var before = e.getAttribute('style');
      if (force && lastAttr.get(e) === before) return;
      doStyle(e.style, force);
      var after = e.getAttribute('style');
      lastAttr.set(e, after);
      // الأصل محفوظ لنسخة التصدير (lightClone)
      if (after !== before && !e.hasAttribute('data-ls')) e.setAttribute('data-ls', before);
    }

    function doEl(el) {
      if (!el || el.nodeType !== 1) return;
      if (el.hasAttribute('style')) doInline(el);
      if (el.querySelectorAll) [].forEach.call(el.querySelectorAll('[style]'), function (e) { doInline(e); });
    }

    function sweep() {
      [].forEach.call(document.styleSheets, doSheet);
      if (document.body) doEl(document.body);
    }

    function onMut(muts) {
      muts.forEach(function (m) {
        // لونٌ وضعه JS على عنصرٍ قائم (el.style.color = …) — تقييمٌ مختار، حالة تشخيص
        if (m.type === 'attributes') {
          if (m.target.nodeType === 1 && m.target.hasAttribute('style')) doInline(m.target, true);
          return;
        }
        [].forEach.call(m.addedNodes, function (n) {
          if (n.nodeType === 3 && n.parentNode && n.parentNode.tagName === 'STYLE') return doSheet(n.parentNode.sheet);
          if (n.nodeType !== 1) return;
          if (n.tagName === 'STYLE') return doSheet(n.sheet);
          if (n.tagName === 'LINK') { n.addEventListener('load', function () { doSheet(n.sheet); }); return doSheet(n.sheet); }
          doEl(n);
        });
      });
    }

    function enable() {
      if (on) return;
      on = true;
      sweep();
      [].forEach.call(document.querySelectorAll('link[rel=stylesheet]'), function (l) {
        l.addEventListener('load', function () { if (on) doSheet(l.sheet); });
      });
      document.addEventListener('DOMContentLoaded', function () { if (on) sweep(); });
      obs = new MutationObserver(function (m) { if (on) onMut(m); });
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    }

    function disable() {
      if (!on) return;
      on = false;
      if (obs) { obs.disconnect(); obs = null; }
      for (var i = undo.length - 1; i >= 0; i--) {
        var u = undo[i];
        try { u[0].setProperty(u[1], u[2], u[3]); } catch (_) {}
      }
      undo = [];
      sheets = new WeakSet(); styles = new WeakSet(); produced = new Set(); lastAttr = new WeakMap();
      [].forEach.call(document.querySelectorAll('[data-ls]'), function (e) { e.removeAttribute('data-ls'); });
    }

    return { enable: enable, disable: disable, isOn: function () { return on; } };
  })();

  /** onclone لـhtml2canvas: نسخة التصدير فاتحةٌ دائمًا — الصنف والرموز، ونصوص
   *  <style> الأصلية (html2canvas ينسخها من قواعدها بعد التحويل)، والأنماط المضمّنة */
  function lightClone(doc) {
    try {
      var r = doc && doc.documentElement;
      if (!r) return;
      r.classList.remove('qmc-dark');
      setTokens(r, find(PRESETS, state.theme) || PRESETS[0], false);
      r.style.colorScheme = 'light';
      var src = document.querySelectorAll('style'), dst = doc.querySelectorAll('style');
      if (src.length === dst.length) {
        for (var i = 0; i < src.length; i++) dst[i].textContent = src[i].textContent;
      }
      [].forEach.call(doc.querySelectorAll('[data-ls]'), function (e) { e.setAttribute('style', e.getAttribute('data-ls')); });
    } catch (_) {}
  }

  // ── التطبيق على الصفحة ──
  function apply() {
    injectCss();
    var root = document.documentElement;
    var p = find(PRESETS, state.theme) || PRESETS[0];
    var dark = isDark();
    setTokens(root, p, dark);

    root.classList.toggle('qmc-dark', dark);
    root.style.colorScheme = dark ? 'dark' : '';
    if (dark) Remap.enable(); else Remap.disable();

    var sc = find(SCALES, state.font_scale);
    root.style.zoom = sc && sc.f !== 1 ? String(sc.f) : '';

    var fontCss = document.getElementById('qmcAppearanceFont');
    if (!fontCss) {
      fontCss = document.createElement('style');
      fontCss.id = 'qmcAppearanceFont';
      (document.head || root).appendChild(fontCss);
    }
    var f = find(FONTS, state.font);
    fontCss.textContent = f && f.family
      ? 'body,input,button,select,textarea{font-family:' + f.family + ",'Segoe UI',Tahoma,sans-serif}"
      : (f && f.id === 'system'
          ? 'body,input,button,select,textarea{font-family:system-ui,-apple-system,sans-serif}'
          : '');

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0f141b' : p.p);
  }

  if (media) {
    var onMedia = function () { if (state.mode === 'system') apply(); };
    if (media.addEventListener) media.addEventListener('change', onMedia);
    else if (media.addListener) media.addListener(onMedia);
  }

  // ── الحساب على السيرفر ──
  function currentUser() {
    try {
      var u = (window.QMC && QMC.getUserName && QMC.getUserName()) ||
              localStorage.getItem('user_name') || localStorage.getItem('teacherID') || '';
      return String(u).trim();
    } catch (_) { return ''; }
  }

  function push(user) {
    if (!window.QMC || !QMC.apiFetch) return;
    var body = {};
    ['theme', 'mode', 'font_scale', 'font'].forEach(function (k) {
      if (state[k]) body[k] = state[k];
    });
    if (!Object.keys(body).length) return;
    QMC.apiFetch('user/account/appearance', { method: 'POST', body: body, timeoutMs: 15000 })
      .then(function (r) {
        // يُمحى العلَم لصاحبه وحده — ودخل غيرُه أثناء الإرسال ⇒ يبقى لصاحبه
        if (r && r.ok && state.pending === user) {
          delete state.pending;
          save(state);
        }
      })
      .catch(function () { /* بلا شبكة ⇒ يبقى pending ويُعاد مع الصلاحيات */ });
  }

  /** اختيارٌ من لوحة المظهر: يُطبَّق فورًا ويُحفظ هنا ثم يُرفع. */
  function set(k, v) {
    state[k] = v;
    var user = currentUser();
    if (user) { state.pending = user; state.owner = user; }
    save(state);
    apply();
    render();
    if (user) push(user);
  }

  /** مظهر الحساب كما وصل مع الصلاحيات. present = المفتاح في الردّ. */
  function fromServer(user, present, data) {
    user = String(user || '').trim();
    if (!present || !user) return;
    if (state.pending === user) { push(user); return; }
    if (data && typeof data === 'object') {
      var changed = false;
      [['theme', 'theme'], ['mode', 'mode'], ['font_scale', 'font_scale'], ['font', 'font']]
        .forEach(function (p) {
          var v = data[p[0]];
          v = v == null ? '' : String(v).trim();
          if (v && state[p[1]] !== v) { state[p[1]] = v; changed = true; }
        });
      state.owner = user;
      save(state);
      if (changed) { apply(); render(); }
      return;
    }
    // لا مظهر في حسابه: ما اختاره على هذا الجهاز يُرفع مرّةً — لا مظهرُ غيره
    var any = state.theme || state.mode || state.font_scale || state.font;
    if (any && (!state.owner || state.owner === user)) {
      state.pending = user; state.owner = user;
      save(state);
      push(user);
    }
  }

  // ── لوحة «المظهر» في الإعدادات (#appearanceCard) ──
  function chip(cls, on, attr, html) {
    return '<button type="button" class="' + cls + (on ? ' on' : '') + '" ' + attr + '>' + html + '</button>';
  }

  function render() {
    var box = document.getElementById('appearanceBody');
    if (!box) return;
    var curTheme = (find(PRESETS, state.theme) || PRESETS[0]).id;
    var curMode = (find(MODES, state.mode) || MODES[0]).id;
    var curScale = (find(SCALES, state.font_scale) || SCALES[1]).id;
    var h = '';
    h += '<div class="ap-label">لون التطبيق</div>';
    h += '<p class="ap-hint">يتغيّر لون الأزرار والعناوين. ألوان النتائج تبقى كما هي.</p><div class="ap-row">';
    PRESETS.forEach(function (p) {
      h += chip('ap-sw', p.id === curTheme, 'data-k="theme" data-v="' + p.id + '"',
        '<i><b style="background:' + p.p + '"></b><b style="background:' + p.w + ';height:17px"></b></i>' + p.label);
    });
    h += '</div><div class="ap-label">الوضع</div>';
    h += '<p class="ap-hint">الليليّ أريح للعين في الظلام. «حسب الجهاز» يتبع إعداد جوالك.</p><div class="ap-row">';
    MODES.forEach(function (m) {
      h += chip('ap-chip', m.id === curMode, 'data-k="mode" data-v="' + m.id + '"',
        '<i class="fas ' + m.icon + '"></i> ' + m.label);
    });
    h += '</div><div class="ap-label">حجم الخطّ</div><div class="ap-row">';
    SCALES.forEach(function (s) {
      h += chip('ap-chip', s.id === curScale, 'data-k="font_scale" data-v="' + s.id + '"', s.label);
    });
    h += '</div><div class="ap-label">نوع الخطّ</div><div class="ap-row">';
    FONTS.forEach(function (f) {
      h += chip('ap-chip', f.id === state.font, 'data-k="font" data-v="' + f.id + '"',
        '<span style="font-family:' + (f.family || 'system-ui') + '">' + f.label + '</span>');
    });
    h += '</div><p class="ap-hint">يُحفظ في حسابك فيتبعك على الجوال والحاسوب.</p>';
    box.innerHTML = h;
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('#appearanceBody [data-k]') : null;
    if (b) set(b.getAttribute('data-k'), b.getAttribute('data-v'));
  });
  document.addEventListener('DOMContentLoaded', function () { apply(); render(); });

  apply();

  window.QmcAppearance = { apply: apply, render: render, fromServer: fromServer, set: set,
                           lightClone: lightClone, isDark: isDark };
})();
