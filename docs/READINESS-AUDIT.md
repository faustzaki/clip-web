# READINESS-AUDIT — apakah dokumen ini siap dieksekusi?

Diperiksa 23 Okt 2026 terhadap repo nyata + picker OMP nyata. **Bukan klaim, semua dicek.**

## 1. Picker OMP — status sebenarnya
OMP v18.12.6, config `~/.omp/agent/models.yml`, 5 provider, **70 model** saat diperiksa.
Rekomendasi awal gue memakai prefix mentah 9Router — 3 dari 8 **tidak ada** di picker:

| Rekomendasi | Di picker OMP | Tindakan |
|---|---|---|
| `T-SOTA/claude-sonnet-5` | ❌ tidak ada | **ditambahkan** |
| `T-SOTA/claude-opus-5-5` | ❌ | **ditambahkan** |
| `T-SOTA/claude-opus-5` | ❌ | **ditambahkan** |
| `T-SOTA/claude-opus-5-thinking` | ❌ | **ditambahkan** |
| `T-SOTA/claude-sonnet-4-6` | ❌ | **ditambahkan** |
| `T-SOTA/claude-fable-5` | ❌ | **ditambahkan** |
| `T-SOTA/claude-haiku-5-5` | ❌ | **ditambahkan** |
| `cbai/deepseek-v4.1-flash` | ✅ | pakai apa adanya |
| `ag/gemini-3.8-flash-high` | ✅ | pakai apa adanya |
| `oc/*` | ⚠️ ada di provider **`ocf`**, tanpa prefix `oc/` | pakai `ocf/glm-5.3-flash-free` |
| `gcli/grok-4.5` | ⚠️ ada di provider **`grok-cli`** | pakai `grok-cli/grok-4.5` |

Bukti tambahan diuji langsung: `omp -p --model="ninerouter/T-SOTA/claude-sonnet-5"` → **`PICKER_OK`**.
Backup config: `models.yml.pre-cinder-<timestamp>`.

### Nama final untuk OMP (pakai ini, bukan nama 9Router mentah)
| Kebutuhan | Nama di OMP |
|---|---|
| default / kode harian | `ninerouter/T-SOTA/claude-sonnet-5` |
| refactor besar (T2, T3) | `ninerouter/T-SOTA/claude-opus-5-5` |
| review / QA | `ninerouter/T-SOTA/claude-opus-5` |
| perencanaan | `ninerouter/T-SOTA/claude-opus-5-thinking` |
| kerja mekanis cepat | `ninerouter/cbai/deepseek-v4.1-flash` |
| CSS/edit massal | `ocf/glm-5.3-flash-free` |
| overlay visual (T6) | `ninerouter/ag/gemini-3.8-flash-high` |
| opini kedua | `grok-cli/grok-4.5` |

### Jebakan: model MATI yang masih ada di picker
Sudah diuji, semua gagal 401/402/403/404/502/429: `mistral/*`, `clean/*`, `beat/*`, `tokenharbor/*`,
`cx/*`, `ag/claude-*` (404 upstream), `ag/gemini-3.1-pro-low`, `ag/gemini-pro-agent`, `cbai/glm-5.0`,
`cbai/kimi-*`, `cbai/minimax-*`. **Jangan dipilih** meski muncul di daftar.

## 2. Siap implement? — belum 100%, tapi tinggal 4 hal kecil
| Cek | Status | Bukti |
|---|---|---|
| Dokumen aturan + UI + data + strategi | ✅ | 13 file di `docs/` |
| Prompt per tugas | ✅ | `prompts/00`–`07` |
| Model tersedia di picker | ✅ setelah audit ini | `PICKER_OK` |
| `TASKS.md` (papan status) | ❌ belum ada | dibuat oleh prompt 00 |
| Endpoint transcript/timeline/export | ❌ belum ada di `server.py` | 21 route terverifikasi, tidak satu pun untuk ini → benar, itu kerja T2/T3/T4 |
| `tighten.py` (filler/silence) | ✅ ada 128 baris | `chopify/tighten.py` |
| Face tracking untuk auto zoom | ✅ ada | `yunet` dipakai di `chopify/render_clips.py` |
| `zoompan` (auto zoom) | ❌ 0 kemunculan | kerja baru di T6, bukan konfigurasi |
| Registry preset caption | ⚠️ setengah | `subtitle_burn.py` (423 baris) punya `Fontsize`/`BorderStyle`/`Alignment`, tapi belum ada preset bernama → T5 wajib bikin registry |
| Endpoint publish (auto-post) | ✅ sudah ada | `POST /api/projects/{id}/clips/{slug}/publish` |

**Kesimpulan: siap dieksekusi** setelah: (1) jalankan prompt 00 (bikin `TASKS.md` + baseline screenshot, ±15 menit),
(2) pakai nama model kolom "Nama final" di atas, (3) T5 mulai dengan bikin registry preset, (4) T6 mulai dengan cek `render_clips.py` sebelum menulis `zoompan`.

## 3. Cakupan fitur — revisi: semua masuk (ADR-008 revisi)

| Fitur | Tugas | Status dokumen |
|---|---|---|
| Light theme, token, header, rail, strip | T1 | ✅ prompt siap |
| Transcript klik-seek + potong | T2 | ✅ |
| Timeline 3 track | T3 | ✅ |
| Export 1080p/720p + burn caption | T4 | ✅ |
| Hapus jeda + kata pengisi, 5 preset caption | T5 | ✅ |
| Safe zone + ratio + auto zoom | T6 | ✅ |
| **Akurasi transkripsi** (large-v3, glosarium, WER, edit kata, flag ragu) | **T7** | ✅ |
| **Diarisasi speaker** (pyannote + fallback heuristik) | **T8** | ✅ |
| **Translasi subtitle + dua bahasa + cache** | **T9** | ✅ |
| **B-roll folder lokal** | **T10** | ✅ |
| **Brand kit** (logo, warna, font, intro/outro) | **T11** | ✅ |
| **Background fill + layout reframe** | **T12** | ✅ |
| **Antrian posting + analitik** (OAuth opsional) | **T13** | ✅ (boleh BLOCKED) |

Sisa yang tetap di luar: kolaborasi multi-user, template marketplace, library b-roll berlisensi (kita pakai folder lokal), watermark removal (tidak perlu — render lokal bebas watermark).

**Total ±68 jam.** P0 (T1–T6) ±26 jam, P1 (T7–T9) ±16 jam, P2 (T10–T13) ±24 jam.
