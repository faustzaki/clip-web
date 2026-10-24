
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
  const c = await p.evaluate(() => {
    const f=(t)=>[...document.querySelectorAll("*")].find(e=>e.children.length===0 && (e.innerText||"").trim()===t);
    const e=f("Subtitles"); const cs=e?getComputedStyle(e):null;
    // cari elemen yg punya class text-vz-dim dan cek warnanya
    const dimEl=[...document.querySelectorAll('[class*="text-vz-dim"]')].find(x=>x.offsetParent);
    return { subtitlesColor: cs&&cs.color, dimColor: dimEl?getComputedStyle(dimEl).color:null, dimCls: dimEl?(dimEl.className||"").toString().slice(0,50):null };
  });
  console.log(JSON.stringify(c));
  await b.close();
})();
