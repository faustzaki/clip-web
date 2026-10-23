// node tools/verify-t4b.mjs — modal export: buka, isi, export, unduh, Esc fokus balik
import { chromium } from "playwright";
import { resolve } from "node:path";

const BASE = process.env.PM_BASE || "http://127.0.0.1:8000";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
const pass = [], fail = [];
const ck = (n, c, d = "") => { (c ? pass : fail).push(n); console.log((c ? "PASS " : "FAIL ") + n + (d ? ` — ${d}` : "")); };

await page.goto(BASE, { waitUntil: "networkidle" });

// pilih project yang PUNYA klip (kartu menampilkan "N klip")
const texts = await page.locator(".vz-card").allInnerTexts();
let idx = -1, best = -1;
for (let i = 0; i < texts.length; i++) { const m = texts[i].match(/(\d+)\s*klip/i); if (m && Number(m[1]) > best) { best = Number(m[1]); idx = i; } }
if (idx < 0) idx = texts.findIndex(x => /\d+\s*klip/i.test(x));
if (idx < 0) idx = 0;
await page.locator(".vz-card").nth(idx).click({ force: true }).catch(() => {});
await page.waitForTimeout(2500);
const opened = (await page.locator('[data-region="strip"] button[aria-label^="Unduh"]').count()) > 0;
ck("project dengan klip terbuka", opened, texts[idx]?.replace(/\s+/g, " ").slice(0, 40) || "-");

const trigger = page.locator('[data-region="strip"] button[aria-label^="Unduh"]').first();
const hasTrigger = await trigger.count();

ck("ada pemicu export di UI", hasTrigger > 0, hasTrigger ? "ditemukan" : "tidak ada");
if (!hasTrigger) { await b.close(); process.exit(1); }

await trigger.click({ force: true }).catch(() => {});
await page.waitForTimeout(900);
const modal = page.locator('[role="dialog"], .vz-modal, [data-region="export-modal"]').first();
ck("modal export terbuka", (await modal.count()) > 0);
if (!(await modal.count())) { await b.close(); process.exit(1); }

const box = await modal.boundingBox();
ck("lebar modal ~480px", box && Math.abs(box.width - 480) < 40, `${Math.round(box?.width || 0)}px`);

// pilih 720p kalau ada, isi nama
const p720 = modal.locator('button:has-text("720p"), label:has-text("720p"), input[value="720p"]').first();
if (await p720.count()) await p720.click({ force: true }).catch(() => {});
const nameInput = modal.locator('input[type="text"]').first();
const defaultName = await nameInput.inputValue().catch(() => "");
ck("nama file default tidak ber-suffix resolusi", !/_\d+p\.mp4$/.test(defaultName), `"${defaultName}"`);

const startBtn = modal.locator('button:has-text("Export")').last();
await startBtn.click({ force: true }).catch(() => {});

// tunggu status done: link Unduh muncul
let href = null;
for (let i = 0; i < 75; i++) {
  await page.waitForTimeout(2000);
  const link = modal.locator('a[href*="/clips/"]').first();
  if (await link.count()) { href = await link.getAttribute("href"); break; }
  const failedTxt = await modal.innerText().catch(() => "");
  if (/gagal|failed|Terlalu lama/i.test(failedTxt) && i > 3) { console.log("MODAL_ERR:", failedTxt.replace(/\s+/g," ").slice(0, 200)); break; }
}
ck("job selesai + link unduh muncul", !!href, href || "tidak muncul dalam 90s");

if (href) {
  const res = await page.request.get(new URL(href, BASE).toString());
  const ct = res.headers()["content-type"] || "";
  ck("file bisa diunduh 200 video/mp4", res.status() === 200 && ct.includes("video/mp4"), `${res.status()} ${ct}`);
}

// Esc + fokus balik
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
const closed = !(await page.locator('[role="dialog"]').isVisible().catch(() => false));
const active = await page.evaluate(() => (document.activeElement?.getAttribute("aria-label") || document.activeElement?.innerText || "").slice(0, 30));
ck("Esc menutup modal", closed, closed ? "tertutup" : "masih terbuka");
ck("fokus kembali ke elemen pemicu", /nduh|xport/i.test(active), `activeElement="${active}"`);

ck("tanpa pageerror", errs.length === 0, errs.slice(0, 2).join(" | "));
await page.screenshot({ path: resolve(process.cwd(), "..", "docs/evidence/T4b/after/export-modal-pm.png") });
await b.close();
console.log(`\n${pass.length} lulus, ${fail.length} gagal`);
process.exit(fail.length ? 1 : 0);
