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
  js/otoko/games/*.js    ミニゲーム（1 本 1 ファイル）
nenpyo/index.html        年表（Google ログイン）   js/nenpyo.js  css/nenpyo.css
heya/index.html          部屋割り                  js/heya.js    css/heya.css
meibo/index.html         名簿                      js/meibo.js   css/meibo.css
sanpo/index.html         寮さんぽ（建物を歩ける再現）  js/world.js js/art.js js/game.js css/style.css
css/site.css             コンテンツのページ共通の見た目
js/site/config.js        設定（URL など。空ならサンプルで動く）
js/site/sample.js        サンプルデータ（すべて架空）
js/site/data.js          データの読み込み（OB.data）
js/site/common.js        注記の表示（OB.DISCLAIMER）、OB.esc など
gas/                     Google Apps Script（フォーム → Gemini → スプレッドシート → サイト）
tests/e2e/               ブラウザでの確認（Playwright）
docs/site/SETUP.md       Google 側の設定手順（幹事向け）
```

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
  "members": [ { "name": "夕照 一郎", "entryYear": 2003, "gradYear": 2007 } ],
  "rooms":   [ { "year": 2005, "room": "305", "name": "夕照 一郎" } ]
}
```

- `entryYear`・`year` は年度（4月はじまり）の西暦。`gradYear` は無いこと（null）もある。
- `room` は文字列で `"101"`、`"201"`〜`"217"`、`"301"`〜`"317"`（一覧は `OB.data.ROOM_NUMBERS`）。
- 幹事が「掲載」にチェックした行だけが返る。
- 設定が空のときは `js/site/sample.js` の中身を返し、`sample: true` が付く。

### 年表（Google でログインした、見る権限のある人だけ）

`OB.data.loadTimeline(idToken)` → `POST {GAS_URL}`、本文 `{"type":"timeline","idToken":"…"}`（`Content-Type: text/plain`）

```json
{ "ok": true, "events": [ { "id": "e12", "year": 2005, "month": 4, "title": "…", "body": "…", "tags": ["新歓"] } ] }
{ "ok": false, "error": "not_member" }      // 権限がない
{ "ok": false, "error": "invalid_token" }   // ログインが切れた・不正
{ "ok": false, "error": "not_configured" }  // Apps Script 側の設定がまだ
```

- `year`・`month` は分からなければ null。
- `idToken` は Google Identity Services（`google.accounts.id`）のログインで受け取る credential（ID トークン）。サイトは保存しない（メモリだけ）。
- 「見る権限」＝ そのスプレッドシートを共有されている人（閲覧者・編集者・オーナー）か、シート「メンバー」にメールアドレスがある人。

## 4. ゲーム「男魂くんの1年」

### 話の流れ

20xx年4月、新入生の男魂くんが夕照寮に入寮する。1年間の行事（ミニゲーム）を順にこなす。登場する寮生は過去の寮生全員だが、学年も名前も分からない（先輩A・同期B…）。

- 全部クリア → 寮になじみ、**留年が確定する**（めでたしめでたし）
- 途中で失敗 → 途中退寮。中途半端に寮の影響を受けたので友達もできず、**留年が確定する**
- ゲームオーバーのあとは「その月からやりなおす」を選べる。
- 練習モードでは、好きなミニゲームを 1 本ずつ遊べる（寮生大会の余興用）。
- 「男魂野球大会」はあとで追加する（タイトル画面に「準備中」で置いておく）。

### ミニゲームの一覧

| 順 | id | 月 | 行事 | 内容 |
| --- | --- | --- | --- | --- |
| 1 | `nomu` | 4 | 新歓 | 自分に振られたら飲む、限界が来たら吐く、を間違えずに繰り返せ |
| 2 | `nise` | 4 | 新歓 | ニセ一年が1人まぎれている。一年が気を利かせてくる中、怪しいやつの申し出だけ断れ。断りすぎると友達ができない |
| 3 | `gyudon` | 6 | ― | 牛丼を食べていたら財布がない。店員の目を盗んで店を出ろ |
| 4 | `deisui` | 7 | ― | 泥酔して消えた同期Bを探せ。上り・下りどちらの電車にいるかはランダム。落とした服やカバンが手がかり |
| 5 | `conveni` | 9 | ― | 全裸でコンビニに行った帰り、投げつけられるカラーボールを全部よけ、そのあと来る警察から逃げきれ |
| 6 | `zombie` | 10 | ― | 寮生全員がゾンビになった。全員なぐって正気に戻せ |
| 7 | `gakusai` | 11 | 学祭 | 女子100人の勧誘を成功させろ。成否はランダム。とりのおばちゃんはマイナス10人 |
| 8 | `setsubun` | 2 | 節分 | 投げつけられる物に耐えてピラミッドを完成させろ。警察が来たらすぐ中に逃げろ |
| 9 | `unko` | 3 | 追いコン | 後ろから投げられるうんこをよけろ |
| 10 | `kippu` | 3 | 追いコン | 全裸で切符を、誰にも見られずに買いに行け |

- 1 本 30〜60 秒くらいで終わる軽いもの。凝りすぎない。何度か遊べばクリアできる難しさ。
- 全裸の場面は、体を「男魂」と書いた札やモザイクで隠す（はっきりした裸は描かない）。
- お酒の場面（`nomu`）の説明には「お酒は二十歳になってから。一気飲みはやめましょう」と小さく入れる。
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

## 5. 確認のしかた

- `node tests/e2e/<名前>.test.js` で動く確認を書く（`tests/e2e/lib.js` を使う）。エラーが出ないこと、主な操作が通ることを確かめる。
- 同時に動かしても重ならないように、ポートを分ける：
  ホーム 8802、ゲームのエンジン 8801、ミニゲーム 8811〜8815、部屋割り 8803、名簿・年表 8804、確認役 8821〜。
- このリポジトリの外（Google Fonts など）には出られないことがある。フォントが読めないことによるエラーは無視してよい（`realErrors()`）。
