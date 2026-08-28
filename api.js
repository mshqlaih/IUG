// ============================================================================
// api.js — طبقة اتصال موحّدة بباكند QMC (مركزة كل نداءات الشبكة في مكان واحد)
// ----------------------------------------------------------------------------
// التوثيق الموحّد: device_id يُصدره device/first-login، ويُرسَل في كل طلب كترويسة
//   X-Device-Id (يقرؤها السيرفر عبر QMC_CTX_PKG.set_from_token) — مطابق لتطبيق Flutter.
// ملاحظة: نُبقي حالياً نفس endpoints وعقود حقول IUG العاملة (students / circleActivity
//   / employees)، ونوحّد فقط التوثيق والمركزة. تبديل الأسماء إلى saveActivity/
//   getCircleActivity مرحلة لاحقة تحتاج تعديل السيرفر واختباراً.
// ============================================================================
window.QMC = (function () {
  const BASE =
    "https://g0a3378e3bd0d3a-dbcpc2023.adb.me-abudhabi-1.oraclecloudapps.com/ords/cpcws/qmc";

  function getDeviceId() {
    return localStorage.getItem("device_id") || "";
  }
  function getUserName() {
    return (
      localStorage.getItem("user_name") ||
      localStorage.getItem("teacherID") ||
      ""
    );
  }

  // نداء موحّد: يحقن X-Device-Id + X-Platform تلقائيًا (مثل AuthClient في Flutter)
  async function apiFetch(path, opts = {}) {
    const { method = "GET", body = null, form = false, timeoutMs = 20000 } = opts;
    const headers = { "X-Platform": "web" };
    const did = getDeviceId();
    if (did) headers["X-Device-Id"] = did;

    let payload = null;
    if (body != null) {
      if (form) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        payload = new URLSearchParams(body).toString();
      } else {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(body);
      }
    }

    const url = `${BASE}/${path}`;
    const init = { method: method, headers: headers, body: payload };

    // AbortController غير متوفّر في متصفحات أندرويد القديمة — عندها نُرسل بلا مهلة
    if (typeof AbortController === "undefined") {
      return fetch(url, init);
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    init.signal = ctrl.signal;
    try {
      return await fetch(url, init);
    } finally {
      clearTimeout(timer);
    }
  }

  // --- تسجيل الدخول (نفس endpoint تطبيق Flutter، JSON) ---
  async function login(username, password) {
    const res = await apiFetch("device/first-login", {
      method: "POST",
      body: { p_username: username, p_password: password },
    });
    const data = await res.json().catch(() => ({}));
    return {
      success: data.status === "success",
      deviceId: data.device_id,
      idno: data.id_no,
      message: data.message || "تعذّر الاتصال أو بيانات الدخول غير صحيحة",
    };
  }

  // --- بيانات الموظف/المركز/الحلقة ---
  // ⚠️ 404 ليست خطأً: المستخدم قد يكون إدارياً أو مبرمجاً بلا سجل موظف
  //    (لا مركز ولا حلقة). نُرجع null ليتعامل المستدعي معها كحالة طبيعية،
  //    بدل رمي استثناء يظهر «HTTP 404» أحمر في كل إقلاع.
  async function getEmployee(idno) {
    const res = await apiFetch(`employees/${encodeURIComponent(idno)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("تعذّر جلب بيانات الموظف (رمز " + res.status + ")");
    return res.json();
  }

  // يفحص جسم الاستجابة لا حالة HTTP وحدها — لأن ORDS قد يعيد 200 ومعها خطأ في
  // الجسم، فيُحسب السجل "مزامَناً" وهو لم يُحفظ على السيرفر إطلاقاً.
  function interpretSaveResponse(status, raw) {
    const decoded = safeDecode(raw);

    if (status < 200 || status >= 300) {
      return { ok: false, error: extractServerError(decoded, raw) };
    }

    // استجابة ليست JSON: تُعتبر خطأ فقط إن حملت أثر خطأ أوراكل
    if (decoded == null) {
      if (/ORA-\d{5}/i.test(raw || "")) {
        return { ok: false, error: extractServerError(null, raw) };
      }
      return { ok: true, error: "" };
    }

    if (Array.isArray(decoded)) {
      const hasError = decoded.some(it => it && typeof it === "object" && it.message);
      return hasError
        ? { ok: false, error: extractServerError(decoded, raw) }
        : { ok: true, error: "" };
    }

    if (decoded && typeof decoded === "object") {
      const st = String(decoded.status || "").toLowerCase();
      if (st === "success") return { ok: true, error: "" };

      if (Array.isArray(decoded.errors) && decoded.errors.length) {
        return { ok: false, error: extractServerError(decoded, raw) };
      }
      if (st === "error" || st === "fail" || st === "failed") {
        return { ok: false, error: extractServerError(decoded, raw) };
      }
      // رسالة بلا status success ⇒ الأرجح أنها رسالة رفض
      if (decoded.message || decoded.text) {
        return { ok: false, error: extractServerError(decoded, raw) };
      }
    }

    return { ok: true, error: "" };
  }

  // --- بناء جسم saveActivity من سجل IUG (نفس عقد QMC_API_SAVE_ACTIVITY) ---
  // ملاحظة: في اختبار الجزء والسرد (6/7) يحمل حقلا الآيات رقمَي الجزء،
  //         تماماً كما يفعل تطبيق Flutter.
  function buildSaveActivityBody(record) {
    const type = Number(record.type);
    const isPartMode = (type === 6 || type === 7);

    const from = isPartMode ? record.partFrom : record.fromRange;
    const to   = isPartMode ? record.partTo   : record.toRange;

    const num = (v) => (v === "" || v === null || v === undefined) ? null : Number(v);
    // ملاحظة توافق: نتجنّب ?? و?. لأن متصفحات أندرويد القديمة (Chrome < 80)
    // ترفض الملف كاملاً بخطأ نحوي فيتعطّل التطبيق حتى دون اتصال.
    const numOr0 = (v) => { const n = num(v); return n === null ? 0 : n; };

    return {
      action          : "SAVE",   // السيرفر يميّز الإضافة من التعديل عبر tagno
      user_name       : String(record.teacher || getUserName()),
      student_no      : String(record.student),
      attendance_type : String(type),
      activity_date   : String(record.date),
      from_aya_no     : String(numOr0(from)),
      to_aya_no       : String(numOr0(to)),
      num_errors      : String(numOr0(record.errors)),
      recitation_grade: num(record.rating),
      student_mark    : num(record.mark),
      notes           : record.notes || "",
      // 0 أو فارغ ⇒ null فيراه السيرفر إضافة جديدة
      tagno           : record.tagNo ? Number(record.tagNo) : null,
    };
  }

  // --- رفع سجل نشاط واحد عبر saveActivity ---
  // يُرجع { ok, error, tagNo, numPages } — النجاح يتطلّب status = success/ok
  // كما في تطبيق Flutter، فلا يُحسب السجل مرفوعاً إلا بتأكيد صريح.
  async function saveActivity(record) {
    const res = await apiFetch("saveActivity", {
      method: "POST",
      body: buildSaveActivityBody(record),
    });

    const raw = await res.text().catch(() => "");
    const decoded = safeDecode(raw);

    if (res.status >= 200 && res.status < 300 &&
        decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
      const st = String(decoded.status || "").toLowerCase();
      if (st === "success" || st === "ok") {
        const pick = (...vals) => {
          for (let i = 0; i < vals.length; i++) {
            if (vals[i] !== null && vals[i] !== undefined) return vals[i];
          }
          return null;
        };
        const tagNo = pick(decoded.tagno, decoded.tagNo);
        const pages = pick(decoded.numPages, decoded.numpages);
        return {
          ok: true,
          error: "",
          tagNo: (tagNo === null || tagNo === undefined) ? null : Number(tagNo),
          numPages: (pages === null || pages === undefined) ? null : Number(pages),
          raw: raw,
        };
      }
    }

    const verdict = interpretSaveResponse(res.status, raw);
    return {
      ok: false,
      error: verdict.error || raw || "لم يؤكّد السيرفر حفظ السجل",
      tagNo: null,
      numPages: null,
      raw: raw,
    };
  }

  // --- سحب أنشطة الحلقة (circleActivity/{user}) ---
  async function pullCircleActivity(username = getUserName()) {
    const res = await apiFetch(`circleActivity/${encodeURIComponent(username)}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json(); // { items: [...] }
  }

  // --- سحب طلاب المستخدم (getStudentByUser/{idno}) ---
  // يُرجع student_no المستقل عن id_no — وهو ما يعتمده saveActivity.
  // (الخدمة القديمة students?puserName= كانت تُرجع رقم الهوية في الحقل id فقط.)
  async function pullStudents(username = getUserName()) {
    const res = await apiFetch(`getStudentByUser/${encodeURIComponent(username)}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json(); // { items: [{ student_no, id_no, first_name, ... , circle_no }] }
  }

  // --- حذف نشاط من السيرفر (نفس endpoint بـ action=DELETE، كما في Flutter) ---
  // tagno هو مفتاح السجل عند السيرفر؛ يُرسل null إن كان 0 فيبحث عنه بالطالب/النوع/التاريخ.
  async function deleteActivity(record) {
    const body = buildSaveActivityBody(record);
    body.action = "DELETE";

    const res = await apiFetch("saveActivity", { method: "POST", body: body });
    const raw = await res.text().catch(() => "");
    const decoded = safeDecode(raw);

    if (res.status >= 200 && res.status < 300 &&
        decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
      const st = String(decoded.status || "").toLowerCase();
      if (st === "success" || st === "ok") return { ok: true, error: "", raw: raw };
    }

    const verdict = interpretSaveResponse(res.status, raw);
    return {
      ok: false,
      error: verdict.error || raw || "لم يؤكّد السيرفر حذف السجل",
      raw: raw,
    };
  }

  // --- حلقات المستخدم (نفس عقد UserCirclesService في Flutter) ---
  // getUserCircles?username=X → { items: [{ circle_no, circle_name, center_no,
  //                                         center_name, gender, circle_days, emp_role }] }
  async function getUserCircles(username = getUserName()) {
    const res = await apiFetch(`getUserCircles?username=${encodeURIComponent(username)}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const body = await res.json().catch(() => null);
    return (body && body.items) || [];
  }

  // --- صلاحيات المستخدم (نفس عقد AccessService في Flutter) ---
  // getUserAccess/{username} → items[0] وقد تكون مغلّفة داخل result_json
  async function getUserAccess(username = getUserName()) {
    const res = await apiFetch("getUserAccess/" + encodeURIComponent(username));
    if (!res.ok) throw new Error("HTTP " + res.status);
    const body = await res.json().catch(() => null);
    const outer = (body && body.items) || [];
    if (!outer.length) return null;

    const first = outer[0];
    // الصيغة المغلّفة: result_json نصّ JSON بداخله items مرة أخرى
    if (first && first.result_json) {
      try {
        const inner = JSON.parse(String(first.result_json));
        const items = (inner && inner.items) || [];
        if (items.length) return items[0];
      } catch (_) { /* نسقط إلى الصيغة المباشرة */ }
    }
    return first || null;
  }

  // --- البحث في السجل المدني بالاسم (civil/searchCivil) ---
  // أقصى ما يردّه السيرفر 60 صفاً (ROWNUM <= 60)
  const CIVIL_SEARCH_LIMIT = 60;

  async function searchCivil(parts) {
    const q = [];
    ['first', 'father', 'gfather', 'family', 'id_no'].forEach(k => {
      const v = parts && parts[k] ? String(parts[k]).trim() : '';
      if (v) q.push(k + '=' + encodeURIComponent(v));
    });
    if (!q.length) return { people: [], truncated: false };

    const res = await apiFetch("civil/searchCivil?" + q.join('&'), { timeoutMs: 25000 });
    if (res.status === 404) {
      throw new Error("نقطة searchCivil غير مسجّلة — شغّل docs/ords_civil_search.sql على السيرفر");
    }
    if (!res.ok) throw new Error("HTTP " + res.status);

    const body = await res.json().catch(() => null);
    const items = (body && body.items) || [];
    return { people: items, truncated: items.length >= CIVIL_SEARCH_LIMIT };
  }

  // --- السجل المدني: جلب بيانات الطالب برقم الهوية (نفس عقد CivilRegistryService في Flutter) ---
  // civil/getCivilRecord/{idno} → { items: [{ first_name, father_name, gfather_name,
  //                                           family_name, birth_date, gender }] }
  async function lookupCivilRecord(idNo) {
    const res = await apiFetch(`civil/getCivilRecord/${encodeURIComponent(idNo)}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const body = await res.json().catch(() => null);
    const items = (body && body.items) || [];
    return items.length ? items[0] : null;
  }

  // يفكّ JSON بأمان حتى لو كانت الاستجابة غير نقية (مطابق لـ _safeDecode في Flutter)
  function safeDecode(text) {
    try {
      return JSON.parse(text);
    } catch (_) {
      const s = text.indexOf("{"), e = text.lastIndexOf("}");
      if (s !== -1 && e > s) {
        try { return JSON.parse(text.slice(s, e + 1)); } catch (_) {}
      }
      const sa = text.indexOf("["), ea = text.lastIndexOf("]");
      if (sa !== -1 && ea > sa) {
        try { return JSON.parse(text.slice(sa, ea + 1)); } catch (_) {}
      }
      return null;
    }
  }

  // يستخرج رسائل الأخطاء من استجابة السيرفر (مطابق لـ handleApiResponse في Flutter)
  function extractServerError(decoded, raw) {
    if (decoded == null) return raw || "استجابة فارغة من السيرفر";

    if (Array.isArray(decoded)) {
      const msgs = decoded.map(it =>
        (it && typeof it === "object" && it.message) ? String(it.message) : String(it)
      );
      return msgs.join("\n") || "خطأ غير معروف من السيرفر";
    }

    if (decoded && typeof decoded === "object") {
      if (Array.isArray(decoded.errors) && decoded.errors.length) {
        return decoded.errors
          .map(e => (e && typeof e === "object" && e.message) ? String(e.message) : String(e))
          .join("\n");
      }
      if (decoded.message) return String(decoded.message);
      if (decoded.text) return String(decoded.text);
    }

    return raw || "استجابة غير متوقعة من السيرفر";
  }

  // --- إضافة طالب جديد (نفس عقد addNewStudent في Flutter) ---
  // يُرجع رقم الطالب (studentno) الذي يصدره السيرفر، أو يرمي خطأ برسالة عربية.
  async function addNewStudent(payload) {
    const res = await apiFetch("addNewStudent", { method: "POST", body: payload });
    const raw = await res.text();
    const decoded = safeDecode(raw);

    let studentNo;
    if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
      studentNo = decoded.studentno;
      if (studentNo === undefined || studentNo === null) studentNo = decoded.studentNo;
      if (studentNo === undefined || studentNo === null) studentNo = decoded.STUDENTNO;
    }

    if (studentNo !== undefined && studentNo !== null && String(studentNo).trim() !== "") {
      const n = Number(studentNo);
      if (!Number.isNaN(n) && n > 0) return n;
    }

    throw new Error(extractServerError(decoded, raw));
  }

  /* ===================== طلبات الاختبار ===================== */

  // كل الثوابت من السيرفر (EXAM_TYPE، EXAM_PRAYER_TIME_CODE… غير موجودة في
  // STATIC_LOOKUP.json المحلي)
  async function getLookups() {
    const res = await apiFetch("getLookup");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const body = await res.json().catch(() => null);
    return (body && body.items) || [];
  }

  // إعدادات جلسة الاختبار الفعّالة للمستخدم:
  // can_set_exam_date / allow_add_test_location / session_places / session_id…
  async function getExamActiveSession(username = getUserName()) {
    const res = await apiFetch(`getExamActiveSession/${encodeURIComponent(username)}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const body = await res.json().catch(() => null);
    const items = (body && body.items) || [];
    return items.length ? items[0] : null;
  }

  // طلبات الاختبار الخاصة بالمستخدم
  async function getExamRequests(username = getUserName()) {
    const res = await apiFetch(`exam_request_dml?username=${encodeURIComponent(username)}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const body = await res.json().catch(() => null);
    return (body && body.items) || [];
  }

  // يفحص رد addNewExamRequest (نفس شرط Flutter: status = success)
  function readExamDmlResult(status, raw) {
    const decoded = safeDecode(raw);
    if (status >= 200 && status < 300 &&
        decoded && typeof decoded === "object" && !Array.isArray(decoded) &&
        String(decoded.status || "").toLowerCase() === "success") {
      return { ok: true, error: "", data: decoded };
    }
    return { ok: false, error: extractServerError(decoded, raw), data: null };
  }

  // ترشيح طالب للاختبار (إنشاء أو تعديل) — p_action = SAVE
  async function saveExamRequest(payload) {
    const res = await apiFetch("addNewExamRequest", {
      method: "POST",
      body: Object.assign({ p_action: "SAVE", created_by: getUserName() }, payload),
    });
    const raw = await res.text().catch(() => "");
    return readExamDmlResult(res.status, raw);
  }

  // حذف ترشيح — الإجراء يفحص student_no/part_from قبل التفرّع فنرسلها كاملة
  async function deleteExamRequest(req) {
    const res = await apiFetch("addNewExamRequest", {
      method: "POST",
      body: {
        p_action  : "DELETE",
        request_id: req.requestId,
        student_no: req.studentNo,
        exam_type : req.examType,
        part_from : req.partFrom || 1,
        part_to   : req.partTo   || 1,
        created_by: getUserName(),
      },
    });
    const raw = await res.text().catch(() => "");
    return readExamDmlResult(res.status, raw);
  }

  /* ===================== الدورات ومخطّطات التقييم ===================== */

  // نمط هذه الخدمات: السيرفر يردّ 200 حتى مع الخطأ ⇒ الحكم من الجسم (status)
  async function coursesPost(path, body) {
    const res = await apiFetch("Courses/" + path, { method: "POST", body: body });
    const raw = await res.text().catch(() => "");
    const decoded = safeDecode(raw);

    if (res.status === 404) {
      throw new Error("نقطة «Courses/" + path + "» غير مسجّلة على السيرفر.\n" +
                      "شغّل docs/ords_course_admin.sql أولاً.");
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("انتهت الجلسة أو لا صلاحية — أعد تسجيل الدخول");
    }
    if (res.status < 200 || res.status >= 300) {
      throw new Error(extractServerError(decoded, raw));
    }
    if (!decoded || typeof decoded !== "object") {
      throw new Error("استجابة غير مفهومة من السيرفر");
    }
    if (String(decoded.status || "").toLowerCase() !== "success") {
      throw new Error(extractServerError(decoded, raw));
    }
    return decoded;
  }

  async function coursesGet(path) {
    const res = await apiFetch("Courses/" + path);
    if (res.status === 404) {
      throw new Error("نقطة «Courses/" + path + "» غير موجودة على السيرفر");
    }
    if (!res.ok) throw new Error("HTTP " + res.status);
    const body = await res.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new Error("استجابة غير مفهومة من السيرفر");
    }
    return body;
  }

  // قائمة الدورات التي يحقّ للمستخدم الرصد فيها
  async function getCourses(username = getUserName()) {
    const body = await coursesGet("getCourses/" + encodeURIComponent(username));
    return body.courses || [];
  }

  // كشف دورة كامل: الطلبة + ما رُصد + العلامات — في نداء واحد
  function getCourseDetail(courseNo) {
    return coursesGet("getCourse/" + encodeURIComponent(courseNo));
  }

  // تصنيفات الدورات واللجان الفعّالة (لنموذج الإنشاء)
  function getCourseFormMeta(username = getUserName()) {
    return coursesGet("getCourseFormMeta/" + encodeURIComponent(username));
  }

  // إنشاء دورة — السيرفر يُصدر course_no ويشتقّ session_id بنفسه
  async function createCourse(payload) {
    const data = await coursesPost("createCourse", payload);
    const no = data.course_no;
    if (typeof no !== "number" && !(typeof no === "string" && no.trim() !== "")) {
      throw new Error("حُفظت الدورة ولم يُرجع السيرفر رقمها — حدّث القائمة");
    }
    return Number(no);
  }

  function updateCourse(payload) { return coursesPost("updateCourse", payload); }
  function deleteCourse(courseNo) { return coursesPost("deleteCourse", { course_no: courseNo }); }

  // تسجيل دفعة طلاب — ذرّية: تُقبل كلها أو تُرفض كلها
  function addCourseStudents(courseNo, idNos, registerDate) {
    return coursesPost("addStudents", {
      course_no: courseNo,
      register_date: registerDate,
      students: idNos.map(id => ({ id_no: id })),
    });
  }

  function removeCourseStudent(courseNo, idNo) {
    return coursesPost("removeStudent", { course_no: courseNo, id_no: idNo });
  }

  // رصد نتيجة. يُرجع { ok, rejected, error }:
  //   ok=true وصلت · rejected=true رفضٌ لن ينجح بالإعادة · وإلا عطب شبكة فتبقى بالطابور
  async function saveCourseResult(payload) {
    let res;
    try {
      res = await apiFetch("Courses/saveResult", { method: "POST", body: payload });
    } catch (_) {
      return { ok: false, rejected: false, error: "" };   // شبكة — يبقى في الطابور
    }

    if (res.status === 404) {
      return { ok: false, rejected: true,
               error: "نقطة Courses/saveResult غير مسجّلة على السيرفر" };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, rejected: true, error: "انتهت الجلسة أو لا صلاحية — أعد الدخول" };
    }
    if (res.status !== 200) return { ok: false, rejected: false, error: "" };

    const raw = await res.text().catch(() => "");
    const decoded = safeDecode(raw);
    if (!decoded || typeof decoded !== "object") {
      return { ok: false, rejected: false, error: "" };   // جسم غامض ⇒ أعد لاحقاً
    }
    if (String(decoded.status || "").toLowerCase() === "success") {
      return { ok: true, rejected: false, error: "" };
    }
    return { ok: false, rejected: true, error: extractServerError(decoded, raw) };
  }

  // مخطّطات التقييم: الرؤوس والبنود والفئات في حمولة واحدة
  async function getGradingSchemes() {
    const res = await apiFetch("Grading/getGradingSchemes");
    if (!res.ok) throw new Error("تعذّر جلب مخطّطات التقييم (رمز " + res.status + ")");
    return (await res.json().catch(() => null)) || {};
  }

  async function getGradingVersion() {
    try {
      const res = await apiFetch("Grading/getGradingVersion", { timeoutMs: 15000 });
      if (!res.ok) return null;
      const body = await res.json().catch(() => null);
      return body && body.version != null ? String(body.version) : null;
    } catch (_) { return null; }
  }

  function isOnline() {
    return navigator.onLine;
  }

  return {
    BASE,
    getDeviceId,
    getUserName,
    apiFetch,
    login,
    getEmployee,
    saveActivity,
    deleteActivity,
    buildSaveActivityBody,
    pullCircleActivity,
    pullStudents,
    getUserCircles,
    lookupCivilRecord,
    searchCivil,
    getUserAccess,
    addNewStudent,
    getLookups,
    getExamActiveSession,
    getExamRequests,
    saveExamRequest,
    deleteExamRequest,
    getCourses,
    getCourseDetail,
    getCourseFormMeta,
    createCourse,
    updateCourse,
    deleteCourse,
    addCourseStudents,
    removeCourseStudent,
    saveCourseResult,
    getGradingSchemes,
    getGradingVersion,
    isOnline,
  };
})();
