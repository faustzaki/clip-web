// node tools/probe.mjs — cari elemen yang bisa diklik + penanda region di studio
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
const ROOT = resolve(process.cwd(), "..");
const srv = spawn("py", ["-3.13", "_mock.py"], { cwd: ROOT, stdio: "ignore" });
await sleep(1800);
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:8005/", { waitUntil: "networkidle" });
await sleep(600);
console.log("BUTTONS:", await page.evaluate(() => [...document.querySelectorAll("button, a, [role=button]")].map(e => (e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 28)).filter(Boolean).slice(0, 20)));
console.log("CARDS:", await page.evaluate(() => [...document.querySelectorAll("[class*=card], [class*=Card]")].map(e => e.className.toString().slice(0, 60)).slice(0, 8)));
// klik kartu project pertama
const clicked = await page.evaluate(() => {
  const els = [...document.querySelectorAll("main div[class*=cursor], main [class*=card], main a")];
  const el = els.find(e => /Project Baru|09|klip|video/i.test(e.innerText || "")) || els[0];
  if (!el) return false;
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  return (el.innerText || "").slice(0, 40);
});
console.log("CLICKED:", clicked);
await sleep(1800);
console.log("REGIONS:", await page.evaluate(() => {
  const out = {};
  document.querySelectorAll("[data-region]").forEach(e => { const r = e.getBoundingClientRect(); out[e.getAttribute("data-region")] = [Math.round(r.width), Math.round(r.height)]; });
  return out;
}));
console.log("TEXT:", (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 200));
await b.close(); srv.kill();
