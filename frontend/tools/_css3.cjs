
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true });
  const p = await ctx.newPage();
  await p.route("**/*", (route) => {
    const h = { ...route.request().headers() };
    h["cache-control"] = "no-cache";
    route.continue({ headers: h });
  });
  await p.goto("http://127.0.0.1:5173/?nocache=" + Date.now(), { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  const out = await p.evaluate(() => {
    const s = document.createElement("span"); s.className = "text-vz-dim"; document.body.appendChild(s);
    const c = getComputedStyle(s).color; s.remove(); return c;
  });
  console.log("tanpa cache:", out);
  // cek juga file CSS yang disajikan vite
  const css = await p.evaluate(async () => {
    const links = [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.href);
    const inline = [...document.querySelectorAll("style")].map(s => s.textContent.length);
    return { links, inlineSizes: inline };
  });
  console.log(JSON.stringify(css));
  await ctx.close(); await b.close();
})();
