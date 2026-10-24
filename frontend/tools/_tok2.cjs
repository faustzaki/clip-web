
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
  const info = await p.evaluate(() => {
    const find = (t) => [...document.querySelectorAll("*")].find(e => e.children.length===0 && (e.innerText||"").trim() === t);
    const out = {};
    for (const t of ["Subtitles","25%","Edit subtitle","Diarisasi (perkiraan)"]) {
      const e = find(t);
      if (e) { const cs = getComputedStyle(e); out[t] = { color: cs.color, cls: (e.className||"").toString().slice(0,60), bg: cs.backgroundColor, token: cs.getPropertyValue("--vz-text-dim") }; }
    }
    const root = getComputedStyle(document.documentElement);
    return { out, tokens: { muted: root.getPropertyValue("--vz-text-muted").trim(), dim: root.getPropertyValue("--vz-text-dim").trim(), faint: root.getPropertyValue("--vz-text-faint").trim(), soft: root.getPropertyValue("--vz-text-soft").trim() } };
  });
  console.log(JSON.stringify(info,null,1));
  await b.close();
})();
