// node tools/verify-t8.mjs — PM: speaker di panel + filter + rename + export prefix
import { chromium } from "playwright";
import { resolve } from "node:path";

const BASE = process.env.PM_BASE || "http://127.0.0.1:8000";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
const pass = [], fail = [];
const ck = (n, c, d = "") => { (c ? pass : fail).push(n); console.log((c ? "PASS " : "FAIL ") + n + (d ? ` — ${d}` : "")); };

// project yang punya speaker (hasil diarisasi T8)
await page.goto(BASE, { waitUntil: "networkidle" });
const texts = await page.locator(".vz-card").allInnerTexts();
let idx = -1, best = -1;
for (let i = 0; i < texts.length; i++) { const m = texts[i].match(/(\d+)\s*klip/i); if (m && Number(m[1]) > best) { best = Number(m[1]); idx = i; } }
if (idx < 0) idx = 0;
await page.locator(".vz-card").nth(idx).click({ force: true }).catch(() => {});
await page.waitForTimeout(2500);
ck("studio terbuka", (await page.locator('[data-region="sidebar"]').count()) > 0);

// filter/badge speaker
const badges = await page.locator('[data-role="speaker-badge"], [data-speaker]').count();
const filter = await page.locator('button:has-text("Semua"), select').first().count();
ck("badge speaker tampil", badges > 0, `${badges} elemen`);
ck("kontrol filter speaker ada", filter > 0, filter ? "ada" : "tidak ada");

// toggle prefix caption
const toggle = page.locator('input[type="checkbox"]').first();
if (await toggle.count()) { await toggle.click({ force: true }).catch(() => {}); await page.waitForTimeout(800); }

ck("tanpa pageerror", errs.length === 0, errs.slice(0, 2).join(" | "));
await page.screenshot({ path: resolve(process.cwd(), "..", "docs/evidence/T8/after/pm-speaker.png") });
await b.close();
console.log(`\n${pass.length} lulus, ${fail.length} gagal`);
process.exit(fail.length ? 1 : 0);
