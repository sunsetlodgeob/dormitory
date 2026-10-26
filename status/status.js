/*
 * 進捗ページのデータ（status/index.html が読む）
 * 作業が進んだら、ここを書きかえてコミットする。
 * status：'完了' | '確認中' | '作成中' | '未着手' | '設定待ち' | 'あとで'
 */
window.OB_STATUS = {
  updated: '2026-10-26',
  release: '2026-11-21', // 公開の予定
  event: '2026-11-28',   // 寮生大会

  // サイトのページ（path は status/ から見た場所）
  pages: [
    { name: 'ホーム', path: '../', status: '完了', note: 'ファミコンウォーズ風のモード選択。マーチ風の曲つき' },
    { name: '男魂くんの1年', path: '../game/', status: '完了', note: '1年をとおして遊ぶ・練習モード・2つのエンディング' },
    { name: '部屋割り', path: '../heya/', status: '完了', note: '年度ごとに、寮のドット絵の上に名前が出る' },
    { name: '名簿', path: '../meibo/', status: '完了', note: '入学年度ごと。検索つき' },
    { name: '年表', path: '../nenpyo/', status: '完了', note: 'いまはデモ表示。本番は Google ログインした人だけ' },
    { name: '寮さんぽ', path: '../sanpo/', status: '完了', note: '建物の中を歩ける。年度を選ぶと部屋をノックできる' },
    { name: '寮さんぽ（2005年度）', path: '../sanpo/?year=2005', status: '完了', note: 'ドアの前で A を押すとノック（サンプルの名前）' },
    { name: '写真館', path: '', status: '設定待ち', note: 'Google のアルバムの URL をもらったらリンクを張る' },
  ],

  // ミニゲーム（id は game/?play=<id> で直接遊べる）
  games: [
    { id: 'nomu', month: 4, event: '新歓', title: '飲むか吐くか', status: '完了' },
    { id: 'nise', month: 4, event: '新歓', title: 'ニセ一年を見抜け', status: '完了' },
    { id: 'gyudon', month: 6, event: '', title: '財布がない', status: '完了' },
    { id: 'deisui', month: 7, event: '', title: '同期Bをさがせ', status: '完了' },
    { id: 'conveni', month: 9, event: '', title: '全裸コンビニ', status: '完了' },
    { id: 'zombie', month: 10, event: '', title: '寮ゾンビ', status: '完了' },
    { id: 'gakusai', month: 11, event: '学祭', title: '女子100人勧誘', status: '完了' },
    { id: 'setsubun', month: 2, event: '節分', title: '節分ピラミッド', status: '完了' },
    { id: 'unko', month: 3, event: '追いコン', title: 'うんこをよけろ', status: '完了' },
    { id: 'kippu', month: 3, event: '追いコン', title: '全裸で切符', status: '完了' },
    { id: '', month: null, event: '', title: '男魂野球大会', status: 'あとで', note: 'タイトル画面に「準備中」で置いてある' },
    { id: '', month: null, event: '', title: '寮生ひとりひとりのドット絵', status: 'あとで', note: 'Codex に発注するかも' },
  ],

  // Google 側と、公開までの仕上げ
  tasks: [
    { area: 'Google 側', name: 'フォーム → スプシ → Gemini で整理', status: '完了', note: 'Apps Script。本物の Google ではまだ動かしていない' },
    { area: 'Google 側', name: '名簿・部屋割りの公開データ', status: '完了', note: '「掲載」にチェックした行だけ出る' },
    { area: 'Google 側', name: '年表のログインと権限の確認', status: '完了', note: '「メンバー」シートの人だけ見られる' },
    { area: 'Google 側', name: '幹事向けの設定手順書', status: '完了', note: 'docs/site/SETUP.md', link: 'https://github.com/sunsetlodgeob/dormitory/blob/claude/quirky-mccarthy-cozapk/docs/site/SETUP.md' },
    { area: '仕上げ', name: 'サイト全体の通し確認', status: '確認中', note: 'いま進めている' },
    { area: '仕上げ', name: 'GitHub Pages の公開設定', status: '設定待ち', note: 'sunsetlodgeob でログインして Settings → Pages' },
    { area: '仕上げ', name: 'Google 側の設定（幹事）', status: '設定待ち', note: '手順書どおりに。URL などを js/site/config.js に入れる' },
    { area: '仕上げ', name: '本番のデータを入れる', status: '未着手', note: '名簿・部屋割り・事件簿の元データをもらってから' },
  ],

  schedule: [
    { due: '2026-10-31', name: '骨組み・ホーム・名簿・部屋割り', status: '完了' },
    { due: '2026-11-07', name: '部屋割りの地図・年表とログイン', status: '完了' },
    { due: '2026-11-14', name: 'ゲーム（ミニゲーム10本）・フォームと Gemini', status: '確認中' },
    { due: '2026-11-21', name: '本番データを入れて公開', status: '未着手' },
    { due: '2026-11-28', name: '寮生大会', status: '未着手' },
  ],

  // 持ち主に決めてもらうこと・もらうもの
  decisions: [
    { name: '「とりのおばちゃん」が実在の人とわかる呼び名か', status: '未着手' },
    { name: '名簿に入れる項目（卒業年度など）', status: '未着手' },
    { name: '名簿・部屋割り・事件簿の元データ', status: 'あとで' },
    { name: '部屋割りで「ノックしたときの反応」をどう集めるか', status: 'あとで' },
    { name: 'OB会参加者リストとサイトのつなぎ方', status: 'あとで' },
    { name: '寮の再現の修正ポイント', status: 'あとで' },
  ],
};
