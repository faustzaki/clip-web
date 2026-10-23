// node tools/shot.mjs <TASK>  — screenshot bukti ke docs/evidence/<TASK>/after/
// Pakai _mock.py (API tiruan) + build di frontend/dist. Jalankan dari folder frontend.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const task = process.argv[2] || "misc";
const ROOT = resolve(process.cwd(), "..");
const OUT = resolve(ROOT, "docs", "evidence", task, "after");
const PORT = 8005;
const BASE = `http://127.0.0.1:${PORT}`;

if (!existsSync(resolve(ROOT, "frontend/dist/index.html"))) {
  console.error("frontend/dist tidak ada — jalankan `npm run build` dulu di folder frontend.");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const srv = spawn("py", ["-3.13", "_mock.py"], { cwd: ROOT, stdio: "ignore", detached: false });
await sleep(1800);

const browser = await chromium.launch();
const shots = [];
try {
  for (const vp of [{ w: 1440, h: 900 }, { w: 1280, h: 800 }]) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await sleep(600);
    const projects = resolve(OUT, `projects-${vp.w}x${vp.h}.png`);
    await page.screenshot({ path: projects });
    shots.push(projects);

    // buka project pertama -> studio
    await page.evaluate(() => {
      const el = document.querySelector(".vz-card, [class*=cursor-pointer]");
      if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    if (true) {
      await sleep(1800);
      const studio = resolve(OUT, `studio-${vp.w}x${vp.h}.png`);
      await page.screenshot({ path: studio });
      shots.push(studio);
    }
    if (errors.length) console.log(`pageerrors @${vp.w}:`, errors.slice(0, 3).join(" | "));
    await page.close();
  }
} finally {
  await browser.close();
  srv.kill();
}

console.log(shots.map((s) => s.replace(ROOT + "\\", "")).join("\n"));
