// node tools/verify-t9.mjs — terjemahan subtitle (T9): pilih bahasa target, toggle "Dua bahasa",
// tombol Terjemahkan klip, hasil baris siap + status cache. Pakai _mock.py + build di frontend/dist.
// Jalankan dari folder frontend.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(process.cwd(), "..");
const OUT = resolve(ROOT, "docs", "evidence", "T9", "after");
const BASE = process.env.PM_BASE || "http://127.0.0.1:8005";
const OWN_SERVER = !process.env.PM_BASE;

if (!existsSync(resolve(ROOT, "frontend/dist/index.html"))) {
  console.error("frontend/dist tidak ada — jalankan `npm run build` dulu di folder frontend.");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const pass = [], fail = [];
const ck = (n, c, d = "") => { (c ? pass : fail).push(n); console.log((c ? "PASS " : "FAIL ") + n + (d ? ` — ${d}` : "")); };

const srv = OWN_SERVER ? spawn("py", ["-3.13", "_mock.py"], { cwd: ROOT, stdio: "ignore", detached: false }) : null;
let srv2 = null;
await sleep(1800);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const shot = (name) => page.screenshot({ path: resolve(OUT, name) });
const panel = () => page.locator('[data-region="translate-panel"]');

try {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await sleep(500);
  await page.locator(".vz-card").first().click({ force: true }).catch(() => {});
  await sleep(1800);

  await page.getByRole("button", { name: "Subtitles" }).click({ force: true });
  await sleep(600);
  await panel().scrollIntoViewIfNeeded().catch(() => {});
  await sleep(300);
  ck("panel Terjemahan subtitle tampil", await panel().isVisible().catch(() => false));

  const langOptions = await page.locator('[data-testid="t9-lang"] option').allInnerTexts();
  ck("6 bahasa target + opsi tanpa terjemahan",
    langOptions.join("|") === "Tanpa terjemahan|Indonesia|Inggris|Mandarin|Jepang|Arab|Spanyol",
    langOptions.join(", "));

  // tanpa bahasa target → tombol disabled + petunjuk Indonesia
  const before = await page.locator('[data-testid="t9-translate"]').isDisabled();
  ck("tombol disabled sebelum bahasa target dipilih", before && await page.locator("text=Pilih bahasa target dulu.").isVisible().catch(() => false));

  await page.selectOption('[data-testid="t9-lang"]', "en");
  await sleep(400);
  const enabled = !(await page.locator('[data-testid="t9-translate"]').isDisabled());
  const downShown = await page.locator('[data-testid="t9-router-down"]').isVisible().catch(() => false);
  ck("router hidup: tombol aktif, tidak ada peringatan '9Router tidak merespons'",
    enabled && !downShown, `enabled=${enabled} peringatan=${downShown}`);
  await shot("translate-panel.png");

  await page.locator('[data-testid="t9-dual"]').check({ force: true });
  await sleep(300);
  ck("toggle 'Dua bahasa' tersimpan aktif", await page.locator('[data-testid="t9-dual"]').isChecked());

  await page.locator('[data-testid="t9-translate"]').click({ force: true });
  await sleep(900);
  const result = await page.locator('[data-testid="t9-translate-result"]').innerText().catch(() => "");
  ck("hasil terjemahan tampil dalam Bahasa Indonesia", /baris siap/.test(result), result.replace(/\n/g, " "));
  await shot("translate-hasil.png");

  ck("tidak ada error runtime di halaman", errors.length === 0, errors.join(" | ").slice(0, 160));

  // ---------- state placeholder: 9Router mati (mock kedua dengan MOCK_ROUTER_DOWN=1) ----------
  if (OWN_SERVER) {
    srv2 = spawn("py", ["-3.13", "_mock.py"], {
      cwd: ROOT, stdio: "ignore", detached: false,
      env: { ...process.env, MOCK_PORT: "8015", MOCK_ROUTER_DOWN: "1" },
    });
    await sleep(1800);
    const page2 = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    try {
      await page2.goto("http://127.0.0.1:8015/", { waitUntil: "networkidle" });
      await page2.locator(".vz-card").first().click({ force: true }).catch(() => {});
      await sleep(1800);
      await page2.getByRole("button", { name: "Subtitles" }).click({ force: true });
      await sleep(600);
      await page2.selectOption('[data-testid="t9-lang"]', "en");
      await sleep(400);
      const reason = await page2.locator('[data-testid="t9-router-down"]').innerText().catch(() => "");
      const disabled = await page2.locator('[data-testid="t9-translate"]').isDisabled();
      await page2.locator('[data-region="translate-panel"]').scrollIntoViewIfNeeded().catch(() => {});
      await sleep(300);
      ck("router mati: panel tampil '9Router tidak merespons' + tombol disabled",
        /9Router tidak merespons/.test(reason) && disabled,
        `disabled=${disabled} teks="${reason.replace(/\n/g, " ")}"`);
      await page2.screenshot({ path: resolve(OUT, "translate-router-mati.png") });
    } finally {
      await page2.close();
    }
  }
} finally {
  await browser.close();
  if (srv) srv.kill();
  if (srv2) srv2.kill();
}

console.log(`\n${pass.length} lulus, ${fail.length} gagal`);
if (fail.length) { console.log("GAGAL: " + fail.join("; ")); process.exit(1); }
