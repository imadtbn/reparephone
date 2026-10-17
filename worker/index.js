const SESSION_DAYS = 30;
// Cloudflare Workers Web Crypto rejects PBKDF2 calls above 100,000 iterations.
const PASSWORD_ITERATIONS = 100000;
const MAX_BODY = 1024 * 1024;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers } });
}
function cors(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "https://imadtbn.github.io,http://localhost:8000,http://127.0.0.1:8000").split(",").map(x => x.trim());
  const headers = { "vary": "Origin", "access-control-allow-methods": "GET,POST,PUT,OPTIONS", "access-control-allow-headers": "Content-Type,Authorization,X-Admin-Key", "access-control-max-age": "86400" };
  if (allowed.includes(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}
function response(request, env, data, status = 200) { return json(data, status, cors(request, env)); }
const now = () => new Date().toISOString();
const normalizeUser = v => String(v || "").trim().replace(/\s+/g, " ").toLowerCase();
const clean = v => String(v || "").trim();
function randomBytes(n = 32) { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
function b64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function unb64(s) { return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0)); }
async function digest(text) { return b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))); }
async function passwordHash(password, salt = b64(randomBytes(16))) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(salt), iterations: PASSWORD_ITERATIONS }, key, 256);
  return { salt, hash: b64(bits) };
}
async function safeEqual(a, b) {
  const aa = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(a || "")));
  const bb = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(b || "")));
  const x = new Uint8Array(aa), y = new Uint8Array(bb); let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
