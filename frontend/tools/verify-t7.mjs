// node tools/verify-t7.mjs — akurasi transkripsi (T7): kata ragu + filter, edit kata inline,
// tab Akurasi ASR (model + glosarium + WER). Pakai _mock.py + build di frontend/dist.
// Jalankan dari folder frontend.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(process.cwd(), "..");
const OUT = resolve(ROOT, "docs", "evidence", "T7", "after");
const BASE = process.env.PM_BASE || "http://127.0.0.1:8005";
const OWN_SERVER = !process.env.PM_BASE;

if (!existsSync(resolve(ROOT, "frontend/dist/index.html"))) {
  console.error("frontend/dist tidak ada — jalankan `npm run build` dulu di folder frontend.");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const pass = [], fail = [];
const ck = (n, c, d = "") => { (c ? pass : fail).push(n); console.log((c ? "PASS " : "FAIL ") + n + (d ? ` — ${d}` : "")); };

const srv = OWN_SERVER ? spawn("py", ["-3.13", "_mock.py"], { cwd: ROOT, stdio: "ignore", detached: false }) : null;
await sleep(1800);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const shot = (name) => page.screenshot({ path: resolve(OUT, name) });
const revealTranscript = async () => {
  await page.locator('[data-region="transcript-count"]').scrollIntoViewIfNeeded().catch(() => {});
  await sleep(300);
};

try {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await sleep(500);
  await page.locator(".vz-card").first().click({ force: true }).catch(() => {});
  await sleep(1800);

  // ---------- kata ragu: underline kuning + filter ----------
  const words = page.locator('[data-region="transcript-count"] ~ div button[data-idx]');
  const wordCount = await words.count();
  ck("panel transkrip tampil", wordCount > 0, `${wordCount} kata`);

  const underlined = await page.evaluate(() => Array.from(document.querySelectorAll("button[data-idx]"))
    .filter((b) => {
      const s = getComputedStyle(b);
      return s.borderBottomWidth === "2px" && s.borderBottomColor === "rgb(224, 168, 0)";
    }).length);
  ck("kata ragu bergaris bawah kuning #E0A800", underlined === 3, `${underlined} kata`);

  const filter = page.getByRole("button", { name: /Hanya perlu dicek/ });
  ck("tombol filter 'Hanya perlu dicek (3)' ada", await filter.isVisible().catch(() => false),
    await filter.innerText().catch(() => ""));
  await revealTranscript();
  await shot("transcript-kata-ragu.png");

  await filter.click({ force: true });
  await sleep(300);
  const filtered = await page.locator("button[data-idx]").count();
  const countText = await page.locator('[data-region="transcript-count"]').innerText();
  ck("filter menyisakan hanya kata ragu", filtered === 3 && countText.includes("3 kata perlu dicek"),
    `${filtered} kata · ${countText.replace(/\n/g, " / ")}`);
  await shot("transcript-filter-perlu-dicek.png");
  await filter.click({ force: true });
  await sleep(300);

  // ---------- edit kata inline ----------
  const target = page.locator('button[data-idx="1"]');
  ck("kata 'eee' (idx 1) ada", (await target.innerText()).includes("eee"), await target.innerText());
  await revealTranscript();
  await target.dblclick();
  const input = page.locator('input[aria-label^="Perbaiki kata"]');
  ck("klik dua kali membuka input edit", await input.isVisible().catch(() => false));
  await input.fill("eh");
  await shot("transcript-edit-kata.png");
  await input.press("Enter");
  await sleep(1200);
  ck("input edit tertutup setelah Enter", await input.isVisible().catch(() => false) === false);
  const bodyText = await page.locator("aside").first().innerText();
  ck("tidak ada pesan gagal simpan kata", !bodyText.includes("Gagal menyimpan kata"), bodyText.slice(0, 120));

  // ---------- tab Akurasi ASR ----------
  await page.getByRole("button", { name: "Buka menu" }).click({ force: true });
  await page.getByRole("button", { name: /Pengaturan/ }).click({ force: true });
  await sleep(900);
  await page.getByRole("button", { name: /Akurasi ASR/ }).click({ force: true });
  await sleep(700);

  const modal = page.locator("div.fixed.inset-0").last();
  const modalText = await modal.innerText();
  ck("tab Akurasi ASR memuat daftar model Whisper",
    ["Medium — default", "Large v3", "Auto — large-v3"].every((t) => modalText.includes(t)),
    modalText.slice(0, 160).replace(/\n/g, " / "));
  ck("model aktif = medium", modalText.includes("Medium — default, akurat & hemat waktu"), "");
  ck("disk bebas ditampilkan", /Disk bebas\s*[\d.,]+ GB/.test(modalText), (modalText.match(/Disk bebas[^\n]*/) || [""])[0]);

  const glos = modal.locator("textarea");
  const glosValue = await glos.inputValue();
  ck("editor glosarium terisi dari data/glossary.txt",
    glosValue.includes("Koperasi Merah Putih") && glosValue.includes("Mixue"), glosValue.replace(/\n/g, " | "));

  const werCells = await modal.locator("table tbody tr").allInnerTexts();
  ck("tabel WER punya 2 baris (sebelum & sesudah)", werCells.length === 2, werCells.join(" | ").replace(/\n/g, " "));
  const werNums = werCells.map((r) => Number((r.match(/(\d+[.,]\d+)%/) || [])[1]?.replace(",", "."))).filter((n) => !Number.isNaN(n));
  ck("WER sesudah lebih kecil dari sebelum", werNums.length === 2 && werNums[1] < werNums[0], werNums.join(" → "));
  ck("ringkasan perubahan WER tampil", /Selisih turun [\d.,]+ poin persen/.test(modalText),
    (modalText.match(/Selisih[^\n]*/) || [""])[0]);
  await shot("akurasi-wer.png");

  await modal.getByRole("button", { name: "Simpan Glosarium" }).click({ force: true });
  await sleep(700);
  const afterSave = await modal.innerText();
  ck("simpan glosarium memberi konfirmasi Indonesia", /Glosarium tersimpan \(\d+ istilah\)/.test(afterSave),
    (afterSave.match(/Glosarium tersimpan[^\n]*/) || [""])[0]);
  await shot("akurasi-glosarium-tersimpan.png");

  ck("tidak ada error runtime halaman", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close();
  if (srv) srv.kill();
}

console.log(`\nPASS ${pass.length} / FAIL ${fail.length}`);
if (fail.length) {
  console.log("GAGAL: " + fail.join("; "));
  process.exit(1);
}
