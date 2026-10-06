# 咲耶ゲームフレームワーク（SAKUYA GAME FRAMEWORK）

咲耶シリーズのブラウザゲームを作るための共通フレームワークです。共通の部品を1か所にまとめています。
リポジトリ名・読み込みの URL・コードでの呼び名は `sakuya-kit`（`createKit` / `kit`）のままです（4作が `sakuya-kit@<版>` で読み込んでいるので変えない）。
各タイトルは **1プレイの中身（`update` / `render`）だけ** を書き、次の部品は kit が受け持ちます。

| 部品 | 内容 |
|---|---|
| コントローラー | キーボード、左半分のバーチャルスティック（アナログ／4方向／上でボタン）、画面右半分の長押し、ジャイロ（任意）、右下のボタン群、長押しトグル、自動連射（V）、音（M） |
| お決まりの仕組み | スコア（1UP・ハイスコア保存）、残機、チェックポイント、CNP の回収管理、HUD（スコア・ロスター・残機・ゲージ） |
| ポーズ | canvas 中央のボタン、P / Esc キー、タブ切替や通知の割り込み時の入力リセット |
| スコア登録 | TOP10 入り判定、ニックネームと X ID（実在確認つき）の入力フォーム |
| ランキング | Google スプレッドシート + GAS（全タイトルで1本の GAS を共有）。タイトル別と**総合ランキング**の切り替えタブ付き |
| CNP | 11体の ID・名前・色・画像の正典、ランキングに出す救出ロスター |
| 結果の演出 | CLEAR / GAME OVER の演出動画（解錠、フォールバック、スキップ、ミュート連動）と、共通の見た目の結果画面 |
| タイトル・OGP | タイトル名・OGP画像・アイコン・manifest.json を、全タイトル同じ手順で差し替えるツール（`tools/ogp.html`）。中身はタイトルごとに自由 |
| その他 | スタートボタン、縦持ち案内、全画面／ホーム画面追加の案内、効果音とミュート、シェア、60Hz 固定ループ、レトロ UI |

ビルドは不要です（素の ES Modules）。

## 使い方

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/naonao1971/sakuya-kit@0.6.3/kit.css">

<div class="sk-wrap">
  <canvas id="game" width="960" height="540"></canvas>
</div>

<script type="module">
  import { createKit } from "https://cdn.jsdelivr.net/gh/naonao1971/sakuya-kit@0.6.3/kit.js";

  const kit = createKit({
    gameId: "scramble",                 // ランキングのシート名になる（英数字・-・_）
    title: "SAKUYA SCRAMBLE",
    subtitle: "- RESCUE 11 CNP -",
    gasUrl: "https://script.google.com/macros/s/.../exec",
    cnp: true,
    controls: {
      stick: true,
      gyro: true,
      buttons: [
        { id: "fire", label: "X", keys: ["KeyX"], primary: true,
          onPress: () => {...}, onRelease: () => {...} },
        { id: "bomb", label: "💣", keys: ["KeyZ"], onPress: () => {...} },
      ],
      toggles: [
        { id: "autofire", name: "自動連射", label: "🔫", value: true, onChange: (on) => {...} },
      ],
    },
    share: { when: "clear", text: (r) => `スコア ${r.score}` },
    cutscenes: {
      clear: { src: "clear.mp4", image: "clear.png" }, // 流し終えたら静止画に戻る
      gameOver: { src: "gameover.mp4" },               // タップ・キーで飛ばせる
    },

    onStart() { /* 1プレイ分の状態を初期化 */ },
    update(kit) { /* 60Hz 固定で呼ばれる。プレイ中かつ非ポーズ時のみ */ },
    render(ctx, kit) { /* 毎フレーム呼ばれる。kit.phase で画面を描き分ける */ },
  });

  // プレイの終わりにゲームから呼ぶ
  kit.gameOver({ score: 12345, cleared: true, rescued: [1, 4, 11] });
