// node tools/verify-t11.mjs — brand kit (T11): tab Brand di Settings, unggah/posisi/ukuran,
// simpan, dan logo brand muncul di stage pratinjau (bukan cuma di hasil render).
// Pakai _mock.py + build di frontend/dist. Jalankan dari folder frontend.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(process.cwd(), "..");
const OUT = resolve(ROOT, "docs", "evidence", "T11", "after");
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

async function openSettings() {
  await page.locator('[aria-label="Buka menu"]').click({ force: true });
  await sleep(400);
  await page.getByText("Pengaturan", { exact: true }).click({ force: true });
  await sleep(900);
}

try {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await sleep(500);

  // logo harus tampil di stage studio (item kriteria: preview, bukan hanya hasil render)
  await page.locator(".vz-card").first().click({ force: true }).catch(() => {});
  await sleep(1800);
  const stageLogo = page.locator('[data-region="brand-logo"]');
  const logoVisible = await stageLogo.isVisible().catch(() => false);
  const logoLoaded = logoVisible && await stageLogo
    .evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false);
  ck("logo brand tampil di stage pratinjau", logoVisible && logoLoaded);
  await shot("stage-logo-brand.png");

  await openSettings();
  await page.locator('[data-testid="tab-brand"]').click({ force: true });
  await sleep(600);
  ck("tab Brand terbuka", await page.locator('[data-region="brand-tab"]').isVisible().catch(() => false));

  const colorPick = await page.locator('[data-testid^="brand-color-"]').count();
  const sizeSlider = await page.locator('[data-testid="brand-logo-size"]').count();
  const corners = await page.locator('[data-testid^="brand-corner-"]').count();
  const fonts = await page.locator('[data-testid^="brand-font-"]').count();
  const uploads = await page.locator('[data-testid^="brand-upload-"]').count();
  const logoThumb = await page.locator('[data-region="brand-logo"] img').count();
  ck("kontrol lengkap: 2 color picker, slider 4-15, 4 sudut, 3 font, 3 unggahan",
    colorPick === 2 && sizeSlider === 1 && corners === 4 && fonts === 3 && uploads === 3,
    `warna=${colorPick} slider=${sizeSlider} sudut=${corners} font=${fonts} unggah=${uploads}`);
  ck("logo tampil di tab Brand (pratinjau berkas)", logoThumb >= 1);
  await shot("brand-tab.png");

  // ubah posisi + ukuran + font lalu simpan → stage ikut berubah
  await page.locator('[data-testid="brand-corner-tl"]').click({ force: true });
  await page.locator('[data-testid="brand-font-Impact"]').click({ force: true });
  await page.locator('[data-testid="brand-logo-size"]').fill("13");
  await sleep(300);
  await shot("brand-tab-diubah.png");
  await page.locator('[data-testid="brand-save"]').click({ force: true });
  await sleep(1200);
  const savedText = await page.locator('[data-region="brand-tab"]').innerText().catch(() => "");
  ck("simpan brand kit sukses + pesan Indonesia", /Brand kit tersimpan/.test(savedText),
    savedText.split("\n").filter((l) => l.includes("Brand kit tersimpan")).join(" "));

  await page.getByText("Tutup", { exact: true }).click({ force: true });
  await sleep(1000);
  const corner = await stageLogo.evaluate((el) => getComputedStyle(el).top).catch(() => "");
  const sizeNow = await stageLogo.evaluate((el) => el.style.height).catch(() => "");
  ck("stage ikut posisi/ukuran baru setelah disimpan (tl, 13%)",
    await stageLogo.isVisible().catch(() => false) && sizeNow === "13%" && corner !== "",
    `top=${corner} height=${sizeNow}`);
  await shot("stage-logo-sudut-kiri-atas.png");

  ck("tidak ada error runtime di halaman", errors.length === 0, errors.join(" | ").slice(0, 160));
} finally {
  await browser.close();
  if (srv) srv.kill();
}

console.log(`\n${pass.length} lulus, ${fail.length} gagal`);
if (fail.length) { console.log("GAGAL: " + fail.join("; ")); process.exit(1); }
