
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  // buka dgn cache dimatikan
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await page.evaluate(() => { Object.keys(localStorage).forEach(k=>k.startsWith("vite")&&localStorage.removeItem(k)); });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const out = await page.evaluate(() => {
    const s = document.createElement("span"); s.className = "text-vz-dim"; document.body.appendChild(s);
    const c = getComputedStyle(s).color; s.remove(); return c;
  });
  console.log("text-vz-dim sekarang:", out);
  await ctx.close(); await b.close();
})();
