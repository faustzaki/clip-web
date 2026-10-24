// node tools/verify-t13.mjs — antrian posting (T13): modal kalender 7 hari, caption siap salin,
// jadwalkan + batal, dan tab Analitik yang jujur bilang `Belum tersedia` tanpa OAuth platform.
// Pakai _mock.py + build di frontend/dist. Jalankan dari folder frontend.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(process.cwd(), "..");
const OUT = resolve(ROOT, "docs", "evidence", "T13", "after");
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
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const shot = (name) => page.screenshot({ path: resolve(OUT, name) });

try {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await sleep(500);
  await page.locator(".vz-card").first().click({ force: true }).catch(() => {});
  await sleep(1800);

  await page.locator('[data-testid="open-post-queue"]').click({ force: true });
  await sleep(1200);
  const modal = page.locator('[data-region="post-queue"]');
  ck("modal Antrian posting terbuka dari header", await modal.isVisible().catch(() => false));

  const banner = await page.locator('[data-testid="post-oauth-status-text"]').innerText().catch(() => "");
  ck("status OAuth jujur: `Belum terhubung`", banner.trim() === "Belum terhubung", banner.trim());

  const days = await page.locator('[data-region="post-calendar"] [data-testid^="post-day-"]').count();
  ck("kalender 7 hari ke depan", days === 7, `kolom=${days}`);
  await shot("post-queue-kalender.png");

  // caption: judul + hashtag, di bawah 2200 karakter, tombol salin benar-benar menyalin
  const caption = await page.locator('[data-testid="post-caption"]').inputValue();
  ck("caption berhashtag & < 2200 karakter",
    caption.length > 0 && caption.length < 2200 && /#\w/.test(caption),
    `len=${caption.length} baris=${caption.split("\n").length}`);
  await page.locator('[data-testid="post-copy-caption"]').click({ force: true });
  await sleep(400);
  const clipboard = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  ck("tombol Salin caption menaruh teks yang sama di clipboard",
    clipboard.replace(/\r\n/g, "\n").includes(caption.split("\n")[0]),
    clipboard.slice(0, 40));

  // jadwalkan satu klip ke platform lain → muncul di kolom hari
  const before = await page.locator('[data-testid^="post-item-"]').count();
  const when = new Date(Date.now() + 86_400_000);
  when.setHours(10, 30, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  await page.locator('[data-testid="post-platform-shorts"]').click({ force: true });
  await page.locator('[data-testid="post-when"]').fill(
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}`,
  );
  await sleep(400);
  await page.locator('[data-testid="post-schedule"]').click({ force: true });
  await sleep(1200);
  const after = await page.locator('[data-testid^="post-item-"]').count();
  const errorText = await page.locator('[data-testid="post-error"]').count();
  ck("tombol Jadwalkan menyimpan ke kalender", after === before + 1 && errorText === 0,
    `${before} → ${after} item, error=${errorText}`);
  await shot("post-queue-terjadwal.png");

  // batal → item hilang lagi
  const newest = page.locator('[data-testid^="post-item-"]').last();
  const cancelBtn = newest.locator('button:has-text("Batal")');
  await cancelBtn.click({ force: true });
  await sleep(1200);
  const afterCancel = await page.locator('[data-testid^="post-item-"]').count();
  ck("tombol Batal menghapus jadwal", afterCancel === before, `sisa=${afterCancel}`);

  // tab Analitik tanpa OAuth: tiga angka + alasan Indonesia, bukan error
  await page.locator('[data-testid="post-tab-analytics"]').click({ force: true });
  await sleep(1200);
  const analyticsText = await page.locator('[data-region="post-analytics"]').innerText().catch(() => "");
  const metrics = await page.locator('[data-testid^="post-metric-"]').count();
  ck("tab Analitik: 3 angka + `Belum tersedia` + alasan OAuth",
    metrics === 3 && /Belum tersedia/.test(analyticsText) && /Belum terhubung/.test(analyticsText),
    analyticsText.split("\n").filter(Boolean).slice(0, 4).join(" | "));
  await shot("post-analitik.png");

  ck("tidak ada error runtime di halaman", errors.length === 0, errors.join(" | ").slice(0, 160));
} finally {
  await browser.close();
  if (srv) srv.kill();
}

console.log(`\n${pass.length} lulus, ${fail.length} gagal`);
if (fail.length) { console.log("GAGAL: " + fail.join("; ")); process.exit(1); }
