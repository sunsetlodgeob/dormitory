# 夕照寮OB会サイト

横浜市立大学の男子寮「夕照寮」の OB 会サイト。GitHub Pages で公開する（ビルド不要、ファイルを置けば動く）。

- 企画は `docs/site/PLAN.md`、作るときの決まりごと（置き場所・データの形・ゲームの約束・保存するもの・確認のしかた）は `docs/site/ARCH.md`。最初に読むこと。
- ページの一覧と使い方は `README.md`。
- ホームは `index.html`（`js/home/`）。ファミコンふうのメニューで、下にふつうのリンクの一覧もある。行き先を増やすときは `js/home/menu.js` と `index.html` の一覧の両方を直す。
- ゲーム「男魂くんの1年」は `game/`。土台は `js/otoko/`（使い方は `docs/site/ENGINE.md`）、ミニゲームは `js/otoko/games/<id>.js` に 1 本 1 ファイル。
- 年表・部屋割り・名簿は `nenpyo/`・`heya/`・`meibo/`（`js/nenpyo.js`・`js/heya.js`・`js/meibo.js`）。データは `js/site/data.js` が読む。
- 寮さんぽ（建物を歩ける再現）は `sanpo/`。間取りは `js/world.js`（1 文字 = 1 マスのテキスト地図）、描画は `js/art.js`、操作は `js/game.js`。
- claude.ai に公開する寮さんぽの 1 枚の HTML は `python3 tools/build_artifact.py <出力先>` で作る。
- Google 側（スプレッドシート・Apps Script・Gemini）は `gas/` と `docs/site/SETUP.md`（幹事向けの手順）。投稿フォームはトップページ（`index.html` の `#post`、`js/home/post.js`）で、受け口は `gas/Code.gs` の doPost（type 'post'）。
- どのページも `<footer data-ob-footer></footer>` と `js/site/common.js` で、フィクションの注記を出す。リンクは相対パスで書く（サイトは `/dormitory/` の下に出る）。

## 確認のしかた
- `sh tests/run-all.sh` で全部（ブラウザの確認 `tests/e2e/*.test.js` と、Apps Script の確認 `tests/gas/run.js`）。失敗があると終了コードが 0 以外になる。
- 1 つだけなら `node tests/e2e/<名前>.test.js`。ポートは `PORT=8821` のように変えられる（割り当ては `docs/site/ARCH.md`）。
- Playwright は `require('playwright')` か `/opt/node22/lib/node_modules/playwright` を使う。Chromium が入っているので `playwright install` はしない。Google Fonts などの外には出られないことがあるが、そのエラーは `realErrors()` で除く。

## 寮の再現資料
- 男子寮（横浜市金沢区六浦東1-49-6）の再現用の資料が `docs/dorm/` にある。最初に `docs/dorm/README.md` を読むこと。
- 間取りは `docs/dorm/floorplan.png` と `docs/dorm/dorm_reference.md`。写真は `docs/dorm/photos/` にあり、番号で `docs/dorm/photos_index.csv` と対応する。
- 資料に書かれていないこと（窓・ドアの位置、方位、寸法など）は推測で決めず、ユーザーに確認する。

## 名前と写真の扱い
- このリポジトリは公開されている。写真には人物が多く写っているので、`docs/dorm/photos/` と `docs/dorm/source/` は Git に入れない（`.gitignore` 済み）。手元にないときは持ち主にもらう。
- 実名をリポジトリに入れない。名簿・部屋割り・年表の中身はスプレッドシートにあり、サイトは開いたときに読みこむ。リポジトリにあるのは `js/site/sample.js` の架空の名前だけ。
- ゲームの登場人物は「先輩A」「同期B」のように呼び、名前を出さない。
- 写真館はサイトに置かず、ログインが必要な Google のアルバムへのリンクだけにする。
- 幹事の名前・役割など、OB 会の運営の情報はサイトに使わない。
