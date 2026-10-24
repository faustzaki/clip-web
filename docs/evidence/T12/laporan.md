# T12 — Background Fill + Layout Reframe

## TUGAS
T12: isi latar (blur/warna/hitam), tiga susunan (Tengah/Atas-bawah/Kotak), pratinjau CSS yang
mencerminkan hasil ffmpeg, dan drag vertikal `offset_y` (-30..30 %) yang tersimpan.

## STATUS
Selesai. `py -3.13 scripts/check_t12.py` **exit 0** (12 kelompok cek, 0 gagal), `npm run build`
lulus, `scripts/pm_verify_t12.py` **8 lulus / 0 gagal** di :8000, bukti UI + screenshot ada di
`docs/evidence/T12/`.

## FILE
- `chopify/render_clips.py` (+48/-2): `render(..., layout, bg_fill, bg_color, offset_y)`; cabang
  baru setelah jalur crop lama: `scale`+`boxblur=24:2` untuk latar, overlay video utama
  (`base_y = 0` untuk stack, `(H-h)/2` untuk center/box), `geq` alpha untuk sudut membulat pada
  `box`, dan `crop=...:y='<base±offset>'` pada jalur crop yang sudah ada. `layout="off"` = perilaku
  lama persis.
- `server.py` (+86/-2): `DEFAULT_RENDER_PREFS` + `layout/bg_fill/bg_color/offset_y`, `LAYOUTS`,
  `BG_FILLS`, `blur_supported()` (cek filter `boxblur`, di-cache), `capabilities.blur` di
  `/api/options`, validasi di `PUT /prefs` (400 + alasan Indonesia, `bg_fill=blur` ditolak kalau
  `boxblur` tidak ada), `prefs` diteruskan ke dua pemanggil `render_clips.render`.
- `frontend/src/components/PreviewStage.jsx` (+225/-3): panel Layout (isi latar + swatch/color
  picker, empat tombol susunan, hint, readout "Geser vertikal" + Reset), lapisan latar pratinjau
  (`data-region="layout-bg"`: video duplikat `blur(24px)` / warna / hitam), video utama
  (`data-region="layout-foreground"`) dengan posisi/lebar/border-radius mengikuti susunan, drag
  pointer untuk `offset_y`, dan commit `onBlur`/`onChange` (debounce) untuk color picker.
- `frontend/src/components/StudioView.jsx` (+1/-0): meneruskan `options={options}` ke `PreviewStage`
  (dipakai untuk `capabilities.blur`).
- `frontend/src/components/PreviewStage.jsx` juga menambah satu alias kecil, lihat MENYIMPANG 4b.
- `_mock.py` (+5/-1): `MOCK_NO_BLUR=1` membuat `capabilities.blur=false`, untuk menguji placeholder
  tanpa ffmpeg `boxblur`.
- `scripts/check_t12.py` (baru): 12 cek end-to-end (prefs, render tiga susunan, black bar, geometri
  offset, persistensi, placeholder, tulis meta bersamaan, regresi default).
- `docs/evidence/T12/`: `precheck.txt`, `check.txt`, `ffprobe.txt`, `sha256.txt`, `verify-ui.txt`,
  `pm-verify.txt`, `after/` (12 gambar).

## BUKTI
- Precheck: `ffmpeg -filters | grep -c boxblur` = 2 → filter tersedia; `capabilities.blur=true`
  (`docs/evidence/T12/precheck.txt`).
- `check_t12.py` exit 0 — termasuk:
  - tiga susunan → tiga sha256 berbeda (`152cf3a041`/`f02a5607f0`/`7333a813b1`), semuanya 1080x1920;
  - Tengah + blur: **piksel gelap 0 dari 2.073.600** (tidak ada black bar) dan keempat sudut terisi latar;
  - video utama y `656..1263` (Tengah) vs `686..1232` (Kotak), sudut Kotak = warna latar (membulat);
  - `offset_y 20 %` menggeser subjek 384 px (toleransi 96 px);
  - 16 `PUT /prefs` bersamaan: `project.json` tetap JSON utuh, tanpa berkas `.tmp` tertinggal;
  - tanpa `boxblur`: `capabilities.blur=false`, `bg_fill=blur` → 400 dengan alasan Indonesia, `Hitam` tetap 200.
- `pm_verify_t12.py` (apa adanya, port 8000): 8 lulus / 0 gagal (`docs/evidence/T12/pm-verify.txt`).
- UI nyata (browser, server repo di :8005, project `faced12abc`, testsrc2 16:9, aspect 9:16),
  rincian di `docs/evidence/T12/verify-ui.txt`:
  - panel menampilkan Blur/Warna/Hitam + Tanpa/Tengah/Atas-bawah/Kotak;
  - 30 event color beruntun hanya menyimpan satu nilai terakhir, `project.json` tetap terbaca (200);
  - drag 18 % → readout "Geser vertikal 18%", `GET state` = 18; lewat batas → clamp 30 %; Reset → 0;
  - reload halaman + buka ulang project → 10 % masih terpakai (topRel 0.448 = tengah + 10 %);
  - pratinjau vs render: Tengah 0.348 vs 0.3417 (Δ0,63 %), offset 18 % 0.528 vs 0.5219 (Δ0,61 %),
    Atas-bawah 0.011 vs 0.000 (Δ1,1 %), Kotak 0.36 vs 0.357 → semua < 5 % tinggi frame;
  - 0 entri console, 0 error halaman pada satu putaran penuh (buka panel → 3 susunan → 3 isi latar →
    drag → reload).
