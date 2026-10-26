/*
 * 4月 新歓「飲むか吐くか」
 *  座卓を 7 人でかこむ（男魂くん＋先輩・同期 6 人）。コールが 1 人ずつ回っていき、止まった人が飲む。
 *  - コールが男魂くんで止まったら A（飲む）。止まっていないのに A、自分の番を見のがす、はミス
 *  - 飲むと酔いゲージが上がる。赤い「限界」に入ったら、次の番までに B（吐く）。限界のまま飲むとダウン
 *  - 限界でないのに B もミス。ミス 3 回かダウンで負け。30 秒もちこたえればクリア
 *  - コールはだんだん速くなる。10 秒をすぎると、ぎゃく回りもある
 * コールの文句は、このゲームのために作ったもの（実在の一気コールは使わない）。
 */
(function () {
  'use strict';

  const N = 7; // 座る人数
  const RED = 70; // 酔いゲージ（0〜100）がここから上だと「限界」
  const TATAMI = '#b0a448', TATAMI_L = '#bcb058', TATAMI_D = '#8c8034';

  // 席。0 が男魂くんで、そこから時計回り。x は真ん中、y は絵の上はし（2 倍で描く）
  // row：top は座卓の向こう（下半身は座卓でかくれる）、side は左右のはし、bottom は手前（背中が見える）
  const SEATS = [
    { kind: 'otoko', v: 0, x: 128, y: 38, dir: 'down', row: 'top' },
    { kind: 'senpai', v: 1, x: 178, y: 38, dir: 'down', row: 'top' },
    { kind: 'douki', v: 1, x: 228, y: 66, dir: 'left', row: 'side' },
    { kind: 'senpai', v: 2, x: 162, y: 106, dir: 'up', row: 'bottom' },
    { kind: 'douki', v: 4, x: 94, y: 106, dir: 'up', row: 'bottom' },
    { kind: 'senpai', v: 3, x: 28, y: 66, dir: 'right', row: 'side' },
    { kind: 'senpai', v: 0, x: 78, y: 38, dir: 'down', row: 'top' },
  ];
  // 座卓の上のジョッキの置き場所（左上）
  const MUG = [[138, 72], [188, 72], [199, 82], [142, 96], [107, 96], [49, 82], [88, 72]];
  const TABLE = { x: 46, y: 70, w: 164, h: 44 };

  // コール（オリジナル）。文句を 1 人ずつ回していき、止まった人に「のめ！」
  const CALLS = [
    { name: 'ぐるぐるコール', words: ['ぐるぐる', 'まわるよ', 'コールが', 'まわる'] },
    { name: '夕照コール', words: ['ゆうしょう', 'りょうの', 'よるは', 'ながい'] },
    { name: 'だれの番コール', words: ['あっちか', 'こっちか', 'だれの', 'ばんだ'] },
    { name: 'テーブルコール', words: ['トン', 'トン', 'テーブル', 'トントン'] },
    { name: 'さくらコール', words: ['さくら', 'さいたら', 'しんかん', 'だよ'] },
    { name: 'かぞえうた', words: ['いち', 'にの', 'さん', 'どこで', 'とまる'] },
  ];
  // まちがえたときの、先輩のひとこと
  const SCOLD = {
    a: ['まだだよ！', 'フライング！', 'キミじゃない！'],
    b: ['吐くの早い！', 'まだいけるだろ', 'もったいない！'],
    miss: ['キミの番だよ！', 'ねてる？', 'おーい！'],
  };
  const CHEER = ['おー！', 'いいね！', 'さすが！', 'おみごと'];

  OTK.register({
    id: 'nomu',
    order: 1,
    month: 4,
    event: '新歓',
    title: '飲むか吐くか',
    goal: '飲め！ 吐け！',
    howto: ['A：自分の番で飲む', 'B：限界になったら吐く', 'まちがい3回で負け'],
    note: 'お酒は二十歳になってから。一気飲みは絶対にやめましょう。',
    time: 30,
    timeout: 'win',
    timeoutMsg: '新歓を のりきった！\n先輩に 顔を\nおぼえてもらえた。',
    bgm: 'play',
    create(api) {
      const P = api.P;
      const easy = Math.min(3, api.tries | 0); // しっぱいするたびに、少しゆっくり
      const st = {
        t: 0,
        phase: 'start', // start（かんぱい）→ call（コールが回る）→ land（止まった）→ drink（飲む）→ call …／over
        phaseT: 1.0, // start・land・drink の残り時間
        pos: api.irnd(1, N - 1), // いまコールを言っている席
        dir: 1,
        step: 0,
        steps: 0, // 何歩目で止まるか
        beatT: 0,
        call: CALLS[0],
        reverse: false,
        nameT: 0,
        target: -1, // コールが止まる席
        lastTarget: -1,
        sinceMe: 0, // 男魂くん以外で止まった回数（2 回つづいたら、次は男魂くん）
        winMax: 1, // 自分の番の長さ
        drinker: -1,
        gauge: api.rnd(6, 14), // 酔いゲージ
        shown: 0, // 表示用（なめらかに動かす）
        mistakes: 0,
        missKind: '',
        missT: 0,
        cups: 0,
        okT: -9, // 最後に飲んだ時刻（連打を見のがす）
        vomitAt: -9,
        vomitT: 0,
        vomits: 0,
        down: false,
        downT: 0,
        scold: null,
        cheers: [],
        npcCups: new Array(N).fill(0),
        full: new Array(N).fill(1), // ジョッキの中身
      };
      st.shown = st.gauge;

      const k = () => Math.min(1, st.t / 26); // だんだん速く
      const beatLen = () => api.lerp(0.4, 0.24, k()) * (1 + 0.08 * easy);
      const windowLen = () => api.lerp(1.0, 0.72, k()) + 0.1 * easy;
      const red = () => st.gauge >= RED;
      const mine = () => st.phase === 'land' && st.target === 0;

      // 次のコールを、from の席から始める
      function nextCall(from) {
        st.call = api.pick(CALLS);
        st.reverse = st.t > 10 && api.chance(0.3);
        st.dir = st.reverse ? -1 : 1;
        let pMe = st.lastTarget === 0 ? 0.3 : 0.5;
        if (st.sinceMe >= 2) pMe = 1;
        // 何歩で着くか（少なくとも 3 歩は回ってから止まる）
        const dist = (to) => {
          const d = ((((to - from) * st.dir) % N) + N) % N;
          return d < 3 ? d + N : d;
        };
        let target;
        if (api.chance(pMe)) target = 0;
        else {
          // 先輩・同期のときは、あまり長く回らない人を選ぶ（テンポをよくする）
          const c = [];
          for (let i = 1; i < N; i++) if (i !== st.lastTarget && dist(i) <= 6) c.push(i);
          target = c.length ? api.pick(c) : api.irnd(1, N - 1);
        }
        const d = dist(target);
        st.target = target;
        st.steps = d;
        st.step = 0;
        st.pos = from;
        st.beatT = beatLen();
        st.phase = 'call';
        st.nameT = 1.2;
        st.drinker = -1;
        st.full.fill(1); // 先輩がつぎたす
        api.sfx('cursor');
      }
      function land() {
        st.phase = 'land';
        st.lastTarget = st.target;
        if (st.target === 0) {
          st.sinceMe = 0;
          st.winMax = st.phaseT = windowLen();
          api.sfx('go');
        } else {
          st.sinceMe++;
          st.phaseT = 0.3;
          api.sfx('select');
        }
      }
      function cheer(drinker) {
        const c = [];
        for (let i = 1; i < N; i++) if (i !== drinker) c.push(i);
        st.cheers = api.shuffle(c).slice(0, 2).map((seat) => ({ seat, text: api.pick(CHEER), t: 0.75 }));
      }
      function mistake(kind) {
        st.mistakes++;
        st.missKind = kind;
        st.missT = 1.0;
        api.sfx('ng');
        api.shake(2, 0.2);
        const who = [1, 6, 2, 5].filter((i) => i !== st.pos && i !== st.target);
        st.scold = { seat: api.pick(who), text: api.pick(SCOLD[kind]), t: 1.1 };
        if (st.mistakes >= 3) {
          st.phase = 'over';
          api.lose('空気が読めず、\n先輩に 正座で\n説教された。', { wait: 1.0 });
        }
      }
      function pressA() {
        if (st.t - st.okT < 0.3) return; // 飲んだ直後の連打は見のがす
        if (mine()) {
          if (red()) {
            // 限界のまま飲んだ
            st.down = true;
            st.downT = 0;
            st.phase = 'over';
            api.sfx('damage');
            api.shake(4, 0.4);
            api.flash(P.white, 0.15);
            api.lose('限界をこえて ダウン。\n気づけば 朝の\n玄関だった。', { wait: 1.6 });
            return;
          }
          st.okT = st.t;
          st.cups++;
          st.gauge = Math.min(100, st.gauge + api.rnd(24, 34));
          st.phase = 'drink';
          st.drinker = 0;
          st.phaseT = 0.55;
          api.sfx('drink');
          cheer(0);
          return;
        }
        mistake('a');
      }
      function pressB() {
        if (st.t - st.vomitAt < 0.35) return; // 吐いた直後の連打は見のがす
        if (red()) {
          st.vomitAt = st.t;
          st.vomitT = 0.9;
          st.vomits++;
          st.gauge = api.rnd(4, 10);
          api.sfx('vomit');
          return;
        }
        mistake('b');
      }

      // ── 描く ──────────────────────────────────────
      function drawRoom(g) {
        g.clear(P.night);
        // ふすま
        g.R(0, 12, 256, 16, P.cream);
        for (let x = 0; x < 256; x += 32) {
          g.R(x, 12, 1, 16, P.tan);
          g.R(x + 23, 19, 3, 3, P.brown);
        }
        g.R(0, 26, 256, 2, P.dbrown);
        // 新歓の貼り紙
        g.R(6, 13, 30, 12, P.white);
        g.frame(6, 13, 30, 12, P.gray);
        g.text('新歓', 21, 13, { size: 12, align: 'center', col: P.red });
        g.R(220, 13, 30, 12, P.white);
        g.frame(220, 13, 30, 12, P.gray);
        g.text('祝！', 235, 13, { size: 12, align: 'center', col: P.red });
        // たたみ（横長の 2 枚を、段ごとにずらして敷く）
        g.R(0, 28, 256, 124, TATAMI);
        for (let y = 30; y < 152; y += 3) g.R(0, y, 256, 1, TATAMI_L);
        for (let row = 0; row < 4; row++) {
          const y = 28 + row * 32;
          const off = row % 2 ? -32 : 0;
          g.R(0, y, 256, 2, P.dgreen); // へり
          for (let x = off; x < 256; x += 64) g.R(x, y + 2, 1, 30, TATAMI_D);
        }
      }
      function drawTable(g) {
        const T = TABLE;
        g.R(T.x - 1, T.y - 1, T.w + 2, T.h + 9, P.ink);
        g.R(T.x, T.y + T.h, T.w, 7, P.dbrown); // 手前の板の厚み
        g.R(T.x, T.y, T.w, T.h, P.brown);
        g.R(T.x, T.y, T.w, 1, P.lorange);
        for (let i = 0; i < 5; i++) g.R(T.x + 6 + i * 31, T.y + 6 + (i % 3) * 12, 18, 1, '#9a6c00'); // 木目
        // 大皿：えだまめ・からあげ・ポテト
        dish(g, 64, 104, P.green, P.lgreen);
        dish(g, 128, 104, P.orange, P.lorange);
        dish(g, 191, 104, P.yellow, P.lyellow);
      }
      function dish(g, cx, cy, c1, c2) {
        g.oval(cx, cy + 1, 11, 5, P.dgray);
        g.oval(cx, cy, 11, 5, P.white);
        g.oval(cx, cy, 8, 3, P.lgray);
        for (let i = 0; i < 6; i++) g.R(cx - 6 + (i % 3) * 4 + (i < 3 ? 0 : 2), cy - 2 + (i < 3 ? 0 : 2), 3, 2, i % 2 ? c1 : c2);
      }
      // ジョッキ（fill は中身の量 0〜1）
      function mug(g, x, y, fill) {
        x = Math.round(x);
        y = Math.round(y);
        g.R(x, y, 7, 10, P.ink);
        g.R(x + 7, y + 2, 2, 1, P.ink);
        g.R(x + 8, y + 2, 1, 6, P.ink);
        g.R(x + 7, y + 7, 2, 1, P.ink);
        g.R(x + 1, y + 1, 5, 8, P.lsky);
        const h = Math.round(8 * Math.max(0, Math.min(1, fill)));
        if (h > 0) {
          g.R(x + 1, y + 9 - h, 5, h, P.yellow);
          g.R(x + 1, y + 9 - h, 5, Math.min(2, h), P.white); // 泡
        }
        g.R(x + 2, y + 3, 1, 4, 'rgba(255,255,255,0.55)');
      }
      function cushion(g, cx, y) {
        g.R(cx - 17, y, 34, 12, P.ink);
        g.R(cx - 16, y + 1, 32, 10, P.violet);
        g.R(cx - 14, y + 2, 28, 1, P.pink);
        g.R(cx - 18, y - 1, 2, 2, P.yellow);
        g.R(cx + 16, y - 1, 2, 2, P.yellow);
      }
      // 話している人の足もとの光
      function glow(g, i, col) {
        const s = SEATS[i];
        const cy = s.row === 'top' ? s.y + 20 : s.y + 26;
        g.ctx.save();
        g.ctx.globalAlpha = 0.55;
        g.oval(s.x, cy, 21, 15, col);
        g.ctx.restore();
      }
      function drawSeat(g, i) {
        const s = SEATS[i];
        const me = i === 0;
        let dir = s.dir;
        if (me && st.vomitT > 0) dir = 'up'; // 吐くときは、みんなに背を向ける
        const img = api.person(s.kind, { dir, variant: s.v });
        let x = s.x - 16;
        let y = s.y;
        if (me && red() && !st.down && st.vomitT <= 0) x += Math.round(Math.sin(st.t * 5) * 2); // ふらふら
        if (st.phase === 'drink' && st.drinker === i) y -= 2; // のけぞって飲む
        if (s.row === 'top') {
          if (me && st.down) return; // ダウンしたら、座卓のあとで描く（つっぷす）
          g.sprite(img, x, y, { scale: 2 });
        } else {
          // 座ぶとんに座っている（上半身だけ描く）
          const rows = s.row === 'side' ? 19 : 18;
          cushion(g, s.x, y + rows * 2 - 8);
          g.ctx.drawImage(img, 0, 0, 16, rows, x, y, 32, rows * 2);
        }
        // 顔の赤み
        const cheeks = (col, w) => {
          if (dir === 'down') { g.R(x + 10 - (w - 2), y + 16, w, 2, col); g.R(x + 20, y + 16, w, 2, col); }
          else if (dir === 'left') g.R(x + 10, y + 16, w, 2, col);
          else if (dir === 'right') g.R(x + 20, y + 16, w, 2, col);
        };
        if (me && !st.down) {
          if (red()) {
            cheeks(P.red, 4);
            if (g.blink(3)) { g.R(x + 27, y + 4, 2, 3, P.lsky); g.R(x + 26, y + 5, 1, 1, P.white); }
          } else if (st.shown >= 35) cheeks(P.pink, 2);
        } else if (!me && st.npcCups[i] >= 2 && dir !== 'up') cheeks(st.npcCups[i] >= 3 ? P.rose : P.pink, 2);
      }
      // 飲んでいる人の手にあるジョッキ
      function drinkingMug(g, i, fill) {
        const s = SEATS[i];
        if (s.row === 'top') mug(g, s.x - 4, s.y + 10, fill);
        else if (s.dir === 'right') mug(g, s.x + 8, s.y + 10, fill);
        else if (s.dir === 'left') mug(g, s.x - 16, s.y + 10, fill);
        else mug(g, s.x - 3, s.y - 8, fill);
      }
      // ふきだし（下のはしが by、しっぽは cx）
      function bubble(g, cx, by, str, o) {
        o = o || {};
        const size = o.size || 12;
        const w = g.measure(str, size) + 10;
        const h = size + 6;
        let x = Math.round(cx - w / 2);
        x = Math.max(2, Math.min(254 - w, x));
        const y = Math.max(13, by - h - 3);
        const bg = o.bg || P.white;
        g.R(x + 1, y, w - 2, h, P.ink);
        g.R(x, y + 1, w, h - 2, P.ink);
        g.R(x + 1, y + 1, w - 2, h - 2, bg);
        // しっぽ
        const tx = Math.round(cx);
        g.R(tx - 3, y + h - 1, 7, 1, bg);
        g.R(tx - 2, y + h, 5, 1, P.ink);
        g.R(tx - 1, y + h, 3, 1, bg);
        g.R(tx - 1, y + h + 1, 3, 1, P.ink);
        g.R(tx, y + h + 1, 1, 1, bg);
        g.R(tx, y + h + 2, 1, 1, P.ink);
        g.text(str, x + 5, y + 3, { size, col: o.col || P.ink });
      }
      function headTop(i) {
        return SEATS[i].y - 1;
      }
      // 虹（背を向けた男魂くんの頭の上に、アーチをえがく）
      function rainbow(g) {
        const s = SEATS[0];
        const cx = s.x, cy = s.y + 12;
        const age = 0.9 - st.vomitT;
        const prog = Math.min(1, age / 0.25);
        const cols = [P.red, P.orange, P.yellow, P.lgreen, P.sky, P.purple];
        g.ctx.save();
        if (st.vomitT < 0.2) g.ctx.globalAlpha = Math.max(0, st.vomitT / 0.2);
        for (let b = 0; b < cols.length; b++) {
          const r = 19 - b * 2;
          for (let a = Math.PI; a >= Math.PI * (1 - prog); a -= 0.03) {
            g.R(cx + Math.cos(a) * r, cy - Math.sin(a) * r, 2, 2, cols[b]);
          }
        }
        // きらきら
        for (let j = 0; j < 7; j++) {
          const a = Math.PI * (1 - j / 6) * prog + Math.PI * (1 - prog);
          const r = 23 + ((j * 3) % 4);
          const sx = Math.round(cx + Math.cos(a) * r), sy = Math.round(cy - Math.sin(a) * r);
          if (Math.floor(st.t * 10 + j) % 2) {
            g.R(sx - 2, sy, 5, 1, P.white);
            g.R(sx, sy - 2, 1, 5, P.white);
          } else g.R(sx, sy, 1, 1, P.lyellow);
        }
        g.ctx.restore();
      }
      // ダウン：座卓につっぷす（頭のてっぺんと背中が見える）
      function drawDown(g) {
        const s = SEATS[0];
        const k = Math.min(1, st.downT / 0.25);
        const y = Math.round(s.y + k * 20);
        const img = api.person('otoko', { dir: k < 1 ? 'down' : 'up' });
        g.ctx.drawImage(img, 0, 0, 16, 17, s.x - 16, y, 32, 34);
        if (k >= 1) {
          // 座卓にのせた腕
          g.R(s.x - 19, y + 26, 8, 6, P.ink);
          g.R(s.x - 18, y + 27, 6, 4, P.skin);
          g.R(s.x + 11, y + 26, 8, 6, P.ink);
          g.R(s.x + 12, y + 27, 6, 4, P.skin);
        }
      }
      function stars(g) {
        const s = SEATS[0];
        const a0 = st.downT * 5;
        const cx = s.x, cy = s.y + 18;
        for (let j = 0; j < 3; j++) {
          const a = a0 + (j * Math.PI * 2) / 3;
          const sx = Math.round(cx + Math.cos(a) * 14), sy = Math.round(cy + Math.sin(a) * 5);
          g.R(sx - 1, sy, 3, 1, P.yellow);
          g.R(sx, sy - 1, 1, 3, P.yellow);
        }
      }
      function drawPanel(g) {
        g.box(4, 152, 248, 70);
        // 酔いゲージ
        g.text('酔い', 14, 161, { size: 12, col: P.lyellow });
        const bx = 42, by = 161, bw = 136, bh = 12;
        const rx = bx + Math.round((bw * RED) / 100);
        g.R(bx - 1, by - 1, bw + 2, bh + 2, P.black);
        g.R(bx, by, bw, bh, P.xdgray);
        g.R(rx, by, bx + bw - rx, bh, P.xdred);
        const fw = Math.round((bw * Math.min(100, st.shown)) / 100);
        const col = st.shown >= RED ? P.red : st.shown >= 45 ? P.yellow : P.lgreen;
        g.R(bx, by, fw, bh, col);
        g.R(bx, by, fw, 2, 'rgba(255,255,255,0.35)');
        g.R(rx, by - 1, 1, bh + 2, P.white);
        g.text('限界', rx + (bx + bw - rx) / 2, by, { size: 12, align: 'center', col: st.shown >= RED && g.blink(3) ? P.yellow : P.lpink, outline: P.black });
        // ミス
        g.text('ミス', 186, 161, { size: 12, col: P.lyellow });
        for (let i = 0; i < 3; i++) {
          const x = 211 + i * 12, y = 161;
          g.R(x, y, 10, 11, P.black);
          g.R(x + 1, y + 1, 8, 9, i < st.mistakes ? P.red : P.navy);
          if (i < st.mistakes) for (let j = 0; j < 6; j++) { g.R(x + 2 + j, y + 2 + j, 1, 1, P.white); g.R(x + 7 - j, y + 2 + j, 1, 1, P.white); }
        }
        // ひとこと
        let msg = 'キミで止まったら飲め', mcol = P.white;
        if (st.phase === 'over') {
          msg = st.down ? 'ダウン…' : 'ミス 3回…';
          mcol = P.lsky;
        } else if (st.missT > 0) {
          msg = st.missKind === 'a' ? 'ミス！ キミの番じゃない' : st.missKind === 'b' ? 'ミス！ まだ限界じゃない' : 'ミス！ 飲みわすれた';
          mcol = P.red;
        } else if (mine()) {
          msg = red() ? '限界！ 先にBで吐け！' : 'キミの番！ Aで飲め！';
          mcol = red() ? (g.blink(4) ? P.red : P.lorange) : P.yellow;
        } else if (st.vomitT > 0) {
          msg = 'キラキラ～ スッキリ！';
          mcol = P.lgreen;
        } else if (red()) {
          msg = '限界だ！ Bで吐け！';
          mcol = g.blink(3) ? P.red : P.lorange;
        }
        g.text(msg, 128, 177, { align: 'center', col: mcol, outline: P.black });
        if (mine() && !api.ended) {
          const ratio = Math.max(0, st.phaseT / st.winMax);
          g.bar(70, 196, 116, 3, ratio, ratio > 0.4 ? P.yellow : P.red, P.xdgray);
        }
        g.text('A 飲む　B 吐く', 14, 203, { size: 12, col: P.gray });
        g.text('飲んだ ' + st.cups + '杯', 242, 203, { size: 12, align: 'right', col: P.gray });
      }

      return {
        st,
        // テスト用：いまの様子
        get state() {
          return {
            phase: st.phase, pos: st.pos, target: st.target, mine: mine(), red: red(), gauge: st.gauge,
            mistakes: st.mistakes, cups: st.cups, vomits: st.vomits, down: st.down, vomiting: st.vomitT > 0, t: st.t,
          };
        },
        update(dt) {
          st.t += dt;
          st.nameT -= dt;
          st.missT -= dt;
          st.vomitT -= dt;
          if (st.scold) { st.scold.t -= dt; if (st.scold.t <= 0) st.scold = null; }
          st.cheers = st.cheers.filter((c) => (c.t -= dt) > 0);
          st.shown = api.approach(st.shown, st.gauge, (st.gauge < st.shown ? 120 : 80) * dt);
          if (st.down) st.downT += dt;
          if (st.phase === 'over' || api.ended) return;

          if (api.input.pressed('b')) pressB();
          if (st.phase === 'over') return;
          if (api.input.pressed('a')) pressA();
          if (st.phase === 'over') return;

          if (st.phase === 'start') {
            st.phaseT -= dt;
            if (st.phaseT <= 0) nextCall(st.pos);
          } else if (st.phase === 'call') {
            st.beatT -= dt;
            if (st.beatT <= 0) {
              st.step++;
              st.pos = (st.pos + st.dir + N) % N;
              if (st.step >= st.steps) land();
              else {
                st.beatT += beatLen();
                api.sfx('cursor');
              }
            }
          } else if (st.phase === 'land') {
            st.phaseT -= dt;
            if (st.phaseT <= 0) {
              if (st.target === 0) {
                mistake('miss');
                if (st.phase !== 'over') {
                  st.phase = 'drink';
                  st.drinker = -1;
                  st.phaseT = 0.6;
                }
              } else {
                st.phase = 'drink';
                st.drinker = st.target;
                st.phaseT = 0.6;
                st.npcCups[st.target]++;
                api.sfx('drink');
                cheer(st.target);
              }
            }
          } else if (st.phase === 'drink') {
            st.phaseT -= dt;
            if (st.drinker >= 0) st.full[st.drinker] = Math.max(0, st.phaseT / 0.6 - 0.1);
            if (st.phaseT <= 0) nextCall(st.target);
          }
        },
        draw(g) {
          drawRoom(g);
          // 話している人（止まった人は赤く光る）
          if (st.phase === 'call') glow(g, st.pos, P.yellow);
          else if (st.phase === 'land' && g.blink(6)) glow(g, st.target, P.red);
          // 座卓の向こうの列 → 座卓 → 左右 → 手前の列
          [6, 0, 1].forEach((i) => drawSeat(g, i));
          drawTable(g);
          for (let i = 0; i < N; i++) if (!(st.phase === 'drink' && st.drinker === i) && !(i === 0 && st.down)) mug(g, MUG[i][0], MUG[i][1], st.full[i]);
          [5, 2, 4, 3].forEach((i) => drawSeat(g, i));
          if (st.phase === 'drink' && st.drinker >= 0 && !(st.drinker === 0 && st.vomitT > 0)) {
            drinkingMug(g, st.drinker, st.full[st.drinker]);
            const s = SEATS[st.drinker];
            g.text('ゴクッ', s.x, s.y - 16 - Math.round((0.6 - st.phaseT) * 8), { size: 12, align: 'center', col: P.white, outline: P.black });
          }
          if (st.down) {
            drawDown(g);
            mug(g, SEATS[0].x + 22, SEATS[0].y + 40, 0);
          }
          if (st.vomitT > 0) rainbow(g);
          if (st.down) stars(g);

          // 座卓の真ん中：かんぱい・コールの名前
          if (st.phase === 'start') {
            g.text('かんぱーい！', 128, 82, { align: 'center', col: P.yellow, outline: P.black });
          } else if (st.nameT > 0 && st.phase !== 'over') {
            // ぎゃく回りのときは、コールの名前より、そちらを知らせる
            const label = st.reverse ? '◀ ぎゃく回り！' : '♪' + st.call.name;
            const w = g.measure(label, 12) + 10;
            g.ctx.save();
            g.ctx.globalAlpha = 0.7;
            g.R(128 - w / 2, 84, w, 15, P.ink);
            g.ctx.restore();
            g.text(label, 128, 85, { size: 12, align: 'center', col: st.reverse ? P.lsky : P.lyellow });
          }
          // 最初は、自分がどこにいるか教える
          if (st.t < 2.4 && st.phase === 'start') {
            const s = SEATS[0];
            g.text('キミ', s.x, s.y - 20, { size: 12, align: 'center', col: P.yellow, outline: P.black });
            g.R(s.x - 3, s.y - 6, 7, 1, P.yellow);
            g.R(s.x - 2, s.y - 5, 5, 1, P.yellow);
            g.R(s.x - 1, s.y - 4, 3, 1, P.yellow);
            g.R(s.x, s.y - 3, 1, 1, P.yellow);
          }

          // ふきだし
          st.cheers.forEach((c) => bubble(g, SEATS[c.seat].x, headTop(c.seat), c.text, { col: P.dgray }));
          if (st.phase === 'call') {
            const w = st.call.words[st.step % st.call.words.length];
            bubble(g, SEATS[st.pos].x, headTop(st.pos), w, { size: 12 });
          } else if (st.phase === 'land') {
            bubble(g, SEATS[st.target].x, headTop(st.target), 'のめ！', { size: 16, bg: P.red, col: P.white });
          }
          if (st.scold) bubble(g, SEATS[st.scold.seat].x, headTop(st.scold.seat), st.scold.text, { col: P.dred });

          drawPanel(g);
        },
      };
    },
  });
})();
