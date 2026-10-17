'use strict';
const API_BASE = String(window.WARSHA_API_BASE || '').replace(/\/$/, ''), KEY = 'warsha-admin-key';
const $ = s => document.querySelector(s);
function message(text, kind = 'error') { $('#message').textContent = text; $('#message').className = 'message show ' + kind; }
async function call(path, options = {}) {
  if (!API_BASE) throw new Error('اضبط عنوان Cloudflare Worker في assets/cloud-config.js.');
  const key = sessionStorage.getItem(KEY);
  const r = await fetch(API_BASE + path, { ...options, headers: { 'content-type': 'application/json', 'x-admin-key': key || '', ...(options.headers || {}) } });
  const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || 'تعذر تنفيذ الطلب.'); return data;
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function load() {
  try {
    const data = await call('/api/admin/workshops');
    $('#workshops').innerHTML = data.workshops.length ? '<div style="overflow:auto"><table><thead><tr><th>الورشة</th><th>المستخدم</th><th>الهاتف</th><th>الاشتراك</th><th>الصلاحية</th><th>الإجراء</th></tr></thead><tbody>' + data.workshops.map(w => '<tr><td>' + esc(w.name) + '<small style="display:block;color:#74847f">' + esc(w.owner_name) + '</small></td><td>' + esc(w.username) + '</td><td>' + esc(w.phone) + '</td><td>' + esc(w.subscription_status) + '</td><td>' + (w.subscription_expires_at ? esc(new Date(w.subscription_expires_at).toLocaleDateString('ar-DZ')) : '—') + '</td><td><form class="admin-form activate" data-id="' + esc(w.id) + '"><select name="status"><option value="active">تفعيل</option><option value="pending">بانتظار</option><option value="expired">منتهٍ</option><option value="suspended">تعليق</option></select><input name="days" type="number" min="1" max="730" value="30" aria-label="مدة الاشتراك بالأيام"><button class="primary">حفظ</button></form></td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">لا توجد ورش مسجلة.</p>';
  } catch (e) { message(e.message); }
}
async function loadRecovery() {
  try {
    const data = await call('/api/admin/recovery-requests');
    $('#recovery-requests').innerHTML = data.requests.length ? '<div style="overflow:auto"><table><thead><tr><th>اسم المستخدم</th><th>الهاتف المُدخل</th><th>بيانات الحساب المطابق</th><th>تاريخ الطلب</th><th>الإجراء</th></tr></thead><tbody>' + data.requests.map(r => '<tr><td>' + esc(r.username) + '</td><td>' + esc(r.contact_phone) + '</td><td>' + (r.resolved_workshop_id ? esc(r.workshop_name || '') + '<small style="display:block;color:#74847f">' + esc(r.owner_name || '') + ' · الهاتف المسجل: ' + esc(r.registered_phone || '—') + '</small>' : '<span>لا يوجد حساب مطابق للاسم</span>') + '</td><td>' + esc(new Date(r.created_at).toLocaleString('ar-DZ')) + '</td><td>' + (r.resolved_workshop_id ? '<button type="button" class="primary reset-password" data-id="' + esc(r.id) + '">إنشاء كلمة مؤقتة</button>' : 'تحقق من اسم المستخدم') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">لا توجد طلبات استعادة معلقة.</p>';
  } catch (e) { $('#recovery-requests').textContent = e.message; }
}
$('#admin-login').addEventListener('submit', async e => { e.preventDefault(); sessionStorage.setItem(KEY, new FormData(e.currentTarget).get('key')); await load(); await loadRecovery(); if (!$('#message').textContent) message('تم الاتصال بلوحة الإدارة.', 'success'); });
$('#clear-key').addEventListener('click', () => { sessionStorage.removeItem(KEY); $('#workshops').textContent = 'أدخل مفتاح الإدارة لعرض الحسابات.'; message('تم مسح المفتاح من جلسة المتصفح.', 'success'); });
$('#reload').addEventListener('click', load);\n$('#reload-recovery').addEventListener('click', loadRecovery);
document.addEventListener('submit', async e => { const form = e.target.closest('.activate'); if (!form) return; e.preventDefault(); const v = Object.fromEntries(new FormData(form)); const button = form.querySelector('button'); button.disabled = true; try { await call('/api/admin/workshops/' + encodeURIComponent(form.dataset.id) + '/subscription', { method: 'POST', body: JSON.stringify({ status: v.status, days: Number(v.days) }) }); message('تم تحديث الاشتراك.', 'success'); await load(); } catch (err) { message(err.message); } finally { button.disabled = false; } });
document.addEventListener('click', async e => {
  const button = e.target.closest('.reset-password');
  if (!button) return;
  if (!confirm('لا تتابع إلا بعد التحقق من هوية صاحب الورشة عبر قناة منفصلة. سيتم تغيير كلمة المرور وإبطال جميع الجلسات الحالية. هل تريد المتابعة؟')) return;
  button.disabled = true;
  try {
    const data = await call('/api/admin/recovery-requests/' + encodeURIComponent(button.dataset.id) + '/reset', { method: 'POST', body: '{}' });
    const result = $('#recovery-result');
    result.hidden = false;
    result.innerHTML = '<strong>كلمة المرور المؤقتة لحساب ' + esc(data.username) + ':</strong><p><code dir="ltr" style="overflow-wrap:anywhere;user-select:all">' + esc(data.temporaryPassword) + '</code></p><p>' + esc(data.message) + '</p><button type="button" class="secondary" id="copy-temp-password"><i class="fa-solid fa-copy" aria-hidden="true"></i> نسخ كلمة المرور</button>';
    result.dataset.password = data.temporaryPassword;
    message('تمت إعادة تعيين كلمة المرور. انسخها وسلّمها لصاحب الحساب بعد التحقق من هويته.', 'success');
    await loadRecovery();
    await load();
  } catch (error) { message(error.message); }
  finally { button.disabled = false; }
});
document.addEventListener('click', async e => {
  if (e.target.closest('#copy-temp-password')) {
    const password = $('#recovery-result').dataset.password || '';
    try { await navigator.clipboard.writeText(password); message('تم نسخ كلمة المرور المؤقتة.', 'success'); }
    catch { message('تعذر النسخ التلقائي؛ حدد كلمة المرور الظاهرة وانسخها يدويًا.', 'error'); }
  }
});
