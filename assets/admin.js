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
$('#admin-login').addEventListener('submit', async e => { e.preventDefault(); sessionStorage.setItem(KEY, new FormData(e.currentTarget).get('key')); await load(); if (!$('#message').textContent) message('تم الاتصال بلوحة الإدارة.', 'success'); });
$('#clear-key').addEventListener('click', () => { sessionStorage.removeItem(KEY); $('#workshops').textContent = 'أدخل مفتاح الإدارة لعرض الحسابات.'; message('تم مسح المفتاح من جلسة المتصفح.', 'success'); });
$('#reload').addEventListener('click', load);
document.addEventListener('submit', async e => { const form = e.target.closest('.activate'); if (!form) return; e.preventDefault(); const v = Object.fromEntries(new FormData(form)); const button = form.querySelector('button'); button.disabled = true; try { await call('/api/admin/workshops/' + encodeURIComponent(form.dataset.id) + '/subscription', { method: 'POST', body: JSON.stringify({ status: v.status, days: Number(v.days) }) }); message('تم تحديث الاشتراك.', 'success'); await load(); } catch (err) { message(err.message); } finally { button.disabled = false; } });
