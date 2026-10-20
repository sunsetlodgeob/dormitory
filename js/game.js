/*
 * 夕照寮 ― ゲーム本体（移動・会話・画面切りかえ）
 */
(function () {
  'use strict';
  const D = window.DORM;
  const TS = D.TS;
  const WORLD = D.WORLD;
  const { at, labelAt } = D.mapUtil;
  const R = D.art.R;

  const $ = (id) => document.getElementById(id);
  const el = {
    stage: $('stage'), canvas: $('screen'), hud: $('hud'), hudLoc: $('hud-loc'), hudQuest: $('hud-quest'),
    toast: $('toast'), msg: $('msg'), msgName: $('msg-name'), msgText: $('msg-text'), msgChoices: $('msg-choices'),
    msgNext: $('msg-next'), title: $('title-ui'), start: $('start-btn'), cont: $('continue-btn'),
    pad: $('pad'), dpad: $('dpad'), btnA: $('btn-a'), btnB: $('btn-b'), sound: $('sound-btn'), top: $('top'),
  };
  const ctx = el.canvas.getContext('2d');

  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STEP_MS = 190, RUN_MS = 105;
  const SAVE_KEY = 'sekisho-dorm-save-v1';

  for (const [id, m] of Object.entries(WORLD.maps)) {
    m.id = id;
    m.h = m.rows.length;
    m.w = m.rows[0].length;
  }
  const FLOOR_IN = new Set('.,=_~;-%<*`&'.split(''));
  const WALK_EXT = new Set('".:-;^ZE{'.split(''));
  // 通れるドア（$ はカギのかかったドア）
  const DOORS = '+/N';
  function walkable(map, x, y) {
    const ch = at(map, x, y);
    if (map.kind === 'ext') return WALK_EXT.has(ch);
    return FLOOR_IN.has(ch) || DOORS.includes(ch) || 'EUV'.includes(ch);
  }
  function placeName(map, x, y) {
    let n = labelAt(map, x, y);
    const ch = at(map, x, y);
    if (!n && DOORS.includes(ch)) n = labelAt(map, x, y + 1) || labelAt(map, x, y - 1) || labelAt(map, x + 1, y) || labelAt(map, x - 1, y);
    if (n) return n;
    return map.kind === 'in' ? '廊下' : map.name;
  }

  // ── 状態 ──────────────────────────────────────
  const npcs = WORLD.npcs.map((d) => Object.assign({}, d, { move: null, dist: 0, talked: false, wanderT: 1500 + Math.random() * 2500, hdir: 'left' }));
  const greetIds = [...new Set(WORLD.npcs.filter((n) => n.greet).map((n) => n.greet))];
  const TOTAL = greetIds.length;
  const S = {
    scene: 'title', mapId: null, map: null,
    p: { id: 'player', look: 'player', x: 0, y: 0, dir: 'up', move: null, dist: 0 },
    flags: {}, greeted: {}, dialog: null, fade: null, path: [], pending: null,
    time: 0, sceneTime: 0, cam: { x: 0, y: 0 }, held: [], padDir: null, run: false, petals: [],
  };
  let VW = 240, VH = 176, SCALE = 3;

  const countGreeted = () => greetIds.filter((g) => S.greeted[g]).length;
  const fill = (s) => s.replace('{left}', TOTAL - countGreeted()).replace('{total}', TOTAL);
  function visible(n) {
    return n.map === S.mapId && (!n.hideIf || !S.flags[n.hideIf]) && (!n.showIf || S.flags[n.showIf]);
  }
  function npcAt(x, y) {
    return npcs.find((n) => visible(n) && n.x === x && n.y === y) || null;
  }

  // ── 音（効果音だけ） ───────────────────────────────
  let actx = null;
  let soundOn = true;
  try { soundOn = localStorage.getItem('sekisho-sound') !== 'off'; } catch (e) { /* 使えなくても続行 */ }
  function ensureAudio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
  }
  function tone(freq, dur, type, vol, when) {
    if (!soundOn || !actx) return;
    const t0 = actx.currentTime + (when || 0);
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol || 0.035, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(actx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  function sfx(kind) {
    if (kind === 'blip') tone(820, 0.025, 'square', 0.015);
    else if (kind === 'ok') { tone(660, 0.05); tone(990, 0.07, 'square', 0.03, 0.05); }
    else if (kind === 'stairs') [0, 1, 2].forEach((i) => tone(330 + i * 70, 0.05, 'triangle', 0.05, i * 0.07));
    else if (kind === 'door') { tone(196, 0.07, 'triangle', 0.06); tone(131, 0.1, 'triangle', 0.05, 0.07); }
    else if (kind === 'jingle') [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.11, 'square', 0.03, i * 0.09));
  }
  function renderSoundBtn() {
    el.sound.textContent = soundOn ? '音 ON' : '音 OFF';
    el.sound.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
  }
  el.sound.addEventListener('click', () => {
    soundOn = !soundOn;
    try { localStorage.setItem('sekisho-sound', soundOn ? 'on' : 'off'); } catch (e) { /* noop */ }
    ensureAudio();
    renderSoundBtn();
    if (soundOn) sfx('ok');
  });
  renderSoundBtn();

  // ── 画面サイズ ─────────────────────────────────
  function layout() {
    const host = el.stage.parentElement;
    const side = window.matchMedia('(orientation: landscape) and (hover: none) and (max-height: 560px)').matches;
    const avail = Math.min(host.clientWidth - (side ? el.dpad.offsetWidth + el.btnA.offsetWidth + 40 : 0), 1100);
    const padH = !side && el.pad.offsetParent ? el.pad.offsetHeight + 12 : 0;
    const headH = el.top ? el.top.offsetHeight : 0;
    const maxH = Math.max(220, window.innerHeight - headH - padH - 40);
    let scale = avail >= 900 ? 4 : avail >= 600 ? 3 : 2;
    let vw = 0, vh = 0;
    for (; scale >= 2; scale--) {
      vw = Math.floor(avail / scale);
      vh = Math.floor(Math.min(vw * (avail < 600 ? 1 : 0.68), maxH / scale));
      if (vh >= 136 || scale === 2) break;
    }
    if (avail < 2 * 160) { scale = Math.max(1.5, avail / 160); vw = 160; vh = Math.floor(Math.min(160, maxH / scale)); }
    VW = vw;
    VH = Math.max(112, vh);
    SCALE = scale;
    el.canvas.width = VW;
    el.canvas.height = VH;
    el.canvas.style.width = Math.round(VW * scale) + 'px';
    el.canvas.style.height = Math.round(VH * scale) + 'px';
    el.stage.style.width = Math.round(VW * scale) + 'px';
    el.stage.style.setProperty('--scale', String(scale));
    ctx.imageSmoothingEnabled = false;
    if (S.map) updateCamera();
  }

  // ── マップ移動 ─────────────────────────────────
  function enterMap(mapId, x, y, dir) {
    S.mapId = mapId;
    S.map = WORLD.maps[mapId];
    if (!S.map.bg) D.renderMap(S.map);
    Object.assign(S.p, { x, y, dir, move: null });
    S.path = [];
    S.pending = null;
    updateCamera();
    updateHud();
  }
  function fadeTo(mid, after, dur) {
    const d = reduceMotion ? 60 : dur || 260;
    S.fade = { t: 0, dur: d, mid, after, phase: 'out' };
  }
  function updateFade(dt) {
    const f = S.fade;
    if (!f) return;
    f.t += dt;
    if (f.phase === 'out' && f.t >= f.dur) {
      f.phase = 'in';
      f.t = 0;
      if (f.mid) f.mid();
    } else if (f.phase === 'in' && f.t >= f.dur) {
      S.fade = null;
      if (f.after) f.after();
    }
  }
  function go(link, via) {
    sfx(via === 'E' ? 'door' : 'stairs');
    fadeTo(() => enterMap(link.to, link.x, link.y, link.dir));
  }

  // ── 移動 ──────────────────────────────────────
  function startMove(ent, dir, dur) {
    ent.dir = dir;
    if (dir === 'left' || dir === 'right') ent.hdir = dir;
    const [dx, dy] = DIRS[dir];
    const nx = ent.x + dx, ny = ent.y + dy;
    if (!walkable(S.map, nx, ny)) return false;
    const other = npcAt(nx, ny);
    if (other && other !== ent) return false;
    if (ent !== S.p && S.p.x === nx && S.p.y === ny) return false;
    if (ent !== S.p && S.map.links && S.map.links[at(S.map, nx, ny)]) return false;
    ent.move = { fx: ent.x, fy: ent.y, t: 0, dur };
    ent.x = nx;
    ent.y = ny;
    return true;
  }
  function pos(ent) {
    if (!ent.move) return [ent.x * TS, ent.y * TS];
    const k = Math.min(1, ent.move.t / ent.move.dur);
    return [(ent.move.fx + (ent.x - ent.move.fx) * k) * TS, (ent.move.fy + (ent.y - ent.move.fy) * k) * TS];
  }
  const currentDir = () => S.held[S.held.length - 1] || null;

  function updatePlayer(dt) {
    const p = S.p;
    if (p.move) {
      p.move.t += dt;
      p.dist += (dt / p.move.dur) * TS;
      if (p.move.t < p.move.dur) return;
      p.move = null;
      arrive();
    }
    if (S.dialog || S.fade || S.scene !== 'play') return;
    const dir = currentDir();
    if (dir) {
      S.path = [];
      S.pending = null;
      if (!startMove(p, dir, S.run ? RUN_MS : STEP_MS)) p.dir = dir;
      return;
    }
    if (S.path.length) {
      const d = S.path.shift();
      if (!startMove(p, d, S.run ? RUN_MS : STEP_MS)) {
        S.path = [];
        S.pending = null;
      }
      return;
    }
    if (S.pending) {
      const t = S.pending;
      S.pending = null;
      faceTo(t.x, t.y);
      interact();
    }
  }
  function arrive() {
    const ch = at(S.map, S.p.x, S.p.y);
    const link = S.map.links && S.map.links[ch];
    if (link) {
      S.path = [];
      S.pending = null;
      go(link, ch);
      return;
    }
    updateHud();
  }
  function updateNPCs(dt) {
    for (const n of npcs) {
      if (n.move) {
        n.move.t += dt;
        n.dist += (dt / n.move.dur) * TS;
        if (n.move.t >= n.move.dur) n.move = null;
        continue;
      }
      if (!n.wander || n.map !== S.mapId || S.dialog) continue;
      n.wanderT -= dt;
      if (n.wanderT > 0) continue;
      n.wanderT = 1400 + Math.random() * 2800;
      const keys = Object.keys(DIRS);
      const d = keys[(Math.random() * 4) | 0];
      const [dx, dy] = DIRS[d];
      const w = n.wander;
      const nx = n.x + dx, ny = n.y + dy;
      if (nx < w.x || ny < w.y || nx >= w.x + w.w || ny >= w.y + w.h) {
        n.dir = d;
        if (d === 'left' || d === 'right') n.hdir = d;
        continue;
      }
      startMove(n, d, 340);
    }
  }
  function faceTo(tx, ty) {
    const dx = tx - S.p.x, dy = ty - S.p.y;
    if (dx === 0 && dy === 0) return;
    S.p.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  }
  function findPath(sx, sy, isGoal) {
    const map = S.map;
    const prev = new Map([[sx + ',' + sy, null]]);
    const q = [[sx, sy]];
    let goal = null;
    for (let qi = 0; qi < q.length && qi < 5000; qi++) {
      const [x, y] = q[qi];
      if ((x !== sx || y !== sy) && isGoal(x, y)) { goal = [x, y]; break; }
      for (const d of Object.keys(DIRS)) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        const k = nx + ',' + ny;
        if (prev.has(k) || !walkable(map, nx, ny) || npcAt(nx, ny)) continue;
        if (map.links && map.links[at(map, nx, ny)] && !isGoal(nx, ny)) continue;
        prev.set(k, [x, y, d]);
        q.push([nx, ny]);
      }
    }
    if (!goal) return null;
    const path = [];
    let k = goal[0] + ',' + goal[1];
    while (prev.get(k)) {
      const [px, py, d] = prev.get(k);
      path.unshift(d);
      k = px + ',' + py;
    }
    return path;
  }
  function tapTile(tx, ty, hit) {
    const p = S.p;
    if (tx === p.x && ty === p.y) { interact(); return; }
    const target = hit || npcAt(tx, ty);
    if (target || !walkable(S.map, tx, ty)) {
      const near = (x, y) => Math.abs(x - tx) + Math.abs(y - ty) === 1;
      const across = (x, y) => {
        if (!target) return false;
        const dx = tx - x, dy = ty - y;
        if (!((Math.abs(dx) === 2 && dy === 0) || (Math.abs(dy) === 2 && dx === 0))) return false;
        return at(S.map, x + dx / 2, y + dy / 2) === 'n';
      };
      if (near(p.x, p.y) || across(p.x, p.y)) { faceTo(tx, ty); interact(); return; }
      const path = findPath(p.x, p.y, (x, y) => near(x, y) || across(x, y));
      if (path) { S.path = path; S.pending = { x: tx, y: ty }; }
      return;
    }
    const path = findPath(p.x, p.y, (x, y) => x === tx && y === ty);
    if (path) { S.path = path; S.pending = null; }
  }

  // ── 調べる・話す ────────────────────────────────
  function interact() {
    if (S.dialog || S.fade || S.p.move || S.scene !== 'play') return;
    const [dx, dy] = DIRS[S.p.dir];
    const fx = S.p.x + dx, fy = S.p.y + dy;
    const ch = at(S.map, fx, fy);
    let n = npcAt(fx, fy);
    if (!n && ch === 'n') n = npcAt(fx + dx, fy + dy);
    if (n) return talk(n);
    examineTile(fx, fy, ch);
  }
  function examineTile(x, y, ch) {
    const place = placeName(S.map, S.p.x, S.p.y);
    const special = WORLD.examineAt[S.mapId + ':' + x + ',' + y];
    if (Array.isArray(special)) return say(special);
    if (ch === 'O') {
      return say([{ t: '大きな湯船だ。ひと風呂浴びていく？', choices: ['はい', 'いいえ'], on: (i) => {
        if (i === 0) fadeTo(() => {}, () => say(['ふぅ〜…。さっぱりした！']), 650);
      } }]);
    }
    if (ch === 'v') {
      return say([{ t: 'コカ・コーラの自販機だ。何か買う？', choices: ['買う', 'やめる'], on: (i) => {
        if (i === 0) say(['ガコン！ ' + ['コカ・コーラ', 'ジョージア', 'アクエリアス', '爽健美茶'][(Math.random() * 4) | 0] + 'を買った。']);
      } }]);
    }
    if (ch === 'D') return dydo();
    if (ch === 'w') {
      if (y < 7) return say(['窓の外に、川が見える。']);
      if (y > 8) return say(['窓の外は道路だ。']);
      return say(['窓から、外の光が入ってくる。']);
    }
    const lines = WORLD.examine[ch + '@' + place] || WORLD.examine[ch];
    if (lines) say(lines);
  }
  // ダイドーの自販機：数字がそろうと、もう 1 本えらべる
  function dydo() {
    const drinks = ['缶コーヒー', 'お茶', 'スポーツドリンク', 'オレンジジュース'];
    say([{ t: 'ダイドーの自販機だ。当たり付き。何か買う？', choices: ['買う', 'やめる'], on: (i) => {
      if (i !== 0) return;
      const first = drinks[(Math.random() * drinks.length) | 0];
      if (Math.random() < 0.3) {
        say(['ガコン！ ' + first + 'を買った。', 'ピピピピ……「7777」！', { t: '当たりだ！ 10秒以内に、もう1本えらべる！', choices: drinks.slice(0, 3), on: (j) => {
          sfx('jingle');
          say(['ガコン！ ' + drinks[j] + 'も、もらった。']);
        } }]);
      } else {
        const n = 7770 + 1 + ((Math.random() * 8) | 0);
        say(['ガコン！ ' + first + 'を買った。', 'ピピピピ……「' + n + '」。おしい！']);
      }
    } }]);
  }
  function talk(n) {
    if (!n.pose) n.dir = n.cat ? (S.p.x > n.x ? 'right' : S.p.x < n.x ? 'left' : n.dir) : OPP[S.p.dir];
    if (n.cat && (n.dir === 'left' || n.dir === 'right')) n.hdir = n.dir;
    if (n.script === 'kanri') return talkKanri(n);
    if (n.script === 'ending') return talkEnding(n);
    let newly = false;
    let lines = n.talked ? n.again : n.first;
    if (n.greet && !S.greeted[n.greet]) {
      S.greeted[n.greet] = true;
      newly = true;
      lines = n.first;
    }
    n.talked = true;
    say(lines.map(fill), { name: n.name, onEnd: () => { if (newly) greetedOne(); } });
  }
  function talkKanri(n) {
    let lines;
    if (!S.flags.metKanri) { lines = WORLD.story.kanriFirst; S.flags.metKanri = true; }
    else if (S.flags.questDone) lines = WORLD.story.kanriDone;
    else lines = WORLD.story.kanriAgain;
    say(lines.map(fill), { name: n.name });
  }
  function talkEnding(n) {
    if (!S.flags.endingSeen) return playEnding();
    say([{ s: n.name, t: WORLD.story.endingAgain[0], choices: ['見る', 'やめておく'], on: (i) => { if (i === 0) playEnding(); } }]);
  }
  function playEnding() {
    fadeTo(() => {
      S.scene = 'ending';
      S.sceneTime = 0;
      updateHud();
    }, () => {
      say(WORLD.story.ending, { onEnd: () => {
        S.flags.endingSeen = true;
        fadeTo(() => { S.scene = 'play'; updateHud(); save(); }, null, 700);
      } });
    }, 900);
  }
  function greetedOne() {
    const c = countGreeted();
    sfx('jingle');
    toast('あいさつ ' + c + ' / ' + TOTAL);
    updateHud();
    if (c >= TOTAL && !S.flags.questDone) {
      S.flags.questDone = true;
      say(WORLD.story.questDone, { onEnd: () => { updateHud(); save(); } });
    } else save();
  }

  // ── メッセージ ─────────────────────────────────
  function norm(line, name) {
    if (typeof line === 'string') return { name: line[0] === '（' || !name ? '' : name, text: line };
    return { name: line.s != null ? line.s : name || '', text: line.t, choices: line.choices, on: line.on };
  }
  function say(lines, opts) {
    const o = opts || {};
    S.dialog = { lines: lines.map((l) => norm(l, o.name)), i: 0, shown: 0, choice: 0, onEnd: o.onEnd };
    S.path = [];
    S.pending = null;
    renderDialog();
  }
  function updateDialog(dt) {
    const d = S.dialog;
    if (!d) return;
    const line = d.lines[d.i];
    if (d.shown >= line.text.length) return;
    const before = Math.floor(d.shown);
    d.shown = reduceMotion ? line.text.length : Math.min(line.text.length, d.shown + dt * 0.05);
    const now = Math.floor(d.shown);
    if (now !== before) {
      el.msgText.textContent = line.text.slice(0, now);
      if (now % 3 === 0) sfx('blip');
    }
    if (d.shown >= line.text.length) renderDialog();
  }
  function renderDialog() {
    const d = S.dialog;
    if (!d) { el.msg.hidden = true; return; }
    const line = d.lines[d.i];
    el.msg.hidden = false;
    el.msgName.textContent = line.name;
    el.msgName.hidden = !line.name;
    el.msgText.textContent = line.text.slice(0, Math.floor(d.shown));
    const done = d.shown >= line.text.length;
    el.msgNext.hidden = !done || !!line.choices;
    el.msgChoices.textContent = '';
    if (done && line.choices) {
      line.choices.forEach((c, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'choice' + (i === d.choice ? ' is-on' : '');
        b.textContent = c;
        b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); choose(i); });
        el.msgChoices.appendChild(b);
      });
    }
  }
  function advance() {
    const d = S.dialog;
    if (!d) return;
    const line = d.lines[d.i];
    if (d.shown < line.text.length) {
      d.shown = line.text.length;
      renderDialog();
      return;
    }
    if (line.choices) return choose(d.choice);
    d.i++;
    d.shown = 0;
    d.choice = 0;
    if (d.i >= d.lines.length) {
      S.dialog = null;
      el.msg.hidden = true;
      if (d.onEnd) d.onEnd();
      return;
    }
    renderDialog();
  }
  function choose(i) {
    const d = S.dialog;
    if (!d) return;
    const line = d.lines[d.i];
    sfx('ok');
    S.dialog = null;
    el.msg.hidden = true;
    if (line.on) line.on(i);
    if (d.onEnd) d.onEnd();
  }
  function moveChoice(dir) {
    const d = S.dialog;
    if (!d) return;
    const line = d.lines[d.i];
    if (!line.choices || d.shown < line.text.length) return;
    const k = dir === 'up' || dir === 'left' ? -1 : 1;
    d.choice = (d.choice + k + line.choices.length) % line.choices.length;
    renderDialog();
  }

  // ── HUD・トースト ───────────────────────────────
  let toastT = 0;
  function toast(text) {
    el.toast.textContent = text;
    el.toast.hidden = false;
    toastT = 2000;
  }
  function updateHud() {
    if (S.scene !== 'play' || !S.map) { el.hud.hidden = true; return; }
    el.hud.hidden = false;
    const place = placeName(S.map, S.p.x, S.p.y);
    el.hudLoc.textContent = (S.map.kind === 'in' ? S.map.floor + ' ' : '') + place;
    if (S.flags.endingSeen) el.hudQuest.textContent = 'ようこそ夕照寮へ';
    else if (S.flags.questDone) el.hudQuest.textContent = '屋上へ行こう';
    else el.hudQuest.textContent = 'あいさつ ' + countGreeted() + ' / ' + TOTAL;
  }

  // ── カメラと描画 ────────────────────────────────
  function updateCamera() {
    const [px, py] = pos(S.p);
    const mw = S.map.w * TS, mh = S.map.h * TS;
    let cx = px + 8 - VW / 2;
    let cy = py + 8 - VH * (S.map.kind === 'ext' ? 0.6 : 0.5);
    cx = mw <= VW ? -(VW - mw) / 2 : Math.max(0, Math.min(mw - VW, cx));
    cy = mh <= VH ? -(VH - mh) / 2 : Math.max(0, Math.min(mh - VH, cy));
    S.cam.x = Math.round(cx);
    S.cam.y = Math.round(cy);
  }

  function drawChar(c, e, sx, sy) {
    sx = Math.round(sx);
    sy = Math.round(sy);
    if (e.cat) {
      const fr = e.move ? (Math.floor(e.dist / 6) % 2 ? 'a' : 's') : 's';
      R(c, sx + 3, sy + 14, 10, 2, 'rgba(0,0,0,0.18)');
      c.drawImage(D.art.catSprite(e.hdir || 'left', fr), sx, sy - 2);
      return;
    }
    if (e.pose === 'sleep') {
      const sp = D.art.sprite(e.look, 'down', 's', 'sleep');
      c.drawImage(sp, 0, 0, 16, 14, sx, sy - 2, 16, 14);
      drawZzz(c, sx + 11, sy - 3);
      return;
    }
    if (e.pose === 'bath') {
      const sp = D.art.sprite(e.look, 'down', 's');
      c.drawImage(sp, 0, 0, 16, 16, sx, sy - 3, 16, 16);
      R(c, sx + 1, sy + 9, 14, 6, D.PAL.water);
      R(c, sx + 2, sy + 9, 12, 1, D.PAL.waterHi);
      R(c, sx + 3 + (Math.floor(S.time / 300) % 3), sy + 11, 3, 1, D.PAL.waterHi);
      return;
    }
    let fr = 's';
    if (e.move) fr = ['a', 's', 'b', 's'][Math.floor(e.dist / 8) % 4];
    R(c, sx + 3, sy + 13, 10, 3, 'rgba(0,0,0,0.16)');
    c.drawImage(D.art.sprite(e.look, e.dir, fr, e.pose), sx, sy - 5);
    if (e.pose === 'doze') drawZzz(c, sx + 12, sy - 8);
  }
  function drawZzz(c, x, y) {
    const t = (S.time / 900) % 1;
    const z = (zx, zy, a) => {
      c.globalAlpha = a;
      for (const [ox, oy, col] of [[1, 1, D.PAL.ink], [0, 0, '#f3f0e6']]) {
        R(c, zx + ox, zy + oy, 4, 1, col); R(c, zx + ox + 2, zy + oy + 1, 1, 1, col);
        R(c, zx + ox + 1, zy + oy + 2, 1, 1, col); R(c, zx + ox, zy + oy + 3, 4, 1, col);
      }
      c.globalAlpha = 1;
    };
    z(x, Math.round(y - t * 6), 1 - t);
    z(x + 4, Math.round(y - 5 - t * 6), Math.max(0, 0.8 - t));
  }
  function drawBubble(c, x, y) {
    const b = Math.floor(S.time / 400) % 2;
    y -= b;
    R(c, x, y, 9, 6, D.PAL.ink);
    R(c, x + 1, y - 1, 7, 8, D.PAL.ink);
    R(c, x + 1, y, 7, 6, '#fff8ea');
    R(c, x + 2, y + 6, 2, 2, D.PAL.ink);
    R(c, x + 2, y + 6, 1, 1, '#fff8ea');
    R(c, x + 2, y + 3, 1, 1, D.PAL.ink); R(c, x + 4, y + 3, 1, 1, D.PAL.ink); R(c, x + 6, y + 3, 1, 1, D.PAL.ink);
  }

  function initPetals() {
    S.petals = [];
    for (let i = 0; i < 26; i++) S.petals.push({ x: Math.random() * 400, y: Math.random() * 300, v: 0.008 + Math.random() * 0.012, ph: Math.random() * 6 });
  }
  function drawPetals(c, dt) {
    for (const p of S.petals) {
      p.y += p.v * dt;
      p.x += (p.v * 0.6 + Math.sin(S.time / 700 + p.ph) * 0.01) * dt;
      if (p.y > VH + 4) { p.y = -4; p.x = Math.random() * (VW + 40) - 40; }
      if (p.x > VW + 4) p.x = -4;
      R(c, Math.round(p.x), Math.round(p.y), 2, 1, (p.ph > 3) ? '#fde8ef' : '#f2b3c6');
    }
  }

  function renderPlay(c, dt) {
    const m = S.map;
    const cx = S.cam.x, cy = S.cam.y;
    c.fillStyle = m.kind === 'ext' ? '#2f3f2a' : '#17111c';
    c.fillRect(0, 0, VW, VH);
    c.drawImage(m.bg, -cx, -cy);
    D.art.drawAnim(c, m, cx, cy, S.time);
    const ents = [S.p].concat(npcs.filter(visible));
    for (const e of ents) {
      const tiles = [[e.x, e.y]];
      if (e.move) tiles.push([e.move.fx, e.move.fy]);
      for (const [x, y] of tiles) {
        const ch = at(m, x, y);
        if (ch === '+' || ch === 'N') D.art.drawDoor(c, m, x, y, x * TS - cx, y * TS - cy, ch, true);
      }
    }
    const list = [];
    for (const e of ents) {
      const [px, py] = pos(e);
      list.push({ y: py + 15 + (e === S.p ? 0.5 : 0), f: () => drawChar(c, e, px - cx, py - cy) });
    }
    if (m.tall) for (const t of m.tall) {
      const sx = t.x * TS - cx, sy = t.y * TS - cy;
      if (sx < -56 || sx > VW + 40 || sy < -40 || sy > VH + 40) continue;
      list.push({ y: (t.y + (t.h || 1) - 1) * TS + 15, f: () => D.art.drawTallExt(c, t.ch, t.x, t.y, sx, sy, S.time) });
    }
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.f();
    // まだあいさつしていない人に吹き出し
    for (const n of ents) {
      if (n === S.p || !n.greet || S.greeted[n.greet] || n.pose === 'sleep') continue;
      const [px, py] = pos(n);
      drawBubble(c, Math.round(px - cx) + 10, Math.round(py - cy) - 14);
    }
    if (m.kind === 'ext') drawPetals(c, dt);
    if (S.flags.questDone && m.kind !== 'in') {
      c.fillStyle = 'rgba(255,128,72,0.13)';
      c.fillRect(0, 0, VW, VH);
    }
  }

  let last = 0;
  function frame(ts) {
    const dt = Math.min(50, last ? ts - last : 16);
    last = ts;
    S.time += dt;
    S.sceneTime += dt;
    updateFade(dt);
    updateDialog(dt);
    if (S.scene === 'play') {
      updatePlayer(dt);
      updateNPCs(dt);
      updateCamera();
    }
    if (toastT > 0) {
      toastT -= dt;
      if (toastT <= 0) el.toast.hidden = true;
    }
    ctx.imageSmoothingEnabled = false;
    if (S.scene === 'title' || S.scene === 'intro') {
      D.art.drawTitle(ctx, VW, VH, S.time);
      if (S.scene === 'intro') {
        ctx.fillStyle = 'rgba(18,10,24,0.6)';
        ctx.fillRect(0, 0, VW, VH);
      }
    } else if (S.scene === 'ending') {
      D.art.drawEnding(ctx, VW, VH, S.sceneTime, ['roommate', 'player', 'ryocho']);
    } else if (S.map) {
      renderPlay(ctx, dt);
    }
    if (S.fade) {
      const f = S.fade;
      const a = f.phase === 'out' ? f.t / f.dur : 1 - f.t / f.dur;
      ctx.fillStyle = 'rgba(16,10,22,' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
      ctx.fillRect(0, 0, VW, VH);
    }
    requestAnimationFrame(frame);
  }

  // ── 入力 ──────────────────────────────────────
  function pressDir(d) {
    S.held = S.held.filter((x) => x !== d);
    S.held.push(d);
    if (S.dialog) moveChoice(d);
  }
  function releaseDir(d) {
    S.held = S.held.filter((x) => x !== d);
  }
  function onAction() {
    ensureAudio();
    if (S.scene === 'title') return startGame();
    if (S.dialog) return advance();
    if (S.scene === 'play') interact();
  }
  function onCancel() {
    if (!S.dialog) return;
    const line = S.dialog.lines[S.dialog.i];
    if (line.choices && S.dialog.shown >= line.text.length) return choose(line.choices.length - 1);
    advance();
  }
  function stageInView() {
    const r = el.stage.getBoundingClientRect();
    return r.bottom > 40 && r.top < window.innerHeight - 40;
  }
  const KEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  const ACTION = new Set(['KeyZ', 'Enter', 'Space', 'NumpadEnter']);
  const CANCEL = new Set(['KeyX', 'Escape', 'ShiftLeft', 'ShiftRight']);
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || !stageInView()) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'A') return;
    const onButton = tag === 'BUTTON';
    if (KEYS[e.code]) {
      e.preventDefault();
      if (!e.repeat) pressDir(KEYS[e.code]);
      return;
    }
    if (ACTION.has(e.code)) {
      if (onButton && e.code !== 'KeyZ') return;
      e.preventDefault();
      if (!e.repeat) onAction();
      return;
    }
    if (CANCEL.has(e.code)) {
      S.run = true;
      if (!e.repeat) onCancel();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (KEYS[e.code]) releaseDir(KEYS[e.code]);
    if (CANCEL.has(e.code)) S.run = false;
  });
  window.addEventListener('blur', () => { S.held = []; S.run = false; setPadDir(null); });

  // 十字キー（タッチ）
  let dpadPointer = null;
  function setPadDir(d) {
    if (S.padDir === d) return;
    if (S.padDir) releaseDir(S.padDir);
    S.padDir = d;
    el.dpad.dataset.dir = d || '';
    if (d) pressDir(d);
  }
  function dpadFrom(e) {
    const r = el.dpad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < r.width * 0.1) return setPadDir(null);
    setPadDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  }
  el.dpad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ensureAudio();
    dpadPointer = e.pointerId;
    try { el.dpad.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    dpadFrom(e);
  });
  el.dpad.addEventListener('pointermove', (e) => { if (e.pointerId === dpadPointer) dpadFrom(e); });
  const dpadEnd = (e) => { if (e.pointerId === dpadPointer) { dpadPointer = null; setPadDir(null); } };
  el.dpad.addEventListener('pointerup', dpadEnd);
  el.dpad.addEventListener('pointercancel', dpadEnd);
  el.dpad.addEventListener('lostpointercapture', dpadEnd);
  el.btnA.addEventListener('pointerdown', (e) => { e.preventDefault(); onAction(); });
  el.btnB.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { el.btnB.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    S.run = true;
    onCancel();
  });
  const bEnd = () => { S.run = false; };
  el.btnB.addEventListener('pointerup', bEnd);
  el.btnB.addEventListener('pointercancel', bEnd);
  el.btnB.addEventListener('lostpointercapture', bEnd);
  for (const b of [el.btnA, el.btnB]) b.addEventListener('click', (e) => e.preventDefault());
  el.pad.addEventListener('contextmenu', (e) => e.preventDefault());

  // 画面タップ
  el.canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ensureAudio();
    if (S.scene === 'title') return startGame();
    if (S.dialog) return advance();
    if (S.scene !== 'play' || S.fade) return;
    const r = el.canvas.getBoundingClientRect();
    const gx = ((e.clientX - r.left) / r.width) * VW + S.cam.x;
    const gy = ((e.clientY - r.top) / r.height) * VH + S.cam.y;
    const tx = Math.floor(gx / TS), ty = Math.floor(gy / TS);
    const hit = npcAt(tx, ty) || (gy - ty * TS > 9 ? npcAt(tx, ty + 1) : null);
    if (hit) tapTile(hit.x, hit.y, hit);
    else tapTile(tx, ty, null);
  });
  el.msg.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.choice')) return;
    e.preventDefault();
    advance();
  });

  // ── はじめる・つづきから・保存 ──────────────────────────
  function snapshot() {
    return {
      v: 1, scene: S.scene === 'title' || S.scene === 'intro' ? 'title' : 'play', mapId: S.mapId, x: S.p.x, y: S.p.y, dir: S.p.dir,
      flags: Object.assign({}, S.flags), greeted: Object.assign({}, S.greeted), talked: npcs.filter((n) => n.talked).map((n) => n.id),
    };
  }
  function save() {
    if (S.scene !== 'play') return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot())); } catch (e) { /* noop */ }
  }
  function loadSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
  }
  function restore(d) {
    if (!d || d.v !== 1 || d.scene !== 'play' || !WORLD.maps[d.mapId]) return false;
    S.flags = d.flags || {};
    S.greeted = d.greeted || {};
    for (const n of npcs) n.talked = (d.talked || []).indexOf(n.id) >= 0;
    el.title.hidden = true;
    S.scene = 'play';
    enterMap(d.mapId, d.x, d.y, d.dir || 'down');
    return true;
  }
  function startGame() {
    if (S.scene !== 'title') return;
    ensureAudio();
    sfx('ok');
    el.title.hidden = true;
    S.scene = 'intro';
    S.flags = {};
    S.greeted = {};
    for (const n of npcs) n.talked = false;
    say(WORLD.story.intro.concat(['（行きたい場所をタップするか、十字キーで移動。A ボタンで話す・調べる）']), { onEnd: () => {
      fadeTo(() => {
        S.scene = 'play';
        const st = WORLD.start;
        enterMap(st.map, st.x, st.y, st.dir);
      }, () => save(), 450);
    } });
  }
  el.start.addEventListener('click', () => startGame());
  el.cont.addEventListener('click', () => {
    ensureAudio();
    sfx('ok');
    if (!restore(loadSave())) startGame();
  });

  function boot(data) {
    layout();
    initPetals();
    if (!(data && restore(data.game))) {
      el.title.hidden = false;
      el.cont.hidden = !(loadSave() && loadSave().scene === 'play');
    }
    updateHud();
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', layout);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { S.held = []; save(); } });
  setInterval(save, 5000);

  // フォントが届いたら、看板の文字を描き直す
  D.fontReady = false;
  if (document.fonts && document.fonts.load) {
    document.fonts.load('16px "DotGothic16"', '夕照寮').then(() => {
      D.fontReady = true;
      const ext = WORLD.maps.EXT;
      if (ext.bg) D.renderMap(ext);
    }).catch(() => {});
  }

  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) {
    try { hot.snapshot(() => ({ game: snapshot() })); } catch (e) { /* noop */ }
  }
  if (hot && hot.ready) hot.ready(boot);
  else boot((hot && hot.data) || {});

  // テスト用の窓口
  D.debug = { S, npcs, enterMap, tapTile, interact, say, advance, countGreeted, TOTAL, get VW() { return VW; }, get VH() { return VH; } };
})();
