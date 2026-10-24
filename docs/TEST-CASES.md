# TEST-CASES — QA menyeluruh clip-web

Cara pakai: setiap baris = satu test case. **Status** diisi `PASS` / `FAIL` / `BLOCKED` / `BELUM`.
Bukti wajib ditulis di kolom bukti (angka/screenshot/path), bukan "kelihatan oke".

## 0. Aturan QA
1. **Ukur, jangan nilai rasa.** Ukuran pakai angka (px, ms, sha256, hasil `ffprobe`), bukan perasaan.
2. **Dua viewport wajib**: 1440×900 dan 1280×800.
3. **Uji di data nyata** (project josjis), bukan mock, kecuali disebut lain.
4. **Satu FAIL = bug**, bukan "catatan". Masuk punchlist dengan nomor.
5. Klaim agent bukan bukti. Semua dijalankan ulang oleh QA.

---

## A. Kerangka & layout
| ID | Test case | Cara ukur | Target | Status | Bukti |
|---|---|---|---|---|---|
| A-01 | Preview punya ruang wajar di 1440×900 | ukur `[data-region=preview-frame]` | ≥ 240×430 | | |
| A-02 | Preview punya ruang wajar di 1280×800 | idem | ≥ 180×320 | | |
| A-03 | Tidak ada bar header ganda di studio | hitung `header` terlihat | 1 | | |
| A-04 | Timeline bisa ringkas & expand | klik chevron | 200 ↔ 320 | | |
| A-05 | Panel klip bawah kuncup saat 0 klip | tinggi panel bottom | ≤ 40 px | | |
| A-06 | Panel kiri bisa di-resize | drag handle | 220–560 px | | |
| A-07 | Panel kiri bisa di-collapse | klik minimize | 48 px | | |
| A-08 | Tidak ada scroll horizontal | `scrollWidth > innerWidth` | false | | |
| A-09 | Rail kanan 72 px, sidebar 360 px, strip 96 px | ukur DOM | persis | | |

## B. Transcript (T2/T7/T8)
| ID | Test case | Cara ukur | Target | Status | Bukti |
|---|---|---|---|---|---|
| B-01 | Kata ter-render lengkap | hitung `[data-idx]` | = jumlah kata API | | |
| B-02 | Klik kata → video seek ke `start_ms` | bandingkan `video.currentTime` | ±1.5 s | | |
| B-03 | Kata ragu (logprob < −1.0) bertanda | hitung underline kuning | ada & bisa difilter | | |
| B-04 | Pencarian menyaring + sorot | isi input | jumlah hasil turun | | |
| B-05 | Potong seleksi → kata `line-through` | pilih 3 kata → Potong | durasi total turun | | |
| B-06 | Edit kata persist setelah reload | dblclick → ubah → reload | teks baru bertahan | | |
| B-07 | Badge speaker + label `(perkiraan)` | cek badge | 4 warna, label ada | | |
| B-08 | Filter speaker menyaring kata | pilih Speaker 2 | kata speaker lain hilang | | |
| B-09 | Rename speaker ikut ke caption export | rename → export | prefix nama baru | | |

## C. Timeline (T3/T10)
| ID | Test case | Cara ukur | Target | Status | Bukti |
|---|---|---|---|---|---|
| C-01 | 3 track (Video/Teks/Audio) | hitung track | 3 | | |
| C-02 | Klik ruler → seek proporsional | klik di 75% lebar | ±2% durasi | | |
| C-03 | Playhead ikut playback | putar video | posisi berubah | | |
| C-04 | Zoom 25/50/100/200 mengubah lebar blok | ukur konten | naik ~8× dari 25→200 | | |
| C-05 | B-roll disisipkan di playhead | klik Sisipkan | blok muncul di track 2 | | |
| C-06 | B-roll geser & hapus | klik `‹ › ×` | posisi/hilang | | |
| C-07 | Track kosong menampilkan petunjuk | kosongkan | ada teks, bukan area kosong | | |

