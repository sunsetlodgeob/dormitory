# 男魂くんの1年 ― ミニゲームの作り方（エンジンの説明）

ミニゲームを 1 本作る人向けのメモ。決まりごとの全体は [ARCH.md](ARCH.md) の「4. ゲーム」を先に読むこと。

- 自分のファイルは `js/otoko/games/<id>.js` の 1 つだけ。エンジン（`js/otoko/engine.js`・`audio.js`・`chars.js`・`main.js`）や `game/index.html` は書きかえない。足りないものがあれば、エンジン担当に頼む。
- いま置いてある 10 本は【仮】のゲーム（A を 10 回押すとクリア）。ファイルをまるごと書きかえてよい。`id`・`order`・`month`・`event` は ARCH.md の表のとおりにしておく。

## 1. いちばん小さい例

```js
/*
 * 6月「財布がない」 ― 店員の目を盗んで店を出ろ
 */
(function () {
  'use strict';
  OTK.register({
    id: 'gyudon',              // ファイル名と同じ
    order: 3,                  // 1年の中の順番（ARCH.md の表）
    month: 6, event: '',       // 行事がなければ ''
    title: '財布がない',        // 練習モードの一覧と、画面上の帯に出る（10 文字くらいまで）
    goal: '見られずに外へ！',    // 説明画面に大きく出す一言（1 行 7 文字くらい。長いと 2 行か小さい字になる）
    howto: ['←→：歩く', 'A：しゃがむ'], // 操作の説明（1〜3 行）
    note: '',                  // 任意：説明画面の下に小さく出す注記
    time: 30,                  // 制限時間（秒）。なければ null
    timeout: 'lose',           // 時間切れのとき 'win'（逃げきり型）か 'lose'
    create(api) {              // 1 回遊ぶごとに呼ばれる。状態はこの中の変数に持つ
      const P = api.P;
      const me = { x: 40, y: 150, w: 16, h: 24, dir: 'right', walk: 0 };
      let look = false;        // 店員がこっちを見ているか
      let lookT = 2;

      return {
        update(dt) {
          // 店員がときどき振り返る
          lookT -= dt;
          if (lookT <= 0) { look = !look; lookT = look ? api.rnd(0.8, 1.4) : api.rnd(1.2, 2.5); if (look) api.sfx('alarm'); }
          // 歩く
          const dx = api.input.dir().x;
          if (dx) { me.x += dx * 50 * dt; me.dir = dx > 0 ? 'right' : 'left'; me.walk += dt; }
          if (look && dx && !api.input.held('a')) api.lose('店員に見つかった。皿洗い3日の刑。');
          if (me.x > 220) api.win('ごちそうさまでした（払ってない）。');
        },
        draw(g) {
          g.clear(P.dbrown);
          g.R(0, 174, api.W, 50, P.xdgray);
          g.sprite(api.person('tenin', { dir: look ? 'left' : 'up', variant: 0 }), 200, 120);
          const crouch = api.input.held('a');
          g.sprite(api.person('otoko', { dir: me.dir, frame: Math.floor(me.walk * 8) % 2 }), me.x, me.y + (crouch ? 6 : 0));
          if (look) g.text('！', 204, 100, { col: P.yellow, outline: P.black });
        },
      };
    },
  });
})();
```

- `create(api)` は遊ぶたびに呼ばれる（やりなおしのたびに新しい状態になる）。
- 終わらせるには `api.win('ひとこと')` か `api.lose('ひとこと')`。ひとことは結果の画面に出る（3 行まで。1 行 13 文字くらい。`\n` で好きな所で改行できる）。
- `update(dt)` は 1 秒に 60 回、`dt` はいつも 1/60 秒。`draw(g)` は画面の書きかえごとに 1 回。
- `draw` は `update` より先に呼ばれることがある（3・2・1 のカウントダウン中に、最初の画面を見せるため）。最初の状態のまま描けるようにしておく。

## 2. 決まりごと

- 画面は **256×224 ドット**。左上が (0, 0)。**上の 12 ドット（y < 12）は空けておく**（月・題名・残り時間の帯をエンジンが上に重ねる）。
- 操作は十字キー・A・B（とタップ）だけ。ポーズ（Esc・P・START）はエンジンが受けもつ。
- 1 本 **30〜60 秒**くらい。何度か遊べばクリアできる難しさ。`api.tries`（しっぱいして、やりなおした回数）で少し易しくしてもよい。
- 人物は `api.person()` の絵を使う（男魂くん以外は「先輩A」「同期B」「一年C」のように呼ぶ。名前は出さない）。
- 色は `api.P`（ファミコン風の色見本）から選ぶと、ほかと雰囲気がそろう。
- 全裸の場面は `api.person('otoko', { naked: true })`。札とモザイクで隠してある。自分で描くときも、はっきりした裸は描かない。
- 音は `api.sfx('名前')`。BGM はエンジンが鳴らす（`bgm` で選べる）。音のオン・オフ、最初の操作まで鳴らさない、はエンジンがやる。
- `Math.random()` ではなく `api.rnd()` などを使う（テストで乱数を固定できる）。
- `create`・`update`・`draw`・`after`・`timeup` でエラーが出ると、そのミニゲームは「おまけでクリア」になって先へ進む（コンソールにエラーが出るので、テストで分かる）。

