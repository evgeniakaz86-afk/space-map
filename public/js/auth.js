async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'error');
  return data;
}

async function loginUI() {
  const form = document.getElementById('loginForm');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('err');
    err.textContent = '';
    try {
      await post('/api/login', { login: l.value.trim(), pass: p.value });
      location.href = 'editor.html';
    } catch {
      err.textContent = 'Неверный логин или пароль';
    }
  });
}

async function logout() {
  await post('/api/logout');
  location.href = 'index.html';
}

async function guardEditor() {
  if (!document.getElementById('work')) return;
  try {
    const r = await fetch('/api/me');
    if (!r.ok) throw new Error();
    document.getElementById('work').hidden = false;
  } catch {
    location.href = 'login.html';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loginUI();
  guardEditor();
});