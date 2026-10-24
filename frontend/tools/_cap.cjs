
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  const r = await p.evaluate(async () => {
    const pr = await (await fetch("/api/projects")).json();
    const withClip = pr.projects.find(x => x.clip_count > 0) || pr.projects[0];
    const tl = await (await fetch(`/api/projects/${withClip.id}/timeline`)).json();
    const caps = (tl.tracks.find(t => t.track === 2) || {}).items || [];
    return { pid: withClip.id, n: caps.length, sample: caps.slice(0, 5).map(c => ({ s: c.start_ms, e: c.end_ms, text: (c.payload?.text || "").slice(0, 30) })) };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
