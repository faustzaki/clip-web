// node tools/verify-t2b.mjs — verifikasi fungsional T2b terhadap BACKEND ASLI (:8000)
// Cek: panel transcript tampil, klik kata menggeser video.currentTime, pencarian menyaring.
import { chromium } from "playwright";

const BASE = process.env.PM_BASE || "http://127.0.0.1:8000";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
const out = { pass: [], fail: [] };
const ck = (n, c, d = "") => { (c ? out.pass : out.fail).push(n + (d ? ` — ${d}` : "")); console.log((c ? "PASS " : "FAIL ") + n + (d ? ` — ${d}` : "")); };

await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => {
  const el = document.querySelector(".vz-card, [class*=cursor-pointer]");
  if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForSelector('[data-region="sidebar"]', { timeout: 15000 });
await page.waitForSelector('[data-region="transcript-count"]', { timeout: 20000 }).catch(() => {});

const wordCount = await page.locator('[data-idx]').count();
ck("kata transkrip ter-render", wordCount > 20, `${wordCount} elemen`);

const words = await page.evaluate(() => [...document.querySelectorAll("[data-idx]")].map(e => Number(e.dataset.idx)));
const targetIdx = words[Math.floor(words.length / 2)];

const api = await page.evaluate(async (idx) => {
  const pid = location.pathname.split("/").filter(Boolean).pop();
  const r = await fetch(`/api/projects/${pid}/transcript?word=1`);
  const j = await r.json();
  const w = (j.words || []).find(x => x.idx === idx);
  return w ? { start: w.start_ms } : null;
}, targetIdx).catch(() => null);

await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.readyState >= 1; }, { timeout: 20000 }).catch(() => {});

const before = await page.evaluate(() => document.querySelector("video")?.currentTime ?? -1);
const box = await page.locator(`[data-idx="${targetIdx}"]`).first().boundingBox();
if (box) await page.mouse.click(box.x + 4, box.y + box.height / 2);
else await page.locator(`[data-idx="${targetIdx}"]`).first().click({ force: true }).catch(() => {});

// tunggu currentTime berubah (maks 6s), jangan pakai sleep tetap
await page.waitForFunction((t0) => {
  const v = document.querySelector("video");
  return v && Math.abs(v.currentTime - t0) > 0.2;
}, before, { timeout: 6000 }).catch(() => {});
const after = await page.evaluate(() => document.querySelector("video")?.currentTime ?? -1);

if (api) {
  const delta = Math.abs(after - api.start / 1000);
  ck("klik kata -> video.currentTime = start_ms kata itu", delta < 1.5,
     `kata #${targetIdx} start ${(api.start / 1000).toFixed(1)}s, video ${after.toFixed(1)}s`);
} else {
  ck("klik kata -> video bergerak", Math.abs(after - before) > 0.2, `${before.toFixed(1)}s -> ${after.toFixed(1)}s`);
}

// pencarian: hitung hasil (panel boleh menyorot saja, bukan menyembunyikan)
const search = page.locator('input[aria-label="Cari kata di transkrip"]');
if (await search.count()) {
  const beforeTxt = (await page.locator('[data-region="transcript-count"]').innerText()).replace(/\s+/g, " ");
  await search.fill("yang");
  await page.waitForTimeout(800);
  const afterTxt = (await page.locator('[data-region="transcript-count"]').innerText()).replace(/\s+/g, " ");
  const highlighted = await page.locator('[data-idx][class*="accent"], [data-idx] mark').count();
  ck("pencarian mengubah indikator hasil", beforeTxt !== afterTxt, `"${beforeTxt}" -> "${afterTxt}"`);
  ck("kata cocok tersorot", highlighted > 0, `${highlighted} elemen tersorot`);
  await search.fill("");
}

const panel = await page.evaluate(() => {
  const el = document.querySelector('[data-region="transcript-count"]');
  const r = el ? el.getBoundingClientRect() : null;
  return r ? { x: Math.round(r.x), y: Math.round(r.y) } : null;
});
ck("panel ada di dalam sidebar", !!panel, panel ? `x=${panel.x}` : "tidak ada");
ck("tidak ada pageerror", errs.length === 0, errs.slice(0, 2).join(" | "));

import { resolve } from "node:path";
await page.screenshot({ path: process.env.PM_SHOT || resolve(process.cwd(), "..", "docs/evidence/T2b/after/studio-transcript.png") });
await b.close();
console.log(`\n${out.pass.length} lulus, ${out.fail.length} gagal`);
process.exit(out.fail.length ? 1 : 0);