## 3. register に書くもの

| 名前 | 内容 |
| --- | --- |
| `id` `order` `month` `event` | ARCH.md の表のとおり |
| `title` | 題名（練習モードの一覧と、画面上の帯に出る） |
| `goal` | 説明画面に大きく出す一言。1 行 7 文字くらい。長いときはエンジンが区切りのよい所で 2 行に分ける（`\n` で分ける所を決めてもよい）。入りきらなければ小さい字になる |
| `howto` | 操作の説明。文字列の配列（1〜3 行） |
| `note` | 任意。小さい注記（`nomu` の「お酒は二十歳になってから。一気飲みはやめましょう。」など）。2 行まで。`howto` と `note` が説明画面に入りきらないときは、コンソールに注意（console.warn）が出る |
| `time` | 制限時間（秒）。`null` なら時間制限なし（自分で `win`・`lose` する） |
| `timeout` | 時間切れのとき `'win'` か `'lose'` |
| `timeoutMsg` | 任意。時間切れのときのひとこと |
| `bgm` | 任意。`'play'`（はずむ・いつもの）、`'tense'`（あせる）、`'menu'`（静か）、`null`（鳴らさない） |
| `create(api)` | `{ update(dt), draw(g), timeup() }` を返す。`timeup` は任意 |

`timeup()` を書いておくと、時間切れのときに先に呼ばれる。その中で `api.win()`・`api.lose()` すれば、時間切れの結果を自分で決められる（「時間内に何人集めたか」で決まるゲームなど）。何もしなければ `timeout` のとおりになる。

## 4. api（create に渡されるもの）

### 入力 `api.input`

| 書き方 | 内容 |
| --- | --- |
| `held(k)` | 押している間 true |
| `pressed(k)` | 押した瞬間だけ true（1 回の `update` で 1 回） |
| `released(k)` | 離した瞬間だけ true |
| `repeat(k)` | 押した瞬間と、押しっぱなしのとき少し待ってから一定間隔で true（カーソル向き） |
| `dir()` | 十字キーの向き `{ x: -1|0|1, y: -1|0|1 }` |
| `any()` | A・B のどちらかを押したか、画面をタップした瞬間 |
| `tap` | その瞬間に画面をタップ（クリック）した位置 `{ x, y }`、なければ `null` |
| `pointer` | 指（マウス）の今の位置と、押しているか `{ x, y, down }`。ほかの入力と同じく、遊んでいる間だけ `down` が true になる |

`k` は `'up'` `'down'` `'left'` `'right'` `'a'` `'b'`。キーボードは矢印、A は Z・A・スペース・Enter、B は X・B・Shift・Backspace。スマホは画面の下のボタン。
`win`・`lose` のあとは、入力はすべて「押していない」になる。

### 終わり方・時間

| 書き方 | 内容 |
| --- | --- |
| `win(msg, { wait })` | クリア。`wait` 秒（ふつう 0.5）待ってから「クリア！」が出る。その間も `update` は呼ばれる |
| `lose(msg, { wait })` | しっぱい。同上 |
| `ended` | まだなら `null`、終わったら `'win'` か `'lose'` |
| `time` | 始まってからの秒数 |
| `remaining` | 残りの秒数（`time` がないゲームは `null`） |
| `after(sec, fn)` | sec 秒後に fn を呼ぶ |
| `practice` | 練習モード・テストのとき true |
| `tries` | しっぱいして、やりなおした回数（0 から） |

`win`・`lose` は最初の 1 回だけ有効。結果が出るまでの間も `update`・`draw` は続くので、逃げていく動きなどを見せてよい。

### 乱数（種を決めると毎回同じになる）

`rnd()` 0〜1、`rnd(n)` 0〜n、`rnd(a, b)` a〜b（小数）／ `irnd(a, b)` a〜b の整数（両端を含む）／ `pick(配列)` ／ `chance(p)` 確率 p で true ／ `shuffle(配列)` 並べかえた新しい配列

### 便利なもの

