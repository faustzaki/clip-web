// node tools/measure-preview.mjs — bukti ukuran preview & ruang terbuang di studio
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.env.PM_BASE || "http://127.0.0.1:5173";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE, { waitUntil: "networkidle" });
await sleep(1500);

// buka project yang ada transkrip
const texts = await page.locator(".vz-card").allInnerTexts().catch(() => []);
let idx = 0, best = -1;
for (let i = 0; i < texts.length; i++) { const m = texts[i].match(/(\d+)\s*klip/i); if (m && Number(m[1]) > best) { best = Number(m[1]); idx = i; } }
if (texts.length) await page.locator(".vz-card").nth(idx).click({ force: true }).catch(() => {});
await page.waitForSelector('[data-region="timeline"]', { timeout: 25000 }).catch(() => {});
await sleep(2500);

const m = await page.evaluate(() => {
  const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
  const v = document.querySelector("video");
  const vb = v ? v.getBoundingClientRect() : null;
  const stage = document.querySelector('[data-region="timeline"]')?.parentElement;
  return {
    video: vb ? { w: Math.round(vb.width), h: Math.round(vb.height) } : null,
    header: r("header"), rail: r('[data-region="rail"]'), strip: r('[data-region="strip"]'),
    sidebar: r('[data-region="sidebar"]'), timeline: r('[data-region="timeline"]'),
    stageBox: (() => { const el = document.querySelector('[data-region="timeline"]')?.previousElementSibling; if (!el) return null; const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })(),
    innerW: window.innerWidth, innerH: window.innerHeight,
  };
});
console.log(JSON.stringify(m, null, 1));
const stage = m.stageBox;
if (stage && m.video) {
  const usedPct = Math.round((m.video.w * m.video.h) / (stage.w * stage.h) * 100);
  console.log(`\npreview ${m.video.w}x${m.video.h} di area ${stage.w}x${stage.h} -> pakai ${usedPct}% area`);
}
await page.screenshot({ path: resolve(process.cwd(), "..", "docs/evidence/preview-after.png") });
await b.close();
