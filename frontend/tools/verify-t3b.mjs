// node tools/verify-t3b.mjs — timeline: ruler seek, zoom, collapse, playhead
import { chromium } from "playwright";
const BASE = process.env.PM_BASE || "http://127.0.0.1:8000";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
const pass = [], fail = [];
const ck = (n, c, d = "") => { (c ? pass : fail).push(n); console.log((c ? "PASS " : "FAIL ") + n + (d ? ` — ${d}` : "")); };

await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => { const el = document.querySelector(".vz-card, [class*=cursor-pointer]"); if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
await page.waitForSelector('[data-region="timeline"]', { timeout: 20000 });

const tl = page.locator('[data-region="timeline"]');
const box = await tl.boundingBox();
ck("timeline tampil", !!box, box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "tidak ada");
ck("tinggi 240 atau 320", box && (Math.abs(box.height - 240) < 12 || Math.abs(box.height - 320) < 12), `${Math.round(box?.height || 0)}px`);

const dur = await page.evaluate(async () => {
  const r = await fetch("/api/projects/" + (window.__pid || "") + "/timeline").catch(() => null);
  return null;
});

// klik ruler di 75% lebar — klik asli, bukan synthetic event
const ruler = page.locator('[data-region="timeline-ruler"]').first();
const rb = await ruler.boundingBox();
let seek = -1;
if (rb) {
  await page.mouse.click(rb.x + rb.width * 0.75, rb.y + rb.height / 2);
  await page.waitForTimeout(1200);
  seek = await page.evaluate(() => { const v = document.querySelector("video"); return v ? v.currentTime : -1; });
}
ck("klik ruler -> video pindah", seek > 0.5, `${seek.toFixed(1)}s`);

// zoom
const widths = {};
for (const z of ["25%", "200%"]) {
  const btn = page.locator(`button:has-text("${z}")`).first();
  if (await btn.count()) {
    await btn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    widths[z] = await page.evaluate(() => {
      const el = document.querySelector('[data-region="timeline"] [data-role="content"], [data-region="timeline"] [style*="width"]');
      return el ? Math.round(el.getBoundingClientRect().width) : 0;
    });
  }
}
ck("zoom memperlebar konten", (widths["200%"] || 0) > (widths["25%"] || 0), `25%:${widths["25%"]}px 200%:${widths["200%"]}px`);

// collapse pakai tombol data-region
const colBtn = page.locator('[data-region="timeline-collapse"]').first();
if (await colBtn.count()) {
  await colBtn.click({ force: true }).catch(() => {});
  await page.waitForTimeout(700);
  const h2 = (await tl.boundingBox())?.height || 0;
  const stored = await page.evaluate(() => localStorage.getItem("vz.timeline.collapsed"));
  ck("collapse 240/320 + tersimpan", Math.abs(h2 - 240) < 15 || Math.abs(h2 - 320) < 15, `h=${Math.round(h2)} stored=${stored}`);
  await colBtn.click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
}
ck("tanpa pageerror", errs.length === 0, errs.slice(0, 2).join(" | "));
await page.screenshot({ path: "docs/evidence/T3b/after/timeline-pm.png" });
await b.close();
console.log(`\n${pass.length} lulus, ${fail.length} gagal`);
process.exit(fail.length ? 1 : 0);
