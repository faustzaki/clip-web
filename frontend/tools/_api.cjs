
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  const r = await p.evaluate(async () => {
    const pr = await (await fetch("/api/projects")).json();
    const x = pr.projects.find(y => (y.clip_count||0) > 0) || pr.projects[0];
    const t = await (await fetch(`/api/projects/${x.id}/transcript?word=1`)).json();
    const ws = t.words || [];
    return { pid: x.id, keys: Object.keys(t), n: ws.length, first: ws.slice(0, 3) };
  });
  console.log(JSON.stringify(r, null, 1).slice(0, 1200));
  await b.close();
})();
