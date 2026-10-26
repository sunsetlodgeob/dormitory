/*
 * 7月「同期Bをさがせ」 ― 泥酔して消えた同期Bを、電車でさがす
 *  金沢八景から、上り（横浜方面）か下り（浦賀方面）のどこかの駅で、同期Bが寝ている。どちらかはランダム。
 *  八景と同期Bの間の駅には、同期Bが脱いでいった物（カバン → シャツ → くつ下 → ズボン）が落ちている。
 *  落とし物があれば、その先にいる。何もない駅の先にはいない。
 *  ←→ で電車に乗って、となりの駅へ（終電までの本数にかぎりがある）。A で駅をさがす。
 *  同期Bのいる駅をさがしたらクリア（新聞紙をかぶって、パンツ一丁でベンチで寝ている）。
 *  ほかの駅にも、新聞紙をかぶって寝ている知らないおじさんがいることがある（足もとを見るとわかる）。
 */
(function () {
  'use strict';

  // ── 路線（おもな駅だけ。左が上り＝横浜方面、右が下り＝浦賀方面） ─────────
  const STATIONS = ['横浜', '上大岡', '杉田', '能見台', '金沢文庫', '金沢八景', '追浜', '汐入', '横須賀中央', '堀ノ内', '浦賀'];
  const HOME = 5; // 金沢八景
  const SX = (i) => 18 + i * 22; // 路線図の駅の x
  const LINE_Y = 40; // 路線図の線の y
  const MAP_Y = 24, SCENE_Y = 109; // 路線図の上はし・駅の場面の上はし
  const PLAT_Y = 184; // ホームの上面
  const BENCH_X = 134, BENCH_W = 76, SEAT_Y = 174;
  const ME_X = 46, ME_Y = 146;
  const RIDE = 1.1; // 1 駅ぶん乗る時間（秒）
  const LOOK = 0.7; // さがす時間（秒）

  // 落とし物（八景に近い方から順に脱いでいった）。絵は 10×8 ドット
  const ITEMS = [
    {
      id: 'bag', name: 'カバン', msg: 'カバンだ！ この先か…',
      pal: { k: '#503000', b: '#ac7c00', y: '#f8b800' },
      rows: ['...kkkk...', '..k....k..', '.kkkkkkkk.', '.bbbbbbbb.', '.bbbyybbb.', '.bbbbbbbb.', '.bbbbbbbb.', '.kkkkkkkk.'],
    },
    {
      id: 'shirt', name: 'シャツ', msg: 'シャツだ！ まだ先か…',
      pal: { s: '#a4e4fc', c: '#fcfcfc', w: '#3cbcfc' },
      rows: ['..ss..ss..', '.ssscccss.', 'ssssssssss', 'ssssssssss', '..sswsss..', '..ssssss..', '..sswsss..', '..ssssss..'],
    },
    {
      id: 'socks', name: 'くつ下', msg: 'くつ下だ！ まだ先か…',
      pal: { r: '#f83800', w: '#d8d8d8', g: '#fcfcfc' },
      rows: ['..rrrr....', '..wwww....', '..rrrr....', '..wwww....', '..wwww....', '..wwwwwww.', '..wwwwgwww', '...wwwwww.'],
    },
    {
      id: 'pants', name: 'ズボン', msg: 'ズボンだ！ もう近い…！',
      pal: { k: '#283048', b: '#3050a0', l: '#5878c8' },
      rows: ['.kkkkkkkk.', '.bbbbbbbb.', '.blbbbbbb.', '.bbb..bbb.', '.blb..bbb.', '.bbb..blb.', '.bbb..bbb.', '.bbb..bbb.'],
    },
  ];
  const NOTHING = ['何もない。ハトがいるだけ。', '何もない。自販機がまぶしい。', '何もない。風がぬるい。', '何もない。ここじゃない。', '何もない。セミが鳴いている。'];

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
    ITEMS.forEach((it) => { ART.icon[it.id] = icon(it); });
  }

  OTK.register({
    id: 'deisui',
    order: 4,
    month: 7,
    event: '',
    title: '同期Bをさがせ',
    goal: '泥酔した\n同期Bをさがせ！',
    howto: ['←→：電車でとなりの駅へ', 'A：駅をさがす', '落とし物の先にいる！'],
    note: '電車は終電まで。タップでも動ける。',
    time: 45,
    timeout: 'lose',
    timeoutMsg: '朝になった。\n同期Bは、パンツで\n帰ってきた。',
    bgm: 'play',
    create(api) {
      const P = api.P, W = api.W, H = api.H;
      if (!ART) buildArt(P);

      // どこにいるか：上り（-1）か下り（+1）、八景から何駅目か
      const side = api.chance(0.5) ? -1 : 1;
      const dist = api.pick([2, 3, 4, 4, 5, 5]);
      const bAt = HOME + side * dist;
      // 八景と同期Bの間の駅に、落とし物（同期Bに近いほど、あとで脱いだ物）
      const clueAt = {};
      for (let k = 1; k < dist; k++) clueAt[HOME + side * k] = ITEMS[ITEMS.length - dist + k];
      // 新聞紙をかぶって寝ている人（同期Bと、知らないおじさん）
      const sleepers = { [bAt]: 'b' };
      for (let i = 0; i < STATIONS.length; i++) if (i !== bAt && i !== HOME && api.chance(0.3)) sleepers[i] = 'oji';
      const flavor = {};
      STATIONS.forEach((s, i) => { flavor[i] = api.pick(NOTHING); });

      const st = {
        cur: HOME, from: HOME, to: HOME, dir: 1,
        trains: api.tries >= 1 ? 10 : 9, // 終電までの本数（しっぱいしたら 1 本おまけ）
        mode: 'idle', // idle（操作を待つ）・ride（電車）・look（さがしている）・found（見つけた）
        t: 0,
        searched: {}, // 駅 → 'none' | 'clue' | 'oji' | 'b'
        uncovered: {}, // 新聞紙をどけた駅 → どけた時刻
        clues: [], // 拾った落とし物の id
        msg: '同期Bを見失った…！', msgT: 2.4,
        pop: null, // いま見つけた落とし物（ホームに少し出しておく）
        out: false,
      };

      function say(msg, sec) {
        st.msg = msg;
        st.msgT = sec || 2.2;
      }
      function move(d) {
        const to = st.cur + d;
        if (to < 0 || to >= STATIONS.length) {
          say('この先には行かない。', 1.4);
          api.sfx('cancel');
          return;
        }
        if (st.trains <= 0) {
          say('もう電車がない…！', 1.6);
          api.sfx('ng');
          return;
        }
        st.trains--;
        st.from = st.cur;
        st.to = to;
        st.dir = d;
        st.mode = 'ride';
        st.t = 0;
        st.msgT = 0;
        st.pop = null;
        api.sfx('step');
      }
      function search() {
        if (st.searched[st.cur]) {
          say('ここはもうさがした。', 1.4);
          api.sfx('cancel');
          return;
        }
        st.mode = 'look';
        st.t = 0;
        st.msgT = 0;
        api.sfx('select');
      }
      function lookDone() {
        const i = st.cur;
        st.mode = 'idle';
        st.uncovered[i] = api.time;
        if (i === bAt) {
          st.searched[i] = 'b';
          st.mode = 'found';
          st.t = 0;
          st.msgT = 0;
          api.sfx('power');
          api.win('同期Bを見つけた！\nパンツ一丁で、\nベンチで寝ていた。', { wait: 1.8 });
          return;
        }
        const item = clueAt[i];
        if (item) {
          st.searched[i] = 'clue';
          st.clues.push(item.id);
          st.pop = { id: item.id, at: i, t: 0 };
          say(item.msg);
          api.sfx('coin');
        } else if (sleepers[i] === 'oji') {
          st.searched[i] = 'oji';
          say('知らないおじさんだった。');
          api.sfx('cancel');
        } else {
          st.searched[i] = 'none';
          say(flavor[i]);
          api.sfx('cancel');
        }
        stuck();
      }
      // 電車がもうなく、この駅もさがし終えたら、おしまい
      function stuck() {
        if (st.trains > 0 || !st.searched[st.cur] || st.searched[st.cur] === 'b' || st.out) return;
        st.out = true;
        api.after(1.2, () => {
          if (api.ended) return; // その間に時間切れになっていたら、そちらの結果のまま
          say('もう電車がない…！', 9);
          api.sfx('buzzer');
          api.lose('終電がなくなった。\n同期Bは見つからず、\n歩いて帰った…', { wait: 1.4 });
        });
      }
      function arrive() {
        st.cur = st.to;
        st.mode = 'idle';
        st.t = 0;
        api.sfx('cursor');
        stuck();
      }

      // ── 描く ──
      function drawStatus(g) {
        g.R(0, 12, W, 12, P.black);
        // 電車の小さい絵
        g.R(3, 15, 11, 7, P.red);
        g.R(4, 16, 9, 2, P.lyellow);
        g.R(3, 20, 11, 1, P.white);
        let x = 17;
        x += g.text('終電まで あと', x, 12, { size: 12, col: P.white });
        g.text(String(st.trains) + '本', x + 2, 12, { size: 12, col: st.trains <= 2 ? P.red : P.yellow });
        // 拾った落とし物
        const lx = W - 4 - Math.max(1, st.clues.length) * 13;
        g.text('落とし物', lx - 4, 12, { size: 12, col: P.lgray, align: 'right' });
        if (!st.clues.length) g.text('－', W - 10, 12, { size: 12, col: P.dgray, align: 'center' });
        st.clues.forEach((id, k) => g.sprite(ART.icon[id], lx + k * 13, 13));
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
          const col = isHere ? P.white : st.searched[i] ? P.gray : P.ink;
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
          // さがした印（落とし物の絵か、×）
          const s = st.searched[i];
          if (s === 'clue') g.sprite(ART.icon[clueAt[i].id], x - 6, MAP_Y + 3);
          else if (s === 'none' || s === 'oji') {
            g.line(x - 3, MAP_Y + 5, x + 3, MAP_Y + 11, P.gray);
            g.line(x + 3, MAP_Y + 5, x - 3, MAP_Y + 11, P.gray);
          } else if (s === 'b') {
            g.ring(x, LINE_Y, 6, P.red);
            g.ring(x, LINE_Y, 7, P.red);
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
        } else if (g.blink(2) && st.mode !== 'found') {
          g.ring(SX(st.cur), LINE_Y, 6, P.mblue);
        }
      }
      function drawSky(g) {
        g.R(0, SCENE_Y, W, PLAT_Y - SCENE_Y, P.night);
        for (let i = 0; i < 14; i++) {
          const sx = (i * 73 + 11) % W, sy = SCENE_Y + 8 + ((i * 29) % 40);
          if ((i + Math.floor(api.time * 1.5)) % 5) g.R(sx, sy, 1, 1, i % 3 ? P.gray : P.lyellow);
        }
      }
      function drawCity(g, off) {
        for (let k = 0; k < 9; k++) {
          const bw = 22 + ((k * 7) % 12), bh = 18 + ((k * 13) % 26);
          const bx = ((((k * 34 - off) % 306) + 306) % 306) - 26;
          g.R(bx, PLAT_Y - bh, bw, bh, P.navy);
          for (let wy = PLAT_Y - bh + 4; wy < PLAT_Y - 4; wy += 6)
            for (let wx = bx + 3; wx < bx + bw - 3; wx += 5) if (((wx * 7 + wy * 3 + k) % 5) === 0) g.R(wx, wy, 2, 2, P.lyellow);
        }
      }
      function drawStation(g) {
        drawSky(g);
        drawCity(g, 0);
        // 屋根と柱と蛍光灯
        g.R(0, SCENE_Y, W, 5, P.xdgray);
        g.R(0, SCENE_Y + 5, W, 1, P.dgray);
        [24, 128, 232].forEach((x) => { g.R(x - 9, SCENE_Y + 6, 18, 2, P.white); g.dither(x - 11, SCENE_Y + 8, 22, 2, P.lyellow, 0); });
        g.R(8, SCENE_Y + 6, 5, PLAT_Y - SCENE_Y - 6, P.dgray);
        g.R(243, SCENE_Y + 6, 5, PLAT_Y - SCENE_Y - 6, P.dgray);
        // 駅名標（となりの駅も書いてある）
        const i = st.cur;
        g.R(70, 146, 3, PLAT_Y - 146, P.gray);
        g.R(183, 146, 3, PLAT_Y - 146, P.gray);
        g.R(43, 116, 170, 32, INK);
        g.R(44, 117, 168, 30, P.white);
        g.text(STATIONS[i], 128, 118, { col: INK, align: 'center' });
        g.R(44, 135, 168, 12, P.red);
        if (i > 0) g.text('←' + STATIONS[i - 1], 47, 135, { size: 12, col: P.white });
        if (i < STATIONS.length - 1) g.text(STATIONS[i + 1] + '→', 209, 135, { size: 12, col: P.white, align: 'right' });
        // ホーム
        g.R(0, PLAT_Y, W, 24, P.gray);
        g.R(0, PLAT_Y, W, 1, P.lgray);
        g.dither(0, PLAT_Y + 1, W, 12, P.dgray, 0);
        g.R(0, PLAT_Y + 18, W, 3, P.yellow);
        g.R(0, PLAT_Y + 24, W, 4, P.dgray);
        g.R(0, PLAT_Y + 28, W, H - PLAT_Y - 28, P.black);
        g.R(0, PLAT_Y + 32, W, 1, P.dgray);
        for (let x = 4; x < W; x += 12) g.R(x, PLAT_Y + 30, 6, 1, P.xdgray);
        g.text('← 上り', 3, 211, { size: 12, col: P.lgray });
        g.text('下り →', W - 3, 211, { size: 12, col: P.lgray, align: 'right' });
        // ベンチ（青いプラスチック）
        const bx = BENCH_X, bw = BENCH_W;
        g.R(bx + 5, SEAT_Y - 16, 2, 16, P.dgray);
        g.R(bx + bw - 7, SEAT_Y - 16, 2, 16, P.dgray);
        g.R(bx, SEAT_Y - 16, bw, 4, P.mblue);
        g.R(bx, SEAT_Y - 9, bw, 4, P.mblue);
        g.R(bx, SEAT_Y - 16, bw, 1, P.sky);
        g.R(bx, SEAT_Y - 9, bw, 1, P.sky);
        g.R(bx - 2, SEAT_Y, bw + 4, 4, P.sky);
        g.R(bx - 2, SEAT_Y + 3, bw + 4, 1, P.blue);
        g.R(bx + 4, SEAT_Y + 4, 3, PLAT_Y + 8 - SEAT_Y - 4, P.dgray);
        g.R(bx + bw - 7, SEAT_Y + 4, 3, PLAT_Y + 8 - SEAT_Y - 4, P.dgray);
        drawSleeper(g, i);
        // さっき見つけた落とし物
        if (st.pop && st.pop.at === i) {
          const k = Math.min(1, st.pop.t / 0.25);
          g.shadow(116, PLAT_Y + 12, 10);
          g.sprite(ART.icon[st.pop.id], 104, PLAT_Y - 10 - Math.round((1 - k) * 12), { scale: 2 });
          if (g.blink(4)) { g.R(102, PLAT_Y - 14, 2, 2, P.white); g.R(128, PLAT_Y - 2, 2, 2, P.white); }
        }
        drawMe(g);
      }
      function drawSleeper(g, i) {
        const who = sleepers[i];
        if (!who) return;
        const x = BENCH_X + 1, y = SEAT_Y - 22;
        g.sprite(who === 'b' ? ART.b : ART.oji, x, y, { scale: 2 });
        // 新聞紙（さがすと、上へ飛んでいく）
        const off = st.uncovered[i] != null ? api.time - st.uncovered[i] : -1;
        const ny = off > 0 ? -Math.round(off * 70) : 0;
        if (off < 0.6) {
          const nx = x + 18;
          g.R(nx, y + 2 + ny, 40, 20, INK);
          g.R(nx + 1, y + 3 + ny, 38, 18, P.lgray);
          g.R(nx + 19, y + 3 + ny, 1, 18, P.gray);
          for (let r = 0; r < 5; r++) {
            g.R(nx + 3, y + 6 + r * 3 + ny, 12, 1, P.dgray);
            g.R(nx + 21, y + 6 + r * 3 + ny, r === 0 ? 8 : 13, 1, P.dgray);
          }
          g.R(nx + 3, y + 5 + ny, 6, 2, INK); // 見出し
        }
        // いびき
        if (st.mode !== 'ride') {
          const k = (api.time * 0.8) % 1;
          const k2 = (k + 0.5) % 1;
          g.text('z', x + 14 + k * 8, y - 6 - k * 14, { size: 12, col: P.lsky, outline: P.night });
          g.text('Z', x + 10 + k2 * 8, y - 6 - k2 * 14, { size: 12, col: P.white, outline: P.night });
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
          // 吹き出し「いた！」（しっぽは左の男魂くんへ）
          const bx = ME_X + 38, by = ME_Y + 4, bw = g.measure('いた！', 16) + 10, bh = 22;
          g.R(bx + 1, by, bw - 2, bh, INK);
          g.R(bx, by + 1, bw, bh - 2, INK);
          g.R(bx + 1, by + 1, bw - 2, bh - 2, P.white);
          g.R(bx - 3, by + 8, 4, 5, INK);
          g.R(bx - 2, by + 9, 3, 3, P.white);
          g.R(bx - 4, by + 10, 1, 1, INK);
          g.text('いた！', bx + bw / 2, by + 3, { col: P.red, align: 'center' });
        }
      }
      function drawRide(g) {
        const d = st.dir;
        drawSky(g);
        drawCity(g, api.time * 50 * d);
        // 架線柱（速く流れる）
        for (let k = 0; k < 3; k++) {
          const px = ((((k * 110 - api.time * 300 * d) % 330) + 330) % 330) - 20;
          g.R(px, SCENE_Y, 4, 92, P.xdgray);
          g.R(px - 6, SCENE_Y + 6, 16, 2, P.xdgray);
        }
        g.R(0, SCENE_Y + 3, W, 1, P.dgray); // 架線
        // 線路
        g.R(0, 200, W, H - 200, P.xdgray);
        for (let k = 0; k < 20; k++) {
          const sx = ((((k * 16 - api.time * 300 * d) % 320) + 320) % 320) - 16;
          g.R(sx, 206, 8, 3, P.dgray);
        }
        g.R(0, 203, W, 2, P.lgray);
        // 電車（ゆれる）
        const by = 134 + (Math.floor(api.time * 8) % 2);
        g.R(10, by - 2, 236, 60, INK);
        g.R(11, by - 1, 234, 4, P.lgray);
        g.R(11, by + 3, 234, 54, P.red);
        g.R(11, by + 34, 234, 4, P.white);
        g.R(11, by + 50, 234, 7, P.dred);
        const wins = [24, 60, 102, 152, 194];
        wins.forEach((wx) => {
          g.R(wx - 1, by + 9, 30, 20, P.dred);
          g.R(wx, by + 10, 28, 18, P.lyellow);
          g.R(wx, by + 24, 28, 4, P.cream);
        });
        // ドア
        [90, 140, 182].forEach((dx) => { g.R(dx, by + 7, 1, 43, P.dred); g.R(dx + 9, by + 7, 1, 43, P.dred); });
        // 窓の中の男魂くん（顔だけ）
        g.ctx.save();
        g.ctx.beginPath();
        g.ctx.rect(102, by + 10, 28, 14);
        g.ctx.clip();
        g.sprite(api.person('otoko', { dir: d < 0 ? 'left' : 'right' }), 100, by + 6, { scale: 2 });
        g.ctx.restore();
        // 行き先
        g.R(214, by + 8, 28, 14, INK);
        g.text(d < 0 ? '横浜' : '浦賀', 228, by + 9, { size: 12, col: P.orange, align: 'center' });
        // 台車
        [[30, 70], [170, 210]].forEach(([a, b]) => {
          g.R(a, by + 57, b - a, 6, P.xdgray);
          g.disc(a + 8, by + 64, 4, INK);
          g.disc(b - 8, by + 64, 4, INK);
        });
        const k = Math.floor(st.t / 0.3) % 2;
        g.text(k ? 'ゴトン' : 'ガタン', k ? 176 : 80, SCENE_Y + 4, { col: P.white, outline: P.black, align: 'center' });
      }

      return {
        st,
        get bAt() { return bAt; },
        get side() { return side; },
        get dist() { return dist; },
        get clueAt() { const o = {}; Object.keys(clueAt).forEach((k) => { o[k] = clueAt[k].id; }); return o; },
        get sleepers() { return Object.assign({}, sleepers); },
        update(dt) {
          st.t += dt;
          if (st.msgT > 0) st.msgT -= dt;
          if (st.pop) st.pop.t += dt;
          if (st.mode === 'ride') {
            if (Math.abs(st.t - 0.45) < dt / 2) api.sfx('step');
            if (st.t >= RIDE) arrive();
            return;
          }
          if (st.mode === 'look') {
            if (st.t >= LOOK) lookDone();
            return;
          }
          if (st.mode !== 'idle' || api.ended || st.out) return;
          const inp = api.input;
          if (inp.pressed('left')) move(-1);
          else if (inp.pressed('right')) move(1);
          else if (inp.pressed('a')) search();
          else if (inp.tap) {
            // タップ：路線図なら、いまの駅より左・右・その駅。下の場面なら、左右のはし・まん中とベンチ
            const tp = inp.tap;
            const cx = tp.y < SCENE_Y ? SX(st.cur) : W / 2;
            const half = tp.y < SCENE_Y ? 11 : 48;
            const bench = tp.y >= SEAT_Y - 34 && tp.y < PLAT_Y + 12 && tp.x >= BENCH_X - 6 && tp.x < BENCH_X + BENCH_W + 6;
            if (bench) search();
            else if (tp.x < cx - half) move(-1);
            else if (tp.x > cx + half) move(1);
            else search();
          }
        },
        draw(g) {
          if (st.mode === 'ride') drawRide(g);
          else drawStation(g);
          drawMap(g);
          drawStatus(g);
          if (st.msgT > 0 && st.mode !== 'ride') {
            // 1 行に入らなければ、小さい字にする
            const size = g.measure(st.msg, 16) <= W - 36 ? 16 : 12;
            g.say(st.msg, { y: 111, maxLines: 1, size, h: 36 });
          }
        },
      };
    },
  });
})();
