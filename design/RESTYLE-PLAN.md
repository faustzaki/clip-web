# RESTYLE-PLAN — bikin clip-web mirip Vizard

Dasar: `design/vizard-tokens.json` (hasil pindai computed style 239 elemen workspace + 447 elemen editor).
Angka di `design/tokens.css` **bukan selera**, itu hasil baca langsung.

## Diagnosis: kenapa sekarang kelihatan jelek
Tiga hal, bukan seribu:

1. **Tema salah arah.** Vizard itu **light** (`#F2F4F7` halaman, `#FFFFFF` kartu, satu aksen ungu `#4822A5`).
   clip-web sekarang gelap `#0b0b0d` + tombol gradien pink→ungu + glow ungu. Dua identitas nabrak.
2. **Tidak ada token.** 4 aksen bersaing di satu layar (merah logo, gradien tombol, mint badge, amber badge),
   radius campur 8/12/16, gap 28 vs 32. Semua angka lahir di tempat, bukan dari skala.
3. **Tidak ada design system untuk state.** Badge warna tidak semantik, tidak ada hover pada kartu,
   tidak ada toolbar (cari/sort/filter), tidak ada empty state, tidak ada menu per-kartu.

## Target yang realistis
| Level | Bisa? | Catatan |
|---|---|---|
| Token & warna identik | ✅ | sudah diekstrak, `tokens.css` |
| Layout & geometri identik | ✅ | header 56px, sidebar 232px, btn 40px, radius 10/12px |
| Komponen mirip (kartu, badge, modal) | ✅ | perlu tulis ulang kelas, ~250 baris CSS |
| Pixel-perfect 1:1 | ❌ | FE mereka Vue terkompilasi, tanpa source map; ikon & spacing batin tidak terbaca |
| Perilaku editor (timeline, caption) | ⚠️ | clip-web sudah punya StudioView 1.916 baris — pertahankan, jangan tiru |

## Urutan patch (kerjakan berurutan, tiap langkah bisa dilihat)

### P1 — pondasi (30 menit)
- `frontend/src/index.css` → ganti total isi dengan `design/tokens.css` (import atau copy).
- `frontend/tailwind.config.js` → `theme.extend` dari `design/tailwind.theme.js`.
- `frontend/index.html` → tambah `<link>` Google Fonts Inter 400/500/600 (atau self-host woff2).
- Hapus `dark` class / `bg-black` global.
**Cek:** halaman jadi putih, teks `#2E3038`, tidak ada sisa hitam.

### P2 — shell (1 jam)
`frontend/src/components/Navbar.jsx`
- tinggi `56px`, padding `0 20px`, background `#FFFFFF`, border-bottom `1px solid #E3E6EC`.
- Logo: 28px tinggi, tanpa kotak outline; wordmark `clip` `#2E3038` + `web` `#4822A5` (satu aksen).
- Kanan: tombol ikon 40×40 radius 10px + avatar inisial 32px.
- **Hapus** rail ikon kiri yang terpotong di x=0.
**Cek:** tidak ada elemen terpotong; tinggi bar = 56px di DevTools.

### P3 — daftar project (2 jam)
`frontend/src/components/ProjectsView.jsx`
- kontainer `max-width:1280px; margin-inline:auto; padding:32px 20px`.
- grid `repeat(auto-fill, minmax(280px,1fr))`, gap `24px` (baris = kolom).
- judul 20px/600 + subtitle 13px `#6E788E`; tombol `+ Project Baru` = `.vz-btn--primary` (bukan gradien, tanpa glow).
- kartu: `.vz-card` + thumbnail 16:9 `object-fit:cover` radius atas 11px.
- badge status **hanya 3**: `Siap` (success), `Proses` (info), `Belum ada video` (warn).
- judul kartu `14px/500`, clamp 2 baris; meta `12px #6E788E`; format durasi `m:ss` (349 menit → `5:49:11`).
- tambah hover: border `#D3D8E1` + shadow `--vz-shadow-md`, dan tombol `⋯` (rename/duplikat/hapus).
- toolbar di atas grid: search input (`.vz-input`, lebar 280px), select sort (Terbaru/Nama/Durasi), filter status.
- empty state: ikon 48px + judul + satu tombol primer, bukan ruang kosong 500px.

### P4 — modal & form (1 jam)
`NewProjectView.jsx`, `SettingsModal.jsx`
- overlay `rgba(0,0,0,.48)`, modal `--vz-surface`, radius `--vz-r-xl`, padding 24px, shadow `--vz-shadow-lg`.
- input/select pakai `.vz-input`; label 13px/500 di atas field, gap 8px.
- footer modal: tombol secondary (Batal) + primary (Simpan), tinggi 40px, rata kanan, gap 8px.

### P5 — studio (pertahankan, jangan tiru)
`StudioView.jsx` sudah 1.916 baris dan jalan. Cukup:
- ganti warna gelap panel ke `--vz-surface` / `--vz-bg-alt`.
- semua tombol pakai `.vz-btn`; slider/track pakai `--vz-border`.
- caption style editor: biarkan, itu nilai jual clip-web yang Vizard tidak punya di free tier.

## Yang jangan dilakukan
- Jangan tiru timeline/caption editor Vizard (tidak terbaca dari bundel, dan punya sendiri sudah lebih baik).
- Jangan pakai gradien atau glow — Vizard tidak punya keduanya.
- Jangan tambah aksen kedua. Satu ungu untuk semua aksi.
- Jangan bikin dark mode dulu. Kalau nanti mau, turunkan token jadi dua set, bukan hardcode.

## Bukti visual
- `design/ref_workspace.png` — target daftar project.
- `design/ref_editor.png` — target editor (untuk referensi proporsi panel).
- `_shots/01_home.png` — kondisi clip-web sekarang (yang dinilai jelek).
