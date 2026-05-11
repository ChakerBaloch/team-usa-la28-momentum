const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

function extractErrorMessage(errorPayload) {
  if (!errorPayload) {
    return 'Request failed.';
  }

  if (typeof errorPayload === 'string') {
    return errorPayload;
  }

  if (typeof errorPayload.error === 'string') {
    return errorPayload.error;
  }

  if (typeof errorPayload.error?.message === 'string') {
    return errorPayload.error.message;
  }

  if (typeof errorPayload.message === 'string') {
    return errorPayload.message;
  }

  return 'Request failed.';
}

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
    throw new Error(extractErrorMessage(errorPayload));
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

export function analyzeAll() {
  return requestJson('/analyze-all', { method: 'POST' });
}

// ── Cloud Storage fetch — used on page load, zero Gemini calls ────────────────
const GCS_URL = 'https://storage.googleapis.com/la28-momentum-cache/momentum-data.json';

export async function loadMomentumData() {
  const res = await fetch(GCS_URL);
  if (!res.ok) throw new Error('Could not load momentum data');
  return res.json();
}
