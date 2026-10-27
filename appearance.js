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
 * الليليّ: قلبُ الإضاءة بمرشّح CSS على الصفحة كلّها مع إبقاء الصبغة
 * (invert + hue-rotate) — كـAppColors._flip في أندرويد — والصور تُعاد كما هي.
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
    // الليليّ: الصفحة كلّها، والصور والفيديو تُقلب ثانيةً فتعود كما هي
    "html.qmc-dark{filter:invert(1) hue-rotate(180deg);background:#fff}" +
    "html.qmc-dark img,html.qmc-dark video,html.qmc-dark picture,html.qmc-dark .qmc-noinvert" +
    "{filter:invert(1) hue-rotate(180deg)}" +
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

  // ── التطبيق على الصفحة ──
  function apply() {
    injectCss();
    var root = document.documentElement;
    var p = find(PRESETS, state.theme) || PRESETS[0];
    root.style.setProperty('--primary', p.p);
    root.style.setProperty('--primary-dark', p.d);
    root.style.setProperty('--primary-wash', p.w);
    root.style.setProperty('--primary-line', p.l);
    root.style.setProperty('--bs-primary', p.p);
    root.style.setProperty('--bs-link-color', p.p);

    root.classList.toggle('qmc-dark', isDark());

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
    if (meta) meta.setAttribute('content', isDark() ? '#202124' : p.p);
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

  window.QmcAppearance = { apply: apply, render: render, fromServer: fromServer, set: set };
})();
