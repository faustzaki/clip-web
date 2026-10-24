// node tools/verify-t10.mjs — b-roll dari folder lokal (T10): panel B-roll, saran tag,
// tombol "Sisipkan" di playhead, geser/hapus di kartu timeline, empty state.
// Pakai _mock.py + build di frontend/dist. Jalankan dari folder frontend.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(process.cwd(), "..");
const OUT = resolve(ROOT, "docs", "evidence", "T10", "after");
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
const panel = () => page.locator('[data-region="broll-panel"]');
const cards = () => page.locator('[data-testid^="t10-insert-"]');

async function openStudio(p) {
  await p.goto(BASE, { waitUntil: "networkidle" });
  await sleep(500);
  await p.locator(".vz-card").first().click({ force: true }).catch(() => {});
  await sleep(1800);
  await p.locator('[data-region="rail"] button[aria-label="B-roll"]').click({ force: true });
  await sleep(900);
}

try {
  await openStudio(page);
  ck("panel B-roll tampil dari rail", await panel().isVisible().catch(() => false));

  const count = await cards().count();
  ck("grid kartu b-roll ≥ 3 item", count >= 3, `kartu=${count}`);

  const cols = await page.locator('[data-region="broll-panel"] .grid').first()
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length).catch(() => 0);
  ck("grid 2 kolom", cols === 2, `kolom=${cols}`);

  const thumbLoaded = await page.locator('[data-region="broll-panel"] img').first()
    .evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false);
  ck("thumbnail kartu ter-render", thumbLoaded);

  const suggestionChips = await panel().locator("text=Saran").count();
  ck("maksimal 5 kandidat saran tampil", suggestionChips >= 1 && suggestionChips <= 5, `saran=${suggestionChips}`);
  await shot("broll-panel.png");

  // sisipkan di playhead
  const firstName = await cards().first().getAttribute("data-broll-name");
  await cards().first().click({ force: true });
  await sleep(1200);
  const inserted = await page.locator('[data-testid="t10-inserted"]').innerText().catch(() => "");
  ck("tombol Sisipkan menaruh item di playhead", /disisipkan di .* detik/.test(inserted),
    `${firstName} → "${inserted.replace(/\n/g, " ")}"`);
  await shot("broll-sisip.png");

  // kartu timeline + tombol geser/hapus
  const brollBlock = page.locator('[data-region="timeline-broll"]').first();
  ck("item b-roll muncul di kartu timeline", await brollBlock.isVisible().catch(() => false));
  const titleBefore = await brollBlock.locator("button").first().getAttribute("title");
  ck("tombol geser + hapus ada di kartu b-roll",
    (await page.locator('[data-testid="t10-broll-earlier"]').count()) >= 1 &&
    (await page.locator('[data-testid="t10-broll-later"]').count()) >= 1 &&
    (await page.locator('[data-testid="t10-broll-remove"]').count()) >= 1);

  await page.locator('[data-testid="t10-broll-later"]').first().click({ force: true });
  await sleep(1200);
  const titleAfter = await page.locator('[data-region="timeline-broll"]').first().locator("button").first().getAttribute("title");
  ck("tombol geser memindahkan item b-roll", titleBefore !== titleAfter, `${titleBefore} → ${titleAfter}`);

  await page.locator('[data-region="timeline-broll"]').first().scrollIntoViewIfNeeded().catch(() => {});
  await shot("broll-timeline.png");

  const beforeRemove = await page.locator('[data-region="timeline-broll"]').count();
  await page.locator('[data-testid="t10-broll-remove"]').first().click({ force: true });
  await sleep(1200);
  const afterRemove = await page.locator('[data-region="timeline-broll"]').count();
  ck("tombol hapus membuang satu item b-roll dari timeline",
    afterRemove === beforeRemove - 1, `${beforeRemove} → ${afterRemove}`);

  ck("tidak ada error runtime di halaman", errors.length === 0, errors.join(" | ").slice(0, 160));

  // ---------- empty state: folder b-roll kosong (mock kedua, MOCK_NO_BROLL=1) ----------
  if (OWN_SERVER) {
    srv2 = spawn("py", ["-3.13", "_mock.py"], {
      cwd: ROOT, stdio: "ignore", detached: false,
      env: { ...process.env, MOCK_PORT: "8016", MOCK_NO_BROLL: "1" },
    });
    await sleep(1800);
    const page2 = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    try {
      await page2.goto("http://127.0.0.1:8016/", { waitUntil: "networkidle" });
      await page2.locator(".vz-card").first().click({ force: true }).catch(() => {});
      await sleep(1800);
      await page2.locator('[data-region="rail"] button[aria-label="B-roll"]').click({ force: true });
      await sleep(900);
      const empty = await page2.locator('[data-testid="t10-empty"]').innerText().catch(() => "");
      ck("folder kosong: empty state Indonesia, bukan error",
        empty.includes("Folder b-roll masih kosong. Taruh video di data/broll."), empty.replace(/\n/g, " "));
      await page2.screenshot({ path: resolve(OUT, "broll-empty.png") });
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
