# docs — paket kerja clip-web

Semua yang dibutuhkan agent supaya kerja **lurus aturan**, tanpa improvisasi.

## Peta dokumen
| File | Isi | Kapan dibaca |
|---|---|---|
| `AGENTS.md` | aturan keras, cara verifikasi, format laporan | setiap sesi, pertama |
| `ADR.md` | 7 keputusan terkunci | setiap sesi |
| `UI-SPEC.md` | grid 56/360/72/96/240, komponen, state, copy | sebelum menyentuh UI |
| `DATA-MODEL.md` | skema SQLite additive + kontrak API | sebelum menyentuh BE |
| `IMPLEMENTATION-STRATEGY.md` | fase T1–T6, gate, paralelisasi, rollback | sebelum mulai tugas |
| `MODELS.md` | model 9Router yang hidup (hasil uji) + nama picker OMP + perintah | sebelum pilih model |
| `READINESS-AUDIT.md` | audit: picker OMP, siap/tidak siap, cakupan fitur vs Vizard | sebelum mulai, wajib |
| `TASKS.md` | status 6 tugas | dibuat oleh prompt 00 |
| `prompts/00-ORCHESTRATOR.md` | setup sesi, inventaris, baseline screenshot | awal proyek |
| `prompts/01..13-*.md` | satu prompt per tugas, copy-paste (T1–T13) | satu per sesi |
| `prompts/99-REVIEW.md` | QA setelah merge | tiap PR |

Rujukan desain (di `design/`): `tokens.css`, `tailwind.theme.js`, `vizard-tokens.json`, `STUDIO-DIFF.md`, `COMPETITOR-MATRIX.md`, `RESTYLE-PLAN.md`, `ref_*.png`.

## Cara pakai (satu tugas per sesi)
1. Buka repo di runner josjis (orca/omp).
2. Tempel isi `docs/AGENTS.md` **atau** cukup beri path-nya kalau runner baca file otomatis.
3. Tempel prompt tugas, misal `docs/prompts/01-T1-shell.md`.
4. Set model sesuai `MODELS.md` (T1 → `T-SOTA/claude-sonnet-5`).
5. Setelah selesai: jalankan `docs/prompts/99-REVIEW.md` dengan model berbeda (`T-SOTA/claude-opus-5`).
6. Merge hanya kalau gate di `IMPLEMENTATION-STRATEGY.md` §3 lulus.

## Env yang harus ada di runner
```
NINE_ROUTER_URL=http://127.0.0.1:20128/v1
NINE_ROUTER_API_KEY=<dari config Hermes josjis>
VIZARDAI_API_KEY=<work/g9_key.json>
```
Jangan pernah menaruh nilai key di dokumen atau commit.

## Urutan eksekusi
`00` → T1 → (T2 → T3 → T4) ∥ T5 → T6 → **gate P0** → T7 → (T8 ∥ T9) → (T10 ∥ T11 ∥ T12 ∥ T13).
Jangan paralel T2 dan T3 (keduanya menyentuh state StudioView). P1 tidak boleh mulai sebelum P0 lulus gate.
