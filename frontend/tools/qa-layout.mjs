// node tools/qa-layout.mjs — QA bagian A (kerangka & layout). Cetak angka, tanpa klaim.
import { chromium } from "playwright";
import { resolve } from "node:path";

const BASE = process.env.QA_BASE || "http://127.0.0.1:5173";
const OUT = resolve(process.cwd(), "..", "docs/evidence/QA");
const results = [];
const ck = (id, name, cond, detail = "") => { results.push({ id, name, pass: !!cond, detail }); console.log(`${cond ? "PASS" : "FAIL"} ${id} ${name}${detail ? " — " + detail : ""}`); };

const b = await chromium.launch();
for (const vp of [{ w: 1440, h: 900 }, { w: 1280, h: 800 }]) {
  const page = await b.newPage({ viewport: { width: vp.w, height: vp.h } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.removeItem("studio.bottomCollapsed"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const texts = await page.locator(".vz-card").allInnerTexts();
  let best = -1, idx = 0;
  texts.forEach((t, i) => { const m = t.match(/(\d+)\s*klip/i); if (m && Number(m[1]) > best) { best = Number(m[1]); idx = i; } });
  if (texts.length) await page.locator(".vz-card").nth(idx).click({ force: true });
  await page.waitForTimeout(3500);

  const m = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
    const vis = [...document.querySelectorAll("header")].filter((e) => e.offsetParent !== null).length;
    return {
      preview: r('[data-region="preview-frame"]'), holder: r('[data-region="preview-frame"]') ? r('[data-region="preview-frame"]') : null,
      sidebar: r('[data-region="sidebar"]'), rail: r('[data-region="rail"]'), strip: r('[data-region="strip"]'), timeline: r('[data-region="timeline"]'),
      headers: vis, overflowX: document.documentElement.scrollWidth > window.innerWidth,
      clipCount: document.querySelectorAll('[data-region="strip"] [class*=cursor-pointer]').length,
      bottomPanelH: (() => {
        const resizer = document.querySelector('[class*="cursor-row-resize"]');
        const sec = resizer ? resizer.nextElementSibling : null;
        return sec ? Math.round(sec.getBoundingClientRect().height) : null;
      })(),
      bottomPanel: (() => { const t = document.querySelector('[data-region="timeline"]'); const sib = t ? t.previousElementSibling : null; return sib && sib.className.includes("h-1.5") ? r('[data-region="timeline"]') && null : null; })(),
    };
  });
  const key = `${vp.w}x${vp.h}`;
  const minP = vp.w === 1440 ? { w: 240, h: 430 } : { w: 180, h: 320 };
  ck(`A-01${vp.w === 1440 ? "" : "b"}`, `preview ≥ ${minP.w}×${minP.h} @${key}`, m.preview && m.preview.w >= minP.w && m.preview.h >= minP.h, m.preview ? `${m.preview.w}×${m.preview.h}` : "tidak ada");
  ck(`A-03${vp.w === 1440 ? "" : "b"}`, `header hanya 1 @${key}`, m.headers === 1, `terlihat ${m.headers}`);
  ck(`A-08${vp.w === 1440 ? "" : "b"}`, `tanpa scroll horizontal @${key}`, !m.overflowX, `overflow=${m.overflowX}`);
  ck(`A-09${vp.w === 1440 ? "" : "b"}`, `sidebar 360 / rail 72 @${key}`,
     m.sidebar?.w === 360 && m.rail?.w === 72,
     `sidebar ${m.sidebar?.w}, rail ${m.rail?.w}`);
  ck(`A-10${vp.w === 1440 ? "" : "b"}`, `strip hanya saat ada klip @${key}`,
     m.clipCount > 0 ? m.strip?.h === 96 : m.strip === null,
     `klip ${m.clipCount}, strip ${m.strip ? m.strip.h + "px" : "tidak dirender"}`);
  ck(`A-05${vp.w === 1440 ? "" : "b"}`, `panel bawah tidak makan ruang saat kuncup @${key}`,
     m.bottomPanelH === null || m.bottomPanelH <= 48, m.bottomPanelH === null ? "tidak dirender" : `${m.bottomPanelH}px`);
  ck(`A-04${vp.w === 1440 ? "" : "b"}`, `timeline ringkas 180 @${key}`, m.timeline?.h === 180, `${m.timeline?.h}px`);
  await page.screenshot({ path: resolve(OUT, `layout-${key}.png`) });
  ck(`K-05${vp.w === 1440 ? "" : "b"}`, `tanpa pageerror @${key}`, errs.length === 0, errs.slice(0, 2).join(" | "));
  await page.close();
}
await b.close();
const fail = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - fail} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
