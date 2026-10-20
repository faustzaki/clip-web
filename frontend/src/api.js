const BASE_URL = '';

export async function fetchHealth() {
  const res = await fetch(`${BASE_URL}/api/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function fetchOptions() {
  const res = await fetch(`${BASE_URL}/api/options`);
  if (!res.ok) throw new Error('Failed to fetch options');
  return res.json();
}

export async function fetchProjects() {
  const res = await fetch(`${BASE_URL}/api/projects`);
  if (!res.ok) throw new Error('Failed to fetch projects');
  const data = await res.json();
  return data.projects || [];
}

export async function createProject(title = null) {
  const res = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.detail || 'Failed to create project'); }
  return res.json();
}

export async function renameProject(projectId, title) {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.detail || 'Rename failed'); }
  return res.json();
}

export async function deleteProject(projectId) {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}`, { method: 'DELETE' });
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.detail || 'Delete failed'); }
  return res.json();
}

export async function fetchState(projectId) {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/state`);
  if (!res.ok) throw new Error('Failed to fetch state');
  return res.json();
}

export async function ingestUrl(projectId, url, model_size = 'base', language = null) {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/ingest`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, model_size, language: language === 'auto' ? null : language })
  });
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.detail || 'Ingestion failed'); }
  return res.json();
}

export async function uploadVideoFile(projectId, file, model_size = 'base', language = null) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('model_size', model_size);
  if (language && language !== 'auto') formData.append('language', language);
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/upload`, { method: 'POST', body: formData });
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.detail || 'Upload failed'); }
  return res.json();
}

export async function scoreMoments(projectId, params = {}) {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/score`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.detail || 'Scoring failed'); }
  return res.json();
}

export async function renderClip(projectId, params) {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/render`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.detail || 'Render failed'); }
  return res.json();
}

export async function fetchClips(projectId) {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/clips`);
  if (!res.ok) throw new Error('Failed to fetch clips');
  return res.json();
}

export async function resetWorkspace(projectId) {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/reset`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Reset failed');
  return res.json();
}

export async function putPrefs(projectId, render_prefs) {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/prefs`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ render_prefs }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update preferences');
  }
  return res.json();
}

export async function putCrop(projectId, index, rect) {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/crops`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index, rect }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update crop');
  }
  return res.json();
}

export async function transcribeClip(projectId, slug, force = false) {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/clips/${slug}/transcribe?force=${force ? 'true' : 'false'}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Transcribe clip failed');
  }
  return res.json();
}

export async function applySubtitles(projectId, slug, body = {}) {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/clips/${slug}/subtitles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Apply subtitles failed');
  }
  return res.json();
}

export async function publishClip(projectId, slug) {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/clips/${slug}/publish`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Publish clip failed');
  }
  return res.json();
}
