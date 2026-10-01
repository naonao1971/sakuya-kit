// ランキング (Google スプレッドシート + Apps Script) とスコア登録フォーム。
// 1本の Apps Script を全タイトルで共有し、?game=<gameId> でシートを分ける
// （gas/apps-script.gs）。
import { escapeHTML } from "./dom.js";
import { parseRescued } from "./cnp.js";

// モバイルだとフォームがcanvasより下にあり、スクロールしないと気づけない。
// ただし即スクロールするとCLEAR画面を見る前に飛ぶので、少し見せてから誘導する
const FORM_SCROLL_DELAY_MS = 2000;
const X_ID_RE = /^[A-Za-z0-9_]{1,15}$/;
// 登録したニックネームとX IDを次回のフォームに入れておく（この端末・このドメインだけ）
const PLAYER_STORE_KEY = "sakuya-kit:player";

function loadPlayer() {
  try {
    return JSON.parse(localStorage.getItem(PLAYER_STORE_KEY) || "null") || {};
  } catch (e) {
    return {};
  }
}
function savePlayer(p) {
  try {
    localStorage.setItem(PLAYER_STORE_KEY, JSON.stringify(p));
  } catch (e) {
    /* プライベートブラウズ等では保存しない */
  }
}

// 端末の localStorage を JSON で読み書きする（保存できない環境では何もしない）
function readJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v == null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}
function writeJSON(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch (e) {
    /* 無視 */
  }
}
const newRecordId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

// X のアイコンが読めるかで、アカウントの実在を確かめる（送信待ちの記録を送る直前に使う）
function checkXid(username, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => resolve(null), timeoutMs); // 分からない
    img.onload = () => (clearTimeout(t), resolve(true));
    img.onerror = () => (clearTimeout(t), resolve(isOffline() ? null : false));
    img.src = "https://unavatar.io/x/" + encodeURIComponent(username);
  });
}

