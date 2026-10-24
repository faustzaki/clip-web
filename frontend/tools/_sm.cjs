
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  const texts = await p.locator(".vz-card").allInnerTexts();
  let best=-1, idx=0; texts.forEach((t,i)=>{const m=t.match(/(\d+)\s*klip/i); if(m&&Number(m[1])>best){best=Number(m[1]);idx=i;}});
  await p.locator(".vz-card").nth(idx).click({force:true});
  await p.waitForTimeout(3000);
  const o = await p.evaluate(() => {
    const out = [];
    for (const e of document.querySelectorAll("button,input,a,select,[role=button]")) {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && (r.width < 24 || r.height < 24)) {
        out.push({ tag: e.tagName, txt: (e.innerText||"").trim().slice(0,20), cls: (e.className||"").toString().slice(0,90), box: [Math.round(r.width), Math.round(r.height)] });
      }
    }
    return out;
  });
  console.log(JSON.stringify(o, null, 1));
  await b.close();
})();
