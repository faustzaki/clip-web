
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto("http://127.0.0.1:8000", { waitUntil: "networkidle" });
  await p.waitForTimeout(1000);
  await p.locator(".vz-card").first().click({ force: true });
  await p.waitForTimeout(2500);
  const path = await p.evaluate(() => location.pathname);
  const o = await p.evaluate(async () => {
    const spans = [...document.querySelectorAll("[data-idx]")];
    const v = document.querySelector("video");
    if (!spans.length || !v) return { err: "tanpa transkrip/video", n: spans.length };
    const before = v.currentTime;
    spans[Math.min(30, spans.length - 1)].click();
    await new Promise(r => setTimeout(r, 900));
    return { n: spans.length, before, after: document.querySelector("video").currentTime };
  });
  console.log(JSON.stringify({ path, o }));
  await b.close();
})();
