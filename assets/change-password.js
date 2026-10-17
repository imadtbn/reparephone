'use strict';
const API_BASE = String(window.WARSHA_API_BASE || '').replace(/\/$/, '');
const TOKEN_KEY = 'warsha-session-token';
const $ = s => document.querySelector(s);
const form = $('#change-password-form');
const params = new URLSearchParams(location.search);
if (params.get('required') === '1') $('#intro').textContent = 'لأمان حسابك، يجب تغيير كلمة المرور المؤقتة قبل متابعة العمل.';
function show(text, kind = 'error') {
  const el = $('#message');
  el.textContent = text;
  el.className = 'message show ' + kind;
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  if (values.newPassword !== values.confirmPassword) {
    show('كلمتا المرور الجديدتان غير متطابقتين.');
    return;
  }
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    show('انتهت الجلسة. سجّل الدخول بكلمة المرور الحالية أو المؤقتة أولًا.');
    return;
  }
  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  show('جارٍ تحديث كلمة المرور…', 'success');
  try {
    const response = await fetch(API_BASE + '/api/auth/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'تعذر تغيير كلمة المرور.');
    localStorage.setItem(TOKEN_KEY, data.token);
    show('تم تغيير كلمة المرور. جارٍ فتح مساحة العمل…', 'success');
    setTimeout(() => { location.href = data.workshop.subscriptionStatus === 'active' ? 'index.html' : 'subscription.html'; }, 700);
  } catch (error) {
    show(error.message || 'تعذر الاتصال بالخادم.');
  } finally {
    button.disabled = false;
  }
});
