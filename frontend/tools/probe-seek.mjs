// node tools/probe-seek.mjs — kenapa klik kata tidak menggeser video.currentTime?
import { chromium } from "playwright";
import { resolve } from "node:path";
const BASE = process.env.PM_BASE || "http://127.0.0.1:8000";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE_ERR:", m.text().slice(0, 200)); });
page.on("pageerror", (e) => console.log("PAGEERR:", String(e).slice(0, 200)));

await page.goto(BASE, { waitUntil: "networkidle" });
const texts = await page.locator(".vz-card").allInnerTexts();
let idx = -1, best = -1;
for (let i = 0; i < texts.length; i++) { const m = texts[i].match(/(\d+)\s*klip/i); if (m && Number(m[1]) > best) { best = Number(m[1]); idx = i; } }
await page.locator(".vz-card").nth(idx).click({ force: true });
await page.waitForSelector('[data-region="sidebar"]', { timeout: 20000 });
await page.waitForTimeout(2500);

// 1) video ada? request-nya sukses?
const info = await page.evaluate(() => {
  const v = document.querySelector("video");
  if (!v) return { ada: false };
  return {
    ada: true, ready: v.readyState, src: (v.currentSrc || v.src || "").slice(0, 120),
    dur: v.duration, net: v.networkState, err: v.error ? String(v.error.code) : null, t: v.currentTime,
  };
});
console.log("VIDEO:", info);

// 2) klik satu kata: apa yang terjadi di DOM?
const probe = await page.evaluate(async () => {
  const ws = [...document.querySelectorAll("[data-idx]")];
  const el = ws[Math.floor(ws.length / 2)];
  if (!el) return { err: "tidak ada kata" };
  const out = { idx: el.dataset.idx, t0: document.querySelector("video")?.currentTime };
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 1200));
  out.t1_synthetic = document.querySelector("video")?.currentTime;
  return out;
});
console.log("SYNTHETIC CLICK:", probe);

const el = page.locator(`[data-idx]`).nth(Math.floor(1829 / 2));
const box = await el.boundingBox();
if (box) { await page.mouse.click(box.x + 4, box.y + box.height / 2); await page.waitForTimeout(1500); }
console.log("AFTER REAL CLICK:", await page.evaluate(() => document.querySelector("video")?.currentTime));
console.log("AFTER REAL CLICK ready:", await page.evaluate(() => document.querySelector("video")?.readyState));

// 3) ada handler seek di elemen kata?
console.log("HANDLER:", await page.evaluate(() => {
  const ws = [...document.querySelectorAll("[data-idx]")];
  const el = ws[Math.floor(ws.length / 2)];
  return el ? { tag: el.tagName, role: el.getAttribute("role"), cls: el.className.slice(0, 80) } : null;
}));

await page.screenshot({ path: resolve(process.cwd(), "..", "docs/evidence/probe-seek.png") });
await b.close();
