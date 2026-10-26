/*
 * 10月「寮ゾンビ」 ― ゾンビになった寮生を、なぐって正気に戻せ
 *  あやしいキノコ鍋を食べた寮生たちが、ゾンビになって 2 階の廊下をうろついている。
 *  十字キーで歩き、A でむいている方へパンチ。2 発なぐると「はっ…俺は何を…」と正気に戻って座りこむ。
 *  ゾンビは男魂くんに寄ってくる。のこりが少なくなるほど速くなる。さわられるとハートが 1 つ減る（3 つでおしまい）。
 *  部屋のドアから、あとからも出てくる。全員（9 人）を正気に戻したらクリア。
 *  廊下の並びは 2 階の間取り（docs/dorm/dorm_reference.md）のとおり。床は青いリノリウム。
 *  スマホは十字キーと A のほか、画面をおすとその方へ歩き、男魂くんの近くをタップするとパンチ。
 */
(function () {
  'use strict';

  // ── 廊下（画面は 256×224。上の 12 ドットはエンジンの帯） ─────────────
  const COL = 48; // 部屋 1 つの幅
  const NORTH = ['201', '203', '205', '207', '209', '階段', '212', '214', '洗面所', 'トイレ', '物置']; // 上の並び
  const SOUTH = ['202', '204', '206', '208', '210', '211', '213', '215', '216', '217', '物置']; // 下の並び
  const WORLD_W = COL * NORTH.length; // 廊下の長さ（528）
  const DOOR_W = 22, DOOR_TOP = 34; // ドアの幅・上はし
  const FLOOR_T = 76; // 床の奥のはし（上の壁の下）
  const FLOOR_B = 200; // 床の手前のはし（下の壁）
  const MIN_Y = 90, MAX_Y = 196; // 足もとが動ける範囲
  const STAIRS = 5; // 階段の列（男魂くんはここから上がってくる）
  const SPEED = 72; // 男魂くんの歩く速さ（ドット/秒）
  const INITIAL = 3; // 最初から廊下にいるゾンビ
  const STORY_T = 2.8; // 最初の説明を出しておく時間（このあとドアから出てきはじめる）
  const WALL = '#d0c4a0', WALL_D = '#a89c7c', FLOOR = '#34509c', FLOOR_D = '#2c4488', FLOOR_L = '#4466b4';
  const DIRV = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  // 正気に戻ったときのひとこと（最初は必ず「はっ…俺は何を…」）
  const LINES = ['はっ…俺は何を…', 'ここは…廊下？', 'キノコ…うっ…', 'あれ、もう朝？', 'なんで廊下に…', 'はっ…！', '鍋…食べたっけ？', '頭がいたい…', 'えっ、何事？'];
  const MUMBLE = ['うー…', 'あー…', 'うぁー…', 'キノコ…'];
  const CURED_KIND = ['douki', 'senpai', 'ichinen'];
  const SAY_FROM = 0.35, SAY_TO = 2.6; // 正気に戻ってから、ひとことを出しておく間（秒）

  OTK.register({
    id: 'zombie',
    order: 6,
    month: 10,
    event: '',
    title: '寮ゾンビ',
    goal: '全員なぐって\n正気に戻せ！',
    howto: ['十字キー：歩く　A：パンチ', '2発なぐると正気に戻る', 'さわられるとハートが減る'],
    note: '',
    time: 45,
    timeout: 'lose',
    timeoutMsg: '時間切れ。\n寮はゾンビの館に\nなった…',
    bgm: 'play',
    create(api) {
      const P = api.P, W = api.W, H = api.H;
      const easy = api.tries >= 2; // 2 回しっぱいしたら、ゾンビを少しおそく・人数を 1 人へらす
      const TOTAL = easy ? 8 : 9;

      const me = { x: STAIRS * COL + COL / 2, y: 104, dir: 'down', walk: 0, moving: false, punchT: 0, cool: 0, inv: 0, hearts: 3, kx: 0, ky: 0, zombie: false };
      const zs = [];
      const doors = [];
      NORTH.forEach((name, i) => doors.push({ side: 'n', i, name, x: i * COL + COL / 2, open: false, tell: 0 }));
      SOUTH.forEach((name, i) => doors.push({ side: 's', i, name, x: i * COL + COL / 2, open: false, tell: 0 }));
      // ドアは開けっぱなしのことも多い
      api.shuffle(doors.filter((d) => d.name !== '階段')).slice(0, 4).forEach((d) => { d.open = true; });
      const fx = []; // 「ボカッ」などの文字と、火花
      let cured = 0, left = TOTAL, spawnT = STORY_T, pending = null, camX = 0, nextId = 0, hurtN = 0, punches = 0, hits = 0;

      function addZombie(x, y, o) {
        const id = nextId++;
        const z = Object.assign({
          id, x, y, hp: 2, state: 'walk', t: 0, kx: 0, ky: 0, v: id % 3, dir: 'down', walk: api.rnd(1), ph: api.rnd(6.28),
          idleIn: api.rnd(1.5, 3.5), mumble: api.rnd(0.5, 3), mumbleT: 0, mumbleS: api.pick(MUMBLE), toY: y, line: '', shakeT: 0,
        }, o || {});
        zs.push(z);
        return z;
      }
      // 最初のゾンビ（男魂くんから少しはなれた所に）
      for (let i = 0; i < INITIAL; i++) {
        const side = i === 0 ? -1 : i === 1 ? 1 : api.chance(0.5) ? -1 : 1;
        const x = me.x + side * api.rnd(100, i === 2 ? 220 : 160);
        addZombie(api.clamp(x, 20, WORLD_W - 20), api.rnd(110, 180));
      }
      left -= INITIAL;

      const active = () => zs.filter((z) => z.state !== 'cured');
      const zSpeed = () => (14 + 24 * (cured / TOTAL)) * (easy ? 0.85 : 1);
      const pop = (str, x, y, col, dur) => fx.push({ str, x, y, col: col || P.white, t: 0, dur: dur || 0.7 });
      const spark = (x, y) => fx.push({ spark: true, x, y, t: 0, dur: 0.18 });

      // ── パンチ ──
      function inReach(z, dir) {
        if (z.state === 'cured' || z.state === 'emerge') return false;
        const dx = z.x - me.x, dy = z.y - me.y;
        if (dir === 'right') return dx >= -2 && dx <= 26 && Math.abs(dy) <= 10;
        if (dir === 'left') return dx <= 2 && dx >= -26 && Math.abs(dy) <= 10;
        if (dir === 'up') return dy <= 2 && dy >= -24 && Math.abs(dx) <= 12;
        return dy >= -2 && dy <= 22 && Math.abs(dx) <= 12;
      }
      function dirTo(dx, dy) {
        return Math.abs(dx) >= Math.abs(dy) * 1.2 ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      }
      function punch(want) {
        if (me.cool > 0 || me.zombie || api.ended) return;
        let dir = want || me.dir;
        // ねらいの手助け：むいている方にいなければ、すぐ近くのゾンビの方を向く
        if (!zs.some((z) => inReach(z, dir))) {
          let best = null, bd = 30;
          active().forEach((z) => {
            if (z.state === 'emerge') return;
            const d = Math.hypot(z.x - me.x, (z.y - me.y) * 1.3);
            if (d < bd) { bd = d; best = z; }
          });
          if (best) dir = dirTo(best.x - me.x, best.y - me.y);
        }
        me.dir = dir;
        me.punchT = 0.18;
        me.cool = 0.24;
        punches++;
        const got = zs.filter((z) => inReach(z, dir));
        if (!got.length) {
          api.sfx('throw');
          return;
        }
        got.forEach((z) => hitZombie(z, dir));
      }
      function hitZombie(z, dir) {
        const [ux, uy] = DIRV[dir];
        hits++;
        z.hp--;
        z.kx = ux * 150;
        z.ky = uy * 110;
        z.shakeT = 0.2;
        spark(z.x - ux * 4, z.y - 12 - uy * 4);
        api.sfx('punch');
        if (z.hp > 0) {
          z.state = 'stun';
          z.t = 0;
          pop('ボカッ', z.x, z.y - 30, P.yellow);
          return;
        }
        // 正気に戻った
        z.state = 'cured';
        z.t = 0;
        z.line = LINES[cured % LINES.length]; // 吹き出しは「ドカッ」が消えてから（SAY_FROM〜SAY_TO 秒）
        cured++;
        pop('ドカッ', z.x, z.y - 30, P.orange, SAY_FROM);
        api.shake(2, 0.15);
        api.after(0.2, () => api.sfx('coin'));
        if (cured >= TOTAL) api.win('全員、正気に戻った！\nキノコ鍋は\n禁止になりました。', { wait: 1.6 });
      }
      function hurt(z) {
        me.hearts--;
        hurtN++;
        me.inv = 1.4;
        const dx = me.x - z.x, dy = me.y - z.y, d = Math.hypot(dx, dy) || 1;
        me.kx = (dx / d) * 160;
        me.ky = (dy / d) * 120;
        z.state = 'idle';
        z.t = 0;
        z.idleD = 0.8;
        api.sfx('damage');
        api.shake(3, 0.25);
        pop('ガブッ', me.x, me.y - 32, P.red);
        if (me.hearts <= 0) {
          me.zombie = true;
          api.lose('かまれて、ゾンビの\n仲間入り。\nうー…', { wait: 1.4 });
        }
      }

      // ── ゾンビが部屋から出てくる ──
      function chooseDoor() {
        const ok = (d) => d.name !== '階段' && d !== (pending && pending.door);
        let c = doors.filter((d) => ok(d) && Math.abs(d.x - me.x) >= 56 && Math.abs(d.x - me.x) <= 170);
        if (!c.length) c = doors.filter((d) => ok(d) && Math.abs(d.x - me.x) >= 56);
        return api.pick(c);
      }
      function updateSpawn(dt) {
        spawnT -= dt;
        const n = active().length;
        if (left > 0 && !pending && ((spawnT <= 0 && n < 5) || n < 2)) {
          const door = chooseDoor();
          pending = { door, t: 0.8 };
          door.open = true;
          door.tell = 0.8;
          api.sfx('cursor');
        }
        if (pending) {
          pending.t -= dt;
          if (pending.t <= 0) {
            const d = pending.door;
            const north = d.side === 'n';
            const z = addZombie(d.x, north ? FLOOR_T : FLOOR_B + 14, { state: 'emerge', toY: north ? MIN_Y + 8 : MAX_Y - 8, dir: north ? 'down' : 'up' });
            z.mumbleT = 1.2;
            left--;
            pending = null;
            spawnT = api.rnd(2.2, 3.2);
          }
        }
      }

      function updateZombie(z, dt) {
        z.t += dt;
        z.shakeT = Math.max(0, z.shakeT - dt);
        // ふっとび
        z.x += z.kx * dt;
        z.y += z.ky * dt;
        const k = Math.exp(-10 * dt);
        z.kx *= k;
        z.ky *= k;
        if (z.state === 'cured') {
          z.x = api.clamp(z.x, 10, WORLD_W - 10);
          z.y = api.clamp(z.y, MIN_Y, MAX_Y);
          return;
        }
        // 「うー…」
        z.mumble -= dt;
        z.mumbleT = Math.max(0, z.mumbleT - dt);
        if (z.mumble <= 0) {
          z.mumble = api.rnd(2.5, 5);
          z.mumbleT = 1.1;
          z.mumbleS = api.pick(MUMBLE);
        }
        if (z.state === 'emerge') {
          // 部屋から廊下へ出てくる
          z.y = api.approach(z.y, z.toY, 22 * dt);
          z.walk += dt;
          if (z.y === z.toY) { z.state = 'walk'; z.t = 0; }
          return;
        }
        if (z.state === 'stun') {
          if (z.t > 0.6) { z.state = 'walk'; z.t = 0; }
        } else if (z.state === 'idle') {
          if (z.t > (z.idleD || 0.5)) { z.state = 'walk'; z.t = 0; z.idleIn = api.rnd(1.6, 3.4); }
        } else if (z.state === 'walk' && !me.zombie) {
          // 男魂くんの方へ、ふらふら寄ってくる
          const dx = me.x - z.x, dy = me.y - z.y, d = Math.hypot(dx, dy) || 1;
          const ux = dx / d, uy = dy / d;
          const w = Math.sin(z.t * 3 + z.ph) * 0.45;
          const s = zSpeed() * (d < 48 ? 1.15 : 1);
          z.x += (ux - uy * w) * s * dt;
          z.y += (uy + ux * w) * s * dt * 0.8;
          z.walk += dt;
          z.dir = dirTo(dx, dy);
          if (z.t > z.idleIn && d > 30) { z.state = 'idle'; z.t = 0; z.idleD = 0.5; }
        }
        z.x = api.clamp(z.x, 10, WORLD_W - 10);
        z.y = api.clamp(z.y, MIN_Y, MAX_Y);
        // さわられた
        if ((z.state === 'walk' || z.state === 'idle') && me.inv <= 0 && !me.zombie && !api.ended) {
          if (Math.abs(z.x - me.x) < 10 && Math.abs(z.y - me.y) < 7) hurt(z);
        }
      }
      // ゾンビどうしは重ならない
      function separate() {
        const a = active().filter((z) => z.state !== 'emerge');
        for (let i = 0; i < a.length; i++) {
          for (let j = i + 1; j < a.length; j++) {
            const dx = a[j].x - a[i].x, dy = (a[j].y - a[i].y) * 1.4, d = Math.hypot(dx, dy);
            if (d < 14 && d > 0.01) {
              const push = (14 - d) / 2;
              a[i].x -= (dx / d) * push;
              a[j].x += (dx / d) * push;
              a[i].y -= (dy / d) * push * 0.6;
              a[j].y += (dy / d) * push * 0.6;
            } else if (d <= 0.01) a[j].x += 1;
          }
        }
      }

      function moveMe(dt) {
        const inp = api.input;
        // むき：いま押した方向。押している方向がほかに変わったら、そちら
        for (const k of ['left', 'right', 'up', 'down']) if (inp.pressed(k)) me.dir = k;
        if (!inp.held(me.dir)) for (const k of ['left', 'right', 'up', 'down']) if (inp.held(k)) { me.dir = k; break; }
        let { x: mx, y: my } = inp.dir();
        // 画面をおしている所へ歩く（スマホ）。男魂くんのすぐ近くは、パンチ用
        const p = inp.pointer;
        if (!mx && !my && p && p.down && p.y > api.TOP && !api.ended) {
          const dx = p.x + camX - me.x, dy = p.y + 12 - me.y;
          if (Math.hypot(dx, dy) > 34) {
            const d = Math.hypot(dx, dy);
            mx = dx / d;
            my = dy / d;
            if (me.punchT <= 0) me.dir = dirTo(dx, dy);
          }
        }
        me.moving = !!(mx || my) && !me.zombie;
        if (me.moving) {
          const n = Math.hypot(mx, my);
          const sp = SPEED * (me.punchT > 0 ? 0.5 : 1);
          me.x += (mx / n) * sp * dt;
          me.y += (my / n) * sp * dt * 0.85;
          me.walk += dt;
        }
        me.x += me.kx * dt;
        me.y += me.ky * dt;
        const k = Math.exp(-9 * dt);
        me.kx *= k;
        me.ky *= k;
        me.x = api.clamp(me.x, 10, WORLD_W - 10);
        me.y = api.clamp(me.y, MIN_Y, MAX_Y);
        // パンチ（A か、男魂くんの近くをタップ）
        if (inp.pressed('a')) punch();
        const tp = inp.tap;
        if (tp) {
          const dx = tp.x + camX - me.x, dy = tp.y + 12 - me.y;
          if (Math.hypot(dx, dy) <= 34) punch(dirTo(dx, dy));
        }
      }

      // ── 描く道具 ──
      const sx = (x) => Math.round(x - camX);
      function bubble(g, x, y, str, o) {
        o = o || {};
        const size = 12;
        const w = g.measure(str, size) + 8, h = size + 6;
        const bx = Math.round(Math.max(2, Math.min(W - w - 2, x - w / 2))), by = Math.round(y - h - 3);
        const tx = Math.round(api.clamp(x, bx + 4, bx + w - 4));
        g.R(bx + 1, by, w - 2, h, P.ink);
        g.R(bx, by + 1, w, h - 2, P.ink);
        g.R(bx + 1, by + 1, w - 2, h - 2, o.fill || P.white);
        g.R(tx - 2, by + h - 1, 4, 1, P.ink);
        g.R(tx - 1, by + h - 1, 2, 1, o.fill || P.white);
        g.R(tx - 1, by + h, 2, 2, P.ink);
        g.text(str, bx + w / 2, by + 3, { size, col: o.col || P.ink, align: 'center' });
      }
      function heart(g, x, y, full) {
        const c = full ? P.red : P.xdgray;
        g.R(x + 1, y, 2, 1, P.ink); g.R(x + 4, y, 2, 1, P.ink);
        g.R(x, y + 1, 7, 3, P.ink); g.R(x + 1, y + 4, 5, 1, P.ink); g.R(x + 2, y + 5, 3, 1, P.ink); g.R(x + 3, y + 6, 1, 1, P.ink);
        g.R(x + 1, y + 1, 2, 1, c); g.R(x + 4, y + 1, 2, 1, c);
        g.R(x + 1, y + 2, 5, 2, c); g.R(x + 2, y + 4, 3, 1, c); g.R(x + 3, y + 5, 1, 1, c);
        if (full) g.R(x + 1, y + 1, 1, 1, P.lpink);
      }

      function drawNorth(g) {
        // かべ
        g.R(0, 12, W, FLOOR_T - 12, WALL);
        g.R(0, 12, W, 6, '#5c5444');
        g.R(0, 18, W, 1, WALL_D);
        g.R(0, FLOOR_T - 4, W, 4, P.dbrown);
        g.R(0, FLOOR_T - 4, W, 1, P.brown);
        NORTH.forEach((name, i) => {
          const x0 = sx(i * COL);
          if (x0 > W || x0 + COL < 0) return;
          g.R(x0, 19, 1, FLOOR_T - 23, WALL_D); // 部屋の区切りの柱
          const d = doors[i];
          const dx = x0 + (COL - DOOR_W) / 2;
          // 札（部屋番号など）
          const pw = Math.max(26, g.measure(name, 12) + 8);
          g.R(x0 + COL / 2 - pw / 2, 21, pw, 12, P.ink);
          g.R(x0 + COL / 2 - pw / 2 + 1, 22, pw - 2, 10, name === '階段' ? P.lgreen : name.length === 3 && /\d/.test(name) ? P.white : P.lsky);
          g.text(name, x0 + COL / 2, 20, { size: 12, col: P.ink, align: 'center' });
          if (name === '階段') {
            // 階段の入口（上へ続く段）
            g.R(dx - 3, DOOR_TOP - 2, DOOR_W + 6, FLOOR_T - DOOR_TOP + 2, P.ink);
            for (let s = 0; s < 6; s++) {
              const y = FLOOR_T - 6 - s * 7;
              g.R(dx - 2 + s, y, DOOR_W + 4 - s * 2, 6, s % 2 ? '#8c8c94' : '#9c9ca4');
              g.R(dx - 2 + s, y, DOOR_W + 4 - s * 2, 1, P.lgray);
            }
            return;
          }
          drawDoor(g, d, dx, DOOR_TOP, FLOOR_T);
        });
        // かべの小物：消火器・掲示板
        const fe = sx(3 * COL + COL - 6);
        if (fe > -10 && fe < W + 10) {
          g.R(fe - 3, FLOOR_T - 15, 7, 11, P.ink);
          g.R(fe - 2, FLOOR_T - 14, 5, 10, P.red);
          g.R(fe - 2, FLOOR_T - 14, 2, 10, '#fc7860');
          g.R(fe - 1, FLOOR_T - 17, 3, 2, P.ink);
        }
        [1, 7].forEach((i) => {
          const bx = sx(i * COL + COL - 8);
          if (bx < -20 || bx > W + 20) return;
          g.R(bx - 1, 38, 18, 18, P.dbrown);
          g.R(bx, 39, 16, 16, P.tan);
          g.R(bx + 2, 41, 5, 6, P.white);
          g.R(bx + 9, 40, 5, 4, P.lyellow);
          g.R(bx + 8, 46, 6, 7, P.white);
          g.R(bx + 2, 49, 5, 4, P.lpink);
          g.R(bx + 4, 41, 1, 1, P.red);
          g.R(bx + 11, 46, 1, 1, P.red);
        });
      }
      function drawDoor(g, d, dx, top, bot) {
        g.R(dx - 2, top - 2, DOOR_W + 4, bot - top + 2, P.dbrown); // わく
        if (d.open) {
          // 中が見える（2段ベッドのはしっこ）
          g.R(dx, top, DOOR_W, bot - top, '#241a14');
          g.R(dx + 4, top + 8, 14, 2, P.brown);
          g.R(dx + 4, top + 22, 14, 2, P.brown);
          g.R(dx + 4, top + 8, 2, bot - top - 8, P.brown);
          g.R(dx + 6, top + 10, 12, 4, '#5c6c9c');
          g.R(dx + 6, top + 24, 12, 4, '#9c5c5c');
          g.R(dx, top, 3, bot - top, P.tan); // 開いたドア
          g.R(dx + 3, top, 1, bot - top, P.brown);
        } else {
          g.R(dx, top, DOOR_W, bot - top, P.tan);
          g.R(dx + 2, top + 3, DOOR_W - 4, 12, '#d8a068');
          g.R(dx + 2, top + 19, DOOR_W - 4, 16, '#d8a068');
          g.R(dx + DOOR_W - 5, top + 20, 2, 2, P.yellow);
        }
        if (d.tell > 0 && g.blink(6)) g.text('ガチャ', dx + DOOR_W / 2, top + 12, { size: 12, col: P.yellow, outline: P.black, align: 'center' });
      }
      function drawFloor(g) {
        g.R(0, FLOOR_T, W, FLOOR_B - FLOOR_T, FLOOR);
        // 天井の明かりの照り返し
        for (let i = 0; i < 12; i++) {
          const lx = sx(i * COL + COL / 2);
          if (lx < -30 || lx > W + 30) continue;
          g.dither(lx - 14, FLOOR_T + 4, 28, 6, FLOOR_L, 0);
        }
        // シートのつなぎ目
        for (let x = 0; x <= WORLD_W; x += 32) {
          const lx = sx(x);
          if (lx >= 0 && lx < W) g.R(lx, FLOOR_T, 1, FLOOR_B - FLOOR_T, FLOOR_D);
        }
        g.R(0, 138, W, 1, FLOOR_D);
        // すりきず
        for (let i = 0; i < 40; i++) {
          const x = sx((i * 97) % WORLD_W), y = FLOOR_T + 8 + ((i * 53) % (FLOOR_B - FLOOR_T - 14));
          if (x >= 0 && x < W) g.R(x, y, 2, 1, FLOOR_D);
        }
        // かべぎわの段ボール
        [[0.6, 2], [2.7, 1], [6.8, 2], [10.4, 1]].forEach(([c, n]) => {
          const bx = sx(c * COL);
          if (bx < -30 || bx > W + 10) return;
          for (let j = 0; j < n; j++) {
            const y = FLOOR_T + 8 - j * 9;
            g.R(bx + j * 2, y - 10, 18, 11, P.ink);
            g.R(bx + j * 2 + 1, y - 9, 16, 9, P.tan);
            g.R(bx + j * 2 + 1, y - 9, 16, 2, '#e0b080');
            g.R(bx + j * 2 + 8, y - 9, 2, 9, '#a8784c');
          }
        });
        // あやしいキノコ鍋（洗面所＋キッチンの前）
        const px = sx(8 * COL + COL / 2 + 16), py = FLOOR_T + 12;
        if (px > -20 && px < W + 20) {
          g.shadow(px, py + 1, 9);
          g.R(px - 9, py - 8, 18, 9, P.ink);
          g.R(px - 8, py - 7, 16, 7, P.dgray);
          g.R(px - 8, py - 7, 16, 2, P.gray);
          g.R(px - 11, py - 6, 3, 2, P.ink);
          g.R(px + 8, py - 6, 3, 2, P.ink);
          g.R(px - 6, py - 9, 12, 2, P.violet);
          g.R(px - 4, py - 11, 3, 2, P.pink);
          g.R(px + 2, py - 11, 3, 2, P.lviolet);
          const k = Math.floor(api.time * 3) % 3;
          g.dither(px - 5 + k, py - 22, 4, 10, P.lviolet, k & 1);
          g.dither(px + 1 - k, py - 26, 4, 12, P.violet, (k + 1) & 1);
        }
      }
      function drawSouth(g) {
        // 下の壁（上から見える）と、ドアの口
        g.R(0, FLOOR_B, W, 11, P.gray);
        g.R(0, FLOOR_B, W, 2, P.lgray);
        g.R(0, FLOOR_B + 10, W, 1, P.dgray);
        SOUTH.forEach((name, i) => {
          const d = doors[NORTH.length + i];
          const dx = sx(i * COL + (COL - DOOR_W) / 2);
          if (dx < -30 || dx > W + 10) return;
          g.R(dx - 2, FLOOR_B, DOOR_W + 4, 11, P.dbrown);
          g.R(dx, FLOOR_B, DOOR_W, 11, d.open ? '#241a14' : P.brown);
          if (!d.open) g.R(dx, FLOOR_B, DOOR_W, 2, P.tan);
          if (d.tell > 0 && g.blink(6)) g.text('ガチャ', dx + DOOR_W / 2, FLOOR_B - 16, { size: 12, col: P.yellow, outline: P.black, align: 'center' });
        });
      }
      // 下の小さい地図（ゾンビがどこにいるか）
      function drawMap(g) {
        const y = FLOOR_B + 11, s = (W - 8) / WORLD_W;
        g.R(0, y, W, H - y, P.black);
        g.R(4, y + 6, W - 8, 1, P.xdgray);
        g.frame(4 + Math.round(camX * s), y + 2, Math.round(W * s), 9, P.dgray);
        if (pending && g.blink(4)) g.R(4 + pending.door.x * s - 1, y + 5, 3, 3, P.red);
        zs.forEach((z) => {
          const mx = 4 + Math.round(z.x * s), my = y + 4 + Math.round(((z.y - MIN_Y) / (MAX_Y - MIN_Y)) * 4);
          if (z.state === 'cured') g.R(mx, my + 1, 1, 2, P.dgray);
          else g.R(mx - 1, my, 2, 3, z.state === 'stun' ? P.yellow : P.lgreen);
        });
        if (me.inv <= 0 || g.blink(6)) g.R(4 + Math.round(me.x * s) - 1, y + 4 + Math.round(((me.y - MIN_Y) / (MAX_Y - MIN_Y)) * 4), 3, 3, P.white);
      }

      // すわりこんだ寮生（足もとが (x, y)）
      function sitting(g, img, x, y) {
        g.shadow(x, y, 8);
        g.ctx.drawImage(img, 0, 0, 16, 18, x - 8, y - 21, 16, 18);
        g.ctx.drawImage(img, 0, 18, 16, 6, x - 8, y - 3, 16, 3);
      }
      function drawZombie(g, z) {
        const x = sx(z.x), y = Math.round(z.y);
        if (x < -20 || x > W + 20) return;
        if (z.state === 'cured') {
          const kind = CURED_KIND[z.id % 3];
          sitting(g, api.person(kind, { dir: 'down', variant: z.id }), x, y);
          if (z.t < 0.3 && g.blink(10)) g.R(x - 9, y - 22, 18, 22, P.white);
          else if (z.t > SAY_TO) {
            // ぼうぜん（汗）
            const k = Math.floor((api.time + z.ph) * 1.5) % 2;
            g.R(x + 7, y - 20 + k, 2, 3, P.lsky);
          }
          return;
        }
        const step = Math.floor(z.walk * (z.state === 'emerge' ? 4 : 3.5)) % 4;
        const dir = z.dir;
        const updown = dir === 'up' || dir === 'down';
        const still = z.state === 'stun' || z.state === 'idle';
        const img = api.person('zombie', { dir, frame: still ? 0 : step % 2, variant: z.v });
        const jx = z.shakeT > 0 ? (Math.floor(z.shakeT * 40) % 2 ? 1 : -1) : 0;
        g.shadow(x, y, 7);
        g.sprite(img, x - 8 + jx, y - 23, { flip: updown && !still && step >= 2 });
        if (z.state === 'stun') {
          // 目が回っている
          for (let i = 0; i < 2; i++) {
            const a = api.time * 8 + i * Math.PI;
            g.R(x + Math.round(Math.cos(a) * 6) - 1, y - 27 + Math.round(Math.sin(a) * 2), 2, 2, P.yellow);
          }
        }
        if (z.hp === 1 && z.state !== 'stun') g.R(x + 4, y - 25, 2, 2, P.yellow); // あと 1 発の印
      }
      function drawMe(g) {
        const x = sx(me.x), y = Math.round(me.y);
        if (me.inv > 0 && !me.zombie && Math.floor(me.inv * 12) % 2 === 0) return;
        g.shadow(x, y, 7);
        if (me.zombie) {
          // ゾンビの仲間入り（はちまきだけ残る）
          g.sprite(api.person('zombie', { dir: 'down', variant: 0 }), x - 8, y - 23);
          g.R(x - 5, y - 19, 10, 1, P.red);
          g.R(x + 5, y - 20, 2, 1, P.red);
          return;
        }
        const moving = me.moving && !api.ended;
        const step = Math.floor(me.walk * 7) % 4;
        const updown = me.dir === 'up' || me.dir === 'down';
        const img = api.person('otoko', { dir: me.dir, frame: moving ? step % 2 : 0 });
        const flip = updown && moving && step >= 2;
        // うしろ向きのパンチは、体より先に腕を描く
        if (me.punchT > 0 && me.dir === 'up') drawFist(g, x, y);
        g.sprite(img, x - 8, y - 23, { flip });
        if (me.punchT > 0 && me.dir !== 'up') drawFist(g, x, y);
      }
      function drawFist(g, x, y) {
        const k = me.punchT > 0.1 ? 1 : 0.6; // のびきって、もどる
        const sk = P.skin;
        const box = (bx, by, w, h) => { g.R(bx - 1, by - 1, w + 2, h + 2, P.ink); g.R(bx, by, w, h, sk); };
        if (me.dir === 'right' || me.dir === 'left') {
          const s = me.dir === 'right' ? 1 : -1;
          const reach = Math.round(12 * k);
          const ax = s > 0 ? x + 4 : x - 4 - reach;
          box(ax, y - 11, reach, 2);
          box(s > 0 ? x + 4 + reach : x - 8 - reach, y - 13, 4, 5);
          if (k === 1) for (let i = 0; i < 3; i++) g.R(s > 0 ? x + 2 : x - 10, y - 15 + i * 3, 8, 1, P.white);
        } else if (me.dir === 'up') {
          const reach = Math.round(10 * k);
          box(x + 3, y - 20 - reach, 2, reach);
          box(x + 2, y - 25 - reach, 5, 4);
        } else {
          const reach = Math.round(10 * k);
          box(x + 3, y - 8, 2, reach);
          box(x + 2, y - 8 + reach, 5, 4);
          if (k === 1) for (let i = 0; i < 3; i++) g.R(x - 2 + i * 4, y + 6, 1, 4, P.white);
        }
      }
      function drawFx(g) {
        fx.forEach((f) => {
          const x = sx(f.x);
          if (f.spark) {
            const r = 3 + f.t * 40;
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2;
              g.R(x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.8, 2, 2, i % 2 ? P.white : P.yellow);
            }
            return;
          }
          const k = f.t / f.dur;
          g.text(f.str, x, f.y - k * 10, { size: 12, col: f.col, outline: P.black, align: 'center' });
        });
      }
      function drawHud(g) {
        g.R(1, 13, 33, 10, P.ink);
        for (let i = 0; i < 3; i++) heart(g, 3 + i * 10, 14, i < me.hearts);
        const n = active().length + left;
        const str = 'あと ' + n + '人';
        const w = g.measure(str, 12);
        g.R(W - w - 8, 13, w + 7, 14, P.ink);
        g.text(str, W - 4, 13, { size: 12, col: n <= 2 ? P.lime : P.lgreen, align: 'right' });
        // 画面の外にいるゾンビの向き
        active().forEach((z) => {
          const x = sx(z.x);
          if (x >= -4 && x <= W + 4) return;
          if (!g.blink(2)) return;
          const y = api.clamp(Math.round(z.y - 12), FLOOR_T + 4, FLOOR_B - 8);
          const right = x > W;
          for (let i = 0; i < 4; i++) g.R(right ? W - 3 - i : 2 + i, y - i, 1, i * 2 + 1, P.lgreen);
        });
      }

      return {
        me, zs, doors,
        get cured() { return cured; },
        get left() { return left; },
        get total() { return TOTAL; },
        get camX() { return camX; },
        get hurt() { return hurtN; },
        get punches() { return punches; },
        get hits() { return hits; },
        get pending() { return !!pending; },
        update(dt) {
          me.cool = Math.max(0, me.cool - dt);
          me.punchT = Math.max(0, me.punchT - dt);
          me.inv = Math.max(0, me.inv - dt);
          doors.forEach((d) => { d.tell = Math.max(0, d.tell - dt); });
          for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t > fx[i].dur) fx.splice(i, 1); }
          if (!api.ended) {
            moveMe(dt);
            updateSpawn(dt);
          }
          zs.forEach((z) => updateZombie(z, dt));
          separate();
          camX = api.clamp(Math.round(me.x - W / 2), 0, WORLD_W - W);
        },
        draw(g) {
          camX = api.clamp(Math.round(me.x - W / 2), 0, WORLD_W - W);
          drawNorth(g);
          drawFloor(g);
          // 人は奥（上）から順に
          const list = zs.map((z) => ({ y: z.y, f: () => drawZombie(g, z) }));
          list.push({ y: me.y, f: () => drawMe(g) });
          list.sort((a, b) => a.y - b.y).forEach((it) => it.f());
          drawSouth(g);
          // 吹き出し
          zs.forEach((z) => {
            const x = sx(z.x);
            if (x < -30 || x > W + 30) return;
            if (z.state === 'cured' && z.t >= SAY_FROM && z.t < SAY_TO) bubble(g, x, z.y - 22, z.line);
            else if (z.state !== 'cured' && z.mumbleT > 0) g.text(z.mumbleS, x, z.y - 38, { size: 12, col: P.lgreen, outline: P.black, align: 'center' });
          });
          drawFx(g);
          drawHud(g);
          drawMap(g);
          if (api.time > 0 && api.time < STORY_T && !api.ended) {
            g.R(28, 38, 200, 34, P.ink);
            g.frame(29, 39, 198, 32, P.violet);
            g.text('あやしいキノコ鍋を食べた寮生が', 128, 41, { size: 12, col: P.white, align: 'center' });
            g.text('ゾンビになった！', 128, 56, { size: 12, col: P.lgreen, align: 'center' });
          }
        },
      };
    },
  });
})();
