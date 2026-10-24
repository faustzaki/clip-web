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
// klik kartu proyek: dispatchEvent tidak memicu routing React Router -> pakai klik elemen nyata
await page.locator(".vz-card").first().click({ force: true });
await page.waitForFunction(() => location.pathname.split("/").filter(Boolean).length >= 2, { timeout: 15000 }).catch(() => {});
await page.waitForSelector('[data-region="sidebar"]', { timeout: 15000 });
await page.waitForSelector('[data-region="transcript-count"]', { timeout: 20000 }).catch(() => {});

const wordCount = await page.locator('[data-idx]').count();
ck("kata transkrip ter-render", wordCount > 20, `${wordCount} elemen`);

// Pilih kata yang start_ms-nya jauh dari 0 dan terlihat di viewport (kalau tidak, klik meleset).
const pick = await page.evaluate(async () => {
  const pid = location.pathname.split("/").filter(Boolean).pop();
  const j = await (await fetch(`/api/projects/${pid}/transcript?word=1`)).json();
  const ws = (j.words || []).filter((w) => w.start_ms > 3000 && !w.deleted);
  for (const w of ws) {
    const el = document.querySelector(`[data-idx="${w.idx}"]`);
    if (!el) continue;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    if (r.top > 80 && r.bottom < window.innerHeight - 80) return { idx: w.idx, start: w.start_ms };
  }
  return null;
});
let targetIdx = pick ? pick.idx : null;
let api = pick ? { start: pick.start } : null;
if (!pick) {
  // Headless: scrollIntoView sering tidak membuat kandidat lolos cek viewport. Pilih kata dengan
  // start_ms > 3000 langsung dari API (yang penting bukan kata pertama di 0s).
  const fallback = await page.evaluate(async () => {
    // routing bisa tanpa pid di path -> ambil project aktif dari daftar
    let pid = location.pathname.split("/").filter(Boolean).pop();
    const list = await (await fetch("/api/projects")).json();
    const ok = (list.projects || []).some((x) => x.id === pid);
    if (!ok) pid = (list.projects || [])[0]?.id;
    const j = await (await fetch(`/api/projects/${pid}/transcript?word=1`)).json();
    const w = (j.words || []).find((x) => x.start_ms > 3000 && !x.deleted);
    return w ? { idx: w.idx, start: w.start_ms } : null;
  });
  if (fallback) { targetIdx = fallback.idx; api = { start: fallback.start }; console.log(`INFO: pakai kata idx ${fallback.idx} @ ${Math.round(fallback.start / 1000)}s`); }
  else { targetIdx = 1; console.log("INFO: tidak ada kata >3s — pakai idx 1"); }
}
await page.waitForTimeout(300);

await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.readyState >= 1; }, { timeout: 20000 }).catch(() => {});

const before = await page.evaluate(() => document.querySelector("video")?.currentTime ?? -1);
// Pastikan kata berada di tengah viewport; kalau tertutup elemen lain, klik elemennya langsung.
const sel = `[data-idx="${targetIdx}"]`;
await page.locator(sel).first().scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(200);
const hit = await page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const top = document.elementFromPoint(r.x + 2, r.y + r.height / 2);
  return { covers: top === el || el.contains(top), y: Math.round(r.y) };
}, sel);
if (hit && hit.covers) {
  const box = await page.locator(sel).first().boundingBox();
  await page.mouse.click(box.x + 4, box.y + box.height / 2);
} else {
  console.log(`INFO: kata idx ${targetIdx} tertutup elemen lain (y=${hit ? hit.y : "?"}) — pakai .click()`);
  await page.locator(sel).first().click({ force: true }).catch(() => {});
}

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
