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
    isOnline,
  };
})();
