// node tools/measure.mjs — ukur region shell di halaman studio (bukti angka, bukan perasaan)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(process.cwd(), "..");
const srv = spawn("py", ["-3.13", "_mock.py"], { cwd: ROOT, stdio: "ignore" });
await sleep(1800);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.goto("http://127.0.0.1:8005/", { waitUntil: "networkidle" });
await sleep(500);

await page.evaluate(() => {
  const el = document.querySelector(".vz-card, [class*=cursor-pointer]");
  if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await sleep(1800);

const m = await page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
  };
  const cs = (sel, prop) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el)[prop] : null;
  };
  return {
    header: pick("header"),
    rail: pick("[data-region='rail'], aside[aria-label='Tools'], nav[aria-label='Tools']"),
    strip: pick("[data-region='strip'], [aria-label='Klip']"),
    sidebar: pick("[data-region='sidebar'], aside"),
    timeline: pick("[data-region='timeline'], [aria-label='Timeline']"),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    accent: cs(":root", "getPropertyValue") || getComputedStyle(document.documentElement).getPropertyValue("--vz-accent").trim(),
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
    textSample: (document.body.innerText || "").slice(0, 120).replace(/\s+/g, " "),
  };
});
console.log(JSON.stringify(m, null, 1));
if (errs.length) console.log("pageerrors:", errs.slice(0, 3));
await browser.close();
srv.kill();
