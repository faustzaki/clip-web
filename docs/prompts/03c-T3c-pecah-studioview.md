# PROMPT 03c — T3c: Pecah StudioView jadi komponen + hook (4–5 jam) · P0

## MODE: PATCH, REFACTOR DI TEMPAT — BUKAN TULIS ULANG
`StudioView.jsx` sekarang ±1.970 baris. Tugas ini **memindahkan** kode yang sudah jalan ke file baru, bukan menulis fitur baru. Perilaku harus **identik** sebelum dan sesudah.

**File yang disentuh:**
- `frontend/src/components/StudioView.jsx` (target akhir **≤ 400 baris**)
- baru: `frontend/src/components/GeneratePanel.jsx` (form generate + slider + model picker)
- baru: `frontend/src/components/PreviewStage.jsx` (preview 9:16 + tombol aksi + video ref)
- baru: `frontend/src/components/ClipsPanel.jsx` (daftar klip + toggle grid/list)
- baru: `frontend/src/hooks/useEditorState.js` (state: words, current, timeline, clips, loading, error + aksi seek/cut/refresh)
- baru: `frontend/src/hooks/useVideoSync.js` (timeupdate → current, seek)
- `scripts/check_t3c.py` (baru)

## MODEL
```
ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash
```
Eskalasi kalau gagal 2×: `ninerouter/T-SOTA/claude-opus-5-5` (refactor besar, terakhir)
```bash
omp -p --approval-mode=yolo --model="ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash" --thinking=low @AGENTS.md @docs/prompts/03c-T3c-pecah-studioview.md
```

## ATURAN REFACTOR (pelanggaran = revert)
1. **Satu langkah = satu pindahan.** Pindahkan satu blok, jalankan `npm run build`, lanjut. Jangan pindahkan 3 blok lalu build.
2. **Jangan ubah nama state, props, handler, teks, kelas.** Yang berubah hanya lokasi kode.
3. **Video element tetap satu** (`<video ref>`), jangan dibuat dua. Ref diteruskan lewat props.
4. Kalau ragu sebuah blok milik siapa: taruh di `StudioView` dulu. Yang penting ≤ 400 baris dan build hijau.
5. Tidak ada `useEffect` baru tanpa cleanup. Tidak ada dependency baru.

## PRECHECK
```bash
wc -l frontend/src/components/StudioView.jsx
grep -c "useState\|useEffect" frontend/src/components/StudioView.jsx
cd frontend && npm run build   # catat hash bundle SEBELUM refactor
```

## TUGAS
1. `useEditorState.js`: pindahkan state + aksi (fetch transcript/timeline/clips, seek, cut, refresh) tanpa mengubah kontrak.
2. `useVideoSync.js`: `timeupdate` → `current` (ms), `seek(ms)`, cleanup listener.
3. `GeneratePanel.jsx`, `PreviewStage.jsx`, `ClipsPanel.jsx`: pindahkan JSX apa adanya.
4. `StudioView.jsx`: tinggal komposisi layout (header/stage/rail/panel/timeline/strip) ≤ 400 baris.
5. Jalankan build + kedua verifier setiap selesai satu file.

## KRITERIA TERIMA (harus semuanya)
- `wc -l StudioView.jsx` **≤ 400**.
- `npm run build` 0 error; hash bundle berubah tapi ukuran total tidak naik > 5%.
- **Regresi fungsional nol**: `node tools/verify-t2b.mjs` tetap 6/6 lulus (klik kata → seek, cari → hasil, 0 pageerror) dan `node tools/measure.mjs` tetap header 56 / rail 72 / strip 96 / sidebar 360.
- `scripts/check_t3c.py` exit 0: StudioView ≤400, 5 file baru ada, tidak ada state duplikat (`useState` untuk `words` hanya di hook), tanpa `console.log`, tanpa dark/neon.
- Screenshot studio 1440 & 1280 setelah refactor identik secara struktur (bandingkan manual dengan `evidence/T3b`).

## BUKTI
`docs/evidence/T3c/`: `precheck.txt`, `check.txt`, `after/*.png`, `regresi.txt` (output kedua verifier), laporan AGENTS.
