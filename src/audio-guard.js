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
