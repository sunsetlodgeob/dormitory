/*
 * 7月「同期Bをさがせ」 ― 泥酔して消えた同期Bを、終電までに電車でさがす
 *  いまは 23:30、終電は 0:40（70 分）。となりの駅へ乗るのは 5 分、駅をさがす（降りて見てまわる）のは 10 分。
 *  制限時間はこの時計だけ（本物の秒数の制限はない）。時計が 0:40 になったら終電がなくなって、しっぱい。
 *  同期Bは、金沢八景から上り（横浜方面）か下り（浦賀方面）に 2〜5 駅のどこか。どちらかはランダム。
 *  同期Bは乗ったまま 1 枚ずつ脱いで、駅のホームにすてていった（くつ → くつした → シャツ → ズボン → パンツ一丁）。
 *  だから、さがした駅の落とし物で、あと何駅かがわかる：くつ＝あと 4 駅、くつした＝3 駅、シャツ＝2 駅、ズボン＝つぎの駅。
 *  同期Bの駅では、待合室のベンチで、パンツ一丁で寝ている。反対側の駅と、同期Bより先の駅には何もない。
 *  かしこくやれば（となりの駅をさがして、落とし物を見て、まっすぐ乗る）、いちばん運が悪くても 65 分で見つかる（5 分あまる）。
 *  さがすのは高いので、手がかりを見ずに 1 駅ずつ全部さがすと、半分くらいは終電に間に合わない。はしまで乗っても見つからない。
 */
