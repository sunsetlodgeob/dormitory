# 夕照寮OB会サイト 設計メモ（作る人向け）

企画は [PLAN.md](PLAN.md)。ここには、作るときの決まりごとをまとめる。

## 1. 置き場所

GitHub Pages で `https://sunsetlodgeob.github.io/dormitory/` に出る。リンクはすべて相対パスで書く。

```
index.html              ホーム（ファミコンウォーズ風のモード選択）
css/home.css  js/home/   ホーム専用
game/index.html          ゲーム「男魂くんの1年」
  css/otoko.css
  js/otoko/engine.js     画面・入力・描画の土台
  js/otoko/audio.js      ピコピコ音（効果音・BGM）
  js/otoko/chars.js      人物のドット絵
  js/otoko/main.js       タイトル・1年の進行・練習モード・エンディング
  js/otoko/story.js      寸劇（ミニゲームの間の短いお話）を動かすしくみ
  js/otoko/scenes.js     寸劇の台本（セリフを直すときはここだけ）
  js/otoko/games/*.js    ミニゲーム（1 本 1 ファイル）
                         寸劇の背景に、寮さんぽの js/world.js（地図）と js/art.js（絵）も読む
nenpyo/index.html        年表（Google ログイン）   js/nenpyo.js  css/nenpyo.css
heya/index.html          部屋割り                  js/heya.js    css/heya.css
meibo/index.html         名簿                      js/meibo.js   css/meibo.css
sanpo/index.html         寮さんぽ（建物を歩ける再現）  js/world.js js/art.js js/game.js css/style.css
                         （?year= の部屋割りと注記のために js/site/ の 4 つも読む）
status/index.html        進捗（作る人と幹事向け。ホームからはリンクしない）  status/status.js に中身
css/site.css             コンテンツのページ共通の見た目
js/site/config.js        設定（URL など。空ならサンプルで動く）
js/site/sample.js        サンプルデータ（すべて架空）
js/site/data.js          データの読み込み（OB.data）、部屋割りのそろえ方（OB.data.roomsByYear）
js/site/common.js        注記の表示（OB.DISCLAIMER）、OB.esc・OB.safeUrl・OB.wareki・OB.normSearch
gas/                     Google Apps Script（トップページの投稿 → Gemini → スプレッドシート → サイト）
tools/build_artifact.py  寮さんぽを 1 枚の HTML にまとめる（claude.ai に公開する用）
tests/e2e/               ブラウザでの確認（Playwright）
tests/gas/               gas/Code.gs の確認（Google には出ない）
tests/run-all.sh         確認をぜんぶ動かす
docs/site/ENGINE.md      ゲームのエンジンの使い方（ミニゲームを作る人向け）
docs/site/SETUP.md       Google 側の設定手順（幹事向け）
```

どのページも、ほかのページへのリンクは相対パス（`../`、`../heya/` など）で書く。サイトは `/dormitory/` の下に出るので、`/` から始まるパスは使わない。

写真館はサイトに置かない。`OB_CONFIG.ALBUM_URL`（Google のアルバム）へのリンクだけ。

## 2. 守ること

- **実名をリポジトリに入れない。** 名簿・部屋割り・年表はスプレッドシートにあり、ページを開いたときに読みこむ。リポジトリにあるのは `js/site/sample.js` の架空の名前だけ。
- **ゲームに名前を出さない。** 登場人物は「男魂くん」以外、「先輩A」「同期B」「一年C」のような呼び方にする。
- **スプレッドシートから来た文字は、必ず `OB.esc()` を通してから HTML に入れる**（または textContent）。URL は `OB.safeUrl()` を通す。
- **すべてのページに注記を出す。** `<footer data-ob-footer></footer>` を置き、`js/site/common.js` を読みこむ（ゲーム画面の中にも、タイトルなどに一言入れる）。
- **任天堂のファミコンウォーズの絵・音楽・ロゴは使わない。** 雰囲気の似たオリジナルにする（色数の少ないドット絵、白い二重線のウインドウ、点滅するカーソル、行進曲風のピコピコ音）。
- **外部のライブラリは使わない**（Google のログイン用スクリプト `https://accounts.google.com/gsi/client` と Google Fonts だけ）。ビルド不要で、ファイルを置けば動くこと。
- スマホ（幅 360px〜）とパソコンの両方で使えること。音は最初の操作のあとに鳴らし、オン・オフできること。
- 文章は日本語。です・ます調にこだわらず、短く。

## 3. データの形

### 名簿・部屋割り（誰でも見られる）

`OB.data.loadPublic()` → `GET {GAS_URL}?type=public`

```json
{
  "ok": true,
  "updated": "2026-11-01T12:00:00+09:00",
  "members": [ { "name": "夕照 一郎", "entryYear": 2003, "gradYear": 2006 } ],
  "rooms":   [ { "year": 2005, "room": "305", "name": "夕照 一郎" } ]
}
```

