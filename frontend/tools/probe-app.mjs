// node tools/probe-app.mjs — apa yang tampil di :5173 saat pertama buka
import { chromium } from "playwright";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("PAGEERR:", String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text().slice(0, 200)); });
await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
console.log("TITLE:", await page.title());
console.log("BODY TEXT:", (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 300));
console.log("ROOT children:", await page.evaluate(() => document.getElementById("root")?.children.length ?? -1));
console.log("cards:", await page.locator(".vz-card").count());
console.log("buttons:", await page.evaluate(() => [...document.querySelectorAll("button")].map(b => (b.innerText || b.getAttribute("aria-label") || "").trim().slice(0, 24)).filter(Boolean).slice(0, 14)));
await b.close();
