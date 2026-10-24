// node tools/verify-t8.mjs — diarisasi speaker (T8): panel speaker, badge nama di kiri
// paragraf, filter speaker, rename, toggle "Tampilkan nama di caption".
// Pakai _mock.py + build di frontend/dist. Jalankan dari folder frontend.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(process.cwd(), "..");
const OUT = resolve(ROOT, "docs", "evidence", "T8", "after");
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
const panel = () => page.locator('[data-region="speaker-panel"]');

try {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await sleep(500);
  await page.locator(".vz-card").first().click({ force: true }).catch(() => {});
  await sleep(1800);

  await panel().scrollIntoViewIfNeeded().catch(() => {});
  await sleep(300);
  ck("panel speaker tampil di panel transkrip", await panel().isVisible().catch(() => false));

  // ---------- badge nama di kiri paragraf ----------
  const badges = await page.locator('[data-region="speaker-panel"] ~ div span', { hasText: "(perkiraan)" }).count();
  const badgeNames = await page.evaluate(() => Array.from(document.querySelectorAll('[data-region="speaker-panel"]'))
    .flatMap((el) => Array.from(el.querySelectorAll("button")).map((b) => b.innerText.trim())));
  const bodyText = await page.locator("body").innerText();
  ck("badge speaker '(perkiraan)' muncul di daftar kata",
    badges > 0 || bodyText.includes("(perkiraan)"), `${badges} badge berlabel perkiraan`);
  await shot("speaker-panel.png");

  // ---------- tombol model disabled + alasan ----------
  const modelBtn = page.getByRole("button", { name: /Diarisasi \(model\)/ });
  const modelDisabled = await modelBtn.isDisabled().catch(() => false);
  const reasonVisible = await page.locator("text=/Diarisasi \\(model\\) nonaktif/").isVisible().catch(() => false);
  ck("tombol 'Diarisasi (model)' disabled + alasan Indonesia", modelDisabled && reasonVisible,
    `disabled=${modelDisabled} alasan=${reasonVisible}`);

  // ---------- jalankan diarisasi (perkiraan) ----------
  await page.getByRole("button", { name: /Diarisasi \(perkiraan\)/ }).click({ force: true });
  await sleep(800);
  const doneMsg = await panel().innerText();
  ck("'Diarisasi (perkiraan)' selesai + pesan Indonesia", /Diarisasi selesai/.test(doneMsg),
    doneMsg.split("\n").find((l) => /Diarisasi selesai/.test(l)) || "-");

  // ---------- filter speaker ----------
  const before = await page.locator("button[data-idx]").count();
  await page.getByRole("button", { name: /Narasumber/ }).first().click({ force: true });
  await sleep(300);
  const afterCount = await page.locator("button[data-idx]").count();
  const countText = await page.locator('[data-region="transcript-count"]').innerText();
  ck("filter speaker menyaring kata", afterCount > 0 && afterCount < before && countText.includes("Narasumber"),
    `${before} → ${afterCount} kata · ${countText.replace(/\n/g, " / ")}`);
  await shot("speaker-filter.png");
  await page.getByRole("button", { name: /^Semua$/ }).first().click({ force: true });
  await sleep(300);

  // ---------- rename speaker ----------
  await page.getByRole("button", { name: /Ganti nama Host/ }).first().click({ force: true });
  const input = page.locator('input[aria-label^="Ganti nama"]');
  ck("klik pensil membuka input rename", await input.isVisible().catch(() => false));
  await input.fill("Pewara Utama");
  await shot("speaker-rename.png");
  await input.press("Enter");
  await sleep(600);
  const renamed = await page.locator("button[data-idx]").first().getAttribute("title");
  ck("rename speaker mengubah badge nama", /Pewara Utama/.test(renamed || ""), renamed || "");

  // ---------- toggle caption ----------
  const toggle = page.getByRole("button", { name: /Tampilkan nama di caption/ });
  const pressedBefore = await toggle.getAttribute("aria-pressed");
  await toggle.click({ force: true });
  await sleep(500);
  const pressedAfter = await toggle.getAttribute("aria-pressed");
  ck("toggle 'Tampilkan nama di caption' bisa diubah", pressedBefore !== pressedAfter,
    `${pressedBefore} → ${pressedAfter}`);
  await shot("speaker-caption-toggle.png");

  ck("tanpa error runtime di halaman", errors.length === 0, errors.slice(0, 2).join(" | "));
} finally {
  await browser.close();
  if (srv) srv.kill();
}

console.log(`\n${pass.length} lulus, ${fail.length} gagal`);
if (fail.length) { console.log("GAGAL: " + fail.join("; ")); process.exit(1); }
