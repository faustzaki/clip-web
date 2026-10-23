// node tools/probe-strip.mjs — buka project berklip, dump isi strip + tombol
import { chromium } from "playwright";
const BASE = process.env.PM_BASE || "http://127.0.0.1:8000";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const titles = await page.locator(".vz-card").allInnerTexts();
console.log("cards:", titles.map(t => t.replace(/\s+/g, " ").slice(0, 40)));
const idx = titles.findIndex(t => /Unboxing/i.test(t));
console.log("idx unboxing:", idx);
if (idx >= 0) await page.locator(".vz-card").nth(idx).click({ force: true });
await page.waitForTimeout(3000);
console.log("studio?", await page.locator('[data-region="strip"]').count());
const html = await page.evaluate(() => {
  const s = document.querySelector('[data-region="strip"]');
  return s ? s.innerHTML.replace(/\s+/g, " ").slice(0, 700) : "NO STRIP";
});
console.log("STRIP:", html);
console.log("buttons in strip:", await page.evaluate(() => [...document.querySelectorAll('[data-region="strip"] button')].map(b => b.getAttribute("aria-label") || b.innerText).slice(0, 10)));
await b.close();
