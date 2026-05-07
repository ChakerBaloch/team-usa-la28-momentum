const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

async function requestJson(path, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.error || 'Request failed.');
  }

  return response.json();
}

export function fetchSports() {
  return requestJson('/sports');
}

export function analyzeSport(sportId) {
  return requestJson('/analyze', {
    method: 'POST',
    body: JSON.stringify({ sportId }),
  });
}
