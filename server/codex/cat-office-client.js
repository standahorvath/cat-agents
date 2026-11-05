function localUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new TypeError('Cat Office URL must use loopback HTTP');
  }
  return url;
}

export async function publishSnapshot(sessions, { url, token, timeoutMs = 1000 }) {
  if (typeof token !== 'string' || !token) throw new TypeError('A local token is required');
  const target = localUrl(url);
  const response = await fetch(target, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ schemaVersion: 1, sessions }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Cat Office rejected snapshot: HTTP ${response.status}`);
}