## D. Export (T4)
| ID | Test case | Cara ukur | Target | Status | Bukti |
|---|---|---|---|---|---|
| D-01 | 720p vs 1080p beda resolusi | `ffprobe` | 720×1280 vs 1080×1920 | | |
| D-02 | Dua file beda isi | sha256 | berbeda | | |
| D-03 | Burn caption on/off beda | sha256 + frame | berbeda | | |
| D-04 | File bisa diunduh dari UI | klik Unduh | HTTP 200 `video/mp4` | | |
| D-05 | Esc menutup modal + fokus balik | `document.activeElement` | kembali ke pemicu | | |
| D-06 | Job gagal punya alasan | hapus sumber | status `failed` + `error` | | |
| D-07 | Klip hasil export tidak muncul jadi klip baru | daftar klip | jumlah tetap | | |

## E. Filler & caption (T5)
| ID | Test case | Cara ukur | Target | Status | Bukti |
|---|---|---|---|---|---|
| E-01 | Hapus jeda menurunkan durasi | `POST /tighten` | `saved_ms` > 0 | | |
| E-02 | Kata pengisi Indonesia terhapus | cek `deleted` | bertambah | | |
| E-03 | 5 preset menghasilkan render berbeda | sha256 tiap preset | 5 hash unik | | |
| E-04 | Preset asing ditolak | kirim nama ngawur | 400 | | |
| E-05 | Preview stage ikut preset | bandingkan warna span | warna = `primary_color` | | |

## F. Safe zone / ratio / zoom (T6)
| ID | Test case | Cara ukur | Target | Status | Bukti |
|---|---|---|---|---|---|
| F-01 | 4 ratio tersedia | buka menu | 9:16, 1:1, 4:5, 16:9 | | |
| F-02 | Ganti ratio mengubah preview & export | ukur + `ffprobe` | sesuai | | |
| F-03 | Safe zone bisa toggle | klik | tampil/hilang, layout tak bergeser | | |
| F-04 | Auto zoom lebih terpusat dari center crop | simpangan wajah | lebih kecil | | |
| F-05 | Zoom manual 100–160 tersimpan | reload | bertahan | | |

## G. Translasi (T9)
| ID | Test case | Cara ukur | Target | Status | Bukti |
|---|---|---|---|---|---|
| G-01 | Terjemahan jalan (9Router hidup) | POST translate | baris terisi | | |
| G-02 | Timing tidak bergeser | bandingkan `start_ms` | 0 ms | | |
| G-03 | Panggilan kedua = cache hit | hitung request LLM | 0 request baru | | |
| G-04 | Istilah glosarium tidak diterjemahkan | cek teks | utuh | | |
| G-05 | 9Router mati → pesan jujur | matikan | 200 `{ok:false,reason}` | | |

## H. Brand kit (T11)
| ID | Test case | Cara ukur | Target | Status | Bukti |
|---|---|---|---|---|---|
| H-01 | Logo tampil di sudut terpilih | render + baca piksel | warna logo di sudut | | |
| H-02 | Logo transparan tidak jadi kotak hitam | baca piksel zona transparan | warna asli, bukan hitam | | |
| H-03 | Caption ikut `color_primary` | hitung piksel warna | > 0 | | |
| H-04 | Intro+outro ter-concat | `ffprobe` durasi | intro+klip+outro | | |
| H-05 | Nilai ngawur ditolak | POST salah | 400 | | |

## I. Background & layout (T12)
| ID | Test case | Cara ukur | Target | Status | Bukti |
|---|---|---|---|---|---|
| I-01 | 3 susunan menghasilkan 3 file berbeda | sha256 | unik | | |
| I-02 | Sumber 16:9 → 9:16 tanpa black bar | baca piksel sudut | terisi latar | | |
| I-03 | Isi latar blur/warna/hitam terpakai | baca piksel | sesuai | | |
| I-04 | Offset Y menggeser subjek | bandingkan piksel | bergeser | | |
| I-05 | Prefs bertahan setelah reload | baca berkas | tersimpan | | |

