# COMPETITOR-MATRIX — seberapa dalam tool clipping lain?

Diambil 23 Okt 2026. Sumber: halaman harga/fitur resmi (Opus, Submagic, Klap, Descript, CapCut) + editor Vizard yang diukur langsung dari DOM.
Angka bertanda *(3rd)* dari perbandingan pihak ketiga, bukan vendor.

## Klasifikasi: ada 3 kelas, jangan dicampur
| Kelas | Ciri | Isi |
|---|---|---|
| **A. Clip-finder + styler dangkal** | AI potong klip, editor 1–3 menit per klip | Opus Clip, Submagic, Klap, Slice |
| **B. Clip-finder + editor penuh** | AI potong klip **dan** editor multi-track | **Vizard** (langka) |
| **C. NLE penuh + AI assist** | editor beneran, clipping cuma fitur sampingan | Descript, CapCut |

Temuan utama: **dugaan josjis benar** — Vizard memang paling dalam di kelasnya. Di kelas A, tidak ada yang punya timeline multi-track.

## Matriks fitur (yang bisa diverifikasi)
| Fitur | Vizard | Opus Clip | Submagic | Klap | Descript | CapCut |
|---|---|---|---|---|---|---|
| Auto potong highlight | ✅ | ✅ + Virality Score | ✅ (Magic Clips, add-on $19) | ✅ + Virality Score | ⚠️ lewat Underlord | ✅ AutoCut |
| Edit lewat transkrip | ✅ per kata `[3.0s]` | ❌ (teks dipotong di caption) | ✅ **text-based trimming** | ✅ transcript editing | ✅ inti produk | ⚠️ terbatas |
| Timeline multi-track | ✅ **5 track** | ❌ | ❌ | ❌ | ✅ (sequence editor) | ✅ |
| Rail tool 10 buah | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Caption gaya | ✅ CSS+JSON, bisa diunduh | ✅ 20+ bahasa, animated | ✅ **123 bahasa**, ini keunggulan mereka | ✅ | ✅ | ✅ |
| Hapus filler/silence | ❌ | ✅ (Starter) | ✅ (Pro) | ❌ | ✅ | ⚠️ |
| Auto zoom | ❌ | ⚠️ | ✅ (Pro) | ❌ | ✅ | ⚠️ |
| B-roll | ✅ rail | ⚠️ | ✅ + Storyblocks (Pro) | ❌ | ✅ | ✅ |
| Brand kit / template | ✅ + Template | 1 template (Starter) | ⚠️ | ✅ brand kits | ✅ Brand Studio | ✅ |
| Auto-post sosmed | ✅ | ✅ | ✅ | ✅ **+ analytics** | ⚠️ | ⚠️ |
| API publik | ✅ (free juga) | ⚠️ | ✅ (Starter 10 mnt/bln) | ✅ + MCP + n8n | ✅ API + MCP | ❌ |
| Free tier | **60 kredit/bln, 720p, watermark** | 60 mnt/bln, watermark | ❌ (try only) | **1 video** | ✅ terbatas | ✅ |
| Harga mulai | $29/bln | **$15/bln** (150 kredit) | $12/bln (tahunan, 2 mnt/video) | $29/bln | $19+/bln | $10/bln |

## Siapa menang di apa
| Dimensi | Pemenang | Catatan |
|---|---|---|
| Kedalaman editor | **Vizard** (kelas B), Descript (kelas C) | Vizard satu-satunya clip-finder dengan timeline nyata |
| Kualitas caption | **Submagic** | 123 bahasa, 99% akurasi klaim mereka |
| Distribusi + analitik | **Klap** | post + schedule + analytics satu tempat |
| Harga per kredit | **Opus** | $15 → 150 kredit, termurah di kelas A |
| Long video | Opus 10 jam, Klap 4 jam, Vizard 10 jam (paid) | free Vizard cuma 60 menit |
| Otomasi/API | **Descript** (API+MCP), Klap (MCP, n8n) | Vizard API terbuka bahkan di free (sudah kita buktikan) |
| Batas durasi per video | Submagic paling ketat: **2 menit** (Starter), 5 menit (Pro) | jangan tiru model ini |

## Yang berubah di rencana redesign
Vizard punya 10 tool karena dia mengejar editor penuh. **Kita tidak perlu 10.** Yang wajib cuma 3–4,
sisanya justru lebih baik diambil dari kompetitor lain karena murah di pipeline lokal:

| Fitur | Dari siapa | Biaya di repo lu | Putusan |
|---|---|---|---|
| Transcript + timeline + export | Vizard | 6–8 + 5–6 + 2 jam | **WAJIB (P0)** |
| Hapus filler/silence | Opus/Submagic | **sudah ada** di `chopify/tighten.py` | ekspos ke UI, 1 jam |
| Caption presets banyak bahasa | Submagic | `chopify/subtitle_burn.py` sudah ada | tambah 5 preset, 3 jam |
| Auto zoom / punch-in | Submagic/Descript | belum ada | P1, 3 jam (ffmpeg zoompan) |
| Safe zone + ratio berlabel | Vizard | belum | P1, 2 jam |
| Auto-post + analitik | Klap | belum, butuh OAuth platform | **P2, tunda** |
| Brand kit / template | Vizard/Klap | belum | **P2, tunda** |
| B-roll library | Submagic | belum, butuh storage+lisensi | **P2, tunda** |
| Rail 10 tool | Vizard | — | **JANGAN ditiru**; 4 cukup |

## Urutan prioritas final (menggantikan URUTAN di STUDIO-DIFF)
| # | Fitur | Alasan | Jam |
|---|---|---|---|
| P0-1 | Token + shell light (R1+R2) | efek persepsi terbesar per jam | 5 |
| P0-2 | Transcript panel + klik-seek + potong | inti "terasa editor" | 6–8 |
| P0-3 | Timeline 3 track | pelengkap transcript | 5–6 |
| P0-4 | Export panel | klip harus bisa keluar | 2 |
| P1-1 | Ekspos filler/silence removal | sudah ada, cuma disembunyikan | 1 |
| P1-2 | 5 caption preset (pindah dari `SubtitleStyleEditor`) | menang lawan Vizard free | 3 |
| P1-3 | Safe zone + ratio berlabel | kepuasan instan | 2 |
| P1-4 | Auto zoom | menyaingi Submagic Pro | 3 |
| P2 | auto-post, brand kit, b-roll, rail penuh | mahal, bukan pembeda | tunda |

Total sampai P1: **±27 jam**. Itu titik di mana app lu secara fitur sudah di atas Vizard free
dan setara kelas B, tanpa mengejar NLE penuh.
