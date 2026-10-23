# ADR — keputusan terkunci

Format: keputusan · alasan · konsekuensi. **Jangan diubah tanpa ADR baru.**

## ADR-001 — Light theme, satu aksen ungu
- **Putusan:** UI putih, halaman `#F2F4F7`, kartu `#FFFFFF`, aksen tunggal `#4822A5`. Tidak ada dark mode.
- **Alasan:** angka dari UI Vizard (`design/vizard-tokens.json`); dark+gradien adalah akar masalah "kelihatan jelek".
- **Konsekuensi:** semua kelas `dark-*`/`neon` dihapus. Dark mode nanti butuh ADR terpisah.

## ADR-002 — Editor, bukan generator
- **Putusan:** prioritas fitur = transcript → timeline → export. Rail tool dibatasi 4 (Subtitles, Audio, B-roll, Text).
- **Alasan:** `COMPETITOR-MATRIX.md` — pembeda Vizard adalah editornya; brand kit/post/analytics bukan pembeda.
- **Konsekuensi:** 10 tool Vizard tidak ditiru. Fitur distribusi ditunda P2.

## ADR-003 — Render lokal sebagai jalur utama
- **Putusan:** klip dirender `chopify` (ffmpeg lokal). Vizard Open API = jalur alternatif, bukan default.
- **Alasan:** Vizard free = 720p + watermark permanen (terbukti server-side); render lokal 1080p tanpa watermark, biaya nol.
- **Konsekuensi:** UI harus selalu menunjukkan sumber render ("Lokal" / "Vizard").

## ADR-004 — Bahasa sebagai data, bukan gambar
- **Putusan:** caption dirender dari data (`transcript_words` + style JSON), bukan overlay gambar.
- **Alasan:** `caption.json` / `user-style.json` Vizard berbasis spec; data bisa di-edit, diskalakan, dan diekspor ulang.
- **Konsekuensi:** `chopify/subtitle_burn.py` menerima JSON style, bukan parameter hardcode.

## ADR-005 — Model AI dipilih user, default aman
- **Putusan:** dropdown model mengambil daftar dari 9Router (`/v1/models`). Default: `T-SOTA/claude-sonnet-5`, fallback `cbai/deepseek-v4.1-flash`.
- **Alasan:** repo sudah punya `settings/fetch-models`; model bebas berubah tanpa deploy.
- **Konsekuensi:** kalau 9Router mati, UI menampilkan state `offline-llm`, generate dinonaktifkan, bukan error mentah.

## ADR-006 — Tidak ada state global baru
- **Putusan:** state editor tetap di `StudioView` (useState/useReducer lokal) + props turun. Tanpa Redux/Zustand/Context baru.
- **Alasan:** satu pengguna, satu layar; 8 komponen spesifik lebih mudah dibaca daripada store generik.
- **Konsekuensi:** `StudioView` maksimum 400 baris; sisanya dipecah ke komponen.

## ADR-007 — Additive DB
- **Putusan:** tambah tabel baru (`transcript_words`, `timeline_items`, `export_jobs`); jangan ALTER/hapus tabel lama.
- **Alasan:** proyek lama josjis harus tetap terbuka.
- **Konsekuensi:** migrasi = `CREATE TABLE IF NOT EXISTS` di startup; tanpa framework migrasi.

## ADR-008 — Cakupan fitur dikunci (revisi 23 Okt 2026)
- **Putusan:** seluruh fitur yang sebelumnya "out of scope" **masuk**. Cakupan final T1–T13, bertingkat:
  - **P0 (harus dulu):** T1 shell · T2 transcript · T3 timeline · T4 export · T5 filler+preset · T6 safe-zone+zoom
  - **P1 (akurasi & bahasa):** T7 akurasi transkripsi · T8 diarisasi speaker · T9 translasi subtitle
  - **P2 (kekayaan visual & distribusi):** T10 b-roll lokal · T11 brand kit · T12 background/layout · T13 antrian posting + analitik
- **Alasan:** keputusan josjis — app harus selengkap tool komersial, bukan subset. Akurasi subtitle (T7–T9) adalah pembeda yang paling terasa oleh pengguna akhir.
- **Konsekuensi:** total anggaran naik dari ±27 jam ke **±68 jam**. P1 tidak boleh dikerjakan sebelum P0 lulus gate. T13 boleh BLOCKED kalau OAuth platform belum ada.
