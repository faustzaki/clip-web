import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Cpu,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Trash2,
  FolderOpen,
  RefreshCw,
  Plus,
  Check,
  Server,
  Key,
  FolderCheck,
  Layers,
  ArrowRight
} from 'lucide-react';
import {
  fetchSettings,
  updateSettings,
  testConnection,
  fetchEndpointModels,
  clearCache,
  openRenderDir
} from '../api';

const ENDPOINT_PRESETS = [
  { label: '9Router (Lokal)', value: 'http://127.0.0.1:20128/v1' },
  { label: 'Ollama (Lokal)', value: 'http://localhost:11434/v1' },
  { label: 'OpenAI API', value: 'https://api.openai.com/v1' },
  { label: 'Groq Cloud', value: 'https://api.groq.com/openai/v1' },
  { label: 'OpenRouter', value: 'https://openrouter.ai/api/v1' },
];

export default function SettingsModal({ isOpen, onClose, health, onSettingsSaved, projectId, onResetWorkspace, isResetting }) {
  const [activeTab, setActiveTab] = useState('engine'); // 'engine' | 'storage'

  // Settings State
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [availableModels, setAvailableModels] = useState([]);
  const [newModel, setNewModel] = useState('');
  const [renderDir, setRenderDir] = useState('');
  const [storage, setStorage] = useState(null);

  // Status & Loaders
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [isClearing, setIsClearing] = useState(false);
  const [clearResult, setClearResult] = useState(null);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [openFolderMsg, setOpenFolderMsg] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      setTestResult(null);
      setClearResult(null);
      setSaveSuccess(false);
      setOpenFolderMsg(null);
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const data = await fetchSettings();
      setEndpoint(data.llm_endpoint || 'http://127.0.0.1:20128/v1');
      setApiKey(data.llm_api_key || '');
      setModel(data.llm_model || 'ag/gemini-3.8-flash');
      setAvailableModels(data.available_models || []);
      setRenderDir(data.render_dir || '');
      setStorage(data.storage || null);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setSaveSuccess(false);
      const updated = await updateSettings({
        llm_endpoint: endpoint,
        llm_api_key: apiKey,
        llm_model: model,
        available_models: availableModels,
        render_dir: renderDir,
      });
      setStorage(updated.storage);
      setSaveSuccess(true);
      onSettingsSaved?.();
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      alert('Gagal menyimpan pengaturan: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setIsTesting(true);
      setTestResult(null);
      const res = await testConnection({
        endpoint,
        api_key: apiKey,
        model,
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleFetchModels = async () => {
    try {
      setIsFetchingModels(true);
      const res = await fetchEndpointModels({
        endpoint,
        api_key: apiKey,
      });
      if (res.models && res.models.length > 0) {
        const merged = Array.from(new Set([...availableModels, ...res.models]));
        setAvailableModels(merged);
        alert(`Berhasil mengambil ${res.models.length} model dari endpoint!`);
      } else {
        alert('Tidak ada model yang ditemukan dari endpoint ini.');
      }
    } catch (err) {
      alert(err.message || 'Gagal mengambil daftar model');
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleAddModel = (e) => {
    e.preventDefault();
    const trimmed = newModel.trim();
    if (!trimmed) return;
    if (!availableModels.includes(trimmed)) {
      const next = [...availableModels, trimmed];
      setAvailableModels(next);
      setModel(trimmed);
    }
    setNewModel('');
  };

  const handleRemoveModel = (mod) => {
    const next = availableModels.filter((m) => m !== mod);
    setAvailableModels(next);
    if (model === mod) {
      setModel(next[0] || '');
    }
  };

  const handleClearCache = async () => {
    if (!window.confirm('Bersihkan file temporary audio, transkripsi cache, dan download proxy? (Klip final dan project tidak akan dihapus)')) {
      return;
    }
    try {
      setIsClearing(true);
      setClearResult(null);
      const res = await clearCache();
      setStorage(res.storage);
      setClearResult(`Berhasil membersihkan ${res.freed_mb} MB (${res.cleaned_files} file).`);
    } catch (err) {
      alert('Gagal membersihkan cache: ' + err.message);
    } finally {
      setIsClearing(false);
    }
  };

  const handleOpenRenderDir = async () => {
    try {
      setOpenFolderMsg('Membuka folder...');
      await openRenderDir();
      setOpenFolderMsg('Folder dibuka di file explorer!');
      setTimeout(() => setOpenFolderMsg(null), 3000);
    } catch (err) {
      setOpenFolderMsg('Gagal: ' + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[var(--vz-overlay)] backdrop-blur-sm flex items-center justify-center p-3 md:p-6 select-none animate-in fade-in duration-150">
      <div className="bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-vz-xl w-full max-w-2xl max-h-[92vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-4 border-b border-[var(--vz-border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--vz-accent)] text-white flex items-center justify-center shadow-sm">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-[var(--vz-text-strong)]">Pengaturan Global</h2>
              <p className="text-[11px] text-[var(--vz-text-muted)]">Atur AI engine LLM, koneksi gateway, dan penyimpanan render</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--vz-text-muted)] hover:text-[var(--vz-text)] rounded-lg hover:bg-[var(--vz-surface-muted)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--vz-border)] bg-[var(--vz-surface-muted)] px-4 gap-2 pt-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('engine')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'engine'
                ? 'border-[var(--vz-accent)] text-[var(--vz-accent)]'
                : 'border-transparent text-[var(--vz-text-muted)] hover:text-[var(--vz-text)]'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>1. Engine & Koneksi</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('storage')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'storage'
                ? 'border-[var(--vz-accent)] text-[var(--vz-accent)]'
                : 'border-transparent text-[var(--vz-text-muted)] hover:text-[var(--vz-text)]'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>2. Storage & Render</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 min-h-0 text-xs">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-[var(--vz-text-muted)]">
              <RefreshCw className="w-5 h-5 animate-spin text-[var(--vz-accent)]" />
              <span>Memuat konfigurasi...</span>
            </div>
          ) : activeTab === 'engine' ? (
            /* TAB 1: ENGINE & KONEKSI */
            <div className="space-y-4">
              {/* Endpoint Preset Picker */}
              <div className="space-y-1.5">
                <label className="font-bold text-[var(--vz-text-strong)] flex items-center justify-between">
                  <span>Pilih Sumber Endpoint LLM</span>
                  <span className="text-[10px] text-[var(--vz-text-faint)] font-normal">OpenAI Compatible</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ENDPOINT_PRESETS.map((p) => {
                    const active = endpoint.trim().toLowerCase() === p.value.toLowerCase();
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => setEndpoint(p.value)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                          active
                            ? 'bg-[var(--vz-accent-tint)] border-[var(--vz-accent)] text-[var(--vz-accent)] font-bold'
                            : 'bg-[var(--vz-surface-muted)] border-[var(--vz-border)] text-[var(--vz-text-muted)] hover:text-[var(--vz-text)]'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Endpoint Custom Input */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[var(--vz-text-muted)]">Endpoint URL</label>
                <div className="relative">
                  <Server className="w-3.5 h-3.5 text-[var(--vz-text-faint)] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder="http://127.0.0.1:20128/v1"
                    className="w-full bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] rounded-xl pl-8 pr-3 py-2 text-xs text-[var(--vz-text)] font-mono placeholder-[var(--vz-text-faint)] focus:outline-none focus:border-[var(--vz-accent)] transition-colors"
                  />
                </div>
              </div>

              {/* API Key */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[var(--vz-text-muted)] flex items-center justify-between">
                  <span>API Key</span>
                  <span className="text-[10px] text-[var(--vz-text-faint)] font-normal">Kosongkan jika menggunakan 9Router lokal</span>
                </label>
                <div className="relative">
                  <Key className="w-3.5 h-3.5 text-[var(--vz-text-faint)] absolute left-3 top-2.5" />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] rounded-xl pl-8 pr-3 py-2 text-xs text-[var(--vz-text)] font-mono placeholder-[var(--vz-text-faint)] focus:outline-none focus:border-[var(--vz-accent)] transition-colors"
                  />
                </div>
              </div>

              {/* Model Picker & Registry */}
              <div className="space-y-2 pt-2 border-t border-[var(--vz-border)]">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[var(--vz-text-strong)]">Model Aktif yang Digunakan</label>
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={isFetchingModels}
                    className="text-[11px] text-[var(--vz-accent)] hover:underline flex items-center gap-1 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isFetchingModels ? 'animate-spin' : ''}`} />
                    <span>Tarik Model dari Endpoint</span>
                  </button>
                </div>

                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] rounded-xl px-3 py-2 text-xs text-[var(--vz-text)] focus:outline-none focus:border-[var(--vz-accent)] font-medium"
                >
                  {availableModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>

                {/* Daftar Model Picker Badges */}
                <div className="space-y-1 pt-1">
                  <span className="text-[10px] text-[var(--vz-text-muted)] font-medium">Daftar Model Tersedia:</span>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1.5 rounded-xl bg-[var(--vz-surface-muted)] border border-[var(--vz-border)]">
                    {availableModels.map((m) => (
                      <span
                        key={m}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono border ${
                          m === model
                            ? 'bg-[var(--vz-accent-tint)] border-[var(--vz-accent)] text-[var(--vz-accent)] font-bold'
                            : 'bg-[var(--vz-surface)] border-[var(--vz-border)] text-[var(--vz-text)]'
                        }`}
                      >
                        <span onClick={() => setModel(m)} className="cursor-pointer hover:underline">
                          {m}
                        </span>
                        {availableModels.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveModel(m)}
                            className="text-[var(--vz-text-faint)] hover:text-[var(--vz-danger-fg)] ml-0.5"
                            title="Hapus dari daftar"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Add Custom Model */}
                <form onSubmit={handleAddModel} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={newModel}
                    onChange={(e) => setNewModel(e.target.value)}
                    placeholder="Nama model baru (misal: llama-3.3-70b-versatile)"
                    className="flex-1 bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] rounded-xl px-3 py-1.5 text-xs text-[var(--vz-text)] placeholder-[var(--vz-text-faint)] focus:outline-none focus:border-[var(--vz-accent)] font-mono"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-xl bg-[var(--vz-surface)] border border-[var(--vz-border)] text-xs font-bold text-[var(--vz-text)] hover:text-[var(--vz-text-strong)] hover:border-[var(--vz-accent)] transition-all flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5 text-[var(--vz-accent)]" />
                    <span>Tambah</span>
                  </button>
                </form>
              </div>

              {/* Cek Koneksi Action & Result */}
              <div className="pt-2 border-t border-[var(--vz-border)] space-y-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="w-full py-2.5 px-4 rounded-xl bg-[var(--vz-surface)] border border-[var(--vz-border)] hover:border-[var(--vz-accent)] text-xs font-bold text-[var(--vz-text-strong)] flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-[var(--vz-accent)] ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? 'Sedang Menghubungi Endpoint...' : 'Cek Koneksi Endpoint'}</span>
                </button>

                {testResult && (
                  <div
                    className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs animate-in fade-in duration-150 ${
                      testResult.ok
                        ? 'bg-[var(--vz-success-bg)] border-[var(--vz-success-fg)] text-[var(--vz-success-fg)]'
                        : 'bg-[var(--vz-danger-bg)] border-[var(--vz-danger-fg)] text-[var(--vz-danger-fg)]'
                    }`}
                  >
                    {testResult.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-[var(--vz-success-fg)] shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-[var(--vz-danger-fg)] shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5">
                      <p className="font-bold">
                        {testResult.ok ? 'Koneksi Berhasil!' : 'Koneksi Gagal'}
                      </p>
                      <p className="text-[11px] opacity-90">
                        {testResult.ok
                          ? `${testResult.message} • Model: ${testResult.model}`
                          : testResult.error}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* TAB 2: STORAGE & RENDER */
            <div className="space-y-5">
              {/* Storage Capacity Overview */}
              <div className="space-y-2">
                <label className="font-bold text-[var(--vz-text-strong)] uppercase tracking-wider text-[11px]">
                  Kapasitas Disk Terpakai
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] space-y-1">
                    <div className="flex items-center justify-between text-[var(--vz-text-muted)] text-[11px]">
                      <span className="font-bold">Folder work/</span>
                      <span className="text-[10px] text-[var(--vz-text-faint)]">{storage?.work?.file_count || 0} file</span>
                    </div>
                    <div className="text-lg font-mono font-extrabold text-[var(--vz-text-strong)]">
                      {storage?.work?.size_mb ?? 0} <span className="text-xs text-[var(--vz-text-muted)] font-sans">MB</span>
                    </div>
                    <p className="text-[10px] text-[var(--vz-text-faint)] truncate" title={storage?.work?.path}>
                      Cache video & transkrip
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] space-y-1">
                    <div className="flex items-center justify-between text-[var(--vz-text-muted)] text-[11px]">
                      <span className="font-bold">Folder clips/</span>
                      <span className="text-[10px] text-[var(--vz-text-faint)]">{storage?.clips?.file_count || 0} file</span>
                    </div>
                    <div className="text-lg font-mono font-extrabold text-[var(--vz-text-strong)]">
                      {storage?.clips?.size_mb ?? 0} <span className="text-xs text-[var(--vz-text-muted)] font-sans">MB</span>
                    </div>
                    <p className="text-[10px] text-[var(--vz-text-faint)] truncate" title={storage?.clips?.path}>
                      Klip video hasil render
                    </p>
                  </div>
                </div>
              </div>

              {/* Clear Cache Button */}
              <div className="p-3.5 rounded-xl bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-[var(--vz-text-strong)] text-xs">Bersihkan Cache & Temp Files</h3>
                    <p className="text-[11px] text-[var(--vz-text-muted)]">
                      Hapus file audio temp WAV, proxy HQ, dan sisa download tanpa menghapus klip final.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearCache}
                    disabled={isClearing}
                    className="px-3.5 py-2 rounded-xl bg-[var(--vz-surface)] border border-[var(--vz-border)] hover:border-[var(--vz-danger-fg)] hover:text-[var(--vz-danger-fg)] text-[var(--vz-text)] text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-[var(--vz-danger-fg)]" />
                    <span>{isClearing ? 'Membersihkan...' : 'Bersihkan Cache'}</span>
                  </button>
                </div>

                {clearResult && (
                  <p className="text-[11px] text-[var(--vz-success-fg)] font-medium flex items-center gap-1 bg-[var(--vz-success-bg)] p-2 rounded-lg border border-[var(--vz-success-fg)]">
                    <Check className="w-3.5 h-3.5" />
                    {clearResult}
                  </p>
                )}
              </div>

              {/* Custom Render Output Directory */}
              <div className="space-y-2 pt-2 border-t border-[var(--vz-border)]">
                <label className="font-bold text-[var(--vz-text-strong)] flex items-center justify-between">
                  <span>Folder Render Output</span>
                  <span className="text-[10px] text-[var(--vz-text-faint)] font-normal">Default: Videos &gt; Clips</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <FolderCheck className="w-3.5 h-3.5 text-[var(--vz-text-faint)] absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={renderDir}
                      onChange={(e) => setRenderDir(e.target.value)}
                      placeholder="C:\Users\username\Videos\Clips"
                      className="w-full bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] rounded-xl pl-8 pr-3 py-2 text-xs text-[var(--vz-text)] font-mono placeholder-[var(--vz-text-faint)] focus:outline-none focus:border-[var(--vz-accent)] transition-colors"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenRenderDir}
                    className="px-3 py-2 rounded-xl bg-[var(--vz-surface)] border border-[var(--vz-border)] hover:border-[var(--vz-accent)] text-[var(--vz-text)] hover:text-[var(--vz-text-strong)] text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0"
                    title="Buka folder di File Explorer"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[var(--vz-accent)]" />
                    <span>Buka Folder</span>
                  </button>
                </div>
                {openFolderMsg && (
                  <p className="text-[11px] text-[var(--vz-text-muted)] italic">{openFolderMsg}</p>
                )}
                <p className="text-[11px] text-[var(--vz-text-muted)] leading-relaxed">
                  Setiap kali klip dipotong, diberi subtitle, atau dijadikan final, file MP4 otomatis disimpan juga ke folder di atas sehingga langsung siap dipakai.
                </p>
              </div>

              {/* Reset Workspace Project */}
              {projectId && (
                <div className="p-3.5 rounded-xl bg-[var(--vz-surface-muted)] border border-[var(--vz-danger-fg)] space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-[var(--vz-text-strong)] text-xs">Reset Workspace Project Aktif</h3>
                      <p className="text-[11px] text-[var(--vz-text-muted)]">
                        Reset video source, transkrip, kandidat, dan klip project ini jika ingin mulai ulang dari awal.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onResetWorkspace?.()}
                      disabled={isResetting}
                      className="px-3.5 py-2 rounded-xl bg-[var(--vz-surface)] border border-[var(--vz-border)] hover:border-[var(--vz-danger-fg)] hover:text-[var(--vz-danger-fg)] text-[var(--vz-text)] text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-[var(--vz-danger-fg)] ${isResetting ? 'animate-spin' : ''}`} />
                      <span>{isResetting ? 'Mereset...' : 'Reset Workspace'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 border-t border-[var(--vz-border)] bg-[var(--vz-surface-muted)] flex items-center justify-between shrink-0">
          <div>
            {saveSuccess && (
              <span className="text-xs text-[var(--vz-success-fg)] font-bold flex items-center gap-1.5 animate-in fade-in">
                <Check className="w-4 h-4" />
                Pengaturan berhasil disimpan!
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[var(--vz-surface)] border border-[var(--vz-border)] text-xs font-bold text-[var(--vz-text)] hover:text-[var(--vz-text-strong)] hover:border-[var(--vz-border-strong)] transition-all"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-[var(--vz-accent)] hover:bg-[var(--vz-accent-hover)] text-white text-xs font-extrabold shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Simpan Pengaturan</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
