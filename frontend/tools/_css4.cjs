
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  await p.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  // ambil isi style inline yg mengandung vz-dim
  const t = await p.evaluate(() => {
    const styles = [...document.querySelectorAll("style")].map(s => s.textContent).join("\n");
    const i = styles.indexOf("text-vz-dim");
    const j = styles.indexOf("--vz-text-dim");
    return { around: i >= 0 ? styles.slice(i - 40, i + 140) : "tidak ketemu", cssvar: j >= 0 ? styles.slice(j - 40, j + 90) : "tidak ada --vz-text-dim" };
  });
  console.log(JSON.stringify(t, null, 1));
  await b.close();
})();
