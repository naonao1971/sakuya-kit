// タイトル・OGP画像・アイコン・manifest.json・<head> をまとめて作る（tools/ogp.html と同じ src/brand.js を使う）
//
//   node make-assets.mjs --game <ゲームのリポジトリ> --kit <sakuya-kit の clone> --visual <キービジュアル>
//     --title "SAKUYA XXX" --subtitle "- XXX -" --name-ja "咲耶XXX" --desc "説明文（60〜90字）"
//     --url "https://xxx.naoblock.jp/" [--kit-version 0.2.0] [--style plain|series]
//     [--icon-x 0.5 --icon-y 0.55 --icon-zoom 2.6] [--icon-text "▶"]
//
// 書き出すもの（ゲームのリポジトリ直下に上書き）:
//   ogp.png(1200x630) / apple-touch-icon.png(180) / icon-192.png / icon-512.png / favicon-32.png / manifest.json
// index.html の <!-- sk:head ここから --> 〜 <!-- sk:head ここまで --> の間を、シリーズ共通の <head> で入れ替える。
// 目印が無い古い index.html は入れ替えずに head.html として書き出す。
// アイコンの切り抜き位置は、書き出した icon-512.png を見て --icon-x/y/zoom で合わせ直す。
import { createRequire } from "module";
import http from "http";
import fs from "fs";
import path from "path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1]]] : a), [])
);
const need = ["game", "kit", "visual", "title", "name-ja", "desc", "url"];
const miss = need.filter((k) => !args[k]);
if (miss.length) { console.error("足りない引数: " + miss.map((k) => "--" + k).join(" ")); process.exit(1); }
const GAME = path.resolve(args.game), KIT = path.resolve(args.kit), VISUAL = path.resolve(args.visual);
const meta = {
  title: args.title, subtitle: args.subtitle || "", nameJa: args["name-ja"], description: args.desc,
  url: args.url.endsWith("/") ? args.url : args.url + "/", kitVersion: args["kit-version"] || "0.2.0",
};
const opts = {
  style: args.style || "plain",
  icon: args["icon-text"] ? { kind: "text", text: args["icon-text"] }
    : { kind: "image", focusX: +(args["icon-x"] || 0.5), focusY: +(args["icon-y"] || 0.55), zoom: +(args["icon-zoom"] || 2.6) },
};

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const t of [process.env.PWPATH, "playwright", "/usr/local/lib/node_modules/playwright", "/usr/lib/node_modules/playwright"]) {
    if (!t) continue;
    try { return require(t); } catch (e) { /* 次を試す */ }
  }
  throw new Error("playwright が見つかりません。PWPATH=$(npm root -g)/playwright を付けて実行してください");
}
const { chromium } = loadPlaywright();

// /kit/ → sakuya-kit、/visual → キービジュアル
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let f = null;
  if (u === "/visual") f = VISUAL;
  else if (u.startsWith("/kit/")) f = path.join(KIT, u.slice(5));
  if (u === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<!doctype html><meta charset=utf-8><body></body>"); }
  if (!f || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": f.endsWith(".js") ? "text/javascript" : "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(BASE);
const out = await page.evaluate(async ({ meta, opts }) => {
  const b = await import("/kit/src/brand.js");
  // OGP の文字（series のとき）に使う書体。読めなければ等幅で描かれる
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=DotGothic16&family=Press+Start+2P&display=swap";
  document.head.appendChild(link);
  try { await Promise.race([document.fonts.load('16px "Press Start 2P"'), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* 無視 */ }
  const img = new Image();
  img.src = "/visual";
  await img.decode();
  const c = () => document.createElement("canvas");
  const ogp = b.drawOgp(c(), meta, img, { style: opts.style }).toDataURL("image/png");
  const icons = {};
  for (const [name, size] of [["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512], ["favicon-32.png", 32]]) {
    icons[name] = b.drawIcon(c(), size, opts.icon, img).toDataURL("image/png");
  }
  return { ogp, icons, head: b.headHTML(meta), manifest: b.manifestJSON(meta), pageTitle: b.pageTitle(meta) };
}, { meta, opts });
await browser.close();
server.close();

const save = (name, dataUrl) => fs.writeFileSync(path.join(GAME, name), Buffer.from(dataUrl.split(",")[1], "base64"));
save("ogp.png", out.ogp);
for (const [name, d] of Object.entries(out.icons)) save(name, d);
fs.writeFileSync(path.join(GAME, "manifest.json"), out.manifest + "\n");

const indexPath = path.join(GAME, "index.html");
const START = /<!-- sk:head ここから[^>]*-->/, END = "<!-- sk:head ここまで -->";
const head = out.head.split("\n").map((l) => "  " + l).join("\n");
let html = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "";
const m = html.match(START);
if (m && html.includes(END)) {
  const a = html.indexOf(m[0]) + m[0].length, z = html.indexOf(END);
  html = html.slice(0, a) + "\n" + head + "\n  " + html.slice(z);
  fs.writeFileSync(indexPath, html);
  console.log("index.html の <head> を入れ替えました");
} else {
  fs.writeFileSync(path.join(GAME, "head.html"), out.head + "\n");
  console.log("index.html に sk:head の目印が無いので head.html に書き出しました（手で入れ替える）");
}
console.log("書き出し: ogp.png apple-touch-icon.png icon-192.png icon-512.png favicon-32.png manifest.json");
console.log("<title>: " + out.pageTitle + "  ← createKit の title / subtitle も同じ値にする");
