# 夕照寮 ドット絵さんぽ

横浜市立大学の男子寮「夕照寮」をドット絵で再現したブラウザゲーム。`index.html` を開けば動く（ビルド不要）。

- 間取り・登場人物・文章：`js/world.js`（1 文字 = 1 マスのテキスト地図）
- ドット絵の描画：`js/art.js`／移動・会話・画面切りかえ：`js/game.js`
- claude.ai に公開する 1 枚の HTML は `python3 tools/build_artifact.py <出力先>` で作る

## 男子寮の再現資料
- 男子寮（横浜市金沢区六浦東1-49-6）の再現用の資料が `docs/dorm/` にある。最初に `docs/dorm/README.md` を読むこと。
- 間取りは `docs/dorm/floorplan.png` と `docs/dorm/dorm_reference.md`。写真は `docs/dorm/photos/` にあり、番号で `docs/dorm/photos_index.csv` と対応する。
- 資料に書かれていないこと（窓・ドアの位置、方位、寸法など）は推測で決めず、ユーザーに確認する。

## 写真の扱い
- このリポジトリは公開されている。写真には人物が多く写っているので、`docs/dorm/photos/` と `docs/dorm/source/` は Git に入れない（`.gitignore` 済み）。手元にないときは持ち主にもらう。
- 写真に写っている人や、部屋割り表などの名前を、ゲームやページに出さない。