- `entryYear`・`year` は年度（4月はじまり）の西暦。
- `gradYear` は卒業した年度（2007年3月に卒業したなら 2006）。名簿には「2006年度卒」と出る。無いこと（null）もある。
- `room` は文字列で `"101"`、`"201"`〜`"217"`、`"301"`〜`"317"`（一覧は `OB.data.ROOM_NUMBERS`）。
- 「掲載」にチェックがある行だけが返る（投稿で入った行は、はじめからチェックあり）。メモに「名簿掲載NG」とある行と、入学年度のない名簿の行は返らない。
- `members` は入学年度の順、`rooms` は年度の順（同じ年度の中は部屋の順）。
- 設定が空のときは `js/site/sample.js` の中身を返し、`sample: true` が付く。

### 年表（Google でログインした、見る権限のある人だけ）

`OB.data.loadTimeline(idToken)` → `POST {GAS_URL}`、本文 `{"type":"timeline","idToken":"…"}`（`Content-Type: text/plain`）

```json
{ "ok": true, "events": [ { "id": "e12", "year": 2005, "month": 4, "title": "…", "body": "…", "tags": ["新歓"] } ] }
{ "ok": false, "error": "not_member" }      // 権限がない
{ "ok": false, "error": "invalid_token" }   // ログインが切れた・不正
{ "ok": false, "error": "not_configured" }  // Apps Script 側の設定がまだ
{ "ok": false, "error": "bad_request" }     // 送った中身がおかしい
{ "ok": false, "error": "server_error" }    // Apps Script の中でエラー
```

- `OB.data.loadTimeline()` は、失敗すると `code` 付きの Error を投げる。`code` は上の `error` の値か、通信できなかったときの `'network'`。
- 年表のページは `not_member`・`invalid_token`・`not_configured`・`network` で、それぞれの文を出す。ほかは「うまく読み込めませんでした」。

- `year`・`month` は分からなければ null。
- `idToken` は Google Identity Services（`google.accounts.id`）のログインで受け取る credential（ID トークン）。サイトは保存しない（メモリだけ）。
- 「見る権限」＝ シート「メンバー」にメールアドレスがある人か、そのスプレッドシートを共有されている人（閲覧者・編集者・オーナー）。
  スプレッドシートを共有すると、掲載していない投稿やメモまで見えるので、寮生は「メンバー」に書く（`docs/site/SETUP.md`）。

### 投稿（トップページのフォーム。だれでも送れる）

`js/home/post.js` → `POST {GAS_URL}`（`Content-Type: text/plain`）。どの欄も空でよいが、事件の見出しか本文・名簿の名前か訂正・部屋割りのどれか 1 つは要る。

```json
{
  "type": "post", "quiz": "夕照寮", "hp": "", "by": "一年C",
  "event":  { "when": "平成17年の4月", "title": "屋上でBBQ", "what": "…", "who": "先輩A" },
  "member": { "name": "夕照 一郎", "entry": "2003", "grad": "", "fix": "入学年度は2004でした" },
  "rooms":  { "text": "2005年度 305号室 自分・六浦二郎" }
}
```

```json
{ "ok": true, "saved": { "event": "e12", "member": "added", "rooms": { "added": 2, "same": 0, "removed": 0 } },
  "results": ["年表：「屋上でBBQ」を載せました（2005年度）", "名簿：…", "部屋割り：2 件を載せました"] }
{ "ok": true, "duplicate": true, "saved": {}, "results": [] }  // 10 分以内に同じ内容
{ "ok": false, "error": "quiz" }            // いたずらよけの問い（寮の名前）がちがう
{ "ok": false, "error": "empty" }           // 書いてある所がない
{ "ok": false, "error": "too_many" }        // 1 時間に 30 件をこえた
```

- Apps Script は原文をシート「投稿」に残し、Gemini で整えて、年表・名簿・部屋割りに **「掲載」ありで** 入れる（幹事の確認なし。持ち主の決めたこと）。結果はシート「投稿」の「結果」にも書く。
- `saved.member`：`added`（新しく足した）・`updated`（同じ名前の行を直した）・`same`（変えるところなし）・`removed`（「外して」で掲載を外した）。名前は空白を無視してくらべる。名前の訂正（`oldName`）は部屋割りの行も直す。
- 部屋割りは、年度・部屋・名前の組がもうあれば足さない。「消して」は掲載を外す。「自分」は名簿の欄のお名前。
- `hp` は人には見えない欄。何か入っていたら、入れずに `ok` だけ返す。
- 年表・名簿・部屋割りのページの「投稿する」ボタンは `OB.POST_HREF`（`../#post`）へ。

## 4. ゲーム「男魂くんの1年」

