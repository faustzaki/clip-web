import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ClipboardCopy, LineChart, Trash2, X } from 'lucide-react';
import {
  cancelPost,
  fetchAnalytics,
  fetchPostCaption,
  fetchPostQueue,
  schedulePost,
} from '../api';

const PLATFORMS = [
  { id: 'tiktok', label: 'TikTok', short: 'TikTok' },
  { id: 'reels', label: 'Instagram Reels', short: 'Reels' },
  { id: 'shorts', label: 'YouTube Shorts', short: 'Shorts' },
];

const DAY_MS = 86_400_000;
const STATUS_LABEL = { queued: 'Menunggu', uploading: 'Mengunggah', done: 'Terunggah', failed: 'Gagal' };

const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const dayLabel = (ms) =>
  new Date(ms).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
const timeLabel = (ms) =>
  new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

// datetime-local memakai waktu lokal mesin
const toLocalInput = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const defaultSlot = () => {
  const d = new Date(Date.now() + DAY_MS);
  d.setHours(9, 0, 0, 0);
  return toLocalInput(d.getTime());
};

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}

const segCls = (active) =>
  `h-9 px-3 rounded-vz-lg border text-meta font-medium transition-colors ${
    active
      ? 'border-vz-accent bg-vz-tint text-vz-accent'
      : 'border-vz-border bg-vz-surface text-vz-soft hover:border-[var(--vz-border-strong)]'
  }`;

/**
 * T13: antrian posting 7 hari + ekspor metadata caption + analitik.
 * Tanpa kredensial OAuth platform: jadwal tetap tersimpan lokal, status `Belum terhubung`,
 * dan tidak ada permintaan jaringan ke platform.
 */
