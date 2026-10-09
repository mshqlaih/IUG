/* ============================================================================
   exam_cq.js — دورات التجويد في صفحة الطالب (exam.html) — 2026-10-08
   ----------------------------------------------------------------------------
   طلب مشرفي الدورات: «كل درسٍ له قسمٌ خاص، تدخل الطالبة فيختار لها البرنامج
   وتجيب — ونماذج شاملة للمادّة (نصفي ونهائي) فيصير الاختبار من البرنامج».
   الخادم: docs/ords_course_qbank.sql (QMC_CQ_PKG، نقاط cq/…).

   · التدريب حرٌّ بلا حدّ، والتصحيح **في آخره** بإجاباته وشرحها.
   · الاختبار موعدٌ يفتحه المشرف — المبدأ نفسه في اختبار المفردات: ساعة
     الجهاز للعرض، والإجابة «في الوقت» إن **وصلت** السيرفر قبل المهلة.
     والإجابات في localStorage وطابورٌ يُعاد (5 ثم 15 ثم 45 ثانية).
   · الدرجة تظهر **بعد انتهاء الموعد**، والإجابات الصحيحة لا تظهر أبدًا
     (أسئلة النماذج تتكرّر بين الدورات).
   · ثلاثة أنواع: اختيار من متعدّد (MCQ) · صح وخطأ (TF) · توصيل (MATCH).
     جواب التوصيل «عنصر:موضع» — القرائن تُعرَّف بموضعها في ترتيبٍ مخلوط
     لا برقم صفّها (رقمُ صفّها رقمُ عنصرها، فكان يكشف الجواب).

   ⚠️ بلا ?? ولا ?. — متصفّحات أندرويد القديمة ترفض الملف كلّه (كما في api.js).
   ⚠️ لا يمسّ اختبار المفردات: أدواتُه المشتركة من window.OXK وحدها.
   ============================================================================ */