### 話の流れ

20xx年4月、新入生の男魂くんが夕照寮に入寮する。1年間の行事（ミニゲーム）を順にこなす。登場する寮生は過去の寮生全員だが、学年も名前も分からない（先輩A・同期B…）。

- 行事と行事の間に、ドット絵の人物が動く短い寸劇が入る（入寮のあいさつ、各行事の前ふり、勝ったあとの一言、屋上の夕焼け）。
  見ているだけでよく、START でとばせる。台本は `js/otoko/scenes.js`、書き方は `docs/site/ENGINE.md` の 9。
- 全部クリア → 寮になじみ、**留年が確定する**（めでたしめでたし）
- 途中で失敗 → 途中退寮。中途半端に寮の影響を受けたので友達もできず、**留年が確定する**
- ゲームオーバーのあとは「その月からやりなおす」を選べる。
- 練習モードでは、好きなミニゲームを 1 本ずつ遊べる（寮生大会の余興用）。
- 「男魂野球大会」はあとで追加する（タイトル画面に「準備中」で置いておく）。

### ミニゲームの一覧

| 順 | id | 月 | 行事 | 内容 |
| --- | --- | --- | --- | --- |
| 1 | `nomu` | 4 | 新歓 | 自分に振られたら飲む、限界が来たら吐く、を間違えずに繰り返せ |
| 2 | `nise` | 4 | 新歓 | 新歓コンパ2日目。毎年、3年生が1人、一年のふりをしてまぎれこむ（先輩はみんな知っているドッキリ）。一年が1人ずつ声をかけてくる中、何度もパシリを買って出るニセ一年だけは一度も使うな。最後にネタばらし。本物を断りすぎると友達ができない |
| 3 | `gyudon` | 6 | ― | 牛丼を食べていたら財布がない。店員の目を盗んで店を出ろ |
| 4 | `deisui` | 7 | ― | 泥酔して消えた同期Bを、終電（0:40）までに探せ。上り・下りはランダム。乗るのは1駅5分、さがすのは10分。脱ぎすてた服（くつ＝あと4駅・くつした＝3駅・シャツ＝2駅・ズボン＝つぎ）で、あと何駅かわかる |
| 5 | `conveni` | 9 | ― | 全裸でコンビニに行った帰り、投げつけられるカラーボールを全部よけ、そのあと来る警察から逃げきれ |
| 6 | `zombie` | 10 | ― | 寮生全員がゾンビになった。全員なぐって正気に戻せ |
| 7 | `gakusai` | 11 | 学祭 | 寮のホストクラブ「夕照」（寮生がスーツでホストになる）の呼びこみ。女子100人の勧誘を成功させろ。のぼりの間のグループを←→（スマホはタップ）でえらんで A でさそう。来てくれるかは頭の上の気分しだい（ハート＝看板を見ている、がねらい目。スマホ中・いそぎはほぼ来ない）。とりのおばちゃんはマイナス10人 |
| 8 | `setsubun` | 2 | 節分 | 投げつけられる物に耐えてピラミッドを完成させろ。警察が来たらすぐ中に逃げろ |
| 9 | `kippu` | 3 | 追いコン | 追いコンの夜、全裸で駅まで切符を買いに行き、寮の近く（川ぞいの道）までもどれ。誰にも見られるな（いちばんの見せ場の、長いかくれんぼ） |
| 10 | `unko` | 3 | 追いコン | 寮までの最後のひと走り。待ちぶせしていた先輩たちが後ろから投げてくるうんこをよけて、寮の玄関に飛びこめ |

- 1 本 30〜60 秒くらいで終わる軽いもの。凝りすぎない。何度か遊べばクリアできる難しさ。
- ただし `kippu` だけは長め（はじめてなら 3〜5 分）。寮の玄関前 → 川ぞいの道 → 住宅街 → 商店街 → 駅前（券売機）と行き、帰りは人の動きが変わった道を、川ぞいの道の寮の手前までもどる（寮に入るのは次の `unko`）。
  エリアの入り口がチェックポイントで、見つかっても ♥（3 つ）があるうちはそこからやりなおせる。♥ がなくなるとしっぱい。しっぱいのあともう一度遊ぶと、前回のチェックポイントから。時間制限はない。
  1年の流れでは、`kippu` に勝つとカレンダーをはさまずに `unko` の前ふりへ続く（同じ夜・同じ道。register の `chain: true`）。