| 書き方 | 内容 |
| --- | --- |
| `sfx(name)` | 効果音（下の一覧） |
| `bgm(name)` | BGM を切りかえる（`'play'` `'tense'` `'menu'` `'title'`、`null` で止める） |
| `shake(強さ, 秒)` | 画面をゆらす（ふつう `shake(3, 0.3)`） |
| `flash(色, 秒)` | 画面を一瞬その色にする（ふつう `flash(P.white, 0.12)`） |
| `hit(a, b)` | `{x, y, w, h}` どうしが重なっているか |
| `dist(x1, y1, x2, y2)` `clamp(v, lo, hi)` `lerp(a, b, t)` `approach(v, 目標, 1回の量)` | 計算の小物 |
| `person(kind, opts)` | 人物の絵（16×24 の canvas）。下の「人物」 |
| `portrait(kind, opts)` | 顔のアップ（32×32 の canvas） |
| `W` `H` `TOP` `P` `def` | 画面の幅 256・高さ 224・上の帯 12・色見本・register に書いた中身 |

### 効果音の名前

`ok` `ng` `select` `cursor` `cancel` `hit` `punch` `jump` `coin` `throw` `splat` `step` `alarm` `fanfare` `buzzer` `drink` `vomit` `siren` `damage` `power` `count` `go` `tick` `stamp` `pause` `text`

## 5. 描く道具 `g`（draw に渡されるもの）

| 書き方 | 内容 |
| --- | --- |
| `g.ctx` | canvas の 2D コンテキスト（そのまま使ってもよい。`save`・`restore` で戻すこと） |
| `g.P` | 色見本（`api.P` と同じ） |
| `g.clear(色)` | 画面をぬりつぶす |
| `g.R(x, y, w, h, 色)` | 四角をぬる（座標は整数に丸める） |
| `g.text(文字, x, y, { col, size, align, shadow, outline, lh })` | 文字。ドットがにじまないように描く。`size` は **16（ふつう）・12（小さい）・32（大きい）** がきれい。`align` は `'left'` `'center'` `'right'`。`shadow`・`outline` は `true`（黒）か色。`\n` で改行。戻り値は幅 |
| `g.big(文字, x, y, { col, size, align })` | 太いふちどりの大きい文字（見出し用、32） |
| `g.measure(文字, size)` | 文字の幅 |
| `g.wrap(文字, 幅, size)` | 幅で折り返した行の配列 |
| `g.num(数, x, y, { col, scale, align, shadow })` | 3×5 ドットの小さい数字（`scale` で拡大）。`0-9 : . - + / x %` |
| `g.box(x, y, w, h, { fill })` | ファミコン風のウインドウ（青い地に白い二重線） |
| `g.say(文字, { name, y, size })` | 画面の下にセリフのウインドウ。`name` で話し手の名札（例：`'先輩A'`） |
| `g.sprite(絵, x, y, { flip, flipY, scale, alpha })` | 絵を置く。`flip` で左右反転、`scale` は整数倍 |
| `g.disc(cx, cy, r, 色)` `g.ring(...)` `g.oval(cx, cy, rx, ry, 色)` | ドットの円・輪・だ円 |
| `g.line(x0, y0, x1, y1, 色)` `g.frame(x, y, w, h, 色)` | 線・四角のわく |
| `g.dither(x, y, w, h, 色, 0か1)` | 市松もよう（半透明のかわり） |
| `g.shadow(cx, cy, rx)` | 足元の影 |
| `g.bar(x, y, w, h, 割合, 色, 地の色)` | 横長のゲージ（割合は 0〜1） |
| `g.blink(回/秒)` | 点滅用。true と false が交互に返る |

色見本 `P` の名前：`black` `ink` `white` `lgray` `gray` `dgray` `xdgray` `red` `dred` `xdred` `rose` `pink` `lpink` `orange` `lorange` `yellow` `lyellow` `cream` `brown` `dbrown` `tan` `green` `dgreen` `lgreen` `lime` `blue` `mblue` `sky` `lsky` `navy` `night` `cyan` `teal` `purple` `violet` `lviolet` `skin` `skinS`

## 6. 人物 `api.person(kind, opts)`

16×24 ドットの canvas を返す（同じ指定なら同じものを使い回すので、毎回呼んでよい）。

- `kind`：`otoko`（男魂くん：白い T シャツに赤い「男」、赤いはちまき）、`senpai`（先輩：ジャージ）、`douki`（同期）、`ichinen`（一年：名札つき）、`joshi`（女子学生）、`obachan`（おばちゃん：三角巾とエプロン）、`police`（おまわりさん）、`tenin`（店員。variant 0 が牛丼屋、1 がコンビニ）、`ekiin`（駅員）、`zombie`（ゾンビ）、`kyaku`（通りすがり：会社員・おじいさんなど）
- `opts.dir`：`'down'`（正面）`'up'`（後ろ）`'left'` `'right'`
- `opts.frame`：0 か 1（歩き。正面・後ろは 0, 1, 0, 1 を左右反転、の 4 コマにすると自然）
- `opts.variant`：0〜（番号で髪や服の色が変わる。人がたくさんいる場面で使う）
- `opts.naked`：true で全裸（札とモザイクつき）