window.CQ = (function () {
  "use strict";

  var LS = window.localStorage;
  var LETTERS = ["أ", "ب", "ج", "د", "هـ", "و"];
  var STAGE = { MID: "الاختبار النصفي", FINAL: "الاختبار النهائي" };
  var RETRY = [5, 15, 45];

  function K() { return window.OXK; }

  // 🔑 كتابات المتدرّبة كلّها نقطةٌ واحدة والفعل في الحمولة (2026-10-08):
  //    practice_start · practice_submit · exam_start · exam_answer · exam_submit
  function post(action, body) {
    var b = { action: action };
    Object.keys(body).forEach(function (k) { b[k] = body[k]; });
    return K().call("cq/student", "POST", b);
  }
  function el(id) { return document.getElementById(id); }
  function esc(s) { return K().esc(s); }
  function user() { return QMC.getUserName(); }
  function pct(v) {
    if (v === null || v === undefined) return "";
    var n = Number(v);
    return (Math.round(n) === n ? n : n.toFixed(1)) + "٪";
  }
  // «ص 12–18» من صفحات الدرس في كتاب الدورة
  function pages(a, b) {
    if (a === null || a === undefined) return "";
    return (b === null || b === undefined || b === a) ? "ص " + a : "ص " + a + "–" + b;
  }
  // «الأحد 12/10» من YYYY-MM-DD (تقويمٌ لا لحظة — بلا منطقة زمنية)
  var DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  function dayLabel(ymd) {
    var p = String(ymd).split("-");
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return DAYS[d.getDay()] + " " + Number(p[2]) + "/" + Number(p[1]);
  }

  // ساعة السيرفر: فرقها عن الجهاز يُحفظ عند كل ردّ
  var off = 0;
  function sync(iso) {
    var t = K().parseIso(iso);
    if (t) off = t - Date.now();
  }
  function now() { return Date.now() + off; }

  // ── التنسيق (مرّةً واحدة) ────────────────────────────────────────────
  var styled = false;
  function css() {
    if (styled) return;
    styled = true;
    var s = document.createElement("style");
    s.textContent =
      ".cq-sec{font-size:13px;color:#8a8a8a;margin:16px 0 8px}" +
      ".cq-lesson{display:flex;align-items:center;gap:12px;width:100%;text-align:right;background:#fff;" +
      "border:1px solid #e3e6e1;border-radius:12px;padding:12px 14px;margin-bottom:8px;font-size:16px;color:#1b1b1b}" +
      ".cq-lesson .n{flex:0 0 34px;height:34px;border-radius:50%;background:#e8f5e9;color:#2e7d32;" +
      "display:flex;align-items:center;justify-content:center;font-weight:bold}" +
      ".cq-lesson .t{flex:1;line-height:1.5}" +
      ".cq-lesson small{display:block;color:#888;font-size:12.5px;margin-top:2px}" +
      ".cq-lesson .go{color:#2e7d32;font-size:14px;white-space:nowrap}" +
      ".cq-exam{border-top:1px solid #eef0ec;padding:12px 0 4px}" +
      ".cq-exam .slot-act{margin-top:10px;padding-top:0;border-top:0}" +
      ".cq-pair{display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap}" +
      ".cq-left{flex:1 1 140px;font-size:18px;background:#f6f7f5;border-radius:10px;padding:10px 12px;line-height:1.6}" +
      ".cq-pair select{flex:1 1 170px;font-size:17px;padding:10px;border:2px solid #e3e6e1;border-radius:10px;" +
      "font-family:inherit;background:#fff;color:#1b1b1b}" +
      ".cq-pair select.on{border-color:#2e7d32;background:#f1f8f1}" +
      ".cq-rev{flex:1 1 170px;font-size:16px;border-radius:10px;padding:10px 12px;line-height:1.6}" +
      ".cq-rev.ok{background:#f1f8f1;color:#1b5e20;border:1px solid #c8e6c9}" +
      ".cq-rev.no{background:#fdf4f3;color:#8c1d18;border:1px solid #f3c7c3}" +
      ".cq-explain{background:#fbf8ef;border:1px solid #ece2c8;border-radius:10px;padding:10px 12px;" +
      "margin-top:8px;font-size:15px;line-height:1.8;color:#4a3f26}" +
      ".cq-pts{font-size:12px;color:#8a8a8a}" +
      ".cq-soon{display:block;color:#8a6d1f;font-size:12.5px;margin-top:2px}";
    document.head.appendChild(s);
  }

  // ═══════════════════════════════════════════════ القائمة (داخل «اختباراتك»)
  var data = null;

  async function mount(box) {
    if (!box) return;
    css();
    var r;
    // ⚖️ **صامتٌ عند التعذّر**: صفحة المفردات تعمل كما كانت إن لم تُنشر نقاط
    //    الدورات بعد، أو لم يكن للطالب دورات.
    try { r = await K().call("cq/my"); } catch (e) { return; }
    if (!r.data || r.data.status !== "success") return;
    data = r.data;
    sync(data.server_now);
    var courses = data.courses || [];
    if (!courses.length) return;

    var empty = el("oxEmpty");
    if (empty) empty.style.display = "none";

    var html = "";
    // ترحيبٌ باسمها إن لم ترحّب بها صفحة المفردات (المتدرّبة قد لا تكون طالبة تحفيظ)
    var app = K().app;
    if (!app.querySelector(".hello") && data.student_name) {
      var short = String(data.student_name).trim().split(/\s+/).slice(0, 3).join(" ");
      html += '<div class="card hello">أهلًا وسهلًا، <b>' + esc(short) + "</b></div>";
    }

    courses.forEach(function (c, ci) {
      html += '<div class="card"><div class="slot-head"><b class="slot-title">🎓 ' +
              esc(c.class_name || c.course_name) + "</b></div>";
      if (c.class_name && c.course_name && c.course_name !== c.class_name) {
        html += '<div class="mute" style="margin-top:-6px">' + esc(c.course_name) + "</div>";
      }
      if (c.book_title) {
        html += '<div class="mute">📚 ' + esc(c.book_title) + "</div>";
      }
      (c.exams || []).forEach(function (x, xi) { html += examRow(x, ci, xi); });

      // 📅 بترتيب جدول الدورة إن كان (ما لا لقاء له بعدها بترتيب المنهج).
      //    الفرز على نسخةٍ تحمل موضعها الأصليّ — data-cq-l يشير إلى c.lessons.
      var lessons = (c.lessons || []).map(function (l, i) { return { l: l, i: i }; });
      lessons.sort(function (a, b) {
        var da = a.l.session_date || "9999", db = b.l.session_date || "9999";
        return da < db ? -1 : da > db ? 1 : a.i - b.i;
      });
      if (lessons.length) {
        html += '<div class="cq-sec">دروس للتدريب — متى شئتِ</div>';
        lessons.forEach(function (o) {
          var l = o.l, li = o.i;
          var sub = l.question_count + " أسئلة";
          var pg = pages(l.page_from, l.page_to);
          if (pg) sub = pg + " · " + sub;
          if (l.attempts > 0) {
            sub += " · تدرّبتِ " + l.attempts + (l.attempts === 1 ? " مرّة" : " مرّات") +
                   " · آخر نتيجة " + pct(l.last_pct) + " · أفضلها " + pct(l.best_pct);
          }
          // التدريب مفتوحٌ قبل اللقاء (قرار المستخدم 2026-10-09) — تنبيهٌ لا منع
          if (l.session_date && data.today && l.session_date > data.today) {
            sub += '<span class="cq-soon">لم يُشرح بعد — موعده ' + dayLabel(l.session_date) + "</span>";
          }
          html += '<button class="cq-lesson" data-cq-l="' + ci + ":" + li + '">' +
                  '<span class="n">' + esc(l.lesson_no) + "</span>" +
                  '<span class="t">' + esc(l.title_ar) + "<small>" + sub + "</small></span>" +
                  '<span class="go">تدرّبي ›</span></button>';
        });
      } else if (!(c.exams || []).length) {
        html += '<p class="mute">لا دروس للتدريب في هذه الدورة بعد.</p>';
      }
      html += "</div>";
    });
    box.innerHTML = html;

    Array.prototype.forEach.call(box.querySelectorAll("[data-cq-l]"), function (b) {
      b.onclick = function () {
        var p = b.getAttribute("data-cq-l").split(":");
        var c = courses[Number(p[0])], l = c.lessons[Number(p[1])];
        startPractice(c, l);
      };
    });
    Array.prototype.forEach.call(box.querySelectorAll("[data-cq-x]"), function (b) {
      b.onclick = function () {
        var p = b.getAttribute("data-cq-x").split(":");
        var c = courses[Number(p[0])], x = c.exams[Number(p[1])];
        startExam(c, x);
      };
    });
  }

  function examRow(x, ci, xi) {
    var k = K();
    var ws = k.parseIso(x.window_start), we = k.parseIso(x.window_end), t = now();
    var tag, action;
    if (x.state === "CLOSED" || x.state === "LATE") {
      tag = '<span class="tag ok">سُلّم</span>';
      action = (x.score_pct !== null && x.score_pct !== undefined)
        ? '<span class="slot-note good">نتيجتك <b>' + pct(x.score_pct) + "</b> — تعتمدها اللجنة</span>"
        : '<span class="slot-note good">تظهر نتيجتك بعد انتهاء الموعد</span>';
    } else if (x.done_other === "Y") {
      tag = '<span class="tag gone">اختُبر</span>';
      action = '<span class="slot-note">اختبرتِ هذه المرحلة في موعدٍ سابق</span>';
    } else if (t >= ws && t < we) {
      tag = '<span class="tag live">مفتوح الآن</span>';
      action = '<button class="btn" data-cq-x="' + ci + ":" + xi + '">' +
               (x.state === "STARTED" ? "أكملي الاختبار" : "ادخلي الاختبار") + "</button>";
    } else if (t < ws) {
      tag = '<span class="tag wait">لم يبدأ</span>';
      action = '<span class="slot-note">يفتح ' + k.dayLabel(ws) +
               ' الساعة <span class="v num">' + k.hm(ws) + "</span></span>";
    } else {
      tag = '<span class="tag gone">انتهى</span>';
      action = '<span class="slot-note">' +
               (x.state === "STARTED" ? "انتهى الموعد وسُلّم ما أجبتِ" : "انتهى الموعد ولم تدخلي الاختبار") +
               "</span>";
    }
    return '<div class="cq-exam"><div class="slot-head" style="margin-bottom:6px">' +
           '<b class="slot-title">' + esc(STAGE[x.stage] || x.stage) + "</b>" + tag + "</div>" +
           '<div class="meta"><div><span class="k">اليوم</span><span class="v">' + k.dayLabel(ws) +
           '</span></div><div><span class="k">الوقت</span><span class="v num">' + k.hm(ws) + " ← " +
           k.hm(we) + "</span></div>" +
           (x.question_count ? '<div><span class="k">الأسئلة</span><span class="v num">' +
                               x.question_count + "</span></div>" : "") +
           '</div><div class="slot-act">' + action + "</div></div>";
  }

  // ═══════════════════════════════════════════════ بناء السؤال
  //
  // الجواب في الذاكرة: MCQ/TF رقم الخيار · MATCH كائنٌ {رقم العنصر: موضع القرين}
  function encode(it, a) {
    if (a === undefined || a === null) return "";
    if (it.kind !== "MATCH") return String(a);
    return Object.keys(a).filter(function (l) { return a[l] > 0; })
      .map(function (l) { return l + ":" + a[l]; }).join(",");
  }
  function decode(it, s) {
    if (!s) return undefined;
    if (it.kind !== "MATCH") return Number(s);
    var o = {};
    String(s).split(",").forEach(function (p) {
      var q = p.split(":");
      if (q.length === 2) o[q[0]] = Number(q[1]);
    });
    return o;
  }
  // مكتملٌ: اختيارٌ في MCQ/TF، وكل العناصر في التوصيل
  function complete(it, a) {
    if (a === undefined || a === null) return false;
    if (it.kind !== "MATCH") return true;
    return (it.choices || []).every(function (c) { return a[c.choice_id] > 0; });
  }

  function itemHtml(it, n, total, a, locked) {
    var h = '<div class="card" id="cqi_' + it.item_no + '"><div class="qhead">' +
            '<span class="qnum">السؤال ' + n + " من " + total + "</span>" +
            (Number(it.points) !== 1 ? '<span class="cq-pts">' + it.points + " درجات</span>" : "") +
            "</div>" +
            '<div class="q">' + esc(it.prompt_ar) + "</div>";
    if (it.kind === "MATCH") {
      h += '<p class="mute" style="margin-top:-6px">اختاري لكلّ عنصرٍ ما يناسبه.</p>';
      (it.choices || []).forEach(function (c) {
        var v = a ? (a[c.choice_id] || 0) : 0;
        h += '<div class="cq-pair"><span class="cq-left">' + esc(c.text_ar) + "</span>" +
             '<select data-i="' + it.item_no + '" data-l="' + c.choice_id + '"' +
             (v ? ' class="on"' : "") + (locked ? " disabled" : "") + ">" +
             '<option value="0">— اختاري —</option>';
        (it.rights || []).forEach(function (r) {
          h += '<option value="' + r.pos + '"' + (r.pos === v ? " selected" : "") + ">" +
               esc(r.text_ar) + "</option>";
        });
        h += "</select></div>";
      });
    } else {
      (it.choices || []).forEach(function (c, k) {
        var on = a === c.choice_id;
        h += '<button class="opt' + (on ? " on" : "") + '" data-i="' + it.item_no +
             '" data-c="' + c.choice_id + '"' + (locked ? " disabled" : "") + ">" +
             '<span class="ltr">' + (on ? "✓" : (it.kind === "TF" ? (k === 0 ? "✓" : "✗") : (LETTERS[k] || (k + 1)))) +
             "</span>" + '<span class="txt">' + esc(c.text_ar) + "</span></button>";
      });
    }
    return h + "</div>";
  }

  // يربط الخيارات في عنصرٍ (أو الصفحة كلّها) بدالّة الاختيار
  function bind(root, items, onPick) {
    Array.prototype.forEach.call(root.querySelectorAll("button.opt[data-i]"), function (b) {
      b.onclick = function () {
        onPick(Number(b.getAttribute("data-i")), Number(b.getAttribute("data-c")));
      };
    });
    Array.prototype.forEach.call(root.querySelectorAll("select[data-i]"), function (s) {
      s.onchange = function () {
        onPick(Number(s.getAttribute("data-i")), null,
               Number(s.getAttribute("data-l")), Number(s.value));
      };
    });
  }

  function itemOf(items, no) {
    for (var i = 0; i < items.length; i++) if (items[i].item_no === no) return items[i];
    return null;
  }

  // يحدّث جواب بندٍ في كائن الأجوبة — ويُرجع البند
  function pick(items, answers, no, choiceId, left, pos) {
    var it = itemOf(items, no);
    if (!it) return null;
    if (it.kind === "MATCH") {
      var o = answers[no] || {};
      o[left] = pos;
      answers[no] = o;
    } else {
      answers[no] = choiceId;
    }
    return it;
  }

  function redrawItem(it, items, answers, locked) {
    var box = el("cqi_" + it.item_no);
    if (!box) return;
    var n = items.indexOf(it) + 1;
    box.outerHTML = itemHtml(it, n, items.length, answers[it.item_no], locked);
  }

  function back(msg) {
    var k = K();
    k.bar.style.display = "none";
    k.clockEl.textContent = "";
    k.app.innerHTML = '<div class="card">' + esc(msg) + "</div>" +
                      '<div class="row" style="justify-content:center"><button class="link" id="cqbk">رجوع</button></div>';
    el("cqbk").onclick = k.viewList;
  }

  // ═══════════════════════════════════════════════ التدريب
  var pr = null;   // { key, title, items, answers, warned }

  async function startPractice(c, l) {
    var k = K();
    k.stopList();
    exitExam();
    k.titleEl.textContent = l.title_ar;
    k.showLogout(true);
    k.bar.style.display = "none";
    k.app.innerHTML = '<div class="card mute">جارٍ تجهيز الأسئلة…</div>';
    var r;
    try {
      r = await post("practice_start", { course_no: c.course_no, lesson_id: l.lesson_id });
    } catch (e) { return back("تعذّر الاتصال — التدريب يلزمه شبكة."); }
    if (!r.data || r.data.status !== "success") return back(k.msgOf(r));
    pr = { key: r.data.attempt_key, title: r.data.title_ar || l.title_ar,
           items: r.data.items || [], answers: {}, warned: false, course: c, lesson: l };
    renderPractice();
  }

  function answeredCount(items, answers) {
    return items.filter(function (it) { return complete(it, answers[it.item_no]); }).length;
  }

  function renderPractice() {
    var k = K();
    var items = pr.items;
    var html = '<div class="card hello" style="font-size:15px">تدريب: <b>' + esc(pr.title) +
               "</b><br><span class=\"mute\">أجيبي ثم اضغطي «صحّحي» — يظهر الصواب والشرح في الآخر.</span></div>" +
               '<div id="cqwarn"></div>';
    items.forEach(function (it, i) {
      html += itemHtml(it, i + 1, items.length, pr.answers[it.item_no], false);
    });
    k.app.innerHTML = html;
    bind(k.app, items, onPracticePick);
    window.scrollTo(0, 0);

    k.bar.style.display = "flex";
    k.bar.innerHTML = '<button class="btn2" id="cqx">رجوع</button>' +
                      '<span class="mute" id="cqcount"></span>' +
                      '<button class="btn" id="cqok">صحّحي</button>';
    el("cqx").onclick = function () { pr = null; k.viewList(); };
    el("cqok").onclick = submitPractice;
    practiceCount();
  }

  function practiceCount() {
    var c = el("cqcount");
    if (c) c.textContent = answeredCount(pr.items, pr.answers) + " من " + pr.items.length;
  }

  function onPracticePick(no, choiceId, left, pos) {
    if (!pr) return;
    var it = pick(pr.items, pr.answers, no, choiceId, left, pos);
    if (!it) return;
    redrawItem(it, pr.items, pr.answers, false);
    bind(el("cqi_" + no), pr.items, onPracticePick);
    pr.warned = false;
    practiceCount();
  }

  async function submitPractice() {
    var k = K();
    var left = pr.items.length - answeredCount(pr.items, pr.answers);
    // تنبيهٌ مرّةً واحدة لا منع: التدريب للتعلّم، والفارغ يُحسب خطأً
    if (left > 0 && !pr.warned) {
      pr.warned = true;
      el("cqwarn").innerHTML = '<div class="banner">بقي ' + left +
        " بلا إجابة (أو توصيلٌ ناقص). اضغطي «صحّحي» مرّةً أخرى للتصحيح على حالها.</div>";
      window.scrollTo(0, 0);
      return;
    }
    var ok = el("cqok");
    if (ok) { ok.disabled = true; ok.textContent = "جارٍ التصحيح…"; }
    var answers = pr.items.map(function (it) {
      return { item_no: it.item_no, answer: encode(it, pr.answers[it.item_no]) };
    }).filter(function (a) { return a.answer !== ""; });
    var r;
    try {
      // ⚠️ المصفوفة **نصًّا**: جسم الطلب في ORDS لا يربط المصفوفات
      r = await post("practice_submit", { attempt_key: pr.key, answers: JSON.stringify(answers) });
    } catch (e) {
      if (ok) { ok.disabled = false; ok.textContent = "صحّحي"; }
      el("cqwarn").innerHTML = '<div class="banner">تعذّر الاتصال — إجاباتك باقية، أعيدي المحاولة.</div>';
      return;
    }
    if (!r.data || r.data.status !== "success") return back(k.msgOf(r));
    viewReview(r.data);
  }

  // التصحيح: صفحةٌ واحدة تُمرّر — الصواب والخطأ والشرح
  function viewReview(d) {
    var k = K();
    var p = Number(d.score_pct || 0);
    var html = '<div class="card res ' + (p >= 70 ? "pass" : "fail") + '">' +
               '<div class="big">' + (p >= 90 ? "🌟" : (p >= 70 ? "👍" : "📘")) + "</div>" +
               '<p style="font-size:22px;margin:0"><b>' + pct(d.score_pct) + "</b></p>" +
               '<p class="mute">' + d.score_raw + " من " + d.score_max + " · " + esc(pr.title) + "</p></div>";
    (d.items || []).forEach(function (it, i) {
      var full = Number(it.earned || 0) >= Number(it.points || 0) - 0.001;
      var part = !full && Number(it.earned || 0) > 0;
      var a = decode(it, it.answer);
      html += '<div class="card"><div class="qhead"><span class="qnum">السؤال ' + (i + 1) + "</span>" +
              '<span class="tag ' + (full ? "ok" : "no") + '">' +
              (full ? "✓ صحيحة" : (part ? "جزئيًّا " + it.earned + " من " + it.points : "✗ خاطئة")) +
              "</span></div>" + '<div class="q">' + esc(it.prompt_ar) + "</div>";
      if (it.kind === "MATCH") {
        var rights = {};
        (it.rights || []).forEach(function (r) { rights[r.pos] = r.text_ar; });
        (it.choices || []).forEach(function (c) {
          var mine = a ? a[c.choice_id] : 0;
          var right = mine && rights[mine] === rights[c.right_pos];
          html += '<div class="cq-pair"><span class="cq-left">' + esc(c.text_ar) + "</span>" +
                  '<span class="cq-rev ' + (right ? "ok" : "no") + '">' +
                  (right ? "✓ " + esc(rights[mine])
                         : (mine ? "✗ " + esc(rights[mine]) + "<br>" : "لم تختاري<br>") +
                           "الصواب: <b>" + esc(rights[c.right_pos]) + "</b>") +
                  "</span></div>";
        });
      } else {
        (it.choices || []).forEach(function (c) {
          var right = c.is_correct === "Y", mine = a === c.choice_id;
          var cls = right ? "opt rev right" : (mine ? "opt rev wrong" : "opt rev");
          var note = right ? (mine ? "إجابتك — صحيحة" : "الإجابة الصحيحة") : (mine ? "إجابتك" : "");
          html += '<div class="' + cls + '"><span class="ltr">' + (right ? "✓" : (mine ? "✗" : "•")) +
                  '</span><span class="txt">' + esc(c.text_ar) +
                  (note ? ' <em class="note">(' + note + ")</em>" : "") + "</span></div>";
        });
        if (a === undefined) html += '<p class="mute">لم تُجيبي عن هذا السؤال.</p>';
      }
      if (it.explain_ar) html += '<div class="cq-explain">💡 ' + esc(it.explain_ar) + "</div>";
      html += "</div>";
    });
    k.app.innerHTML = html;
    window.scrollTo(0, 0);
    k.bar.style.display = "flex";
    k.bar.innerHTML = '<button class="btn2" id="cqx">دوراتي</button>' +
                      '<button class="btn" id="cqagain">تدرّبي مرّةً أخرى</button>';
    var c = pr.course, l = pr.lesson;
    el("cqx").onclick = function () { pr = null; k.viewList(); };
    el("cqagain").onclick = function () { startPractice(c, l); };
  }

  // ═══════════════════════════════════════════════ الاختبار
  var ex = null;          // حالة الاختبار الجاري
  var tick = null, retryTimer = null, pulseTimer = null;
  var flushing = false, retryStep = 0;

  function exKey(slot) { return "cq_ex_" + user() + "_" + slot; }
  function exLoad(slot) { try { return JSON.parse(LS.getItem(exKey(slot)) || "null"); } catch (e) { return null; } }
  function exSave() { if (ex) LS.setItem(exKey(ex.slot), JSON.stringify(ex)); }

  function exitExam() {
    clearInterval(tick); clearTimeout(retryTimer); clearInterval(pulseTimer);
    tick = null; ex = null;
  }

  async function startExam(c, x) {
    var k = K();
    k.stopList();
    exitExam();
    pr = null;
    k.app.innerHTML = '<div class="card mute">جارٍ فتح الاختبار…</div>';
    var r;
    try {
      r = await post("exam_start", { slot_id: x.slot_id, device_id: k.device });
    } catch (e) {
      // بلا شبكة: نكمل من المحفوظ إن كان الاختبار قد بدأ
      var saved = exLoad(x.slot_id);
      if (saved && saved.key) { ex = saved; return runExam(); }
      return back("تعذّر الاتصال — بدء الاختبار يلزمه شبكة.");
    }
    if (!r.data || r.data.status !== "success") return back(k.msgOf(r));
    var d = r.data;
    sync(d.server_now);
    var old = exLoad(x.slot_id) || {};
    ex = {
      slot: x.slot_id,
      title: (STAGE[d.stage] || "الاختبار") + " — " + (c.class_name || c.course_name),
      key: d.attempt_key,
      deadline: k.parseIso(d.deadline_at),
      items: d.items || [],
      answers: old.key === d.attempt_key ? (old.answers || {}) : {},
      pending: old.key === d.attempt_key ? (old.pending || {}) : {},
      blur: old.blur || 0,
      clash: d.device_clash || 0,
      off: off
    };
    // ما وصل السيرفر أصلٌ، إلا ما على الجهاز ولم يُرسل بعد (أحدث منه)
    ex.items.forEach(function (it) {
      if (it.answer && !ex.pending[it.item_no]) ex.answers[it.item_no] = decode(it, it.answer);
    });
    exSave();
    runExam();
  }

  function runExam() {
    var k = K();
    off = ex.off || off;
    k.showLogout(false);   // ضغطةٌ بالخطأ تمسح التوكن والوقت لا يتوقّف
    k.titleEl.textContent = ex.title;
    renderExam();
    clearInterval(tick);
    tick = setInterval(onTick, 1000);
    onTick();
    clearInterval(pulseTimer);
    pulseTimer = setInterval(pulse, 45000);
    flush();
  }

  function pendingCount() { return ex ? Object.keys(ex.pending).length : 0; }

  function renderExam() {
    var k = K();
    if (!ex) return;
    if (ex.done) return viewDone(false);
    var html = "";
    if (ex.clash > 0) {
      html += '<div class="banner">⚠️ بدأ هذا الاختبار من جهازٍ آخر أيضًا. إن لم تكوني أنتِ، راجعي المشرفة فورًا.</div>';
    }
    html += '<div id="cqsync"></div>';
    ex.items.forEach(function (it, i) {
      html += itemHtml(it, i + 1, ex.items.length, ex.answers[it.item_no], !!ex.locked);
    });
    k.app.innerHTML = html;
    bind(k.app, ex.items, onExamPick);
    syncLine();
    k.bar.style.display = "flex";
    k.bar.innerHTML = '<span class="mute" id="cqcount"></span>' +
                      '<button class="btn" id="cqsb">تسليم</button>';
    el("cqsb").onclick = askSubmit;
    examCount();
  }

  function syncLine() {
    var s = el("cqsync");
    if (!s) return;
    var n = pendingCount();
    s.innerHTML = n
      ? '<div class="sync wait">⏳ ' + n + " إجابة على جهازك لم تصل بعد — لا تغلقي الصفحة</div>"
      : '<div class="sync ok">✓ كلّ إجاباتك وصلت</div>';
  }

  function examCount() {
    var c = el("cqcount");
    if (c && ex) c.textContent = "أجبتِ " + answeredCount(ex.items, ex.answers) + " من " + ex.items.length;
  }

  function onExamPick(no, choiceId, left, pos) {
    if (!ex || ex.locked) return;
    var it = pick(ex.items, ex.answers, no, choiceId, left, pos);   // ١) على الجهاز أوّلًا
    if (!it) return;
    ex.pending[no] = encode(it, ex.answers[no]);
    exSave();
    redrawItem(it, ex.items, ex.answers, false);
    bind(el("cqi_" + no), ex.items, onExamPick);
    examCount();
    syncLine();
    retryStep = 0;
    flush();                                                       // ٢) ثم إلى السيرفر
  }

  // ── طابور الإرسال ──────────────────────────────────────────────────
  async function flush() {
    if (!ex || flushing) return;
    var keys = Object.keys(ex.pending);
    if (!keys.length) return;
    flushing = true;
    clearTimeout(retryTimer);
    var cur = ex;
    var batch = keys.map(function (n) { return { item_no: Number(n), answer: cur.pending[n] }; });
    try {
      var r = await post("exam_answer",
                         { attempt_key: cur.key, answers: JSON.stringify(batch), blur: cur.blur });
      if (r.data && r.data.status === "success") {
        // يُحذف من الطابور ما أُرسل **ولم يتغيّر بعده**
        batch.forEach(function (b) {
          if (cur.pending[b.item_no] === b.answer) delete cur.pending[b.item_no];
        });
        sync(r.data.server_now);
        cur.off = off;
        // ⏳ مهلةٌ أطول تُعتمد، والأقصر لا (لا إقفال مفاجئ على من يجيب)
        var dl = K().parseIso(r.data.deadline_at);
        if (dl && dl > cur.deadline) cur.deadline = dl;
        exSave();
        retryStep = 0;
      } else if (r.status === 409) {
        cur.done = true; exSave();          // أُقفل على السيرفر عند الموعد
      } else {
        schedule();
      }
    } catch (e) {
      schedule();                           // شبكة — أعيدي لاحقًا
    }
    flushing = false;
    if (ex === cur) {
      if (cur.done) return viewDone(true);
      syncLine();
      if (pendingCount()) schedule();
    }
  }

  function schedule() {
    clearTimeout(retryTimer);
    var s = RETRY[Math.min(retryStep, RETRY.length - 1)];
    retryStep++;
    retryTimer = setTimeout(flush, s * 1000);
  }

  // 💓 نبضة: وقت السيرفر والمهلة لمن توقّفت عن الإجابة
  async function pulse() {
    if (!ex || ex.done || ex.locked || flushing || pendingCount()) return;
    try {
      var r = await post("exam_answer", { attempt_key: ex.key, answers: "[]", blur: ex.blur });
      if (r.data && r.data.status === "success" && ex) {
        sync(r.data.server_now); ex.off = off;
        var dl = K().parseIso(r.data.deadline_at);
        if (dl && dl > ex.deadline) ex.deadline = dl;
        exSave();
      } else if (r.status === 409 && ex) {
        ex.done = true; exSave(); viewDone(true);
      }
    } catch (e) { /* النبضة التالية تكفي */ }
  }

  window.addEventListener("online", function () { if (ex) { retryStep = 0; flush(); } });

  // مغادرة الصفحة تُعدّ — مؤشّرٌ للمشرفة لا حكم
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && ex && !ex.done && !ex.locked) { ex.blur++; exSave(); }
  });

  function onTick() {
    if (!ex) return;
    var k = K();
    var left = ex.deadline - now();
    if (left <= 0) {
      k.clockEl.textContent = "00:00";
      if (!ex.locked) { closeModal(); ex.locked = true; exSave(); renderExam(); submit(true); }
      return;
    }
    var s = Math.floor(left / 1000);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    k.clockEl.textContent = (h ? h + ":" : "") + k.two(m) + ":" + k.two(s % 60);
    k.clockEl.className = s < 300 ? "warn" : "";
  }

  function closeModal() {
    var m = el("cqmbg");
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }

  // 🚫 التسليم اليدويّ يشترط إجابة كل سؤال (كاختبار المفردات)؛ والإقفال عند
  //    الموعد يسلّم ما وُجد.
  function askSubmit() {
    closeModal();
    var empty = [];
    ex.items.forEach(function (it, i) { if (!complete(it, ex.answers[it.item_no])) empty.push(i); });
    var html = '<div class="modal-bg" id="cqmbg"><div class="modal" role="dialog">';
    if (empty.length) {
      html += "<h3>أكملي الإجابة أوّلًا</h3><p>بقي <b>" + empty.length + "</b> من " + ex.items.length +
              " بلا إجابةٍ كاملة.</p>" +
              '<p class="mute">وإن انتهى الوقت سُلّم اختبارك بما أجبتِ، والفارغ يُحسب خطأً.</p>' +
              '<div class="chips">' + empty.map(function (i) {
                return '<button data-go="' + ex.items[i].item_no + '">السؤال ' + (i + 1) + "</button>";
              }).join("") + "</div>";
    } else {
      html += "<h3>✅ أجبتِ عن الأسئلة كلّها</h3><p>راجعي إجاباتك إن شئتِ — <b>فلا تعديل بعد التسليم</b>.</p>";
    }
    if (pendingCount()) html += '<p class="mute">' + pendingCount() + " إجابة على جهازك ستُرسل قبل التسليم.</p>";
    html += '<div class="actions">' + (empty.length ? "" : '<button class="btn" id="cqmok">تسليم الآن</button>') +
            '<button class="' + (empty.length ? "btn" : "btn3") + '" id="cqmno">' +
            (empty.length ? "أكملي الإجابة" : "مراجعة") + "</button></div></div></div>";
    document.body.insertAdjacentHTML("beforeend", html);
    var bg = el("cqmbg");
    bg.onclick = function (e) { if (e.target === bg) closeModal(); };
    el("cqmno").onclick = function () {
      closeModal();
      if (empty.length) goTo(ex.items[empty[0]].item_no);
    };
    Array.prototype.forEach.call(bg.querySelectorAll("[data-go]"), function (b) {
      b.onclick = function () { closeModal(); goTo(Number(b.getAttribute("data-go"))); };
    });
    var ok = el("cqmok");
    if (ok) ok.onclick = function () { closeModal(); ex.locked = true; exSave(); renderExam(); submit(false); };
  }

  function goTo(no) {
    var e = el("cqi_" + no);
    if (e && e.scrollIntoView) e.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit(auto) {
    clearInterval(tick);
    var cur = ex;
    await flush();                                      // ما في الطابور أوّلًا
    if (!ex || ex !== cur) return;
    if (!cur.done) {
      try {
        var r = await post("exam_submit", { attempt_key: cur.key });
        if (r.data && r.data.status === "success") { cur.done = true; exSave(); }
      } catch (e) { /* السيرفر يُقفل آليًّا عند الموعد — التسليم إشارةٌ لا محتوى */ }
    }
    if (!cur.done && pendingCount()) {
      K().app.insertAdjacentHTML("afterbegin",
        '<div class="banner">انتهى الوقت وما زالت ' + pendingCount() +
        " إجابة على جهازك. سنرسلها حين تعود الشبكة — وما يصل بعد الموعد لا يُحتسب.</div>");
      schedule();
      return;
    }
    cur.done = true; exSave();
    viewDone(auto);
  }

  function viewDone(auto) {
    var k = K();
    clearInterval(tick); clearInterval(pulseTimer); clearTimeout(retryTimer);
    k.bar.style.display = "none";
    k.clockEl.textContent = "";
    k.showLogout(true);
    k.app.innerHTML =
      '<div class="card" style="text-align:center"><div class="big">✅</div>' +
      "<h3>" + (auto ? "انتهى الوقت وسُلّم اختبارك" : "تمّ تسليم اختبارك") + "</h3>" +
      '<p class="mute">تظهر نسبتك بعد انتهاء الموعد، وتعتمد اللجنة الدرجة.</p></div>' +
      '<div class="row" style="justify-content:center"><button class="link" id="cqbk">دوراتي واختباراتي</button></div>';
    el("cqbk").onclick = function () { ex = null; k.viewList(); };
  }

  return { mount: mount };
})();
