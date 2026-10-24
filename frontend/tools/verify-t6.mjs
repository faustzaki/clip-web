// node tools/verify-t6.mjs — pill toolbar (Ratio/Background/Layout/Layar penuh), safe zone, auto zoom.
// Pakai _mock.py (API tiruan) + build di frontend/dist. Jalankan dari folder frontend.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(process.cwd(), "..");
const OUT = resolve(ROOT, "docs", "evidence", "T6", "after");
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
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const shot = (name) => page.screenshot({ path: resolve(OUT, name) });

try {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await sleep(500);
  await page.locator(".vz-card").first().click({ force: true }).catch(() => {});
  await sleep(1800);

  // ---------- pill toolbar ----------
  const pills = {
    ratio: page.locator('[data-region="pill-ratio"]'),
    background: page.locator('[data-region="pill-background"]'),
    layout: page.locator('[data-region="pill-layout"]'),
    fullscreen: page.locator('[data-region="pill-fullscreen"]'),
  };
  const labels = await Promise.all(Object.values(pills).map((l) => l.innerText().catch(() => "")));
  ck("pill toolbar punya 4 tombol berlabel teks",
    labels[0].includes("Ratio (9:16)") && labels[1].includes("Background")
    && labels[2].includes("Layout") && labels[3].includes("Layar penuh"),
    labels.join(" | "));
  await shot("pill-toolbar.png");

  // ---------- ratio berlabel + menu 4 opsi ----------
  await pills.ratio.click({ force: true });
  await page.waitForTimeout(250);
  const ratioItems = await page.locator('[role="menuitemradio"]').allInnerTexts();
  ck("menu Ratio berisi 9:16 / 1:1 / 4:5 / 16:9",
    ratioItems.length === 4 && ["9:16", "1:1", "4:5", "16:9"].every((r) => ratioItems.join(" ").includes(r)),
    ratioItems.join(" | ").replace(/\n/g, " / "));
  await shot("ratio-menu.png");

  const stage = page.locator('[data-region="preview-frame"]');
  const before = await stage.boundingBox();
  await page.locator('[role="menuitemradio"]', { hasText: "4:5" }).click({ force: true });
  await page.waitForTimeout(600);
  const after = await stage.boundingBox();
  const ar = after ? after.width / after.height : 0;
  ck("pilih 4:5: label pill ikut berubah", (await pills.ratio.innerText()).includes("Ratio (4:5)"),
    await pills.ratio.innerText());
  ck("preview mengikuti rasio 4:5 (lebar/tinggi ≈ 0.8)", Math.abs(ar - 0.8) < 0.05,
    `${after ? Math.round(after.width) : 0}x${after ? Math.round(after.height) : 0} = ${ar.toFixed(3)}`);
  await shot("ratio-4x5.png");

  await pills.ratio.click({ force: true });
  await page.waitForTimeout(200);
  await page.locator('[role="menuitemradio"]', { hasText: "9:16" }).click({ force: true });
  await page.waitForTimeout(500);

  // ---------- panel Layout + safe zone ----------
  await pills.layout.click({ force: true });
  await page.waitForTimeout(300);
  const panel = page.locator('[data-region="layout-panel"]');
  ck("panel Layout terbuka", (await panel.count()) > 0);
  const slider = panel.locator("#zoom-manual");
  ck("slider Zoom manual 100–160",
    (await slider.count()) > 0 && (await slider.getAttribute("min")) === "100"
    && (await slider.getAttribute("max")) === "160",
    `${await slider.getAttribute("min")}–${await slider.getAttribute("max")}`);
  await shot("layout-panel.png");

  const frameBefore = await page.locator('[data-region="safe-zone"]').count();
  const zoneToggle = panel.getByRole("button", { name: "Area aman" });
  const stageBox = await stage.boundingBox();
  await zoneToggle.click({ force: true });
  await page.waitForTimeout(400);
  const zone = page.locator('[data-region="safe-zone"]');
  const zoneGeom = await page.evaluate(() => {
    const frame = document.querySelector('[data-region="preview-frame"]');
    const z = document.querySelector('[data-region="safe-zone"]');
    const r = z ? z.getBoundingClientRect() : null;
    return frame && r ? { cw: frame.clientWidth, ch: frame.clientHeight, zw: r.width, zh: r.height } : null;
  });
  const stageAfter = await stage.boundingBox();
  ck("safe zone tampil setelah toggle", frameBefore === 0 && (await zone.count()) === 1);
  ck("safe zone 88% x 80% dari area preview",
    zoneGeom && Math.abs(zoneGeom.zw - 0.88 * zoneGeom.cw) <= 4 && Math.abs(zoneGeom.zh - 0.8 * zoneGeom.ch) <= 4,
    zoneGeom ? `${zoneGeom.zw.toFixed(0)}x${zoneGeom.zh.toFixed(0)} dari ${zoneGeom.cw}x${zoneGeom.ch}` : "tidak ada");
  ck("komposisi preview tidak bergeser saat safe zone muncul",
    stageBox && stageAfter && Math.abs(stageBox.width - stageAfter.width) < 2
    && Math.abs(stageBox.height - stageAfter.height) < 2,
    `${Math.round(stageBox.width)}x${Math.round(stageBox.height)} -> ${Math.round(stageAfter.width)}x${Math.round(stageAfter.height)}`);
  ck("label 'Area aman' ada", (await zone.innerText()).includes("Area aman"));
  await shot("safe-zone.png");

  // ---------- auto zoom ----------
  const autoBtn = panel.getByRole("button", { name: "Auto zoom" });
  await autoBtn.click({ force: true });
  await page.waitForTimeout(1200);
  const note = await page.locator('[data-region="zoom-note"]').innerText().catch(() => "");
  ck("Auto zoom menghitung keyframes (nota jumlah titik)", /titik zoom siap/.test(note), note || "tidak ada nota");
  const badge = page.locator('[data-region="timeline-zoom-badge"]');
  ck("badge Zoom muncul di track video timeline", (await badge.count()) > 0,
    (await badge.count()) ? await badge.first().innerText() : "tidak ada");
  await shot("auto-zoom.png");

  // slider -> prefs tersimpan
  await slider.fill("130");
  await slider.dispatchEvent("pointerup");
  await page.waitForTimeout(600);
  const zoomManual = await page.evaluate(() =>
    fetch("/api/projects/a1b2c3d4e5/state").then((r) => r.json()).then((s) => s.project?.render_prefs?.zoom_manual));
  ck("Zoom manual 130% tersimpan ke prefs", Number(zoomManual) === 130, String(zoomManual));
  const sliderLabel = await panel.locator('label[for="zoom-manual"]').innerText().catch(() => "");
  ck("slider menampilkan nilai baru (130%)", sliderLabel.includes("130"), sliderLabel || "tidak ada label");
  await shot("zoom-manual-130.png");

  ck("tanpa pageerror", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  if (srv) srv.kill();
}

console.log(`\n${fail.length} gagal`);
process.exit(fail.length ? 1 : 0);
