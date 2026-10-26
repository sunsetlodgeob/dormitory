/*
 * 男魂くんの1年 ― ピコピコ音（効果音と BGM）
 *  - 音のファイルは使わず、矩形波・三角波・ノイズをその場で鳴らす（ファミコンと同じ考え方）
 *  - 最初にキーやボタンを押すまでは鳴らさない（ブラウザの決まり）
 *  - オン・オフは localStorage 'otk-sound' に 'on' / 'off' で覚える
 * 使い方：OTK.audio.sfx('ok')、OTK.audio.bgm('play')、OTK.audio.stop()
 */
(function () {
  'use strict';
  const OTK = (window.OTK = window.OTK || {});
  const KEY = 'otk-sound';

  let on = true;
  try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* 使えなくても続行 */ }
  let ac = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
  let want = null; // 鳴らしたい BGM（まだ音を出せないときは覚えておく）
  let song = null;
  let timer = null;
  const waves = {};
  const listeners = [];

  function create() {
    if (ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ac = new AC(); } catch (e) { ac = null; return; }
    master = ac.createGain();
    master.gain.value = on ? 0.5 : 0;
    master.connect(ac.destination);
    musicBus = ac.createGain();
    musicBus.gain.value = 0.55;
    musicBus.connect(master);
    sfxBus = ac.createGain();
    sfxBus.gain.value = 0.8;
    sfxBus.connect(master);
    // ノイズ（1 秒ぶん）
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // パルス波（幅 12.5%・25%）
    for (const duty of [0.125, 0.25]) {
      const n = 32, re = new Float32Array(n), im = new Float32Array(n);
      for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      waves[duty] = ac.createPeriodicWave(re, im);
    }
  }

  function unlock() {
    create();
    if (!ac) return;
    if (ac.state === 'suspended' && !document.hidden) ac.resume().catch(() => {});
    if (want && !song) start(want);
  }

  function setOn(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* 使えなくても続行 */ }
    if (master) master.gain.setTargetAtTime(on ? 0.5 : 0, ac.currentTime, 0.02);
    listeners.forEach((fn) => fn(on));
  }

  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend().catch(() => {});
    else ac.resume().catch(() => {});
  });

  // ── 音のもと ───────────────────────────────────
  function osc(type, freq, when) {
    const o = ac.createOscillator();
    if (type === 'pulse12') o.setPeriodicWave(waves[0.125]);
    else if (type === 'pulse25') o.setPeriodicWave(waves[0.25]);
    else o.type = type;
    o.frequency.setValueAtTime(freq, when);
    return o;
  }
  // f0 から f1 へ音程を動かしながら鳴らす
  function tone(type, f0, f1, dur, vol, at, out) {
    const t = ac.currentTime + (at || 0);
    const o = osc(type, f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const gn = ac.createGain();
    gn.gain.setValueAtTime(vol, t);
    gn.gain.setValueAtTime(vol, t + dur * 0.6);
    gn.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(out || sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
    return o;
  }
  function noise(dur, vol, at, o, out) {
    o = o || {};
    const t = ac.currentTime + (at || 0);
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    let node = s;
    if (o.hp || o.lp || o.bp) {
      const f = ac.createBiquadFilter();
      f.type = o.hp ? 'highpass' : o.lp ? 'lowpass' : 'bandpass';
      const f0 = o.hp || o.lp || o.bp;
      f.frequency.setValueAtTime(f0, t);
      if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      if (o.q) f.Q.value = o.q;
      node = s.connect(f);
    }
    const gn = ac.createGain();
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    node.connect(gn).connect(out || sfxBus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }
  // 決まった音程を順に鳴らす（ピロリロ）
  function seq(type, notes, step, vol, at) {
    notes.forEach((f, i) => { if (f) tone(type, f, f, step * 0.9, vol, (at || 0) + i * step); });
  }
  const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI 番号 → 周波数

  // ── 効果音 ───────────────────────────────────
  const SFX = {
    ok: () => seq('pulse25', [NOTE(84), NOTE(91)], 0.06, 0.16),
    ng: () => { tone('square', 220, 200, 0.12, 0.13); tone('square', 165, 150, 0.2, 0.13, 0.12); },
    select: () => tone('pulse25', 1320, 1320, 0.035, 0.1),
    cursor: () => tone('pulse25', 990, 990, 0.03, 0.08),
    cancel: () => tone('pulse25', 660, 440, 0.07, 0.1),
    text: () => tone('pulse12', 1760, 1760, 0.015, 0.035),
    hit: () => { noise(0.12, 0.35, 0, { lp: 3000 }); tone('square', 300, 80, 0.12, 0.12); },
    punch: () => { noise(0.16, 0.45, 0, { lp: 1600, to: 300 }); tone('triangle', 180, 50, 0.14, 0.3); },
    jump: () => tone('pulse25', 280, 900, 0.16, 0.12),
    coin: () => { tone('pulse25', NOTE(83), NOTE(83), 0.07, 0.12); tone('pulse25', NOTE(88), NOTE(88), 0.22, 0.12, 0.07); },
    throw: () => noise(0.22, 0.28, 0, { bp: 3000, to: 500, q: 2 }),
    splat: () => { noise(0.3, 0.5, 0, { lp: 900, to: 150 }); tone('triangle', 120, 40, 0.2, 0.25); },
    step: () => noise(0.03, 0.15, 0, { hp: 2500 }),
    alarm: () => { for (let i = 0; i < 4; i++) tone('square', i % 2 ? 660 : 880, null, 0.12, 0.09, i * 0.15); },
    fanfare: () => {
      seq('pulse25', [NOTE(72), NOTE(76), NOTE(79), NOTE(84)], 0.08, 0.13);
      tone('pulse25', NOTE(84), NOTE(84), 0.45, 0.12, 0.32);
      tone('pulse12', NOTE(79), NOTE(79), 0.45, 0.08, 0.32);
      tone('triangle', NOTE(48), NOTE(48), 0.6, 0.3, 0.32);
    },
    buzzer: () => { tone('square', 118, 118, 0.5, 0.11); tone('square', 124, 124, 0.5, 0.11); },
    drink: () => { for (let i = 0; i < 3; i++) tone('triangle', 420 - i * 30, 200 - i * 20, 0.09, 0.35, i * 0.13); },
    vomit: () => { noise(0.6, 0.35, 0, { lp: 1200, to: 200 }); tone('square', 260, 70, 0.55, 0.09); tone('square', 240, 90, 0.3, 0.06, 0.15); },
    siren: () => {
      const t = ac.currentTime;
      const o = osc('square', 700, t);
      for (let i = 0; i < 2; i++) {
        o.frequency.linearRampToValueAtTime(1150, t + i * 0.8 + 0.4);
        o.frequency.linearRampToValueAtTime(700, t + i * 0.8 + 0.8);
      }
      const gn = ac.createGain();
      gn.gain.setValueAtTime(0.07, t);
      gn.gain.setValueAtTime(0.07, t + 1.45);
      gn.gain.linearRampToValueAtTime(0.0001, t + 1.6);
      o.connect(gn).connect(sfxBus);
      o.start(t);
      o.stop(t + 1.65);
    },
    count: () => tone('pulse25', NOTE(69), NOTE(69), 0.12, 0.13),
    go: () => tone('pulse25', NOTE(81), NOTE(81), 0.3, 0.14),
    tick: () => tone('pulse12', NOTE(93), NOTE(93), 0.04, 0.08),
    stamp: () => { noise(0.25, 0.5, 0, { lp: 700 }); tone('triangle', 110, 40, 0.25, 0.4); },
    pause: () => seq('pulse25', [NOTE(88), NOTE(81), NOTE(88), NOTE(81)], 0.05, 0.1),
    damage: () => { tone('square', 600, 120, 0.18, 0.12); noise(0.1, 0.2, 0, { hp: 1000 }); },
    power: () => seq('pulse25', [NOTE(72), NOTE(79), NOTE(84), NOTE(91)], 0.045, 0.11),
  };
  const lastSfx = {};

  // ── BGM（かんたんな MML で書く） ──────────────────────
  // 音符：c d e f g a b（+ で半音上、- で半音下）、数字は長さ（4 = 4分音符）、. は付点
  // r 休み、o4 オクターブ、> 1 つ上、< 1 つ下、l8 長さの省略値、q6 音を切る長さ（8 分の 6）、v10 音量（0〜15）
  // [ … ]3 で 3 回くりかえす。ドラムのパートは k（大太鼓）s（小太鼓）h（ハイハット）c（シンバル）
  const SONGS = {
    // タイトル：元気な行進曲
    title: {
      bpm: 132, loop: true,
      p1: `@1 o4 l8
        g8. g16 >c4 <g8. g16 >e4 | d8. c16 <b8. a16 g4 r4 | a8. a16 >d4 <a8. a16 >f4 | e8. d16 c8. <b16 >c4 r4 |
        <g8. g16 >c4 <g8. g16 >e4 | g8. f16 e8. d16 c8. d16 e4 | f8. e16 d8. c16 <b8. >c16 d8. <b16 | >c4 <g4 >c4 r4 |
        c8. c16 c8. d16 c4 <a4 | g8. g16 g8. a16 g4 e4 | f8. f16 f8. g16 a4 >d4 | <b8. >c16 d8. e16 d4 <g4 |
        >c8. c16 c8. d16 c4 <a4 | >e8. d16 c8. e16 g4 e4 | f8. e16 d8. f16 <b4 >d4 | c4 <g8 g8 >c4 r4`,
      p2: `@2 v7 o4 l8
        [r e r g]2 | r <b> r d r <b> r d | [r f r a]2 | r <b> r f r e r g |
        [r e r g]2 | [r e r g]2 | r f r a r d r f | [r e r g]2 |
        [r f r a]2 | [r e r g]2 | [r f r a]2 | r <b> r d r <b> r d |
        [r f r a]2 | [r e r g]2 | r f r a r d r f | [r e r g]2`,
      tri: `o3 l4
        c o2g o3c o2g | g d g d | d a d a | g d o3c o2g |
        o3c o2g o3c o2g | o3c o2g o3c o2g | f o3c o2g d | o3c o2g o3c r |
        o2f o3c o2f o3c | o3c o2g o3c o2g | d a d a | g d g d |
        f o3c o2f o3c | o3c o2g o3c o2g | d a g d | o3c o2g o3c r`,
      dr: `l8 [k h s h k h s16 s16 h]3 k h s h s16 s16 s16 s16 s c
        [k h s h k h s16 s16 h]3 k h s h s16 s16 s16 s16 s c
        [k h s h k h s16 s16 h]3 k h s h s16 s16 s16 s16 s c
        [k h s h k h s16 s16 h]3 k h s h s16 s16 s16 s16 s c`,
    },
    // ミニゲーム中：はずむ曲
    play: {
      bpm: 150, loop: true,
      p1: `@1 o5 l8
        d d r d r c <b >c | d4 <b g r g b >d | e e r e r d c d | e4 d c <b a b >c |
        d d r d r c <b >c | d4 g f+ e d e f+ | g e c e f+ d <a >c | <b >d g4 r g r <g`,
      p2: `@2 v6 o4 l8
        [r g r b]2 | [r g r b]2 | [r e r g]2 | [r f+ r a]2 |
        [r g r b]2 | [r g r b]2 | r e r g r f+ r a | [r g r b]2`,
      tri: `l8 [o2g o3g]4 | [o2e o3e]4 | [o2c o3c]4 | [o2d o3d]4 |
        [o2g o3g]4 | [o2e o3e]4 | [o2c o3c]2 [o2d o3d]2 | [o2g o3g]4`,
      dr: `l8 [k h s h k k s h]7 k h s h s16 s16 s16 s16 c4`,
    },
    // あせる曲
    tense: {
      bpm: 160, loop: true,
      p1: `@0 o5 l4 e4. e8 f e | c4. c8 d c | d4. d8 e d | <b >c d d+ |
        a4. a8 b- a | f4. f8 g f | g4. g8 a g | e2 d+2`,
      p2: `@1 v6 o4 l16 [a >c e c<]4 | [a >c f c<]4 | [b >d g d<]4 | [g+ b >e <b]4 |
        [a >c e c<]4 | [a >c f c<]4 | [b >d g d<]4 | [g+ b >e <b]4`,
      tri: `l8 [o2a a o3a o2a]2 | [o2f f o3f o2f]2 | [o2g g o3g o2g]2 | [o2e e o3e o2e]2 |
        [o2a a o3a o2a]2 | [o2f f o3f o2f]2 | [o2g g o3g o2g]2 | [o2e e o3e o2e]2`,
      dr: `l8 [k h s k k h s h]7 k h s h s16 s16 s16 s16 s s`,
    },
    // よいエンディング：あったかい曲
    ending_good: {
      bpm: 96, loop: true,
      p1: `@2 o5 l8 c4 <a >c f4 e d | c4 <g a b-4 a g | a4 f a >d4 c <b- | a4 g f g2 |
        >c4 <a >c f4 g a | g4 e c g4 f e | d4 f4 e4 g4 | f2. r4`,
      p2: `@1 v5 o4 l8 f a >c <a f a >c <a | e g >c <g e g >c <g | d f a f d f a f | d f b- f e g >c <g |
        f a >c <a f a >c <a | c e g e c e g e | d f b- f e g >c <g | f a >c f c <a f4`,
      tri: `l2 o2f o3c | o2e g | o2d a | o2b- o3c | o2f o3c | o2c g | o2b- o3c | o2f1`,
      dr: `v8 l4 [k h s h]8`,
    },
    // わるいエンディング：しょんぼりした曲
    ending_bad: {
      bpm: 76, loop: true,
      p1: `@2 o4 l4 a2 f d | b-2 a g | a g f e | d2. r4 |
        f2 e d | g2 f e | f e d c+ | d2. r4`,
      p2: `@1 v5 o4 l8 [d f a f]2 | [d g b- g]2 | [c+ e a e]2 | [d f a f]2 |
        [d f a f]2 | [d g b- g]2 | [c+ e a e]2 | [d f a f]2`,
      tri: `l1 o2d | g | a | d | d | g | a | d`,
    },
    // 勝ったとき・負けたときの短い曲
    win: {
      bpm: 150, loop: false,
      p1: `@1 o5 l16 c e g >c <g >c e8 r8 c4.`,
      p2: `@2 v8 o4 l16 g >c e g e g >c8 r8 <g4.`,
      tri: `l16 o3 c r c r c r c8 r8 c4.`,
      dr: `l16 k h s h k h s8 r8 c4.`,
    },
    lose: {
      bpm: 120, loop: false,
      p1: `@2 o4 l8 b r16 b- r16 a r16 a-4.`,
      tri: `l8 o2 e r16 d+ r16 d r16 c+4.`,
    },
    // 練習モードの一覧など（静かめ）
    menu: {
      bpm: 112, loop: true,
      p1: `@1 o5 l8 e4 g e d4 c <a | >c4 d e d2 | e4 g e d4 c <a | >c4 <a b >c2 |`,
      p2: `@2 v5 o4 l8 [r c r e]2 | [r d r f]2 | [r c r e]2 | r d r f r e r g`,
      tri: `l4 o3 c o2g a e | f o3c o2g d | o3c o2g a e | f g o3c r`,
      dr: `v9 l8 [k h h h s h h h]4`,
    },
  };
  const compiled = {};

  function expand(s) {
    let prev;
    do {
      prev = s;
      s = s.replace(/\[([^[\]]*)\](\d*)/g, (m, body, n) => (' ' + body + ' ').repeat(n ? +n : 2));
    } while (s !== prev);
    return s;
  }
  function parse(src, drums) {
    const s = expand(String(src || '').toLowerCase());
    let i = 0, oct = 4, len = 8, gate = 7 / 8, vol = 1, duty = 2, t = 0;
    const ev = [];
    const num = () => {
      const m = /^\d+/.exec(s.slice(i));
      if (!m) return null;
      i += m[0].length;
      return +m[0];
    };
    const dur = () => {
      const n = num();
      let d = 4 / (n || len);
      let add = d / 2;
      while (s[i] === '.') { d += add; add /= 2; i++; }
      return d;
    };
    while (i < s.length) {
      const c = s[i++];
      if (' \n\t|\r'.includes(c)) continue;
      if (drums && 'kshc'.includes(c)) {
        const d = dur();
        ev.push({ t, d, k: c, v: vol });
        t += d;
      } else if (c === 'o') oct = num();
      else if (c === 'l') len = num();
      else if (c === 'q') gate = num() / 8;
      else if (c === 'v') vol = num() / 15;
      else if (c === '@') duty = num();
      else if (c === '>') oct++;
      else if (c === '<') oct--;
      else if (c === 'r') t += dur();
      else if ('cdefgab'.includes(c)) {
        let semi = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[c];
        while (s[i] === '+' || s[i] === '#') { semi++; i++; }
        while (s[i] === '-') { semi--; i++; }
        const d = dur();
        ev.push({ t, d, f: NOTE(12 * (oct + 1) + semi), g: gate, v: vol, duty });
        t += d;
      }
    }
    return { ev, len: t };
  }
  function compile(name) {
    if (compiled[name]) return compiled[name];
    const def = SONGS[name];
    if (!def) return null;
    const parts = [];
    if (def.p1) parts.push(Object.assign({ ch: 'pulse', vol: 0.16 }, parse(def.p1)));
    if (def.p2) parts.push(Object.assign({ ch: 'pulse', vol: 0.16 }, parse(def.p2)));
    if (def.tri) parts.push(Object.assign({ ch: 'tri', vol: 0.32 }, parse(def.tri)));
    if (def.dr) parts.push(Object.assign({ ch: 'noise', vol: 0.3 }, parse(def.dr, true)));
    const len = Math.max(...parts.map((p) => p.len));
    compiled[name] = { def, parts, len };
    return compiled[name];
  }

  function playEvent(part, e, when, spb, bus) {
    const dur = e.d * spb;
    if (part.ch === 'noise') {
      const v = part.vol * e.v;
      const t0 = when - ac.currentTime;
      if (e.k === 'k') tone('triangle', 160, 45, 0.12, v * 1.6, t0, bus);
      else if (e.k === 's') noise(0.13, v * 0.9, t0, { hp: 1200 }, bus);
      else if (e.k === 'h') noise(0.035, v * 0.45, t0, { hp: 7000 }, bus);
      else if (e.k === 'c') noise(0.5, v * 0.6, t0, { hp: 4000 }, bus);
      return;
    }
    const len = Math.max(0.03, dur * e.g);
    const type = part.ch === 'tri' ? 'triangle' : e.duty === 0 ? 'pulse12' : e.duty === 1 ? 'pulse25' : 'square';
    const o = osc(type, e.f, when);
    const gn = ac.createGain();
    const v = part.vol * e.v;
    gn.gain.setValueAtTime(0.0001, when);
    gn.gain.linearRampToValueAtTime(v, when + 0.006);
    if (part.ch !== 'tri') gn.gain.linearRampToValueAtTime(v * 0.65, when + Math.min(len, 0.12));
    gn.gain.setValueAtTime(part.ch === 'tri' ? v : v * 0.65, when + len - 0.012);
    gn.gain.linearRampToValueAtTime(0.0001, when + len);
    o.connect(gn).connect(bus);
    o.start(when);
    o.stop(when + len + 0.02);
  }

  function schedule() {
    if (!song || !ac) return;
    const ahead = ac.currentTime + 0.25;
    let alive = false;
    for (const p of song.c.parts) {
      if (!p.ev.length) continue;
      for (let n = 0; n < 400; n++) {
        if (p.idx >= p.ev.length) {
          if (!song.c.def.loop) break;
          p.idx = 0;
          p.loop++;
        }
        const e = p.ev[p.idx];
        const when = song.t0 + (e.t + p.loop * song.c.len) * song.spb;
        if (when > ahead) { alive = true; break; }
        if (when >= ac.currentTime - 0.03) playEvent(p, e, when, song.spb, song.bus);
        p.idx++;
      }
      if (p.idx < p.ev.length) alive = true;
    }
    if (!alive && !song.c.def.loop && !song.ending) {
      const s = song;
      s.ending = true;
      setTimeout(() => { if (song === s) stopNow(); }, 1500);
    }
  }

  function start(name) {
    const c = compile(name);
    if (!c || !ac) return;
    stopNow();
    const bus = ac.createGain();
    bus.gain.value = 1;
    bus.connect(musicBus);
    song = { name, c, bus, spb: 60 / c.def.bpm, t0: ac.currentTime + 0.06 };
    c.parts.forEach((p) => { p.idx = 0; p.loop = 0; });
    schedule();
    if (!timer) timer = setInterval(schedule, 40);
  }
  function stopNow() {
    if (song) {
      const bus = song.bus;
      try {
        bus.gain.setTargetAtTime(0, ac.currentTime, 0.015);
        setTimeout(() => bus.disconnect(), 200);
      } catch (e) { /* もう止まっている */ }
    }
    song = null;
    if (timer) { clearInterval(timer); timer = null; }
  }

  OTK.audio = {
    unlock,
    get on() { return on; },
    get ready() { return !!ac; },
    get current() { return song ? song.name : null; },
    set: setOn,
    toggle() { setOn(!on); return on; },
    onChange(fn) { listeners.push(fn); },
    sfx(name) {
      if (!ac || !on || ac.state !== 'running') return;
      const fn = SFX[name];
      if (!fn) return;
      const now = ac.currentTime;
      if (lastSfx[name] && now - lastSfx[name] < 0.03) return;
      lastSfx[name] = now;
      try { fn(); } catch (e) { /* 音が出なくてもゲームは続ける */ }
    },
    // ループする曲。同じ曲が鳴っていれば何もしない
    bgm(name) {
      if (!SONGS[name]) return;
      const c = SONGS[name];
      want = c.loop ? name : null;
      if (!ac) { if (!c.loop) want = null; return; }
      if (song && song.name === name && c.loop) return;
      start(name);
    },
    stop() {
      want = null;
      if (ac) stopNow();
    },
    SFX_NAMES: Object.keys(SFX),
    BGM_NAMES: Object.keys(SONGS),
    _parse: parse,
    _songs: SONGS,
  };
})();