</script>
```

動く最小例は [`demo/index.html`](demo/index.html) です。

### kit を使っているタイトル

kit の新しい版を出したら、次の全部に「版を上げる PR」を出す（`kit.js` と `kit.css` の版番号を同じにそろえる）。

| タイトル | リポジトリ | 公開先 |
|---|---|---|
| 咲耶スクランブル | naonao1971/SakuyaScramble | https://sakuya.naoblock.jp/ |
| 咲耶Nounラリー | naonao1971/SakuyaRallyCnp | https://rally.naoblock.jp/ |
| 咲耶ジャンプバグ | naonao1971/SakuyaJumpBug | https://jumpbug.naoblock.jp/ |
| 咲耶ディグ | naonao1971/SakuyaDig | https://dig.naoblock.jp/ |
| 咲耶インベーダー | naonao1971/SakuyaInvaders | https://invaders.naoblock.jp/ |

新しいタイトルを公開したら、この表に1行足す。

### バージョンは必ず固定する

`@0.6.3` のようにタグを指定して読み込みます。kit を更新しても、古いタイトルは指定したバージョンのまま動き続けます。
更新を取り込むときは、タイトル側の URL の番号を上げ、実機で確認してから公開します。

## 設定 (`createKit(cfg)`)

| キー | 既定値 | 説明 |
|---|---|---|
| `gameId` | 必須 | ランキングのシート名。GAS の `SHEET_ALIASES` で既存シートに読み替えられる |
| `title` / `subtitle` | | 縦持ち案内に出す |
| `canvas` | `#game` | |
| `gasUrl` | `""` | 空ならランキングは「まだ記録がありません」のまま |
| `overall` | `true` | ランキングに「このゲーム / 総合」のタブを出す |
| `cnp` | `false` | `true` で `kit.cnp` を使えるようにし、ランキングに救出ロスターを出す。権利表記のフッターも出る |
| `lives` | なし | `{ start: 3, extendEvery: 20000 }`（`true` なら3機・1UPなし） |
| `hiScoreKey` | `sakuya-kit:hi:<gameId>` | 旧版のハイスコアを引き継ぐときに、旧版の localStorage のキーを指定 |
| `maxScore` | なし | これを超える記録は登録フォームを出さない（GAS の `_games` のスコア上限と同じ値にする） |
| `rankingLabels` | `{ clear: "クリア", progress: "進行" }` | ランキングの2段目の言葉（ラリーなら `progress: "踏破"`） |
| `controls.stick` | `true` | 左半分のバーチャルスティック |
| `controls.stickArea` | `"left"` | スティックを出せる範囲。`"canvas"` にすると canvas の上ならどこでも（迷路系向け） |
| `controls.stickDigital4` | `false` | スティックを4方向に丸める（迷路系向け） |
| `controls.stickSensitivity` | `0.5` | いっぱいに倒したときの強さ（キー入力 = 1） |
| `controls.gyro` | `false` | 傾き操作。下の「ジャイロ操作」を参照 |
| `controls.keys` | 矢印 / WASD | `{ up: [...], down: [...], left: [...], right: [...] }` |
| `controls.stickUpButton` | なし | スティックを上に倒したときに押すボタンの id（ジャンプ等） |
| `controls.rightHalfButton` | なし | 画面の右半分を押している間押すボタンの id |
| `controls.autoFire` | なし | 下の「自動連射」を参照 |
| `controls.muteKey` | `"KeyM"` | 音の切り替えキー |
| `controls.buttons` | `[]` | `{ id, label, ariaLabel, keys, primary, onPress, onRelease }`。右端から並ぶ |
| `controls.toggles` | `[]` | 長押しトグル `{ id, name, label, labelOff, value, onChange }` |
| `controls.mute` / `controls.fullscreen` | `true` | 🔊 と ⛶ のトグル |
| `share` | なし | `{ when: "clear" \| "always", text(result), image?(result) → canvas, fileName?, url? }` |
| `orientation` | なし | `{ image }` 縦持ち案内にキービジュアルを出す（タイトルと「横向きにしてね」の間）|
| `startAnchor` | 下端中央 | スタートボタンを置く canvas 座標 `{ x, y }` |
| `help` | | `{ pc, mobile, playing }` の案内文 |
| `footer` | 非公式ファンアート表記 | `false` で出さない |
| `controls.layout` | `"classic"` | `"ab"` で A・B の2ボタンと ⚙ 設定の配置にする。下の「A・B ボタンと ⚙ 設定」を参照 |
| `offline` | `false` | `true` で機内モードでも遊べるようにする（タイトルに `sw.js` を置く）。下の「オフライン対応」を参照 |
| `cutscenes.clear` / `cutscenes.gameOver` | なし | `{ src, image?, skippable?, blockResults?, loop? }`。下の「結果の演出」を参照 |
| `resultScreen` | 標準の結果画面 | `{ clearTitle, gameOverTitle, mediaWidth, decorate(ctx, info) }`。`false` にすると kit は描かない |
| `jingle` | `true` | 動画が無い、または再生できないときに `sfx.clear()` / `sfx.gameOver()` を鳴らす |
| `updateWhenOver` | `false` | `true` にすると、結果画面の間も `update` を呼び続ける（爆発の余韻などを動かすとき） |
| `resultsBlocked()` | | `true` を返す間は結果画面（ランキング・スタート）を出さない。演出動画の再生中などに使う |

