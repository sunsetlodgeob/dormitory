/*
 * 6月「財布がない」 ― 牛丼屋から、こっそり外へ
 *  牛丼を食べ終わったら、財布がない。店員が奥の鍋を見ているすきに、出口まで進む。
 *  店員は「鍋を見る → 鍋がカタカタ鳴って「！」（ふり返る合図）→ こっちを見る」をくりかえす。
 *  こっちを見ている間に動いたら見つかる。ときどき、ほかの客もふり返る（「？」が合図）。
 *  → か A をおしている間だけ進む（スマホは画面をおしっぱなしでもよい）。出口に着いたらクリア。
 *  ※翌日、ちゃんと払いに行った。
 */
(function () {
  'use strict';

  // ── 場所（画面は 256×224。上の 12 ドットはエンジンの帯） ──────────────
  const BACK_Y = 80; // 奥の台（鍋を置く所）の上面
  const CNT_Y = 104; // 手前のカウンターの上面
  const CNT_R = 206; // カウンターの右はし
  const FLOOR_Y = 150; // 床の奥のはし
  const ME_Y = 152; // 男魂くんの絵の上はし（2 倍で 48。足は 200）
  const START_X = 14;
  const GOAL_X = 216; // ここまで来たら出口
  const DOOR = { x: 214, y: 136, w: 36, h: 64 };
  const TX = 94, TY = 56; // 店員の絵の左上（2 倍）
  const POT = { x: 132, y: 60, w: 26, h: 20 }; // 大なべ
  const SEATS = [30, 70, 110, 150, 190]; // 丸いすの中心。0 が男魂くんの席、2 は空いている
  const GRACE = 0.12; // ふり向いた直後は、少しだけ見のがしてくれる（反応の時間）
  const SPEED = 22; // こっそり歩く速さ（ドット/秒）
  const MENU = ['大盛', '特盛', 'みそ汁', 'お新香', '生玉子'];

  OTK.register({
    id: 'gyudon',
    order: 3,
    month: 6,
    event: '',
    title: '財布がない',
    goal: 'こっそり\n店を出ろ！',
    howto: ['→かA：おす間だけ進む', '顔が見えたら止まれ！', '「！」「？」はふり向く合図'],
    note: 'スマホは画面をおしていても進む。',
    time: 30,
    timeout: 'lose',
    timeoutMsg: '時間切れ。\n「お客さん、お会計は？」',
    bgm: 'tense',
    create(api) {
      const P = api.P, W = api.W;
      const easy = api.tries >= 2; // 2 回しっぱいしたら、合図を長く・フェイントなし
      const TELL = easy ? 0.8 : 0.62; // 「！」が出てから、ふり向くまで
      const TELL_K = easy ? 0.75 : 0.6; // 客の「？」から、ふり向くまで

      const me = { x: START_X, walk: 0, moving: false, stepT: 0, alpha: 1, inY: 0 };
      // 店員：kitchen（鍋を見ている）→ tell（合図）→ watch（こっちを見ている）→ kitchen …
      const tenin = { state: 'kitchen', t: 0, dur: 2.6, cycle: 0, feint: false };
      const kyaku = [
        { cx: SEATS[1], variant: 4, state: 'eat', t: 0, plan: null, bob: 0 },
        { cx: SEATS[3], variant: 7, state: 'eat', t: 0.2, plan: null, bob: 0.15 },
        { cx: SEATS[4], variant: 6, state: 'eat', t: 0.4, plan: null, bob: 0.3 },
      ];
      let glances = 0;
      let door = 0; // 自動ドアの開き（0〜1）
      let caughtBy = null; // 'tenin' か、見つけた客
      let escaped = false, endT = 0;
      const steam = [0, 0.33, 0.66];

      function setTenin(state, dur) {
        tenin.state = state;
        tenin.t = 0;
        tenin.dur = dur;
      }
      function startKitchen() {
        setTenin('kitchen', api.rnd(1.4, 2.6));
        // ほかの客が、ときどきふり返る（店員が鍋を見ている間に、近くの客が 1 人）
        if (api.tries < 3 && tenin.cycle >= 1 && glances < 2 && tenin.dur >= 2.1 && api.chance(0.5)) {
          let best = kyaku[0];
          kyaku.forEach((c) => { if (Math.abs(c.cx - (me.x + 16)) < Math.abs(best.cx - (me.x + 16))) best = c; });
          best.plan = 0.4;
          glances++;
        }
      }
      function nextTenin() {
        if (tenin.state === 'kitchen') {
          setTenin('tell', TELL);
          // 3 回目くらいから、ときどきフェイント（合図だけで、また鍋にもどる）
          tenin.feint = !easy && tenin.cycle >= 2 && api.chance(0.25);
          api.sfx('cursor');
        } else if (tenin.state === 'tell') {
          if (tenin.feint) {
            tenin.feint = false;
            startKitchen();
          } else setTenin('watch', api.rnd(1.0, 1.7));
        } else {
          tenin.cycle++;
          startKitchen();
        }
      }
      // いま、だれかに見られているか（ふり向いた直後の GRACE 秒はのぞく）
      function watcher() {
        if (tenin.state === 'watch' && tenin.t > GRACE) return 'tenin';
        const c = kyaku.find((k) => k.state === 'look' && k.t > GRACE);
        return c || null;
      }
      function wantMove() {
        const inp = api.input;
        if (api.ended) return false;
        if (inp.held('right') || inp.held('a')) return true;
        const p = inp.pointer;
        return !!(p && p.down);
      }
      function caught(who) {
        caughtBy = who;
        me.moving = false;
        api.sfx('buzzer');
        api.shake(3, 0.3);
        if (who === 'tenin') api.lose('店員に見つかった。\n皿洗いで払うことに\nなった…', { wait: 1.2 });
        else api.lose('客に見つかった。\n「店員さーん！この人！」', { wait: 1.2 });
      }
      function escape() {
        escaped = true;
        me.moving = false;
        api.sfx('ok');
        api.win('なんとか店を出た！\n※翌日、ちゃんと\n払いに行きました。', { wait: 1.6 });
      }

      // ── 描く道具 ──
      // 吹き出し（白地に黒わく、下にしっぽ）。(x, y) はしっぽの先
      function bubble(g, x, y, str, o) {
        o = o || {};
        const size = o.size || 12;
        const w = g.measure(str, size) + 8, h = size + 6;
        const bx = Math.round(Math.max(2, Math.min(W - w - 2, x - w / 2))), by = Math.round(y - h - 3);
        g.R(bx + 1, by, w - 2, h, P.ink);
        g.R(bx, by + 1, w, h - 2, P.ink);
        g.R(bx + 1, by + 1, w - 2, h - 2, o.fill || P.white);
        g.R(x - 3, by + h - 1, 6, 1, P.ink);
        g.R(x - 2, by + h - 1, 4, 1, o.fill || P.white);
        g.R(x - 2, by + h, 4, 1, P.ink);
        g.R(x - 1, by + h, 2, 1, o.fill || P.white);
        g.R(x - 1, by + h + 1, 2, 1, P.ink);
        g.text(str, bx + w / 2, by + 3, { size, col: o.col || P.ink, align: 'center' });
      }
      // 合図の「！」「？」（黄色い吹き出しに、太い記号）
      function signal(g, x, y, mark, col) {
        const bx = x - 7, by = y - 22;
        g.R(bx + 1, by, 14, 20, P.ink);
        g.R(bx, by + 1, 16, 18, P.ink);
        g.R(bx + 1, by + 1, 14, 18, P.lyellow);
        g.R(x - 2, y - 2, 4, 2, P.ink);
        g.R(x - 1, y - 2, 2, 1, P.lyellow);
        g.R(x - 1, y, 2, 1, P.ink);
        if (mark === '!') {
          g.R(x - 2, by + 3, 4, 9, col);
          g.R(x - 1, by + 12, 2, 1, col);
          g.R(x - 2, by + 14, 4, 3, col);
        } else {
          g.R(x - 3, by + 3, 6, 2, col);
          g.R(x + 2, by + 4, 2, 4, col);
          g.R(x - 4, by + 4, 2, 2, col);
          g.R(x, by + 8, 3, 2, col);
          g.R(x - 1, by + 10, 2, 2, col);
          g.R(x - 1, by + 14, 2, 3, col);
        }
      }
      // 人の上半分だけ（いすにすわっている客）
      function seated(g, img, x, y) {
        g.ctx.drawImage(img, 0, 0, 16, 18, Math.round(x), Math.round(y), 32, 36);
      }
      function bowl(g, cx, y, full) {
        g.oval(cx, y + 3, 6, 3, P.dred);
        g.R(cx - 6, y, 13, 3, P.orange);
        g.R(cx - 5, y - 1, 11, 1, full ? P.brown : P.lgray);
        if (full) g.R(cx - 3, y - 2, 7, 1, P.tan);
        g.R(cx - 2, y + 5, 5, 1, P.dred);
      }

      function drawShop(g) {
        // 奥のかべ
        g.R(0, 12, W, BACK_Y - 12, P.cream);
        g.R(0, 46, W, 3, P.tan);
        g.R(0, 49, W, 1, P.brown);
        // 大きなのれん風の看板「牛丼」
        g.R(6, 15, 36, 28, P.dred);
        g.R(7, 16, 34, 26, P.red);
        g.text('牛丼', 24, 21, { size: 16, col: P.white, align: 'center' });
        g.R(14, 42, 1, 2, P.dred);
        g.R(33, 42, 1, 2, P.dred);
        // おしながきの札
        let mx = 48;
        MENU.forEach((m) => {
          const w = g.measure(m, 12) + 6;
          g.R(mx, 18, w, 18, P.dbrown);
          g.R(mx + 1, 19, w - 2, 16, P.white);
          g.text(m, mx + w / 2, 21, { size: 12, col: P.ink, align: 'center' });
          mx += w + 4;
        });
        // かけ時計（もうすぐ 23 時）
        g.disc(192, 62, 7, P.dbrown);
        g.disc(192, 62, 6, P.white);
        g.line(192, 62, 192, 57, P.ink);
        g.line(192, 62, 189, 63, P.ink);
        // 奥の台（ステンレス）
        g.R(0, BACK_Y, W, 2, P.white);
        g.R(0, BACK_Y + 2, W, CNT_Y - BACK_Y - 2, P.gray);
        for (let x = 6; x < W; x += 28) g.R(x, BACK_Y + 5, 1, CNT_Y - BACK_Y - 5, P.dgray);
        // すいはん器
        g.R(14, 64, 26, 16, P.lgray);
        g.R(15, 62, 24, 3, P.white);
        g.R(14, 70, 26, 1, P.gray);
        g.R(34, 74, 3, 2, P.red);
        // どんぶりの山
        for (let i = 0; i < 4; i++) {
          g.R(168, 76 - i * 4, 18, 3, P.orange);
          g.R(168, 79 - i * 4, 18, 1, P.dred);
        }
      }
      function drawPot(g) {
        const rattle = tenin.state === 'tell' && !caughtBy ? (Math.floor(api.time * 30) % 2 ? 1 : -1) : 0;
        const { x, y, w, h } = POT;
        // 湯気
        steam.forEach((s0) => {
          const k = (api.time * 0.5 + s0) % 1;
          const sx = x + 6 + s0 * 14 + Math.sin(api.time * 2 + s0 * 6) * 2;
          const sy = y - 4 - k * 22;
          if (k < 0.85) g.dither(sx, sy, 6, 4, P.white, Math.floor(api.time * 4) & 1);
        });
        g.R(x, y + 3, w, h - 3, P.dgray);
        g.R(x + 1, y + 4, w - 2, h - 5, P.lgray);
        g.R(x + 3, y + 5, 2, h - 8, P.white);
        g.R(x - 2, y + 6, 2, 3, P.dgray);
        g.R(x + w, y + 6, 2, 3, P.dgray);
        // ふた（合図のときカタカタ）
        g.R(x + 1 + rattle, y + 1 - Math.abs(rattle), w - 2, 3, P.gray);
        g.R(x + 11 + rattle, y - 1 - Math.abs(rattle), 4, 2, P.dgray);
      }
      function teninDir() {
        if (caughtBy === 'tenin') return 'down';
        if (tenin.state === 'watch') return 'down';
        if (tenin.state === 'tell') return me.x + 16 < TX + 16 ? 'left' : 'right';
        return 'up';
      }
      function drawTenin(g) {
        const dir = teninDir();
        const frame = dir === 'up' ? Math.floor(api.time * 2.5) % 2 : 0;
        g.sprite(api.person('tenin', { dir, frame, variant: 0 }), TX, TY, { scale: 2 });
        if (dir === 'up') {
          // おたまで鍋をかきまぜる
          const k = Math.sin(api.time * 5) * 2;
          g.line(TX + 27, TY + 30, POT.x + 8 + k, POT.y + 2, P.lgray);
          g.line(TX + 27, TY + 31, POT.x + 8 + k, POT.y + 3, P.dgray);
        }
      }
      function drawCounter(g) {
        // 上面
        g.R(0, CNT_Y, CNT_R, 6, P.tan);
        g.R(0, CNT_Y, CNT_R, 1, P.lorange);
        g.R(0, CNT_Y + 5, CNT_R, 1, P.dbrown);
        // 手前の板
        g.R(0, CNT_Y + 6, CNT_R, FLOOR_Y - CNT_Y - 6, P.brown);
        for (let x = 4; x < CNT_R; x += 10) g.R(x, CNT_Y + 6, 1, FLOOR_Y - CNT_Y - 10, P.dbrown);
        g.R(0, FLOOR_Y - 4, CNT_R, 4, P.xdgray);
        g.R(CNT_R, CNT_Y, 2, FLOOR_Y - CNT_Y, P.dbrown);
        // カウンターの上：どんぶり・湯のみ・紅しょうが
        bowl(g, SEATS[0], CNT_Y - 5, false);
        g.R(SEATS[0] + 9, CNT_Y - 4, 6, 4, P.white); // 伝票
        g.R(SEATS[0] + 10, CNT_Y - 3, 4, 1, P.dgray);
        g.R(SEATS[0] + 10, CNT_Y - 1, 3, 1, P.dgray);
        kyaku.forEach((c) => bowl(g, c.cx, CNT_Y - 5, true));
        [50, 130, 170].forEach((x) => {
          g.R(x, CNT_Y - 6, 5, 6, P.lgray);
          g.R(x + 1, CNT_Y - 5, 3, 1, P.green);
        });
        g.R(96, CNT_Y - 7, 6, 7, P.red); // 紅しょうがの入れもの
        g.R(97, CNT_Y - 8, 4, 1, P.dred);
        g.R(118, CNT_Y - 9, 4, 9, P.tan); // はし立て
        g.R(118, CNT_Y - 12, 1, 3, P.cream);
        g.R(120, CNT_Y - 13, 1, 4, P.cream);
      }
      function drawFloorAndRight(g) {
        // 床（市松のタイル）
        g.R(0, FLOOR_Y, W, api.H - FLOOR_Y, P.dgray);
        for (let y = FLOOR_Y, j = 0; y < api.H; y += 12, j++)
          for (let x = 0, i = 0; x < W; x += 16, i++) if ((i + j) % 2) g.dither(x, y, 16, 12, P.xdgray, 0);
        g.R(0, FLOOR_Y, CNT_R, 2, P.xdgray);
        // 出口のある、手前のかべ
        const wx = 208;
        g.R(wx, 12, W - wx, DOOR.y + DOOR.h - 12, P.cream);
        g.R(wx, 12, 2, DOOR.y + DOOR.h - 12, P.tan);
        g.R(wx, 46, W - wx, 3, P.tan);
        // ポスター
        g.R(216, 62, 32, 44, P.dred);
        g.R(217, 63, 30, 42, P.lyellow);
        g.text('夏の', 232, 65, { size: 12, col: P.red, align: 'center' });
        g.text('ねぎ玉', 232, 78, { size: 12, col: P.dred, align: 'center' });
        bowl(g, 232, 96, true);
        g.R(229, 92, 6, 2, P.lgreen);
        // 出口の札
        g.R(DOOR.x + 4, DOOR.y - 14, DOOR.w - 8, 12, P.dgreen);
        g.R(DOOR.x + 5, DOOR.y - 13, DOOR.w - 10, 10, P.green);
        g.text('出口', DOOR.x + DOOR.w / 2, DOOR.y - 14, { size: 12, col: P.white, align: 'center' });
        // 自動ドア：わく → 外（夜）→ ガラス 2 枚
        const { x, y, w, h } = DOOR;
        g.R(x - 2, y - 2, w + 4, h + 2, P.gray);
        g.R(x, y, w, h, P.night);
        g.R(x + 4, y + 14, 3, h - 14, P.xdgray); // 外の電柱
        g.disc(x + 10, y + 12, 3, P.lyellow);
        g.R(x, y + h - 10, w, 10, P.xdgray);
        const half = w / 2, open = Math.round(door * (half - 3));
        [[x - open, 0], [x + half + open, 1]].forEach(([px, i]) => {
          const cx0 = Math.max(x, px), cx1 = Math.min(x + w, px + half);
          if (cx1 - cx0 < 2) return;
          g.R(cx0, y, cx1 - cx0, h, P.lgray);
          g.R(cx0 + 1, y + 1, cx1 - cx0 - 2, h - 2, P.navy);
          g.dither(cx0 + 1, y + 1, cx1 - cx0 - 2, h - 2, P.blue, i);
          if (cx1 - cx0 > 8) {
            g.line(cx0 + 3, y + 20, cx0 + 9, y + 8, P.lsky);
            g.line(cx0 + 3, y + 26, cx0 + 12, y + 10, P.sky);
            g.R(cx0 + 2, y + 34, cx1 - cx0 - 4, 3, P.white); // 「自動ドア」のシール
          }
        });
        g.R(x - 2, y + h, w + 4, 4, P.dred); // マット
      }
      function drawSeatsAndKyaku(g) {
        SEATS.forEach((cx) => {
          g.R(cx - 1, 116, 3, 30, P.gray);
          g.R(cx, 116, 1, 30, P.lgray);
          g.oval(cx, 148, 7, 2, P.xdgray);
          g.oval(cx, 113, 10, 3, P.dred);
          g.oval(cx, 112, 10, 2, P.red);
        });
        kyaku.forEach((c) => {
          const look = c.state === 'look' || caughtBy === c;
          const bobY = c.state === 'eat' && !caughtBy && Math.floor((api.time + c.bob) * 3) % 2 ? 1 : 0;
          seated(g, api.person('kyaku', { dir: look ? 'down' : 'up', variant: c.variant }), c.cx - 16, 78 + bobY);
        });
      }
      function drawMe(g) {
        if (me.alpha <= 0) return;
        let dir = 'down', frame = 0;
        if (escaped) {
          dir = 'up';
          frame = Math.floor(endT * 6) % 2;
        } else if (me.moving) {
          dir = 'right';
          frame = Math.floor(me.walk * 7) % 2;
        } else if (caughtBy) dir = 'down';
        g.shadow(me.x + 16, 200 - me.inY, 10);
        const img = api.person('otoko', { dir, frame });
        if (escaped) {
          // ドアの中へ消えていく
          g.ctx.save();
          g.ctx.beginPath();
          g.ctx.rect(0, 0, W, DOOR.y + DOOR.h);
          g.ctx.clip();
          g.sprite(img, me.x, ME_Y - me.inY, { scale: 2, alpha: me.alpha });
          g.ctx.restore();
        } else g.sprite(img, me.x, ME_Y, { scale: 2 });
      }
      function drawMarks(g) {
        const tcx = TX + 16;
        if (caughtBy === 'tenin') {
          bubble(g, tcx, TY - 2, 'お客さん！', { col: P.red });
        } else if (tenin.state === 'tell') {
          // 合図：「！」と、鍋のカタカタ
          const pop = tenin.t < 0.08 ? 2 : 0;
          signal(g, tcx, TY - 1 - pop, '!', P.red);
          g.text('カタカタ', POT.x + POT.w / 2, POT.y - 20, { size: 12, col: P.dred, align: 'center' });
        } else if (tenin.state === 'watch' && !caughtBy) {
          g.text('ジーッ', TX - 2, TY + 8, { size: 12, col: P.dred, outline: P.cream, align: 'right' });
        }
        kyaku.forEach((c) => {
          if (caughtBy === c) bubble(g, c.cx, 74, '店員さーん！', { col: P.red });
          else if (c.state === 'tell') signal(g, c.cx, 77, '?', P.mblue);
          else if (c.state === 'look' && !caughtBy) g.text('ジッ', c.cx, 62, { size: 12, col: P.dred, outline: P.cream, align: 'center' });
        });
        // 男魂くんのようす
        const mx = me.x + 16;
        if (caughtBy) {
          g.text('ギクッ', mx, ME_Y - 16, { size: 12, col: P.yellow, outline: P.black, align: 'center' });
        } else if (!escaped && api.time < 2.2) {
          bubble(g, Math.max(mx, 46), ME_Y - 2, '財布がない…！');
        } else if (!escaped && !me.moving && watcher() && me.x > START_X + 6) {
          // 見られている間は、知らんぷりで口笛
          const k = Math.floor(api.time * 3) % 2;
          g.text('♪', mx + 12, ME_Y - 8 - k * 2, { size: 12, col: P.lyellow, outline: P.black });
        }
        if (escaped && endT > 0.5) {
          g.R(0, 204, W, 18, P.black);
          g.text('※翌日、ちゃんと払いに行きました。', W / 2, 207, { size: 12, col: P.white, align: 'center' });
        }
      }

      return {
        me, tenin, kyaku,
        get escaped() { return escaped; },
        get caughtBy() { return caughtBy === null ? null : caughtBy === 'tenin' ? 'tenin' : 'kyaku'; },
        // 動いてもだいじょうぶか（テスト・デバッグ用）
        get safe() { return tenin.state === 'kitchen' && kyaku.every((c) => c.state === 'eat' && c.plan == null); },
        update(dt) {
          // 店員と客の動き（見つかったら、そのまま止まる）
          if (!caughtBy) {
            tenin.t += dt;
            if (tenin.t >= tenin.dur) nextTenin();
            kyaku.forEach((c) => {
              c.t += dt;
              if (c.plan != null) {
                c.plan -= dt;
                if (c.plan <= 0) {
                  c.plan = null;
                  c.state = 'tell';
                  c.t = 0;
                  api.sfx('text');
                }
              } else if (c.state === 'tell' && c.t >= TELL_K) {
                c.state = 'look';
                c.t = 0;
              } else if (c.state === 'look' && c.t >= 0.8) {
                c.state = 'eat';
                c.t = 0;
              }
            });
          }
          // 自動ドア
          door = api.approach(door, me.x > 176 || escaped ? 1 : 0, dt * 2.5);
          if (escaped) {
            endT += dt;
            me.inY = Math.min(10, endT * 14);
            me.alpha = Math.max(0, 1 - endT * 1.2);
            return;
          }
          if (api.ended) return;
          // こっそり進む
          me.moving = wantMove();
          if (me.moving) {
            me.x = Math.min(GOAL_X, me.x + SPEED * dt);
            me.walk += dt;
            me.stepT -= dt;
            if (me.stepT <= 0) {
              me.stepT = 0.32;
              api.sfx('step');
            }
            const who = watcher();
            if (who) {
              caught(who);
              return;
            }
          }
          if (me.x >= GOAL_X) escape();
        },
        draw(g) {
          drawShop(g);
          drawPot(g);
          drawTenin(g);
          drawCounter(g);
          drawFloorAndRight(g);
          drawSeatsAndKyaku(g);
          drawMe(g);
          drawMarks(g);
        },
      };
    },
  });
})();
