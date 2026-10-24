
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  const v = await p.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { muted: cs.getPropertyValue("--vz-text-muted").trim(), faint: cs.getPropertyValue("--vz-text-faint").trim() };
  });
  console.log("token dari browser:", JSON.stringify(v));
  await b.close();
})();
