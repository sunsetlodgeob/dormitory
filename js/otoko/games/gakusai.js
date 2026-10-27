/*
 * 11月 学祭「女子100人勧誘」 ― 寮のホストクラブの前で、通りかかる女子をさそう
 *  寮は毎年、学祭でホストクラブ「夕照」を出す。寮生がスーツでホストになり、中ではジュースとお菓子を出して、出し物をする。
 *  お酒は出さない、わりと健全なホストクラブ。男魂くんもスーツを着て（はちまきはそのまま）、お立ち台で呼びこみをする。
 *  左にホストクラブの入り口。前の通りを、奥は左から右へ、手前は右から左へ、人のグループが歩いていく。
 *
 *  ねらって、さそう：
 *   - 2 本ののぼりの間（とどく所）にいるグループだけ、えらべる。えらべる相手には白いかぎかっこが付く。
 *     ←→（↑↓ で奥・手前）で黄色いわくを動かし、A でさそう。スマホは人をタップするとえらび、もう一度タップ（か A）でさそう。
 *     勝手にはえらばない。何もえらんでいないときに A をおしても、声はだれにもとどかない。
 *     えらんだグループがのぼりの外へ行ってしまうと、わくは消える。下の帯に、いまの相手と気分が出る。
 *   - 女子のグループは、頭の上の吹き出しで気分がわかる。来てくれるかは気分しだい（少しだけ運）。
 *       ハート … 立ち止まって看板を見ている。いまだ（9 割）
 *       ♪     … ごきげん（ほかの店から出てきたところ）。わりと来る（5 割）
 *       …     … ふつう（3 割）
 *       スマホ … スマホを見ている（1 割）
 *       あせ   … いそいでいる。足がはやい（ほぼ来ない）
 *     「♪」と「…」のグループは、のぼりの間でいちどは立ち止まって看板を見る（ハート）。スマホは半分くらいが、とちゅうでしまって見る。
 *   - 来てくれたらグループ全員が数に入る（＋人数）。男子は来ても数えない。
 *     とりのおばちゃん（頭にニワトリ、赤い「−10」の札）は、さそうとだいたい来て −10 人。まわりの女子も逃げる。
 *   - ことわられると、男魂くんがしゅんとして、少しの間さそえない（あてずっぽうの連打は損）。
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
  const ZONE_L = 100, ZONE_R = 196; // のぼりの間（とどく所）。グループのまん中がここにあれば、えらべる
  const ZONE_C = (ZONE_L + ZONE_R) / 2;
  const ME_X = 80, ME_FEET = 140; // 男魂くんの立つ所（絵の左はしと足もと）。お立ち台（木の箱）に乗っている
  const CRATE_Y = 152; // お立ち台の下のはし
  const DOOR = { x0: 6, x1: 42, y0: 66, y1: 146 }; // ホストクラブの入り口
  const SHOP = { x: 12, feet: 146 }; // 店に入る人が向かう所（入り口）
  const LANES = [
    { feet: 166, dir: 1, speed: 34 }, // 奥の列：左から右へ
    { feet: 196, dir: -1, speed: 38 }, // 手前の列：右から左へ
  ];
  const BAR_Y = 209; // 下の帯（いまの相手）
  const STEP_X = 10; // グループの中の人と人の間
  const GAP = [6, 22]; // グループとグループの間（ドット）
  const MIN_GAP = 4; // 前のグループが立ち止まったら、ここまでつめて待つ
  const COOL = 0.35; // 声をかけたあと、次に声をかけられるまで（秒）
  const THINK = 0.35; // 声をかけてから、返事が来るまで（秒）
  const SULK = 0.6; // ことわられたあと、男魂くんがしゅんとしている間（さそえない）
  const EMPTY_COOL = 0.3; // だれもえらばずに叫んだあと
  const LOOK_T = 1.4; // 立ち止まって看板を見ている間（秒）
  const JOSHI_N = [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6]; // 女子のグループの人数
  // 女子のグループの気分（頭の上の吹き出し）と、来てくれる見こみ
  const MOODS = {
    love: { odds: 0.9, lv: 3, word: '看板を見てる！' },
    fun: { odds: 0.55, lv: 2, word: 'ごきげん' },
    none: { odds: 0.3, lv: 1, word: 'ふつう' },
    phone: { odds: 0.1, lv: 0, word: 'スマホ中' },
    hurry: { odds: 0.05, lv: 0, word: 'いそいでる' },
  };
  // 女子のグループのタイプ（ふだんの気分・のぼりの間で看板を見る確率・出やすさ）
  const TYPES = [
    { base: 'none', look: 1, w: 34 },
    { base: 'fun', look: 1, w: 26 },
    { base: 'phone', look: 0.5, w: 25 },
    { base: 'hurry', look: 0, w: 15 },
  ];
  const ODDS_OBA = 0.95; // おばちゃんは、だいたい来る
  const ODDS_DANSHI = 0.8; // 男子もわりと来る（数えない）
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
    howto: ['←→：相手をえらぶ　A：さそう', 'ハートが出たら、ねらい目', OBA_NAME + 'は−10人'],
    note: 'お酒は出さない。ジュースとお菓子。\n男子は数えない。',
    time: 45,
    timeout: 'lose',
    bgm: 'play',
    create(api) {
      const P = api.P, W = api.W, H = api.H;
      // しっぱいが続いたら、少しだけ来てくれやすくする
      const EASE = api.tries >= 4 ? 0.1 : api.tries >= 2 ? 0.05 : 0;

      let count = 0;
      let sel = null; // えらんでいるグループ（勝手にはえらばない）
      let curX = ZONE_C; // わくがいた所（←→ はここから動く）
      let cool = 0; // 次に声をかけられるまで
      let queued = null; // 待ち時間の終わりぎわに A をおしたら、終わってすぐさそう
      let sulk = 0; // しゅんとしている間
      let shout = 0; // 男魂くんが叫んでいる間
      let shoutMsg = '';
      let bump = 0, bumpCol = P.lgreen; // 数の板が弾む
      let bowT = 0; // 入り口のホストが、おじぎしている間
      let note = null; // 下の帯の一言 { str, col, t }
      let last = null; // さそった結果（数の板の下） { str, col, t }
      let spawned = 0, nextId = 1;
      let done = false, doneT = 0;
      // テスト用の数え
      const st = { tried: 0, joined: 0, spawned: 0, oba: 0, danshi: 0, refused: 0, empty: 0, girlsSeen: 0, girlsIn: 0, moods: {} };
      const groups = [];
      const pops = []; // 「+3」などの文字
      const confetti = [];
      const nextGap = [0, 0];

      // ── グループ ──
      function pickKind() {
        if (spawned < 4) return 'joshi'; // 最初は女子から
        const r = api.rnd();
        if (r < 0.08) return groups.some((o) => o.kind === 'oba') ? 'joshi' : 'oba'; // とりのおばちゃんは 1 人だけ（もう画面にいたら、女子に）
        if (r < 0.22) return 'danshi';
        return 'joshi';
      }
      function pickType() {
        const list = spawned < 4 ? TYPES.slice(0, 2) : TYPES; // 最初は、看板を見てくれるグループから
        let r = api.rnd(0, list.reduce((s, t) => s + t.w, 0));
        for (const t of list) { r -= t.w; if (r < 0) return t; }
        return list[0];
      }
      function makeGroup(li, x) {
        const L = LANES[li];
        const kind = pickKind();
        const tp = kind === 'joshi' ? pickType() : null;
        spawned++;
        st.spawned++;
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
        // 立ち止まって看板を見る所（のぼりの間の、入ってきた側の 1〜5 割あたり）
        const looks = kind === 'oba' || (tp && api.chance(tp.look));
        const f = api.rnd(0.1, 0.5);
        const lookAt = looks ? (L.dir > 0 ? ZONE_L + f * (ZONE_R - ZONE_L) : ZONE_R - f * (ZONE_R - ZONE_L)) : null;
        const base = tp ? tp.base : 'none';
        const g = {
          id: nextId++, lane: li, kind, n, members, w,
          x: x != null ? x : L.dir > 0 ? -w - 2 : W + 2,
          state: 'walk', t: 0, tried: false, say: null, sayT: 0, alpha: 1, moving: true,
          base, mood: kind === 'oba' ? 'love' : base, after: base === 'phone' ? 'none' : base,
          mul: base === 'hurry' ? 1.6 : kind === 'oba' ? 0.85 : 1,
          lookAt, look: 0, looked: false, lookT: kind === 'oba' ? 2.2 : LOOK_T + EASE * 4, seen: false, asked: null,
        };
        groups.push(g);
        nextGap[li] = api.rnd(GAP[0], GAP[1]);
        return g;
      }
      // 始まる前から、通りににぎわいを（先頭は、のぼりの間に入ったところ）
      (function prefill() {
        LANES.forEach((L, li) => {
          let edge = L.dir > 0 ? ZONE_L + 14 : ZONE_R - 14;
          for (let k = 0; k < 6; k++) {
            const g = makeGroup(li, 0);
            g.x = L.dir > 0 ? edge - g.w : edge;
            edge = L.dir > 0 ? g.x - nextGap[li] : g.x + g.w + nextGap[li];
            if (L.dir > 0 ? g.x + g.w < 0 : g.x > W) break;
          }
        });
      })();

      const cx = (g) => g.x + g.w / 2;
      const feetOf = (g) => LANES[g.lane].feet;
      const inZone = (g) => cx(g) >= ZONE_L && cx(g) <= ZONE_R;
      // えらべる相手：のぼりの間を歩いている（立ち止まっている）、まだ声をかけていないグループ
      const reachable = (g) => g.state === 'walk' && !g.tried && inZone(g);
      const cands = () => groups.filter(reachable).sort((a, b) => cx(a) - cx(b) || a.lane - b.lane);
      function label(g) {
        if (g.kind === 'oba') return OBA_NAME;
        return (g.kind === 'joshi' ? '女子' : '男子') + (g.n === 1 ? 'ひとり' : g.n + '人組');
      }
      // 見てわかる気分（女子だけ。おばちゃん・男子は 'oba'・'danshi'）
      const shown = (g) => (g.kind === 'joshi' ? g.mood : g.kind);
      function pop(x, y, str, col, big) {
        pops.push({ x, y, str, col, t: 0, big: !!big });
      }
      function addCount(d) {
        count = Math.max(0, count + d);
        bump = 0.3;
        bumpCol = d > 0 ? P.lgreen : P.red;
      }
      function say(str, col) { note = { str, col: col || P.white, t: 0.9 }; }
      function result(str, col) { last = { str, col, t: 1.8 }; }

      // ── えらぶ ──
      function select(g) {
        if (!g || g === sel) return;
        sel = g;
        curX = cx(g);
        queued = null;
        note = null;
        api.sfx('cursor');
      }
      function moveSel(k) {
        const list = cands();
        if (!list.length) { say('とどく所に、だれもいない', P.lgray); api.sfx('ng'); return; }
        const ref = sel ? cx(sel) : curX;
        let g = null;
        if (k === 'left' || k === 'right') {
          const i = sel ? list.indexOf(sel) : -1;
          if (i >= 0) g = list[(i + (k === 'right' ? 1 : -1) + list.length) % list.length];
          else if (k === 'right') g = list.find((o) => cx(o) >= ref) || list[0];
          else g = list.slice().reverse().find((o) => cx(o) <= ref) || list[list.length - 1];
        } else {
          const li = k === 'up' ? 0 : 1;
          if (sel && sel.lane === li) return;
          const same = list.filter((o) => o.lane === li).sort((a, b) => Math.abs(cx(a) - ref) - Math.abs(cx(b) - ref));
          if (!same.length) { say(li ? '手前の列には、だれもいない' : '奥の列には、だれもいない', P.lgray); api.sfx('ng'); return; }
          g = same[0];
        }
        select(g);
      }
      // タップした所にいるグループ（とどく所の人を先に。重なっていたら手前の列）
      function groupAt(p) {
        const hits = groups.filter((g) => g.state !== 'join' && p.x >= g.x - 3 && p.x <= g.x + g.w + 3 && p.y >= feetOf(g) - 40 && p.y <= feetOf(g) + 5);
        hits.sort((a, b) => reachable(b) - reachable(a) || b.lane - a.lane);
        return hits[0] || null;
      }

      // ── さそう ──
      function tryInvite() {
        if (done) return;
        if (cool <= 0) invite();
        else if (cool < 0.15 && sel) queued = sel; // 少し早くおしても、むだにしない
      }
      function invite() {
        shout = 0.45;
        shoutMsg = api.pick(CALL);
        queued = null;
        if (!sel) {
          cool = EMPTY_COOL;
          st.empty++;
          say('だれも えらんでいない！', P.lyellow);
          api.sfx('ng');
          return;
        }
        const g = sel;
        sel = null;
        curX = cx(g);
        g.tried = true;
        g.state = 'think';
        g.t = 0;
        g.asked = shown(g);
        g.look = 0;
        cool = COOL;
        st.tried++;
        api.sfx('select');
      }
      function answer(g) {
        const top = feetOf(g) - 44; // 「+3」などは、頭の上に出す
        const m = st.moods[g.asked] || (st.moods[g.asked] = { asked: 0, ok: 0 });
        m.asked++;
        if (g.kind === 'joshi') {
          if (api.chance(Math.min(0.97, MOODS[g.asked].odds + EASE))) {
            m.ok++;
            g.state = 'join';
            g.t = 0;
            g.say = api.pick(YES_MSG);
            bowT = 0.9;
            addCount(g.n);
            st.joined++;
            st.girlsIn += g.n;
            pop(cx(g), top, '+' + g.n, P.lpink);
            result('+' + g.n + ' ' + label(g), P.rose);
            api.sfx('coin');
            if (count >= NEED && !done) finish();
          } else {
            g.state = 'walk';
            g.mul = 1.8; // 足早に去っていく
            g.mood = 'none';
            g.say = api.pick(NO_MSG);
            sulk = SULK;
            cool = Math.max(cool, SULK);
            st.refused++;
            result('ことわられた…', P.dgray);
            api.sfx('cancel');
          }
        } else if (g.kind === 'oba') {
          if (api.chance(ODDS_OBA)) {
            m.ok++;
            g.state = 'join';
            g.t = 0;
            g.say = 'あら〜、\nいい男！';
            bowT = 0.9;
            addCount(-OBA_MINUS);
            st.oba++;
            pop(cx(g), top, '−' + OBA_MINUS, P.red, true);
            result('−' + OBA_MINUS + ' おばちゃん', P.red);
            api.sfx('damage');
            api.shake(3, 0.3);
            // まわりの女子が、ひいていく
            groups.forEach((o) => {
              if (o !== g && o.kind === 'joshi' && o.state === 'walk' && !o.tried && Math.abs(cx(o) - cx(g)) < 70) {
                o.tried = true; o.mul = 1.6; o.look = 0; o.say = o.say || 'ひっ'; o.sayT = 0;
                if (o === sel) sel = null;
              }
            });
          } else {
            g.state = 'walk';
            g.say = 'いそがしいのよ';
            api.sfx('ok');
          }
        } else if (api.chance(ODDS_DANSHI)) {
          // 男子は来てくれるが、数えない
          m.ok++;
          g.state = 'join';
          g.t = 0;
          g.say = api.pick(DAN_MSG);
          bowT = 0.9;
          st.danshi++;
          pop(cx(g), top, 'ノーカン', P.lgray);
          result('男子は ノーカン', P.dgray);
          api.sfx('ng');
        } else {
          g.state = 'walk';
          g.mul = 1.4;
          g.say = 'いや、いいっす';
          result('男子に ことわられた', P.dgray);
          api.sfx('cancel');
        }
        g.sayT = 0;
      }
      function finish() {
        done = true;
        sel = null;
        api.sfx('fanfare');
        api.win('100人達成！\n…でも指名は、\nぜんぶ先輩Aだった。', { wait: 1.8 });
        for (let i = 0; i < 60; i++) confetti.push({ x: api.rnd(0, W), y: api.rnd(-80, 12), vy: api.rnd(30, 70), vx: api.rnd(-12, 12), c: api.pick([P.red, P.yellow, P.lgreen, P.sky, P.pink, P.white]) });
      }

      // ── 動き ──
      function walkLanes(dt) {
        LANES.forEach((L, li) => {
          // 前のグループから順に。立ち止まった人がいたら、後ろはつめて待つ
          const list = groups.filter((g) => g.lane === li && g.state !== 'join').sort((a, b) => (L.dir > 0 ? b.x - a.x : a.x - b.x));
          let prev = null;
          for (const g of list) {
            const v = g.state === 'walk' && g.look <= 0 ? L.speed * g.mul : 0;
            let nx = g.x + L.dir * v * dt;
            if (prev) nx = L.dir > 0 ? Math.min(nx, prev.x - MIN_GAP - g.w) : Math.max(nx, prev.x + prev.w + MIN_GAP);
            if (L.dir > 0 ? nx < g.x : nx > g.x) nx = g.x; // 後ろにはさがらない
            g.moving = Math.abs(nx - g.x) > 0.001;
            g.x = nx;
            prev = g;
          }
          // 入ってくる側があいたら、次のグループ
          let room = Infinity;
          list.forEach((g) => { room = Math.min(room, L.dir > 0 ? g.x : W - (g.x + g.w)); });
          if (room >= nextGap[li]) makeGroup(li);
        });
      }
      function moods(dt) {
        groups.forEach((g) => {
          if (g.state !== 'walk' || g.tried) return;
          if (!g.seen && g.kind === 'joshi' && inZone(g)) { g.seen = true; st.girlsSeen += g.n; }
          if (g.look > 0) {
            g.look -= dt;
            if (g.look <= 0) g.mood = g.kind === 'oba' ? 'love' : g.after;
            return;
          }
          if (!g.looked && g.lookAt != null && (LANES[g.lane].dir > 0 ? cx(g) >= g.lookAt : cx(g) <= g.lookAt)) {
            g.looked = true;
            g.look = g.lookT;
            g.mood = 'love';
          }
        });
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
      // 気分の絵（7×7 くらい。x はまん中、y は上のはし）
      function moodIcon(g, mood, x, y) {
        if (mood === 'love') heart(g, x - 2, y + 1, g.blink(4) ? P.red : P.rose);
        else if (mood === 'fun') {
          g.R(x + 1, y, 1, 6, P.violet);
          g.R(x + 2, y, 2, 1, P.violet);
          g.R(x + 3, y + 1, 1, 2, P.violet);
          g.R(x - 1, y + 5, 3, 2, P.violet);
        } else if (mood === 'none') {
          [-3, 0, 3].forEach((d) => g.R(x + d - 1, y + 4, 2, 2, P.gray));
        } else if (mood === 'phone') {
          g.R(x - 2, y, 5, 8, P.ink);
          g.R(x - 1, y + 1, 3, 5, P.sky);
          g.R(x, y + 7, 1, 1, P.gray);
        } else if (mood === 'hurry') {
          g.R(x, y, 1, 2, P.mblue);
          g.R(x - 1, y + 2, 3, 2, P.mblue);
          g.R(x - 2, y + 4, 5, 2, P.mblue);
          g.R(x - 1, y + 6, 3, 1, P.mblue);
          g.R(x - 1, y + 3, 1, 2, P.white);
        }
      }
      // 頭の上の、気分の吹き出し（x はまん中、y は下のはし）
      function moodBubble(g, mood, x, y) {
        const bx = Math.round(x) - 6, by = Math.round(y) - 13;
        const fill = mood === 'love' ? P.lpink : P.white;
        g.R(bx + 1, by, 11, 11, P.ink);
        g.R(bx, by + 1, 13, 9, P.ink);
        g.R(bx + 1, by + 1, 11, 9, fill);
        g.R(bx + 5, by + 11, 2, 2, P.ink); // しっぽ（考えごとの丸）
        moodIcon(g, mood, bx + 6, by + 2);
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
      // 小さい札（x はまん中、y は上のはし）
      function tag(g, str, x, y, fill, col) {
        const tw = g.measure(str, 12) + 6;
        const lx = Math.round(Math.max(2, Math.min(W - tw - 2, x - tw / 2)));
        g.R(lx, y, tw, 13, P.ink);
        g.R(lx + 1, y + 1, tw - 2, 11, fill);
        g.text(str, lx + tw / 2, y, { size: 12, col: col || P.white, align: 'center' });
        return { x: lx, w: tw };
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
        // 校舎のたれ幕「学祭」（のぼりと重ならない所に）
        const tx = 226;
        g.R(tx, 52, 18, 54, P.red);
        g.R(tx + 1, 53, 16, 52, P.rose);
        vtext(g, '学祭', tx + 9, 58, P.white);
        g.R(tx + 2, 84, 14, 1, P.lpink);
        vtext(g, '開催', tx + 9, 88, P.lyellow);
        // 木
        [[122, 104, 14], [250, 104, 10], [212, 108, 10]].forEach(([x, y, r]) => {
          g.R(x - 1, y, 3, 16, P.dbrown);
          g.disc(x, y - 4, r, P.dgreen);
          g.disc(x - 3, y - 7, r - 4, P.green);
          g.disc(x + 3, y - 10, r - 7, P.lgreen);
        });
        // 奥の模擬店（小さく）
        [[136, P.mblue], [166, P.green], [222, P.orange]].forEach(([x, col], i) => {
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
        // のぼりの間（とどく所）を、白い点線で
        const live = !api.ended;
        g.dither(ZONE_L, 152, ZONE_R - ZONE_L, BAR_Y - 152, P.cream, 0);
        for (let y = 152; y < BAR_Y; y += 6) {
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
      const headTop = (gr) => feetOf(gr) - 25 + Math.min(...gr.members.map((m) => m.dy));
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
          let frame = gr.moving ? Math.floor((api.time + m.ph) * (6 * gr.mul)) % 2 : 0;
          let hop = 0;
          if (gr.look > 0) {
            // 立ち止まって、看板（ホストクラブ）のほうを見る
            dir = gr.lane === 0 ? 'left' : 'up';
            frame = 0;
            hop = Math.floor((api.time + m.ph) * 4) % 2 ? -1 : 0;
          }
          if (gr.state === 'think') { dir = 'up'; frame = 0; }
          if (gr.state === 'join') {
            dir = m.ox < -2 ? 'left' : 'up';
            frame = Math.floor((api.time + m.ph) * 7) % 2;
          }
          const x = gr.x + m.dx + m.ox, y = it.feet - 24 + hop;
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
        // 男魂くん（スーツ。はちまきはそのまま）。ことわられると、しゅんとする
        const jump = shout > 0.25 ? -2 : 0;
        const y = ME_FEET - 24 + jump + (sulk > 0 ? 1 : 0);
        g.sprite(api.person('otokoHost', { dir: sulk > 0 ? 'down' : 'right', frame: shout > 0 ? 1 : 0 }), ME_X, y);
        if (sulk > 0) return;
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
      // 気分の吹き出しと、おばちゃんの「−10」（のぼりの間と、その少し手前の人だけ）
      function drawMoods(g) {
        groups.forEach((gr) => {
          if (gr.state !== 'walk' || gr.tried || gr === sel) return;
          const c = cx(gr);
          const ahead = LANES[gr.lane].dir > 0 ? c >= ZONE_L - 44 && c <= ZONE_R : c <= ZONE_R + 44 && c >= ZONE_L;
          if (!ahead) return;
          const y = headTop(gr) - 1;
          if (gr.kind === 'joshi') moodBubble(g, gr.mood, c, y - (gr.look > 0 && g.blink(3) ? 1 : 0));
          else if (gr.kind === 'oba') tag(g, '−10', c, y - 22, P.red);
        });
      }
      // かぎかっこ（えらべる相手は白くて細い、えらんだ相手は黄色くて太い）
      function corners(g, gr, col, th, len) {
        const x0 = Math.round(gr.x) - 3, x1 = Math.round(gr.x + gr.w) + 2;
        const y0 = headTop(gr) - 2, y1 = feetOf(gr) + 2;
        [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(([x, y, sx, sy]) => {
          g.R(sx > 0 ? x : x - len + 1, sy > 0 ? y : y - th + 1, len, th, col);
          g.R(sx > 0 ? x : x - th + 1, sy > 0 ? y : y - len + 1, th, len, col);
        });
      }
      function drawCursor(g) {
        if (api.ended) return;
        cands().forEach((gr) => { if (gr !== sel) corners(g, gr, P.white, 1, 3); });
        if (!sel) return;
        const oba = sel.kind === 'oba';
        const col = oba ? P.red : P.yellow;
        corners(g, sel, P.ink, 4, 7);
        corners(g, sel, col, 2, 6);
        // 頭の上に「▼」と名札（女子なら、気分の絵も）
        const c = cx(sel);
        const bob = g.blink(2) ? 1 : 0;
        const ay = headTop(sel) - 6 + bob;
        g.R(c - 4, ay, 9, 1, P.ink);
        g.R(c - 3, ay, 7, 1, col);
        g.R(c - 3, ay + 1, 7, 1, P.ink);
        g.R(c - 2, ay + 1, 5, 1, col);
        g.R(c - 2, ay + 2, 5, 1, P.ink);
        g.R(c - 1, ay + 2, 3, 1, col);
        g.R(c - 1, ay + 3, 3, 1, P.ink);
        g.R(c, ay + 3, 1, 1, col);
        const str = label(sel);
        const fill = oba ? P.dred : sel.kind === 'joshi' ? P.rose : P.dgray;
        const icon = sel.kind === 'joshi' ? 13 : 0;
        const tw = g.measure(str, 12) + 6 + icon;
        const lx = Math.round(Math.max(2, Math.min(W - tw - 2, c - tw / 2)));
        const ly = ay - 15;
        g.R(lx - 1, ly - 1, tw + 2, 15, col);
        g.R(lx, ly, tw, 13, P.ink);
        g.R(lx + 1, ly + 1, tw - 2, 11, fill);
        g.text(str, lx + (tw - icon) / 2, ly, { size: 12, col: P.white, align: 'center' });
        if (icon) {
          g.R(lx + tw - 13, ly + 1, 12, 11, sel.mood === 'love' ? P.lpink : P.white);
          moodIcon(g, sel.mood, lx + tw - 7, ly + 3);
        }
        if (oba && g.blink(4)) g.text('！', lx + tw + 1, ly - 1, { size: 12, col: P.red, outline: P.white });
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
        // いまさそった結果（板の下）
        if (last && last.t > 0) {
          const tw = g.measure(last.str, 12) + 8;
          const lx = bx + bw - tw;
          g.R(lx - 1, by + bh + 1, tw + 2, 15, P.ink);
          g.R(lx, by + bh + 2, tw, 13, last.col);
          g.text(last.str, lx + tw / 2, by + bh + 2, { size: 12, col: P.white, align: 'center' });
        }
      }
      // 下の帯：いまえらんでいる相手と、その気分
      function drawBar(g) {
        g.R(0, BAR_Y, W, H - BAR_Y, P.ink);
        g.R(0, BAR_Y, W, 1, P.yellow);
        const y = BAR_Y + 1;
        if (api.ended) {
          g.text(count + '人', W / 2, y, { size: 12, col: P.white, align: 'center' });
          return;
        }
        if (note && note.t > 0) {
          g.text(note.str, W / 2, y, { size: 12, col: note.col, align: 'center' });
          return;
        }
        if (sel) {
          const oba = sel.kind === 'oba';
          const nx = 6;
          const nw = g.text(label(sel), nx, y, { size: 12, col: oba ? P.red : sel.kind === 'joshi' ? P.lpink : P.lgray });
          let x = nx + nw + 8;
          if (oba) {
            if (g.blink(3)) g.text('−10人！ やめとけ', x, y, { size: 12, col: P.red });
          } else if (sel.kind === 'danshi') {
            g.text('男子は数に入らない', x, y, { size: 12, col: P.lgray });
          } else {
            const md = MOODS[sel.mood];
            g.R(x, y + 2, 13, 11, md.lv === 3 ? P.lpink : P.white);
            moodIcon(g, sel.mood, x + 6, y + 4);
            x += 17;
            g.text(md.word, x, y, { size: 12, col: md.lv >= 3 ? P.pink : md.lv === 2 ? P.lyellow : md.lv === 1 ? P.white : P.gray });
            // 脈あり度（ハート 3 つ）
            for (let i = 0; i < 3; i++) heart(g, W - 30 + i * 9, y + 4, i < md.lv ? P.rose : P.dgray);
          }
          return;
        }
        const n = cands().length;
        if (!n) {
          g.text('とどく所に、だれもいない', W / 2, y, { size: 12, col: P.gray, align: 'center' });
          return;
        }
        const touch = typeof document !== 'undefined' && document.body.classList.contains('otk-touch');
        const on = g.blink(2);
        g.text((touch ? 'タップか←→' : '←→') + 'で 相手をえらぶ', 6, y, { size: 12, col: on ? P.lyellow : P.white });
        g.text('とどく所に' + n + '組', W - 6, y, { size: 12, col: P.lgray, align: 'right' });
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
          if (g.blink(4)) g.text('？', cx(gr), headTop(gr) - 16, { size: 16, col: P.ink, outline: P.white, align: 'center' });
        });
        if (shout > 0) bubble(g, ME_X + 10, ME_FEET - 28, shoutMsg, { col: P.dred });
        else if (sulk > 0) g.text('しゅん…', ME_X + 8, ME_FEET - 40, { size: 12, col: P.mblue, outline: P.white, align: 'center' });
        pops.forEach((p) => {
          const y = p.y - Math.min(1, p.t * 2) * 14;
          if (p.big) g.big(p.str, p.x, y - 10, { size: 16, col: p.col, align: 'center' });
          else g.text(p.str, p.x, y, { size: 16, col: p.col, outline: P.ink, align: 'center' });
        });
      }

      // テスト用：グループの見えている中身
      const info = (g) => ({ id: g.id, kind: g.kind, n: g.n, lane: g.lane, mood: shown(g), x: cx(g), y: feetOf(g) - 12, sel: g === sel });

      return {
        get count() { return count; },
        get cool() { return cool; },
        get sulk() { return sulk; },
        get stats() { return JSON.parse(JSON.stringify(st)); },
        get shout() { return shout > 0 ? shoutMsg : null; }, // テスト用：いまの呼びこみ
        get note() { return note && note.t > 0 ? note.str : null; }, // テスト用：下の帯の一言
        get last() { return last && last.t > 0 ? last.str : null; }, // テスト用：さそった結果
        texts: { CLUB, CLUB_NAME, CALL, YES_MSG, NO_MSG, DAN_MSG }, // テスト用：看板とセリフ
        zone: [ZONE_L, ZONE_R],
        groups,
        // テスト用：いまえらんでいる相手（なければ null）と、えらべる相手（左から順）
        get sel() { return sel ? info(sel) : null; },
        cands() { return cands().map(info); },
        // テスト用：画面にいる、まだ声をかけていないグループ（のぼりの外も）
        walkers() { return groups.filter((g) => g.state === 'walk' && !g.tried).map((g) => Object.assign(info(g), { reach: reachable(g) })); },
        update(dt) {
          const inp = api.input;
          cool = Math.max(0, cool - dt);
          sulk = Math.max(0, sulk - dt);
          shout = Math.max(0, shout - dt);
          bump = Math.max(0, bump - dt);
          bowT = Math.max(0, bowT - dt);
          if (note) note.t -= dt;
          if (last) last.t -= dt;
          // 人が歩く・立ち止まる・気分が変わる
          walkLanes(dt);
          moods(dt);
          // えらんでいた相手が、とどく所から出ていった
          if (sel && !reachable(sel)) {
            curX = api.clamp(cx(sel), ZONE_L, ZONE_R);
            sel = null;
            queued = null;
            say('行っちゃった… ←→でえらびなおし', P.lgray);
          }
          if (!done) {
            // えらぶ
            ['left', 'right', 'up', 'down'].forEach((k) => { if (inp.pressed(k)) moveSel(k); });
            const tap = inp.tap;
            if (tap) {
              const g = groupAt(tap);
              if (g && reachable(g)) {
                if (g === sel) tryInvite();
                else select(g);
              } else if (g && g.state === 'walk' && !g.tried) {
                say('まだ とどかない（のぼりの間で）', P.lgray);
                api.sfx('ng');
              }
            }
            // さそう
            if (inp.pressed('a')) tryInvite();
            if (queued && cool <= 0) {
              if (queued === sel) invite();
              queued = null;
            }
          }
          // 返事・店に入る・去っていく
          for (let i = groups.length - 1; i >= 0; i--) {
            const g = groups[i];
            const L = LANES[g.lane];
            g.t += dt;
            if (g.say) g.sayT += dt;
            if (g.state === 'walk') {
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
          drawMoods(g);
          drawCursor(g);
          drawTalk(g);
          drawBoard(g);
          drawBar(g);
          if (done) {
            confetti.forEach((c, i) => g.R(c.x, c.y, 2, (i + Math.floor(doneT * 8)) % 2 ? 2 : 1, c.c));
            if (doneT > 0.3) g.big('100人！', W / 2, 60, { col: P.pink, shade: P.rose, align: 'center' });
          }
        },
      };
    },
  });
})();
