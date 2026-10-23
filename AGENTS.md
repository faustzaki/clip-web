# AGENTS.md — clip-web

Repo ini dikerjakan agent. Baca dokumen, jangan improvisasi.

## Baca berurutan (sekali per sesi)
0. `docs/REQUIREMENTS.md` — dependency & env (disk sudah 27 GB bebas)
1. `docs/AGENTS.md` — aturan keras, verifikasi, format laporan
2. `docs/ADR.md` — keputusan terkunci (light-only, render lokal, cakupan T1–T13)
3. `docs/UI-SPEC.md` — grid 56/360/72/96/240, komponen, state, copy Indonesia
4. `docs/DATA-MODEL.md` — skema SQLite additive + endpoint
5. `docs/IMPLEMENTATION-STRATEGY.md` — fase, gate, paralelisasi
6. `docs/MODELS.md` — model 9Router/OMP yang terbukti hidup
7. `docs/TESTING.md` — cek per tugas + placeholder
8. `docs/prompts/<tugas>.md` — satu tugas per sesi (T1–T13)

## PATCH, bukan build ulang
Repo sudah jalan (~7.500 baris). Semua prompt tugas = **ubah file yang ada**, bukan scaffold baru.
Baseline: `StudioView.jsx` 1.916 · `server.py` 1.565 · `CropStudioModal.jsx` 605 · `SettingsModal.jsx` 601 · `App.jsx` 256.
Target setelah T3: `StudioView.jsx` ≤ 400 baris (sisanya dipecah ke komponen + `hooks/useEditorState.js`).

## Aturan yang paling sering dilanggar
- Light theme saja. Tidak ada `dark:`, `bg-black`, `bg-dark-*`, `neon`, gradien, glow. Satu aksen `--vz-accent` (`#4822A5`).
- Jangan hapus: `CropStudioModal`, `SubtitleStyleEditor`, pemilih model AI, `chopify/`.
- `server.py` hanya boleh disentuh tugas yang menyebutnya (T2, T3, T4, T7–T13).
- Tanpa TODO/stub/`console.log`/data dummy di akhir tugas.
- PRECHECK dulu (deteksi prasyarat) → patch → `scripts/check_tN.py` exit 0 → screenshot. Kalau prasyarat absen: placeholder jujur, bukan crash.
- Tidak ada dependency baru kecuali disebut di prompt tugas.
- Bahasa UI: Indonesia.

## Verifikasi (jalankan, jangan diklaim)
```bash
cd frontend && npm run build
python _mock.py &        # API tiruan :8005
python _shot2.py         # screenshot ke docs/evidence/<TUGAS>/after/
```

## Urutan kerja
`00` → T1 → T2 → T3 → T4 ∥ T6, T5 paralel → **gate P0** → T7 → T8 ∥ T9 → T10 ∥ T11 ∥ T12 ∥ T13.

## Selesai berarti
Build lulus, screenshot ada, kriteria terima terpenuhi satu per satu, laporan format `docs/AGENTS.md` (TUGAS/STATUS/FILE/BUKTI/MENYIMPANG/SISA).