- Placeholder di UI nyata: dengan `MOCK_NO_BLUR=1`, tombol Blur `disabled` dan panel menulis
  "Isi latar Blur tidak tersedia: filter ffmpeg boxblur tidak ada. Pakai Warna atau Hitam."
  (`docs/evidence/T12/after/panel-blur-disabled.png`).
- `cd frontend && npm run build` → `✓ built in 8.85s` (index-CIrRETsg.js 406,02 kB).

## MENYIMPANG
1. **Lokasi panel.** Prompt menyebut `ToolPanel.jsx (panel Layout)`; pill toolbar + panel Layout
   sebenarnya ada di `PreviewStage.jsx` (dipindah ke sana pada T6). Patch dilakukan di sana,
   `ToolPanel.jsx` tidak disentuh.
2. **Susunan keempat `Tanpa` + default `off`.** Prompt hanya menyebut tiga susunan. Tanpa opsi
   "Tanpa", user yang sudah punya framing lama (pill Background: cari wajah/split/blur) selalu
   kalah oleh susunan. `layout="off"` default membuat render tidak berubah sebelum user memilih.
3. **`offset_y` tidak selalu lewat `crop`.** Pada jalur crop lama (tanpa susunan) offset dipakai
   sebagai `crop=...:y='...'` seperti diminta; pada Tengah/Atas-bawah/Kotak video lebih pendek dari
   frame, jadi menggeser subjek dilakukan dengan memindahkan overlay (`base_y ± offset`). Kalau
   dipaksa `crop`, video utama terpotong, bukan bergeser.
4. **Dua perbaikan kecil di luar daftar tugas, keduanya ditemukan saat verifikasi:**
   a. `server.py::write_project_meta` kini menulis atomik (lock + nama temp unik + retry
      `PermissionError`) — sebelum ini, color picker yang mengirim deretan event (atau dua tab)
      membuat `project.json` korup ("Extra data") sehingga `/api/projects` dan `/api/state` balas 500.
   b. `PreviewStage.jsx` memakai `setPrefs` di tiga handler subtitle (drag/rotate/scale, baris 377/
      418/455) padahal fungsi itu tidak pernah didefinisikan di komponen tersebut → `ReferenceError`
      saat subtitle digeser. Ditambahkan alias 1 baris di samping `patchPrefs` (kontrak updater
      fungsional disamakan), perilaku lain tidak berubah. `StudioView.jsx` +1 baris adalah prop
      `options={options}` untuk `capabilities.blur`, bukan bagian perbaikan ini.
5. **Kompatibilitas ffmpeg.** `geq` untuk sudut membulat memakai `sqrt`+`pow`, bukan `hypot`, karena
   `hypot` tidak ada di build ffmpeg mesin ini. Radius 32 px pada 1080x1920 = 20 px di pratinjau.
6. **Folder bukti.** `docs/evidence/T12/` (bukan `docs/evidence/12/` seperti di prompt) agar seragam
   dengan T1–T11.
7. **Port 8000 sebelumnya dipegang server basi.** Sebelum worktree di-RESUME, port 8000 dipakai
   proses `uvicorn server:app` lama (PID 18608) yang masih menjalankan kode **sebelum** T12
   (`/api/options`-nya belum punya key `capabilities`), sehingga `PUT render_prefs` dibuang validasi
   kode lama dan `pm_verify_t12.py` melaporkan 4 gagal. Proses itu dihentikan, server dijalankan ulang
   dari kode sekarang → 8 lulus / 0 gagal (`docs/evidence/T12/pm-verify.txt`). Kalau PM memakai server
   yang sudah lama hidup, jalankan ulang servernya dulu.
8. `scripts/pm_verify_t12.py` bukan buatan saya; ia muncul di worktree saat RESUME dan dijalankan apa
   adanya.

## SISA
- Cabang `t12-background` belum di-commit; `git status` memperlihatkan source + `frontend/dist` hasil build.
- `chopify/render_clips.py` cabang blur memakai radius tetap 24 px (`boxblur=24:2`) supaya sama dengan
  pratinjau; kalau nanti perlu, radius bisa dijadikan prefs.
- Uji placeholder hanya dijalankan dengan `MOCK_NO_BLUR=1` (dan monkeypatch di `check_t12.py`), karena
  build ffmpeg di mesin ini punya `boxblur`.
