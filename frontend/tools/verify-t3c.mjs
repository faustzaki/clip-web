// node tools/verify-t3c.mjs — regresi T3c setelah StudioView dipecah ke GeneratePanel/PreviewStage/ClipsPanel + hooks.
// Read-only: panel kiri (form + edit mode), kartu klip -> seek, toggle posisi panel, mode tampilan video bebas.
// Catatan: kontrol di sidebar diklik via dispatchEvent karena panel filmstrip (bottom) menumpuk sidebar
// bila kandidat >= 6 — perilaku lama yang sudah ada sebelum T3c (lihat laporan MENYIMPANG).
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
const BASE = process.env.PM_BASE || "http://127.0.0.1:8000";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
const pass = [], fail = [];
const ck = (n, c, d = "") => { (c ? pass : fail).push(n); console.log((c ? "PASS " : "FAIL ") + n + (d ? ` — ${d}` : "")); };
const fire = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return false;
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  return true;
}, sel);

await page.goto(BASE, { waitUntil: "networkidle" });
const target = await page.evaluate(async () => {
  const j = await (await fetch("/api/projects")).json();
  const ps = Array.isArray(j) ? j : j.projects || [];
  const p = ps.find((x) => (x.candidate_count || 0) > 0);
  return p ? p.title : null;
});
if (target) await page.locator(`.vz-card:has-text(${JSON.stringify(target)})`).first().click({ force: true });
await page.waitForSelector('[data-region="sidebar"]', { timeout: 20000 });
await page.waitForTimeout(2000);

const side = page.locator('[data-region="sidebar"]');
const sbox = await side.boundingBox();
ck("sidebar tampil", !!sbox, sbox ? `${Math.round(sbox.width)}x${Math.round(sbox.height)}` : "tidak ada");

// GeneratePanel: form generate
const selects = await side.locator("select").count();
const sliders = await side.locator('input[type="range"]').count();
const findBtn = await side.locator('button:has-text("TEMUKAN MOMEN VIRAL")').count();
ck("GeneratePanel: form generate lengkap", selects >= 2 && sliders >= 2 && findBtn === 1, `select=${selects} slider=${sliders} tombol=${findBtn}`);

// Edit mode toggle
await fire('[data-region="sidebar"] button[title="Beralih ke Edit Clip"]');
await page.waitForTimeout(500);
const editText = await side.innerText();
const backBtn = await side.locator('button[title="Kembali ke Generate Clip"]').count();
ck("edit mode -> pengaturan Edit Clip", editText.includes("Kualitas Render") && editText.includes("Opsi Komponen Video") && backBtn === 1,
  `kualitas=${editText.includes("Kualitas Render")} opsi=${editText.includes("Opsi Komponen Video")} tombol kembali=${backBtn}`);
await fire('[data-region="sidebar"] button[title="Kembali ke Generate Clip"]');
await page.waitForTimeout(400);
ck("kembali ke Generate Clip", (await side.innerText()).includes("TEMUKAN MOMEN VIRAL"), "");

// Collapse / expand sidebar
await fire('[data-region="sidebar"] button[title^="Minimize panel"]');
await page.waitForTimeout(500);
const collapsedW = Math.round((await side.boundingBox())?.width || 0);
await fire('[data-region="sidebar"] button[title^="Buka "]');
await page.waitForTimeout(600);
const expandedW = Math.round((await side.boundingBox())?.width || 0);
ck("collapse 48 / expand 360", collapsedW === 48 && expandedW === 360, `${collapsedW}px -> ${expandedW}px`);

// Klip cards (ClipsPanel) -> klik kartu = seek ke kandidat
const cards = page.locator('button[title="Edit Clip"]');
const nCards = await cards.count();
ck("kartu klip ter-render", nCards > 3, `${nCards} kartu`);
const firstCard = cards.first().locator("xpath=..");
const cardText = (await firstCard.innerText()).replace(/\s+/g, " ");
const m = cardText.match(/(\d+):(\d\d)/);
const expected = m ? Number(m[1]) * 60 + Number(m[2]) : 0;
const cb = await firstCard.boundingBox();
let cur = -1;
if (cb) {
  await page.mouse.click(cb.x + 30, cb.y + cb.height / 2);
  await page.waitForTimeout(1500);
  cur = await page.evaluate(() => { const v = document.querySelector("video"); return v ? v.currentTime : -1; });
}
ck("klik kartu klip -> video seek", Math.abs(cur - expected) < 3, `kartu="${cardText.slice(0, 30)}" video=${cur.toFixed(1)}s harapan≈${expected}s`);

