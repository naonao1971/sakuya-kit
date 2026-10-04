/* 咲耶シリーズ オフライン対応（F1）の Service Worker 本体。
 *
 * 各タイトルは、index.html と同じ場所に次の1行だけの sw.js を置き、createKit({ offline: true }) にする。
 *   importScripts(`https://cdn.jsdelivr.net/gh/naonao1971/sakuya-kit@${new URL(location).searchParams.get("kit")}/sw-core.js`);
 * kit が自分の版を付けて sw.js?kit=<版> を登録するので、kit の版を上げても sw.js は書き換えなくてよい。
 *
 * 保存のしかた:
 *  - 同じサイトのファイル（index.html・画像など）: 通信を先に試し、取れたら保存して返す。
 *    機内モードや通信が遅いとき（NETWORK_TIMEOUT_MS）は保存分を返す。オンラインなら常に最新が出る
 *  - kit（jsDelivr の sakuya-kit@<版>）と書体のファイル: 版やファイル名で中身が決まるので、保存分を先に返す
 *  - それ以外の別サイト（書体の CSS など）: 保存分をすぐ返し、裏で取り直す
 *  - 保存しないもの: ランキング（GAS）・X のアイコン（unavatar）・動画（mp4 など）・Range 付きの読み込み。
 *    動画は機内モードでは流れず、kit がジングルと結果画面に切り替える
 *  - 初回はページの方が先に読み込まれて、この Service Worker を通らない。kit がそのとき読んだファイルの
 *    一覧（performance の記録）を送ってくるので、それを取り直して保存する（sakuya-cache メッセージ）
 */
(() => {
  const KIT_VERSION = new URL(self.location.href).searchParams.get("kit") || "";
  const SCOPE = self.registration.scope;
  const CACHE = "sakuya-offline:" + SCOPE;
  const NETWORK_TIMEOUT_MS = 4000;

  const isVideo = (u) => /\.(mp4|m4v|mov|webm)$/i.test(u.pathname);
  function skip(req) {
    if (req.method !== "GET") return true;
    if (req.headers.has("range")) return true;
    let u;
    try {
      u = new URL(req.url);
    } catch (e) {
      return true;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") return true;
    if (isVideo(u)) return true;
    if (u.hostname === "script.google.com" || u.hostname.endsWith(".googleusercontent.com")) return true;
    if (u.hostname === "unavatar.io") return true;
    if (/(^|\.)(twitter|x)\.com$/.test(u.hostname)) return true;
    return false;
  }
  const kitFile = (url) => /^https:\/\/cdn\.jsdelivr\.net\/gh\/naonao1971\/sakuya-kit@([^/]+)\//.exec(url);
  const immutable = (url) => !!kitFile(url) || url.startsWith("https://fonts.gstatic.com/");
  const storable = (res) => res && (res.ok || res.type === "opaque") && res.status !== 206;

  async function put(req, res) {
    if (!storable(res)) return;
    try {
      const c = await caches.open(CACHE);
      await c.put(req, res);
    } catch (e) {
      /* 容量不足などは諦める（遊べないだけで、壊れはしない） */
    }
  }
  async function fromCache(req, navigate) {
    const c = await caches.open(CACHE);
    // ignoreVary: 保存したときと読み込むときで Accept などの見出しが違っても取り出す（iOS の Safari で外れていた）
    let hit = await c.match(req, { ignoreSearch: navigate, ignoreVary: true });
    // CORS で読む画像（kit の CNP の絵は crossOrigin 付き）に、中身の読めない形（opaque）の保存分を返すと
    // 画像が壊れて表示されない。そういう保存分は捨てて取り直す
    if (hit && hit.type === "opaque" && req.mode === "cors") {
      await c.delete(req, { ignoreVary: true });
      hit = undefined;
    }
    if (hit || !navigate) return hit;
    // 「/」と「/index.html」のどちらで開いても出す
    return (await c.match(SCOPE)) || (await c.match(SCOPE + "index.html"));
  }

  async function networkFirst(event) {
    const req = event.request;
    const navigate = req.mode === "navigate";
    const net = fetch(req).then((res) => {
      event.waitUntil(put(req, res.clone()));
      return res;
    });
    net.catch(() => {}); // 保存分を返した後に通信が失敗しても、エラーにしない
    const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, "timeout"));
    try {
      const first = await Promise.race([net, timeout]);
      if (first !== "timeout") return first;
      const hit = await fromCache(req, navigate);
      return hit || (await net);
    } catch (e) {
      const hit = await fromCache(req, navigate);
      if (hit) return hit;
      throw e;
    }
  }
  async function cacheFirst(event) {
    const hit = await fromCache(event.request, false);
    if (hit) return hit;
    const res = await fetch(event.request);
    event.waitUntil(put(event.request, res.clone()));
    return res;
  }
  async function staleWhileRevalidate(event) {
    const req = event.request;
    const net = fetch(req)
      .then((res) => {
        event.waitUntil(put(req, res.clone()));
        return res;
      })
      .catch(() => null);
    const hit = await fromCache(req, false);
    if (hit) {
      event.waitUntil(net);
      return hit;
    }
    const res = await net;
    if (res) return res;
    return Response.error();
  }

  self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil(
      caches
        .open(CACHE)
        .then((c) => c.add(SCOPE))
        .catch(() => {})
    );
  });

  // 古い版の kit のファイルを消す（版を上げるたびに溜まらないように）
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        await self.clients.claim();
        if (!KIT_VERSION) return;
        const c = await caches.open(CACHE);
        for (const req of await c.keys()) {
          const m = kitFile(req.url);
          if (m && m[1] !== KIT_VERSION) await c.delete(req);
        }
      })()
    );
  });

  self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (skip(req)) return;
    const sameOrigin = new URL(req.url).origin === self.location.origin;
    if (req.mode === "navigate" || sameOrigin) event.respondWith(networkFirst(event));
    else if (immutable(req.url)) event.respondWith(cacheFirst(event));
    else event.respondWith(staleWhileRevalidate(event));
  });

  // 初回に読んだファイルを取り直して保存する
  self.addEventListener("message", (event) => {
    const d = event.data || {};
    if (d.type !== "sakuya-cache" || !Array.isArray(d.urls)) return;
    event.waitUntil(
      (async () => {
        const c = await caches.open(CACHE);
        let saved = 0;
        for (const url of d.urls) {
          let req;
          try {
            req = new Request(url);
          } catch (e) {
            continue;
          }
          if (skip(req)) continue;
          const have = await c.match(req, { ignoreVary: true });
          if (have && have.type !== "opaque") {
            saved++;
            continue;
          }
          let res = null;
          try {
            res = await fetch(req);
          } catch (e) {
            // kit のファイル（jsDelivr）は必ず CORS で取れるので、中身の読めない形では保存しない
            if (kitFile(url)) continue;
            // CORS の無い別サイトは中身を読めない形（opaque）で保存する
            try {
              res = await fetch(new Request(url, { mode: "no-cors" }));
            } catch (e2) {
              res = null;
            }
          }
          if (storable(res)) {
            await put(req, res);
            saved++;
          }
        }
        if (event.source) event.source.postMessage({ type: "sakuya-cached", saved, total: d.urls.length });
      })()
    );
  });
})();
