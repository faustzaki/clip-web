# PROMPT 01b — T1b: Sapu sisa tema gelap + aksen liar (2–3 jam) · P0

## MODE: PATCH, BUKAN BUILD ULANG
T1 sudah merge. Tugas ini **hanya mengganti kelas warna** di file yang masih gelap. Tidak menambah fitur, tidak mengubah layout, tidak memecah komponen.

**File yang disentuh tugas ini:**
- `frontend/src/components/CropStudioModal.jsx`
- `frontend/src/components/GalleryView.jsx`
- `frontend/src/components/IconDropdown.jsx`
- `frontend/src/components/NewProjectView.jsx`
- `frontend/src/components/SettingsModal.jsx`
- `frontend/src/components/StudioView.jsx`
- `frontend/src/components/SubtitleApplyModal.jsx`
- `frontend/src/components/SubtitleStyleEditor.jsx`

## MODEL (murah dulu, wajib bisa tool-call)
```
ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash
```
Eskalasi hanya kalau gagal 2× nyata: `ninerouter/cbai/deepseek-v4.1-flash`
```bash
py -3.13 docs/scripts/check_model_tools.py "ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash"
omp -p --approval-mode=yolo --model="ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash" --thinking=low @AGENTS.md @docs/prompts/01b-T1b-sapu-gelap.md
```

## BACA
`docs/ADR.md` ADR-001 · `docs/UI-SPEC.md` §2 · `frontend/src/index.css` (daftar token `--vz-*`)

## PRECHECK
```bash
grep -rlE "dark:|bg-dark|neon|gradient" frontend/src | sed 's|frontend/src/||'
```

## TUGAS
1. Ganti semua kelas gelap dengan token yang sudah ada. Pemetaan wajib:
   | Lama | Baru |
   |---|---|
   | `bg-dark-bg`, `bg-slate-950`, `bg-black` (panel, bukan media) | `bg-[var(--vz-bg)]` atau `bg-[var(--vz-surface)]` |
   | `bg-dark-card`, `bg-dark-panel` | `bg-[var(--vz-surface)]` |
   | `border-dark-border` | `border-[var(--vz-border)]` |
   | `text-white`, `text-slate-100` | `text-[var(--vz-text)]` |
   | `text-slate-400`, `text-gray-400` | `text-[var(--vz-text-muted)]` |
   | `text-neon`, `bg-neon/*`, `border-neon/*` | `text-[var(--vz-accent)]`, `bg-[var(--vz-accent-tint)]`, `border-[var(--vz-accent)]` |
   | gradien (`bg-gradient-to-*`) | warna solid `bg-[var(--vz-accent)]` + `hover:bg-[var(--vz-accent-hover)]` |
2. Hapus aksen liar: tombol hijau (`bg-green-*`), label kuning/oranye (`text-yellow-*`, `bg-orange-*`) → pakai token netral atau `--vz-accent` untuk aksi utama. Warna status (sukses/gagal) hanya boleh di badge, bukan tombol utama.
3. `bg-black` yang memang media (preview video/canvas `<video>`, thumbnail) **jangan diubah** — itu permukaan media, bukan tema.
4. Radius: `rounded-2xl`/`rounded-3xl` pada panel → `rounded-xl` (12px). Tombol/input → `rounded-[10px]`.
5. Jangan ubah struktur JSX, nama state, handler, atau teks. Diff hanya kelas dan style.

## KRITERIA TERIMA
- `grep -rnE "dark:|bg-dark|neon|gradient" frontend/src` → **kosong** (kecuali komentar).
- Tidak ada tombol utama berwarna selain `--vz-accent`.
- Build 0 error; screenshot projects + studio (1440 & 1280) tanpa panel gelap.
- Tidak ada `TODO`/`console.log` baru.

## BUKTI
`docs/evidence/T1b/` → `precheck.txt`, `check.txt`, `after/*.png`, laporan format AGENTS.