### フック

`onStart`、`onGameOver(result)`、`onPause(paused)`、`onMute(muted)`、`onInputReset`、
`onStartGesture`（スタートのタップの中で同期的に呼ばれる。動画の解錠などに使う）、
`onKeyDown(e)`（`false` を返すと kit のキー処理を止める）

`kit.on("start", fn)` の形でも登録できます。

## `kit` オブジェクト

| | |
|---|---|
| `kit.phase` | `"title"` / `"playing"` / `"over"` |
| `kit.paused` / `kit.frame` / `kit.result` | |
| `kit.input.axis()` | キー、スティック、ジャイロを合成した `{ x, y }`（各 -1..1） |
| `kit.input.up` など / `stickX` / `gyroX` / `buttons[id]` | 生の入力値 |
| `kit.sfx` | `tone()`、`noise()`、定番音 `shot` `hit` `pickup` `bonus` `explode` `stage` `gameOver` `clear` |
| `kit.retro` | `colors`、`font(px)`、`blinkOn()`、`panel()`、`frame()`、`titleText()`、`caption()`、`crt()` |
| `kit.cnp` | `chars`（`id` `label` `hue` `no` `img` `ready`）、`draw(ctx, ch, x, y, size)`、`byNo(no)` |
| `kit.buttonEl(id)` | 画面のボタン要素（溜め表示などで見た目を変えるとき） |
| `kit.status(msg)` | canvas の下の案内文 |
| `kit.gameOver(result)` / `kit.setPaused(bool)` / `kit.start()` | |
| `kit.gyro` | ジャイロ無効なら `null`。`active`、`recalibrate()`、`toggle()` |
| `kit.ranking` | `load()`、`loadOverall(force)`、`setTab("game" \| "overall")`、`records`、`overall` |
| `kit.cutscene` | `playing`、`kind`（`"clear"` / `"gameOver"` / `null`）、`skip()`、`videos` |

## 自動連射

```js
controls: {
  autoFire: { onFire: (kit) => fireVulcan(), interval: 10 },          // 🔫 の長押しトグル（スクランブル方式）
  // autoFire: { onFire, button: "fire" },  // fire ボタンを短くタップで切り替え、押し続けたら通常の押下（ジャンプバグ方式）
}
```

- `defaultOn`: `"touch"`（既定。タッチ端末だけ最初からオン）/ `true` / `false`
- `key`: 切り替えキー（既定 `"KeyV"`）。`tapMs`: ボタン方式でタップとみなす長さ（既定 250ms）
- オンの間、プレイ中は `interval` フレームごとに `onFire(kit)` が呼ばれる（ポーズ中・縦持ち中は止まる）
- ボタン方式では、オンの間そのボタンをマゼンタで縁取る
- `kit.autoFire.on` / `set(bool)` / `toggle()`

