
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  const out = await p.evaluate(() => {
    const s = document.createElement("span");
    s.className = "text-vz-dim";
    s.textContent = "x";
    document.body.appendChild(s);
    const cs = getComputedStyle(s);
    const color = cs.color;
    s.remove();
    // cari semua rule inline yg menyebut vz-dim
    const hits = [];
    for (const sheet of document.styleSheets) {
      let list; try { list = sheet.cssRules; } catch { continue; }
      for (const r of list) {
        const t = r.cssText || "";
        if (/vz-dim|--vz-text-dim|110, 120, 142/.test(t)) hits.push(t.slice(0, 200));
      }
    }
    return { color, hits: hits.slice(0, 6) };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
