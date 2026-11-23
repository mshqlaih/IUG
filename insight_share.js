// ============================================================================
// 🖼️📄 بطاقة «يحتاج تدخّلك» صورةً وورقة PDF (2026-11-23، طلب المستخدم: «في IUG
//    لم أجد مشاركة ما يحتاج تدخّلي من خلال صورة أو PDF») — نظير _shareImage /
//    _sharePdf في lib/screens/insight_home_screen.dart، والورقة بشكل
//    lib/screens/insight_card_pdf.dart (المعتمد: exams_summary_pdf.dart):
//    الرأس سطورٌ في الوسط — التطبيق ذهبيًّا ⇒ المؤسسة ⇒ العنوان ⇒ المركز ⇒ آخر
//    تحديث — ثم عدد البنود، فصندوق السبب، فجدول م · الاسم · السبب.
//    وتنبيه الصندوق (inboxCode) بمتنه وجدوله (data.rows) بأعمدة الصندوق.
// ⚠️ الأنماط مضمّنةٌ كلّها لا <style>: نسخة html2canvas (lightClone) تُسقطها.
// ⚠️ بلا ?? ولا ?. — متصفحات أندرويد القديمة ترفض الملف كلّه.
// ============================================================================
(function () {
  var BLUE = '#1D5B98', BLUE_DARK = '#123D68', BLUE_WASH = '#EEF4FA',
      GOLD = '#C9A23A', GOLD_WASH = '#FBF6E8', INK = '#1F2A37', MUTED = '#5B6878', LINE = '#DBE3EC';
  var APP = 'تطبيق الصفوة لمتابعة الحلقات القرآنية';
  // kInboxRowLabels — نسخة inbox.js (تُعدَّل معها)
  var ROW_LABELS = {
    name: 'الاسم', teacher: 'المعلّم', circle: 'الحلقة',
    last_activity: 'آخر نشاط', missed_days: 'أيام بلا تحفيظ',
    last_session: 'آخر حصة', missed_sessions: 'حصص بلا تسجيل',
    no_appt: 'قرّاء بلا موعد', days_idle: 'الأيام', count: 'العدد',
    partial_days: 'أيام ناقصة'
  };
  var SORT_KEYS = ['missed_days', 'missed_sessions', 'days_idle', 'count'];
  var TEXT_KEYS = ['name', 'teacher', 'circle'];

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function s(v) { var t = v == null ? '' : String(v).trim(); return (t === '' || t === 'null') ? '' : t; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function arabic(x) { return /[؀-ۿ]/.test(String(x)); }
  // قيمةٌ لاتينيّة (رقم · تاريخ) فقرةٌ يساريّة وحدها
  function ltr(x) { return '<span dir="ltr" style="unicode-bidi:isolate">' + esc(x) + '</span>'; }
  function sevColor(sev) {
    return sev === 'crit' ? '#9F1239' : sev === 'warn' ? '#92400E' : sev === 'ok' ? '#166534' : BLUE;
  }
  function itemsAr(n) {
    var a = Math.abs(n), r = a % 100;
    if (a === 1) return 'بندٌ واحد';
    if (a === 2) return 'بندان';
    return (r >= 3 && r <= 10) ? 'بنود' : r >= 11 ? 'بندًا' : 'بند';
  }

  function header(title, org, center, at, wide) {
    var c = 'text-align:center;margin:0;';
    var h = '<div style="padding-bottom:9px;border-bottom:2px solid ' + BLUE + '">' +
      '<div style="' + c + 'font-size:' + (wide ? 11 : 12) + 'px;font-weight:700;color:' + GOLD + '">' + APP + '</div>' +
      (org ? '<div style="' + c + 'margin-top:3px;font-size:' + (wide ? 16 : 15) + 'px;font-weight:700;color:' + BLUE_DARK + '">' + esc(org) + '</div>' : '') +
      '<div style="' + c + 'margin-top:3px;font-size:' + (wide ? 23 : 20) + 'px;font-weight:800;color:' + BLUE_DARK + ';line-height:1.35">' + esc(title) + '</div>' +
      (center && center !== org ? '<div style="' + c + 'font-size:14px;font-weight:700;color:' + INK + '">' + esc(center) + '</div>' : '');
    if (at) {
      h += '<div style="' + c + 'margin-top:4px;font-size:12.5px;color:' + MUTED + '">آخر تحديث: ' +
        '<b style="color:' + INK + '">' + ltr(pad2(at.getDate()) + '/' + pad2(at.getMonth() + 1) + '/' + at.getFullYear()) + '</b> ' +
        '<b style="color:' + INK + '">' + ltr(pad2(at.getHours()) + ':' + pad2(at.getMinutes())) + '</b></div>';
    }
    return h + '</div>';
  }
  function bodyBox(lines) {
    if (!lines.length) return '';
    return '<div style="margin-top:12px;padding:10px 12px;background:' + GOLD_WASH + ';border:1px solid ' + LINE +
      ';border-radius:6px;font-size:14px;line-height:1.7;color:' + INK + '">' +
      lines.map(function (l) { return '<div>' + (lines.length > 1 ? '• ' : '') + esc(l) + '</div>'; }).join('') + '</div>';
  }
  // ⚠️ app.css: table{min-width:600px} · th{position:sticky} — كانت تمطّ الجدول
  //    خارج الورقة؛ تُلغى مضمّنةً هنا
  var TABLE = 'width:100%;min-width:0;margin-top:12px;border-collapse:collapse;';
  function th(x) {
    return '<th style="position:static;white-space:normal;padding:6px 5px;background:' + BLUE_WASH + ';color:' + BLUE_DARK + ';font-weight:700;font-size:13px;' +
      'border:1px solid ' + LINE + ';text-align:center">' + esc(x) + '</th>';
  }
  function td(inner, odd, center) {
    return '<td style="white-space:normal;word-break:break-word;padding:6px 7px;border:1px solid ' + LINE + ';vertical-align:middle;font-size:13px;line-height:1.6;color:' + INK +
      ';text-align:' + (center ? 'center' : 'right') + (odd ? ';background:' + GOLD_WASH : '') + '">' + inner + '</td>';
  }
  function nameCell(name, sub) {
    return '<b style="font-weight:700">' + esc(name || '—') + '</b>' +
      (s(sub) ? '<div style="font-size:11.5px;color:' + MUTED + '">' + esc(sub) + '</div>' : '');
  }
  function footer(title, org) {
    return '<div style="margin-top:14px;padding-top:6px;border-top:1px solid ' + LINE + ';font-size:10.5px;color:' + MUTED + ';text-align:center">' +
      esc(APP + ' — ' + title + (org ? ' · ' + org : '')) + '</div>';
  }

  /** بطاقة اللوحة: عدد البنود ثم السبب ثم جدول م · الاسم · السبب */
  function cardHtml(c, ctx, wide) {
    var items = Array.isArray(c.items) ? c.items : [];
    var count = parseInt(c.count, 10);
    if (isNaN(count)) count = items.length;
    var col = sevColor(c.sev);
    var h = header(c.title, ctx.org, ctx.center, ctx.at, wide);
    h += '<div style="text-align:center;margin-top:12px"><span style="display:inline-block;padding:5px 16px;background:' + BLUE_WASH +
      ';border:1px solid ' + LINE + ';border-radius:8px;font-size:14px;color:' + INK + '">' +
      (count > 2 ? '<b style="font-size:18px;font-weight:800;color:' + col + '">' + ltr(count) + '</b> ' : '') + itemsAr(count) + '</span></div>';
    if (s(c.why)) h += bodyBox([s(c.why)]);
    if (items.length) {
      var hasSub = items.some(function (it) { return s(it.sub); });
      h += '<table style="' + TABLE + 'table-layout:fixed" dir="rtl">' +
        '<colgroup><col style="width:7%"><col style="width:' + (hasSub ? 38 : 33) + '%"><col></colgroup>' +
        '<tr>' + th('م') + th('الاسم') + th('السبب') + '</tr>';
      items.forEach(function (it, i) {
        var odd = i % 2 === 1;
        h += '<tr>' + td(ltr(i + 1), odd, true) + td(nameCell(it.name, it.sub), odd) +
          td(s(it.reason) ? '<span style="color:' + col + '">' + esc(it.reason) + '</span>' : '', odd) + '</tr>';
      });
      h += '</table>';
      if (count > items.length) {
        h += '<div style="margin-top:6px;font-size:12px;color:' + MUTED + '">وغيرهم ' + ltr(count - items.length) + ' — في التطبيق</div>';
      }
    }
    return h + footer(c.title, ctx.org);
  }

  /** صفوف التنبيه من الأكثر تقصيرًا (inboxSortedRows) */
  function sortedRows(rows) {
    var k = SORT_KEYS.filter(function (x) { return rows.some(function (r) { return r[x] != null && r[x] !== ''; }); })[0];
    if (!k) return rows.slice();
    return rows.slice().sort(function (a, b) { return (Number(b[k]) || 0) - (Number(a[k]) || 0); });
  }

  /** تنبيه الصندوق: متنه ثم جدوله بأعمدته */
  function inboxHtml(m, ctx, wide) {
    var d = m.data || {};
    var h = header(m.title, ctx.org, ctx.center, ctx.at, wide);
    var body = s(m.body);
    var lines = body ? body.split(/\s*؛\s*|\n+/).map(function (x) { return x.trim(); }).filter(function (x) { return x; }) : [];
    h += bodyBox(lines);
    var rows = Array.isArray(d.rows) ? sortedRows(d.rows) : [];
    if (rows.length) {
      // أعمدة كل الصفوف لا الأوّل وحده: بعد الترتيب قد يكون بلا «أيام ناقصة»
      var keys = [];
      rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); });
      keys = keys.filter(function (k) {
        return rows.some(function (r) { return r[k] != null && r[k] !== ''; });
      });
      var sortK = SORT_KEYS.filter(function (x) { return keys.indexOf(x) >= 0; })[0];
      h += '<table style="' + TABLE + '" dir="rtl"><tr>' + th('م') +
        keys.map(function (k) { return th(ROW_LABELS[k] || k); }).join('') + '</tr>';
      rows.forEach(function (r, i) {
        var odd = i % 2 === 1;
        h += '<tr>' + td(ltr(i + 1), odd, true) + keys.map(function (k) {
          var v = s(r[k]);
          if (!v) return td('—', odd, true);
          var text = TEXT_KEYS.indexOf(k) >= 0;
          var inner = (text || arabic(v)) ? esc(v) : ltr(v);
          if (k === sortK) inner = '<b>' + inner + '</b>';
          return td(inner, odd, !text);
        }).join('') + '</tr>';
      });
      h += '</table>';
    }
    return h + footer(m.title, ctx.org);
  }

  /* ══ 🖼️ الصورة مرسومةً على canvas — نظير insight_card_image.dart ══
     لا لقطةٌ لعناصر الصفحة: عرضٌ ثابت 720 لا يتبع الجوال ولا أنماط التطبيق، وكل
     نصٍّ يلتفّ داخل عرضه فلا يُقصّ اسمٌ ولا سبب. الترويسة: المؤسسة والمركز، ثم
     العنوان بلون البطاقة وعدده في مربّعه، ثم سببها؛ ثم البنود مرقّمةً — الاسم عريضًا
     وتحته ما يعرّفه ثم سببه بلون البطاقة؛ وآخرها «آخر تحديث» واسم التطبيق. */
  var FONT = "'QmcDigits','QmcTajawal',Tajawal,'Segoe UI',Tahoma,sans-serif";
  var W = 720, PAD = 28;
  function colors(sev) {
    return sev === 'crit' ? ['#9F1239', '#FFF1F2'] : sev === 'warn' ? ['#92400E', '#FFFBEB']
      : sev === 'set' ? ['#2F6F73', '#E6F0F0'] : sev === 'ok' ? ['#166534', '#F0FDF4'] : ['#1D5F8A', '#EFF6FF'];
  }
  function font(size, bold) { return (bold ? '700 ' : '400 ') + size + 'px ' + FONT; }
  // التفافٌ بالكلمات داخل [width]؛ الكلمة الأطول من السطر تُكسر حرفًا حرفًا
  function wrap(g, text, size, bold, width) {
    g.font = font(size, bold);
    var out = [];
    String(text).split(/\n/).forEach(function (para) {
      var line = '';
      para.split(/\s+/).filter(function (x) { return x; }).forEach(function (wd) {
        var t = line ? line + ' ' + wd : wd;
        if (g.measureText(t).width <= width) { line = t; return; }
        if (line) out.push(line);
        line = wd;
        while (g.measureText(line).width > width && line.length > 1) {
          var k = line.length - 1;
          while (k > 1 && g.measureText(line.slice(0, k)).width > width) k--;
          out.push(line.slice(0, k));
          line = line.slice(k);
        }
      });
      if (line) out.push(line);
    });
    return { lines: out, size: size, bold: bold, lh: Math.round(size * 1.45) };
  }
  function blockH(b) { return b.lines.length * b.lh; }

  /** صفوف الصورة بشكلٍ واحد: { name, sub, reason } */
  function imageRows(card, msg) {
    if (!msg) {
      return (Array.isArray(card.items) ? card.items : []).map(function (it) {
        return { name: s(it.name) || '—', sub: s(it.sub), reason: s(it.reason) };
      });
    }
    // 📬 تنبيه الصندوق: الحلقة (أو الاسم) عنوان البند، ومعلّمها تحته، وبقيّة
    //    الأعمدة «التسمية: القيمة» سطرًا واحدًا — لا جدولٌ عريض يُقصّ على الجوال
    var rows = sortedRows(msg.data.rows);
    return rows.map(function (r) {
      var lead = s(r.circle) ? 'circle' : s(r.name) ? 'name' : s(r.teacher) ? 'teacher' : null;
      var sub = lead === 'circle' ? (s(r.teacher) || s(r.name)) : lead === 'name' ? s(r.teacher) : '';
      var used = [lead, lead === 'circle' ? (s(r.teacher) ? 'teacher' : 'name') : lead === 'name' ? 'teacher' : null];
      var parts = Object.keys(r).filter(function (k) { return used.indexOf(k) < 0 && s(r[k]); })
        .map(function (k) {
          var v = s(r[k]);
          if (/^\d{4}-\d{2}-\d{2}/.test(v)) v = v.slice(8, 10) + '/' + v.slice(5, 7);
          return (ROW_LABELS[k] || k) + ': ' + v;
        });
      return { name: lead ? s(r[lead]) : '—', sub: sub, reason: parts.join(' · ') };
    });
  }

  async function drawPng(card, ctx) {
    try { if (document.fonts && document.fonts.load) await Promise.all([document.fonts.load(font(20, true)), document.fonts.load(font(20, false))]); } catch (_) {}
    var msg = ctx.msg;
    var sev = msg ? ((msg.severity === 'WARN' || msg.severity === 'URGENT') ? 'warn' : 'info') : card.sev;
    var cl = colors(sev), accent = cl[0], soft = cl[1];
    var title = msg ? msg.title : card.title;
    var rows = imageRows(card, msg);
    var count = msg ? rows.length : parseInt(card.count, 10);
    if (isNaN(count)) count = rows.length;
    var why = msg ? s(msg.body) : s(card.why);
    // تنبيهٌ بجدول ⇒ متنه سطرُ ملخّصٍ والتفصيل في البنود؛ لا يُكرَّر
    if (msg && why && why.length > 220) why = why.slice(0, 220).replace(/\s+\S*$/, '') + '…';

    var g = document.createElement('canvas').getContext('2d');
    var full = W - PAD * 2, BOX = 54, NUMW = 34;
    // ── التخطيط أوّلًا (الارتفاع يُعرف بعده) ──
    var ops = [], y = PAD;
    function text(b, right, color, top) { ops.push({ t: 'text', b: b, x: right, y: top, c: color }); return blockH(b); }
    if (ctx.org) y += text(wrap(g, ctx.org, 15, false, full), W - PAD, MUTED, y);
    if (ctx.center && ctx.center !== ctx.org) y += text(wrap(g, ctx.center, 14, false, full), W - PAD, MUTED, y);
    y += 8;
    var tb = wrap(g, title, 23, true, full - (count > 0 ? BOX + 14 : 0));
    var top = y, th0 = blockH(tb);
    if (count > 0) ops.push({ t: 'box', x: PAD + full - BOX, y: top, w: BOX, h: BOX, c: soft, n: String(count), nc: accent });
    text(tb, W - PAD - (count > 0 ? BOX + 14 : 0), accent, top + (count > 0 && th0 < BOX ? (BOX - th0) / 2 : 0));
    y = top + Math.max(th0, count > 0 ? BOX : 0);
    if (why) { y += 6; y += text(wrap(g, why, 16, false, full), W - PAD, MUTED, y); }
    y += 14;
    var tw = full - NUMW;
    rows.forEach(function (r, i) {
      var nb = wrap(g, r.name, 17, true, tw);
      var sb = r.sub ? wrap(g, r.sub, 14, false, tw) : null;
      var rb = r.reason ? wrap(g, r.reason, 15, false, tw) : null;
      var h = 10 + blockH(nb) + (sb ? blockH(sb) : 0) + (rb ? blockH(rb) + 2 : 0) + 10;
      if (i % 2 === 1) ops.push({ t: 'rect', x: PAD, y: y, w: full, h: h, c: '#F7F9FA' });
      ops.push({ t: 'num', x: W - PAD - NUMW / 2, y: y + 10, n: String(i + 1) });
      var yy = y + 10, right = W - PAD - NUMW;
      yy += text(nb, right, INK, yy);
      if (sb) yy += text(sb, right, MUTED, yy);
      if (rb) text(rb, right, accent, yy + 2);
      y += h;
      ops.push({ t: 'line', y: y });
    });
    if (!msg && count > rows.length && rows.length) { y += 8; y += text(wrap(g, 'وغيرهم ' + (count - rows.length) + ' — في التطبيق', 14, false, full), W - PAD, MUTED, y); }
    y += 16;
    var at = ctx.at;
    var stamp = at ? 'آخر تحديث: ⁦' + pad2(at.getDate()) + '/' + pad2(at.getMonth() + 1) + '/' + at.getFullYear() + ' ' + pad2(at.getHours()) + ':' + pad2(at.getMinutes()) + '⁩' : '';
    y += text(wrap(g, APP + (stamp ? ' · ' + stamp : ''), 12.5, false, full), W - PAD, MUTED, y);
    y += PAD;

    // ── الرسم: المقياس 3 ما لم يتجاوز حدّ iOS للوحة (~16.7 مليون بكسل) ──
    var sc = Math.min(3, Math.sqrt(16000000 / (W * y)), 16000 / y);
    var cv = document.createElement('canvas');
    cv.width = Math.round(W * sc); cv.height = Math.round(y * sc);
    var c = cv.getContext('2d');
    c.scale(sc, sc);
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, y);
    c.fillStyle = accent; c.fillRect(W - 6, 0, 6, y);   // شريط البطاقة الملوّن يمينًا
    c.textBaseline = 'top';
    ops.forEach(function (o) {
      if (o.t === 'rect') { c.fillStyle = o.c; c.fillRect(o.x, o.y, o.w, o.h); }
      else if (o.t === 'line') { c.fillStyle = '#E4E7EB'; c.fillRect(PAD, o.y - 0.5, full, 1); }
      else if (o.t === 'box') {
        c.fillStyle = o.c;
        if (c.roundRect) { c.beginPath(); c.roundRect(o.x, o.y, o.w, o.h, 12); c.fill(); } else c.fillRect(o.x, o.y, o.w, o.h);
        c.fillStyle = o.nc; c.font = font(22, true); c.textAlign = 'center'; c.direction = 'ltr';
        c.fillText(o.n, o.x + o.w / 2, o.y + (o.h - 22 * 1.2) / 2 + 2);
      } else if (o.t === 'num') {
        c.fillStyle = MUTED; c.font = font(15, false); c.textAlign = 'center'; c.direction = 'ltr';
        c.fillText(o.n, o.x, o.y + 2);
      } else {
        c.fillStyle = o.c; c.font = font(o.b.size, o.b.bold); c.textAlign = 'right'; c.direction = 'rtl';
        o.b.lines.forEach(function (ln, k) { c.fillText(ln, o.x, o.y + k * o.b.lh + (o.b.lh - o.b.size) / 2); });
      }
    });
    return await new Promise(function (res) { cv.toBlob(res, 'image/png'); });
  }

  function fileName(title, at) {
    var day = at ? at.getDate() + '-' + (at.getMonth() + 1) + '-' + at.getFullYear() : '';
    return (title + (day ? ' ' + day : '')).replace(/[\\\/:*?"<>|()+«»]/g, '').replace(/\s+/g, ' ').trim();
  }
  function deliver(blob, name, type) {
    if (typeof crDeliverFile === 'function') return crDeliverFile(blob, name, type);
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.parentNode.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  /**
   * kind: 'image' | 'pdf'. ctx: { org, center, at: Date, msg (رسالة الصندوق إن كانت) }
   * يرمي عند الفشل — والمستدعي يعرض الرسالة.
   */
  async function share(card, kind, ctx) {
    if (kind === 'pdf' && typeof ensurePdfLibrary === 'function' && !await ensurePdfLibrary()) {
      throw new Error('تعذّر تحميل مكتبة الصور — تأكّد من الاتصال');
    }
    var wide = kind === 'pdf';
    var inner = ctx.msg ? inboxHtml(ctx.msg, ctx, wide) : cardHtml(card, ctx, wide);
    var font = 'font-family:Tajawal,"Segoe UI",Tahoma,sans-serif;';
    var name = fileName(ctx.msg ? ctx.msg.title : card.title, ctx.at);
    if (kind === 'image') {
      var blob = await drawPng(card, ctx);
      if (!blob) throw new Error('تعذّر رسم الصورة');
      deliver(blob, name + '.png', 'image/png');
      return;
    }
    var box = document.createElement('div');
    box.setAttribute('dir', 'rtl');
    box.setAttribute('style', font + 'background:#fff;color:' + INK);
    box.innerHTML = inner;
    var pdf = await html2pdf().set({
      margin: [1.1, 1.2, 0.9, 1.2],
      filename: name + '.pdf',
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, backgroundColor: '#ffffff', onclone: window.QmcAppearance && QmcAppearance.lightClone },
      jsPDF: { unit: 'cm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr'] }
    }).from(box).outputPdf('blob');
    deliver(pdf, name + '.pdf', 'application/pdf');
  }

  /** في Flutter (_canShareImage): بطاقةٌ فيها بنود، أو تنبيهٌ له جدول */
  function canShare(card, msg) {
    if (card.inboxCode) {
      if (Array.isArray(card.items) && card.items.length) return true;
      return !!(msg && msg.data && Array.isArray(msg.data.rows) && msg.data.rows.length);
    }
    return Array.isArray(card.items) && card.items.length > 0;
  }

  window.QmcInsightShare = { share: share, canShare: canShare,
    // للفحص في المتصفّح (scratchpad) — لا يستعملهما التطبيق
    _png: drawPng, _html: function (c, x) { return x.msg ? inboxHtml(x.msg, x, true) : cardHtml(c, x, true); } };
})();
