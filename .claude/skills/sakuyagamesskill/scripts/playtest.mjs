// 咲耶シリーズの自動プレイテスト（Playwright + Chromium）
//
//   node playtest.mjs --game <ゲームのリポジトリ> --kit <sakuya-kit の clone> --out <画面写真の置き場> [--file index.html]
//
// - ゲームのフォルダを手元の小さなサーバで配る。jsDelivr の sakuya-kit@<版> は手元の kit に差し替える
//   （この環境からは jsDelivr と script.google.com に出られないため）。GAS は空のランキングを返すだけの偽物
// - PC: タイトル → Enter でスタート → 右へ動かしてボタンを押す → P で一時停止 → 再開 →
//       kit.gameOver で GAME OVER → Enter で再スタート → kit.gameOver で CLEAR
// - スマホ横持ち: スタートボタンをタップ → 左半分のスティック → 縦持ちの案内
// - 各場面の画面写真を --out に書き、kit の状態・ページのエラー・sakuya-kit の警告を出す。
//   最後の行が "OK" ならエラーなし。写真は必ず自分の目で見て、崩れや読めない文字を確かめる
// - sw.js があるタイトルは、機内モードで開き直して起動・スタートできるかも確かめる（オフライン対応 F1）
// - ゲームには window.kit が要る（starter は出している）
import { createRequire } from "module";
import http from "http";
import fs from "fs";
import path from "path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1]]] : a), [])
);
const GAME = path.resolve(args.game || ".");
const KIT = path.resolve(args.kit || "../sakuya-kit");
const OUT = path.resolve(args.out || "./playtest-out");
const FILE = args.file || "index.html";
fs.mkdirSync(OUT, { recursive: true });

// Service Worker からの通信（jsDelivr の kit）も手元の kit に差し替えるための設定
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";
const require = createRequire(import.meta.url);
function loadPlaywright() {
  const tries = [process.env.PWPATH, "playwright", "/usr/local/lib/node_modules/playwright", "/usr/lib/node_modules/playwright"];
  for (const t of tries) {
    if (!t) continue;
    try { return require(t); } catch (e) { /* 次を試す */ }
  }
  throw new Error("playwright が見つかりません。PWPATH=$(npm root -g)/playwright を付けて実行してください");
}
const { chromium, devices } = loadPlaywright();

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg" };
const type = (p) => TYPES[path.extname(p).toLowerCase()] || "application/octet-stream";

