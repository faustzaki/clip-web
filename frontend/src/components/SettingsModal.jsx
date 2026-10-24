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
  BookOpen,
  AlertTriangle,
  ArrowRight,
  Palette,
  Upload,
  Film
} from 'lucide-react';
import {
  fetchSettings,
  updateSettings,
  testConnection,
  fetchEndpointModels,
  clearCache,
  openRenderDir,
  fetchOptions,
  fetchGlossary,
  updateGlossary,
  fetchAccuracy,
  fetchBrand,
  updateBrand,
  uploadBrandAsset
} from '../api';

const BRAND_CORNER_LABELS = {
  tl: 'Kiri atas',
  tr: 'Kanan atas',
  bl: 'Kiri bawah',
  br: 'Kanan bawah'
};
const BRAND_ASSETS = {
  logo: { label: 'Logo', hint: 'PNG transparan, tampil di sudut frame.', accept: '.png,.webp,.jpg,.jpeg' },
  intro: { label: 'Intro', hint: 'Video MP4 yang diputar sebelum klip.', accept: '.mp4,.mov,.mkv,.webm' },
  outro: { label: 'Outro', hint: 'Video MP4 yang diputar setelah klip.', accept: '.mp4,.mov,.mkv,.webm' }
};

function BrandAssetRow({ kind, url, busyKind, onUpload, onClear }) {
  const meta = BRAND_ASSETS[kind];
  return (
    <div className="flex items-center gap-3" data-region={`brand-${kind}`}>
      <div className="w-14 h-14 rounded-xl border border-[var(--vz-border)] bg-[var(--vz-surface-muted)] flex items-center justify-center overflow-hidden shrink-0">
        {url && kind === 'logo' ? (
          <img src={url} alt={`Pratinjau ${meta.label}`} className="w-full h-full object-contain" />
        ) : (
          <Film className="w-5 h-5 text-[var(--vz-text-faint)]" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-[var(--vz-text-strong)]">{meta.label}</p>
        <p className="text-[11px] text-[var(--vz-text-muted)] truncate">
          {url ? url.split('/').pop() : meta.hint}
        </p>
      </div>
      <label className="px-3 py-1.5 rounded-xl bg-[var(--vz-surface)] border border-[var(--vz-border)] hover:border-[var(--vz-accent)] text-[11px] font-bold cursor-pointer flex items-center gap-1.5 shrink-0">
        <Upload className="w-3 h-3" />
        <span>{busyKind === kind ? 'Mengunggah...' : url ? 'Ganti' : 'Unggah'}</span>
        <input
          type="file"
          accept={meta.accept}
          disabled={busyKind !== null}
          data-testid={`brand-upload-${kind}`}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onUpload(kind, file);
          }}
        />
      </label>
      {url && (
        <button
          type="button"
          onClick={() => onClear(kind)}
          className="p-1.5 rounded-lg text-[var(--vz-text-muted)] hover:text-[var(--vz-danger-fg)] hover:bg-[var(--vz-surface-muted)] shrink-0"
          title={`Hapus ${meta.label} dari brand kit`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

const ENDPOINT_PRESETS = [
  { label: '9Router (Lokal)', value: 'http://127.0.0.1:20128/v1' },
  { label: 'Ollama (Lokal)', value: 'http://localhost:11434/v1' },
  { label: 'OpenAI API', value: 'https://api.openai.com/v1' },
  { label: 'Groq Cloud', value: 'https://api.groq.com/openai/v1' },
  { label: 'OpenRouter', value: 'https://openrouter.ai/api/v1' },
];

export default function SettingsModal({ isOpen, onClose, health, onSettingsSaved, projectId, onResetWorkspace, isResetting }) {
  const [activeTab, setActiveTab] = useState('engine'); // 'engine' | 'storage' | 'brand' | 'accuracy'

  // Settings State
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [availableModels, setAvailableModels] = useState([]);
  const [newModel, setNewModel] = useState('');
  const [renderDir, setRenderDir] = useState('');
  const [storage, setStorage] = useState(null);

  // Akurasi ASR (T7)
  const [asrModel, setAsrModel] = useState('medium');
  const [asrModels, setAsrModels] = useState([]);
  const [diskFreeGb, setDiskFreeGb] = useState(null);
  const [glossaryText, setGlossaryText] = useState('');
  const [glossaryTerms, setGlossaryTerms] = useState([]);
  const [glossaryMsg, setGlossaryMsg] = useState(null);
  const [isSavingGlossary, setIsSavingGlossary] = useState(false);
  const [accuracy, setAccuracy] = useState(null);
  const [accuracyError, setAccuracyError] = useState(null);
  const [isLoadingAccuracy, setIsLoadingAccuracy] = useState(false);

  // Brand kit (T11)
  const [brand, setBrand] = useState(null);
  const [brandFonts, setBrandFonts] = useState([]);
  const [brandCorners, setBrandCorners] = useState(['tl', 'tr', 'bl', 'br']);
  const [brandBlocked, setBrandBlocked] = useState(null);
  const [brandMsg, setBrandMsg] = useState(null);
  const [brandConfigured, setBrandConfigured] = useState(false);
  const [isSavingBrand, setIsSavingBrand] = useState(false);
  const [uploadingKind, setUploadingKind] = useState(null);

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
      loadAccuracyTab();
      loadBrand();
      setTestResult(null);
      setClearResult(null);
      setSaveSuccess(false);
      setOpenFolderMsg(null);
    }
  }, [isOpen]);

  const loadAccuracyTab = async () => {
    try {
      const [glossary, opts] = await Promise.all([fetchGlossary(), fetchOptions()]);
      setGlossaryText(glossary.text || '');
      setGlossaryTerms(glossary.terms || []);
      setAsrModels(opts.asr_models || []);
    } catch (err) {
      setGlossaryMsg({ ok: false, text: err.message || 'Gagal memuat glosarium.' });
    }
    loadAccuracy();
  };

  const loadAccuracy = async () => {
    try {
      setIsLoadingAccuracy(true);
      setAccuracyError(null);
      setAccuracy(await fetchAccuracy());
    } catch (err) {
      setAccuracyError(err.message || 'Gagal memuat skor akurasi.');
    } finally {
      setIsLoadingAccuracy(false);
    }
  };

  const loadBrand = async () => {
    try {
      const data = await fetchBrand();
      if (data.ok === false) {
        setBrandBlocked({ reason: data.reason, hint: data.hint });
        return;
      }
      setBrandBlocked(null);
      setBrand(data.brand || null);
      setBrandConfigured(Boolean(data.configured));
      setBrandFonts(data.fonts || []);
      setBrandCorners(data.corners || []);
    } catch (err) {
      setBrandMsg({ ok: false, text: err.message || 'Gagal memuat brand kit.' });
    }
  };

  const patchBrand = (patch) => setBrand((cur) => ({ ...cur, ...patch }));

  const broadcastBrand = () => window.dispatchEvent(new Event('vz:brand-updated'));

  const handleSaveBrand = async () => {
    if (!brand) return;
    setIsSavingBrand(true);
    setBrandMsg(null);
    try {
      const data = await updateBrand({
        color_primary: brand.color_primary,
        color_secondary: brand.color_secondary,
        font: brand.font,
        logo_corner: brand.logo_corner,
        logo_size_pct: Number(brand.logo_size_pct) || 8
      });
      if (data.ok === false) {
        setBrandMsg({ ok: false, text: `${data.reason} — ${data.hint}` });
        return;
      }
      setBrand(data.brand);
      setBrandConfigured(true);
      setBrandMsg({ ok: true, text: 'Brand kit tersimpan. Render & export berikutnya memakai kit ini.' });
      broadcastBrand();
    } catch (err) {
      setBrandMsg({ ok: false, text: err.message || 'Gagal menyimpan brand kit.' });
    } finally {
      setIsSavingBrand(false);
    }
  };

  const handleBrandUpload = async (kind, file) => {
    setUploadingKind(kind);
    setBrandMsg(null);
    try {
      const data = await uploadBrandAsset(kind, file);
      if (data.ok === false) {
        setBrandMsg({ ok: false, text: `${data.reason} — ${data.hint}` });
        return;
      }
      setBrand(data.brand);
      setBrandConfigured(true);
      setBrandMsg({ ok: true, text: `${BRAND_ASSETS[kind].label} tersimpan di data/brand/.` });
      broadcastBrand();
    } catch (err) {
      setBrandMsg({ ok: false, text: err.message || `Unggah ${kind} gagal.` });
    } finally {
      setUploadingKind(null);
    }
  };

  const handleBrandAssetClear = async (kind) => {
    setBrandMsg(null);
    try {
      const data = await updateBrand({ [`${kind}_path`]: '' });
      if (data.ok === false) {
        setBrandMsg({ ok: false, text: `${data.reason} — ${data.hint}` });
        return;
      }
      setBrand(data.brand);
      setBrandConfigured(true);
      setBrandMsg({ ok: true, text: `${BRAND_ASSETS[kind].label} dilepas dari brand kit.` });
      broadcastBrand();
    } catch (err) {
      setBrandMsg({ ok: false, text: err.message || `Gagal melepas ${kind}.` });
    }
  };

  const handleSaveGlossary = async () => {
    try {
      setIsSavingGlossary(true);
      setGlossaryMsg(null);
      const res = await updateGlossary(glossaryText);
      setGlossaryTerms(res.terms || []);
      setGlossaryMsg({ ok: true, text: `Glosarium tersimpan (${(res.terms || []).length} istilah).` });
    } catch (err) {
      setGlossaryMsg({ ok: false, text: err.message || 'Gagal menyimpan glosarium.' });
    } finally {
      setIsSavingGlossary(false);
    }
  };

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
      setAsrModel(data.whisper_model || 'medium');
      setDiskFreeGb(data.asr_disk_free_gb ?? null);
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
        whisper_model: asrModel,
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
            <span>2. Storage &amp; Render</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('accuracy')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'accuracy'
                ? 'border-[var(--vz-accent)] text-[var(--vz-accent)]'
                : 'border-transparent text-[var(--vz-text-muted)] hover:text-[var(--vz-text)]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>3. Akurasi ASR</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('brand')}
            data-testid="tab-brand"
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'brand'
                ? 'border-[var(--vz-accent)] text-[var(--vz-accent)]'
                : 'border-transparent text-[var(--vz-text-muted)] hover:text-[var(--vz-text)]'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>4. Brand Kit</span>
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
          ) : activeTab === 'storage' ? (
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
          ) : activeTab === 'brand' ? (
            /* TAB 4: BRAND KIT (T11) */
            <div className="space-y-5" data-region="brand-tab">
              {brandBlocked && (
                <div className="p-3 rounded-xl border border-[var(--vz-border)] bg-[var(--vz-surface-muted)] space-y-1">
                  <p className="text-xs font-bold text-[var(--vz-text-strong)] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#E0A800' }} />
                    {brandBlocked.reason}
                  </p>
                  <p className="text-[11px] text-[var(--vz-text-muted)]">{brandBlocked.hint}</p>
                </div>
              )}

              <p className="text-[11px] text-[var(--vz-text-muted)] leading-relaxed">
                {brandConfigured
                  ? 'Brand kit aktif: logo, warna caption, dan intro/outro dipakai setiap render & export.'
                  : 'Brand kit belum tersimpan — export tetap jalan dengan gaya bawaan sampai kit ini kamu simpan.'}
              </p>

              <div className="space-y-3">
                {['logo', 'intro', 'outro'].map((kind) => (
                  <BrandAssetRow
                    key={kind}
                    kind={kind}
                    busyKind={uploadingKind}
                    url={brand?.[kind === 'logo' ? 'logo_url' : `${kind}_url`] || null}
                    onUpload={handleBrandUpload}
                    onClear={handleBrandAssetClear}
                  />
                ))}
                <p className="text-[11px] text-[var(--vz-text-muted)]">
                  Berkas tersimpan di data/brand/. Logo ditempel 24 px dari tepi frame.
                </p>
              </div>

              <div className="space-y-2 pt-3 border-t border-[var(--vz-border)]">
                <label className="font-bold text-[var(--vz-text-strong)]">Warna Brand</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'color_primary', label: 'Warna caption' },
                    { key: 'color_secondary', label: 'Warna kata aktif' }
                  ].map((c) => (
                    <div key={c.key} className="flex items-center gap-2">
                      <input
                        type="color"
                        value={brand?.[c.key] || '#FFFFFF'}
                        disabled={Boolean(brandBlocked)}
                        data-testid={`brand-color-${c.key}`}
                        onChange={(e) => patchBrand({ [c.key]: e.target.value.toUpperCase() })}
                        className="w-9 h-9 rounded-lg border border-[var(--vz-border)] bg-[var(--vz-surface)] cursor-pointer"
                      />
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-[var(--vz-text-strong)]">{c.label}</p>
                        <p className="text-[10px] font-mono text-[var(--vz-text-muted)]">
                          {brand?.[c.key] || '—'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-[var(--vz-border)]">
                <label className="font-bold text-[var(--vz-text-strong)] flex items-center justify-between">
                  <span>Font Caption</span>
                  <span className="text-[10px] text-[var(--vz-text-faint)] font-normal">
                    {brandFonts.length} font terpasang
                  </span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(brandFonts.length ? brandFonts : ['Arial Black']).map((f) => (
                    <button
                      key={f}
                      type="button"
                      disabled={Boolean(brandBlocked)}
                      onClick={() => patchBrand({ font: f })}
                      data-testid={`brand-font-${f}`}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all disabled:opacity-50 ${
                        brand?.font === f
                          ? 'border-[var(--vz-accent)] bg-[var(--vz-accent-tint)] text-[var(--vz-accent)]'
                          : 'border-[var(--vz-border)] text-[var(--vz-text)] hover:border-[var(--vz-accent)]'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-[var(--vz-border)]">
                <label className="font-bold text-[var(--vz-text-strong)]">Posisi Logo</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {brandCorners.map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={Boolean(brandBlocked)}
                      onClick={() => patchBrand({ logo_corner: c })}
                      data-testid={`brand-corner-${c}`}
                      className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all disabled:opacity-50 ${
                        brand?.logo_corner === c
                          ? 'border-[var(--vz-accent)] bg-[var(--vz-accent-tint)] text-[var(--vz-accent)]'
                          : 'border-[var(--vz-border)] text-[var(--vz-text)] hover:border-[var(--vz-accent)]'
                      }`}
                    >
                      {BRAND_CORNER_LABELS[c] || c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-[var(--vz-border)]">
                <label className="font-bold text-[var(--vz-text-strong)] flex items-center justify-between">
                  <span>Ukuran Logo</span>
                  <span className="text-[10px] font-mono text-[var(--vz-text-faint)]">
                    {brand?.logo_size_pct ?? 8}% tinggi frame
                  </span>
                </label>
                <input
                  type="range"
                  min="4"
                  max="15"
                  step="1"
                  disabled={Boolean(brandBlocked)}
                  value={brand?.logo_size_pct ?? 8}
                  data-testid="brand-logo-size"
                  onChange={(e) => patchBrand({ logo_size_pct: Number(e.target.value) })}
                  className="w-full accent-[var(--vz-accent)] disabled:opacity-50"
                />
              </div>

              <div className="flex items-start justify-between gap-3 pt-3 border-t border-[var(--vz-border)]">
                <p className="text-[11px] text-[var(--vz-text-muted)] leading-relaxed">
                  Logo langsung tampil di stage pratinjau setelah kit disimpan.
                </p>
                <button
                  type="button"
                  onClick={handleSaveBrand}
                  disabled={isSavingBrand || Boolean(brandBlocked)}
                  data-testid="brand-save"
                  className="px-3.5 py-2 rounded-xl bg-[var(--vz-accent)] hover:bg-[var(--vz-accent-hover)] text-white text-xs font-extrabold shrink-0 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingBrand ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Simpan Brand Kit</span>
                    </>
                  )}
                </button>
              </div>
              {brandMsg && (
                <p className={`text-[11px] font-bold ${
                  brandMsg.ok ? 'text-[var(--vz-success-fg)]' : 'text-[var(--vz-danger-fg)]'
                }`}>
                  {brandMsg.text}
                </p>
              )}
            </div>
          ) : (
            /* TAB 3: AKURASI ASR (T7) */
            <div className="space-y-5">
              {/* Model ASR */}
              <div className="space-y-2">
                <label className="font-bold text-[var(--vz-text-strong)] flex items-center justify-between">
                  <span>Model Whisper untuk Transkripsi</span>
                  <span className="text-[10px] text-[var(--vz-text-faint)] font-normal">
                    Disk bebas {diskFreeGb ?? '—'} GB
                  </span>
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {(asrModels.length ? asrModels : [{ id: 'medium', label: 'Medium — default' }]).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setAsrModel(m.id)}
                      aria-pressed={asrModel === m.id}
                      className={`text-left px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                        asrModel === m.id
                          ? 'border-[var(--vz-accent)] bg-[var(--vz-accent-tint)] text-[var(--vz-accent)]'
                          : 'border-[var(--vz-border)] text-[var(--vz-text)] hover:border-[var(--vz-accent)]'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--vz-text-muted)] leading-relaxed">
                  Bahasa dikunci ke Indonesia, beam 5, VAD 400 ms, tanpa condition_on_previous_text.
                  Tekan Simpan Pengaturan untuk menerapkan ke transkripsi berikutnya.
                </p>
              </div>

              {/* Glosarium */}
              <div className="space-y-2 pt-3 border-t border-[var(--vz-border)]">
                <label className="font-bold text-[var(--vz-text-strong)] flex items-center justify-between">
                  <span>Glosarium Istilah</span>
                  <span className="text-[10px] text-[var(--vz-text-faint)] font-normal">
                    {glossaryTerms.length} istilah aktif · data/glossary.txt
                  </span>
                </label>
                <textarea
                  value={glossaryText}
                  onChange={(e) => setGlossaryText(e.target.value)}
                  rows={5}
                  spellCheck={false}
                  aria-label="Daftar istilah glosarium"
                  placeholder={'Satu istilah per baris, contoh:\nKoperasi Merah Putih\nMixue'}
                  className="w-full bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--vz-text)] focus:outline-none focus:border-[var(--vz-accent)] transition-colors"
                />
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[11px] text-[var(--vz-text-muted)] leading-relaxed">
                    Istilah digabung ke prompt awal Whisper supaya nama brand, produk, dan istilah teknis ikut dikenali.
                  </p>
                  <button
                    type="button"
                    onClick={handleSaveGlossary}
                    disabled={isSavingGlossary}
                    className="px-3.5 py-2 rounded-xl bg-[var(--vz-accent)] hover:bg-[var(--vz-accent-hover)] text-white text-xs font-extrabold shrink-0 disabled:opacity-50"
                  >
                    {isSavingGlossary ? 'Menyimpan...' : 'Simpan Glosarium'}
                  </button>
                </div>
                {glossaryMsg && (
                  <p className={`text-[11px] font-bold ${
                    glossaryMsg.ok ? 'text-[var(--vz-success-fg)]' : 'text-[var(--vz-danger-fg)]'
                  }`}>
                    {glossaryMsg.text}
                  </p>
                )}
              </div>

              {/* WER */}
              <div className="space-y-2 pt-3 border-t border-[var(--vz-border)]">
                <label className="font-bold text-[var(--vz-text-strong)] flex items-center justify-between">
                  <span>WER Sampel 60 Detik</span>
                  <button
                    type="button"
                    onClick={loadAccuracy}
                    className="text-[10px] font-bold text-[var(--vz-accent)] flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingAccuracy ? 'animate-spin' : ''}`} />
                    Muat ulang
                  </button>
                </label>

                {accuracyError && <p className="text-[11px] text-[var(--vz-danger-fg)]">{accuracyError}</p>}

                {!accuracyError && accuracy?.ok === false && (
                  <div className="p-3 rounded-xl border border-[var(--vz-border)] bg-[var(--vz-surface-muted)] space-y-1">
                    <p className="text-xs font-bold text-[var(--vz-text-strong)] flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#E0A800' }} />
                      {accuracy.reason}
                    </p>
                    <p className="text-[11px] text-[var(--vz-text-muted)]">{accuracy.hint}</p>
                  </div>
                )}

                {!accuracyError && accuracy?.ok && (
                  <div className="space-y-2">
                    <div className="rounded-xl border border-[var(--vz-border)] overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-[var(--vz-surface-muted)] text-[var(--vz-text-muted)]">
                          <tr>
                            <th className="text-left px-3 py-2 font-bold">Pengaturan</th>
                            <th className="text-right px-3 py-2 font-bold">WER</th>
                            <th className="text-right px-3 py-2 font-bold">Salah</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accuracy.rows.map((row) => (
                            <tr key={row.id} className="border-t border-[var(--vz-border)]">
                              <td className="px-3 py-2 text-[var(--vz-text)]">{row.label}</td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-[var(--vz-text-strong)]">
                                {row.wer == null ? '—' : `${(row.wer * 100).toFixed(1)}%`}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-[var(--vz-text-muted)]">
                                {row.errors}/{row.words}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[11px] text-[var(--vz-text-muted)] leading-relaxed">
                      Selisih {accuracy.improvement >= 0 ? 'turun' : 'naik'}{' '}
                      {Math.abs((accuracy.improvement || 0) * 100).toFixed(1)} poin persen.
                      {accuracy.source ? ` Sampel: ${accuracy.source}.` : ''}
                      {accuracy.measured_at ? ` Diukur ${accuracy.measured_at}.` : ''}
                    </p>
                    {accuracy.reference_note && (
                      <p className="text-[10px] text-[var(--vz-text-faint)]">{accuracy.reference_note}</p>
                    )}
                  </div>
                )}
              </div>
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
