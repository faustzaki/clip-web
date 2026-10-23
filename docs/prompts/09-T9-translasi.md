Kamu agent pelaksana untuk repo `clip-web` (React 18 + Vite + Tailwind, backend FastAPI).
Kerja **hanya** sesuai dokumen. Jangan improvisasi arsitektur.

# PROMPT 09 — T9: Translasi Subtitle (5 jam) · P1

Branch: `t9-translasi`. Tergantung T7 (butuh kata yang bersih).

## BACA
`docs/MODELS.md` §5 · `docs/DATA-MODEL.md` §1, §3 · `prompts/translate.md` (buat file ini, isi di langkah 1)

## TUGAS
1. Buat `docs/prompts/translate.md`: prompt terjemahan subtitle — input JSON `[{i,text}]`, output JSON `[{i,text}]`,
   aturan: pertahankan makna & panjang, maksimal **42 karakter per baris**, maksimal 2 baris, jangan terjemahkan nama brand dari glosarium, jangan menambah kalimat.
2. Backend `translate.py`: batch 40 baris per request ke 9Router (`T-SOTA/claude-sonnet-5`, temperature 0.2).
   Model bisa diganti lewat Settings. Retry 2× kalau JSON tidak valid.
3. Tabel baru `subtitle_translations (project_id, clip_id, lang, payload, created_at)` — cache; kalau ada, jangan panggil LLM lagi.
4. QA otomatis: baris > 42 char atau > 2 baris → kirim ulang baris itu dengan instruksi "lebih padat". Tandai yang tetap panjang.
5. UI panel Subtitles: pilih bahasa target (Indonesia, Inggris, Mandarin, Jepang, Arab, Spanyol), toggle `Dua bahasa` (baris 2 lebih kecil, 80% ukuran).
6. Export: parameter `subtitle_lang` (kode bahasa atau `dual:id+en`).

## KRITERIA TERIMA
- 20 baris Indonesia → Inggris: tidak ada timing bergeser 1ms pun (bandingkan `start_ms` sebelum/sesudah).
- Tidak ada baris > 2 baris tampil di render (screenshot).
- Panggilan kedua bahasa yang sama **tidak** memanggil LLM (bukti: log request kosong, cache hit).
- Istilah di `glossary.txt` tidak diterjemahkan.

## ATURAN (mengikat)
- Light theme saja. Tanpa `dark:`, `bg-black`, `bg-dark-*`, `neon`, gradien, glow. Satu aksen `--vz-accent`.
- Jangan sentuh `chopify/` kecuali tugas menyebutnya. Jangan hapus CropStudioModal, SubtitleStyleEditor, pemilih model AI.
- Jangan tambah dependency kecuali disebut di tugas ini.
- Tidak boleh ada TODO/stub/console.log/data dummy di akhir.
- Bahasa UI: Indonesia, konsisten.

## VERIFIKASI (jalankan, jangan diklaim)
```bash
cd frontend && npm run build
```
Screenshot: `python _mock.py` + `python _shot2.py`, simpan ke `docs/evidence/<TUGAS>/after/`.

## OUTPUT
Laporan format `AGENTS.md`: TUGAS / STATUS / FILE / BUKTI / MENYIMPANG / SISA.
