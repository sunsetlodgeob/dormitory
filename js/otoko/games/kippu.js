/*
 * 3月 追いコン「全裸で切符」 ― 誰にも見られずに、駅で切符を買って寮へもどれ
 *  夜の町を上から見た 1 画面の地図。左下が寮の玄関、右上が駅の券売機。
 *  通りがかりの人・おまわりさん・駅員さんには、見ている向きに光のくさび（視線）が出る。
 *  光の中に少しでも長くいると「見られた」でしっぱい。植え込み・電柱・自販機・建物のうしろは視線が通らない。
 *  券売機の前で A を長おし（約1.5秒）すると切符が買える（その間は動けない）。切符を持って玄関にもどればクリア。
 *  男魂くんは全裸（「男魂」の札とモザイクつき）。寮の玄関の中にいる間は見られない。
 *  人の動きは時間だけで決まる（テストのボットが先を読めるように、visibleAt で見られるかを調べられる）。
 *  スマホは十字キーと A ボタンのほか、画面をおさえた所へ歩いていく（券売機をおさえ続けても買える）。
 */
(function () {
  'use strict';

  const SPEED = 58; // 歩く速さ（ドット/秒）
  const GRACE = 0.3; // 光の中にこれだけいると見られる（秒）
  const BUY_TIME = 1.5; // 切符を買うのにかかる時間
  const BUMP = 11; // これより近づくと、ぶつかって見つかる
  const RIGHT = 0, DOWN = Math.PI / 2, LEFT = Math.PI, UP = -Math.PI / 2;

  // ── 地図（地面の上の四角 x, y, w, h。人も視線も通らない） ────────────────
  // 3/4 の見下ろしなので、高さのある物は足もと（四角）より上にのびて描く
  const SOLIDS = [
    { kind: 'shop', x: 0, y: 0, w: 104, h: 40 },
    { kind: 'station', x: 104, y: 0, w: 152, h: 42 },
    { kind: 'kenbaiki', x: 150, y: 38, w: 32, h: 10 },
    { kind: 'vend', x: 126, y: 38, w: 16, h: 14 },
    { kind: 'planter', x: 58, y: 54, w: 38, h: 9 },
    { kind: 'pole', x: 52, y: 103, w: 7, h: 6 },
    { kind: 'vend2', x: 178, y: 100, w: 16, h: 12 },
    { kind: 'dorm', x: 0, y: 150, w: 72, h: 46 },
    { kind: 'gomi', x: 72, y: 158, w: 12, h: 9 },
    { kind: 'hedge', x: 100, y: 130, w: 8, h: 26 },
    { kind: 'hedge', x: 100, y: 172, w: 8, h: 22 },
    { kind: 'hedge', x: 126, y: 150, w: 46, h: 24 },
    { kind: 'tree', x: 145, y: 133, w: 10, h: 6 },
    { kind: 'house', x: 212, y: 120, w: 44, h: 76 },
  ];
  const DOOR = { x: 24, y: 196, w: 20, h: 16 }; // 寮の玄関（ここにいれば見られない）
  const BUY = { x: 148, y: 48, w: 36, h: 14 }; // 券売機の前
  const START = { x: 34, y: 205 };

  // 人の動き。to：そこまで歩く／look：その向きを見る（秒）。最後まで行くと最初にもどる
  const NPCS = [
    // 駅員さん：改札の前で、券売機・広場・改札の順に見る
    {
      who: 'ekiin', kind: 'ekiin', v: 0, len: 74, half: 0.5, x: 206, y: 62,
      steps: [{ look: LEFT, dur: 2.0 }, { look: DOWN, dur: 2.2 }, { look: RIGHT, dur: 1.4 }, { look: DOWN, dur: 1.4 }],
    },
    // おまわりさん：公園のまわりを右回り。寮のわきの道を上がって、角で道路と左を見る
    {
      who: 'police', kind: 'police', v: 0, len: 70, half: 0.52, x: 91, y: 122,
      steps: [
        { look: UP, dur: 0.7 }, { look: LEFT, dur: 0.6 },
        { to: [200, 122], speed: 36 }, { look: DOWN, dur: 0.4 },
        { to: [200, 204], speed: 36 }, { look: LEFT, dur: 0.4 },
        { to: [91, 204], speed: 36 }, { look: UP, dur: 0.3 },
        { to: [91, 122], speed: 36 },
      ],
    },
    // 会社帰りの人：下の歩道を行ったり来たり
    {
      who: 'man', kind: 'kyaku', v: 0, len: 58, half: 0.45, x: -24, y: 110,
      steps: [{ to: [280, 110], speed: 44 }, { look: LEFT, dur: 3.5 }, { to: [-24, 110], speed: 44 }, { look: RIGHT, dur: 3.5 }],
    },
    // 通りがかりの人：駅前の広場を、植え込みの先まで来て引きかえす
    {
      who: 'woman', kind: 'kyaku', v: 2, len: 56, half: 0.45, x: -24, y: 72,
      steps: [{ to: [100, 72], speed: 30 }, { look: LEFT, dur: 0.8 }, { to: [-24, 72], speed: 30 }, { look: RIGHT, dur: 2.4 }],
    },
  ];
  const CAUGHT = {
    ekiin: '駅員さんに\n見つかった。\n「お客さま、服は？」',
    police: 'おまわりさんに\n見つかった。\n切符より先に、調書。',
    man: '会社帰りの人に\n見られた。\n「…見なかったことに」',
    woman: '通りがかりの人に\n見られた。\n「キャー！」',
  };
  const SHOUT = { ekiin: 'お客さま！？', police: 'こら！', man: 'えっ！？', woman: 'キャー！' };

  // 角度の差（-π〜π）
  const angDiff = (a, b) => {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  // 動きの予定を、時刻 → 位置と向き にする
  function compile(n) {
    const segs = [];
    let x = n.x, y = n.y, a = n.steps[0].look != null ? n.steps[0].look : Math.atan2(n.steps[0].to[1] - y, n.steps[0].to[0] - x);
    let t = 0;
    const turn = (to) => {
      if (Math.abs(angDiff(to, a)) > 0.01) {
        segs.push({ t0: t, dur: 0.22, x0: x, y0: y, x1: x, y1: y, a0: a, a1: a + angDiff(to, a) });
        t += 0.22;
        a = to;
      }
    };
    n.steps.forEach((s) => {
      if (s.to) {
        const [tx, ty] = s.to;
        const d = Math.hypot(tx - x, ty - y);
        const na = Math.atan2(ty - y, tx - x);
        turn(na);
        const dur = d / s.speed;
        segs.push({ t0: t, dur, x0: x, y0: y, x1: tx, y1: ty, a0: na, a1: na, walk: true });
        t += dur;
        x = tx;
        y = ty;
      } else {
        turn(s.look);
        segs.push({ t0: t, dur: s.dur, x0: x, y0: y, x1: x, y1: y, a0: s.look, a1: s.look });
        t += s.dur;
      }
    });
    // 最初の向きにもどる
    const first = segs[0];
    turn(first.a0);
    return { segs, total: t };
  }
  NPCS.forEach((n) => { n.plan = compile(n); });
  function poseAt(n, time) {
    const { segs, total } = n.plan;
    let tt = time % total;
    if (tt < 0) tt += total;
    let s = segs[segs.length - 1];
    for (const sg of segs) if (tt < sg.t0 + sg.dur) { s = sg; break; }
    const k = s.dur > 0 ? Math.min(1, Math.max(0, (tt - s.t0) / s.dur)) : 1;
    return { x: s.x0 + (s.x1 - s.x0) * k, y: s.y0 + (s.y1 - s.y0) * k, a: s.a0 + (s.a1 - s.a0) * k, walk: !!s.walk };
  }

  // 光線が最初に四角にぶつかるまでのきょり（なければ max）
  function rayLen(ox, oy, dx, dy, max) {
    let best = max;
    for (const b of SOLIDS) {
      let t0 = 0, t1 = best;
      if (Math.abs(dx) < 1e-9) {
        if (ox < b.x || ox > b.x + b.w) continue;
      } else {
        let p = (b.x - ox) / dx, q = (b.x + b.w - ox) / dx;
        if (p > q) [p, q] = [q, p];
        t0 = Math.max(t0, p);
        t1 = Math.min(t1, q);
        if (t0 > t1) continue;
      }
      if (Math.abs(dy) < 1e-9) {
        if (oy < b.y || oy > b.y + b.h) continue;
      } else {
        let p = (b.y - oy) / dy, q = (b.y + b.h - oy) / dy;
        if (p > q) [p, q] = [q, p];
        t0 = Math.max(t0, p);
        t1 = Math.min(t1, q);
        if (t0 > t1) continue;
      }
      if (t0 < best) best = t0;
    }
    return best;
  }
  const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  // 男魂くんの足もと（10×5）がどこかにぶつかるか
  function blocked(x, y) {
    if (x < 6 || x > 250 || y < 16 || y > 220) return true;
    for (const b of SOLIDS) if (x + 5 > b.x && x - 5 < b.x + b.w && y + 2 > b.y && y - 3 < b.y + b.h) return true;
    return false;
  }
  // 進みたい向きがふさがれていても、横に 5 ドット以内ずらせば通れるなら、そちらへ少しずれる
  function slide(x, y, to, axis, step) {
    for (let k = 1; k <= 5; k++) {
      for (const s of [1, -1]) {
        const ok = axis === 'x' ? !blocked(x + s * k, to) && !blocked(x + s * Math.min(k, step), y) : !blocked(to, y + s * k) && !blocked(x, y + s * Math.min(k, step));
        if (ok) return (axis === 'x' ? x : y) + s * Math.min(k, step);
      }
    }
    return axis === 'x' ? x : y;
  }
  // その人から (x, y) が見えるか（0：見えない、1：見える、2：ぶつかった）
  function sees(n, pose, x, y, lenMul) {
    if (inRect(x, y, DOOR)) return 0;
    const dx = x - pose.x, dy = y - pose.y;
    const d = Math.hypot(dx, dy);
    if (d < BUMP) return 2;
    if (d > n.len * lenMul) return 0;
    if (Math.abs(angDiff(Math.atan2(dy, dx), pose.a)) > n.half) return 0;
    return rayLen(pose.x, pose.y, dx / d, dy / d, d) >= d - 0.5 ? 1 : 0;
  }

  // 市松もようの塗り（光のくさび用）
  const pats = {};
  function pattern(ctx, col) {
    if (pats[col]) return pats[col];
    const c = OTK.makeCanvas(2, 2);
    const x2 = c.getContext('2d');
    x2.fillStyle = col;
    x2.fillRect(0, 0, 1, 1);
    x2.fillRect(1, 1, 1, 1);
    pats[col] = ctx.createPattern(c, 'repeat');
    return pats[col];
  }

  OTK.register({
    id: 'kippu',
    order: 10,
    month: 3,
    event: '追いコン',
    title: '全裸で切符',
    goal: '見られずに\n切符を買え！',
    howto: ['十字キー：歩く', '券売機の前でA長おし', '光に入るな。買ったら寮へ'],
    note: 'よい子はまねしないでください。',
    time: 60,
    timeout: 'lose',
    timeoutMsg: '時間切れ。\n3月の夜は\nまだ寒かった…',
    bgm: 'tense',
    create(api) {
      const P = api.P, W = api.W, H = api.H;
      const easy = api.tries >= 2; // 2 回しっぱいしたら、視線を少し短く・見つかるまでを少し長く
      const lenMul = easy ? 0.88 : 1;
      const grace = easy ? GRACE + 0.15 : GRACE;

      const me = { x: START.x, y: START.y, face: 'up', walk: 0, moving: false, ticket: false, buy: 0, buying: false, home: false };
      let npcT = 0; // 人の動きの時計（見つかったら止まる）
      // 人の動きの始まりを、遊ぶたびに少しずらす
      const offs = NPCS.map((n) => api.rnd(0, n.plan.total));
      const poseOf = (i, t) => poseAt(NPCS[i], t + offs[i]);
      let seenT = 0, watcher = -1, caught = null; // caught：{ i, x, y }
      let say = null; // 吹き出し { x, y, str, t, col }
      let shownGo = false;
      let tickT = 0;
      const fx = [];

      const poses = () => NPCS.map((n, i) => poseOf(i, npcT));
      // テスト用：今から ahead 秒後に (x, y) にいたら、だれかに見えるか（見えなければ -1）
      function visibleAt(x, y, ahead) {
        const tt = npcT + (ahead || 0);
        for (let i = 0; i < NPCS.length; i++) if (sees(NPCS[i], poseOf(i, tt), x, y, lenMul)) return i;
        return -1;
      }
      function talk(x, y, str, sec, col) { say = { x, y, str, t: sec || 1.4, col: col || P.ink }; }
      function pop(str, x, y, col, sec) { fx.push({ str, x, y, col: col || P.white, t: 0, dur: sec || 0.9 }); }

      function catchBy(i, ps, bump) {
        const n = NPCS[i];
        caught = { i, bump };
        me.buying = false;
        api.sfx(n.who === 'police' ? 'siren' : 'buzzer');
        api.shake(2, 0.3);
        api.flash(P.white, 0.12);
        talk(ps.x, ps.y - 26, SHOUT[n.who], 2, P.red);
        api.lose(CAUGHT[n.who], { wait: 1.3 });
      }

      // ── 描く道具 ──
      function bubble(g, str, cx, by, col) {
        const w = g.measure(str, 12) + 8;
        const x = Math.round(api.clamp(cx - w / 2, 2, W - w - 2)), y = Math.round(api.clamp(by - 15, 14, H - 20));
        g.R(x - 1, y, w + 2, 14, P.black);
        g.R(x, y - 1, w, 16, P.black);
        g.R(x, y, w, 14, P.white);
        const tx = Math.round(api.clamp(cx, x + 3, x + w - 4));
        g.R(tx - 1, y + 14, 3, 2, P.white);
        g.R(tx - 2, y + 14, 1, 2, P.black);
        g.R(tx + 2, y + 14, 1, 2, P.black);
        g.R(tx, y + 16, 1, 1, P.black);
        g.text(str, x + 4, y + 1, { size: 12, col: col || P.ink });
      }
      function arrow(g, x, y, col) {
        // 目的地の上で、はねる ▼
        const b = Math.round(Math.abs(Math.sin(api.time * 5)) * 4);
        y -= b;
        g.R(x - 4, y - 1, 9, 1, P.black);
        for (let i = 0; i < 5; i++) {
          g.R(x - 4 + i, y + i, 9 - i * 2, 1, col);
          g.R(x - 5 + i, y + i, 1, 1, P.black);
          g.R(x + 5 - i, y + i, 1, 1, P.black);
        }
        g.R(x, y + 5, 1, 1, P.black);
      }
      function ticketIcon(g, x, y) {
        g.R(x - 1, y - 1, 16, 10, P.black);
        g.R(x, y, 14, 8, '#f8e8c0');
        g.R(x + 1, y + 1, 12, 1, P.mblue);
        g.R(x + 2, y + 3, 6, 1, P.dgray);
        g.R(x + 2, y + 5, 8, 1, P.dgray);
        g.R(x + 11, y + 3, 2, 3, P.red);
      }

      // ── 地面 ──
      function drawGround(g) {
        // 歩道（タイル）
        g.R(0, 12, W, H - 12, '#5c5c68');
        for (let y = 44; y < 76; y += 8) g.R(0, y, W, 1, '#50505c');
        for (let x = 0; x < W; x += 8) g.R(x, 40, 1, 36, '#50505c');
        // 車道
        g.R(0, 76, W, 26, '#2c2c34');
        g.R(0, 76, W, 1, P.gray);
        g.R(0, 101, W, 1, P.gray);
        for (let x = 4; x < W; x += 20) g.R(x, 88, 10, 2, P.lyellow);
        // 横断歩道
        g.R(70, 78, 30, 22, '#2c2c34');
        for (let x = 72; x < 100; x += 5) g.R(x, 79, 3, 20, P.lgray);
        // 下の歩道
        for (let x = 0; x < W; x += 8) g.R(x, 102, 1, 14, '#50505c');
        g.R(0, 115, W, 1, '#4c4c58');
        // 公園（草）と、まわりの道（おまわりさんが歩く）
        g.R(96, 116, 114, 100, '#6c6c74');
        g.R(98, 130, 98, 68, '#1c4c2c');
        for (let i = 0; i < 46; i++) {
          const gx = 100 + ((i * 37) % 92), gy = 132 + ((i * 53) % 62);
          g.R(gx, gy, 1, 2, '#2c6c3c');
          g.R(gx + 2, gy - 1, 1, 3, '#2c6c3c');
        }
        // 寮のわきの道
        g.R(72, 116, 24, 100, '#646470');
        for (let y = 120; y < 200; y += 8) g.R(72, y, 24, 1, '#58586a');
        // 寮の前の道
        g.R(0, 196, W, 28, '#5c5c68');
        for (let x = 0; x < W; x += 8) g.R(x, 212, 1, 12, '#50505c');
        // 街灯の光だまり
        [[56, 108], [176, 70], [90, 206]].forEach(([x, y]) => {
          g.ctx.save();
          g.ctx.globalAlpha = 0.1;
          g.oval(x, y, 24, 10, P.lyellow);
          g.ctx.restore();
        });
      }

      // ── 物 ──
      function drawSolid(g, b) {
        const x = b.x, y = b.y, w = b.w, h = b.h;
        switch (b.kind) {
          case 'station': {
            // 屋根と、正面の壁
            g.R(x, 12, w, 10, '#3c3c50');
            for (let i = x; i < x + w; i += 6) g.R(i, 12, 1, 10, '#2c2c3c');
            g.R(x, 22, w, 2, '#7c7c8c');
            g.R(x, 24, w, 18, '#c8c0a8');
            g.R(x, 41, w, 1, '#8c8470');
            // 窓（明かり）
            [110, 190].forEach((wx) => { g.R(wx, 27, 12, 8, '#f8d878'); g.R(wx, 31, 12, 1, '#c8a050'); g.R(wx + 6, 27, 1, 8, '#c8a050'); });
            // 駅の看板
            g.R(186, 13, 22, 9, P.white);
            g.R(186, 13, 22, 1, P.mblue);
            g.text('駅', 197, 11, { size: 12, align: 'center', col: P.navy });
            // 改札（明るい中と、ゲート）
            g.R(214, 26, 40, 16, '#f8e8b0');
            g.R(214, 26, 40, 2, '#c8b880');
            for (let gx = 218; gx < 252; gx += 11) { g.R(gx, 32, 4, 10, P.lgray); g.R(gx, 32, 4, 2, P.mblue); }
            g.text('改札', 234, 13, { size: 12, align: 'center', col: P.lyellow });
            break;
          }
          case 'kenbaiki': {
            // 券売機 2 台
            g.text('きっぷ', 166, 24, { size: 12, align: 'center', col: P.navy });
            for (let i = 0; i < 2; i++) {
              const kx = x + i * 16;
              g.R(kx, y - 8, 15, h + 8, '#1c3c8c');
              g.R(kx + 1, y - 7, 13, 1, '#3c5cac');
              g.R(kx + 2, y - 5, 11, 6, P.lsky);
              g.R(kx + 3, y - 4, 4, 1, P.white);
              g.R(kx + 3, y + 3, 3, 2, P.yellow);
              g.R(kx + 9, y + 3, 3, 1, P.black);
              g.R(kx, y + h - 1, 15, 1, '#0c1c4c');
            }
            break;
          }
          case 'vend':
          case 'vend2': {
            // 自販機（明かりのついた正面）
            const top = y - 18;
            g.R(x, top, w, h + 18, P.black);
            g.R(x + 1, top + 1, w - 2, h + 16, b.kind === 'vend' ? P.red : P.mblue);
            g.R(x + 2, top + 3, w - 4, 10, P.lsky);
            for (let i = 0; i < 3; i++) g.R(x + 3 + i * 4, top + 5, 2, 5, [P.yellow, P.white, P.lgreen][i]);
            g.R(x + 2, top + 15, w - 4, 1, P.white);
            g.R(x + 3, y + h - 6, w - 6, 3, P.black);
            break;
          }
          case 'planter':
          case 'hedge': {
            // 植え込み（上から見た葉っぱと、手前の面）
            const top = y - 8;
            g.R(x, top, w, h + 8, '#0c3818');
            g.R(x + 1, top + 1, w - 2, h + 2, P.green);
            for (let i = 0; i < w - 3; i += 4) for (let j = 0; j < h; j += 4) g.R(x + 2 + i + ((j / 4) & 1) * 2, top + 2 + j, 2, 2, P.lgreen);
            g.R(x + 1, y + h - 5, w - 2, 4, b.kind === 'planter' ? '#8c8478' : '#005800');
            if (b.kind === 'planter') g.R(x + 1, y + h - 5, w - 2, 1, '#bcb4a0');
            break;
          }
          case 'pole': {
            // 電柱
            g.shadow(x + 3, y + 4, 5);
            g.R(x + 1, y - 44, 5, 49, '#8c8478');
            g.R(x + 1, y - 44, 1, 49, '#bcb4a0');
            g.R(x - 4, y - 40, 15, 2, '#5c5448');
            g.R(x + 4, y - 22, 6, 9, P.white);
            g.R(x + 5, y - 21, 4, 1, P.dgray);
            break;
          }
          case 'gomi': {
            // ゴミ置き場（ふたつきの箱）
            g.R(x, y - 10, w, h + 10, P.black);
            g.R(x + 1, y - 9, w - 2, 5, '#3c8c7c');
            g.R(x + 1, y - 9, w - 2, 1, '#6cbcac');
            g.R(x + 1, y - 4, w - 2, h + 3, '#2c6c60');
            for (let i = x + 3; i < x + w - 2; i += 3) g.R(i, y - 3, 1, h + 1, '#1c4c44');
            g.R(x + 3, y - 1, w - 6, 3, P.white); // 「ゴミ」の札
            g.R(x + 4, y, 2, 1, P.dgray);
            g.R(x + 7, y, 2, 1, P.dgray);
            break;
          }
          case 'tree': {
            g.R(x + 3, y - 10, 4, 16, P.dbrown);
            g.disc(x + 5, y - 20, 13, '#0c3818');
            g.disc(x + 5, y - 21, 12, P.dgreen);
            g.disc(x + 1, y - 24, 6, P.green);
            break;
          }
          case 'shop': {
            g.R(x, 12, w, 8, '#4c3c3c');
            g.R(x, 20, w, 20, '#8c7c6c');
            // シャッター
            g.R(8, 22, 54, 18, '#9c9c9c');
            for (let j = 23; j < 40; j += 2) g.R(8, j, 54, 1, '#7c7c7c');
            g.R(70, 24, 26, 10, '#3c3c50');
            g.R(71, 25, 11, 8, '#f8d878');
            g.R(84, 25, 11, 8, '#f8d878');
            break;
          }
          case 'dorm': {
            // 寮：屋上と、正面の壁と玄関
            g.R(x, y - 22, w, 48, '#7c7c88');
            g.R(x, y - 22, w, 2, '#9c9ca8');
            g.R(x + 2, y - 18, w - 4, 1, '#6c6c78');
            g.R(x, y + 26, w, 20, '#c8c8c0');
            g.R(x, y + 26, w, 1, P.white);
            // 窓
            [[6, 30], [50, 30]].forEach(([wx, wy]) => { g.R(x + wx, y + wy, 14, 8, '#f8d878'); g.R(x + wx + 7, y + wy, 1, 8, '#a89060'); });
            // 玄関（明るい入口）
            g.R(DOOR.x, y + 30, DOOR.w, 16, '#3c2c1c');
            g.R(DOOR.x + 2, y + 32, DOOR.w - 4, 14, '#f8e0a0');
            g.R(DOOR.x + 2, y + 32, DOOR.w - 4, 2, '#d8b870');
            // 表札
            g.R(DOOR.x + DOOR.w + 2, y + 31, 6, 12, P.white);
            g.R(DOOR.x + DOOR.w + 3, y + 33, 4, 1, P.ink);
            g.R(DOOR.x + DOOR.w + 3, y + 36, 4, 1, P.ink);
            g.R(DOOR.x + DOOR.w + 3, y + 39, 4, 1, P.ink);
            g.text('夕照寮', x + w / 2, y - 14, { size: 12, align: 'center', col: P.white, outline: P.black });
            break;
          }
          case 'house': {
            g.R(x, y - 4, w, 44, '#6c3c3c');
            for (let j = y - 2; j < y + 40; j += 4) g.R(x, j, w, 1, '#5c2c2c');
            g.R(x, y - 4, w, 1, '#8c5c5c');
            g.R(x, y + 40, w, 36, '#d8c8a8');
            g.R(x, y + 40, w, 1, P.white);
            g.R(x + 8, y + 46, 12, 10, '#f8d878');
            g.R(x + 13, y + 46, 1, 10, '#c8a050');
            g.R(x + 26, y + 58, 10, 18, '#7c5c3c');
            break;
          }
          default:
            g.R(x, y, w, h, P.dgray);
        }
      }

      // 光のくさび（視線）。物にさえぎられた所で止まる
      function drawCone(g, n, ps, hot) {
        const len = n.len * lenMul;
        const pts = [];
        const N = 24;
        for (let i = 0; i <= N; i++) {
          const a = ps.a - n.half + (2 * n.half * i) / N;
          const dx = Math.cos(a), dy = Math.sin(a);
          const l = rayLen(ps.x, ps.y, dx, dy, len);
          pts.push([ps.x + dx * l, ps.y + dy * l]);
        }
        const ctx = g.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(ps.x, ps.y);
        pts.forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.closePath();
        ctx.globalAlpha = hot ? 0.8 : 0.6;
        ctx.fillStyle = pattern(ctx, hot ? '#f87858' : '#f8f0b8');
        ctx.fill();
        ctx.globalAlpha = hot ? 0.32 : 0.22;
        ctx.fillStyle = hot ? '#f83800' : '#f8d878';
        ctx.fill();
        // ふち
        ctx.globalAlpha = hot ? 0.9 : 0.5;
        ctx.strokeStyle = hot ? '#f83800' : '#f8d878';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      const sprOf = (kind, dir, walk, v, naked) => {
        const f = Math.floor(walk * 8) % 4;
        const side = dir === 'left' || dir === 'right';
        return { img: api.person(kind, { dir, frame: f % 2, variant: v, naked }), flip: !side && f >= 2 };
      };
      const dirOf = (a) => {
        const d = angDiff(a, 0);
        if (Math.abs(d) <= Math.PI / 4) return 'right';
        if (Math.abs(d) >= (Math.PI * 3) / 4) return 'left';
        return d > 0 ? 'down' : 'up';
      };

      return {
        // テストで見るための中身
        me, NPCS, SOLIDS, DOOR, BUY, SPEED, visibleAt, blocked,
        get npcT() { return npcT; },
        get seenT() { return seenT; },
        get grace() { return grace; },
        get caught() { return caught; },
        poses,

        update(dt) {
          if (!caught) npcT += dt;
          for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t > fx[i].dur) fx.splice(i, 1); }
          if (say) { say.t -= dt; if (say.t <= 0) say = null; }
          if (!shownGo && api.time > 0.1) {
            shownGo = true;
            talk(12, 178, '切符、たのんだぞ！', 2.4);
          }
          if (api.ended) {
            // 玄関に入っていく
            if (me.home) { me.y = Math.min(me.y, 214) - 0; me.face = 'up'; }
            return;
          }

          // 歩く・買う
          let { x: dx, y: dy } = api.input.dir();
          const pt = api.input.pointer;
          const inBuy = inRect(me.x, me.y, BUY);
          const pressBuy = api.input.held('a') || (pt.down && inBuy && pt.y < BUY.y + 4 && pt.x > BUY.x - 4 && pt.x < BUY.x + BUY.w + 4);
          if (!dx && !dy && pt.down && pt.y > 12 && !pressBuy) {
            // 画面をおさえた所へ（足もとが指の少し下に来るように）
            const ax = pt.x - me.x, ay = pt.y + 8 - me.y;
            if (Math.abs(ax) > 2) dx = Math.sign(ax);
            if (Math.abs(ay) > 2) dy = Math.sign(ay);
          }
          me.buying = !me.ticket && inBuy && pressBuy && !dx && !dy;
          if (me.buying) {
            if (me.buy === 0) api.sfx('coin');
            me.buy += dt;
            me.face = 'up';
            tickT -= dt;
            if (tickT <= 0) { tickT = 0.25; api.sfx('tick'); }
            if (me.buy >= BUY_TIME) {
              me.ticket = true;
              me.buying = false;
              api.sfx('ok');
              pop('切符ゲット！', me.x, me.y - 36, P.yellow, 1.4);
              talk(me.x, me.y - 30, 'あとは寮へ！', 1.6);
            }
          }
          me.moving = false;
          if (!me.buying && (dx || dy)) {
            const n = dx && dy ? Math.SQRT1_2 : 1;
            const step = SPEED * n * dt;
            const nx = me.x + dx * step, ny = me.y + dy * step;
            if (!blocked(nx, me.y)) me.x = nx;
            else if (!dy) me.y = slide(me.x, me.y, nx, 'y', step); // 角に少しかかっただけなら、すべって回りこむ
            if (!blocked(me.x, ny)) me.y = ny;
            else if (!dx) me.x = slide(me.x, me.y, ny, 'x', step);
            me.face = dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';
            me.walk += dt;
            me.moving = true;
            if (Math.floor(me.walk * 4) !== Math.floor((me.walk - dt) * 4)) api.sfx('step');
          }

          // 見られているか
          const ps = poses();
          let hit = -1, bump = false;
          for (let i = 0; i < NPCS.length; i++) {
            const s = sees(NPCS[i], ps[i], me.x, me.y, lenMul);
            if (s === 2) { hit = i; bump = true; break; }
            if (s === 1 && hit < 0) hit = i;
          }
          if (hit >= 0) {
            if (seenT === 0) api.sfx('cursor');
            seenT += dt;
            watcher = hit;
            if (bump || seenT >= grace) catchBy(hit, ps[hit], bump);
          } else {
            seenT = Math.max(0, seenT - dt * 1.5);
            if (seenT === 0) watcher = -1;
          }

          // 切符を持って玄関へ
          if (me.ticket && inRect(me.x, me.y, DOOR) && !caught) {
            me.home = true;
            api.sfx('fanfare');
            talk(12, 178, 'でかした！', 2);
            api.win('切符を買ってきた！\n記念に、寮の玄関に\nかざられた。', { wait: 1.0 });
          }
        },

        draw(g) {
          drawGround(g);
          const ps = poses();
          // 視線
          NPCS.forEach((n, i) => drawCone(g, n, ps[i], (caught && caught.i === i) || (seenT > 0 && watcher === i)));
          // 券売機の前と玄関の目印
          if (!me.ticket) {
            g.ctx.save();
            g.ctx.globalAlpha = 0.35 + 0.2 * Math.sin(api.time * 6);
            g.frame(BUY.x, BUY.y, BUY.w, BUY.h, P.lsky);
            g.ctx.restore();
          } else {
            g.ctx.save();
            g.ctx.globalAlpha = 0.35 + 0.2 * Math.sin(api.time * 6);
            g.frame(DOOR.x, DOOR.y, DOOR.w, DOOR.h, P.yellow);
            g.ctx.restore();
          }

          // 物と人を、足もとの順に描く
          const list = [];
          SOLIDS.forEach((b) => list.push({ y: b.y + b.h, f: () => drawSolid(g, b) }));
          NPCS.forEach((n, i) => list.push({ y: ps[i].y, f: () => drawNpc(g, n, ps[i], i) }));
          list.push({ y: me.y + 0.5, f: () => drawMe(g) });
          // 玄関の先輩（見ているだけ）
          list.push({ y: 204, f: () => { g.shadow(14, 204, 6); g.sprite(api.person('senpai', { dir: 'right', variant: 4 }), 6, 180); } });
          list.sort((a, b) => a.y - b.y).forEach((o) => o.f());

          // 目的地の矢印
          if (!api.ended) {
            if (!me.ticket) arrow(g, 166, 12 + 8, P.yellow);
            else arrow(g, DOOR.x + DOOR.w / 2, 168, P.yellow);
          }
          // 買っているところ
          if (me.buying || (me.buy > 0 && !me.ticket && inRect(me.x, me.y, BUY))) {
            g.bar(me.x - 12, me.y - 34, 24, 3, me.buy / BUY_TIME, P.lyellow, P.xdgray);
            if (me.buying && g.blink(3)) g.text('ピッ', me.x + 14, me.y - 40, { size: 12, col: P.white, outline: P.black });
          }
          // 文字・吹き出し
          fx.forEach((e) => g.text(e.str, e.x, e.y - (e.t / e.dur) * 8, { size: 12, align: 'center', col: e.col, outline: P.black }));
          if (say) bubble(g, say.str, say.x, say.y, say.col);
          // 切符を持っているか
          if (me.ticket) ticketIcon(g, W - 20, 15);
          // 見られかけ
          if (seenT > 0 && !caught) {
            const w = watcher >= 0 ? ps[watcher] : null;
            if (w) g.text('？', w.x, w.y - 40, { col: P.yellow, outline: P.black, align: 'center' });
          }
          if (caught) {
            const w = ps[caught.i];
            g.text('！', w.x, w.y - 42, { col: P.red, outline: P.white, align: 'center' });
          }
        },
      };

      function drawNpc(g, n, ps, i) {
        if (ps.x < -12 || ps.x > W + 12) return;
        let a = ps.a;
        if (caught && caught.i === i) a = Math.atan2(me.y - ps.y, me.x - ps.x);
        const s = sprOf(n.kind, dirOf(a), ps.walk ? npcT + i * 0.3 : 0, n.v, false);
        g.shadow(ps.x, ps.y, 6);
        g.sprite(s.img, ps.x - 8, ps.y - 23, { flip: s.flip });
      }
      function drawMe(g) {
        if (me.home && api.ended) {
          // 玄関の中へ消える
          g.ctx.save();
          g.ctx.globalAlpha = Math.max(0, 1 - api.time * 0 - (me.fade = (me.fade || 0) + 1 / 60) * 1.5);
        }
        const s = sprOf('otoko', me.face, me.moving ? me.walk : 0, 0, true);
        g.shadow(me.x, me.y, 6);
        const shake = caught ? Math.round(Math.sin(api.time * 40)) : 0;
        g.sprite(s.img, me.x - 8 + shake, me.y - 23, { flip: s.flip });
        if (me.home && api.ended) g.ctx.restore();
        if (seenT > 0 && !caught && g.blink(6)) {
          // あせ
          g.R(me.x + 6, me.y - 26, 2, 3, P.lsky);
          g.R(me.x + 7, me.y - 27, 1, 1, P.lsky);
        }
        if (me.ticket && !me.home) {
          g.R(me.x + 5, me.y - 14, 6, 4, P.black);
          g.R(me.x + 6, me.y - 13, 4, 2, '#f8e8c0');
        }
      }
    },
  });
})();
