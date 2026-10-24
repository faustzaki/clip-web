
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  const texts = await p.locator(".vz-card").allInnerTexts();
  let best=-1, idx=0; texts.forEach((t,i)=>{const m=t.match(/(\d+)\s*klip/i); if(m&&Number(m[1])>best){best=Number(m[1]);idx=i;}});
  await p.locator(".vz-card").nth(idx).click({force:true});
  await p.waitForTimeout(3500);
  const out = {};
  for (const z of ["100%","200%"]) {
    const btn = p.locator(`button:has-text("${z}")`).first();
    if (await btn.count()) { await btn.click({force:true}); await p.waitForTimeout(900); }
    out[z] = await p.evaluate(() => {
      const t2 = document.querySelector('[data-track="2"]');
      const bs = t2 ? [...t2.querySelectorAll("button")] : [];
      const ws = bs.map(b => Math.round(b.getBoundingClientRect().width));
      return { n: bs.length, minW: Math.min(...ws), median: ws.sort((a,b)=>a-b)[Math.floor(ws.length/2)] };
    });
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
