# LAPORAN T3c — Pecah StudioView jadi komponen + hook

## TUGAS
T3c: memindahkan isi `StudioView.jsx` (±2.051 baris) ke 3 komponen + 2 hook, target `StudioView.jsx` ≤ 400 baris, perilaku identik.

## STATUS
Selesai. `StudioView.jsx` 337 baris (dari 2.051). Build 0 error. Verifier T2b/T3b/T3c lulus, `scripts/check_t3c.py` exit 0.

## FILE
Baru:
- `frontend/src/components/GeneratePanel.jsx` (513) — panel kiri: form Generate Clip (model AI, min/max durasi, framing), agregasi momen viral, pengaturan Edit Clip (komponen video, gaya subtitle per-project, filler cuts, kualitas render), panel transkrip.
- `frontend/src/components/PreviewStage.jsx` (965) — stage 9:16: viewport video (satu `<video ref={videoRef}>`), overlay judul/subtitle/watermark, handle transform subtitle & video bebas, scrubber, toolbar aksi klip aktif, `handleRenderSingle` + `handlePublish`.
- `frontend/src/components/ClipsPanel.jsx` (351) — daftar klip dua varian (`variant="right"` kolom kanan, `variant="bottom"` filmstrip) + kartu klip, resizer, scroll-wheel filmstrip.
- `frontend/src/hooks/useEditorState.js` (85) — transkrip (`words`), timeline, klip/kandidat, `currentTime`/`duration`, aksi `seekToMs`, `handleTranscriptCut`, `loadTranscript`.
- `frontend/src/hooks/useVideoSync.js` (33) — listener `timeupdate`/`loadedmetadata` pada elemen video + cleanup.
- `frontend/tools/verify-t3c.mjs` — verifier regresi panel/stage (17 cek).
- `scripts/check_t3c.py` — cek tugas (baris, file baru, state duplikat, satu video, aturan tema, bundle, screenshot, 3 verifier + measure).

Diubah:
- `frontend/src/components/StudioView.jsx` (2.051 → 337) — tinggal komposisi: `EditorHeader` + ROW1 (`GeneratePanel` ∥ resizer ∥ `PreviewStage` ∥ `ClipsPanel` kanan) + `ClipsPanel` filmstrip + `ToolRail` + `Timeline` + `ClipStrip`. Tiga drag handler layout digabung jadi satu `startDrag` (nama `startLeftDrag`/`startRightDrag`/`startBottomDrag` dan klamp/persistensi localStorage tidak berubah).

## BUKTI
- `docs/evidence/T3c/precheck.txt` — 2.051 baris, 54 `useState|useEffect`, bundle sebelum `index-Bq7Zw1b0.js` 335,50 kB, backend :8000 hidup.
- `docs/evidence/T3c/check.txt` — `py -3.13 scripts/check_t3c.py` exit 0 (semua PASS).
- `docs/evidence/T3c/regresi.txt` — `verify-t2b.mjs` 6/6, `verify-t3b.mjs` 6/6, `verify-t3c.mjs` 17/17, `measure.mjs` header 56/rail 72/strip 96/sidebar 360, plus A/B geometri DOM build HEAD vs T3c (1440 project nyata & 1280 mock) yang identik.
- `docs/evidence/T3c/after/studio-1440x900.png`, `studio-1280x800.png` (+ halaman projects), dari bundle `index-BYoMoaT0.js`.
- Bundle: 335,50 → 338,06 kB (+0,76%, batas ≤5%).
- `node tools/verify-t3c.mjs`: klik kartu klip `#1 05:07–05:41` → `video.currentTime` 308,4s (harapan ≈307s); scrubber stage → 3.019s; mode bebas → 4 handle + dock; zoom 100%→110%; reset → 100%; 0 pageerror.

## MENYIMPANG
1. `useVideoSync` memakai `addEventListener('timeupdate')` + cleanup, bukan prop `onTimeUpdate` pada `<video>`. Perilaku sama; `videoUrl` jadi dependency agar listener dipasang ulang saat elemen video di-mount ulang.
2. Satuan `currentTime` tetap **detik** (kontrak lama), bukan ms seperti bunyi prompt di poin hook; batas komponen tetap mengirim ms (`Math.round(currentTime * 1000)`) ke `Timeline`/`TranscriptPanel`. Mengubah ke ms akan mengubah perilaku (dilarang aturan refactor).
3. `useEditorState` juga mengembalikan `clips`/`candidates` (turunan `props.state`) agar StudioView tidak menyimpan turunan ganda — sesuai daftar state yang diminta prompt.
4. `mmss` diduplikasi kecil (5 baris) di `PreviewStage` dan `ClipsPanel`; bukan state, dan menghindari hook util baru hanya untuk satu helper tampilan.
5. Tiga handler drag layout digabung menjadi satu `startDrag(e, {axis, sign, min, max, from, setValue, storeKey})` di StudioView: hemat ~65 baris untuk mencapai batas ≤400 tanpa menambah file di luar daftar prompt. Klamp (220–560 / 240–520 / 110–320), kursor, RAF, dan key localStorage identik.
6. Menambah `frontend/tools/verify-t3c.mjs` (tidak disebut prompt) karena kriteria "regresi fungsional nol" butuh bukti untuk komponen yang dipindah; verifier T2b/T3b tetap dipakai apa adanya.
7. Kontrol sidebar di verifier diklik via `dispatchEvent` karena quirk layout lama (lihat SISA 1) menutupi sidebar pada project dengan ≥6 kandidat; verifier bagian stage dijalankan terhadap `_mock.py` (:8005) agar stage punya lebar.

## SISA
1. **Quirk lama (bukan regresi T3c)**: pada mode filmstrip (`pipelinePos === 'bottom'`) panel klip menjadi item `flex-row` sehingga bila kandidat ≥6 (filmstrip ≥ ~1.5x lebar layar) sidebar/stage tertutup (`stage w=0`). Terbukti identik pada build HEAD (A/B di `regresi.txt`). Perbaikan menyentuh layout → tugas terpisah di luar scope refactor ini.
2. `console.error('Failed to save prefs:', err)` lama di `savePrefs` dipertahankan (bukan `console.log`); menghapusnya akan menyembunyikan kegagalan simpan prefs.
3. `PreviewStage.jsx` (965) dan `GeneratePanel.jsx` (513) masih besar; batas prompt hanya untuk `StudioView.jsx`. Pemecahan lanjut (mis. `SubtitleOverlay`, `StageToolbar`) tidak diminta dan belum dikerjakan.
