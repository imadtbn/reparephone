'use strict';
const API_BASE = String(window.WARSHA_API_BASE || '').replace(/\/$/, '');
const $ = s => document.querySelector(s);
const form = $('#recovery-form');
function show(text, kind = 'error') {
  const el = $('#message');
  el.textContent = text;
  el.className = 'message show ' + kind;
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button[type=submit]');
  const values = Object.fromEntries(new FormData(form));
  values.username = String(values.username || '').trim().replace(/\\s+/g, ' ');
  values.phone = String(values.phone || '').trim();
  if (!API_BASE) { show('تعذر الاتصال بالخادم. راجع إعداد عنوان Cloudflare Worker.'); return; }
  button.disabled = true;
  show('جارٍ إرسال الطلب…', 'success');
  try {
    const response = await fetch(API_BASE + '/api/auth/recovery-request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'تعذر إرسال الطلب.');
    show(data.message || 'تم إرسال الطلب.', 'success');
    form.reset();
  } catch (error) {
    show(error.message || 'تعذر الاتصال بالخادم.');
  } finally {
    button.disabled = false;
  }
});
