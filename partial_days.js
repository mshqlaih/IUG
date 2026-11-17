/* 📋 «أيامٌ ناقصة التسجيل» (2026-11-17) — نظير _openPartialDays و
 *    showRecordRemainingDialog في الصفوة (lib/widgets/inbox_alerts.dart ·
 *    lib/widgets/record_remaining_dialog.dart).
 *
 *  تنبيه PARTIAL_DAYS (QMC_INBOX_PKG) يحمل data.days = [{date, circle, missing,
 *  students:"1,2,3"}]. زرّ «أكمل التسجيل» ⇒ قائمة الأيام، ولمس يومٍ ⇒ الباقون
 *  فيه بلا تسجيل (من على الجهاز وحده، ومن سُجّل له شيءٌ على الجهاز ذلك اليوم
 *  يُتخطّى) ⇒ غياب بدون عذر · بعذر · حضور بدون تسميع للمحدَّدين.
 *  الحفظ محلّيٌّ أوّلًا كأيّ نشاط، ثم الرفع ثم سحب الصندوق فيزول التنبيه.
 *  ⚠️ بلا ?? ولا ?. (متصفّحات قديمة).
 */
(function () {
  var TYPES = [[5, 'غياب بدون عذر'], [4, 'غياب بعذر'], [3, 'حضور بدون تسميع']];
  var AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  function esc(v) { return escapeHtml(v); }
  function dayLabel(iso) {
    var p = String(iso || '').substring(0, 10).split('-');
    if (p.length !== 3) return String(iso || '');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return AR_DAYS[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
  }
  function daysOf(m) {
    var d = (m && m.data) || {};
    return (Array.isArray(d.days) ? d.days : []).filter(function (x) { return x && typeof x === 'object' && x.date; });
  }
  function nosOf(day) {
    var out = {};
    String(day.students == null ? '' : day.students).split(',').forEach(function (x) {
      var n = parseInt(String(x).trim(), 10);
      if (!isNaN(n)) out[n] = 1;
    });
    return out;
  }

  function injectCss() {
    if (document.getElementById('pdStyle')) return;
    var st = document.createElement('style');
    st.id = 'pdStyle';
    st.textContent =
      '.pd-box{text-align:start;max-height:86vh;overflow:auto}' +
      '.pd-p{color:#5f6368;font-size:13.5px;line-height:1.7;margin:0 0 10px}' +
      '.pd-day{display:flex;align-items:center;gap:10px;width:100%;background:#fff;border:1px solid #e0e3e7;border-radius:12px;' +
      'padding:10px 12px;margin-bottom:8px;font:inherit;text-align:start;cursor:pointer;color:#202124}' +
      '.pd-day i.lead{color:#E65100}' +
      '.pd-day .x{flex:1;min-width:0}.pd-day .x b{display:block;font-size:14.5px}.pd-day .x small{color:#5f6368}' +
      '.pd-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}' +
      '.pd-chip{background:#fff;color:#334155;border:1px solid #cbd5e1;border-radius:18px;padding:7px 12px;font:inherit;font-size:13.5px;cursor:pointer}' +
      '.pd-chip.on{background:var(--primary-wash,#e8f0fe);color:var(--primary-dark,#0d47a1);border-color:var(--primary);font-weight:600}' +
      '.pd-list{border:1px solid #e0e3e7;border-radius:10px;max-height:40vh;overflow:auto}' +
      '.pd-st{display:flex;align-items:center;gap:10px;padding:8px 10px;border-top:1px solid #f1f3f4;font-size:14px;cursor:pointer}' +
      '.pd-st:first-child{border-top:0}.pd-st input{width:18px;height:18px;flex-shrink:0}' +
      '.pd-all{background:transparent;color:var(--primary);padding:4px 6px;font-size:13px}';
    document.head.appendChild(st);
  }

  function overlay(id, inner) {
    var old = document.getElementById(id);
    if (old) old.remove();
    var o = document.createElement('div');
    o.id = id;
    o.className = 'modal-overlay';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.style.display = 'flex';
    o.innerHTML = '<div class="modal-box pd-box">' + inner + '</div>';
    o.addEventListener('click', function (ev) {
      if (ev.target === o || ev.target.closest('[data-close]')) o.remove();
    });
    document.body.appendChild(o);
    return o;
  }

  function allOf(store) {
    return new Promise(function (res) {
      try {
        var r = db.transaction(store, 'readonly').objectStore(store).getAll();
        r.onsuccess = function () { res(r.result || []); };
        r.onerror = function () { res([]); };
      } catch (_) { res([]); }
    });
  }

  // الطلاب الباقون ذلك اليوم على الجهاز — بلا من سُجّل له شيءٌ محلّيًّا فيه
  async function remainingOf(day) {
    var nos = nosOf(day);
    var date = String(day.date).substring(0, 10);
    var students = await allOf('students');
    var records = await allOf('records');
    var done = {};
    records.forEach(function (r) { if (String(r.date) === date) done[Number(r.student)] = 1; });
    var seen = {};
    return students.filter(function (s) {
      var id = Number(s.id);
      if (!nos[id] || done[id] || seen[id]) return false;
      seen[id] = 1;
      return true;
    }).sort(function (a, b) { return fullStudentName(a).localeCompare(fullStudentName(b), 'ar'); });
  }

  function open(m) {
    injectCss();
    var days = daysOf(m);
    if (!days.length) { showToast('لا أيام ناقصة الآن — حدّث الرسائل'); return; }
    var h = '<h4 class="modal-title">أيامٌ ناقصة التسجيل</h4>' +
      '<p class="pd-p">المس يومًا لتسجّل من بقي فيه بلا تسجيل</p>';
    days.forEach(function (d, i) {
      h += '<button type="button" class="pd-day" data-i="' + i + '"><i class="fas fa-list-check lead"></i>' +
        '<span class="x"><b>' + esc(dayLabel(d.date)) + (d.circle ? ' — ' + esc(d.circle) : '') + '</b>' +
        '<small>بقي ' + esc(d.missing == null ? '?' : d.missing) + ' بلا تسجيل</small></span>' +
        '<i class="fas fa-chevron-left" style="color:#9aa0a6"></i></button>';
    });
    h += '<div class="modal-actions"><button type="button" class="modal-btn modal-cancel" data-close>إغلاق</button></div>';
    var o = overlay('pdDaysModal', h);
    Array.prototype.forEach.call(o.querySelectorAll('.pd-day'), function (b) {
      b.onclick = async function () {
        var d = days[Number(b.getAttribute('data-i'))];
        var list = await remainingOf(d);
        if (!list.length) {
          showToast('طلاب هذا اليوم ليسوا على الجهاز أو سُجّلوا — حدّث بيانات الحلقة ثم أعد المحاولة');
          return;
        }
        o.remove();
        openRemaining(d, list);
      };
    });
  }

  function openRemaining(day, list) {
    var date = String(day.date).substring(0, 10);
    var isToday = date === ymdLocal(new Date());
    var chosen = {};
    list.forEach(function (s) { chosen[Number(s.id)] = 1; });
    var type = 5;

    var o = overlay('pdRemainModal',
      '<h4 class="modal-title">الباقون بلا تسجيل ' + (isToday ? 'اليوم' : esc(dayLabel(date))) + ' (' + list.length + ')</h4>' +
      (day.circle ? '<p class="pd-p">' + esc(day.circle) + '</p>' : '') +
      '<div class="pd-p" style="margin:0">سجّل المحدَّدين:</div><div class="pd-chips" id="pdTypes"></div>' +
      '<div style="display:flex;justify-content:flex-end"><button type="button" class="pd-all" id="pdAll"></button></div>' +
      '<div class="pd-list" id="pdList"></div>' +
      '<div class="modal-actions"><button type="button" class="modal-btn modal-cancel" data-close>إلغاء</button>' +
      '<button type="button" class="modal-btn modal-confirm" id="pdSave"></button></div>');

    function count() { return Object.keys(chosen).length; }
    function draw() {
      o.querySelector('#pdTypes').innerHTML = TYPES.map(function (t) {
        return '<button type="button" class="pd-chip' + (type === t[0] ? ' on' : '') + '" data-t="' + t[0] + '">' + esc(t[1]) + '</button>';
      }).join('');
      o.querySelector('#pdList').innerHTML = list.map(function (s) {
        var id = Number(s.id);
        return '<label class="pd-st"><input type="checkbox" data-s="' + id + '"' + (chosen[id] ? ' checked' : '') + '>' +
          '<span>' + esc(fullStudentName(s) || ('الطالب ' + id)) + '</span></label>';
      }).join('');
      o.querySelector('#pdAll').textContent = count() === list.length ? 'إلغاء تحديد الكلّ' : 'تحديد الكلّ';
      var sv = o.querySelector('#pdSave');
      sv.textContent = 'سجّل ' + count();
      sv.disabled = count() === 0;
    }
    draw();

    o.querySelector('#pdTypes').addEventListener('click', function (e) {
      var b = e.target.closest('[data-t]');
      if (b) { type = Number(b.getAttribute('data-t')); draw(); }
    });
    o.querySelector('#pdList').addEventListener('change', function (e) {
      var id = Number(e.target.getAttribute('data-s'));
      if (e.target.checked) chosen[id] = 1; else delete chosen[id];
      draw();
    });
    o.querySelector('#pdAll').onclick = function () {
      if (count() === list.length) chosen = {};
      else list.forEach(function (s) { chosen[Number(s.id)] = 1; });
      draw();
    };
    o.querySelector('#pdSave').onclick = async function () {
      var btn = this;
      btn.disabled = true;
      var ids = Object.keys(chosen).map(Number);
      var n = await saveAll(ids, type, date);
      o.remove();
      if (n < 0) return;
      showToast('✅ سُجّل ' + n + (navigator.onLine ? '' : ' — يُرفع عند عودة الاتصال'));
      // الرفع أوّلًا ثم السحب: التنبيه يزول من السيرفر متى وصل التسجيل
      try { requestSync(); } catch (_) {}
      setTimeout(function () {
        if (window.QMC_INBOX && navigator.onLine) {
          QMC_INBOX.fetch().then(function () { QMC_INBOX.refreshUi(); }, function () {});
        }
      }, 8000);
    };
  }

  // دفعةٌ واحدة في معاملةٍ واحدة — ومن سُجّل له النوع نفسه ذلك اليوم يُتخطّى
  async function saveAll(ids, type, date) {
    var who = await getTeacherIdentity();
    if (!who.teacher) {
      showAlert('تعذّر التعرّف على المسمّع. يرجى تسجيل الخروج ثم الدخول من جديد.');
      return -1;
    }
    return new Promise(function (res) {
      var saved = 0;
      var tx = db.transaction('records', 'readwrite');
      var store = tx.objectStore('records');
      ids.forEach(function (id) {
        var rec = buildActivityRecord({
          teacher: who.teacher, teacherName: who.teacherName,
          student: Number(id), type: Number(type), date: date
        });
        var chk = store.index('student_date_type').getKey([rec.student, rec.date, rec.type]);
        chk.onsuccess = function () {
          if (chk.result !== undefined) return;
          store.add(rec).onsuccess = function () { saved++; };
        };
      });
      tx.oncomplete = function () { try { refreshAll(); } catch (_) {} res(saved); };
      tx.onerror = function () { try { refreshAll(); } catch (_) {} res(saved); };
    });
  }

  window.QmcPartialDays = { open: open, days: daysOf };
})();
