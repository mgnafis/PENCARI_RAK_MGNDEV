export async function postSearch(codes) {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codes }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
