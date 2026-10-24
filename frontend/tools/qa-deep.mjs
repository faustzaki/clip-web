// node tools/qa-deep.mjs — QA mendalam per halaman & per elemen.
// Mengukur DOM nyata: setiap tombol (fungsi/duplikat/terpotong/ukuran), panel, overflow, kontras.
// Output: docs/evidence/QA/deep-report.json (mentah, apa adanya)
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.QA_BASE || "http://127.0.0.1:5173";
const OUT = resolve(process.cwd(), "..", "docs/evidence/QA");
mkdirSync(OUT, { recursive: true });

const report = { generated: new Date().toISOString(), pages: {} };
const b = await chromium.launch();

// ---------- helper ----------
const relLum = (r, g, bl) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
};
const parseRGB = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);

async function auditElements(page, label) {
  return page.evaluate(({ relLumSrc, parseRGBSrc }) => {
    const relLum = eval(relLumSrc), parseRGB = eval(parseRGBSrc);
    const vw = window.innerWidth, vh = window.innerHeight;
    const els = [...document.querySelectorAll("button, a, input, select, textarea, [role=button]")].filter((e) => e.offsetParent !== null);
    const seen = new Map();
    const dupes = [], clipped = [], tiny = [], noLabel = [], lowContrast = [];
    for (const e of els) {
      const r = e.getBoundingClientRect();
      const txt = (e.innerText || "").trim().slice(0, 40);
      const aria = e.getAttribute("aria-label") || e.getAttribute("title") || "";
      // duplikat: teks+label sama, posisi sama
      const key = `${e.tagName}|${txt}|${aria}`;
      if (key && txt && seen.has(key)) {
        const prev = seen.get(key);
        if (Math.abs(prev.x - Math.round(r.x)) < 2 && Math.abs(prev.y - Math.round(r.y)) < 2) dupes.push({ tag: e.tagName, txt, x: Math.round(r.x), y: Math.round(r.y) });
      } else if (txt || aria) seen.set(key, { x: Math.round(r.x), y: Math.round(r.y) });
      // terpotong: keluar viewport
      if (r.width > 0 && (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1))
        clipped.push({ tag: e.tagName, txt: txt || aria, box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] });
      // terlalu kecil
      // input[type=range] = slider: tinggi track 6px itu normal, bukan target klik yang gagal
      const isRange = e.tagName === "INPUT" && e.type === "range";
      if (!isRange && r.width > 0 && (r.width < 24 || r.height < 24)) tiny.push({ tag: e.tagName, txt: txt || aria, box: [Math.round(r.width), Math.round(r.height)] });
      // tanpa label
      if (!txt && !aria && e.tagName === "BUTTON") noLabel.push({ tag: e.tagName, cls: (e.className || "").toString().slice(0, 50) });
      // kontras
      const cs = getComputedStyle(e);
      const fg = parseRGB(cs.color), bg = parseRGB(cs.backgroundColor === "rgba(0, 0, 0, 0)" ? "rgb(255,255,255)" : cs.backgroundColor);
      if (fg.length === 3 && bg.length === 3 && txt) {
        const l1 = relLum(...fg), l2 = relLum(...bg);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const size = parseFloat(cs.fontSize);
        const need = size >= 18.66 ? 3 : 4.5;
        if (ratio < need) lowContrast.push({ txt, ratio: Math.round(ratio * 100) / 100, need, fontSize: size });
      }
    }
    // panel & region
    const regions = {};
    document.querySelectorAll("[data-region]").forEach((e) => {
      const r = e.getBoundingClientRect();
      regions[e.dataset.region] = { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
    });
    return {
      totalInteractive: els.length, dupes, clipped, tiny, noLabel,
      lowContrast: lowContrast.slice(0, 12), regions,
      overflowX: document.documentElement.scrollWidth > vw,
      overflowY: document.documentElement.scrollHeight > vh,
      bodyText: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 180),
      viewport: { vw, vh },
    };
  }, { relLumSrc: relLum.toString(), parseRGBSrc: parseRGB.toString() });
}

