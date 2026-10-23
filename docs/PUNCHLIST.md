# PUNCHLIST — temuan PM yang belum masuk tugas

Diisi dari verifikasi visual/angka tiap tugas. Item dicoret setelah dikerjakan.

| ID | Temuan | Bukti | Ditangani di | Status |
|---|---|---|---|---|
| P-01 | Tombol `Simpan` lavender + teks putih → kontras rendah (gagal AA) | `T1b/after/studio-1440x900.png` | T4 (modal/tombol) | OPEN |
| P-02 | Tiga tombol aksi (`TEMUKAN MOMEN VIRAL`, `Terapkan Subtitle`, `Jadikan Final`) beda rampa ungu; dua terlihat seperti gradien | idem | T4 | OPEN |
| P-03 | Thumbnail klip hitam kosong (mock tidak punya poster) | idem | T2/T4 (pakai `thumb_*.jpg` asli) | OPEN |
| P-04 | Kartu clip strip menyentuh tepi bawah (804+96=900) → terlihat terpotong | idem | T3 (strip ikut timeline) | OPEN |
| P-05 | Preview 9:16 memuat video landscape → letterbox besar, caption tak terbaca | idem | T6 (ratio + background fill) | OPEN |
| P-06 | Ruang kosong besar di kanan bawah panel CLIPS dan bawah rail | idem | T3/T10 (timeline + panel tool) | OPEN |
| P-07 | Meta text abu-abu `--vz-text-muted` di atas putih ~3.5:1 | `T1b` audit kontras | T4 | OPEN |
| P-08 | `GalleryView` blank di harness mock: `c.name` dipakai, mock cuma kirim `slug` | laporan T1b | gue patch `_mock.py` (kirim `name` juga) | **FIXED** |
| P-09 | Refactor T3c memenuhi ≤400 baris, tapi state masih di `StudioView` (23 useState/useEffect); hook `useEditorState` baru 85 baris | audit T3c | T4/T5 (pindah bertahap saat menyentuh file) | OPEN |
