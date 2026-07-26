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

  // --- رفع سجل نشاط واحد (نفس عقد /students الحالي + توثيق بالترويسة) ---
  // نُبقي device_id_field في الـ body للتوافق مع الإجراء الحالي، ونضيف X-Device-Id.
  async function uploadRecord(record) {
    return apiFetch("students", {
      method: "POST",
      body: { ...record, device_id_field: getDeviceId() },
    });
  }

  // --- سحب أنشطة الحلقة (circleActivity/{user}) ---
  async function pullCircleActivity(username = getUserName()) {
    const res = await apiFetch(`circleActivity/${encodeURIComponent(username)}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json(); // { items: [...] }
  }

  // --- سحب قائمة طلاب الحلقة (students?puserName=) ---
  async function pullStudents(username = getUserName()) {
    const res = await apiFetch(
      `students?puserName=${encodeURIComponent(username)}`
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json(); // { items: [...] }
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
    uploadRecord,
    pullCircleActivity,
    pullStudents,
    lookupCivilRecord,
    addNewStudent,
    isOnline,
  };
})();
