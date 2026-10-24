
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  // CSS apa saja yang dimuat? cari nilai rgb(110,120,142) dan sumbernya
  const rules = await p.evaluate(() => {
    const hits = [];
    for (const sheet of document.styleSheets) {
      let list; try { list = sheet.cssRules; } catch { continue; }
      for (const r of list) {
        const txt = r.cssText || "";
        if (txt.includes("110, 120, 142") || txt.includes("#6e788e") || txt.includes("6E788E")) hits.push(txt.slice(0, 160));
      }
    }
    const s = document.createElement("span"); s.className = "text-vz-dim"; document.body.appendChild(s);
    const col = getComputedStyle(s).color; s.remove();
    return { hits: hits.slice(0, 5), color: col, sheets: [...document.styleSheets].map(x => x.href || "inline") };
  });
  console.log(JSON.stringify(rules, null, 1).slice(0, 1400));
  await b.close();
})();
