
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto("http://127.0.0.1:8000", { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  await p.locator(".vz-card").first().click({ force: true });
  await p.waitForTimeout(2500);
  const o = await p.evaluate(() => {
    const el = document.querySelector('[data-idx="7"]');
    if (!el) return { err: "idx7 tidak ada" };
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + 4, r.y + r.height / 2);
    return { box: [r.x, r.y, r.width, r.height], inViewport: r.top > 0 && r.bottom < innerHeight, topTag: top && top.tagName, topSame: top === el || el.contains(top) };
  });
  console.log(JSON.stringify(o));
  await b.close();
})();