## J. Posting & analitik (T13)
| ID | Test case | Cara ukur | Target | Status | Bukti |
|---|---|---|---|---|---|
| J-01 | Kalender 7 hari | hitung kolom | 7 | | |
| J-02 | Jadwalkan + batal | tambah/hapus | 2→3→2 item | | |
| J-03 | Caption + hashtag < 2200 char | panjang teks | < 2200 | | |
| J-04 | Salin caption cocok clipboard | bandingkan | sama | | |
| J-05 | Analitik jujur tanpa OAuth | buka tab | `Belum tersedia` + alasan | | |
| J-06 | Nol request jaringan ke platform | pantau network | 0 | | |

## K. Kualitas & aksesibilitas
| ID | Test case | Cara ukur | Target | Status | Bukti |
|---|---|---|---|---|---|
| K-01 | Kontras teks kecil ≥ 4.5:1 | hitung rasio | lolos | | |
| K-02 | Semua tombol ikon punya `aria-label`/`title` | pindai DOM | 100% | | |
| K-03 | Fokus terlihat saat Tab | screenshot | ada outline | | |
| K-04 | Target klik ≥ 40×40 (tombol utama) | ukur DOM | lolos | | |
| K-05 | Tanpa `console.log`/TODO di kode | grep | 0 | | |
| K-06 | Tanpa tema gelap/gradien/glow | grep | 0 | | |
| K-07 | Build bersih | `npm run build` | 0 error | | |

---

# Perbandingan dengan tool komersial
Sumber: `design/COMPETITOR-MATRIX.md` + pengamatan langsung (24 Okt 2026).

| Kapabilitas | Vizard (free) | Opus Clip | Submagic | Klap | **clip-web (kita)** | Catatan |
|---|---|---|---|---|---|---|
| Editor berbasis transkrip | ya (per kata) | tidak | ya | ya | **ya + edit kata + flag ragu** | kita unggul di edit kata |
| Timeline multi-track | 5 track | tidak | tidak | tidak | **3 track (video/teks/audio)** | Vizard lebih banyak track |
| Caption preset | CSS+JSON | 20+ bahasa | 123 bahasa | ya | **5 preset lokal** | Submagic unggul jumlah bahasa |
| Hapus jeda & kata pengisi | tidak | Starter | Pro | tidak | **ya, gratis** | Submagic berbayar |
| Translasi subtitle | ya | ya | ya | ya | **ya + cache + glosarium** | kita unggul kontrol istilah |
| Diarisasi speaker | tidak | tidak | ya | tidak | **ya (heuristik, label jujur)** | Submagic lebih akurat (model) |
| Auto zoom / reframe | tidak | sebagian | Pro | tidak | **ya (yunet + zoompan)** | kita setara Submagic Pro |
| Export resolusi | 720p + watermark | 1080p berbayar | 1080p berbayar | 1080p berbayar | **1080p tanpa watermark, lokal** | keunggulan biaya |
| Brand kit | ya (berbayar) | ya | ya | ya | **ya** | setara |
| B-roll | library | ya | ya | tidak | **folder lokal** | mereka pakai library berlisensi |
| Posting otomatis + analitik | ya | ya | ya | ya + analytics | **queue lokal; upload BLOCKED** | kekurangan terbesar kita |
| API | ya (free kebetulan jalan) | terbatas | 10 mnt/bln | ya + MCP | **REST lokal** | — |
| Biaya | $29/bln | $15/bln | $12/bln | $29/bln | **Rp0** | — |
| Batas akurasi ASR | tak diukur | tak diukur | tak diukur | tak diukur | **WER 37.9%** (caption YouTube, bukan ground truth) | butuh transkrip manual untuk angka sah |

**Kesimpulan perbandingan**
1. Kita **setara atau lebih** di: editor transkrip, hapus jeda/kata pengisi, translasi+glosarium, export 1080p tanpa watermark.
2. Kita **kalah** di: jumlah preset caption (Submagic 123 bahasa), akurasi diarisasi (pyannote belum aktif), posting otomatis + analitik (butuh OAuth).
3. Kita **tidak punya**: library b-roll berlisensi, marketplace template, kolaborasi tim.
4. Klaim "selengkap Vizard" belum terpenuhi untuk: 5 track (kita 3) dan background/layout manual drag (kita slider+preset).
