# 夕照寮OB会サイト

横浜市立大学の男子寮「夕照寮」の OB 会サイト。GitHub Pages で公開する（ビルド不要、ファイルを置けば動く）。

- 企画は `docs/site/PLAN.md`、作るときの決まりごと（置き場所・データの形・ゲームの約束）は `docs/site/ARCH.md`。最初に読むこと。
- ホームは `index.html`、ゲームは `game/`、年表・部屋割り・名簿は `nenpyo/`・`heya/`・`meibo/`。
- 寮さんぽ（建物を歩ける再現）は `sanpo/`。間取りは `js/world.js`（1 文字 = 1 マスのテキスト地図）、描画は `js/art.js`、操作は `js/game.js`。
- claude.ai に公開する寮さんぽの 1 枚の HTML は `python3 tools/build_artifact.py <出力先>` で作る。
- Google 側（フォーム・スプレッドシート・Apps Script・Gemini）は `gas/` と `docs/site/SETUP.md`。

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
