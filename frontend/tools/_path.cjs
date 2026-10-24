
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await p.evaluate(() => { const el = document.querySelector(".vz-card, [class*=cursor-pointer]"); if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await p.waitForTimeout(3000);
  const o = await p.evaluate(async () => {
    const path = location.pathname;
    const pid = path.split("/").filter(Boolean).pop();
    let apiErr = null, n = -1;
    try {
      const r = await fetch(`/api/projects/${pid}/transcript?word=1`);
      const j = await r.json();
      n = (j.words || []).filter(w => w.start_ms > 3000 && !w.deleted).length;
      if (!r.ok) apiErr = r.status + " " + JSON.stringify(j).slice(0, 80);
    } catch (e) { apiErr = String(e).slice(0, 80); }
    return { path, pid, kandidat: n, apiErr };
  });
  console.log(JSON.stringify(o));
  await b.close();
})();
