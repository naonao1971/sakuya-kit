// 音が止まったままになるのを防ぐ見張り。
//
// iOS / iPadOS では、一度ユーザー操作の中で鳴らせる状態（running）にした AudioContext が、
// 演出動画の解錠（無音での一瞬の再生）・ジャイロの許可ダイアログ・全画面の切り替え・
// ほかのアプリの音などで suspended / interrupted に戻ることがある。
// 戻ったまま誰も resume() しないと、そのプレイはずっと無音になる
// （「最初のプレイだけ音が出ず、2回目からは出る」はこれ。演出動画の解錠は最初のスタートでだけ行うため）。
//
// ページの中で作られた AudioContext を、kit のものもタイトル独自のもの（咲耶ジャンプバグ・
// 咲耶Nounラリーの BGM など）も覚えておき、タッチ・クリック・キー入力のたびと、
// ページが前面に戻ったときに、running でなければ resume() する。
// ユーザー操作の中で呼ぶので、iOS でも再開できる。
const contexts = new Set();
let installed = false;

export function resumeAllAudio() {
  for (const ctx of contexts) {
    if (ctx.state !== "running" && ctx.state !== "closed") {
      try {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
      } catch (e) {
        /* 閉じた直後などは無視 */
      }
    }
  }
}

export function trackAudioContext(ctx) {
  if (ctx) contexts.add(ctx);
}

// kit.js の読み込み時に1回だけ呼ぶ。タイトルの script は kit を import した後に動くので、
// タイトルが自分で作る AudioContext もここで覚えられる
export function installAudioGuard() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  for (const name of ["AudioContext", "webkitAudioContext"]) {
    const Native = window[name];
    if (typeof Native !== "function" || Native.__skGuarded) continue;
    try {
      const Guarded = class extends Native {
        constructor(...args) {
          super(...args);
          contexts.add(this);
        }
      };
      Guarded.__skGuarded = true;
      window[name] = Guarded;
    } catch (e) {
      /* 置き換えられない環境では、kit が作る分だけ trackAudioContext で覚える */
    }
  }
  for (const type of ["pointerdown", "touchend", "click", "keydown"]) {
    window.addEventListener(type, resumeAllAudio, { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resumeAllAudio();
  });
}

// ── iPad・iPhone の消音モード（サイレントスイッチ / コントロールセンターのベル）──
// Web Audio の音（効果音・BGM）は、消音モードでは鳴らない（Safari は「周りの音」として扱う）。
// 一方、音付きの動画は消音モードでも鳴り、一度流れると Safari 全体がしばらく「メディア再生中」の扱いになって、
// 別のサイトのゲームの音まで鳴るようになる（「最初のプレイは無音、動画の後は鳴る、別のゲームでも鳴る」はこれ）。
// ゲームの音も「メディア再生」として扱ってもらい、消音モードでも鳴るようにする。
//  - Safari 16.4+ / iOS 17+: navigator.audioSession.type = "playback"
//  - それより古い iOS: 無音の音声を <audio> で流し続ける（よく使われる回避策。ユーザー操作の中で始める）
// 音を ⚙ でオフにしている人には使わない（"auto" に戻し、無音の音声も止める）。
// 副作用: ほかのアプリで流している音楽は、ゲームを始めると止まる（動画を流したときと同じ）
let wantPlayback = false;
let silentEl = null;
const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.platform || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

function silentWavUrl() {
  const rate = 8000;
  const n = rate / 2; // 0.5秒の無音（8bit・モノラル）
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (o, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + n, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, "data");
  v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

function playSilent() {
  if (!silentEl) {
    silentEl = document.createElement("audio");
    silentEl.src = silentWavUrl();
    silentEl.loop = true;
    silentEl.preload = "auto";
    silentEl.setAttribute("playsinline", "");
    silentEl.setAttribute("x-webkit-airplay", "deny");
  }
  if (!silentEl.paused) return;
  try {
    const p = silentEl.play();
    if (p && p.catch) p.catch(() => {});
  } catch (e) {
    /* ユーザー操作の外なら次のタッチで */
  }
}

// on: 音がオンのとき true。スタートのタップと、⚙ の音の切り替え（どちらもユーザー操作の中）で呼ぶ
export function setPlaybackAudio(on) {
  wantPlayback = !!on;
  const s = typeof navigator !== "undefined" ? navigator.audioSession : null;
  if (s && "type" in s) {
    try {
      s.type = wantPlayback ? "playback" : "auto";
    } catch (e) {
      /* 無視 */
    }
    return;
  }
  if (!isIOS()) return;
  if (wantPlayback) playSilent();
  else if (silentEl) silentEl.pause();
}

// 前面に戻ったとき・タッチのたびに、無音の音声が止まっていれば流し直す（古い iOS 向け）
function keepSilent() {
  if (wantPlayback && silentEl && silentEl.paused && !document.hidden) playSilent();
}
if (typeof window !== "undefined") {
  for (const type of ["pointerdown", "touchend", "click", "keydown"]) {
    window.addEventListener(type, keepSilent, { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (silentEl) silentEl.pause();
    } else keepSilent();
  });
}
