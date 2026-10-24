
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
  const res = await p.evaluate(async () => {
    const words = [...document.querySelectorAll("[data-word-idx]")];
    const v = document.querySelector("video");
    const before = v.currentTime;
    const w = words[Math.min(3, words.length - 1)];
    w.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise(r => setTimeout(r, 800));
    return { count: words.length, txt: (w.innerText||"").trim().slice(0,12), before, after: document.querySelector("video").currentTime };
  });
  console.log(JSON.stringify(res));
  await b.close();
})();