## お決まりの仕組み（使う分だけ）

| | 使い方 |
|---|---|
| スコア | `kit.score.add(100)`、`kit.score.value`、`kit.score.hi`。`lives.extendEvery` ごとに残機+1（`onExtend` フック） |
| 残機 | `kit.lives.lose()`（残りを返す）、`gain()`、`value` |
| チェックポイント | `kit.checkpoint.set({ x, y }, index)`、`kit.checkpoint.value` |
| CNP の回収 | `kit.cnp.run.collect(ch.no)`（初めてなら true）、`has(no)`、`count`、`list()`、`pick(weight?)`（未回収ほど出やすい） |
| HUD | `kit.hud.score()`（左上）、`kit.hud.roster()`（上段中央）、`kit.hud.lives()`（右上）、`kit.hud.gauge({ label: "FUEL", ratio })` |

- どれもスタートのたびに kit が初期化します
- `kit.gameOver({ cleared, progress })` だけ呼べば、スコアは `kit.score.value`、救出キャラは `kit.cnp.run.list()` が使われ、ハイスコアも保存されます（明示して渡すこともできます）
- ランキングには、クリア・進行度（0〜100）・CNP の体数も記録され、2段目に表示されます

## ジャイロ操作（使うタイトルだけ）

既定では使いません。使うタイトルは `controls.gyro` を指定します。

| 指定 | 動き |
|---|---|
| `gyro: true` | スタート時に自動で傾き操作に切り替える（咲耶スクランブル方式）。🕹️ を長押しするとスティックに戻る |
| `gyro: { autoStart: false }` | 最初はスティック。📱 を長押しした人だけ傾き操作に切り替わる |
| `gyro: { sensitivity: 0.55, deadzoneDeg: 4, maxDeg: 28 }` | 効き具合の調整（全開時の強さ、無視する傾き、最大入力になる傾き） |

- 傾きは `kit.input.axis()` に合成されるので、ゲーム側の移動処理は変わりません。生の値は `kit.input.gyroX` / `gyroY` です
- 基準（水平）は、傾き操作を始めたときの持ち方です。端末を回転させると取り直します
- 傾き操作中はスティックを無効にします（両方が足し合わさると、左側に触れただけで流れるため）
- iOS の許可ダイアログはスタートのタップ、またはトグルの長押しから出します
- 許可されても傾きデータが届かない端末では、1.5 秒後に自動でスティックへ戻します
- タッチ端末でない場合（PC）は何も起きません

## 結果の演出（CLEAR / GAME OVER）

`kit.gameOver({ cleared })` を呼ぶと、kit が次の順で処理します。

1. `cutscenes` に動画があり、途切れずに流せる状態なら、動画を再生する（音は動画のものを使う）
2. 動画が無い、読み込みが間に合わない、再生できない場合は、ジングル（`sfx.clear` / `sfx.gameOver`）を鳴らす
3. 結果画面を共通の見た目で描く

| | GAME OVER（既定） | CLEAR（既定） |
|---|---|---|
| 飛ばせるか (`skippable`) | タップ・キーで飛ばせる | 飛ばせない |
| 再生中の結果画面 (`blockResults`) | 隠す（流し終えるか飛ばしてから出す） | 出す（ランキング入力と並行） |
| 画面 | 動画だけ → 終わったら「GAME OVER / PUSH START」 | 上に動画 → 終わったら `image` の静止画、下に「CLEAR / SCORE」 |

- 動画は `preload="none"` で、スタートのタップのときに解錠と読み込みを始めます（iOS 対策）
- 🔊 のトグルは、再生中の動画の音にもすぐ反映されます
- 再スタートすると動画は止まり、先頭に戻ります
- 救出ロスターなど、タイトル独自の飾りは `resultScreen.decorate(ctx, { kind, rect, result, playing, kit })` で描き足します。`rect` は動画または静止画を描いた枠です
- 再生中かどうかは `kit.cutscene.playing` / `kit.cutscene.kind` で分かります（パイロット窓を隠すときなど）