// ---------- halaman 1: Projects ----------
for (const vp of [{ w: 1440, h: 900 }, { w: 1280, h: 800 }]) {
  const page = await b.newPage({ viewport: { width: vp.w, height: vp.h } });
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const a = await auditElements(page, "projects");
  report.pages[`projects-${vp.w}`] = { ...a, pageErrors: errs };
  await page.screenshot({ path: resolve(OUT, `deep-projects-${vp.w}x${vp.h}.png`) });

  // pindai kartu project: teks tumpang tindih?
  const cards = await page.evaluate(() => {
    const cs = [...document.querySelectorAll(".vz-card")];
    return cs.map((c) => {
      const r = c.getBoundingClientRect();
      const kids = [...c.querySelectorAll("*")].filter((e) => e.offsetParent && e.children.length === 0 && (e.innerText || "").trim());
      const overlap = [];
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].getBoundingClientRect(), b2 = kids[j].getBoundingClientRect();
        const ov = !(a.right <= b2.left || b2.right <= a.left || a.bottom <= b2.top || b2.bottom <= a.top);
        if (ov) overlap.push([kids[i].innerText.trim().slice(0, 18), kids[j].innerText.trim().slice(0, 18)]);
      }
      return { box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], overlap, text: (c.innerText || "").replace(/\s+/g, " ").slice(0, 60) };
    });
  });
  report.pages[`projects-${vp.w}`].cards = cards;

  // ---------- halaman 2: Studio ----------
  let best = -1, idx = 0;
  const texts = await page.locator(".vz-card").allInnerTexts();
  texts.forEach((t, i) => { const m = t.match(/(\d+)\s*klip/i); if (m && Number(m[1]) > best) { best = Number(m[1]); idx = i; } });
  if (texts.length) await page.locator(".vz-card").nth(idx).click({ force: true });
  await page.waitForTimeout(3500);
  const s = await auditElements(page, "studio");
  const layout = await page.evaluate(() => {
    const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), y: Math.round(b.y) }; };
    const strip = document.querySelector('[data-region="strip"]');
    const timeline = document.querySelector('[data-region="timeline"]');
    const emptyAreas = { stageRight: null, belowSidebar: null };
    if (timeline) {
      const holder = document.querySelector('[data-region="preview-frame"]')?.parentElement;
      if (holder) {
        const hb = holder.getBoundingClientRect();
        const pb = document.querySelector('[data-region="preview-frame"]').getBoundingClientRect();
        emptyAreas.stageRight = Math.round(hb.width - pb.width);
        emptyAreas.stageBelow = Math.round(hb.height - pb.height);
      }
    }
    return { preview: r('[data-region="preview-frame"]'), sidebar: r('[data-region="sidebar"]'), timeline: r('[data-region="timeline"]'), strip: strip ? r('[data-region="strip"]') : null, emptyAreas };
  });
  report.pages[`studio-${vp.w}`] = { ...s, layout, pageErrors: errs };
  await page.screenshot({ path: resolve(OUT, `deep-studio-${vp.w}x${vp.h}.png`) });

  // tombol apa saja + apakah bisa diklik (ada handler)?
  const buttons = await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.offsetParent).map((b) => {
    const r = b.getBoundingClientRect();
    return {
      text: (b.innerText || "").trim().slice(0, 30), aria: b.getAttribute("aria-label") || b.getAttribute("title") || "",
      size: [Math.round(r.width), Math.round(r.height)], disabled: b.disabled,
      hasHandler: !!(b.getAttribute("onclick") || b.__reactProps$ || Object.keys(b).some((k) => k.startsWith("__reactProps"))),
      region: b.closest("[data-region]")?.dataset.region || "-",
    };
  }));
  report.pages[`studio-${vp.w}`].buttons = buttons;
  await page.close();
}
await b.close();
writeFileSync(resolve(OUT, "deep-report.json"), JSON.stringify(report, null, 1), "utf-8");
console.log("deep-report.json ditulis");
for (const [k, v] of Object.entries(report.pages)) {
  console.log(`${k}: interaktif ${v.totalInteractive}, duplikat ${v.dupes.length}, terpotong ${v.clipped.length}, <24px ${v.tiny.length}, tanpa label ${v.noLabel.length}, kontras gagal ${v.lowContrast.length}, overflowX ${v.overflowX}, pageerror ${v.pageErrors.length}`);
  if (v.layout?.preview) console.log(`   preview ${v.layout.preview.w}x${v.layout.preview.h}, ruang kosong kanan ${v.layout.emptyAreas.stageRight}px bawah ${v.layout.emptyAreas.stageBelow}px`);
}
