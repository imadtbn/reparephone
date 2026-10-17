'use strict';
const API_BASE = String(window.WARSHA_API_BASE || '').replace(/\/$/, '');
const TOKEN_KEY = 'warsha-session-token';
const $ = s => document.querySelector(s);
function show(message, kind = 'error') { const el = $('#message'); if (!el) return; el.textContent = message; el.className = 'message show ' + kind; }
async function api(path, options = {}) {
  if (!API_BASE) throw new Error('لم يُضبط عنوان Cloudflare Worker بعد. راجع assets/cloud-config.js بعد نشر الخادم.');
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(API_BASE + path, { ...options, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'تعذر إتمام الطلب.');
  return data;
}
const login = $('#login-form');
if (login) login.addEventListener('submit', async e => {
  e.preventDefault(); const button = login.querySelector('button[type=submit]'); button.disabled = true; show('جارٍ التحقق…', 'success');
  try { const values = Object.fromEntries(new FormData(login)); const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(values) }); localStorage.setItem(TOKEN_KEY, data.token); location.href = data.workshop.subscriptionStatus === 'active' ? 'index.html' : 'subscription.html'; }
  catch (error) { show(error.message); } finally { button.disabled = false; }
});
const register = $('#register-form');
if (register) register.addEventListener('submit', async e => {
  e.preventDefault(); const values = Object.fromEntries(new FormData(register));
  values.username = String(values.username || '').trim().replace(/\s+/g, ' ');
  if (values.username.length < 3 || values.username.length > 30) { show('اسم المستخدم يجب أن يكون بين 3 و30 حرفًا.'); return; }
  if (values.password !== values.confirmPassword) { show('كلمتا المرور غير متطابقتين.'); return; }
  const button = register.querySelector('button[type=submit]'); button.disabled = true; show('جارٍ إنشاء الحساب…', 'success');
  try { const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(values) }); show(data.message, 'success'); register.reset(); }
  catch (error) { show(error.message); } finally { button.disabled = false; }
});