// Toggle posisi panel: bottom -> right -> bottom
const toRight = await page.locator('button[title="Pindah ke Kolom Kanan (Video Full Height)"]').count();
ck("tombol pindah ke kolom kanan ada", toRight >= 1, `${toRight}`);
if (toRight) {
  await page.locator('button[title="Pindah ke Kolom Kanan (Video Full Height)"]').first().click({ force: true });
  await page.waitForTimeout(700);
  const rightBox = await page.locator('[data-region="clips-panel"]').boundingBox();
  ck("mode kolom kanan -> clips-panel tampil", !!rightBox && rightBox.width > 100, rightBox ? `${Math.round(rightBox.width)}px` : "tidak ada");
  // scrubber stage (dulu ada di StudioView) — diuji di mode kolom kanan agar stage lebar
  const track = page.locator('main [title="Klik atau tarik untuk pindah posisi video"]').first();
  const tb = await track.boundingBox();
  let seeked = -1;
  if (tb && tb.width > 50) {
    await page.mouse.click(tb.x + tb.width * 0.6, tb.y + tb.height / 2);
    await page.waitForTimeout(1200);
    seeked = await page.evaluate(() => { const v = document.querySelector("video"); return v ? v.currentTime : -1; });
  }
  ck("scrubber stage -> video seek", seeked > 5, `lebar track=${tb ? Math.round(tb.width) : 0}px video=${seeked.toFixed(1)}s`);
  await page.locator('button[title="Pindah ke Panel Bawah (Filmstrip)"]').first().click({ force: true });
  await page.waitForTimeout(700);
  const backBottom = await page.locator('[data-region="clips-panel"]').count();
  const strip = await page.locator('section:has-text("Clips (")').count();
  ck("balik ke filmstrip bawah", backBottom === 0 && strip >= 1, `clips-panel=${backBottom} filmstrip=${strip}`);
}

// Part B — PreviewStage interaktif: pakai _mock.py (:8005) karena pada project nyata (>=6 kandidat)
// panel filmstrip menumpuk stage (quirk layout lama), sehingga klik di dalam stage tidak sampai.
const ROOT = resolve(process.cwd(), "..");
const srv = spawn("py", ["-3.13", "_mock.py"], { cwd: ROOT, stdio: "ignore" });
await sleep(1800);
const mpage = await b.newPage({ viewport: { width: 1440, height: 900 } });
mpage.on("pageerror", (e) => errs.push("mock: " + String(e)));
await mpage.goto("http://127.0.0.1:8005/", { waitUntil: "networkidle" });
await mpage.evaluate(() => { const el = document.querySelector(".vz-card, [class*=cursor-pointer]"); if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
await mpage.waitForSelector("main .bg-black", { timeout: 20000 });
await mpage.waitForTimeout(2000);
// pindah ke kolom kanan agar stage dapat lebar penuh (mode filmstrip menyempitkan stage saat ada kandidat)
await mpage.locator('button[title="Pindah ke Kolom Kanan (Video Full Height)"]').first().click({ force: true });
await mpage.waitForTimeout(700);

// PreviewStage: mode tampilan video bebas + dock zoom
await mpage.locator('button[title="Tampilan Video"]').first().click();
await mpage.waitForTimeout(300);
await mpage.locator('[role="menuitemcheckbox"]:has-text("Bebas")').first().click();
await mpage.waitForTimeout(500);
const handles = await mpage.locator('[title="Tarik untuk zoom video"]').count();
const dock = await mpage.locator('text=Bebas Transform:').count();
ck("mode bebas -> 4 handle + mini dock", handles === 4 && dock === 1, `handle=${handles} dock=${dock}`);
const scaleOf = async () => (await mpage.locator("main .font-mono.font-bold").last().innerText().catch(() => "")).trim();
const before = await scaleOf();
await mpage.locator('button[title="Zoom In (+10%)"]').first().click();
await mpage.waitForTimeout(400);
const after = await scaleOf();
ck("zoom in mengubah skala", before !== after, `${before} -> ${after}`);
await mpage.locator('button[title="Reset posisi & zoom video ke tengah"]').first().click();
await mpage.waitForTimeout(400);
ck("reset transform -> 100%", (await scaleOf()) === "100%", `${await scaleOf()}`);
await mpage.locator('button[title="Tampilan Video"]').first().click();
await mpage.waitForTimeout(300);
await mpage.locator('[role="menuitemcheckbox"]:has-text("Fit (Utuh)")').first().click();
await mpage.waitForTimeout(400);
ck("balik ke mode fit", (await mpage.locator('[title="Tarik untuk zoom video"]').count()) === 0, "");

ck("tetap satu elemen video", (await mpage.locator("video").count()) === 1, "");
srv.kill();

ck("tanpa pageerror", errs.length === 0, errs.slice(0, 2).join(" | "));
console.log(`\n${pass.length} lulus, ${fail.length} gagal`);
await b.close();
process.exit(fail.length ? 1 : 0);
