const BASE_URL = '';

async function apiFetch(input, init) {
  try {
    return await fetch(input, init);
  } catch (err) {
    const msg = String(err?.message || '');
    if (err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(msg)) {
      throw new Error('Server backend tidak jalan. Jalankan run.bat lalu refresh.');
    }
    throw err;
  }
}

export async function fetchHealth() {
  const res = await apiFetch(`${BASE_URL}/api/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function fetchOptions() {
  const res = await apiFetch(`${BASE_URL}/api/options`);
  if (!res.ok) throw new Error('Failed to fetch options');
  return res.json();
}

export async function fetchProjects() {
  const res = await apiFetch(`${BASE_URL}/api/projects`);
  if (!res.ok) throw new Error('Failed to fetch projects');
  const data = await res.json();
  return data.projects || [];
}

export async function createProject(title = null) {
  const res = await apiFetch(`${BASE_URL}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.detail || 'Failed to create project'); }
  return res.json();
}

export async function renameProject(projectId, title) {
  const res = await apiFetch(`${BASE_URL}/api/projects/${projectId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.detail || 'Rename failed'); }
  return res.json();
}

export async function deleteProject(projectId) {
  const res = await apiFetch(`${BASE_URL}/api/projects/${projectId}`, { method: 'DELETE' });
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.detail || 'Delete failed'); }
  return res.json();
}

export async function fetchState(projectId) {
  const res = await apiFetch(`${BASE_URL}/api/projects/${projectId}/state`);
  if (!res.ok) throw new Error('Failed to fetch state');
  return res.json();
}

export async function ingestUrl(projectId, url, model_size = 'base', language = null, quality = 'proxy') {
  const res = await apiFetch(`${BASE_URL}/api/projects/${projectId}/ingest`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, model_size, language: language === 'auto' ? null : language, quality })
  });
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.detail || 'Ingestion failed'); }
  return res.json();
}

export async function uploadVideoFile(projectId, file, model_size = 'base', language = null) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('model_size', model_size);
  if (language && language !== 'auto') formData.append('language', language);
  const res = await apiFetch(`${BASE_URL}/api/projects/${projectId}/upload`, { method: 'POST', body: formData });
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.detail || 'Upload failed'); }
  return res.json();
}

export async function scoreMoments(projectId, params = {}) {
  const res = await apiFetch(`${BASE_URL}/api/projects/${projectId}/score`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.detail || 'Scoring failed'); }
  return res.json();
}

export async function renderClip(projectId, params) {
  const res = await apiFetch(`${BASE_URL}/api/projects/${projectId}/render`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.detail || 'Render failed');
    e.status = res.status;
    e.code = err.code;
    throw e;
  }
  return res.json();
}

export async function fetchClips(projectId) {
  const res = await apiFetch(`${BASE_URL}/api/projects/${projectId}/clips?_t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch clips');
  return res.json();
}

export async function resetWorkspace(projectId) {
  const res = await apiFetch(`${BASE_URL}/api/projects/${projectId}/reset`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Reset failed');
  return res.json();
}

export async function putPrefs(projectId, render_prefs) {
  const res = await apiFetch(`${BASE_URL}/api/projects/${projectId}/prefs`, {
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
  const res = await apiFetch(`${BASE_URL}/api/projects/${projectId}/crops`, {
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
  const res = await apiFetch(`${BASE_URL}/api/projects/${projectId}/clips/${slug}/transcribe?force=${force ? 'true' : 'false'}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Transcribe clip failed');
  }
  return res.json();
}

export async function applySubtitles(projectId, slug, body = {}) {
  const res = await apiFetch(`${BASE_URL}/api/projects/${projectId}/clips/${slug}/subtitles`, {
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
  const res = await apiFetch(`${BASE_URL}/api/projects/${projectId}/clips/${slug}/publish`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Publish clip failed');
  }
  return res.json();
}

export async function fetchSettings() {
  const res = await apiFetch(`${BASE_URL}/api/settings`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to fetch settings');
  }
  return res.json();
}

export async function updateSettings(data) {
  const res = await apiFetch(`${BASE_URL}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update settings');
  }
  return res.json();
}

export async function testConnection(data) {
  const res = await apiFetch(`${BASE_URL}/api/settings/test-connection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchEndpointModels(data) {
  const res = await apiFetch(`${BASE_URL}/api/settings/fetch-models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to fetch models');
  }
  return res.json();
}

export async function clearCache() {
  const res = await apiFetch(`${BASE_URL}/api/settings/clear-cache`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to clear cache');
  }
  return res.json();
}

export async function openRenderDir() {
  const res = await apiFetch(`${BASE_URL}/api/settings/open-render-dir`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to open folder');
  }
  return res.json();
}

// null = transkrip belum siap (404), bukan error
export async function fetchTranscript(projectId) {
  const res = await apiFetch(`${BASE_URL}/api/projects/${projectId}/transcript?word=1`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Gagal memuat transkrip');
  return res.json();
}

export async function cutTranscript(projectId, fromIdx, toIdx) {
  const res = await apiFetch(`${BASE_URL}/api/projects/${projectId}/cut`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from_idx: fromIdx, to_idx: toIdx }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.reason || err.detail || 'Gagal memotong transkrip');
  }
  return res.json();
}

// Buang jeda sunyi + kata pengisi; server balas {ok:false,reason,hint} kalau transkrip belum siap
export async function applyTighten(projectId, body = {}) {
  const res = await apiFetch(`${BASE_URL}/api/projects/${projectId}/tighten`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      silence_ms: body.silence_ms ?? 400,
      filler: body.filler ?? true,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.reason || err.detail || 'Gagal menerapkan pemotongan jeda');
  }
  return res.json();
}

// null = timeline belum tersedia (404), bukan error
export async function fetchTimeline(projectId) {
  const res = await apiFetch(`${BASE_URL}/api/projects/${projectId}/timeline`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Gagal memuat timeline');
  return res.json();
}

export async function startExport(clipId, body = {}) {
  const res = await apiFetch(`${BASE_URL}/api/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clip_id: clipId, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.job_id) {
    throw new Error(data.reason || data.detail || 'Gagal memulai export');
  }
  return data;
}

export async function getExport(jobId) {
  const res = await apiFetch(`${BASE_URL}/api/export/${jobId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.reason || 'Gagal memeriksa status export');
  }
  return res.json();
}

export async function saveTimeline(projectId, items) {
  const res = await apiFetch(`${BASE_URL}/api/projects/${projectId}/timeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.reason || err.detail || 'Gagal menyimpan timeline');
  }
  return res.json();
}
