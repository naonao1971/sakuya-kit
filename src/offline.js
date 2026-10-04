// オフライン対応（F1）。タイトルの sw.js を Service Worker として登録し、
// 初回に読んだファイルの一覧を渡して保存させる。中身は sakuya-kit の sw-core.js。
//
//   createKit({ offline: true })            … index.html と同じ場所の sw.js を使う
//   createKit({ offline: { sw: "sw.js" } }) … sw.js の場所を変えるとき
//
// jsDelivr の sakuya-kit@<版> から読んだときだけ動く（版を sw.js に渡すため）。
// 手元の kit（demo など）から読んだときは何もしない。
// kit のファイル（jsDelivr の sakuya-kit@<版>/ 以下）。ページの読み込みの記録（performance）に
// 載らないことがある（Safari のメモリやディスクの一時保存から出たときなど）ので、名指しで保存させる
const KIT_FILES = [
  "kit.js",
  "kit.css",
  "src/audio-guard.js",
  "src/brand.js",
  "src/buttons.js",
  "src/cnp.js",
  "src/cutscene.js",
  "src/dom.js",
  "src/fullscreen.js",
  "src/gyro.js",
  "src/offline.js",
  "src/play.js",
  "src/ranking.js",
  "src/retro.js",
  "src/sfx.js",
  "src/share.js",
  "src/stick.js",
];

// extraUrls(): 名指しで保存させたいファイル（kit が CNP の絵などを渡す）
export function setupOffline(opt, { extraUrls } = {}) {
  const state = { enabled: false, registered: false, cached: false, version: null };
  if (!opt) return state;
  if (!("serviceWorker" in navigator)) return state;
  const m = /\/sakuya-kit@([0-9A-Za-z._-]+)\//.exec(import.meta.url);
  if (!m) {
    console.warn("sakuya-kit: offline は jsDelivr の sakuya-kit@<版> から読み込んだときだけ動きます");
    return state;
  }
  state.enabled = true;
  state.version = m[1];
  const file = (typeof opt === "object" && opt.sw) || "sw.js";

  // 初回はページが先に読み込まれているので、読んだファイルを Service Worker に伝えて保存させる
  const kitBase = new URL("../", import.meta.url).href;
  const collect = () => {
    const urls = new Set([location.href.split("#")[0]]);
    for (const e of performance.getEntriesByType("resource")) urls.add(e.name);
    for (const f of KIT_FILES) urls.add(kitBase + f);
    if (extraUrls) for (const u of extraUrls()) urls.add(u);
    return [...urls];
  };
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data && e.data.type === "sakuya-cached") state.cached = true;
  });
  const register = () => {
    navigator.serviceWorker
      .register(`${file}?kit=${encodeURIComponent(state.version)}`, { scope: "./" })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        state.registered = true;
        // 書体など、少し遅れて読まれるものも拾う
        setTimeout(() => {
          const sw = reg.active || navigator.serviceWorker.controller;
          if (sw) sw.postMessage({ type: "sakuya-cache", urls: collect() });
        }, 1500);
      })
      .catch((err) => console.warn(`sakuya-kit: ${file} を登録できませんでした（オフライン対応）`, err));
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
  return state;
}