(function () {
  'use strict';

  // ── 路線（おもな駅だけ。左が上り＝横浜方面、右が下り＝浦賀方面） ─────────
  const STATIONS = ['横浜', '上大岡', '杉田', '能見台', '金沢文庫', '金沢八景', '追浜', '汐入', '横須賀中央', '堀ノ内', '浦賀'];
  const HOME = 5; // 金沢八景
  const DISTS = [2, 3, 4, 5]; // 同期Bは、八景から何駅目にいるかもしれないか
  const STEP_MIN = 5; // 時計の目もり（5 分）
  const RIDE_MIN = 5; // となりの駅へ乗ると、5 分
  const LOOK_MIN = 10; // 駅をさがすと、10 分（降りて、ホームと待合室を見てまわる）
  const START = 23 * 60 + 30; // 23:30
  const LAST = 24 * 60 + 40; // 0:40（終電）
  const RIDE = 1.1; // 1 駅ぶん乗るアニメーション（秒）。その間に時計が 5 分すすむ
  const LOOK = 1.4; // さがすアニメーション（秒）。その間に時計が 10 分すすむ

  // 画面のわりふり
  const SX = (i) => 18 + i * 22; // 路線図の駅の x
  const STAT_Y = 12, MAP_Y = 34, LINE_Y = 50, SCENE_Y = 119; // 時計の帯・路線図・線・駅の場面の上はし
  const PLAT_Y = 188; // ホームの上面
  const LEG_Y = 208; // 下の「脱いだ順」の帯
  const ROOM = { x: 76, y: 151, w: 112, h: 37 }; // 待合室
  const ME_X = 36, ME_Y = 152;
  const EKIIN_X = 192; // 八景の駅員さん
  const TAP_L = 72, TAP_R = 190; // 駅の場面のタップ：これより左は上り、右は下り、間（待合室）はさがす

  // 落とし物（八景に近い方から、くつ → くつした → シャツ → ズボン の順に脱いでいった）。絵は 10×8 ドット
  const ITEMS = {
    shoes: {
      name: 'くつ', msg: 'くつだ！ まだ4駅も先…', left: '4駅',
      pal: { b: '#b05c1c', h: '#e8a060', s: '#fcfcfc', l: '#5c2c0c' },
      rows: ['.bb.......', '.bhb......', '.bblb.....', '.bbblbb...', '.bbbbbhbb.', '.bbbbbbbbb', 'ssssssssss', '..........'],
    },
    socks: {
      name: 'くつした', msg: 'くつしただ！ あと3駅！', left: '3駅',
      pal: { r: '#f83800', w: '#d8d8d8', g: '#fcfcfc' },
      rows: ['..rrrr....', '..wwww....', '..rrrr....', '..wwww....', '..wwww....', '..wwwwwww.', '..wwwwgwww', '...wwwwww.'],
    },
    shirt: {
      name: 'シャツ', msg: 'シャツだ！ あと2駅！', left: '2駅',
      pal: { s: '#a4e4fc', c: '#fcfcfc', w: '#3cbcfc' },
      rows: ['..ss..ss..', '.ssscccss.', 'ssssssssss', 'ssssssssss', '..sswsss..', '..ssssss..', '..sswsss..', '..ssssss..'],
    },
    pants: {
      name: 'ズボン', msg: 'ズボンだ！ つぎの駅だ！', left: 'つぎ',
      pal: { k: '#283048', b: '#3050a0', l: '#5878c8' },
      rows: ['.kkkkkkkk.', '.bbbbbbbb.', '.blbbbbbb.', '.bbb..bbb.', '.blb..bbb.', '.bbb..blb.', '.bbb..bbb.', '.bbb..bbb.'],
    },
    // 凡例のさいご（同期B本人）：水玉のパンツ
    trunks: {
      name: 'パンツ一丁',
      pal: { r: '#f83800', w: '#fcfcfc', d: '#a81000' },
      rows: ['..........', 'dddddddddd', 'rrwrrrrwrr', 'rrrrrwrrrr', 'rwrrrrrrwr', 'rrrr..rrrr', 'rrw....rrr', '..........'],
    },
  };
  const ORDER = ['shoes', 'socks', 'shirt', 'pants', 'trunks'];
  const NOTHING = ['何もない。ハトがいるだけ。', '何もない。自販機がまぶしい。', '何もない。風がぬるい。', '何もない。セミが鳴いている。', '何もない。ここじゃない。'];

  // その駅に何があるか。side は同期Bの向き（上り -1・下り +1）、dist は八景から何駅目か
  //  'home'（八景）・'none'（何もない）・'shoes' 'socks' 'shirt' 'pants'（落とし物）・'b'（同期B）
  function what(i, side, dist) {
    if (i === HOME) return 'home';
    const k = (i - HOME) * side; // 同期Bのほうへ何駅目か（反対側はマイナス）
    if (k < 1 || k > dist) return 'none';
    if (k === dist) return 'b';
    const r = dist - k; // 同期Bまで、あと何駅（1〜4）
    return r >= 4 ? 'shoes' : r === 3 ? 'socks' : r === 2 ? 'shirt' : 'pants';
  }
  const fmt = (min) => (Math.floor(min / 60) % 24) + ':' + String(min % 60).padStart(2, '0');

  // ── 絵（はじめて使うときに作って、使い回す） ─────────────────────
  const INK = OTK.P.ink;
  let ART = null;
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  // まわりを 1 ドットの線でふちどる
  function outline(c) {
    const x2 = c.getContext('2d');
    const w = c.width, h = c.height;
    const d = x2.getImageData(0, 0, w, h).data;
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
    x2.fillStyle = INK;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) x2.fillRect(x, y, 1, 1);
    return c;
  }
  function icon(item) {
    const c = canvas(12, 10);
    const x2 = c.getContext('2d');
    item.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = item.pal[row[x]];
        if (!col) continue;
        x2.fillStyle = col;
        x2.fillRect(x + 1, y + 1, 1, 1);
      }
    });
    return outline(c);
  }
  // ベンチで寝ている人（頭が左、あお向け）。kind：'b'（同期B：パンツ一丁）か 'oji'（知らないおじさん：背広）
  function sleeper(P, kind) {
    const c = canvas(36, 18);
    const x2 = c.getContext('2d');
    const p = (x, y, w, h, col) => { x2.fillStyle = col; x2.fillRect(x + 1, y + 1, w, h); };
    const oji = kind === 'oji';
    const skin = oji ? '#f0b48c' : P.skin, shade = oji ? '#c88c64' : P.skinS;
    const hair = oji ? '#a8a8a8' : '#5c3418';
    // 頭（顔は上を向いている。左が後頭部）
    p(1, 2, 8, 8, skin);
    p(2, 1, 4, 1, skin);
    p(5, 0, 1, 1, skin); // 鼻
    p(0, 3, 3, 7, hair);
    p(1, 9, 6, 1, hair);
    if (oji) p(1, 1, 2, 2, hair);
    else { p(1, 1, 3, 2, hair); p(3, 0, 1, 1, hair); }
    p(3, 4, 2, 1, INK); // 目（とじている）
    p(5, 5, 1, 1, oji ? '#e07070' : P.rose); // 赤い顔
    p(7, 2, 2, 2, '#701010'); // 口（あいている）
    // 首
    p(9, 5, 1, 4, shade);
    if (oji) {
      // 背広・ワイシャツ・ネクタイ・革ぐつ
      p(10, 4, 10, 6, '#4c4c5c');
      p(10, 4, 3, 2, P.white);
      p(11, 4, 1, 5, P.red);
      p(20, 5, 12, 5, '#3c3c4c');
      p(26, 4, 3, 1, '#3c3c4c');
      p(32, 2, 2, 8, INK);
      p(11, 10, 2, 5, '#4c4c5c');
      p(11, 15, 3, 1, skin);
    } else {
      // パンツ一丁（はだし）。水玉のトランクス
      p(10, 4, 10, 6, skin);
      p(13, 3, 6, 1, skin); // おなか
      p(15, 5, 1, 1, shade); // へそ
      p(20, 4, 5, 6, P.red);
      p(21, 5, 1, 1, P.white); p(23, 6, 1, 1, P.white); p(21, 8, 1, 1, P.white); p(24, 8, 1, 1, P.white);
      p(25, 5, 7, 5, skin);
      p(26, 4, 3, 1, skin); // ひざ
      p(32, 2, 2, 8, skin); // 足のうら
      p(32, 3, 1, 6, shade);
      p(11, 10, 2, 5, skin); // ベンチからたれた腕
      p(11, 15, 3, 1, skin);
    }
    return outline(c);
  }
  function buildArt(P) {
    ART = { icon: {}, b: sleeper(P, 'b'), oji: sleeper(P, 'oji') };
    Object.keys(ITEMS).forEach((id) => { ART.icon[id] = icon(ITEMS[id]); });
  }

  OTK.register({
    id: 'deisui',
    order: 4,
    month: 7,
    event: '',
    title: '同期Bをさがせ',
    goal: '終電までに\n同期Bをさがせ！',
    howto: ['←→：となりの駅へ（5分）', 'A：駅をさがす（10分）', '服で、あと何駅かわかる'],
    note: 'くつ＝あと4駅・くつした＝3駅・\nシャツ＝2駅・ズボン＝つぎの駅。',
    time: null, // 時間の制限は、ゲームの中の時計（終電まで）だけ
    timeout: 'lose',
    bgm: 'play',
    create(api) {
      const P = api.P, W = api.W, H = api.H;
      if (!ART) buildArt(P);

      // どこにいるか：上り（-1）か下り（+1）、八景から何駅目か
      const side = api.chance(0.5) ? -1 : 1;
      const dist = api.pick([2, 3, 4, 4, 5, 5]);
      const bAt = HOME + side * dist;
      const at = (i) => what(i, side, dist);
      // 何もない駅の待合室で、知らないおじさんが寝ていることがある（ただのにぎやかし）
      const oji = {};
      STATIONS.forEach((s, i) => { if (at(i) === 'none' && api.chance(0.35)) oji[i] = true; });
      const flavor = {};
      STATIONS.forEach((s, i) => { flavor[i] = api.pick(NOTHING); });
      const start = api.tries >= 1 ? START - STEP_MIN : START; // しっぱいしたら、5 分おまけ

      const st = {
        cur: HOME, from: HOME, to: HOME, dir: 1,
        clock: start, // いまの時刻（分。24:00 をこえても数えつづける）
        clock0: start, // うごきはじめの時刻
        cost: 0, // いまのうごきに、何分かかるか（乗る 5・さがす 10）
        mode: 'idle', // idle（操作を待つ）・ride（電車）・look（さがしている）・found（見つけた）・over（終電がなくなった）
        t: 0,
        searched: { [HOME]: 'home' }, // 駅 → 'home' | 'none' | 'socks' | 'shirt' | 'pants' | 'b'
        opened: {}, // 待合室をあけた駅 → あけた時刻
        clues: [], // 拾った落とし物
        actions: 0, // うごいた回数
        msg: '', msgT: 0, msgName: '', queue: [],
        pop: null, // いま見つけた落とし物（ホームに少し出しておく）
        plus: -1, // 「+5分」「+10分」を出してからの秒数
        cand: null, // 同期Bがいるかもしれない駅（わかったことから）
      };
      // はじめに、八景の駅員さんがひとこと
      st.queue = [
        { name: '駅員', msg: '脱ぎながら乗ってった子？', sec: 2.4 },
        { name: '駅員', msg: '上りか下りかは、\nわからないねえ。', sec: 3.2 },
      ];

      function say(msg, sec, name) {
        st.msg = msg;
        st.msgT = sec || 2.4;
        st.msgName = name || '';
      }
      function quiet() {
        st.msgT = 0;
        st.queue = [];
      }
      // わかったことから、同期Bがいるかもしれない駅をしぼる（上り・下り × 2〜5 駅の 8 とおりを、さがした駅とくらべる）
      function narrow() {
        const keys = Object.keys(st.searched).map(Number);
        const set = new Set();
        let n = 0;
        for (const s of [-1, 1]) {
          for (const d of DISTS) {
            if (keys.every((i) => what(i, s, d) === st.searched[i])) { set.add(HOME + s * d); n++; }
          }
        }
        st.cand = n < DISTS.length * 2 ? [...set].sort((a, b) => a - b) : null;
      }
      function begin(mode) {
        st.mode = mode;
        st.t = 0;
        st.clock0 = st.clock;
        st.cost = mode === 'ride' ? RIDE_MIN : LOOK_MIN;
        st.actions++;
        st.plus = 0;
        st.pop = null;
        quiet();
      }
      function move(d) {
        const to = st.cur + d;
        if (to < 0 || to >= STATIONS.length) {
          say('この先には行かない。', 1.4);
          api.sfx('cancel');
          return;
        }
        st.from = st.cur;
        st.to = to;
        st.dir = d;
        begin('ride');
        api.sfx('step');
      }
      function search() {
        if (st.cur === HOME) {
          say('八景には、いないよ。', 1.8, '駅員');
          api.sfx('cancel');
          return;
        }
        if (st.searched[st.cur]) {
          say('ここはもうさがした。', 1.4);
          api.sfx('cancel');
          return;
        }
        begin('look');
        api.sfx('select');
      }
      // 0:40 になった。終電がなくなって、しっぱい（さがしている途中でも）
      function over() {
        st.clock = LAST;
        st.mode = 'over';
        st.t = 0;
        st.pop = null;
        say('終電がなくなった…', 9);
        api.sfx('buzzer');
        api.lose('終電がなくなった…\n同期Bは見つからず、\n歩いて帰った。', { wait: 1.6 });
      }
      // 1 回うごきおわったら、時計をきっちりすすめて、終電かどうかを見る
      function tick() {
        st.clock = st.clock0 + st.cost;
        if (st.clock < LAST) return false;
        over();
        return true;
      }
      function lookDone() {
        const i = st.cur;
        const res = at(i);
        st.searched[i] = res;
        st.opened[i] = api.time;
        st.mode = 'idle';
        narrow();
        if (res === 'b') {
          st.clock = st.clock0 + st.cost;
          st.mode = 'found';
          st.t = 0;
          api.sfx('power');
          api.win(st.clock >= LAST ? '同期Bを見つけた！\n終電に、ぎりぎり\n間に合った！' : '同期Bを見つけた！\nパンツ一丁で寝ていた。\n終電で、つれて帰った。', { wait: 1.8 });
          return;
        }
        if (ITEMS[res]) {
          st.clues.push(res);
          st.pop = { id: res, at: i, t: 0 };
          say(ITEMS[res].msg);
          api.sfx('coin');
        } else {
          // となりの駅に何もなければ、反対側（同期Bは 2 駅目より先なので、となりの駅には必ず落とし物がある）
          const near = Math.abs(i - HOME) === 1;
          if (near) say(oji[i] ? '知らないおじさんだ。…反対側か！' : '何もない。…反対側か！', 2.8);
          else say(oji[i] ? '知らないおじさんだった。' : flavor[i]);
          api.sfx('cancel');
        }
        tick();
      }
      function arrive() {
        st.cur = st.to;
        st.mode = 'idle';
        st.t = 0;
        api.sfx('cursor');
        tick();
      }

      // ── 描く ──
      function drawStatus(g) {
        g.R(0, STAT_Y, W, MAP_Y - STAT_Y, P.black);
        const left = LAST - st.clock;
        const warn = left <= 10;
        // 駅の時計（LED）
        g.R(2, 13, 64, 20, P.xdgray);
        g.R(3, 14, 62, 18, '#200800');
        const col = st.mode === 'over' ? P.red : warn ? (g.blink(2) ? P.red : P.dred) : P.lorange;
        g.num(fmt(st.clock).padStart(5, ' '), 5, 16, { col, scale: 3 });
        // 終電と、のこり
        let x = 72;
        x += g.text('終電', x, 12, { size: 12, col: P.lgray });
        x += g.text(fmt(LAST), x + 4, 12, { size: 12, col: P.white }) + 4;
        if (st.plus >= 0 && st.plus < 0.9) g.text('+' + st.cost + '分', x + 12, 12 - Math.round((st.plus / 0.9) * 3), { size: 12, col: P.yellow });
        const rx = W - 4;
        const w2 = g.text('分', rx, 12, { size: 12, col: P.lgray, align: 'right' });
        const w1 = g.text(String(Math.max(0, left)), rx - w2 - 1, 12, { size: 12, col: warn ? P.red : P.yellow, align: 'right' });
        g.text('あと', rx - w2 - w1 - 3, 12, { size: 12, col: P.lgray, align: 'right' });
        // 5 分ずつの目もり（のこりの分だけ色がつく。うごいている間は、使うぶんが点滅しながら減る）
        const n = Math.round((LAST - start) / STEP_MIN);
        const gap = 1, span = (W - 4 - 72 + gap) / n; // 目もり 1 つぶんの幅（すき間こみ）
        const busy = st.mode === 'ride' || st.mode === 'look';
        const rest0 = (LAST - (busy ? st.clock0 : st.clock)) / STEP_MIN; // うごく前の、のこり（目もりの数）
        const rest = Math.max(0, (LAST - st.clock) / STEP_MIN); // いまの、のこり
        const after = busy ? Math.max(0, rest0 - st.cost / STEP_MIN) : rest0; // うごきおわったときの、のこり
        const fill = rest0 <= 2 ? P.red : rest0 <= 4 ? P.yellow : P.lgreen;
        for (let k = 0; k < n; k++) {
          const sx = 72 + Math.round(k * span), sw = 72 + Math.round((k + 1) * span) - gap - sx;
          g.R(sx, 27, sw, 5, P.xdgray);
          const part = Math.max(0, Math.min(1, rest - k)); // この目もりの、のこっている割合
          if (part <= 0) continue;
          g.R(sx, 27, Math.round(sw * part), 5, busy && k >= Math.floor(after) && g.blink(4) ? P.white : fill);
        }
      }
      function drawMap(g) {
        g.R(0, MAP_Y, W, SCENE_Y - MAP_Y, P.white);
        g.R(0, SCENE_Y - 1, W, 1, P.dgray);
        g.R(SX(0), LINE_Y - 1, SX(STATIONS.length - 1) - SX(0), 3, P.red);
        const riding = st.mode === 'ride';
        const here = riding ? st.to : st.cur;
        STATIONS.forEach((name, i) => {
          const x = SX(i);
          const isHere = i === here;
          if (isHere) g.R(x - 7, LINE_Y + 5, 14, SCENE_Y - LINE_Y - 7, riding ? P.dgray : P.red);
          const s = st.searched[i];
          const col = isHere ? P.white : s && s !== 'home' ? P.gray : P.ink;
          [...name].forEach((ch, k) => g.text(ch, x, LINE_Y + 6 + k * 12, { size: 12, col, align: 'center' }));
          // 駅の丸（八景は乗りかえの駅なので大きく）
          if (i === HOME) {
            g.disc(x, LINE_Y, 4, P.ink);
            g.disc(x, LINE_Y, 3, P.white);
            g.R(x - 1, LINE_Y - 1, 3, 3, P.ink);
          } else {
            g.disc(x, LINE_Y, 3, P.ink);
            g.disc(x, LINE_Y, 2, P.white);
          }
          // さがした印（落とし物の絵か、×）と、同期Bがいるかもしれない駅（？）
          const iy = MAP_Y + 2;
          if (ITEMS[s]) g.sprite(ART.icon[s], x - 6, iy);
          else if (s === 'none') {
            g.line(x - 3, iy + 2, x + 3, iy + 8, P.gray);
            g.line(x + 3, iy + 2, x - 3, iy + 8, P.gray);
          } else if (s === 'b') {
            g.ring(x, LINE_Y, 6, P.red);
            g.ring(x, LINE_Y, 7, P.red);
          } else if (!s && st.cand && st.cand.includes(i)) {
            const one = st.cand.length === 1;
            if (!one || g.blink(2)) g.text(one ? '！' : '？', x, iy - 1, { size: 12, col: one ? P.red : P.rose, align: 'center' });
          }
        });
        if (riding) {
          // 走っている電車
          const k = Math.min(1, st.t / RIDE);
          const x = Math.round(api.lerp(SX(st.from), SX(st.to), k));
          g.R(x - 7, LINE_Y - 4, 15, 8, INK);
          g.R(x - 6, LINE_Y - 3, 13, 6, P.red);
          g.R(x - 5, LINE_Y - 2, 11, 2, P.lyellow);
          g.R(x - 6, LINE_Y + 1, 13, 1, P.white);
        } else if (g.blink(2) && st.mode === 'idle') {
          g.ring(SX(st.cur), LINE_Y, 6, P.mblue);
        }
      }
      // 下の帯：脱いだ順と、あと何駅か
      function drawLegend(g) {
        g.R(0, LEG_Y, W, H - LEG_Y, P.black);
        g.R(0, LEG_Y, W, 1, P.xdgray);
        let x = 3;
        const y = LEG_Y + 2;
        x += g.text('脱いだ順', x, y, { size: 12, col: P.gray }) + 4;
        ORDER.forEach((id, k) => {
          if (k) x += g.text('›', x, y, { size: 12, col: P.dgray }) + 2;
          g.sprite(ART.icon[id], x, y + 2);
          x += 13;
          const lab = ITEMS[id].left;
          if (lab) x += g.text(lab, x, y, { size: 12, col: P.lyellow }) + 3;
        });
      }
      function drawSky(g) {
        g.R(0, SCENE_Y, W, PLAT_Y - SCENE_Y, P.night);
        for (let i = 0; i < 14; i++) {
          const sx = (i * 73 + 11) % W, sy = SCENE_Y + 8 + ((i * 29) % 40);
          if ((i + Math.floor(api.time * 1.5)) % 5) g.R(sx, sy, 1, 1, i % 3 ? P.gray : P.lyellow);
        }
      }
      function drawCity(g, off, base) {
        for (let k = 0; k < 9; k++) {
          const bw = 22 + ((k * 7) % 12), bh = 18 + ((k * 13) % 26);
          const bx = ((((k * 34 - off) % 306) + 306) % 306) - 26;
          g.R(bx, base - bh, bw, bh, P.navy);
          for (let wy = base - bh + 4; wy < base - 4; wy += 6)
            for (let wx = bx + 3; wx < bx + bw - 3; wx += 5) if (((wx * 7 + wy * 3 + k) % 5) === 0) g.R(wx, wy, 2, 2, P.lyellow);
        }
      }
      // 待合室（すりガラスで、中は見えない。さがすと戸があく）
      function drawRoom(g, i) {
        const { x, y, w, h } = ROOM;
        const t0 = st.opened[i];
        const open = i === HOME ? 1 : t0 != null ? Math.min(1, (api.time - t0) / 0.35) : 0;
        // 屋根とわく
        g.R(x - 3, y - 4, w + 6, 3, P.xdgray);
        g.R(x - 3, y - 4, w + 6, 1, P.dgray);
        g.R(x, y - 1, w, h + 1, INK);
        // 中（明かり・ベンチ・寝ている人）
        g.R(x + 2, y + 1, w - 4, h - 1, '#2c3450');
        g.R(x + w / 2 - 12, y + 1, 24, 2, P.lyellow);
        g.dither(x + w / 2 - 16, y + 3, 32, 2, P.lyellow, 0);
        const seat = y + 24;
        g.R(x + 10, seat, w - 20, 3, P.tan);
        g.R(x + 10, seat + 3, w - 20, 1, P.brown);
        g.R(x + 14, seat + 4, 2, y + h - seat - 4, P.dgray);
        g.R(x + w - 16, seat + 4, 2, y + h - seat - 4, P.dgray);
        const who = st.searched[i] === 'b' ? 'b' : oji[i] && open > 0 ? 'oji' : null;
        if (who) {
          g.sprite(who === 'b' ? ART.b : ART.oji, x + 20, seat - 22, { scale: 2 });
          if (open >= 1) {
            // 「zZ」は、顔と駅名標にかからないように、胸の上を横へ流れていく
            const k = (api.time * 0.8) % 1, k2 = (k + 0.5) % 1;
            g.text('z', x + 44 + k * 16, seat - 24 + Math.round(Math.sin(k * 6.3) * 1.5), { size: 12, col: P.lsky, outline: P.night });
            g.text('Z', x + 44 + k2 * 16, seat - 25 + Math.round(Math.sin(k2 * 6.3) * 1.5), { size: 12, col: P.white, outline: P.night });
          }
        }
        // すりガラス（3 枚。まん中が戸。あけると左へすべって、ガラスもうすくなる）
        const pane = Math.floor((w - 4) / 3);
        const glass = (gx, alpha) => {
          if (alpha <= 0) return;
          g.ctx.save();
          g.ctx.globalAlpha *= alpha;
          g.R(gx, y + 1, pane, h - 1, P.lsky);
          g.dither(gx, y + 1, pane, h - 1, P.white, 0);
          g.ctx.restore();
          g.R(gx, y + 1, 1, h - 1, P.gray);
        };
        const fade = 1 - open * 0.85;
        glass(x + 2, fade);
        glass(x + 2 + pane * 2, fade);
        const dx = x + 2 + pane - Math.round(open * pane);
        glass(dx, 1 - open);
        g.R(dx, y + 1, 2, h - 1, P.gray);
        g.R(dx + pane - 6, y + 16, 2, 8, P.dgray); // 取っ手
        // 戸にはってある「待合室」（あけると見えなくなる）
        if (open < 1) {
          g.ctx.save();
          g.ctx.globalAlpha *= 1 - open;
          g.R(dx + 2, y + 13, pane - 4, 13, P.navy);
          g.text('待合室', dx + pane / 2 + 1, y + 13, { size: 12, col: P.white, align: 'center' });
          g.ctx.restore();
        }
      }
      function drawStation(g) {
        const i = st.cur;
        drawSky(g);
        drawCity(g, 0, PLAT_Y);
        // 屋根と柱と蛍光灯
        g.R(0, SCENE_Y, W, 5, P.xdgray);
        g.R(0, SCENE_Y + 5, W, 1, P.dgray);
        [24, 232].forEach((x) => { g.R(x - 9, SCENE_Y + 6, 18, 2, P.white); g.dither(x - 11, SCENE_Y + 8, 22, 2, P.lyellow, 0); });
        g.R(8, SCENE_Y + 6, 5, PLAT_Y - SCENE_Y - 6, P.dgray);
        g.R(243, SCENE_Y + 6, 5, PLAT_Y - SCENE_Y - 6, P.dgray);
        // 駅名標（屋根からつるしてある）
        const cx = ROOM.x + ROOM.w / 2;
        g.R(cx - 50, SCENE_Y + 6, 1, 1, P.gray);
        g.R(cx + 49, SCENE_Y + 6, 1, 1, P.gray);
        g.R(cx - 60, SCENE_Y + 7, 120, 20, INK);
        g.R(cx - 59, SCENE_Y + 8, 118, 15, P.white);
        g.R(cx - 59, SCENE_Y + 23, 118, 3, P.red);
        g.text(STATIONS[i], cx, SCENE_Y + 7, { col: INK, align: 'center' });
        // ホーム
        g.R(0, PLAT_Y, W, LEG_Y - PLAT_Y, P.gray);
        g.R(0, PLAT_Y, W, 1, P.lgray);
        g.dither(0, PLAT_Y + 1, W, 10, P.dgray, 0);
        g.R(0, PLAT_Y + 14, W, 3, P.yellow);
        g.R(0, LEG_Y - 3, W, 3, P.dgray);
        drawRoom(g, i);
        // 上り・下りの矢じるし（タップでも動ける）
        if (i > 0) g.text('◀上り', 2, PLAT_Y + 2, { size: 12, col: P.white, outline: P.xdgray });
        if (i < STATIONS.length - 1) g.text('下り▶', W - 2, PLAT_Y + 2, { size: 12, col: P.white, outline: P.xdgray, align: 'right' });
        // 八景には駅員さん
        if (i === HOME) {
          g.shadow(EKIIN_X + 16, ME_Y + 47, 10);
          g.sprite(api.person('ekiin', { dir: 'left' }), EKIIN_X, ME_Y, { scale: 2 });
        }
        // 落とし物（さっき見つけたものは、とび出す）
        const s = st.searched[i];
        if (ITEMS[s]) {
          const popping = st.pop && st.pop.at === i;
          const k = popping ? Math.min(1, st.pop.t / 0.25) : 1;
          const ix = ME_X + 38;
          g.shadow(ix + 12, PLAT_Y + 11, 9);
          g.sprite(ART.icon[s], ix, PLAT_Y - 8 - Math.round((1 - k) * 12), { scale: 2 });
          if (popping && g.blink(4)) { g.R(ix - 2, PLAT_Y - 12, 2, 2, P.white); g.R(ix + 24, PLAT_Y, 2, 2, P.white); }
        }
        drawMe(g);
        if (st.mode === 'over') {
          // 終電がなくなって、駅の明かりが消えた
          g.ctx.save();
          g.ctx.globalAlpha *= Math.min(0.6, st.t * 1.2);
          g.R(0, SCENE_Y, W, LEG_Y - SCENE_Y, P.black);
          g.ctx.restore();
        }
      }
      function drawMe(g) {
        let dir = 'down', frame = 0, y = ME_Y;
        if (st.mode === 'look') {
          dir = Math.floor(st.t * 6) % 2 ? 'left' : 'right';
          frame = Math.floor(st.t * 6) % 2;
        } else if (st.mode === 'found') {
          y -= Math.round(Math.abs(Math.sin(st.t * 9)) * 6);
          dir = 'right';
        }
        g.shadow(ME_X + 16, ME_Y + 47, 10);
        g.sprite(api.person('otoko', { dir, frame }), ME_X, y, { scale: 2 });
        if (st.mode === 'look') g.text('キョロキョロ', ME_X + 16, ME_Y - 16, { size: 12, col: P.white, outline: P.black, align: 'center' });
        if (st.mode === 'found') {
          // 吹き出し「いた！」（男魂くんの頭の上。しっぽは下へ）
          const bw = g.measure('いた！', 16) + 10, bh = 22;
          const bx = ME_X + 16 - Math.round(bw / 2), by = ME_Y - 30;
          g.R(bx + 1, by, bw - 2, bh, INK);
          g.R(bx, by + 1, bw, bh - 2, INK);
          g.R(bx + 1, by + 1, bw - 2, bh - 2, P.white);
          g.R(ME_X + 13, by + bh - 1, 6, 4, INK);
          g.R(ME_X + 14, by + bh - 2, 4, 3, P.white);
          g.R(ME_X + 15, by + bh + 3, 2, 1, INK);
          g.text('いた！', bx + bw / 2, by + 3, { col: P.red, align: 'center' });
        }
      }
      function drawRide(g) {
        const d = st.dir;
        drawSky(g);
        drawCity(g, api.time * 50 * d, LEG_Y - 8);
        // 架線柱（速く流れる）
        for (let k = 0; k < 3; k++) {
          const px = ((((k * 110 - api.time * 300 * d) % 330) + 330) % 330) - 20;
          g.R(px, SCENE_Y, 4, LEG_Y - SCENE_Y - 8, P.xdgray);
          g.R(px - 6, SCENE_Y + 6, 16, 2, P.xdgray);
        }
        g.R(0, SCENE_Y + 3, W, 1, P.dgray); // 架線
        // 線路
        g.R(0, LEG_Y - 8, W, 8, P.xdgray);
        for (let k = 0; k < 20; k++) {
          const sx = ((((k * 16 - api.time * 300 * d) % 320) + 320) % 320) - 16;
          g.R(sx, LEG_Y - 4, 8, 3, P.dgray);
        }
        g.R(0, LEG_Y - 7, W, 2, P.lgray);
        // 電車（ゆれる）
        const by = 134 + (Math.floor(api.time * 8) % 2);
        g.R(10, by - 2, 236, 58, INK);
        g.R(11, by - 1, 234, 4, P.lgray);
        g.R(11, by + 3, 234, 52, P.red);
        g.R(11, by + 32, 234, 4, P.white);
        g.R(11, by + 48, 234, 7, P.dred);
        const wins = [24, 60, 102, 152, 194];
        wins.forEach((wx) => {
          g.R(wx - 1, by + 8, 30, 20, P.dred);
          g.R(wx, by + 9, 28, 18, P.lyellow);
          g.R(wx, by + 23, 28, 4, P.cream);
        });
        // ドア
        [90, 140, 182].forEach((dx) => { g.R(dx, by + 6, 1, 42, P.dred); g.R(dx + 9, by + 6, 1, 42, P.dred); });
        // 窓の中の男魂くん（顔だけ）
        g.ctx.save();
        g.ctx.beginPath();
        g.ctx.rect(102, by + 9, 28, 14);
        g.ctx.clip();
        g.sprite(api.person('otoko', { dir: d < 0 ? 'left' : 'right' }), 100, by + 5, { scale: 2 });
        g.ctx.restore();
        // 行き先
        g.R(214, by + 7, 28, 14, INK);
        g.text(d < 0 ? '横浜' : '浦賀', 228, by + 8, { size: 12, col: P.orange, align: 'center' });
        // 台車
        [[30, 70], [170, 210]].forEach(([a, b]) => {
          g.R(a, by + 55, b - a, 5, P.xdgray);
          g.disc(a + 8, by + 61, 4, INK);
          g.disc(b - 8, by + 61, 4, INK);
        });
        const k = Math.floor(st.t / 0.3) % 2;
        g.text(k ? 'ゴトン' : 'ガタン', k ? 176 : 80, SCENE_Y + 6, { col: P.white, outline: P.black, align: 'center' });
      }

      return {
        st,
        get bAt() { return bAt; },
        get side() { return side; },
        get dist() { return dist; },
        get left() { return LAST - st.clock; }, // 終電まで、あと何分
        // テスト用：それぞれの駅に何があるか・決まりごと
        what: (i) => at(i),
        rule: { what, HOME, STATIONS, DISTS, STEP_MIN, RIDE_MIN, LOOK_MIN, START, LAST, start },
        update(dt) {
          st.t += dt;
          if (st.msgT > 0) st.msgT -= dt;
          if (st.plus >= 0) st.plus += dt;
          if (st.pop) st.pop.t += dt;
          if (st.msgT <= 0 && st.queue.length && st.mode === 'idle') {
            const q = st.queue.shift();
            say(q.msg, q.sec, q.name);
          }
          if (st.mode === 'ride' || st.mode === 'look') {
            const dur = st.mode === 'ride' ? RIDE : LOOK;
            // 時計は、うごいている間に 1 分ずつすすむ（ゲームの中の時間は、この時計だけ）
            const m = Math.floor((st.t / dur) * st.cost);
            // 0:40 までにおわらない（のこり 5 分でさがした）ときは、0:40 になったところで終電がなくなる
            if (st.clock0 + st.cost > LAST && st.clock0 + m >= LAST) { over(); return; }
            st.clock = st.clock0 + Math.min(st.cost - 1, m);
            if (st.mode === 'ride') {
              if (Math.abs(st.t - 0.45) < dt / 2) api.sfx('step');
              if (st.t >= RIDE) arrive();
            } else if (st.t >= LOOK) lookDone();
            return;
          }
          if (st.mode !== 'idle' || api.ended) return;
          const inp = api.input;
          if (inp.pressed('left')) move(-1);
          else if (inp.pressed('right')) move(1);
          else if (inp.pressed('a')) search();
          else if (inp.tap) {
            // タップ：路線図なら、いまの駅より左・右・その駅。下の場面なら、左右のはしと、まん中（待合室）
            const tp = inp.tap;
            if (tp.y >= LEG_Y) return;
            const onMap = tp.y < SCENE_Y;
            const lo = onMap ? SX(st.cur) - 11 : TAP_L;
            const hi = onMap ? SX(st.cur) + 11 : TAP_R;
            if (tp.x < lo) move(-1);
            else if (tp.x > hi) move(1);
            else search();
          }
        },
        draw(g) {
          if (st.mode === 'ride') drawRide(g);
          else drawStation(g);
          drawMap(g);
          drawStatus(g);
          drawLegend(g);
          if (st.msgT > 0 && st.mode !== 'ride') {
            // 1 行に入らなければ、小さい字にする（2 行まで）
            const parts = st.msg.split('\n');
            const size = parts.every((l) => g.measure(l, 16) <= W - 36) ? 16 : 12;
            const n = Math.min(2, g.wrap(st.msg, W - 32, size).length);
            g.say(st.msg, { y: SCENE_Y + 2, maxLines: 2, size, h: 16 + n * (size + 4), name: st.msgName || undefined });
          }
        },
      };
    },
  });
})();