`api.portrait(kind, { variant, mood })` は 32×32 の顔。`mood` は `'normal'` `'happy'` `'sad'` `'angry'` `'shock'`。

大きく見せたいときは `g.sprite(絵, x, y, { scale: 2 })`。

## 7. テストのしかた

### ブラウザで

- `game/?play=<id>` … そのミニゲームの説明画面から始まる。結果のあと A でもう一度。
- `game/?play=<id>&quick=1` … 説明と 3・2・1 をとばして、すぐ始まる。
- `&seed=123` を付けると乱数が毎回同じになる。

### `OTK.debug`（ブラウザのコンソールや Playwright から）

| 書き方 | 内容 |
| --- | --- |
| `OTK.debug.scene` | いまの場面の名前：`title` `menu` `practice` `story` `calendar` `intro` `countdown` `play` `pause` `result` `ending_good` `ending_bad`（ホームへ移るときは `leave`） |
| `OTK.debug.current` | 遊んでいるミニゲームの id（なければ `null`） |
| `OTK.debug.game` | `create(api)` が返したもの（中の状態を見るのに使う） |
| `OTK.debug.api` / `OTK.debug.run` | いまの api ／ 実行の情報（`run.phase`：`ready` `play` `stamp` `done`、`run.result`、`run.msg`） |
| `OTK.debug.start(id, { quick, tries })` | そのミニゲームを始める。`tries: 2` で、2 回しっぱいしたあとの易しさを試せる |
| `OTK.debug.forceResult('win' か 'lose', msg)` | いまのミニゲームを勝ち・負けで終わらせる |
| `OTK.debug.seed(n)` | 次に始めるミニゲームの乱数を固定（`null` で戻す） |
| `OTK.debug.speed = 4` | 早送り（4 倍） |
| `OTK.debug.story(n)` | 1年の n 番目（0 から）の月から始める |
| `OTK.debug.goto(name)` | `title` `menu` `practice` `story` `ending_good` `ending_bad` へ飛ぶ |
| `OTK.debug.save` / `OTK.debug.reset()` | セーブの中身 ／ セーブを消す |

### Playwright で

`tests/e2e/<id>.test.js` を作り、`node tests/e2e/<id>.test.js` で動かす。ポートは ARCH.md の割り当て（ミニゲームは 8811〜8815）を使う。

```js
const { withSite, realErrors } = require('./lib');

withSite(8811, async ({ open }) => {
  const { page, errors } = await open('game/?play=gyudon&quick=1&seed=1');
  await page.waitForFunction(() => OTK.debug.scene === 'play');
  await page.keyboard.down('ArrowRight');           // キーで遊ぶ
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowRight');
  const x = await page.evaluate(() => OTK.debug.game.me ? OTK.debug.game.me.x : null); // 返したオブジェクトに状態を出しておくと見やすい
  await page.screenshot({ path: '/tmp/gyudon.png' });
  await page.evaluate(() => OTK.debug.forceResult('win'));
  await page.waitForFunction(() => OTK.debug.scene === 'result');
  const errs = realErrors(errors);
  if (errs.length) throw new Error(errs.join('\n'));
  console.log('ok');
}).catch((e) => { console.error(e); process.exit(1); });
```

- スマホは `open('game/?play=…', { phone: true })`。画面の下のボタンは `[data-otk-key="a"]`・`[data-otk-key="b"]`・`#otk-dpad`。画面のタップは `#otk-canvas` を押す（256×224 の座標に直される）。
- 長いゲームは `OTK.debug.speed = 4` で早送りできる。
- スクリーンショットはリポジトリの外に保存する。

## 8. 画面の流れ（参考）

タイトル → メニュー →（1年をはじめる）はじまりの話 → カレンダー「4月 新歓」→ 説明 → 3・2・1 → ミニゲーム → クリア！／しっぱい… → 結果 → 次の月…

- 全部クリア → よいエンディング（寮になじんだ。そして、留年が確定した。）→ スタッフロール
- 途中でしっぱい → わるいエンディング（途中退寮。）→「この月からやりなおす」か「タイトルへ」
- 練習モード：好きなミニゲームを 1 本ずつ。クリアすると ★
- 進み具合は localStorage `otk-save`、音のオン・オフは `otk-sound`