const server = http.createServer((req, res) => {
  const p = path.join(GAME, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(GAME) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": type(p) });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch();
const problems = [];
const log = (...a) => console.log(...a);

async function newContext(opts, name) {
  const ctx = await browser.newContext(opts);
  await ctx.route(/https:\/\/cdn\.jsdelivr\.net\/gh\/naonao1971\/sakuya-kit@[^/]+\/.*/, (r) => {
    const p = new URL(r.request().url()).pathname.replace(/^\/gh\/naonao1971\/sakuya-kit@[^/]+\//, "");
    const f = path.join(KIT, p);
    if (!fs.existsSync(f)) return r.fulfill({ status: 404 });
    r.fulfill({ body: fs.readFileSync(f), contentType: type(f), headers: { "access-control-allow-origin": "*" } });
  });
  await ctx.route("https://script.google.com/**", (r) =>
    r.request().method() === "POST" ? r.fulfill({ json: { success: true } }) : r.fulfill({ json: { records: [], overall: [] } })
  );
  await ctx.route("https://unavatar.io/**", (r) => r.abort());
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[${name}] エラー: ${e.message}`));
  page.on("console", (m) => {
    const t = m.text();
    if (/fonts\.g|ERR_CERT|ERR_FAILED|net::|mp4|MEDIA_ERR/.test(t)) return;
    if (m.type() === "error" || /sakuya-kit/.test(t)) problems.push(`[${name}] ${m.type()}: ${t}`);
  });
  return { ctx, page };
}
const state = (page) => page.evaluate(() => (window.kit
  ? { phase: kit.phase, paused: kit.paused, score: kit.score.value, lives: kit.lives ? kit.lives.value : null, cnp: kit.cnp && kit.cnp.run ? kit.cnp.run.count : null, result: kit.result }
  : { error: "window.kit がありません" }));
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + ".png") });
const buttonKeys = (page) => page.evaluate(() => [...document.querySelectorAll(".sk-btn")].length);

// ---- PC ----
{
  const { ctx, page } = await newContext({ viewport: { width: 1280, height: 900 } }, "PC");
  await page.goto(BASE + FILE);
  await page.waitForTimeout(1500);
  await shot(page, "pc-1-title");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  log("PC スタート後:", JSON.stringify(await state(page)));
  await page.keyboard.down("ArrowRight");
  for (const k of ["KeyX", "Space", "KeyZ", "ArrowUp"]) { await page.keyboard.down(k); await page.waitForTimeout(200); await page.keyboard.up(k); await page.waitForTimeout(150); }
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(800);
  await shot(page, "pc-2-play");
  await page.keyboard.press("KeyP");
  await page.waitForTimeout(300);
  log("PC P で一時停止:", (await state(page)).paused);
  await shot(page, "pc-3-pause");
  await page.keyboard.press("KeyP");
  await page.waitForTimeout(300);
  if ((await state(page)).phase === "playing") await page.evaluate(() => kit.gameOver({ cleared: false, progress: 40 }));
  await page.waitForTimeout(1500);
  log("PC GAME OVER:", JSON.stringify(await state(page)));
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "pc-4-gameover");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  log("PC 再スタート:", (await state(page)).phase);
  if ((await state(page)).phase === "playing") await page.evaluate(() => kit.gameOver({ cleared: true, progress: 100 }));
  await page.waitForTimeout(1500);
  log("PC CLEAR:", JSON.stringify(await state(page)));
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "pc-5-clear");
  await ctx.close();
}

// ---- スマホ横持ち ----
{
  const { ctx, page } = await newContext({ ...devices["iPhone 13 landscape"] }, "スマホ");
  await page.goto(BASE + FILE);
  await page.waitForTimeout(1500);
  await shot(page, "m-1-title");
  await page.tap(".sk-start");
  await page.waitForTimeout(500);
  log("スマホ スタート後:", (await state(page)).phase, "ボタン数:", await buttonKeys(page));
  const box = await page.locator("canvas").first().boundingBox();
  log("スマホ canvas:", Math.round(box.width) + "x" + Math.round(box.height));
  const cdp = await ctx.newCDPSession(page);
  const touch = (t, pts) => cdp.send("Input.dispatchTouchEvent", { type: t, touchPoints: pts });
  const ox = box.x + box.width * 0.2, oy = box.y + box.height * 0.6;
  await touch("touchStart", [{ x: ox, y: oy, id: 1 }]);
  await touch("touchMove", [{ x: ox + 30, y: oy, id: 1 }]);
  await page.waitForTimeout(500);
  log("スマホ スティック右:", JSON.stringify(await page.evaluate(() => ({ stickX: kit.input.stickX, axis: kit.input.axis() }))));
  await shot(page, "m-2-play");
  await touch("touchEnd", []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  log("スマホ 縦持ちで止まる:", await page.evaluate(() => kit.orientationBlocked));
  await shot(page, "m-3-portrait");
  await ctx.close();
}

// ---- 機内モード（sw.js があるタイトルだけ） ----
if (fs.existsSync(path.join(GAME, "sw.js"))) {
  const { ctx, page } = await newContext({ ...devices["iPhone 13 landscape"], serviceWorkers: "allow" }, "機内モード");
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(BASE + FILE);
  let off = null;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    off = await page.evaluate(() => (window.kit && kit.offline ? { ...kit.offline } : null));
    if (off && off.cached) break;
  }
  log("オンラインで保存:", JSON.stringify(off));
  if (!off || !off.enabled) problems.push("[機内モード] sw.js はあるが createKit の offline: true が無い（または kit が 0.4.0 より前）");
  else if (!off.cached) problems.push("[機内モード] ファイルを保存できなかった");
  await ctx.unroute("https://script.google.com/**");
  await ctx.route("https://script.google.com/**", (r) => r.abort("internetdisconnected"));
  await ctx.setOffline(true);
  await page.reload().catch((e) => problems.push("[機内モード] 開き直せない: " + e.message));
  await page.waitForTimeout(1500);
  log("機内モードで開き直す:", JSON.stringify(await state(page)));
  await shot(page, "off-1-title");
  await page.tap(".sk-start").catch(() => problems.push("[機内モード] スタートボタンが無い"));
  await page.waitForTimeout(800);
  const ph = (await state(page)).phase;
  log("機内モードでスタート:", ph);
  if (ph !== "playing") problems.push("[機内モード] スタートできない");
  await shot(page, "off-2-play");
  await ctx.close();
}

await browser.close();
server.close();
log("画面写真:", OUT);
if (problems.length) { log(problems.join("\n")); process.exitCode = 1; } else log("OK");
