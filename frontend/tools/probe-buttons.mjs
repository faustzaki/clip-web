// node tools/probe-buttons.mjs — dump tombol yang ada di studio (untuk verifier)
import { chromium } from "playwright";
const BASE = process.env.PM_BASE || "http://127.0.0.1:8000";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => { const el = document.querySelector(".vz-card, [class*=cursor-pointer]"); if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
await page.waitForTimeout(2500);
const btns = await page.evaluate(() => [...document.querySelectorAll("button")].map((e, i) => ({
  i, t: (e.innerText || "").trim().slice(0, 22), a: e.getAttribute("aria-label"), ti: e.getAttribute("title"),
  r: e.closest('[data-region]')?.getAttribute("data-region") || "-", vis: !!(e.offsetParent)
})).filter(x => x.vis));
console.log(JSON.stringify(btns.filter(x => /unduh|export|xport|down/i.test(`${x.t} ${x.a} ${x.ti}`) || x.r === "strip"), null, 0));
console.log("total visible buttons:", btns.length);
await b.close();
