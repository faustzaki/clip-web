// node tools/verify-t5.mjs — panel Subtitles: 320px, 5 preset caption (preview stage ikut berubah), tighten.
// Pakai _mock.py (API tiruan, registry preset asli dari chopify/subtitle_burn.py) + build di frontend/dist.
// Jalankan dari folder frontend: node tools/verify-t5.mjs
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(process.cwd(), "..");
const OUT = resolve(ROOT, "docs", "evidence", "T5", "after");
const BASE = process.env.PM_BASE || "http://127.0.0.1:8005";
const OWN_SERVER = !process.env.PM_BASE;

if (!existsSync(resolve(ROOT, "frontend/dist/index.html"))) {
  console.error("frontend/dist tidak ada — jalankan `npm run build` dulu di folder frontend.");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const pass = [], fail = [];
const ck = (n, c, d = "") => { (c ? pass : fail).push(n); console.log((c ? "PASS " : "FAIL ") + n + (d ? ` — ${d}` : "")); };
const hexToRgb = (hex) => {
  const h = String(hex || "").replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};

const srv = OWN_SERVER ? spawn("py", ["-3.13", "_mock.py"], { cwd: ROOT, stdio: "ignore", detached: false }) : null;
await sleep(1800);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

try {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await sleep(500);
  await page.locator(".vz-card").first().click({ force: true }).catch(() => {});
  await sleep(1800);

  const rail = page.locator('[data-region="rail"] button[aria-label="Subtitles"]');
  ck("tombol rail Subtitles ada", (await rail.count()) > 0);
  await rail.click({ force: true });
  await page.waitForTimeout(600);

  const panel = page.locator('[data-region="tool-panel"]');
  ck("panel tool terbuka", (await panel.count()) > 0);
  const box = await panel.boundingBox();
  ck("lebar panel 320px", box && Math.abs(box.width - 320) < 2, `${Math.round(box?.width || 0)}px`);
  await page.screenshot({ path: resolve(OUT, "subtitles-panel.png") });

  const slider = page.locator('[data-testid="t5-silence-slider"]');
  ck("slider durasi sunyi 200–1200 default 400",
    (await slider.count()) > 0 && (await slider.getAttribute("min")) === "200"
    && (await slider.getAttribute("max")) === "1200" && (await slider.inputValue()) === "400");

  const presets = await page.evaluate(() => fetch("/api/options").then((r) => r.json()).then((o) => o.caption_presets || []));
  ck("5 preset dari registry", presets.length === 5, presets.map((p) => p.id).join(", "));

  const stageSel = '[data-subtitle-interactive="true"] span';
  for (const preset of presets) {
    const card = page.locator(`[data-testid="t5-preset-${preset.id}"]`);
    if (!(await card.count())) { ck(`preset ${preset.id} dirender`, false, "kartu tidak ada"); continue; }
    await card.click({ force: true });
    await page.waitForTimeout(500);
    const pressed = (await card.getAttribute("aria-pressed")) === "true";
    const stageColor = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).color : null;
    }, stageSel);
    const want = hexToRgb(preset.style.primary_color);
    await page.screenshot({ path: resolve(OUT, `preset-${preset.id}.png`) });
    ck(`preset ${preset.id} aktif + preview stage berubah`, pressed && stageColor === want,
      `stage=${stageColor} harap=${want}`);
  }

  await page.locator('[data-testid="t5-apply"]').click({ force: true });
  const result = page.locator('[data-testid="t5-tighten-result"]');
  await result.waitFor({ timeout: 8000 }).catch(() => {});
  const txt = (await result.count()) ? (await result.innerText()).trim() : "";
  await page.screenshot({ path: resolve(OUT, "tighten-result.png") });
  ck("hasil tighten tampil (menghemat n detik)", /menghemat\s+3,2\s+detik/i.test(txt), txt || "tidak tampil");

  ck("tanpa pageerror", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  if (srv) srv.kill();
}

console.log(`\n${fail.length} gagal`);
process.exit(fail.length ? 1 : 0);
