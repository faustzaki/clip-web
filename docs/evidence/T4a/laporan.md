# LAPORAN T4a — Backend export job

TUGAS: T4a — POST /api/export + GET /api/export/{job_id} (job render berstatus)
STATUS: DONE

FILE:
- `server.py` — model `ExportRequest`; state job `work/<pid>/exports.json` (`_load_exports`/`_save_exports`/`_find_clip_owner`/`_run_export`); route `POST /api/export`, `GET /api/export/{job_id}`. Route render lama TIDAK diubah.
- `chopify/render_clips.py` — `render()` dapat parameter baru `res_scale`, `fps`, `burn_caption`, `out_name` (dipakai bersama route lama, default = perilaku lama: 1080-base, 30fps sumber, tanpa caption, nama dari slug hook).
- `scripts/check_t4a.py` (baru) — 22 cek, exit 0.
- `docs/evidence/T4a/` — precheck.txt, check.txt, ffprobe.txt, sha256.txt, curl.txt, laporan.md.

BUKTI:
- `py -3.13 scripts/check_t4a.py` → **0 gagal, exit 0** (docs/evidence/T4a/check.txt).
- ffprobe.txt: `t4a-cek-ekspor_720p.mp4 h264,720,1280,24/1` · `t4a-cek-ekspor_1080p.mp4 h264,1080,1920,30/1` — resolusi & fps sesuai permintaan.
- sha256.txt: 720p `a59b7b23…` ≠ 1080p `d1e5bd72…`.
- Regresi: `POST /api/projects/{pid}/render` 200 di skrip cek (klip `t4a-cek-ekspor` dibuat lewat route lama).
- 404: `{"ok":false,"reason":"Klip 'tidak-ada-klip' tidak ditemukan"}`; job gagal: `{"status":"failed","error":"Video sumber tidak ditemukan"}` (bukan 500); resolusi salah → 400.
- Unduh lewat path web: `GET /clips/<pid>/t4a-cek-ekspor_720p.mp4` → 200 `video/mp4`.
- Skrip cek menghapus work/<pid>/ + clips/<pid>/ project uji; dicek ulang di akhir (PASS "file uji dibersihkan").

KEPUTUSAN RANCANGAN (perlu diketahui review):
1. Body `POST /api/export` tidak memuat `project_id`, jadi `clip_id` = slug klip yang sudah ada; project pemiliknya dicari di `clips/<pid>/[raw/]<clip_id>.mp4` (PID_RE + SLUG_RE sebagai guard).
2. Export = render ulang dari video sumber via `render_clips.render()` (bukan transcode file klip) supaya tidak ada perintah ffmpeg duplikat. `do_tighten=False`; `candidate_index` diambil dari `<clip_id>.meta.json`; aspect/title/watermark/crop mengikuti `render_prefs` + `crops` project. Kalau klip tidak punya segmen/sumber → job `failed` dengan `error` jelas.
3. Caption: `burn_caption=true` → `subtitle_burn.build_caption_ass()` + `ass=_captions.ass` dirantai setelah `ass=_overlay.ass` (bukan pipeline baru); waktu kata digeser ke timeline klip (`start` segmen), lalu file ass sementara dihapus di `render()`.
4. `res_scale = {"1080p": 1.0, "720p": 720/1080}` terhadap tabel ASPECTS (1080-base), fps lewat opsi output `-r`; nama file akhir dari `out_name` = `<clip_id>_<resolution>.mp4` di `clips/<pid>/`.
5. `DATA-MODEL.md` §1 menyebut tabel SQLite `export_jobs`, tapi prompt T4a menetapkan state di `work/<pid>/exports.json` → dipakai `exports.json` (prompt menang); tabel SQLite tidak dibuat.

MENYIMPANG: none (exports.json sesuai prompt; `export_jobs` SQLite sengaja tidak dibuat — lihat poin 5).
SISA: none. Catatan: backend :8000 direstart dengan kode baru (pid uvicorn baru) dan dibiarkan hidup.
