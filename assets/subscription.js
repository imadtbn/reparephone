'use strict';
const API_BASE = String(window.WARSHA_API_BASE || '').replace(/\/$/, ''), KEY = 'warsha-session-token';
const $ = s => document.querySelector(s);
async function check() {
  const token = localStorage.getItem(KEY);
  if (!token) { location.href = 'login.html'; return; }
  if (!API_BASE) { $('#status-message').textContent = 'لم يتم إعداد عنوان الخادم بعد.'; return; }
  try {
    const r = await fetch(API_BASE + '/api/auth/me', { headers: { authorization: 'Bearer ' + token } });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'تعذر التحقق من الحساب.');
    const w = data.workshop;
    $('#status-message').textContent = 'الورشة: ' + w.name + ' — اسم المستخدم: ' + w.username + '. حالة الاشتراك: ' + ({pending:'بانتظار التفعيل',active:'فعال',expired:'منتهٍ',suspended:'موقوف'}[w.subscriptionStatus] || w.subscriptionStatus) + (w.subscriptionExpiresAt ? '، ينتهي في ' + new Date(w.subscriptionExpiresAt).toLocaleDateString('ar-DZ') : '');
    if (data.subscriptionActive) location.href = 'index.html';
  } catch (e) { $('#status-message').textContent = e.message; if (e.message.includes('تسجيل الدخول')) { localStorage.removeItem(KEY); location.href = 'login.html'; } }
}
$('#refresh').addEventListener('click', check);
$('#logout').addEventListener('click', async () => { const token = localStorage.getItem(KEY); if (API_BASE && token) await fetch(API_BASE + '/api/auth/logout', { method: 'POST', headers: { authorization: 'Bearer ' + token } }).catch(() => {}); localStorage.removeItem(KEY); location.href = 'login.html'; });
check();
