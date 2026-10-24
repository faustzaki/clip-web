
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
  const o = await p.evaluate(() => {
    const lane = document.querySelector('[data-region="timeline-lanes"]');
    const btns = [...lane.querySelectorAll("button")].slice(0, 400);
    const widths = btns.map(b => Math.round(b.getBoundingClientRect().width));
    const minW = Math.min(...widths), maxW = Math.max(...widths);
    const samp = btns.slice(200, 204).map(b => ({ style: b.getAttribute("style"), w: Math.round(b.getBoundingClientRect().width) }));
    return { count: btns.length, minW, maxW, samp };
  });
  console.log(JSON.stringify(o, null, 1));
  await b.close();
})();
