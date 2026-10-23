# AGENTS.md — titik masuk untuk agent pelaksana

Baca berurutan. Jangan lompat. Kalau ada konflik antar dokumen, urutan menang: **AGENTS > ADR > UI-SPEC > DATA-MODEL > IMPLEMENTATION-STRATEGY > prompt tugas**.

## Urutan baca (wajib, sekali di awal sesi)
1. `AGENTS.md` (file ini) — aturan & cara verifikasi
2. `ADR.md` — keputusan yang sudah dikunci, jangan diubah
3. `UI-SPEC.md` — grid, komponen, state, copy
4. `DATA-MODEL.md` — skema & kontrak API
5. `IMPLEMENTATION-STRATEGY.md` — fase, urutan, gate
6. `MODELS.md` — model mana untuk tugas mana
7. `TESTING.md` — cek per tugas, template skrip, matriks prasyarat
8. `prompts/<tugas>.md` — satu tugas per sesi

## Aturan keras (melanggar = kerjaan ditolak)
1. **Light theme saja.** Tidak ada `dark:`, `bg-black`, `bg-dark-*`, `neon`, gradien, atau glow di kode baru. Satu aksen: `--vz-accent`.
2. **Jangan ubah `server.py` kecuali tugas menyebut eksplisit.** Redesign ini pekerjaan frontend.
3. **Jangan hapus** `CropStudioModal`, `SubtitleStyleEditor`, pemilih model AI, `chopify/`. Itu keunggulan produk.
4. **Jangan port CSS/aset Vizard.** Angka boleh, kode dan gambar tidak.
5. **Angka layout dari token**: header 56, sidebar 360, rail 72, strip 96, timeline 240/320, radius 10/12, Inter 400/500/600.
6. **Satu tugas = satu branch = satu PR.** Jangan gabung dua tugas dalam satu commit.
7. **Tidak boleh ada TODO, stub, `console.log`, atau data dummy** di akhir tugas. Kalau belum bisa, tulis di bagian "BLOCKED" laporan.
8. **Jangan menambah dependency baru** kecuali disebut di tugas. Sudah ada: React 18, Vite, Tailwind, Playwright.
9. **Setiap tugas wajib meninggalkan bukti**: screenshot `before/`+`after/` di `docs/evidence/<tugas>/`, plus output perintah verifikasi.
10. Bahasa UI: **Indonesia**, konsisten.
11. **PRECHECK wajib**: jalankan perintah deteksi di prompt, tempel output ke `docs/evidence/<T>/precheck.txt`, baru ngoding.
12. **Tes wajib per tugas**: `scripts/check_<t>.py` harus ada dan exit 0. Tanpa itu tugas belum selesai. Detail: `TESTING.md`.
13. **Placeholder wajib kalau prasyarat absen**: endpoint balas `{ok:false,reason,hint}` (200), UI tampilkan alasan Indonesia, tulis `BLOCKED.md`. Dilarang crash, dilarang menyembunyikan fitur tanpa alasan. Istilah teknis yang sudah lazim tetap Inggris (transcript, export, clip, timeline).

## Baseline kode (jangan di-scaffold ulang)
| File | Baris |
|---|---|
| `frontend/src/components/StudioView.jsx` | 1.916 |
| `server.py` | 1.565 |
| `frontend/src/components/CropStudioModal.jsx` | 605 |
| `frontend/src/components/SettingsModal.jsx` | 601 |
| `frontend/src/components/SubtitleApplyModal.jsx` | 448 |
| `frontend/src/App.jsx` | 256 |
| `chopify/subtitle_burn.py` | 423 |
| `chopify/tighten.py` | 128 |
Semua prompt tugas berisi blok **MODE: PATCH** + daftar file yang disentuh. Kalau agent membuat file baru untuk fungsi yang sudah ada, itu pelanggaran.

## Cara verifikasi (jalankan, jangan diklaim)
```bash
cd frontend && npm run build          # wajib 0 error
python -m http.server 8124 -d frontend/dist   # buka http://127.0.0.1:8124
```
Lalu skrip screenshot yang sudah ada: `_shot.py`, `_shot2.py` (mock API di `_mock.py`).
Gate tiap tugas: (a) build lulus, (b) screenshot ada, (c) kriteria terima di prompt terpenuhi, (d) tidak ada pelanggaran aturan keras.

## Format laporan akhir tugas (wajib, ringkas)
```
TUGAS: <kode> — <judul>
STATUS: DONE | PARTIAL | BLOCKED
FILE: <daftar file yang diubah/dibuat>
BUKTI: <path screenshot> + <output perintah verifikasi>
MENYIMPANG: <kalau ada, sebutkan + alasan> | none
SISA: <kalau PARTIAL/BLOCKED, apa yang kurang>
```

## Kapan berhenti dan tanya
- Dokumen saling bertentangan dan tidak bisa diselesaikan lewat urutan prioritas.
- Tugas butuh mengubah `server.py` atau skema DB.
- Butuh dependency baru.
- Test/build gagal lebih dari 3 kali dengan error yang sama.
Berhenti, tulis BLOCKED + 2 opsi solusi. Jangan improvisasi arsitektur.
