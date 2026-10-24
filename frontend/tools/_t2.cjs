
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
    const t2 = document.querySelector('[data-track="2"]');
    const btns = t2 ? [...t2.querySelectorAll("button")] : [];
    const zoomBtn = [...document.querySelectorAll("button")].find(b => (b.innerText||"").trim() === "100%");
    return { blocksInTrack2: btns.length, zoomActive: [...document.querySelectorAll("button")].filter(b=>/^\d+%$/.test((b.innerText||"").trim())).map(b=>({t:b.innerText.trim(), active:b.className.includes("bg-vz-accent")})), first3: btns.slice(0,3).map(b=>b.getAttribute("style")) };
  });
  console.log(JSON.stringify(o, null, 1));
  await b.close();
})();