function withParams(gasUrl, params) {
  const u = new URL(gasUrl);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

// Xのアイコンとリンク
function xHTML(rawXid) {
  const xid = String(rawXid || "").replace(/^@/, "").trim();
  if (!X_ID_RE.test(xid)) return "";
  return `<img class="sk-lb-avatar" src="https://unavatar.io/x/${encodeURIComponent(xid)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
     <a class="sk-lb-xlink" href="https://x.com/${encodeURIComponent(xid)}" target="_blank" rel="noopener noreferrer">@${escapeHTML(xid)}</a>`;
}

const medalOf = (rank) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}`);

// CNPロスター。救出キャラを持たない記録では出さない
export function rosterHTML(cnp, rescued) {
  if (!cnp) return "";
  const got = parseRescued(rescued, cnp.chars.length);
  if (!got.size) return "";
  const slots = cnp.chars
    .map((ch) => {
      const on = got.has(ch.no);
      const img = on ? `<img src="${escapeHTML(ch.src)}" alt="" onerror="this.remove()">` : "";
      return `<span class="sk-lb-slot${on ? " got" : ""}" style="--h:${ch.hue}" title="${escapeHTML(ch.label)}">${img}</span>`;
    })
    .join("");
  return `<span class="sk-lb-roster">${slots}<span class="sk-lb-roster-count">${got.size}/${cnp.chars.length}</span></span>`;
}

// 記録の2段目（クリア / 進行度 / CNP の体数）。ロスター（番号の一覧）がある記録は roster 側で見せる
function subLineHTML(cnp, r, labels) {
  const parts = [];
  if (r.cleared === true || r.cleared === "TRUE") parts.push(escapeHTML(labels.clear));
  else if (r.progress != null && r.progress !== "") parts.push(`${escapeHTML(labels.progress)} ${Math.floor(Number(r.progress) || 0)}%`);
  const hasList = cnp && parseRescued(r.rescued, cnp.chars.length).size > 0;
  if (!hasList && r.cnp != null && r.cnp !== "" && cnp) parts.push(`CNP ${Number(r.cnp) || 0}/${cnp.chars.length}`);
  return parts.length ? `<span class="sk-lb-sub">${parts.join(" ・ ")}</span>` : "";
}

// ── 総合ランキング ──
// GAS の ?action=overall が返す { games, players, maxPerGame } を描く
export function overallRowsHTML(data, cnp, limit = 10) {
  const players = (data && data.players) || [];
  if (!players.length) return '<li class="sk-lb-empty">まだ記録がありません</li>';
  const games = data.games || [];
  const max = data.maxPerGame || 1000;
  return players
    .slice(0, limit)
    .map((p, i) => {
      const chips = games
        .map((g) => {
          const e = p.games && p.games[g.id];
          const pts = e ? e.points : "—";
          const top = e && e.points >= max ? " sk-lb-game-top" : "";
          return `<span>${escapeHTML(g.title)} <span class="sk-lb-game-pts${top}">${pts}</span></span>`;
        })
        .join("");
      return `<li class="sk-lb-row">
          <span class="sk-lb-rank">${medalOf(i + 1)}</span>
          <span class="sk-lb-name">${escapeHTML(p.nickname)}</span>
          <span class="sk-lb-xname">${xHTML(p.xid)}</span>
          <span class="sk-lb-score">${Math.floor(Number(p.total) || 0)}pt</span>
          <span class="sk-lb-games">${chips}</span>
          ${rosterHTML(cnp, p.rescued) ||
            (cnp && p.cnpBest ? `<span class="sk-lb-sub">CNP 最高 ${p.cnpBest}/${cnp.chars.length}</span>` : "")}
        </li>`;
    })
    .join("");
}

export function overallNote(data) {
  const n = ((data && data.games) || []).length;
  const max = (data && data.maxPerGame) || 1000;
  return `各タイトルの自己ベスト ÷ そのタイトルの1位 × ${max} の合計（対象 ${n} タイトル／X IDが同じ記録は同じ人として合算）`;
}

export function fetchOverall(gasUrl) {
  return fetch(withParams(gasUrl, { action: "overall" }), { cache: "no-store" }).then((r) => r.json());
}

export function createRanking({ dom, gasUrl, gameId, cnp, isMobile, getResult, overall = true, maxScore = null, labels = {} }) {
  const L = { clear: "クリア", progress: "進行", ...labels };
  let cache = [];
  let tab = "game";
  let overallData = null;
  let overallLoading = null;
  let xidState = "empty"; // "empty" | "loading" | "found" | "error"
  let xidToken = 0;
  let scrollTimer = null;

  const endpoint = () => (gasUrl ? withParams(gasUrl, { game: gameId }) : "");

  // ── オフラインのスコアを後で送る（F2） ──
  // 送れなかった記録は「送信待ち」として端末にため、つながったとき（online）と次に開いたときに送る。
  // 最後に取れた TOP10 も端末に残し、オフラインではそれで表示と TOP10 入りの判定をする
  const OUTBOX_KEY = `sakuya-kit:outbox:${gameId}`;
  const RANK_CACHE_KEY = `sakuya-kit:rank:${gameId}`;
  let outbox = readJSON(OUTBOX_KEY, []);
  if (!Array.isArray(outbox)) outbox = [];
  let showingSaved = false; // 端末に残した TOP10 を出しているか
  let flushing = false;
  const overallOn = !!gasUrl && overall !== false;

  // ── 「このゲーム / 総合」の切り替え ──
  function setTab(next) {
    tab = next;
    for (const b of dom.lbTabs.querySelectorAll(".sk-lb-tab")) {
      b.setAttribute("aria-selected", String(b.dataset.tab === tab));
    }
    dom.lbList.hidden = tab !== "game";
    dom.lbOverall.hidden = tab !== "overall";
    dom.lbTitle.textContent = tab === "overall" ? "🏆 総合ランキング TOP10" : "🏆 TOP10 ランキング";
    if (tab === "overall") loadOverall(false);
  }
  if (overallOn) {
    dom.lbTabs.hidden = false;
    for (const b of dom.lbTabs.querySelectorAll(".sk-lb-tab")) {
      b.addEventListener("click", () => setTab(b.dataset.tab));
    }
  }

  function renderOverall() {
    dom.lbOverallNote.textContent = overallData ? overallNote(overallData) : "";
    dom.lbOverallList.innerHTML = overallData
      ? overallRowsHTML(overallData, cnp)
      : '<li class="sk-lb-empty">読み込み中...</li>';
  }

  // force=false なら一度読んだものを使い回す（タブを行き来するたびに通信しない）
  function loadOverall(force) {
    if (!overallOn) return Promise.resolve(null);
    if (overallData && !force) {
      renderOverall();
      return Promise.resolve(overallData);
    }
    if (overallLoading) return overallLoading;
    renderOverall();
    overallLoading = fetchOverall(gasUrl)
      .then((d) => {
        overallData = d;
        return d;
      })
      .catch(() => {
        overallData = { games: [], players: [] };
        return overallData;
      })
      .finally(() => {
        overallLoading = null;
        renderOverall();
      });
    return overallLoading;
  }

  function render() {
    const pending = outbox.length
      ? `<li class="sk-lb-empty sk-lb-pending">送信待ち ${outbox.length}件 ― つながったら自動で登録します</li>`
      : "";
    if (!cache.length) {
      dom.lbList.innerHTML =
        (isOffline()
          ? '<li class="sk-lb-empty">オフラインのため、ランキングは表示できません</li>'
          : '<li class="sk-lb-empty">まだ記録がありません</li>') + pending;
      return;
    }
    const note = showingSaved ? '<li class="sk-lb-empty sk-lb-offline">オフライン中 ― 最後に取得したランキングです</li>' : "";
    dom.lbList.innerHTML = note + pending + cache
      .slice(0, 10)
      .map((r, i) => {
        const medal = medalOf(i + 1);
        const xPart = xHTML(r.xid);
        const deviceIcon = r.device === "モバイル" ? "📱" : r.device === "PC" ? "💻" : "";
        return `<li class="sk-lb-row">
            <span class="sk-lb-rank">${medal}</span>
            <span class="sk-lb-name">${deviceIcon ? `<span title="${escapeHTML(r.device)}">${deviceIcon}</span> ` : ""}${escapeHTML(r.nickname)}</span>
            <span class="sk-lb-xname">${xPart}</span>
            <span class="sk-lb-score">${Math.floor(Number(r.score) || 0)}</span>
            ${subLineHTML(cnp, r, L)}
            ${rosterHTML(cnp, r.rescued)}
          </li>`;
      })
      .join("");
  }

  // ランキングを取り直す。取れたら端末に残し、取れなければ端末に残した分を出す
  function fetchList() {
    if (!gasUrl) {
      render();
      return Promise.resolve(false);
    }
    return fetch(endpoint(), { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        cache = (d.records || []).slice().sort((a, b) => b.score - a.score);
        showingSaved = false;
        writeJSON(RANK_CACHE_KEY, cache.slice(0, 10));
        render();
        return true;
      })
      .catch(() => {
        if (!cache.length) {
          const saved = readJSON(RANK_CACHE_KEY, []);
          if (Array.isArray(saved) && saved.length) {
            cache = saved;
            showingSaved = true;
          }
        }
        render();
        return false;
      });
  }
  function load() {
    return fetchList().then((ok) => {
      if (ok && outbox.length) flushOutbox();
    });
  }

  function postRecord(record) {
    return fetch(endpoint(), { method: "POST", body: JSON.stringify({ action: "add", game: gameId, record }) }).then((r) =>
      r.json()
    );
  }

  // 送信待ちを古い順に送る。通信できなければそこで止め、残りは次の機会に
  async function flushOutbox() {
    if (flushing || !outbox.length || !gasUrl || isOffline()) return;
    flushing = true;
    let sent = 0;
    try {
      while (outbox.length) {
        const rec = { ...outbox[0] };
        if (rec.xidPending) {
          // オフラインで入れた X ID は、送る直前に確かめる。見つからなければ外して送る
          const ok = rec.xid ? await checkXid(rec.xid) : true;
          if (ok === null) break; // まだつながっていない
          if (!ok) rec.xid = "";
          delete rec.xidPending;
        }
        let d;
        try {
          d = await postRecord(rec);
        } catch (e) {
          break; // 通信できない。残りは次に
        }
        if (!d.success) console.warn("sakuya-kit: 送信待ちの記録を GAS が受け付けませんでした", d.error, rec);
        outbox.shift(); // 成功（同じ記録IDで入れ済みも含む）か、受け付けられない記録は消す
        writeJSON(OUTBOX_KEY, outbox);
        sent++;
      }
    } finally {
      flushing = false;
    }
    if (sent) {
      fetchList();
      if (overallData || tab === "overall") loadOverall(true);
    } else render();
  }
  window.addEventListener("online", () => flushOutbox());

  function qualifies(score) {
    if (!(score > 0)) return false;
    // 上限を超える記録は GAS が断るので、フォームを出さない（出すと「登録に失敗」になるだけ）
    if (maxScore != null && score > maxScore) {
      console.warn(`sakuya-kit: スコア ${score} が maxScore ${maxScore} を超えています`);
      return false;
    }
    if (cache.length < 10) return true;
    return score > cache[9].score;
  }

  function setVisible(v) {
    dom.leaderboard.classList.toggle("visible", !!v);
  }

  function scrollToForm() {
    if (!dom.register.classList.contains("visible")) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    dom.register.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    try {
      dom.nick.focus({ preventScroll: true });
    } catch (e) {
      /* preventScroll未対応は無視 */
    }
  }

  function showForm() {
    dom.register.classList.add("visible");
    const saved = loadPlayer();
    dom.nick.value = saved.nickname || "";
    dom.xidInput.value = saved.xid || "";
    dom.submitStatus.textContent = "";
    xidState = "empty";
    setXidPreview(null, "");
    if (dom.xidInput.value) verifyXid(dom.xidInput.value);
    updateSubmit();
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(scrollToForm, FORM_SCROLL_DELAY_MS);
  }

  function hideForm() {
    // 待たずに再スタートされたとき、ゲーム中に誘導スクロールが割り込まないよう必ず取り消す
    clearTimeout(scrollTimer);
    scrollTimer = null;
    dom.register.classList.remove("visible");
  }

  // ニックネーム入力済み かつ (X IDが空 または 確認済み) のときだけ登録できる
  function updateSubmit() {
    const xidOk = xidState === "empty" || xidState === "found" || xidState === "pending";
    dom.submit.disabled = !dom.nick.value.trim() || !xidOk;
  }

  function setXidPreview(mode, html) {
    dom.xidPreview.className = "sk-xid" + (mode ? " visible xid-" + mode : "");
    dom.xidPreview.innerHTML = html || "";
  }

  // unavatar.io のアバター読み込み成否で、Xアカウントが実在するかを簡易検証する
  function verifyXid(raw) {
    const username = String(raw || "").replace(/^@/, "").trim();
    const token = ++xidToken;
    if (!username) {
      xidState = "empty";
      setXidPreview(null, "");
      updateSubmit();
      return;
    }
    if (!X_ID_RE.test(username)) {
      xidState = "error";
      setXidPreview("error", "形式エラー：半角英数字・アンダースコアのみ、最大15文字で入力してください");
      updateSubmit();
      return;
    }
    if (isOffline()) {
      // オフラインでは確かめられないので、送るときに確かめる（見つからなければ X ID を外して登録）
      xidState = "pending";
      setXidPreview("loading", "オフラインのため、つながってから確認します");
      updateSubmit();
      return;
    }
    xidState = "loading";
    setXidPreview("loading", "確認中...");
    updateSubmit();
    const img = new Image();
    img.onload = () => {
      if (token !== xidToken) return;
      xidState = "found";
      setXidPreview(
        "found",
        `<img src="https://unavatar.io/x/${encodeURIComponent(username)}" alt="" class="sk-xid-avatar">` +
          `<a href="https://x.com/${encodeURIComponent(username)}" target="_blank" rel="noopener noreferrer">@${escapeHTML(username)}</a>` +
          `<span>を確認しました</span>`
      );
      updateSubmit();
    };
    img.onerror = () => {
      if (token !== xidToken) return;
      if (isOffline()) {
        xidState = "pending";
        setXidPreview("loading", "オフラインのため、つながってから確認します");
        updateSubmit();
        return;
      }
      xidState = "error";
      setXidPreview("error", "このXアカウントの名称を取得できませんでした。IDを確認してください");
      updateSubmit();
    };
    img.src = "https://unavatar.io/x/" + encodeURIComponent(username);
  }

  dom.xidInput.addEventListener("input", () => {
    xidState = dom.xidInput.value.trim() ? "loading" : "empty";
    setXidPreview(null, "");
    updateSubmit();
  });
  dom.xidInput.addEventListener("blur", () => verifyXid(dom.xidInput.value));
  dom.nick.addEventListener("input", updateSubmit);

  dom.submit.addEventListener("click", () => {
    const nickname = dom.nick.value.trim();
    if (!nickname) {
      dom.submitStatus.textContent = "ニックネームを入力してください";
      dom.nick.focus();
      return;
    }
    if (xidState !== "empty" && xidState !== "found" && xidState !== "pending") {
      dom.submitStatus.textContent = "XのIDを確認できるまで登録できません";
      dom.xidInput.focus();
      return;
    }
    if (!gasUrl) {
      dom.submitStatus.textContent = "ランキング機能が未設定です（gasUrl 未設定）";
      return;
    }
    const result = getResult() || {};
    const record = {
      id: newRecordId(), // 送り直しても二重に入らないよう、記録ごとの番号を付ける（F2）
      nickname,
      xid: dom.xidInput.value.trim().replace(/^@/, ""),
      score: Math.floor(result.score || 0),
      created: Date.now(),
      device: isMobile ? "モバイル" : "PC",
      rescued: Array.isArray(result.rescued) ? result.rescued.join(",") : String(result.rescued || ""),
      cnp: result.cnp != null ? result.cnp : "",
      cleared: !!result.cleared,
      progress: result.progress != null ? result.progress : "",
    };
    const done = (msg) => {
      dom.submitStatus.textContent = msg;
      savePlayer({ nickname: record.nickname, xid: record.xid });
      hideForm();
    };
    // 送れなかった記録は送信待ちにためて、つながったら送る
    const queue = (msg = "オフラインのため送信待ちにしました。つながったら自動で登録します") => {
      outbox.push(xidState === "pending" && record.xid ? { ...record, xidPending: true } : record);
      writeJSON(OUTBOX_KEY, outbox);
      done(msg);
      render();
    };
    if (isOffline()) {
      queue();
      return;
    }
    // オフラインで入れた X ID が未確認のまま、もうつながっている: 送信待ちに入れてすぐ送る（送る直前に確かめる）
    if (xidState === "pending") {
      queue("登録中...");
      flushOutbox();
      return;
    }
    dom.submit.disabled = true;
    dom.submitStatus.textContent = "登録中...";
    postRecord(record)
      .then((d) => {
        if (d.success) {
          done("登録しました！");
          load();
          if (overallData || tab === "overall") loadOverall(true);
        } else {
          dom.submitStatus.textContent = "登録に失敗しました: " + (d.error || "");
          updateSubmit();
        }
      })
      .catch(() => queue());
  });

  return {
    load,
    render,
    loadOverall,
    setTab,
    qualifies,
    setVisible,
    showForm,
    hideForm,
    rosterHTML: (rescued) => rosterHTML(cnp, rescued),
    get overall() {
      return overallData;
    },
    get records() {
      return cache;
    },
    get pending() {
      return outbox.length;
    },
    flush: () => flushOutbox(),
  };
}