## A・B ボタンと ⚙ 設定（シリーズ共通のボタン配置）

`controls.layout: "ab"` にすると、スティックと一緒に使うボタンを **A・B の2つと ⚙（設定）** にそろえます（フィーチャーリスト F3）。

```js
controls: {
  layout: "ab",
  buttons: [
    { id: "jump", slot: "A", hint: "JUMP", keys: ["KeyZ"], onPress: () => {} },
    { id: "fire", slot: "B", hint: "SHOT", keys: ["KeyX"] },
  ],
  autoFire: { defaultOn: "touch", showOn: "fire" },   // 自動連射の切り替えは ⚙ の中
  toggles: [{ id: "hard", name: "むずかしさ", onText: "HARD", offText: "NORMAL", value: false, onChange: (v) => {} }],
}
```

- 右端に A、その左上に B、さらに左に ⚙。ボタンには大きな A / B と、`hint` の小さな文字（役割）を出す。A・B は3つ目以降を出さない
- B を使わないタイトルでも B の場所は空けておくので、⚙ はどのタイトルでも同じ位置に出る
- ⚙ を押すとゲームを止めて設定のモーダルを開き、閉じると再開する。PC とタイトル・結果画面でも ⚙ だけは出る（Esc で閉じる）
- 設定に並ぶもの: 自動連射（`autoFire` があるとき）、効果音・BGM、全画面表示（スマホ）、移動の操作（傾き／スティック。`gyro` があるとき）、`toggles` に書いたタイトル固有の設定。
  長押しトグル（🔊 ⛶ 🔫 🕹️）はパッドに出さない
- 自動連射は、この端末に保存する（`sakuya-kit:autofire:<gameId>`）。`autoFire.showOn` のボタンを、オンの間マゼンタで縁取る
- キー（P・M・V）は今までどおり
- コードからは `kit.settings.open()` / `close()` / `isOpen`

## オフライン対応（機内モードでも遊べる）

一度オンラインで開いた端末なら、2回目からは機内モードでも起動して遊べます（フィーチャーリスト F1）。

