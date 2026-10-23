# AGENTS.md — clip-web

Repo ini dikerjakan agent. Baca dokumen, jangan improvisasi.

## Baca berurutan (sekali per sesi)
1. `docs/AGENTS.md` — aturan keras, verifikasi, format laporan
2. `docs/ADR.md` — keputusan terkunci (light-only, render lokal, cakupan T1–T13)
3. `docs/UI-SPEC.md` — grid 56/360/72/96/240, komponen, state, copy Indonesia
4. `docs/DATA-MODEL.md` — skema SQLite additive + endpoint
5. `docs/IMPLEMENTATION-STRATEGY.md` — fase, gate, paralelisasi
6. `docs/MODELS.md` — model 9Router/OMP yang terbukti hidup
7. `docs/prompts/<tugas>.md` — satu tugas per sesi (T1–T13)

## Aturan yang paling sering dilanggar
- Light theme saja. Tidak ada `dark:`, `bg-black`, `bg-dark-*`, `neon`, gradien, glow. Satu aksen `--vz-accent` (`#4822A5`).
- Jangan hapus: `CropStudioModal`, `SubtitleStyleEditor`, pemilih model AI, `chopify/`.
- `server.py` hanya boleh disentuh tugas yang menyebutnya (T2, T3, T4, T7–T13).
- Tanpa TODO/stub/`console.log`/data dummy di akhir tugas.
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
