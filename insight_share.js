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
  function th(x) {
    return '<th style="padding:6px 5px;background:' + BLUE_WASH + ';color:' + BLUE_DARK + ';font-weight:700;font-size:13px;' +
      'border:1px solid ' + LINE + ';text-align:center">' + esc(x) + '</th>';
  }
  function td(inner, odd, center) {
    return '<td style="padding:6px 7px;border:1px solid ' + LINE + ';vertical-align:middle;font-size:13px;line-height:1.6;color:' + INK +
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
      h += '<table style="width:100%;margin-top:12px;border-collapse:collapse;table-layout:fixed" dir="rtl">' +
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
      var keys = Object.keys(rows[0]).filter(function (k) {
        return rows.some(function (r) { return r[k] != null && r[k] !== ''; });
      });
      var sortK = SORT_KEYS.filter(function (x) { return keys.indexOf(x) >= 0; })[0];
      h += '<table style="width:100%;margin-top:12px;border-collapse:collapse" dir="rtl"><tr>' + th('م') +
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
    if (typeof ensurePdfLibrary === 'function' && !await ensurePdfLibrary()) {
      throw new Error('تعذّر تحميل مكتبة الصور — تأكّد من الاتصال');
    }
    var wide = kind === 'pdf';
    var inner = ctx.msg ? inboxHtml(ctx.msg, ctx, wide) : cardHtml(card, ctx, wide);
    var font = 'font-family:Tajawal,"Segoe UI",Tahoma,sans-serif;';
    var name = fileName(ctx.msg ? ctx.msg.title : card.title, ctx.at);
    if (kind === 'image') {
      // الغلاف ltr كي تبدأ البطاقة من x=0 فيُقصّ عرضها وحده (كحصاد الشهر)
      var html = '<div style="direction:ltr"><div dir="rtl" style="' + font + 'width:420px;box-sizing:border-box;padding:18px 16px;' +
        'background:#fff;color:' + INK + '">' + inner + '</div></div>';
      var canvas = await html2pdf().set({ html2canvas: { scale: 3, width: 420, backgroundColor: '#ffffff',
        onclone: window.QmcAppearance && QmcAppearance.lightClone } })   // 🌙 الصورة فاتحةٌ دائمًا
        .from(html, 'string').toCanvas().get('canvas');
      var blob = await new Promise(function (res) { canvas.toBlob(res, 'image/png'); });
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

  window.QmcInsightShare = { share: share, canShare: canShare };
})();
