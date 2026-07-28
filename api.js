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

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(`${BASE}/${path}`, {
        method,
        headers,
        body: payload,
        signal: ctrl.signal,
      });
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
  async function getEmployee(idno) {
    const res = await apiFetch(`employees/${encodeURIComponent(idno)}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
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

    return {
      action          : "SAVE",   // السيرفر يميّز الإضافة من التعديل عبر tagno
      user_name       : String(record.teacher || getUserName()),
      student_no      : String(record.student),
      attendance_type : String(type),
      activity_date   : String(record.date),
      from_aya_no     : String(num(from) ?? 0),
      to_aya_no       : String(num(to) ?? 0),
      num_errors      : String(num(record.errors) ?? 0),
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
        const tagNo = decoded.tagno ?? decoded.tagNo ?? null;
        const pages = decoded.numPages ?? decoded.numpages ?? null;
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

  // --- حلقات المستخدم (نفس عقد UserCirclesService في Flutter) ---
  // getUserCircles?username=X → { items: [{ circle_no, circle_name, center_no,
  //                                         center_name, gender, circle_days, emp_role }] }
  async function getUserCircles(username = getUserName()) {
    const res = await apiFetch(`getUserCircles?username=${encodeURIComponent(username)}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const body = await res.json().catch(() => null);
    return (body && body.items) || [];
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

    const studentNo =
      decoded && typeof decoded === "object" && !Array.isArray(decoded)
        ? decoded.studentno ?? decoded.studentNo ?? decoded.STUDENTNO
        : undefined;

    if (studentNo !== undefined && studentNo !== null && String(studentNo).trim() !== "") {
      const n = Number(studentNo);
      if (!Number.isNaN(n) && n > 0) return n;
    }

    throw new Error(extractServerError(decoded, raw));
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
    buildSaveActivityBody,
    pullCircleActivity,
    pullStudents,
    getUserCircles,
    lookupCivilRecord,
    addNewStudent,
    isOnline,
  };
})();
