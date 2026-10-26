/*
 * 11月 学祭「女子100人勧誘」 ― 寮のホストクラブの前で、通りかかる女子をさそう
 *  寮は毎年、学祭でホストクラブ「夕照」を出す。寮生がスーツでホストになり、中ではジュースとお菓子を出して、出し物をする。
 *  お酒は出さない、わりと健全なホストクラブ。男魂くんもスーツを着て（はちまきはそのまま）、お立ち台で呼びこみをする。
 *  左にホストクラブの入り口。前の通りを、奥は左から右へ、手前は右から左へ、人のグループが歩いていく。
 *  2 本ののぼりの間にいるグループに、A で声をかける。来てくれるかは、うんしだい（女子はだいたい 55%）。
 *  来てくれたらグループ全員が数に入る（＋人数）。男子は数えない。とりのおばちゃんが来ると −10 人。
 *  ↑↓ で声をかける列（奥・手前）をえらぶ。スマホは、人をタップしてもさそえる。
 *  45 秒で 100 人に届けばクリア。
 */
(function () {
  'use strict';

  // おばちゃんの呼び名（実在の人だとわかるなら、ここを変えるだけでよい）
  const OBA_NAME = 'とりのおばちゃん';
  const NEED = 100; // 目標の人数
  const OBA_MINUS = 10; // おばちゃんが来ると減る人数

  // ── 場所（画面は 256×224。上の 12 ドットはエンジンの帯） ──────────────
  const STREET_Y = 132; // 通りの奥のはし
  const ZONE_L = 100, ZONE_R = 180; // のぼりの間。ここにいるグループをさそえる
  const ZONE_C = (ZONE_L + ZONE_R) / 2;
  const ME_X = 80, ME_FEET = 140; // 男魂くんの立つ所（絵の左はしと足もと）。お立ち台（木の箱）に乗っている
  const CRATE_Y = 152; // お立ち台の下のはし
  const DOOR = { x0: 6, x1: 42, y0: 66, y1: 146 }; // ホストクラブの入り口
  const SHOP = { x: 12, feet: 146 }; // 店に入る人が向かう所（入り口）
  const LANES = [
    { feet: 168, dir: 1, speed: 58 }, // 奥の列：左から右へ
    { feet: 202, dir: -1, speed: 66 }, // 手前の列：右から左へ
  ];
  const STEP_X = 10; // グループの中の人と人の間
  const GAP = [16, 36]; // グループとグループの間（ドット）
  const COOL = 0.3; // 声をかけたあと、次に声をかけられるまで（秒）
  const THINK = 0.3; // 声をかけてから、返事が来るまで（秒）
  const JOSHI_N = [1, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5]; // 女子のグループの人数（多めに出る）
  const CLUB = 'ホストクラブ'; // 看板の上の段
  const CLUB_NAME = '夕照'; // 看板の店の名前
  const CALL = ['いらっしゃい\nませ〜！', 'ジュース\nあるよ！', 'お菓子も\nあるよ！', '出し物も\nあるよ！']; // 男魂くんの呼びこみ
  const YES_MSG = ['いいよー', 'いく〜！', 'たのしそう', 'ジュース\nほしい！'];
  const NO_MSG = ['ムリ〜', 'また今度', 'えー', 'いそいでるので', '…', 'うーん、パス', 'ホストは\nちょっと…'];
  const DAN_MSG = ['おれら？', '男でもいい？', 'え、おれ？'];

  OTK.register({
    id: 'gakusai',
    order: 7,
    month: 11,
    event: '学祭',
    title: '女子100人勧誘',
    goal: '女子を100人\nさそえ！',
    howto: ['A：のぼりの間の人をさそう', '↑↓：奥か手前かをえらぶ', OBA_NAME + 'は−10人'],
    note: 'お酒は出さない。ジュースとお菓子。\n男子は数えない。来るかは運しだい。',
    time: 45,
    timeout: 'lose',
    bgm: 'play',
    create(api) {
      const P = api.P, W = api.W, H = api.H;
      // しっぱいが続いたら、少しだけ来てくれやすくする
      const YES = api.tries >= 4 ? 0.65 : api.tries >= 2 ? 0.6 : 0.55;
      const OBA_YES = 0.85; // おばちゃんは、だいたい来る

      let count = 0;
      let lane = 1; // 声をかける列（0：奥、1：手前）
      let cool = 0; // 次に声をかけられるまで
      let shout = 0; // 男魂くんが叫んでいる間
      let shoutMsg = '';
      let bump = 0, bumpCol = P.lgreen; // 数の板が弾む
      let bowT = 0; // 入り口のホストが、おじぎしている間
      let spawned = 0;
      let done = false, doneT = 0;
      let tried = 0, joined = 0, obaIn = 0; // テスト用：声をかけた数・来てくれた女子のグループ・来てしまったおばちゃん
      const groups = [];
      const pops = []; // 「+3」などの文字
      const confetti = [];
      const spawnT = [0, 0];

      // ── グループ ──
      function pickKind() {
        if (spawned < 3) return 'joshi'; // 最初は女子から
        const r = api.rnd();
        if (r < 0.1) return groups.some((o) => o.kind === 'oba') ? 'joshi' : 'oba'; // とりのおばちゃんは 1 人だけ（もう画面にいたら、女子に）
        if (r < 0.26) return 'danshi';
        return 'joshi';
      }
      function makeGroup(li, x) {
        const L = LANES[li];
        const kind = pickKind();
        spawned++;
        const n = kind === 'oba' ? 1 : kind === 'danshi' ? api.irnd(1, 3) : api.pick(JOSHI_N);
        const members = [];
        for (let i = 0; i < n; i++) {
          members.push({
            dx: i * STEP_X + (i ? api.irnd(-1, 1) : 0),
            dy: api.irnd(-2, 1),
            v: kind === 'joshi' ? api.irnd(0, 11) : kind === 'danshi' ? api.irnd(0, 5) : 0,
            ph: api.rnd(0, 1),
            ox: 0, oy: 0, // 店へ向かうときのずれ
          });
        }
        const w = (n - 1) * STEP_X + 16;
        const g = { lane: li, kind, n, members, w, x: x != null ? x : L.dir > 0 ? -w - 2 : W + 2, state: 'walk', t: 0, mul: 1, tried: false, say: null, sayT: 0, alpha: 1 };
        groups.push(g);
        spawnT[li] = (w + api.rnd(GAP[0], GAP[1])) / L.speed;
        return g;
      }
      // 始まる前から、通りににぎわいを
      (function prefill() {
        LANES.forEach((L, li) => {
          // 入ってくる側から、のぼりの手前まで並べる
          let edge = L.dir > 0 ? ZONE_L - 30 : ZONE_R + 30;
          for (let k = 0; k < 4; k++) {
            const g = makeGroup(li, 0);
            g.x = L.dir > 0 ? edge - g.w : edge;
            edge = L.dir > 0 ? g.x - api.rnd(GAP[0], GAP[1]) : g.x + g.w + api.rnd(GAP[0], GAP[1]);
            if (L.dir > 0 ? edge < -10 : edge > W + 10) break;
          }
          // 次のグループは、最後のグループとの間をあけて出てくる
          spawnT[li] = Math.max(0.1, (L.dir > 0 ? -2 - edge : edge - (W + 2)) / L.speed);
        });
      })();

      const cx = (g) => g.x + g.w / 2;
      const inZone = (g) => g.state === 'walk' && !g.tried && cx(g) >= ZONE_L && cx(g) <= ZONE_R;
      // いま A で声をかける相手（えらんだ列で、のぼりのまん中にいちばん近いグループ）
      function target() {
        let best = null, bestD = Infinity;
        for (const pass of [lane, 1 - lane]) {
          for (const g of groups) {
            if (g.lane !== pass || !inZone(g)) continue;
            const d = Math.abs(cx(g) - ZONE_C);
            if (d < bestD) { bestD = d; best = g; }
          }
          if (best) return best;
        }
        return null;
      }
      function label(g) {
        if (g.kind === 'oba') return OBA_NAME;
        return (g.kind === 'joshi' ? '女子' : '男子') + '×' + g.n;
      }
      function pop(x, y, str, col, big) {
        pops.push({ x, y, str, col, t: 0, big: !!big });
      }
      function addCount(d) {
        count = Math.max(0, count + d);
        bump = 0.3;
        bumpCol = d > 0 ? P.lgreen : P.red;
      }

      // 声をかける
      function ask(g) {
        cool = COOL;
        shout = 0.45;
        shoutMsg = api.pick(CALL);
        api.sfx('select');
        if (!g) return; // だれもいないのに叫んだ
        g.tried = true;
        g.state = 'think';
        g.t = 0;
        tried++;
      }
      function answer(g) {
        const top = feetOf(g) - 62; // 「+3」などは、吹き出しの上に出す
        if (g.kind === 'joshi') {
          if (api.chance(YES)) {
            g.state = 'join';
            g.t = 0;
            g.say = api.pick(YES_MSG);
            bowT = 0.9;
            addCount(g.n);
            joined++;
            pop(cx(g), top, '+' + g.n, P.lpink);
            api.sfx('coin');
            if (count >= NEED && !done) finish();
          } else {
            g.state = 'walk';
            g.mul = 1.8; // 足早に去っていく
            g.say = api.pick(NO_MSG);
            api.sfx('cancel');
          }
        } else if (g.kind === 'oba') {
          if (api.chance(OBA_YES)) {
            g.state = 'join';
            g.t = 0;
            g.say = 'あら〜、\nいい男！';
            bowT = 0.9;
            addCount(-OBA_MINUS);
            obaIn++;
            pop(cx(g), top, '−' + OBA_MINUS, P.red, true);
            api.sfx('damage');
            api.shake(3, 0.3);
            // まわりの女子が、ひいていく
            groups.forEach((o) => { if (o !== g && o.kind === 'joshi' && o.state === 'walk' && !o.tried && Math.abs(cx(o) - cx(g)) < 70) { o.tried = true; o.mul = 1.6; o.say = o.say || 'ひっ'; o.sayT = 0; } });
          } else {
            g.state = 'walk';
            g.say = 'いそがしいのよ';
            api.sfx('ok');
          }
        } else {
          // 男子は来てくれるが、数えない
          g.state = 'join';
          g.t = 0;
          g.say = api.pick(DAN_MSG);
          bowT = 0.9;
          pop(cx(g), top, 'ノーカン', P.lgray);
          api.sfx('ng');
        }
        g.sayT = 0;
      }
      function finish() {
        done = true;
        api.sfx('fanfare');
        api.win('100人達成！\n…でも指名は、\nぜんぶ先輩Aだった。', { wait: 1.8 });
        for (let i = 0; i < 60; i++) confetti.push({ x: api.rnd(0, W), y: api.rnd(-80, 12), vy: api.rnd(30, 70), vx: api.rnd(-12, 12), c: api.pick([P.red, P.yellow, P.lgreen, P.sky, P.pink, P.white]) });
      }
      function feetOf(g) {
        return LANES[g.lane].feet;
      }

      // ── 描く道具 ──
      // 吹き出し（白地に黒わく、下にしっぽ）。(x, y) はしっぽの先
      function bubble(g, x, y, str, o) {
        o = o || {};
        const size = 12;
        const lines = String(str).split('\n');
        const w = Math.max(...lines.map((l) => g.measure(l, size))) + 8, h = lines.length * 13 + 5;
        const bx = Math.round(Math.max(2, Math.min(W - w - 2, x - w / 2))), by = Math.round(Math.max(13, y - h - 3));
        const fill = o.fill || P.white;
        g.R(bx + 1, by, w - 2, h, P.ink);
        g.R(bx, by + 1, w, h - 2, P.ink);
        g.R(bx + 1, by + 1, w - 2, h - 2, fill);
        const tx = Math.round(Math.max(bx + 4, Math.min(bx + w - 5, x)));
        g.R(tx - 2, by + h - 1, 4, 1, fill);
        g.R(tx - 2, by + h - 1, 1, 2, P.ink);
        g.R(tx + 1, by + h - 1, 1, 2, P.ink);
        g.R(tx - 1, by + h, 2, 1, fill);
        g.R(tx - 1, by + h + 1, 2, 1, P.ink);
        lines.forEach((l, i) => g.text(l, bx + w / 2, by + 3 + i * 13, { size, col: o.col || P.ink, align: 'center' }));
      }
      function heart(g, x, y, col) {
        g.R(x, y, 2, 1, col);
        g.R(x + 3, y, 2, 1, col);
        g.R(x - 1, y + 1, 7, 2, col);
        g.R(x, y + 3, 5, 1, col);
        g.R(x + 1, y + 4, 3, 1, col);
        g.R(x + 2, y + 5, 1, 1, col);
      }
      // ニワトリ（おばちゃんの目じるし）
      function hen(g, x, y) {
        g.R(x + 1, y + 2, 6, 4, P.white);
        g.R(x, y + 3, 1, 2, P.white);
        g.R(x + 5, y, 3, 3, P.white);
        g.R(x + 6, y - 1, 2, 1, P.red);
        g.R(x + 8, y + 1, 2, 1, P.yellow);
        g.R(x + 6, y + 1, 1, 1, P.ink);
        g.R(x + 7, y + 3, 1, 1, P.red);
        g.R(x + 2, y + 3, 3, 1, P.lgray);
        g.R(x + 3, y + 6, 1, 1, P.yellow);
        g.R(x + 5, y + 6, 1, 1, P.yellow);
      }
      // 縦書きの文字（のぼり・たれ幕）
      function vtext(g, str, x, y, col) {
        [...str].forEach((ch, i) => g.text(ch, x, y + i * 12, { size: 12, col, align: 'center' }));
      }

      function drawSky(g) {
        g.R(0, 12, W, 40, P.sky);
        g.R(0, 52, W, 70, P.lsky);
        g.dither(0, 48, W, 6, P.lsky, 0);
        // 雲
        const k = (api.time * 3) % (W + 80);
        [[30, 22, 1], [150, 30, 0.7]].forEach(([x0, y, s]) => {
          const x = ((x0 + k * s) % (W + 80)) - 40;
          g.oval(x, y, 14, 4, P.white);
          g.oval(x + 10, y - 3, 9, 4, P.white);
          g.oval(x - 8, y + 1, 8, 3, P.white);
        });
      }
      function drawCampus(g) {
        // 奥の校舎
        g.R(118, 50, 138, 72, P.lgray);
        g.R(118, 48, 138, 3, P.gray);
        for (let y = 58; y < 112; y += 16) for (let x = 126; x < 256; x += 14) {
          g.R(x, y, 9, 9, P.sky);
          g.R(x, y, 9, 1, P.dgray);
          g.R(x + 1, y + 1, 3, 3, P.lsky);
        }
        // 校舎のたれ幕「学祭」
        g.R(196, 52, 18, 54, P.red);
        g.R(197, 53, 16, 52, P.rose);
        vtext(g, '学祭', 205, 58, P.white);
        g.R(198, 84, 14, 1, P.lpink);
        vtext(g, '開催', 205, 88, P.lyellow);
        // 木
        [[122, 104, 14], [248, 100, 12], [234, 108, 10]].forEach(([x, y, r]) => {
          g.R(x - 1, y, 3, 16, P.dbrown);
          g.disc(x, y - 4, r, P.dgreen);
          g.disc(x - 3, y - 7, r - 4, P.green);
          g.disc(x + 3, y - 10, r - 7, P.lgreen);
        });
        // 奥の模擬店（小さく）
        [[136, P.mblue], [168, P.green], [222, P.orange]].forEach(([x, col], i) => {
          g.R(x, 108, 26, 16, P.white);
          g.R(x + 2, 112, 22, 12, P.cream);
          for (let s = 0; s < 26; s += 6) g.R(x + s, 104, 3, 5, col);
          g.R(x, 104, 26, 1, col);
          g.R(x + 4, 116, 18, 8, P.tan);
          g.R(x + 8 + i * 3, 110, 3, 6, P.dbrown);
        });
        // 植えこみ
        g.R(96, 124, W - 96, 8, P.dgreen);
        for (let x = 98; x < W; x += 6) g.R(x, 123, 4, 2, P.green);
      }
      // 万国旗（ロープにつるした三角の旗）
      function drawBunting(g) {
        const cols = [P.red, P.yellow, P.lgreen, P.mblue, P.white, P.pink];
        const y0 = 16, sag = 12;
        for (let x = 0; x < W; x += 2) {
          const t = x / W;
          g.R(x, y0 + Math.round(Math.sin(t * Math.PI) * sag), 2, 1, P.dgray);
        }
        for (let i = 0, x = 4; x < W; x += 12, i++) {
          const t = (x + 4) / W;
          const y = y0 + Math.round(Math.sin(t * Math.PI) * sag) + 1;
          const fl = Math.floor(api.time * 3 + i) % 2;
          const c = cols[i % cols.length];
          for (let r = 0; r < 7; r++) g.R(x + Math.floor(r / 2) + (r > 4 ? fl : 0), y + r, 8 - Math.floor(r / 2) * 2, 1, c);
        }
      }
      // 4 つ角の光（キラッ）
      function twinkle(g, x, y, col, on) {
        g.R(x, y - 1, 1, 3, col);
        g.R(x - 1, y, 3, 1, col);
        if (on) { g.R(x, y - 3, 1, 2, col); g.R(x, y + 2, 1, 2, col); g.R(x - 3, y, 2, 1, col); g.R(x + 2, y, 2, 1, col); }
      }
      // ホストクラブ「夕照」の入り口（お酒は出さない。中はジュースとお菓子と出し物）
      function drawBooth(g) {
        const x0 = 2, x1 = 96, t = api.time, D = DOOR;
        // 黒いかべと、金のふち
        g.R(x0, 44, x1 - x0, 104, P.ink);
        g.R(x0, 44, 2, 104, P.brown);
        g.R(x1 - 2, 44, 2, 104, P.brown);
        g.R(x0 + 1, 44, 1, 104, P.yellow);
        g.R(x1 - 2, 44, 1, 104, P.yellow);
        // 入り口の中（うす暗い）
        g.R(D.x0, D.y0, D.x1 - D.x0, D.y1 - D.y0, P.night);
        g.dither(D.x0, D.y0 + 34, D.x1 - D.x0, D.y1 - D.y0 - 34, P.navy, 0);
        // ミラーボールの光の粒が、かべを流れる
        for (let i = 0; i < 10; i++) {
          const k = (t * 0.22 + i / 10) % 1;
          const x = D.x0 + 3 + Math.floor(k * (D.x1 - D.x0 - 6));
          const y = D.y0 + 14 + ((i * 11) % 30);
          g.R(x, y, 2, 1, [P.pink, P.lsky, P.lyellow][i % 3]);
        }
        // ミラーボール
        const bx = Math.round((D.x0 + D.x1) / 2), by = D.y0 + 8;
        g.R(bx, D.y0, 1, 3, P.gray);
        g.disc(bx, by, 5, P.dgray);
        g.disc(bx, by, 4, P.gray);
        for (let yy = -3; yy <= 3; yy += 2) for (let xx = -3; xx <= 3; xx += 2) {
          if (xx * xx + yy * yy <= 18 && ((((xx + yy) >> 1) + Math.floor(t * 5)) & 1)) g.R(bx + xx, by + yy, 1, 1, P.white);
        }
        // 奥のテーブルに、ジュースとお菓子
        g.R(D.x0 + 18, 124, 16, 2, P.tan);
        g.R(D.x0 + 18, 126, 16, 1, P.brown);
        g.R(D.x0 + 20, 127, 1, 5, P.brown);
        g.R(D.x0 + 31, 127, 1, 5, P.brown);
        [[D.x0 + 20, P.lorange], [D.x0 + 24, P.violet]].forEach(([x, col]) => {
          g.R(x, 118, 3, 6, P.lsky);
          g.R(x, 120, 3, 4, col);
          g.R(x + 2, 116, 1, 3, P.white); // ストロー
        });
        g.R(D.x0 + 27, 123, 6, 1, P.white); // お皿
        g.R(D.x0 + 28, 121, 2, 2, P.tan);
        g.R(D.x0 + 30, 121, 2, 2, P.lorange);
        g.R(D.x0 + 29, 120, 2, 1, P.cream);
        // 入り口のホスト（だれかが入ると、おじぎ）
        const bow = bowT > 0 ? (bowT > 0.75 || bowT < 0.15 ? 1 : 2) : 0;
        g.shadow(D.x0 + 10, D.y1 - 1, 6);
        g.sprite(api.person('host', { dir: 'down', variant: 1 }), D.x0 + 2, D.y1 - 25 + bow);
        // 入り口のカーテン（えんじ。金のひもでとめてある）
        for (let y = D.y0; y < D.y1; y++) {
          const k = y - D.y0;
          const w = k < 34 ? Math.round(8 - k * 0.18) : k < 38 ? 2 : Math.min(5, 2 + ((k - 38) >> 3));
          g.R(D.x0, y, w, 1, P.dred);
          g.R(D.x1 - w, y, w, 1, P.dred);
          if (w > 3) { g.R(D.x0 + 2, y, 1, 1, P.xdred); g.R(D.x1 - 3, y, 1, 1, P.xdred); }
        }
        g.R(D.x0, D.y0 + 34, 4, 2, P.yellow);
        g.R(D.x1 - 4, D.y0 + 34, 4, 2, P.yellow);
        g.R(D.x0, D.y0, D.x1 - D.x0, 2, P.yellow);
        // 赤いじゅうたん
        for (let i = 0; i < 10; i++) g.R(D.x0 + 6 - (i >> 1), D.y1 + i, D.x1 - D.x0 - 12 + (i >> 1) * 2, 1, i % 4 === 3 ? P.dred : P.red);
        // 「No.1」の写真（金のわく）
        g.R(47, 64, 26, 42, P.brown);
        g.R(48, 65, 24, 40, P.yellow);
        g.R(50, 77, 20, 26, P.navy);
        g.dither(50, 77, 20, 26, P.violet, Math.floor(t * 2) & 1);
        g.sprite(api.person('host', { dir: 'down', variant: 0 }), 52, 79);
        g.text('No.1', 60, 65, { size: 12, col: P.xdred, align: 'center' });
        twinkle(g, 71, 66, P.white, Math.floor(t * 3) % 3 === 0);
        // 「出し物」のポスター（たて）
        g.R(76, 66, 16, 46, P.lpink);
        g.R(76, 66, 16, 1, P.pink);
        g.R(76, 111, 16, 1, P.pink);
        vtext(g, '出し物', 84, 68, P.violet);
        g.text('★', 84, 98, { size: 12, col: P.rose, align: 'center' });
        // 看板（金のわくに、ネオンの文字）
        g.R(6, 16, 86, 30, P.brown);
        g.R(7, 17, 84, 28, P.yellow);
        g.R(9, 19, 80, 24, P.ink);
        const neon = Math.floor(t * 2) % 4 ? P.pink : P.lpink;
        g.text(CLUB, 49, 19, { size: 12, col: neon, align: 'center' });
        g.text(CLUB_NAME, 49, 28, { size: 16, col: P.lyellow, align: 'center' });
        twinkle(g, 15, 36, P.lyellow, Math.floor(t * 3) % 3 === 1);
        twinkle(g, 83, 36, P.lyellow, Math.floor(t * 3) % 3 === 2);
        // ひさし：むらさきの幕に「ジュース・お菓子」
        g.R(x0, 46, x1 - x0, 13, P.violet);
        g.R(x0, 46, x1 - x0, 1, P.yellow);
        g.text('ジュース･お菓子', 49, 46, { size: 12, col: P.white, align: 'center' });
        for (let x = x0; x < x1; x += 8) {
          g.R(x + 1, 59, 6, 2, P.violet);
          g.R(x + 2, 61, 4, 1, P.violet);
          g.R(x + 3, 62, 2, 1, P.yellow);
        }
        g.R(x0, 146, D.x0 - x0, 2, P.dgray);
        g.R(D.x1, 146, x1 - D.x1, 2, P.dgray);
      }
      function drawStreet(g) {
        // 石だたみ
        g.R(0, STREET_Y, W, H - STREET_Y, P.lgray);
        for (let y = STREET_Y + 6, j = 0; y < H; y += 8, j++) {
          g.R(0, y, W, 1, P.gray);
          for (let x = (j % 2) * 8; x < W; x += 16) g.R(x, y - 7, 1, 7, P.gray);
        }
        g.R(0, STREET_Y, W, 2, P.gray);
        // のぼりの間（さそえる所）を、白い線で
        const live = !api.ended;
        g.dither(ZONE_L, 152, ZONE_R - ZONE_L, H - 152, P.cream, 0);
        for (let y = 152; y < H; y += 6) {
          g.R(ZONE_L, y, 2, 3, live ? P.white : P.gray);
          g.R(ZONE_R - 2, y, 2, 3, live ? P.white : P.gray);
        }
      }
      function drawFlag(g, x, str) {
        const fl = Math.round(Math.sin(api.time * 3 + x) * 1);
        g.R(x, 84, 2, 72, P.tan);
        g.R(x, 84, 2, 1, P.brown);
        g.R(x + 2, 86, 16, 1, P.tan); // 横のさお
        g.R(x + 2 + fl, 87, 16, 62, P.yellow); // 金のふち
        g.R(x + 3 + fl, 88, 14, 60, P.ink);
        vtext(g, str, x + 10 + fl, 90, P.lyellow);
        g.oval(x + 1, 156, 5, 2, P.dgray);
      }
      function personKind(g) {
        return g.kind === 'oba' ? 'obachan' : g.kind === 'danshi' ? 'douki' : 'joshi';
      }
      // 人を、足もとの y の順に描く
      function drawPeople(g) {
        const list = [];
        groups.forEach((gr) => gr.members.forEach((m) => list.push({ gr, m, feet: LANES[gr.lane].feet + m.dy + m.oy })));
        list.push({ me: true, feet: CRATE_Y });
        list.sort((a, b) => a.feet - b.feet);
        for (const it of list) {
          if (it.me) { drawMe(g); continue; }
          const { gr, m } = it;
          const L = LANES[gr.lane];
          let dir = L.dir > 0 ? 'right' : 'left';
          let frame = Math.floor((api.time + m.ph) * (6 * gr.mul)) % 2;
          if (gr.state === 'think') { dir = 'up'; frame = 0; }
          if (gr.state === 'join') {
            dir = m.ox < -2 ? 'left' : 'up';
            frame = Math.floor((api.time + m.ph) * 7) % 2;
          }
          const x = gr.x + m.dx + m.ox, y = it.feet - 24;
          if (gr.alpha < 1) {
            g.ctx.save();
            g.ctx.globalAlpha = Math.max(0, gr.alpha);
          }
          g.shadow(x + 8, it.feet, 5);
          g.sprite(api.person(personKind(gr), { dir, frame, variant: m.v }), x, y);
          if (gr.kind === 'oba') hen(g, x + 3, y - 6);
          if (gr.state === 'join' && gr.kind === 'joshi') {
            const k = (gr.t * 1.5 + m.ph) % 1;
            heart(g, x + 6, y - 6 - k * 8, P.rose);
          }
          if (gr.alpha < 1) g.ctx.restore();
        }
      }
      function drawMe(g) {
        // お立ち台（木の箱）
        g.shadow(ME_X + 8, CRATE_Y, 10);
        g.R(ME_X - 1, ME_FEET, 18, CRATE_Y - ME_FEET, P.ink);
        g.R(ME_X, ME_FEET + 1, 16, CRATE_Y - ME_FEET - 2, P.tan);
        g.R(ME_X, ME_FEET + 1, 16, 1, P.lorange);
        g.R(ME_X, ME_FEET + 6, 16, 1, P.brown);
        [[1, 3], [14, 3], [1, 8], [14, 8]].forEach(([dx, dy]) => g.R(ME_X + dx, ME_FEET + dy, 1, 1, P.dbrown));
        // 男魂くん（スーツ。はちまきはそのまま）
        const jump = shout > 0.25 ? -2 : 0;
        const y = ME_FEET - 24 + jump;
        g.sprite(api.person('otokoHost', { dir: 'right', frame: shout > 0 ? 1 : 0 }), ME_X, y);
        // メガホン
        const mx = ME_X + 12, my = y + 8;
        g.R(mx, my + 1, 3, 3, P.white);
        g.R(mx + 3, my, 2, 5, P.white);
        g.R(mx + 5, my - 1, 2, 7, P.white);
        g.R(mx + 3, my, 1, 5, P.red);
        g.R(mx + 7, my - 1, 1, 7, P.lgray);
        if (shout > 0) {
          const k = Math.floor((0.45 - shout) * 12);
          for (let i = 0; i < 3; i++) {
            const r = 4 + i * 4 + (k % 2);
            g.R(mx + 8 + r, my + 2 - Math.floor(r / 2), 1, r + 1, P.yellow);
          }
        }
      }
      function drawTarget(g) {
        if (api.ended) return;
        // えらんでいる列（のぼりの左に「▶」）
        const ly0 = LANES[lane].feet - 9;
        for (let i = 0; i < 4; i++) g.R(ZONE_L - 8 + i, ly0 + i, 1, 7 - i * 2, P.yellow);
        const t = target();
        if (!t) return;
        const feet = LANES[t.lane].feet;
        const top = feet - 26 + Math.min(...t.members.map((m) => m.dy));
        // 足もとに黄色いかっこ
        const x0 = Math.round(t.x - 2), x1 = Math.round(t.x + t.w + 1);
        const col = t.kind === 'oba' ? P.red : P.yellow;
        g.R(x0, feet + 1, 4, 1, col);
        g.R(x0, feet - 2, 1, 3, col);
        g.R(x1 - 3, feet + 1, 4, 1, col);
        g.R(x1, feet - 2, 1, 3, col);
        // 上に名札と「▼」
        const str = label(t);
        const tw = g.measure(str, 12) + 8;
        const lx = Math.round(Math.max(2, Math.min(W - tw - 2, cx(t) - tw / 2)));
        const ly = top - 22;
        const fill = t.kind === 'oba' ? P.dred : t.kind === 'joshi' ? P.rose : P.dgray;
        g.R(lx, ly, tw, 14, P.ink);
        g.R(lx + 1, ly + 1, tw - 2, 12, fill);
        g.text(str, lx + tw / 2, ly + 1, { size: 12, col: P.white, align: 'center' });
        if (g.blink(3)) {
          const ax = Math.round(cx(t));
          g.R(ax - 3, ly + 15, 7, 1, col);
          g.R(ax - 2, ly + 16, 5, 1, col);
          g.R(ax - 1, ly + 17, 3, 1, col);
        }
        if (t.kind === 'oba' && g.blink(4)) g.text('！', lx + tw + 1, ly, { size: 12, col: P.red, outline: P.white });
      }
      function drawBoard(g) {
        // 数の板（右上）
        const bx = 166, by = 15, bw = 86, bh = 34;
        const k = bump > 0 ? Math.round(Math.sin((bump / 0.3) * Math.PI) * 2) : 0;
        const y = by - k;
        g.R(bx - 1, y - 1, bw + 2, bh + 2, P.ink);
        g.R(bx, y, bw, bh, bump > 0 ? bumpCol : P.red);
        g.R(bx + 2, y + 2, bw - 4, bh - 4, P.white);
        g.text('さそった女子', bx + bw / 2, y + 3, { size: 12, col: P.dred, align: 'center' });
        const col = count >= NEED ? P.green : P.ink;
        g.num(String(count), bx + 46, y + 16, { scale: 3, col, align: 'right' });
        g.num('/' + NEED, bx + 50, y + 21, { scale: 2, col: P.dgray });
      }
      function drawTalk(g) {
        // おばちゃんの吹き出しは、まわりの「ひっ」より上に
        const talk = groups.filter((gr) => gr.say && gr.sayT <= 1.1).sort((a, b) => (a.kind === 'oba') - (b.kind === 'oba'));
        talk.forEach((gr) => {
          const feet = LANES[gr.lane].feet;
          const top = feet - 26 + gr.members[0].oy;
          const mx = gr.x + (gr.lane === 0 ? gr.w - 8 : 8) + gr.members[0].ox;
          bubble(g, mx, top, gr.say, { col: gr.kind === 'oba' ? P.dred : gr.state === 'join' ? P.rose : P.ink });
        });
        groups.forEach((gr) => {
          if (gr.state !== 'think') return;
          const feet = LANES[gr.lane].feet;
          if (g.blink(4)) g.text('？', cx(gr), feet - 40, { size: 12, col: P.ink, outline: P.white, align: 'center' });
        });
        if (shout > 0) bubble(g, ME_X + 10, ME_FEET - 28, shoutMsg, { col: P.dred });
        pops.forEach((p) => {
          const y = p.y - Math.min(1, p.t * 2) * 14;
          if (p.big) g.big(p.str, p.x, y - 10, { size: 16, col: p.col, align: 'center' });
          else g.text(p.str, p.x, y, { size: 16, col: p.col, outline: P.ink, align: 'center' });
        });
      }

      return {
        get count() { return count; },
        get lane() { return lane; },
        get cool() { return cool; },
        get stats() { return { tried, joined, spawned, oba: obaIn }; },
        get shout() { return shout > 0 ? shoutMsg : null; }, // テスト用：いまの呼びこみ
        texts: { CLUB, CLUB_NAME, CALL, YES_MSG, NO_MSG, DAN_MSG }, // テスト用：看板とセリフ
        groups,
        // テスト用：いま A をおしたら声をかける相手
        target() {
          const t = target();
          return t ? { kind: t.kind, n: t.n, lane: t.lane, x: cx(t) } : null;
        },
        // テスト用：のぼりの間にいる、まだ声をかけていないグループ
        zone() {
          return groups.filter(inZone).map((g) => ({ kind: g.kind, n: g.n, lane: g.lane, x: cx(g), y: LANES[g.lane].feet - 12 }));
        },
        update(dt) {
          const inp = api.input;
          cool = Math.max(0, cool - dt);
          shout = Math.max(0, shout - dt);
          bump = Math.max(0, bump - dt);
          bowT = Math.max(0, bowT - dt);
          // 列をえらぶ
          if (inp.pressed('up')) { lane = 0; api.sfx('cursor'); }
          if (inp.pressed('down')) { lane = 1; api.sfx('cursor'); }
          // 声をかける（タップした人がのぼりの間にいれば、その人たちに）
          if (!done && cool <= 0) {
            const tap = inp.tap;
            if (tap) {
              const hitG = groups.find((g) => inZone(g) && tap.x >= g.x - 4 && tap.x <= g.x + g.w + 4 && tap.y >= LANES[g.lane].feet - 30 && tap.y <= LANES[g.lane].feet + 4);
              if (hitG) lane = hitG.lane;
              ask(hitG || target());
            } else if (inp.pressed('a')) ask(target());
          }
          // 人が出てくる
          for (let li = 0; li < 2; li++) {
            spawnT[li] -= dt;
            if (spawnT[li] <= 0) makeGroup(li);
          }
          // 人の動き
          for (let i = groups.length - 1; i >= 0; i--) {
            const g = groups[i];
            const L = LANES[g.lane];
            g.t += dt;
            if (g.say) g.sayT += dt;
            if (g.state === 'walk') {
              g.x += L.dir * L.speed * g.mul * dt;
              if (L.dir > 0 ? g.x > W + 4 : g.x + g.w < -4) groups.splice(i, 1);
            } else if (g.state === 'think') {
              if (g.t >= THINK) answer(g);
            } else if (g.state === 'join') {
              // 店のほうへ歩いて、消えていく
              const k = Math.max(0, g.t - 0.35);
              g.members.forEach((m, j) => {
                const tx = SHOP.x + j * 4 - (g.x + m.dx);
                const ty = SHOP.feet - (L.feet + m.dy);
                const sp = Math.min(1, k * 0.9);
                m.ox = tx * sp;
                m.oy = ty * sp;
              });
              g.alpha = 1 - Math.max(0, (g.t - 1.0) / 0.4);
              if (g.t > 1.4) groups.splice(i, 1);
            }
          }
          for (let i = pops.length - 1; i >= 0; i--) {
            pops[i].t += dt;
            if (pops[i].t > 1) pops.splice(i, 1);
          }
          if (done) {
            doneT += dt;
            confetti.forEach((c) => { c.y += c.vy * dt; c.x += c.vx * dt; if (c.y > H) c.y -= H; });
          }
        },
        timeup() {
          api.lose('時間切れ。\n' + count + '人どまり…\n来年こそは。');
        },
        draw(g) {
          drawSky(g);
          drawCampus(g);
          drawBunting(g);
          drawStreet(g);
          drawBooth(g);
          drawFlag(g, ZONE_L - 4, 'ホスト');
          drawFlag(g, ZONE_R - 2, '夕照寮');
          drawPeople(g);
          drawTarget(g);
          drawTalk(g);
          drawBoard(g);
          if (done) {
            confetti.forEach((c, i) => g.R(c.x, c.y, 2, (i + Math.floor(doneT * 8)) % 2 ? 2 : 1, c.c));
            if (doneT > 0.3) g.big('100人！', W / 2, 60, { col: P.pink, shade: P.rose, align: 'center' });
          }
        },
      };
    },
  });
})();