export default function PostQueue({ open, projectId, clips = [], onClose }) {
  const [tab, setTab] = useState('queue');
  const [platform, setPlatform] = useState('tiktok');
  const [slug, setSlug] = useState('');
  const [when, setWhen] = useState(defaultSlot);
  const [caption, setCaption] = useState('');
  const [captionInfo, setCaptionInfo] = useState(null);
  const [items, setItems] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [serverMs, setServerMs] = useState(() => Date.now());
  const [analytics, setAnalytics] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const firstFieldRef = useRef(null);

  const titles = useMemo(
    () => Object.fromEntries(clips.map((c) => [c.slug, c.title || c.meta?.title || c.slug])),
    [clips],
  );
  const platformLabel = (id) => PLATFORMS.find((p) => p.id === id)?.label || id;
  const platformShort = (id) => PLATFORMS.find((p) => p.id === id)?.short || id;

  const loadQueue = async () => {
    const data = await fetchPostQueue(projectId);
    setItems(data.items || []);
    setPlatforms(data.platforms || []);
    if (data.server_time_ms) setServerMs(data.server_time_ms);
  };

  useEffect(() => {
    if (!open) return;
    setTab('queue');
    setError(null);
    setAnalytics(null);
    setCopied(false);
    setSlug((cur) => cur || clips[0]?.slug || '');
    setWhen(defaultSlot());
    loadQueue().catch((err) => setError(err.message));
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  // Caption dibuat server (judul + 5 hashtag dari keywords) tiap klip/platform berganti
  useEffect(() => {
    if (!open || !projectId || !slug) return;
    let cancelled = false;
    fetchPostCaption(projectId, slug, platform)
      .then((data) => {
        if (cancelled) return;
        setCaptionInfo(data);
        setCaption(data.caption || '');
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, slug, platform]);

  useEffect(() => {
    if (!open || tab !== 'analytics' || !slug || analytics) return;
    let cancelled = false;
    fetchAnalytics(slug)
      .then((data) => {
        if (!cancelled) setAnalytics(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab, slug, analytics]);

  const days = useMemo(() => {
    const base = new Date(serverMs);
    base.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => base.getTime() + i * DAY_MS);
  }, [serverMs]);

  const byDay = useMemo(() => {
    const map = new Map(days.map((ms) => [dayKey(ms), []]));
    items.forEach((item) => {
      const bucket = map.get(dayKey(item.scheduled_at));
      if (bucket) bucket.push(item);
    });
    return map;
  }, [days, items]);

  const outside = items.length - [...byDay.values()].reduce((n, list) => n + list.length, 0);
  const disconnected = platforms.filter((p) => !p.connected);

  if (!open) return null;

  const handleSchedule = async () => {
    setError(null);
    const at = new Date(when).getTime();
    if (!slug) return setError('Pilih klip dulu sebelum menjadwalkan.');
    if (!when || Number.isNaN(at)) return setError('Isi waktu jadwal dulu.');
    if (at <= Date.now()) return setError('Waktu jadwal harus di masa depan.');
    setBusy(true);
    try {
      await schedulePost({ projectId, clipId: slug, platform, caption, scheduledAt: at });
      await loadQueue();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async (id) => {
    setError(null);
    try {
      await cancelPost(id);
      await loadQueue();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCopy = async () => {
    setError(null);
    try {
      await copyText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(`Gagal menyalin caption: ${err.message}`);
    }
  };

  const metrics = [
    { key: 'views', label: 'Views' },
    { key: 'likes', label: 'Likes' },
    { key: 'comments', label: 'Komentar' },
  ];
  const metricValue = (key) => {
    const value = analytics?.metrics?.[key];
    return typeof value === 'number' ? value.toLocaleString('id-ID') : '—';
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--vz-overlay)] flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-queue-title"
        data-region="post-queue"
        className="w-[880px] max-w-full max-h-full rounded-vz-xl border border-vz-border bg-vz-surface shadow-vz-lg flex flex-col"
      >
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-vz-border">
          <div className="min-w-0">
            <h2 id="post-queue-title" className="text-base font-semibold text-vz-strong">
              Antrian posting
            </h2>
            <p className="text-meta text-vz-dim">
              Jadwalkan klip per platform, salin caption siap tempel, pantau hasilnya.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            title="Tutup"
            className="p-2 rounded-vz-sm text-vz-dim hover:text-vz-strong hover:bg-vz-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex gap-1 px-5 pt-3">
          {[
            { id: 'queue', label: 'Antrian', Icon: CalendarDays },
            { id: 'analytics', label: 'Analitik', Icon: LineChart },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              data-testid={`post-tab-${id}`}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 h-9 px-3 rounded-vz-lg text-meta font-medium transition-colors ${
                tab === id ? 'bg-vz-tint text-vz-accent' : 'text-vz-dim hover:bg-vz-muted hover:text-vz-soft'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="px-5 py-4 overflow-y-auto flex flex-col gap-4">
          <div
            data-region="post-oauth-status"
            className={`rounded-vz-lg border px-4 py-3 text-meta ${
              disconnected.length ? 'border-vz-border bg-[var(--vz-surface-muted)] text-vz-soft' : 'border-vz-border bg-vz-tint text-vz-strong'
            }`}
          >
            <p className="font-medium" data-testid="post-oauth-status-text">
              {disconnected.length ? 'Belum terhubung' : `Terhubung: ${platforms.map((p) => p.label).join(', ')}`}
            </p>
            <p className="text-vz-dim">
              {disconnected.length
                ? `Akun ${disconnected.map((p) => p.label).join(', ')} belum dihubungkan — jadwal disimpan lokal, unggah otomatis dan analitik nonaktif.`
                : 'Unggah otomatis mengikuti jadwal.'}
            </p>
            {disconnected.length > 0 && (
              <p className="text-vz-dim mt-1">{disconnected[0].hint}</p>
            )}
          </div>

          {error && (
            <p
              role="alert"
              data-testid="post-error"
              className="rounded-vz-lg border border-[var(--vz-danger-fg)] bg-[var(--vz-danger-bg)] px-3 py-2 text-meta text-[var(--vz-danger-fg)]"
            >
              {error}
            </p>
          )}

          {tab === 'queue' ? (
            <>
              <section className="rounded-vz-lg border border-vz-border p-4 flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-meta font-medium text-vz-soft">Platform</span>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORMS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        data-testid={`post-platform-${p.id}`}
                        aria-pressed={platform === p.id}
                        onClick={() => setPlatform(p.id)}
                        className={segCls(platform === p.id)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-meta font-medium text-vz-soft">Klip</span>
                    <select
                      ref={firstFieldRef}
                      data-testid="post-clip"
                      className="vz-input w-full"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                    >
                      {clips.length === 0 && <option value="">Belum ada klip final</option>}
                      {clips.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {titles[c.slug]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-meta font-medium text-vz-soft">Waktu tayang</span>
                    <input
                      type="datetime-local"
                      data-testid="post-when"
                      className="vz-input w-full"
                      value={when}
                      onChange={(e) => setWhen(e.target.value)}
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-meta font-medium text-vz-soft">
                    Caption ({caption.length}/{captionInfo?.max_chars || 2200} karakter)
                  </span>
                  <textarea
                    data-testid="post-caption"
                    className="vz-input w-full h-28 resize-none"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                  />
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="post-schedule"
                    disabled={busy || !slug}
                    onClick={handleSchedule}
                    className="vz-btn vz-btn--primary disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Jadwalkan
                  </button>
                  <button
                    type="button"
                    data-testid="post-copy-caption"
                    disabled={!caption}
                    onClick={handleCopy}
                    className="vz-btn disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <ClipboardCopy className="w-4 h-4" />
                    {copied ? 'Tersalin' : 'Salin caption'}
                  </button>
                  <span className="text-meta text-vz-dim">
                    {captionInfo?.hashtags?.length
                      ? `${captionInfo.hashtags.length} hashtag untuk ${platformLabel(platform)}`
                      : ''}
                  </span>
                </div>
              </section>

              <section className="flex flex-col gap-2" data-region="post-calendar">
                <h3 className="text-meta font-semibold text-vz-soft">7 hari ke depan</h3>
                <div className="grid grid-cols-7 gap-2">
                  {days.map((ms) => {
                    const list = byDay.get(dayKey(ms)) || [];
                    return (
                      <div
                        key={ms}
                        data-testid={`post-day-${dayKey(ms)}`}
                        className="rounded-vz-lg border border-vz-border bg-[var(--vz-surface-muted)] p-2 min-h-[120px] flex flex-col gap-2"
                      >
                        <span className="text-meta font-medium text-vz-soft">{dayLabel(ms)}</span>
                        {list.length === 0 ? (
                          <span className="text-meta text-vz-dim">Kosong</span>
                        ) : (
                          list.map((item) => (
                            <div
                              key={item.id}
                              data-testid={`post-item-${item.id}`}
                              className="rounded-vz-sm border border-vz-border bg-vz-surface p-2 flex flex-col gap-1"
                            >
                              <span className="text-meta font-medium text-vz-strong truncate">
                                {titles[item.clip_id] || item.clip_id}
                              </span>
                              <span className="text-meta text-vz-dim">
                                {platformShort(item.platform)} · {timeLabel(item.scheduled_at)}
                              </span>
                              <span className="text-meta text-vz-soft">
                                {STATUS_LABEL[item.status] || item.status}
                              </span>
                              <button
                                type="button"
                                data-testid={`post-cancel-${item.id}`}
                                onClick={() => handleCancel(item.id)}
                                className="flex items-center gap-1 text-meta text-vz-accent hover:text-[var(--vz-accent-hover)] self-start"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Batal
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
                {outside > 0 && (
                  <p className="text-meta text-vz-dim">{outside} jadwal lain di luar 7 hari ini.</p>
                )}
              </section>
            </>
          ) : (
            <section className="flex flex-col gap-3" data-region="post-analytics">
              <div className="grid grid-cols-3 gap-3">
                {metrics.map((m) => (
                  <div
                    key={m.key}
                    data-testid={`post-metric-${m.key}`}
                    className="rounded-vz-lg border border-vz-border bg-[var(--vz-surface-muted)] p-3 flex flex-col gap-1"
                  >
                    <span className="text-meta text-vz-dim">{m.label}</span>
                    <span className="text-lg font-semibold text-vz-strong">{metricValue(m.key)}</span>
                  </div>
                ))}
              </div>

              {analytics && !analytics.ok ? (
                <div className="rounded-vz-lg border border-vz-border p-4 text-meta">
                  <p className="font-medium text-vz-strong" data-testid="post-analytics-status">
                    {analytics.reason || 'Belum tersedia'}
                  </p>
                  {analytics.detail && <p className="text-vz-soft mt-1">{analytics.detail}</p>}
                  {analytics.hint && <p className="text-vz-dim mt-1">{analytics.hint}</p>}
                </div>
              ) : (
                <div className="rounded-vz-lg border border-vz-border p-4 text-meta text-vz-dim">
                  {analytics?.days?.length
                    ? 'Grafik 7 hari terakhir mengikuti data platform.'
                    : 'Belum ada data 7 hari terakhir.'}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
