# IMPLEMENTATION-STRATEGY — cara mengerjakan

## 1. Aturan kerja
- Satu tugas = satu branch `t<N>-<slug>` = satu PR. Merge hanya setelah gate lulus.
- Commit kecil, pesan: `T2: transcript panel + seek` (prefix kode tugas).
- Tidak ada refactor di luar cakupan tugas. Kalau ketemu masalah lain, tulis di laporan bagian `SISA`.
- Setiap tugas mulai dengan `git pull` dan diakhiri `npm run build` lulus.

## 2. Urutan & ketergantungan
```
P0:  T1 shell ─┬─ T2 transcript ─┬─ T3 timeline ─┬─ T4 export
                │                 │               └─ T6 safe-zone+zoom
                └─ T5 filler+caption
P1:  T7 akurasi ─┬─ T8 diarisasi
                 └─ T9 translasi
P2:  T10 b-roll ∥ T11 brand kit ∥ T12 background/layout ∥ T13 posting
```
| Tugas | Prioritas | Isi | Tergantung | Jam |
|---|---|---|---|---|
| T1 | P0 | token + shell | — | 5 |
| T2 | P0 | transcript + seek + potong | T1 | 6–8 |
| T3 | P0 | timeline 3 track | T2 | 5–6 |
| T4 | P0 | export modal + job | T3 | 2 |
| T5 | P0 | filler/silence + 5 preset caption | T1 | 4 |
| T6 | P0 | safe-zone + ratio + auto zoom | T3 | 4 |
| T7 | P1 | akurasi transkripsi (large-v3, glosarium, WER) | P0 lulus | 5 |
| T8 | P1 | diarisasi speaker (pyannote / heuristik) | T7 | 6 |
| T9 | P1 | translasi subtitle + cache | T7 | 5 |
| T10 | P2 | b-roll folder lokal | T3 | 6 |
| T11 | P2 | brand kit | T4 | 4 |
| T12 | P2 | background fill + layout | T3 | 6 |
| T13 | P2 | antrian posting + analitik (OAuth) | T4 | 8 |

Total ±68 jam. P0 dulu sampai gate lulus — jangan lompat ke P1.

## 3. Gate (harus lulus semua sebelum merge)
1. `cd frontend && npm run build` → 0 error, 0 warning baru.
2. Screenshot `after/` di 1440×900 dan 1280×800 — tidak ada elemen terpotong/overflow.
3. Kriteria terima tugas terpenuhi (cek satu per satu, tulis hasilnya).
4. `grep -r "dark:\|bg-black\|bg-dark\|neon\|gradient" frontend/src` → kosong untuk file yang disentuh.
5. Tidak ada `TODO`/`console.log`/data dummy di diff.
6. `eslint` (kalau ada) tidak menambah error baru.

## 4. Paralelisasi (kalau pakai beberapa agent)
- **Jangan paralel** T2 dan T3 — keduanya menyentuh `StudioView` state.
- Boleh paralel: T5 dengan T2 · T6 dengan T4 · T10/T11/T12/T13 saling paralel (file berbeda) setelah T3/T4 merge.
- P1 (T7–T9) **serial**: T7 dulu, T8 dan T9 baru boleh bersamaan.
- Tiap agent kerja di branch sendiri; merge berurutan T1 → T2 → T3 → T4, sisanya menyusul.
- Kalau ada konflik di `StudioView.jsx`: yang menang adalah branch yang lebih dulu merge; branch kedua rebase, **jangan** timpa.

## 5. Rollback
- Tiap PR kecil (≤600 baris diff). Kalau gate gagal 2× pada tugas yang sama: `git revert` PR, tulis BLOCKED + penyebab.
- Simpan screenshot `before/` sebelum mulai — dipakai bukti kalau harus rollback.

## 6. Pembagian model (murah dulu — detail di `MODELS.md`)
| Tugas | Utama (gratis/murah) | Eskalasi |
|---|---|---|
| T1 shell | `ocf/glm-5.3-flash-free` | `ocf/deepseek-v4.1-flash-free` → sonnet-5 |
| T2 transcript | `ninerouter/cbai/deepseek-v4.1-flash` | river/deepseek → sonnet-5 |
| T3 timeline | `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash` | cbai → sonnet-5 |
| T4 export | `ocf/deepseek-v4.1-flash-free` | cbai |
| T5 filler+caption | `ocf/glm-5.3-flash-free` | mimo-free |
| T6 safe-zone+zoom | `ocf/glm-5.3-flash-free` | deepseek-free |
| T7 akurasi | `ninerouter/cbai/deepseek-v4.1-flash` | glm-free |
| T8 diarisasi | `ninerouter/cbai/deepseek-v4.1-flash` | river/deepseek |
| T9 translasi | `ocf/deepseek-v4.1-flash-free` | cbai |
| T10–T12 | `ocf/glm-5.3-flash-free` | deepseek-free / gemini-low |
| T13 posting | `ninerouter/cbai/deepseek-v4.1-flash` | deepseek-free |
| Review | `ninerouter/ag/gemini-3.8-flash-low` | sonnet-5 |

Eskalasi hanya setelah 2 kegagalan nyata. Catat di laporan: model, alasan gagal.

## 7. Definisi "selesai" proyek
- Semua T1–T6 merged, gate lulus.
- Studio punya: transcript bisa diklik & dipotong, timeline 3 track, rail 4 tool, export 1080p dengan/tanpa caption, safe zone, filler removal terlihat.
- Galeri, project list, modal semuanya light theme, tanpa sisa `dark-*`.
- `docs/evidence/` berisi before/after tiap tugas.
