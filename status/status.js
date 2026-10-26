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
    { id: 'nise', month: 4, event: '新歓', title: 'ニセ一年を見抜け', status: '完了', note: '毎年恒例のドッキリ。一年のふりをした 3年生を、一度もパシリに使うな。最後にネタばらし' },
    { id: 'gyudon', month: 6, event: '', title: '財布がない', status: '完了' },
    { id: 'deisui', month: 7, event: '', title: '同期Bをさがせ', status: '完了', note: '終電 0:40 までの時計ひとつ。脱いだ服（くつ→くつした→シャツ→ズボン）で、あと何駅かわかる' },
    { id: 'conveni', month: 9, event: '', title: '全裸コンビニ', status: '完了' },
    { id: 'zombie', month: 10, event: '', title: '寮ゾンビ', status: '完了' },
    { id: 'gakusai', month: 11, event: '学祭', title: '女子100人勧誘', status: '完了', note: '寮のホストクラブ「夕照」の呼びこみ（お酒なし。ジュースとお菓子と出し物）' },
    { id: 'setsubun', month: 2, event: '節分', title: '節分ピラミッド', status: '完了', note: '全員全裸で組む（札とモザイク）。寒い' },
    { id: 'kippu', month: 3, event: '追いコン', title: '全裸で切符', status: '完了', note: 'いちばんの見せ場。駅まで行って帰ってくる、長めのかくれんぼ' },
    { id: 'unko', month: 3, event: '追いコン', title: 'うんこをよけろ', status: '完了', note: '寮までの最後のひと走り。待ちぶせしていた先輩たちから逃げて、玄関へ' },
    { id: '', month: null, event: '', title: '行事の合間のストーリー', status: '確認中', note: 'ドット絵の寸劇 17 場面。持ち主の話（管理人さん・ニセ一年・学祭・追いコンの順番）を入れた。もう一度見てもらう' },
    { id: '', month: null, event: '', title: '男魂野球大会', status: 'あとで', note: 'タイトル画面に「準備中」で置いてある' },
    { id: '', month: null, event: '', title: '寮生ひとりひとりのドット絵', status: 'あとで', note: 'Codex に発注するかも' },
  ],

  // ストーリーの場面（game/?skit=<id> で、その場面から見られる）
  skits: [
    { id: 'opening', title: '入寮', note: '寮長が玄関で出むかえ（管理人さんは、うしろでそうじ）→ 食堂で「新歓コンパは4日目の夜だ」' },
    { id: 'nomu', title: '4月 新歓コンパ 1日目', note: '入寮して3日。一年D が「なんか買ってこようか？」→ 4日目の夜、新歓（入寮の日にも「荷物、持とうか？」）' },
    { id: 'nise', title: '4月 新歓コンパ 2日目', note: '一年D がこき使われるたび、先輩たちが笑いをこらえる（ドッキリ）' },
    { id: 'nise_win', title: '4月 ネタばらし → 入学式', note: '「今年のニセ一年は、こいつでした〜！」→ 次の日、入学式' },
    { id: 'gyudon', title: '6月 仕送り前', note: '牛丼屋は 50円引き。財布は部屋に…' },
    { id: 'deisui', title: '7月 夜11時半の電話', note: '「くつも、くつしたも、シャツも、ズボンも、ない…」「終電は0時40分」' },
    { id: 'deisui_win', title: '7月 クリアのあと', note: '終電で寮へ。「…ここ、どこ？」' },
    { id: 'conveni', title: '9月 罰ゲームのくじ', note: '「ついでにアイス買ってきて」' },
    { id: 'conveni_win', title: '9月 クリアのあと', note: '「…で、アイスは？」' },
    { id: 'zombie', title: '10月 キノコ鍋', note: '裏の川原のキノコ（たぶん）' },
    { id: 'zombie_win', title: '10月 クリアのあと', note: '「なんでみんな顔がはれてるんだ？」' },
    { id: 'gakusai', title: '11月 学祭の作戦会議', note: 'ホストクラブ「夕照」（お酒はなし）。スーツに着がえて、目標は女子100人' },
    { id: 'setsubun', title: '2月 節分', note: '「豆は、まかれるほうだ」「全員、全裸でな！」' },
    { id: 'kippu', title: '3月 追いコンの夜', note: '伝統の罰ゲーム「全裸で切符」→ 午前0時、玄関の前' },
    { id: 'unko', title: '3月 川ぞいの帰り道', note: '切符のすぐあと（カレンダーなし）。卒業する先輩 3 人が待ちぶせ。「最後のプレゼントだ！」' },
    { id: 'unko_win', title: '3月 寮の玄関', note: '「その切符、おれのな。あした実家に帰るんだ」' },
    { id: 'ending', title: '3月の終わり 屋上', note: '「これが『夕照』だ」→ エンディングへ' },
  ],

  // Google 側と、公開までの仕上げ
  tasks: [
    { area: 'Google 側', name: 'フォーム → スプシ → Gemini で整理', status: '完了', note: 'Apps Script。本物の Google ではまだ動かしていない' },
    { area: 'Google 側', name: '名簿・部屋割りの公開データ', status: '完了', note: '「掲載」にチェックした行だけ出る' },
    { area: 'Google 側', name: '年表のログインと権限の確認', status: '完了', note: '「メンバー」シートの人だけ見られる' },
    { area: 'Google 側', name: '幹事向けの設定手順書', status: '完了', note: 'docs/site/SETUP.md', link: 'https://github.com/sunsetlodgeob/dormitory/blob/claude/quirky-mccarthy-cozapk/docs/site/SETUP.md' },
    { area: '仕上げ', name: 'サイト全体の通し確認', status: '完了', note: '全ページをスマホとパソコンで確認。テスト 12 本がすべて通る' },
    { area: '仕上げ', name: 'GitHub Pages の公開設定', status: '完了', note: '設定ずみ' },
    { area: '仕上げ', name: 'Google 側の設定（幹事）', status: '設定待ち', note: '手順書どおりに。URL などを js/site/config.js に入れる' },
    { area: '仕上げ', name: '本番のデータを入れる', status: '未着手', note: '名簿・部屋割り・事件簿の元データをもらってから' },
    { area: '仕上げ', name: '人が遊んで、むずかしさと音を確かめる', status: '未着手', note: 'ミニゲームのむずかしさは自動の確認だけ。曲もまだ人の耳で聞いていない' },
    { area: '仕上げ', name: '本物の Google で動かす', status: '設定待ち', note: 'Google 側の設定のあと、ログインとフォームを一度ためす' },
  ],

  schedule: [
    { due: '2026-10-31', name: '骨組み・ホーム・名簿・部屋割り', status: '完了' },
    { due: '2026-11-07', name: '部屋割りの地図・年表とログイン', status: '完了' },
    { due: '2026-11-14', name: 'ゲーム（ミニゲーム10本）・フォームと Gemini', status: '完了' },
    { due: '2026-11-21', name: '本番データを入れて公開', status: '未着手' },
    { due: '2026-11-28', name: '寮生大会', status: '未着手' },
  ],

  // 持ち主に決めてもらうこと・もらうもの
  decisions: [
    { name: '「とりのおばちゃん」の呼び名（そのまま使ってよい）', status: '完了' },
    { name: '名簿に卒業年度を出すか（出す）', status: '完了' },
    { name: '名簿・部屋割り・事件簿の元データ', status: 'あとで' },
    { name: '部屋割りで「ノックしたときの反応」をどう集めるか', status: 'あとで' },
    { name: 'OB会参加者リストとサイトのつなぎ方', status: 'あとで' },
    { name: '寮の再現の修正ポイント', status: 'あとで' },
  ],
};
