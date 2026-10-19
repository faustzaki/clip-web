const BASE_URL = '';

export async function fetchHealth() {
  const res = await fetch(`${BASE_URL}/api/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function fetchState() {
  const res = await fetch(`${BASE_URL}/api/state`);
  if (!res.ok) throw new Error('Failed to fetch state');
  return res.json();
}

export async function fetchOptions() {
  const res = await fetch(`${BASE_URL}/api/options`);
  if (!res.ok) throw new Error('Failed to fetch options');
  return res.json();
}

export async function ingestUrl(url, model_size = 'base', language = null) {
  const res = await fetch(`${BASE_URL}/api/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, model_size, language: language === 'auto' ? null : language })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Ingestion failed');
  }
  return res.json();
}

export async function uploadVideoFile(file, model_size = 'base', language = null) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('model_size', model_size);
  if (language && language !== 'auto') {
    formData.append('language', language);
  }
  const res = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Upload failed');
  }
  return res.json();
}

export async function scoreMoments(params = {}) {
  const res = await fetch(`${BASE_URL}/api/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Scoring failed');
  }
  return res.json();
}

export async function renderClip(params) {
  const res = await fetch(`${BASE_URL}/api/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Render failed');
  }
  return res.json();
}

export async function fetchClips() {
  const res = await fetch(`${BASE_URL}/api/clips`);
  if (!res.ok) throw new Error('Failed to fetch clips');
  return res.json();
}

export async function resetWorkspace() {
  const res = await fetch(`${BASE_URL}/api/reset`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Reset failed');
  return res.json();
}