- 全裸の場面は、体を「男魂」と書いた札やモザイクで隠す（はっきりした裸は描かない）。
- お酒の場面（`nomu`）の説明には「お酒は二十歳になってから。一気飲みはやめましょう」と小さく入れる。
- 学祭のホストクラブ（`gakusai`）は健全なもの。お酒は出さず、中ではジュースとお菓子を出して、寮生が出し物をする。説明に「お酒は出さない」と小さく入れる。
- ニセ一年（`nise`）は OB ではなく、一年のふりをした 3年生（毎年恒例のドッキリ。先輩はみんな知っていて、一年は知らない。ネタばらしまでは、寸劇でもだれも「ニセ者がいる」と言わない。説明画面でも 3年生とは書かない）。ぼろは「去年を知っている」「寮にくわしすぎる」「寮長になれなれしい」「入学式やオリエンにうとい」と、うしろの先輩のようす（笑いをこらえる・目をそらす・スマホでとる）。顔は寸劇の一年D と同じ（ネタばらしの寸劇 `nise_win` とつながるように）。
- ゲーム中はレトロなドット絵から外れてもよいが、画面の大きさ・操作は共通にする。

### ミニゲームの書き方（エンジンとの約束）

`js/otoko/games/<id>.js` で 1 本を登録する。細かい API は `docs/site/ENGINE.md`（エンジンを作る人が書く）。

```js
OTK.register({
  id: 'nomu',                  // ファイル名と同じ
  order: 1,                    // 1年の中の順番（上の表）
  month: 4, event: '新歓',
  title: '飲むか吐くか',
  goal: '飲め！ 吐け！',        // 開始前に大きく出す一言
  howto: ['A：飲む', 'B：吐く'], // 操作の説明（1〜3 行）
  note: 'お酒は二十歳になってから。', // 任意：説明画面の小さい注記
  time: 30,                    // 制限時間（秒）。なければ null
  timeout: 'lose',             // 時間切れのとき 'win'（逃げきり型）か 'lose'
  create(api) {                // 1 回遊ぶごとに呼ばれる
    return {
      update(dt) {},           // dt は秒。api.input で入力を読む。終わったら api.win('…') / api.lose('…')
      draw(g) {},              // 256x224 の画面に描く
    };
  },
});
```

- 画面は 256×224 ドット（ファミコンと同じ）。上の 12 ドットは、残り時間などを出すので空けておく。
- 操作は十字キーと A・B だけ（キーボードは矢印・Z/X、スマホは画面下のボタン）。タップの位置も使ってよい。

## 5. ブラウザに保存するもの

サーバーには何も送らない。どれも、その人のブラウザの中だけ。

| ページ | 場所 | キー | 中身 |
| --- | --- | --- | --- |
| ホーム | localStorage | `ob-home-sound` | 音のオン・オフ（`'on'`・`'off'`） |
| ホーム | sessionStorage | `ob-home-last` | コンテンツから戻ったとき、元の場面とカーソルから始めるためのメモ（1 回読んだら消す） |
| ゲーム | localStorage | `otk-save` | 1年の進み具合 `{ step, clear, good, bad }` |
| ゲーム | localStorage | `otk-sound` | 音のオン・オフ |
| 寮さんぽ | localStorage | `sekisho-dorm-save-v1` | 進み具合 |
| 寮さんぽ | localStorage | `sekisho-sound` | 音のオン・オフ |

年表のログインで受け取る ID トークンは、どこにも保存しない（メモリだけ）。

## 6. 確認のしかた

- `node tests/e2e/<名前>.test.js` で動く確認を書く（`tests/e2e/lib.js` を使う）。エラーが出ないこと、主な操作が通ることを確かめる。
- ぜんぶまとめて動かすときは `sh tests/run-all.sh`（1 つでも失敗すると、終了コードが 0 以外になる）。30 分ほどかかる。
- `gas/Code.gs` の確認は `node tests/gas/run.js`（Google には出ない。Apps Script のまねをして動かす）。
- 同時に動かしても重ならないように、ポートを分ける：
  ゲームのエンジン 8801、ホーム 8802、部屋割り 8803、名簿・年表 8804、ミニゲーム 8811〜8815、サイト全体 8805、ゲームの寸劇 8806、確認役 8821〜。
- どの確認も、環境変数 `PORT` でポートを変えられる（例：`PORT=8821 node tests/e2e/home.test.js`）。古い名前の `HOME_PORT`・`HEYA_PORT`・`MEIBO_PORT`・`NENPYO_PORT` も使える。
- このリポジトリの外（Google Fonts など）には出られないことがある。フォントが読めないことによるエラーは無視してよい（`realErrors()`）。
- 確認のための入り口：
  - ホーム：`window.HOME.state`（いまの場面・カーソル）、`HOME.hit`、`HOME.audio.current()`・`HOME.audio.started()`
  - ゲーム：`OTK.debug`（`docs/site/ENGINE.md` の 7）。`game/?play=<id>&quick=1&seed=1` で、そのミニゲームからすぐ始まる。
    `game/?skit=<名前>` でその寸劇から、`game/?noskit=1` で寸劇なし（ENGINE.md の 9）
  - 部屋割り：`window.HEYA`