1. index.html と同じ場所に、次の1行だけの `sw.js` を置く（kit の版を上げても書き換えなくてよい）
   ```js
   importScripts(`https://cdn.jsdelivr.net/gh/naonao1971/sakuya-kit@${new URL(location).searchParams.get("kit")}/sw-core.js`);
   ```
2. `createKit({ offline: true })` にする

- kit が `sw.js?kit=<版>` を Service Worker として登録し、初回に読んだファイル（index.html・画像・kit・CNP の画像・書体）を端末に保存します
- オンラインのときは常に通信を先に試すので、更新はそのまま届きます。機内モードや通信が遅いとき（4秒）は保存分で動きます
- 保存しないもの: ランキング（GAS）・X のアイコン・演出動画。機内モードでは動画は流れず、ジングルと結果画面になります。
  ランキング欄は「オフラインのため、ランキングは表示できません」、登録は「つながってから、もう一度押してください」と出ます
- 一度も開いていない端末では、機内モードで起動できません。iOS の Safari では、しばらく開かないと保存分が消されることがあります（ホーム画面に追加していれば消されにくい）
- jsDelivr の `sakuya-kit@<版>` から読んだときだけ動きます（手元の kit から読む demo では何もしません）
- 状態は `kit.offline`（`enabled` / `registered` / `cached` / `version`）で分かります

## タイトル名・OGP画像・アイコンの差し替え

タイトル名や絵柄はタイトルごとに違ってかまいません。全タイトルでそろえるのは**差し替えの手順と、ファイル名・サイズ・書き方**です。

OGP は X や LINE のクローラが `<head>` を直接読んで作ります。JavaScript は実行されないので、kit.js からは差し込めません。
そのため、`tools/ogp.html`（ブラウザで開くだけで使えます）でファイルを作って置く方式にしています。

### 差し替えの手順（どのタイトルも同じ）

1. `tools/ogp.html` を開き、主題、副題、日本語名、説明文、URL を入力して、キービジュアルを選ぶ
2. 「画像をまとめて保存」と「manifest.json を保存」を押し、できたファイルをリポジトリの直下に上書きで置く
3. 「`<head>` の中身」をコピーし、index.html の `<head>` の中身と丸ごと入れ替える
4. 「`createKit` の設定」の `title` / `subtitle` を、index.html の `createKit` に反映する
5. 公開後、X などのカード確認ツールで表示を確かめる（反映に時間がかかることがあります）

### そろえるもの

| 項目 | 決まり |
|---|---|
| ファイル名 | `ogp.png`、`apple-touch-icon.png`、`icon-192.png`、`icon-512.png`、`favicon-32.png`、`manifest.json`（すべてリポジトリ直下） |
| サイズ | OGP 1200x630、アイコン 180 / 192 / 512 / 32 |
| タイトル表記 | `<title>` と `og:title` は「主題 ─ 副題」（例：`SAKUYA SCRAMBLE ─ RESCUE 11 CNP`）。副題の前後の `- -` は外す |
| `<head>` | ツールが書き出す並びのまま（手で書き足さない） |

- **OGP 画像の仕上げ：** 既定は「絵をそのまま使う」（キービジュアルを 1200x630 に切り抜くだけ）です。タイトル文字や金の枠を重ねたいときだけ「タイトル文字と金の枠を重ねる」を選びます
- **アイコン：** 黒地に金の枠と中央のモチーフ。モチーフは、キービジュアルの一部か文字・絵文字をタイトルごとに選びます
- `createKit` の title/subtitle と `<title>` がずれていると、kit が開発者コンソールに警告を出します

## 画面の大きさ

canvas の大きさ（`width` / `height` 属性）はタイトルごとに自由です（スクランブル 960×540、ラリー 826×384 など）。
表示の大きさは kit.css が縦横比を保ったまま決めます。

- PC・スマホ縦持ち: 幅は画面の 92%（最大 960px）、高さは画面の 72% まで
- スマホ横持ち: 画面の高さいっぱいまで
- 立ち絵やレーダーのようなサイドパネルが要るときは、canvas を横に広げて canvas の中に描きます（ラリー方式）

## 色を変えたいとき

部品の寸法、配置、ベベルは変えません。変えてよいのは色トークンだけで、kit.css の後に書きます。

```html
<style>:root { --magenta: #3BD1FF; }</style>
```

canvas 側の `kit.retro.colors` も同じトークンを読むので、CSS と JS の両方を直す必要はありません。

## オフラインのスコアを後で送る

オフライン（機内モードなど）で登録した記録は、端末に「送信待ち」としてため、つながったときと次にゲームを開いたときに自動で送ります（フィーチャーリスト F2）。設定は要りません。

- 最後に取れた TOP10 を端末に残し、オフラインではそれをランキング欄に出し（「オフライン中 ― 最後に取得したランキングです」）、TOP10 入りの判定にも使う。送るときに圏外になっていても、そのまま記録する
- オフラインで入れた X ID は、送る直前に実在を確かめ、見つからなければ X ID を外して登録する
- 記録ごとに番号（記録ID）を付けて送り、GAS は同じ番号の記録を二度入れない（送信中に通信が切れて送り直しても重ならない）
- 送信待ちがある間は、ランキング欄に「送信待ち N件」と出る。`kit.ranking.pending`（件数）・`kit.ranking.flush()`（今すぐ送る）
- iOS には閉じたページの裏で送る仕組みが無いので、オンラインで一度ゲームを開いたときに送る

## ランキング（GAS）と総合ランキング

[`gas/apps-script.gs`](gas/apps-script.gs) を1つのスプレッドシートにデプロイし、全タイトルでその URL を共有します。
スコアはタイトルごとのシートに入り、タイトルの一覧はスプレッドシートの `_games` シートで管理します。

| `_games` の列 | 内容 |
|---|---|
| スコア上限 | これを超える記録（と負の値）は GAS が断る。空欄なら上限なし |
| gameId | `createKit({ gameId })` と同じ値 |
| タイトル | 総合ランキングに出す名前 |
| シート名 | スコアを入れるシート（咲耶スクランブルは既存の `ranking`） |
| 総合に含める | `TRUE` のタイトルだけが総合ランキングの対象 |

- スコアのシートは、列の**位置ではなく1行目の見出し**で読み書きします。ラリーとジャンプバグの旧版のシートは、共通のスプレッドシートにそのままコピーすれば読めます（「踏破率」は「進行度」として扱う）
- 初めてスコアが届いたタイトルは、`_games` に自動で行が足されます（総合には `FALSE` の状態で入る）。公開するタイトルは手で `TRUE` にしてください。デモやテスト用は `FALSE` のままにします
- `_games` の編集に再デプロイは要りません（総合ランキングは最大1分キャッシュされます）

### 旧版のスプレッドシートからの取り込み

Apps Script の画面で、次のような関数を足して1回実行します（同じ記録は二重に入りません）。

```js
function importLegacy() {
  importLegacySheet_("rally", "<ラリーの旧スプレッドシートのID>", "ranking");
  importLegacySheet_("jumpbug", "<ジャンプバグの旧スプレッドシートのID>", "ranking");
}
```

### 総合ランキングの計算

1. タイトルごとに、各プレイヤーの自己ベストを出す
2. **自己ベスト ÷ そのタイトルの1位 × 1000** を、そのタイトルのポイントにする（どのタイトルも満点は 1000）
3. 全タイトルのポイントの合計で順位を付ける（同点なら遊んだタイトル数が多い方が上）

- 同じ人の判定は、X ID があれば X ID（大文字と小文字は区別しない）、無ければニックネームで行います
- 救出した CNP は、全タイトル・全プレイの分を合算して表示します
- 登録したニックネームと X ID は、次回の登録フォームに自動で入ります（同じ端末・同じドメインの中だけ）

### ゲームの無いページに総合ランキングだけ出す

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/naonao1971/sakuya-kit@0.6.3/kit.css">
<section id="board"></section>
<script type="module">
  import { mountOverallRanking } from "https://cdn.jsdelivr.net/gh/naonao1971/sakuya-kit@0.6.3/kit.js";
  mountOverallRanking(document.getElementById("board"), { gasUrl: "https://script.google.com/macros/s/.../exec", limit: 50 });
</script>
```

## ディレクトリ

```
kit.js / kit.css   入口
sw-core.js         オフライン対応の Service Worker 本体（タイトルの sw.js から読む）
src/               部品ごとのモジュール
assets/cnp/        CNP 画像（256x256・透過 PNG）
gas/               共通ランキング用 Apps Script
demo/              最小の動作例（テンプレートの元）
tools/ogp.html     タイトル表記・OGP画像・アイコン・<head>・manifest.json を作るツール
docs/FEATURES.md   共通仕様のフィーチャーリスト（F1, F2, …。提案・進み具合）
docs/GAME-GUIDE.md 新作づくりガイド（Claude・Codex などに読ませる1枚もの。人向けの使い方つき）
docs/INVENTORY.md  3作の共通部品の棚卸し（何を kit に入れ、何をタイトル側に残したか）
.claude/skills/sakuyagamesskill/
                   新作づくりの skill（元ネタのレトロゲームと要件 → 質問で企画 → プロト → 公開 → わいわいタウン掲載）。
                   このリポジトリを開いたセッションで自動で読まれる。references/（質問票・元ネタ表・kit のルール・公開手順）、
                   assets/starter/（新作の index.html の土台）、scripts/（自動プレイテスト、OGP・アイコンの書き出し）
```
