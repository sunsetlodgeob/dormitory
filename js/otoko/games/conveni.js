/*
 * 9月「全裸コンビニ」 ― カラーボールをよけて、寮まで逃げきれ
 *  全裸（「男魂」の札とモザイクつき）でコンビニに行った帰り。夜の道を、画面の上にある寮へ向かって走る。
 *  前半（約14秒）：うしろの店員がカラーボールを投げてくる。落ちる所に赤い輪が出るので、←→で列をかえてよける。
 *    当たるとベチャッと色がついて、しっぱい。
 *  後半：おまわりさんが下から追ってくる。A連打で速く走り、自転車・電柱などを←→でよける。
 *    ぶつかると転んでおそくなる。寮の門に着いたらクリア。追いつかれたらしっぱい。
 *  スマホは十字キーとAボタンのほか、画面をおした所の列へも動ける。後半は画面のタップも連打になる。
 */
(function () {
  'use strict';

  // ── 道（画面は 256×224。上の 12 ドットはエンジンの帯） ─────────────────
  const LANES = [64, 96, 128, 160, 192]; // 列のまん中の x
  const ROAD_L = 48, ROAD_R = 208; // 車道の左右のはし
  const FEET = 150; // 男魂くんの足もと（画面の y）。ボールはこの高さに落ちる
  const LANE_SPEED = 320; // 列をかえる速さ（ドット/秒）
  const RUN1 = 72; // 前半の走る速さ（ドット/秒）
  const P1_END = 14.4; // 前半（カラーボール）が終わる時刻
  const SWITCH = 2.0; // 店員からおまわりさんに入れかわる時間
  const RUN2 = 940; // 後半に走るきょり
  const BASE2 = 46; // 後半：連打しないときの速さ
  const VP = 62; // 後半：おまわりさんの速さ
  const BOOST_ADD = 8.5, BOOST_MAX = 56, BOOST_DECAY = 1.5; // 連打で上がる速さ・上限・へり方
  const GAP0 = 64; // 後半の始まりの、おまわりさんとの間
  const CATCH = 14; // おまわりさんとの間がこれより近づくと、つかまる
  const HIT_R = 13; // ボールが当たる近さ（横）
  const WIND = 0.22; // 投げる前に、ボールをふりかぶる時間
  const EST_GOAL = RUN1 * (P1_END + SWITCH) - 22 + RUN2; // 門までのきょりの見こみ（進み具合のめもり用）

  // 投げる予定（時刻と投げ方）
  //  aim：いる列（動いている途中なら行き先）／pair：となりと 2 つ／zigzag：1 つおき／wall：3 つならび
  const PLAN = [
    [1.3, 'aim'], [2.6, 'aim'], [3.7, 'aim'], [4.8, 'pair'], [5.9, 'aim'], [6.6, 'aim'],
    [7.7, 'zigzag'], [9.0, 'pair'], [9.9, 'aim'], [10.6, 'aim'], [11.3, 'aim'], [12.4, 'wall'], [13.4, 'zigzag'],
  ];
  const BALL_COLS = [['#fc7400', '#fcb860'], ['#f83898', '#f8a8d8']]; // カラーボール（オレンジ・ピンク）
  const OBS = {
    bike: { name: '自転車', hit: 'ガシャーン' },
    pole: { name: '電柱', hit: 'ゴンッ' },
    cone: { name: 'コーン', hit: 'カコーン' },
    bags: { name: 'ゴミ袋', hit: 'ボスッ' },
  };

  // 飾り（家・木・街灯）の場所を決める、毎回同じになる乱数
  function hash(k, s) {
    let h = (Math.imul(k | 0, 374761393) + Math.imul(s | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  OTK.register({
    id: 'conveni',
    order: 5,
    month: 9,
    event: '',
    title: '全裸コンビニ',
    goal: 'よけて、\n逃げきれ！',
    howto: ['←→：赤い輪からよける', '後半：A連打で走れ！', 'じゃま物にぶつかると転ぶ'],
    note: '',
    time: 35,
    timeout: 'lose',
    timeoutMsg: '時間切れ。\nつかまってしまった…',
    bgm: 'tense',
    create(api) {
      const P = api.P, W = api.W, H = api.H;
      const easy = api.tries >= 2; // 2 回しっぱいしたら、ボールを見やすく・おまわりさんを少しおそく
      const warnTime = (t) => (easy ? 0.25 : 0) + api.lerp(1.05, 0.8, Math.min(1, t / 13));
      const plan = PLAN.map(([t, k]) => ({ t: t + api.rnd(-0.12, 0.12), kind: easy && k === 'wall' ? 'pair' : k }));

      const me = { lane: 2, x: LANES[2], run: 0, face: 'down', splat: false, caught: false, safe: false, stumbleT: 0, outY: 0 };
      const tenins = [
        { x: LANES[1], y: FEET + 64, run: 0, slow: 0 },
        { x: LANES[3], y: FEET + 66, run: 0.3, slow: 0 },
      ];
      const police = { on: false, x: LANES[2], run: 0 };
      const balls = [];
      const decals = []; // 道に残ったペンキ
      const obs = []; // 後半のじゃま物
      const fx = []; // 「ベチャッ」などの文字
      let phase = 'balls'; // balls → switch → chase（→ 終わり）
      let dist = 0, speed = 0, gap = 140, boost = 0, goal = 0, planI = 0, mashT = 0, endT = 0, switchT = 0;
      let throwN = 0, dodged = 0, bumps = 0;
      let say = null; // 吹き出し { who, str, t }

      const sy = (wy) => FEET - (wy - dist); // 道の上の位置 → 画面の y
      const nearestLane = (x) => {
        let best = 0;
        LANES.forEach((lx, i) => { if (Math.abs(lx - x) < Math.abs(LANES[best] - x)) best = i; });
        return best;
      };
      function talk(who, str, sec) { say = { who, str, t: sec || 1.4 }; }
      function pop(str, x, y, col, sec) { fx.push({ str, x, y, col: col || P.white, t: 0, dur: sec || 0.9 }); }

      // ── 前半：カラーボール ──
      function volley(kind, t) {
        const L = me.lane; // 動いている途中なら行き先の列をねらう
        let lanes;
        if (kind === 'pair') lanes = [L, L === 0 ? 1 : L === 4 ? 3 : api.chance(0.5) ? L - 1 : L + 1];
        else if (kind === 'zigzag') lanes = [0, 1, 2, 3, 4].filter((i) => i % 2 === L % 2);
        else if (kind === 'wall') lanes = L === 0 ? [0, 1] : L === 4 ? [3, 4] : [L - 1, L, L + 1];
        else lanes = [L];
        const dur = warnTime(t);
        const col = BALL_COLS[api.chance(0.7) ? 0 : 1];
        lanes.forEach((ln) => {
          // 近いほうの店員が投げる
          const who = Math.abs(tenins[0].x - LANES[ln]) <= Math.abs(tenins[1].x - LANES[ln]) ? 0 : 1;
          balls.push({ tx: LANES[ln], who, t: 0, dur, col, sx: 0, sy: 0, gx: 0, gy: 0, out: false });
        });
        throwN++;
      }
      function land(b) {
        b.out = true;
        decals.push({ x: b.tx, wy: dist, col: b.col, k: decals.length });
        if (!me.splat && !api.ended && Math.abs(me.x - b.tx) < HIT_R) {
          me.splat = true;
          me.splatCol = b.col;
          me.hitBy = { tx: b.tx, x: me.x, lane: me.lane, t: api.time };
          api.sfx('splat');
          api.shake(3, 0.35);
          api.flash(b.col[0], 0.18);
          pop('ベチャッ！', me.x, FEET - 60, b.col[1], 1.6);
          talk(0, '当たった！', 1.6);
          api.lose('カラーボールが命中！\nオレンジ色で目立って\nすぐ見つかった…', { wait: 1.4 });
          return;
        }
        api.sfx('hit');
      }

      // ── 後半：おまわりさん ──
      function startChase() {
        phase = 'chase';
        goal = dist + RUN2;
        gap = Math.min(gap, GAP0 + 6);
        // じゃま物の列（1 列に 1〜2 個。いつも 3 列以上あけておく）
        let wy = dist + 190;
        while (wy < goal - 130) {
          const n = api.chance(0.45) ? 2 : 1;
          api.shuffle([0, 1, 2, 3, 4]).slice(0, n).forEach((ln) => {
            const edge = ln === 0 || ln === 4;
            const type = edge ? api.pick(['pole', 'pole', 'bags', 'bike']) : api.pick(['bike', 'bike', 'cone']);
            obs.push({ lane: ln, x: LANES[ln], wy: wy + api.irnd(-6, 6), type, hit: false, flip: api.chance(0.5) });
          });
          wy += api.rnd(150, 190) + (easy ? 20 : 0);
        }
      }
      function caught() {
        if (me.caught || api.ended) return;
        me.caught = true;
        me.face = 'down';
        api.sfx('buzzer');
        api.shake(3, 0.3);
        talk('police', '確保ーっ！', 2);
        pop('ギクッ', me.x, FEET - 60, P.yellow, 1.6);
        api.lose('おまわりさんに\nつかまった。\n「まず服を着なさい」', { wait: 1.4 });
      }
      function safe() {
        me.safe = true;
        api.sfx('ok');
        talk('police', '…またあの寮か', 2.4);
        api.win('寮の門に飛びこんだ！\n逃げきった…！', { wait: 1.8 });
      }

      function steer(dt) {
        const inp = api.input;
        if (!me.splat && !me.caught && !me.safe) {
          if (inp.repeat('left')) me.lane = Math.max(0, me.lane - 1);
          if (inp.repeat('right')) me.lane = Math.min(4, me.lane + 1);
          // 画面をおしている所の列へ（スマホ）
          const p = inp.pointer;
          if (p && p.down && !api.ended && p.y > api.TOP) me.lane = nearestLane(p.x);
        }
        me.x = api.approach(me.x, LANES[me.lane], LANE_SPEED * dt);
      }

      // ── 描く道具 ──
      function bubble(g, x, y, str, o) {
        o = o || {};
        const size = 12;
        const w = g.measure(str, size) + 8, h = size + 6;
        const bx = Math.round(Math.max(2, Math.min(W - w - 2, x - w / 2))), by = Math.round(y - h - 3);
        const fill = o.fill || P.white;
        g.R(bx + 1, by, w - 2, h, P.ink);
        g.R(bx, by + 1, w, h - 2, P.ink);
        g.R(bx + 1, by + 1, w - 2, h - 2, fill);
        g.R(x - 2, by + h - 1, 4, 1, P.ink);
        g.R(x - 1, by + h - 1, 2, 1, fill);
        g.R(x - 1, by + h, 2, 2, P.ink);
        g.text(str, bx + w / 2, by + 3, { size, col: o.col || P.ink, align: 'center' });
      }
      // 画面に見えている区切り（長さ L ごと）を、下から順に
      function eachSeg(L, fn) {
        const k0 = Math.floor((dist + FEET - H) / L) - 1, k1 = Math.floor((dist + FEET - 12) / L) + 1;
        for (let k = k0; k <= k1; k++) fn(k, sy(k * L));
      }
      // ディザでぬった、だ円（街灯の明かりなど）
      function glow(g, cx, cy, rx, ry, col, x0, x1) {
        for (let dy = -ry; dy <= ry; dy++) {
          const w = Math.floor(rx * Math.sqrt(1 - (dy * dy) / (ry * ry)));
          let a = cx - w, b = cx + w;
          if (x0 != null) { a = Math.max(a, x0); b = Math.min(b, x1); }
          if (b > a) g.dither(a, cy + dy, b - a, 1, col, (cy + dy) & 1);
        }
      }
      function ellipseRing(g, cx, cy, rx, ry, col) {
        for (let i = 0; i < 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          g.R(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1, col);
        }
      }

      function drawStreet(g) {
        // 車道
        g.R(ROAD_L, 12, ROAD_R - ROAD_L, H - 12, P.xdgray);
        eachSeg(16, (k, y) => {
          for (let i = 0; i < 5; i++) {
            const hx = ROAD_L + 2 + Math.floor(hash(k, i) * (ROAD_R - ROAD_L - 4));
            g.R(hx, y - Math.floor(hash(k, i + 7) * 16), 1, 1, i % 2 ? P.ink : '#4c4c50');
          }
        });
        // 白い線（車道の外側）
        g.R(ROAD_L + 3, 12, 2, H - 12, P.gray);
        g.R(ROAD_R - 5, 12, 2, H - 12, P.gray);
        // 歩道・縁石・ブロック塀
        g.R(32, 12, 16, H - 12, '#5c5c64');
        g.R(208, 12, 16, H - 12, '#5c5c64');
        g.R(46, 12, 2, H - 12, P.gray);
        g.R(208, 12, 2, H - 12, P.gray);
        g.R(26, 12, 6, H - 12, P.dgray);
        g.R(224, 12, 6, H - 12, P.dgray);
        eachSeg(16, (k, y) => {
          g.R(32, y, 14, 1, P.xdgray);
          g.R(210, y, 14, 1, P.xdgray);
          g.R(26, y - (k & 1 ? 8 : 0), 6, 1, P.xdgray);
          g.R(224, y - (k & 1 ? 0 : 8), 6, 1, P.xdgray);
        });
        // 外（庭・家の屋根・木）
        g.R(0, 12, 26, H - 12, P.night);
        g.R(230, 12, 26, H - 12, P.night);
        eachSeg(64, (k, y) => {
          [[0, 26, 1], [230, 26, 2]].forEach(([x0, w, s]) => {
            const r = hash(k, s);
            if (r < 0.5) {
              // 屋根
              const col = [P.navy, P.xdred, P.dbrown, '#283048'][Math.floor(hash(k, s + 4) * 4)];
              g.R(x0 + 2, y - 58, w - 4, 50, col);
              g.R(x0 + 2, y - 34, w - 4, 2, P.ink);
              g.R(x0 + 2, y - 58, w - 4, 1, '#5c5c7c');
              if (hash(k, s + 8) < 0.5) g.R(x0 + 6 + Math.floor(hash(k, s + 9) * (w - 14)), y - 16, 4, 3, P.lyellow); // 窓のあかり
            } else if (r < 0.8) {
              // 木
              const cx = x0 + w / 2 + Math.floor(hash(k, s + 5) * 6) - 3, cy = y - 30;
              g.disc(cx, cy, 11, P.dgreen);
              g.disc(cx - 3, cy - 3, 6, '#1c7c34');
              g.R(cx - 5, cy - 6, 2, 2, P.green);
            } else {
              // 駐車場
              g.R(x0 + 1, y - 62, w - 2, 58, '#24242c');
              g.R(x0 + 1, y - 34, w - 2, 1, P.lgray);
            }
          });
        });
        // 街灯（左右かわりばんこ）と、道の明かり
        eachSeg(160, (k, y) => {
          const left = k & 1;
          const px = left ? 40 : 216, lx = left ? 58 : 198;
          glow(g, lx, y - 2, 30, 14, '#58585c', ROAD_L, ROAD_R);
          g.R(px - 1, y - 44, 3, 44, P.dgray);
          g.R(px - 1, y - 44, 1, 44, P.gray);
          g.R(Math.min(px, lx), y - 46, Math.abs(lx - px) + 1, 2, P.dgray);
          g.R(lx - 3, y - 47, 7, 3, P.lyellow);
          g.R(lx - 2, y - 44, 5, 1, P.white);
          g.shadow(px, y, 4);
        });
        // 自販機（ときどき歩道に）
        eachSeg(224, (k, y) => {
          if (hash(k, 21) > 0.55) return;
          const right = hash(k, 22) < 0.5;
          const x = right ? 211 : 34;
          glow(g, x + 5, y - 6, 16, 8, '#38506c');
          g.R(x, y - 26, 11, 24, P.ink);
          g.R(x + 1, y - 25, 9, 22, right ? P.red : P.mblue);
          g.R(x + 2, y - 23, 7, 8, P.lsky);
          for (let i = 0; i < 3; i++) g.R(x + 2 + i * 2 + (i ? 1 : 0), y - 22, 1, 3, [P.yellow, P.white, P.lime][i]);
          g.R(x + 2, y - 12, 7, 2, P.ink);
        });
      }

      // スタートのコンビニ（下のほう）
      function drawStore(g) {
        const y0 = sy(-12); // 歩道のはし
        if (y0 >= H) return;
        // 店の前のあかり
        g.R(ROAD_L - 22, y0, ROAD_R - ROAD_L + 44, H - y0, '#5c5c64');
        glow(g, 128, y0 + 2, 96, 22, P.lyellow, ROAD_L - 22, ROAD_R + 22);
        // 店（看板とガラス）
        const by = y0 + 12;
        if (by < H) {
          g.R(20, by, 216, H - by, P.ink);
          g.R(22, by + 1, 212, 10, P.white);
          g.R(22, by + 3, 212, 2, P.mblue);
          g.R(22, by + 7, 212, 2, P.lgreen);
          g.R(98, by, 60, 12, P.white);
          g.text('コンビニ', 128, by - 1, { size: 12, col: P.mblue, align: 'center' });
          g.R(22, by + 12, 212, H - by - 12, P.lsky);
          // たなと品物
          for (let i = 0; i < 6; i++) {
            const sx = 28 + i * 34;
            if (sx > 100 && sx < 150) continue;
            g.R(sx, by + 18, 24, 30, P.sky);
            for (let j = 0; j < 4; j++) for (let q = 0; q < 5; q++) g.R(sx + 2 + q * 4, by + 20 + j * 7, 3, 4, [P.red, P.yellow, P.lgreen, P.white, P.orange][(i + j + q) % 5]);
          }
          // 自動ドア
          g.R(108, by + 12, 40, H - by - 12, P.white);
          g.R(110, by + 14, 17, H - by - 14, P.lsky);
          g.R(129, by + 14, 17, H - by - 14, P.lsky);
          g.R(127, by + 12, 2, H - by - 12, P.lgray);
        }
      }

      // ゴールの寮（上のほう）
      function drawDorm(g) {
        if (!goal && dist < EST_GOAL - 260) return;
        const gl = goal || EST_GOAL;
        const gy = sy(gl); // 門の線
        if (gy < 0) return;
        // 敷地
        g.R(16, 12, 224, Math.max(0, gy - 12), '#4c4c54');
        // 建物（正面が見える）
        const top = gy - 168, bot = gy - 40;
        if (bot > 12) {
          g.R(16, top, 224, bot - top, P.ink);
          g.R(18, top + 2, 220, bot - top - 2, '#c8b890');
          g.R(18, top + 2, 220, 4, '#8c7c64');
          for (let f = 0; f < 3; f++) {
            for (let i = 0; i < 10; i++) {
              if (f === 0 && (i === 4 || i === 5)) continue;
              const wx = 26 + i * 21, wy = bot - 30 - f * 40;
              const lit = hash(i, f + 30) < 0.55;
              g.R(wx, wy, 14, 16, P.ink);
              g.R(wx + 1, wy + 1, 12, 14, lit ? P.lyellow : P.navy);
              g.R(wx + 1, wy + 8, 12, 1, P.ink);
              if (lit && hash(i, f + 40) < 0.4) g.R(wx + 3, wy + 9, 4, 6, P.orange); // カーテン
            }
          }
          // 玄関
          g.R(108, bot - 30, 40, 30, P.ink);
          g.R(110, bot - 28, 36, 28, P.lyellow);
          g.R(127, bot - 28, 2, 28, P.ink);
          g.R(104, bot - 34, 48, 4, P.dgray);
        }
        // 玄関までの通路と、門
        g.R(100, bot, 56, Math.max(0, gy - bot), '#6c6c74');
        const pillars = [[34, 'l'], [206, 'r']];
        pillars.forEach(([px, s]) => {
          g.R(px, gy - 40, 18, 42, P.ink);
          g.R(px + 1, gy - 39, 16, 40, P.lgray);
          g.R(px + 1, gy - 39, 16, 3, P.white);
          g.R(px + 13, gy - 36, 3, 37, P.gray);
          if (s === 'l') {
            // 表札「夕照寮」（たて書き）
            g.R(px + 3, gy - 34, 11, 32, P.dbrown);
            g.R(px + 4, gy - 33, 9, 30, P.cream);
            ['夕', '照', '寮'].forEach((ch, i) => g.text(ch, px + 9, gy - 33 + i * 10, { size: 12, col: P.ink, align: 'center' }));
          }
        });
        // あいている門の戸
        g.R(52, gy - 24, 6, 26, P.dgray);
        g.R(198, gy - 24, 6, 26, P.dgray);
        for (let i = 0; i < 3; i++) { g.R(53, gy - 20 + i * 8, 4, 1, P.gray); g.R(199, gy - 20 + i * 8, 4, 1, P.gray); }
      }

      function drawDecal(g, d) {
        const y = sy(d.wy);
        if (y < 6 || y > H + 10) return;
        const c0 = d.col[0], c1 = d.col[1];
        g.oval(d.x, y, 10, 4, c0);
        for (let i = 0; i < 5; i++) {
          const a = hash(d.k, i) * Math.PI * 2, r = 9 + hash(d.k, i + 5) * 6;
          g.disc(d.x + Math.cos(a) * r, y + Math.sin(a) * r * 0.4, 1 + Math.floor(hash(d.k, i + 9) * 2), c0);
        }
        g.oval(d.x - 3, y - 1, 4, 1, c1);
      }

      // 人を 2 倍で（足もとが (x, y)）
      function person(g, kind, o, x, y, extra) {
        const fr = Math.floor(o.run || 0) % 4;
        const updown = o.dir === 'up' || o.dir === 'down';
        const img = api.person(kind, { dir: o.dir, frame: o.still ? 0 : fr % 2, naked: o.naked, variant: o.variant });
        g.shadow(x, y, 11);
        g.sprite(img, x - 16, y - 47, Object.assign({ scale: 2, flip: updown && !o.still && fr >= 2 }, extra));
      }
      function drawBike(g, o, y) {
        const cx = o.x, f = o.flip ? -1 : 1;
        if (o.hit) {
          // たおれた自転車
          g.oval(cx, y - 2, 15, 3, P.ink);
          g.oval(cx - 8, y - 2, 6, 2, P.dgray);
          g.oval(cx + 8, y - 2, 6, 2, P.dgray);
          g.R(cx - 10, y - 3, 20, 1, P.red);
          return;
        }
        g.shadow(cx, y, 14);
        [-9, 9].forEach((dx) => { g.ring(cx + dx, y - 7, 6, P.ink); g.ring(cx + dx, y - 7, 5, P.gray); g.R(cx + dx, y - 7, 1, 1, P.lgray); });
        g.line(cx - 9, y - 7, cx - 2 * f, y - 7, P.red);
        g.line(cx - 9 * f, y - 7, cx - 3 * f, y - 15, P.red);
        g.line(cx - 3 * f, y - 15, cx + 5 * f, y - 15, P.red);
        g.line(cx - 2 * f, y - 7, cx + 5 * f, y - 15, P.red);
        g.line(cx + 5 * f, y - 15, cx + 9 * f, y - 7, P.lgray);
        g.R(cx - 6 * f - (f < 0 ? 5 : 0), y - 18, 6, 2, P.ink); // サドル
        g.R(cx + 4 * f - (f < 0 ? 5 : 0), y - 19, 6, 2, P.lgray); // ハンドル
        g.R(cx + 9 * f - (f < 0 ? 7 : 0), y - 17, 8, 5, P.lgray); // かご
        g.R(cx + 10 * f - (f < 0 ? 5 : 0), y - 16, 6, 3, P.dgray);
      }
      function drawPole(g, o, y) {
        const cx = o.x;
        g.shadow(cx, y, 7);
        g.R(cx - 5, y - 80, 10, 80, P.ink);
        g.R(cx - 4, y - 80, 8, 80, P.gray);
        g.R(cx - 4, y - 80, 2, 80, P.lgray);
        g.R(cx + 2, y - 80, 2, 80, P.dgray);
        // 黄色と黒のカバー
        g.R(cx - 6, y - 26, 12, 26, P.ink);
        for (let i = 0; i < 12; i++) g.R(cx - 5, y - 25 + i * 2, 10, 2, (Math.floor(i / 2) % 2) ? P.ink : P.yellow);
        // 腕木と碍子（がいし）
        g.R(cx - 14, y - 74, 28, 3, P.dgray);
        [-12, -4, 4, 12].forEach((dx) => g.R(cx + dx - 1, y - 77, 2, 3, P.white));
        if (o.hit) g.text('★', cx + 4, y - 40, { size: 12, col: P.yellow, outline: P.black });
      }
      function drawCone(g, o, y) {
        const cx = o.x;
        if (o.hit) {
          g.oval(cx, y - 3, 9, 3, P.orange);
          g.R(cx - 3, y - 4, 3, 2, P.white);
          return;
        }
        g.shadow(cx, y, 8);
        g.R(cx - 8, y - 3, 16, 3, P.dred);
        for (let i = 0; i < 15; i++) {
          const w = 1 + Math.floor(i * 0.42);
          g.R(cx - w, y - 18 + i, w * 2, 1, i >= 5 && i <= 8 ? P.white : P.orange);
        }
      }
      function drawBags(g, o, y) {
        const cx = o.x;
        g.shadow(cx, y, 14);
        [[-7, -6, 7], [6, -7, 8], [-1, -12, 7]].forEach(([dx, dy, r]) => {
          g.disc(cx + dx, y + dy, r + 1, P.ink);
          g.disc(cx + dx, y + dy, r, P.lgray);
          g.disc(cx + dx - 2, y + dy - 2, Math.max(1, r - 4), P.white);
        });
        if (!o.hit) g.dither(cx - 14, y - 19, 28, 16, P.green, 0); // カラスよけのネット
        else g.R(cx + 6, y - 22, 4, 2, P.lgray);
      }
      function drawObs(g, o) {
        const y = sy(o.wy);
        if (o.type === 'bike') drawBike(g, o, y);
        else if (o.type === 'pole') drawPole(g, o, y);
        else if (o.type === 'cone') drawCone(g, o, y);
        else drawBags(g, o, y);
      }
      function drawMe(g) {
        const y = FEET - me.outY;
        const still = me.splat || me.caught;
        const stumble = me.stumbleT > 0;
        const dir = me.face;
        if (me.safe && me.outY > 30) return; // 門の中へ入った
        person(g, 'otoko', { dir, run: me.run, naked: true, still }, me.x, y + (stumble ? 4 : 0));
        if (me.splat) {
          // ペンキまみれ
          const c = me.splatCol || BALL_COLS[0];
          [[-6, -40, 5], [5, -30, 6], [-3, -18, 5], [7, -12, 3], [-9, -26, 3], [2, -44, 3]].forEach(([dx, dy, r]) => g.disc(me.x + dx, y + dy, r, c[0]));
          g.R(me.x - 4, y - 42, 3, 2, c[1]);
          g.R(me.x + 4, y - 32, 3, 2, c[1]);
        }
        if (stumble) {
          // 目が回っている
          for (let i = 0; i < 3; i++) {
            const a = api.time * 9 + (i * Math.PI * 2) / 3;
            g.R(me.x + Math.round(Math.cos(a) * 10) - 1, y - 50 + Math.round(Math.sin(a) * 3), 3, 3, P.yellow);
          }
        }
      }

      function drawBall(g, b) {
        if (b.out) return;
        const owner = tenins[b.who];
        if (b.t < WIND) {
          // ふりかぶっている（店員の頭の上）
          g.disc(owner.x + 6, owner.y - 50, 4, P.ink);
          g.disc(owner.x + 6, owner.y - 50, 3, b.col[0]);
          g.R(owner.x + 5, owner.y - 52, 1, 1, b.col[1]);
          return;
        }
        const p = Math.min(1, (b.t - WIND) / (b.dur - WIND));
        const gx = api.lerp(b.sx, b.tx, p), gy = api.lerp(b.sy, FEET, p);
        const z = api.lerp(44, 0, p) + 4 * 60 * p * (1 - p);
        g.shadow(gx, gy, 4);
        const r = 3 + Math.round(z / 40);
        g.disc(gx, gy - z, r + 1, P.ink);
        g.disc(gx, gy - z, r, b.col[0]);
        g.R(gx - 1, gy - z - r + 1, 2, 1, b.col[1]);
      }
      function drawMarker(g, b) {
        if (b.out) return;
        const p = b.t / b.dur;
        const on = p > 0.6 ? Math.floor(b.t * 16) % 2 === 0 : Math.floor(b.t * 8) % 2 === 0;
        g.ctx.save();
        g.ctx.globalAlpha = 0.45 + p * 0.4;
        g.oval(b.tx, FEET, 11, 4, P.dred);
        g.ctx.restore();
        ellipseRing(g, b.tx, FEET, 12, 5, on ? P.red : P.lpink);
        if (p > 0.35) g.text('!', b.tx, FEET - 18, { size: 12, col: P.red, outline: P.white, align: 'center' });
      }

      // 右はしの、寮までの道のり
      function drawProgress(g) {
        const x = 247, top = 28, bot = 196;
        const gl = goal || EST_GOAL;
        g.R(x - 1, top, 4, bot - top, P.ink);
        g.R(x, top + 1, 2, bot - top - 2, P.dgray);
        g.text('寮', x + 1, 14, { size: 12, col: P.lyellow, outline: P.black, align: 'center' });
        g.text('店', x + 1, 198, { size: 12, col: P.lsky, outline: P.black, align: 'center' });
        const at = (d) => Math.round(bot - (bot - top) * api.clamp(d / gl, 0, 1));
        if (police.on) g.R(x - 2, at(dist - gap) - 1, 6, 3, P.mblue);
        else if (phase === 'balls') g.R(x - 2, at(dist - 60) - 1, 6, 3, P.sky);
        g.R(x - 2, at(dist) - 2, 6, 4, P.ink);
        g.R(x - 1, at(dist) - 1, 4, 2, P.red);
      }
      function drawGauge(g) {
        const x = 4, y = 186;
        g.box(x - 2, y - 2, 44, 36, { fill: P.navy });
        const low = boost < 14;
        g.text('A連打', x + 20, y + 4, { size: 12, col: low && g.blink(3) ? P.red : P.white, align: 'center' });
        g.bar(x + 4, y + 21, 32, 4, (speed - BASE2 * 0.2) / (BASE2 + BOOST_MAX - BASE2 * 0.2), mashT > 0 ? P.white : speed >= VP ? P.lgreen : P.yellow, P.xdgray);
      }

      return {
        me, balls, obs, tenins, police,
        get phase() { return phase; },
        get dist() { return dist; },
        get goal() { return goal; },
        get gap() { return gap; },
        get boost() { return boost; },
        get speed() { return speed; },
        get dodged() { return dodged; },
        get thrown() { return throwN; },
        get bumps() { return bumps; },
        // 画面の y（テスト用）
        screenY: (wy) => sy(wy),
        update(dt) {
          const t = api.time;
          if (say) { say.t -= dt; if (say.t <= 0) say = null; }
          for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t > fx[i].dur) fx.splice(i, 1); }
          mashT = Math.max(0, mashT - dt);
          if (t > 0.55 && me.face === 'down' && !me.caught) me.face = 'up';
          if (t < 0.05 && !say) talk(1, 'お客さーん！', 1.2);
          steer(dt);

          if (phase === 'balls' || phase === 'switch') {
            // 前半は一定の速さで走る（最初はゆっくり走り出す）
            if (me.splat) speed = api.approach(speed, 0, 160 * dt);
            else if (t > 0.5) speed = Math.min(RUN1, speed + RUN1 * 2.4 * dt);
            dist += speed * dt;
            // 連打は入れかわりの間から受けつける
            if (phase === 'switch' && (api.input.pressed('a') || api.input.tap)) { boost = Math.min(BOOST_MAX, boost + BOOST_ADD); mashT = 0.1; }
            boost *= Math.exp(-BOOST_DECAY * dt);
          }
          // 店員：男魂くんのうしろを追いかける
          tenins.forEach((tn, i) => {
            if (phase === 'balls' && !me.splat) {
              const want = api.clamp(me.x + (i ? 30 : -30), LANES[0], LANES[4]);
              tn.x = api.approach(tn.x, want, 50 * dt);
            }
            if (me.splat) tn.y = api.approach(tn.y, FEET + 34 + i * 4, 40 * dt);
            if (phase !== 'balls') { tn.slow += dt; tn.y += (20 + tn.slow * 70 + i * 20) * dt; }
            tn.run += dt * (me.splat && tn.y <= FEET + 40 ? 0 : 7);
          });

          if (phase === 'balls') {
            // 予定の時刻になったら投げる
            while (planI < plan.length && t >= plan[planI].t && !me.splat) {
              volley(plan[planI].kind, t);
              planI++;
            }
            balls.forEach((b) => {
              if (b.out) return;
              const before = b.t;
              b.t += dt;
              if (before < WIND && b.t >= WIND) {
                const o = tenins[b.who];
                b.sx = o.x + 6;
                b.sy = o.y;
                api.sfx('throw');
              }
              if (b.t >= b.dur) {
                land(b);
                if (!me.splat) dodged++;
              }
            });
            for (let i = balls.length - 1; i >= 0; i--) if (balls[i].out) balls.splice(i, 1);
            if (!me.splat && t >= P1_END && planI >= plan.length && !balls.length) {
              phase = 'switch';
              switchT = 0;
              talk(0, 'ハァ…ハァ…', 1.4);
            }
          } else if (phase === 'switch') {
            switchT += dt;
            if (switchT > 0.35 && !police.on) {
              police.on = true;
              police.x = me.x;
              gap = 140;
              api.sfx('siren');
              talk('police', 'まちなさーい！', 1.6);
            }
            if (police.on) gap = api.approach(gap, GAP0, 70 * dt);
            if (switchT >= SWITCH) startChase();
          } else if (phase === 'chase') {
            if (!api.ended) {
              // A連打で速く走る（画面のタップでもよい）
              if (api.input.pressed('a') || api.input.tap) {
                boost = Math.min(BOOST_MAX, boost + BOOST_ADD);
                mashT = 0.1;
              }
              boost *= Math.exp(-BOOST_DECAY * dt);
              speed = BASE2 + boost;
              if (me.stumbleT > 0) speed *= 0.2;
            } else speed = api.approach(speed, 0, 200 * dt);
            if (me.stumbleT > 0) me.stumbleT -= dt;
            dist += speed * dt;
            // おまわりさん（はなれすぎると、がんばって追いつく）
            if (!me.safe && !me.caught) {
              const vp = (easy ? VP - 6 : VP) + Math.max(0, gap - 84) * 1.5;
              gap += (speed - vp) * dt;
            } else if (me.caught) gap = api.approach(gap, CATCH - 2, 40 * dt);
            // じゃま物
            if (!api.ended) {
              obs.forEach((o) => {
                if (o.hit || me.stumbleT > 0) return;
                if (Math.abs(me.x - o.x) < 17 && Math.abs(o.wy - dist) < 6) {
                  o.hit = true;
                  bumps++;
                  me.stumbleT = 0.6;
                  boost *= 0.5;
                  api.sfx('damage');
                  api.shake(2, 0.25);
                  pop(OBS[o.type].hit, o.x, FEET - 58, P.yellow, 0.9);
                }
              });
              if (gap <= CATCH) caught();
              else if (dist >= goal) safe();
            }
          }
          if (police.on) {
            police.x = api.approach(police.x, me.x, 70 * dt);
            police.run += dt * (me.caught ? 0 : me.safe ? 3 : 8);
          }
          if (me.safe) me.outY += 46 * dt;
          if (!me.splat && !me.caught && !(me.safe && me.outY > 30)) me.run += dt * Math.max(3, speed / 9);
          if (api.ended) endT += dt;
        },
        timeup() {
          if (!api.ended) {
            me.caught = true;
            me.face = 'down';
            talk('police', '確保ーっ！', 2);
          }
        },
        draw(g) {
          drawStreet(g);
          drawStore(g);
          drawDorm(g);
          decals.forEach((d) => drawDecal(g, d));
          balls.forEach((b) => drawMarker(g, b));
          // 人とじゃま物は、奥（上）から順に
          const list = [];
          obs.forEach((o) => { const y = sy(o.wy); if (y > -10 && y < H + 90) list.push({ y, f: () => drawObs(g, o) }); });
          list.push({ y: FEET - me.outY, f: () => drawMe(g) });
          tenins.forEach((tn, i) => {
            if (tn.y < H + 50) list.push({ y: tn.y, f: () => person(g, 'tenin', { dir: 'up', run: tn.run, variant: 1 }, tn.x + (i ? 1 : 0), tn.y) });
          });
          if (police.on) {
            const py = FEET + gap;
            if (py < H + 50) list.push({ y: py, f: () => person(g, 'police', { dir: 'up', run: police.run, still: me.caught }, police.x, py) });
          }
          list.sort((a, b) => a.y - b.y).forEach((it) => it.f());
          balls.forEach((b) => drawBall(g, b));

          // 吹き出しと文字
          if (say) {
            if (say.who === 'police' && police.on) bubble(g, police.x, Math.min(H - 30, FEET + gap - 50), say.str, { col: P.blue });
            else if (say.who !== 'police') {
              const tn = tenins[say.who];
              if (tn.y < H + 20) bubble(g, tn.x, Math.min(H - 30, tn.y - 50), say.str, { col: P.dred });
            }
          }
          fx.forEach((f) => {
            const k = f.t / f.dur;
            g.text(f.str, f.x, f.y - k * 10, { size: 16, col: f.col, outline: P.black, align: 'center' });
          });
          if (api.time < 2.6 && phase === 'balls' && !me.splat) {
            g.R(40, 16, 176, 18, P.ink);
            g.text('赤い輪からよけろ！', 128, 18, { size: 12, col: P.lyellow, align: 'center' });
          }
          if (phase === 'switch' && police.on && !api.ended) {
            g.box(48, 38, 160, 50);
            g.text('おまわりさんだ！', 128, 46, { col: P.lsky, align: 'center' });
            if (g.blink(3)) g.text('A連打で走れ！', 128, 66, { col: P.yellow, align: 'center' });
          }
          if (phase === 'chase' || (phase === 'switch' && police.on)) {
            drawGauge(g);
            if (gap < 34 && !api.ended && g.blink(4)) {
              g.frame(0, 12, W, H - 12, P.red);
              g.frame(1, 13, W - 2, H - 14, P.red);
            }
          }
          if (me.safe && endT > 0.5) {
            g.R(0, 204, W, 18, P.black);
            g.text('※このあと、ちゃんと服を着ました。', W / 2, 207, { size: 12, col: P.white, align: 'center' });
          }
          drawProgress(g);
        },
      };
    },
  });
})();
