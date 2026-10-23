Kamu agent pelaksana untuk repo `clip-web` (React 18 + Vite + Tailwind, backend FastAPI).
Kerja **hanya** sesuai dokumen. Jangan improvisasi arsitektur.

# PROMPT 05 — T5: Filler/Silence + 5 Preset Caption (4 jam, paralel T2)

Branch: `t5-filler-caption`

## BACA
`design/COMPETITOR-MATRIX.md` (baris "Hapus filler/silence") · `chopify/tighten.py` · `chopify/subtitle_burn.py`

## TUGAS
1. Panel tool `Subtitles` (kolom kanan 320px):
   - toggle `Hapus jeda` + slider durasi sunyi (200–1200ms, default 400).
   - toggle `Hapus kata pengisi` (filler Indonesia: "eee", "apa ya", "gitu", "anu").
   - tombol `Terapkan` → `POST /api/projects/{id}/tighten` → tampilkan `menghemat {n} detik`.
2. 5 preset caption (dari `subtitle_burn.py`, jangan bikin engine baru):
   `clean-white` · `bold-yellow` · `boxed-dark` · `karaoke-highlight` · `minimal-outline`.
   Grid 2 kolom, tiap kartu = preview mini (teks contoh) + nama. Pilihan disimpan per project.
3. Preview di stage mengikuti preset terpilih (bukan hanya saat export).

## KRITERIA TERIMA
- Terapkan tighten pada project uji → durasi turun, jumlah kata `deleted` bertambah (query DB).
- Ganti preset → preview stage berubah, dan export berikutnya memakai preset itu.
- Tidak ada preset yang error saat dirender (uji kelimanya, screenshot masing-masing).

## ATURAN (mengikat)
- Light theme saja. Tanpa `dark:`, `bg-black`, `bg-dark-*`, `neon`, gradien, glow. Satu aksen `--vz-accent`.
- Jangan sentuh `server.py`/`chopify/` kecuali tugas menyebutnya.
- Jangan hapus CropStudioModal, SubtitleStyleEditor, pemilih model AI.
- Jangan tambah dependency. Jangan port CSS/aset Vizard (angka boleh, kode/gambar tidak).
- Tidak boleh ada TODO/stub/console.log/data dummy di akhir.
- Bahasa UI: Indonesia, konsisten.

## VERIFIKASI (jalankan, jangan diklaim)
```bash
cd frontend && npm run build
```
Screenshot: pakai `_mock.py` (API tiruan) + `_shot2.py`, simpan ke `docs/evidence/<TUGAS>/after/`.

## OUTPUT
Laporan format `AGENTS.md` §Format laporan: TUGAS / STATUS / FILE / BUKTI / MENYIMPANG / SISA.
