export async function login(username, password) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Login failed');
  return data;
}

export async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
}

export async function getMe() {
  const res = await fetch('/api/me');
  if (res.status === 401) return null;
  return res.json();
}