async function body(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY) throw new Error("BODY_TOO_LARGE");
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new Error("BODY_TOO_LARGE");
  try { return JSON.parse(raw || "{}"); } catch { throw new Error("INVALID_JSON"); }
}
function publicWorkshop(row) {
  return { id: row.id, username: row.username, name: row.name, phone: row.phone || "", address: row.address || "", subscriptionStatus: row.subscription_status, subscriptionExpiresAt: row.subscription_expires_at || null, mustChangePassword: Boolean(row.must_change_password), createdAt: row.created_at };
}
async function getSession(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token.length < 32 || token.length > 256) return null;
  const hash = await digest(token);
  return env.DB.prepare("SELECT s.id AS session_id,s.expires_at AS session_expires,w.* FROM sessions s JOIN workshops w ON w.id=s.workshop_id WHERE s.token_hash=? AND s.expires_at>? AND w.status='active'").bind(hash, now()).first();
}
function subscriptionActive(row) {
  return row.subscription_status === "active" && row.status === "active" && row.subscription_expires_at && row.subscription_expires_at > now();
}
async function issueSession(request, env, workshop) {
  const token = b64(randomBytes(32));
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await env.DB.prepare("INSERT INTO sessions(id,workshop_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(), workshop.id, await digest(token), expires, now()).run();
  return { token, expiresAt: expires, workshop: publicWorkshop(workshop) };
}
async function audit(env, workshopId, action, detail = "") {
  await env.DB.prepare("INSERT INTO audit_log(id,workshop_id,action,detail,created_at) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(), workshopId || null, action, String(detail).slice(0, 300), now()).run();
}
async function handle(request, env) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request, env) });
  if (!path.startsWith("/api/")) return env.ASSETS ? env.ASSETS.fetch(request) : response(request, env, { error: "Not found" }, 404);
  if (!["GET", "POST", "PUT", "OPTIONS"].includes(method)) return response(request, env, { error: "Method not allowed" }, 405);
  try {
    if (path === "/api/health" && method === "GET") {
      await env.DB.prepare("SELECT 1 AS ok").first();
      return response(request, env, { ok: true, service: "warsha-api", database: "connected", time: now() });
    }
    if (path === "/api/auth/register" && method === "POST") {
      const input = await body(request), username = normalizeUser(input.username), password = String(input.password || ""), name = clean(input.workshopName), phone = clean(input.phone), ownerName = clean(input.ownerName);
      if (username.length < 3 || username.length > 30 || !/^[\p{L}\p{N}._ -]+$/u.test(username)) return response(request, env, { error: "اسم المستخدم يجب أن يكون بين 3 و30 حرفًا أو رقمًا، ويمكن استخدام المسافات والنقطة والشرطة." }, 400);
      if (password.length < 10 || password.length > 128) return response(request, env, { error: "كلمة المرور يجب أن تكون 10 أحرف على الأقل." }, 400);
      if (name.length < 2 || name.length > 120 || ownerName.length < 2 || ownerName.length > 100) return response(request, env, { error: "أدخل اسم الورشة واسم المسؤول بشكل صحيح." }, 400);
      if (phone.length > 40) return response(request, env, { error: "رقم الهاتف طويل جدًا." }, 400);
      const exists = await env.DB.prepare("SELECT id FROM workshops WHERE username=?").bind(username).first();
      if (exists) return response(request, env, { error: "اسم المستخدم مستخدم بالفعل." }, 409);
      const { salt, hash } = await passwordHash(password), id = crypto.randomUUID(), stamp = now();
      const initialData = JSON.stringify({ version: 1, settings: { name, phone, address: "" }, customers: [], repairs: [], inventory: [], suppliers: [], orders: [], expenses: [], movements: [], updatedAt: stamp });
      // D1 batch runs these inserts transactionally so a failed registration cannot leave a partial workshop.
      await env.DB.batch([
        env.DB.prepare("INSERT INTO workshops(id,username,password_salt,password_hash,name,owner_name,phone,address,status,subscription_status,subscription_expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'','active','pending',NULL,?,?)").bind(id, username, salt, hash, name, ownerName, phone, stamp, stamp),
        env.DB.prepare("INSERT INTO workspace_data(workshop_id,data_json,revision,updated_at) VALUES(?,?,1,?)").bind(id, initialData, stamp),
        env.DB.prepare("INSERT INTO audit_log(id,workshop_id,action,detail,created_at) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(), id, "workshop.registered", "طلب اشتراك جديد", stamp)
      ]);
      const row = await env.DB.prepare("SELECT * FROM workshops WHERE id=?").bind(id).first();
      return response(request, env, { ok: true, message: "تم إنشاء الحساب. ينتظر تفعيل الاشتراك من إدارة المنصة.", workshop: publicWorkshop(row) }, 201);
    }
    if (path === "/api/auth/login" && method === "POST") {
      const input = await body(request), username = normalizeUser(input.username), password = String(input.password || "");
      if (!username || !password || username.length > 80 || password.length > 128) return response(request, env, { error: "اسم المستخدم أو كلمة المرور غير صحيحة." }, 400);
      const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='auth.login_failed' AND detail=? AND created_at>?").bind(username, new Date(Date.now() - 15 * 60 * 1000).toISOString()).first();
      if ((recent?.n || 0) >= 8) return response(request, env, { error: "محاولات كثيرة. انتظر 15 دقيقة ثم حاول مجددًا." }, 429);
      const row = await env.DB.prepare("SELECT * FROM workshops WHERE username=?").bind(username).first();
      const storedSalt = row?.password_salt || b64(randomBytes(16));
      const result = await passwordHash(password, storedSalt);
      if (!row || !(await safeEqual(result.hash, row.password_hash))) {
        await audit(env, null, "auth.login_failed", username);
        return response(request, env, { error: "اسم المستخدم أو كلمة المرور غير صحيحة." }, 401);
      }
      if (row.status !== "active") return response(request, env, { error: "هذا الحساب موقوف. تواصل مع إدارة المنصة." }, 403);
      const session = await issueSession(request, env, row);
      await audit(env, row.id, "auth.login", "تم تسجيل الدخول");
      return response(request, env, { ok: true, ...session });
    }
    if (path === "/api/auth/recovery-request" && method === "POST") {
      const input = await body(request);
      const username = normalizeUser(input.username);
      const contactPhone = clean(input.phone).slice(0, 40);
      if (username.length < 3 || username.length > 80 || contactPhone.length < 3) {
        return response(request, env, { error: "أدخل اسم المستخدم ورقم هاتف للتواصل بشكل صحيح." }, 400);
      }
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM password_recovery_requests WHERE username=? AND created_at>?").bind(username, since).first();
      if ((recent?.n || 0) >= 3) return response(request, env, { error: "تم استلام طلبات كثيرة لهذا الاسم. حاول بعد 15 دقيقة." }, 429);
      const workshop = await env.DB.prepare("SELECT id FROM workshops WHERE username=?").bind(username).first();
      await env.DB.prepare("INSERT INTO password_recovery_requests(id,workshop_id,username,contact_phone,status,created_at) VALUES(?,?,?,?, 'pending', ?)").bind(crypto.randomUUID(), workshop?.id || null, username, contactPhone, now()).run();
      await audit(env, workshop?.id || null, "auth.recovery_requested", username);
      return response(request, env, { ok: true, message: "إذا تطابق اسم المستخدم مع حساب مسجل، فسيظهر الطلب لدى إدارة المنصة بعد التحقق. تواصل مع الإدارة عبر قناة الدعم المعتادة لتأكيد هويتك واستلام كلمة مرور مؤقتة." });
    }
    if (path === "/api/auth/change-password" && method === "POST") {
      const row = await getSession(request, env);
      if (!row) return response(request, env, { error: "انتهت الجلسة. سجّل الدخول مجددًا." }, 401);
      const input = await body(request);
      const currentPassword = String(input.currentPassword || "");
      const newPassword = String(input.newPassword || "");
      if (currentPassword.length < 1 || currentPassword.length > 128 || newPassword.length < 10 || newPassword.length > 128) {
        return response(request, env, { error: "أدخل كلمة المرور الحالية، واجعل الجديدة 10 أحرف على الأقل." }, 400);
      }
      const currentHash = await passwordHash(currentPassword, row.password_salt);
      if (!(await safeEqual(currentHash.hash, row.password_hash))) return response(request, env, { error: "كلمة المرور الحالية غير صحيحة." }, 401);
      const next = await passwordHash(newPassword);
      const stamp = now();
      await env.DB.prepare("UPDATE workshops SET password_salt=?,password_hash=?,must_change_password=0,updated_at=? WHERE id=?").bind(next.salt, next.hash, stamp, row.id).run();
      await env.DB.prepare("DELETE FROM sessions WHERE workshop_id=?").bind(row.id).run();
      const updatedWorkshop = await env.DB.prepare("SELECT * FROM workshops WHERE id=?").bind(row.id).first();
      const session = await issueSession(request, env, updatedWorkshop);
      await audit(env, row.id, "auth.password_changed", "تغيير كلمة المرور");
      return response(request, env, { ok: true, ...session, message: "تم تغيير كلمة المرور بنجاح." });
    }
    if (path === "/api/auth/logout" && method === "POST") {
      const auth = request.headers.get("Authorization") || "", token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
      if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await digest(token)).run();
      return response(request, env, { ok: true });
    }
    if (path === "/api/auth/me" && method === "GET") {
      const row = await getSession(request, env);
      if (!row) return response(request, env, { error: "يلزم تسجيل الدخول مجددًا." }, 401);
      return response(request, env, { workshop: publicWorkshop(row), subscriptionActive: subscriptionActive(row) });
    }
    if (path === "/api/workspace" && (method === "GET" || method === "PUT")) {
      const row = await getSession(request, env);
      if (!row) return response(request, env, { error: "انتهت الجلسة؛ سجل الدخول مجددًا." }, 401);
      if (!subscriptionActive(row)) return response(request, env, { error: "اشتراك الورشة غير فعال. تواصل مع الإدارة لتفعيله أو تجديده.", subscriptionStatus: row.subscription_status, expiresAt: row.subscription_expires_at || null }, 402);
      if (method === "GET") {
        const data = await env.DB.prepare("SELECT data_json,revision,updated_at FROM workspace_data WHERE workshop_id=?").bind(row.id).first();
        return response(request, env, { data: JSON.parse(data?.data_json || "{}"), revision: data?.revision || 1, updatedAt: data?.updated_at || null });
      }
      const input = await body(request), data = input.data;
      if (!data || data.version !== 1 || !data.settings || typeof data.settings.name !== "string" || !Array.isArray(data.customers) || !Array.isArray(data.repairs) || !Array.isArray(data.inventory) || !Array.isArray(data.suppliers) || !Array.isArray(data.orders) || !Array.isArray(data.expenses) || !Array.isArray(data.movements)) return response(request, env, { error: "بيانات مساحة العمل غير صالحة." }, 400);
      if (JSON.stringify(data).length > 900000) return response(request, env, { error: "حجم البيانات أكبر من الحد المسموح." }, 413);
      const stamp = now();
      await env.DB.prepare("INSERT INTO workspace_data(workshop_id,data_json,revision,updated_at) VALUES(?,?,1,?) ON CONFLICT(workshop_id) DO UPDATE SET data_json=excluded.data_json,revision=workspace_data.revision+1,updated_at=excluded.updated_at").bind(row.id, JSON.stringify(data), stamp).run();
      await env.DB.prepare("UPDATE workshops SET name=?,phone=?,address=?,updated_at=? WHERE id=?").bind(clean(data.settings.name).slice(0,120), clean(data.settings.phone).slice(0,40), clean(data.settings.address).slice(0,200), stamp, row.id).run();
      return response(request, env, { ok: true, updatedAt: stamp });
    }
    if (path.startsWith("/api/admin/")) {
      if (!env.ADMIN_KEY) return response(request, env, { error: "إعداد مفتاح الإدارة غير مكتمل." }, 503);
      if (!(await safeEqual(request.headers.get("X-Admin-Key"), env.ADMIN_KEY))) return response(request, env, { error: "غير مصرح." }, 401);
      if (path === "/api/admin/workshops" && method === "GET") {
        const { results } = await env.DB.prepare("SELECT id,username,name,owner_name,phone,status,subscription_status,subscription_expires_at,created_at FROM workshops ORDER BY created_at DESC LIMIT 500").all();
        return response(request, env, { workshops: results });
      }
      if (path === "/api/admin/recovery-requests" && method === "GET") {
        const { results } = await env.DB.prepare("SELECT r.id,r.username,r.contact_phone,r.created_at,r.status,w.id AS resolved_workshop_id,w.name AS workshop_name,w.owner_name,w.phone AS registered_phone FROM password_recovery_requests r LEFT JOIN workshops w ON w.id=r.workshop_id WHERE r.status='pending' ORDER BY r.created_at DESC LIMIT 200").all();
        return response(request, env, { requests: results });
      }
      const recoveryMatch = path.match(/^\/api\/admin\/recovery-requests\/([0-9a-f-]+)\/reset$/i);
      if (recoveryMatch && method === "POST") {
        const requestId = recoveryMatch[1];
        const recovery = await env.DB.prepare("SELECT id,workshop_id,status FROM password_recovery_requests WHERE id=?").bind(requestId).first();
        if (!recovery || recovery.status !== "pending") return response(request, env, { error: "طلب الاستعادة غير موجود أو تمت معالجته." }, 404);
        if (!recovery.workshop_id) return response(request, env, { error: "لم يُعثر على حساب مطابق لاسم المستخدم. تحقق من الاسم مع صاحب الطلب قبل المتابعة." }, 409);
        const workshop = await env.DB.prepare("SELECT id,username FROM workshops WHERE id=?").bind(recovery.workshop_id).first();
        if (!workshop) return response(request, env, { error: "حساب الورشة غير موجود." }, 404);
        const temporaryPassword = b64(randomBytes(18));
        const { salt, hash } = await passwordHash(temporaryPassword);
        await env.DB.prepare("UPDATE workshops SET password_salt=?,password_hash=?,must_change_password=1,updated_at=? WHERE id=?").bind(salt, hash, now(), workshop.id).run();
        await env.DB.prepare("DELETE FROM sessions WHERE workshop_id=?").bind(workshop.id).run();
        await env.DB.prepare("UPDATE password_recovery_requests SET status='resolved',resolved_at=? WHERE workshop_id=? AND status='pending'").bind(now(), workshop.id).run();
        await audit(env, workshop.id, "auth.password_reset", "إعادة تعيين إدارية بعد التحقق من الهوية");
        return response(request, env, { ok: true, username: workshop.username, temporaryPassword, message: "تم تغيير كلمة المرور وإبطال الجلسات السابقة. سلّم كلمة المرور المؤقتة لصاحب الورشة بعد التحقق من هويته عبر قناة منفصلة." });
      }
      const match = path.match(/^\/api\/admin\/workshops\/([0-9a-f-]+)\/subscription$/i);
      if (match && method === "POST") {
        const input = await body(request), status = clean(input.status), days = Number(input.days || 30);
        if (!["active", "pending", "expired", "suspended"].includes(status) || !Number.isInteger(days) || days < 1 || days > 730) return response(request, env, { error: "حالة الاشتراك أو مدته غير صالحة." }, 400);
        const id = match[1], expiry = status === "active" ? new Date(Date.now() + days * 86400000).toISOString() : null;
        const result = await env.DB.prepare("UPDATE workshops SET subscription_status=?,subscription_expires_at=?,updated_at=? WHERE id=?").bind(status, expiry, now(), id).run();
        if (!result.meta.changes) return response(request, env, { error: "الورشة غير موجودة." }, 404);
        await audit(env, id, "subscription.changed", status + (expiry ? " until " + expiry : ""));
        return response(request, env, { ok: true, subscriptionStatus: status, expiresAt: expiry });
      }
      return response(request, env, { error: "مسار الإدارة غير موجود." }, 404);
    }
    return response(request, env, { error: "المسار غير موجود." }, 404);
  } catch (error) {
    console.error("reparephone API error", {
      path: new URL(request.url).pathname,
      message: String(error?.message || error),
      stack: String(error?.stack || "").slice(0, 1200)
    });
    const errorText = String(error?.message || error);
    if (/UNIQUE constraint failed:\s*workshops\.username/i.test(errorText)) return response(request, env, { error: "اسم المستخدم مستخدم بالفعل. اختر اسمًا آخر." }, 409);
    const message = error?.message === "BODY_TOO_LARGE" ? "حجم الطلب أكبر من الحد المسموح." : error?.message === "INVALID_JSON" ? "صيغة JSON غير صالحة." : "حدث خطأ داخلي. تحقق من إعداد قاعدة البيانات وسجلات الخادم.";
    return response(request, env, { error: message }, error?.message === "BODY_TOO_LARGE" ? 413 : error?.message === "INVALID_JSON" ? 400 : 500);
  }
}
export default { fetch: handle };
