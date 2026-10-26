/*
 * 夕照寮OB会 ― ホームの音（ピコピコ音の BGM と効果音）
 * WebAudio の矩形波・三角波・ノイズだけで鳴らす。曲はこのサイトのために作ったオリジナル。
 * 最初の操作（キー・タップ）のあとでしか鳴らさない。オン・オフは localStorage 'ob-home-sound'。
 */
(function () {
  'use strict';
  const H = (window.HOME = window.HOME || {});
  const KEY = 'ob-home-sound';

  // ── 曲の書き方 ────────────────────────────────────
  // 「音名/長さ」を空白で並べる。長さは 16 分音符いくつ分か。'-' は休み。
  // 和音（chords）は半小節（8 つ）ごと。ベースと伴奏と太鼓はそこから自動で作る。
  const TRACKS = {
    // タイトル〜メニュー：元気な行進曲（ハ長調）
    march: {
      bpm: 132,
      lead: [
        // A
        'C5/3 C5/1 E5/3 C5/1 G5/4 E5/4',
        'F5/3 E5/1 D5/3 C5/1 D5/8',
        'E5/3 D5/1 C5/3 E5/1 G5/4 C6/4',
        'B5/3 A5/1 G5/3 F5/1 G5/8',
        'A5/4 F5/3 A5/1 G5/4 E5/3 G5/1',
        'F5/4 D5/3 F5/1 D5/4 B4/4',
        'C5/3 E5/1 G5/3 C6/1 B5/3 A5/1 G5/3 F5/1',
        'C6/4 G5/2 E5/2 C5/4 -/4',
        // B
        'A5/3 A5/1 C6/3 A5/1 E5/4 A5/4',
        'F5/3 G5/1 A5/3 F5/1 C5/8',
        'G5/3 G5/1 B5/3 G5/1 D5/4 G5/4',
        'E5/3 F5/1 G5/3 E5/1 C5/8',
        'A5/3 B5/1 C6/3 A5/1 F5/4 A5/4',
        'G5/3 A5/1 G5/3 E5/1 C5/4 E5/4',
        'F#5/3 F#5/1 A5/3 F#5/1 G5/4 B5/4',
        'D6/3 C6/1 B5/3 A5/1 G5/4 -/4',
      ],
      chords: 'C C G7 G7 C C G G F C Dm G C G7 C C Am Am F F G G C C F F C C D7 G G7 G7',
      style: 'march',
    },
    // コンテンツの地図：作戦を考えるような、落ちついた曲（イ短調）
    map: {
      bpm: 112,
      lead: [
        'E5/2 A5/2 C6/2 B5/2 A5/4 E5/4',
        'F5/2 A5/2 C6/2 A5/2 F5/8',
        'D5/2 G5/2 B5/2 A5/2 G5/4 D5/4',
        'E5/2 G5/2 C6/2 E5/2 G#5/8',
        'A5/2 C6/2 E6/2 C6/2 A5/4 C6/4',
        'D6/2 C6/2 A5/2 F5/2 D5/8',
        'F5/2 A5/2 C6/2 A5/2 G5/2 B5/2 D6/2 B5/2',
        'A5/4 E5/4 B5/4 G#5/4',
      ],
      chords: 'Am Am F F G G C E Am Am Dm Dm F G Am E',
      style: 'walk',
    },
  };

  const NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freq(name) {
    const m = /^([A-G])(#|b)?(\d)$/.exec(name);
    if (!m) return 0;
    const n = NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
    return 440 * Math.pow(2, (n - 69) / 12);
  }
  // 和音：根音と構成音（ベース用に低いオクターブ）
  const CHORD = {
    C: ['C', 'E', 'G'], G: ['G', 'B', 'D'], G7: ['G', 'B', 'F'], F: ['F', 'A', 'C'], Dm: ['D', 'F', 'A'],
    Am: ['A', 'C', 'E'], D7: ['D', 'F#', 'C'], E: ['E', 'G#', 'B'],
  };

  // 曲を「何ステップ目に何を鳴らすか」の表にする
  function compile(tr) {
    const ev = [];
    const put = (step, e) => (ev[step] = ev[step] || []).push(e);
    let step = 0;
    for (const bar of tr.lead) {
      for (const tok of bar.trim().split(/\s+/)) {
        const [n, len] = tok.split('/');
        const l = Number(len);
        if (n !== '-') put(step, { ch: 'lead', f: freq(n), len: l });
        step += l;
      }
    }
    const total = step;
    const chords = tr.chords.split(/\s+/);
    chords.forEach((name, i) => {
      const c = CHORD[name];
      const s0 = i * 8;
      // 根音は C3〜E3 か F2〜B2 の高さ。5 度上も鳴らす
      const r = freq(c[0] + (NOTE_IDX[c[0][0]] <= 4 ? 3 : 2));
      const f5 = r * Math.pow(2, 7 / 12);
      if (tr.style === 'march') {
        // ブン・チャッ・ブン・チャッ
        put(s0, { ch: 'bass', f: r, len: 2 });
        put(s0 + 4, { ch: 'bass', f: f5, len: 2 });
        put(s0 + 2, { ch: 'harm', f: freq(c[1] + 4), len: 1.5 });
        put(s0 + 6, { ch: 'harm', f: freq(c[2] + 4), len: 1.5 });
        put(s0, { ch: 'kick' });
        put(s0 + 4, { ch: 'snare' });
        if (i % 8 === 7) { put(s0 + 5, { ch: 'snare' }); put(s0 + 6, { ch: 'snare' }); put(s0 + 7, { ch: 'snare' }); }
      } else {
        // 歩くようなベースと、かすかな刻み
        put(s0, { ch: 'bass', f: r, len: 2 });
        put(s0 + 2, { ch: 'bass', f: f5, len: 2 });
        put(s0 + 4, { ch: 'bass', f: r * 2, len: 2 });
        put(s0 + 6, { ch: 'bass', f: f5, len: 2 });
        put(s0 + 2, { ch: 'hat' });
        put(s0 + 6, { ch: 'hat' });
        if (i % 2 === 0) put(s0, { ch: 'kick' });
        put(s0, { ch: 'harm', f: freq(c[1] + 4), len: 6 });
      }
    });
    return { ev, total, stepDur: 60 / tr.bpm / 4 };
  }

  // ── 音の土台 ────────────────────────────────────
  let actx = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
  const waves = {};
  let on = true;
  try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* 使えなくても続ける */ }
  let unlocked = false;

  function pulse(duty) {
    if (waves[duty]) return waves[duty];
    const n = 48;
    const re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    waves[duty] = actx.createPeriodicWave(re, im);
    return waves[duty];
  }
  function ensure() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { actx = new AC(); } catch (e) { return false; }
      master = actx.createGain();
      master.gain.value = 0.5;
      master.connect(actx.destination);
      musicBus = actx.createGain();
      musicBus.gain.value = 0.55;
      musicBus.connect(master);
      sfxBus = actx.createGain();
      sfxBus.gain.value = 0.7;
      sfxBus.connect(master);
      noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return true;
  }
  function tone(bus, type, f, t, dur, vol, slide) {
    const o = actx.createOscillator();
    if (type === 'tri') o.type = 'triangle';
    else o.setPeriodicWave(pulse(type));
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.linearRampToValueAtTime(slide, t + dur);
    const g = actx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.linearRampToValueAtTime(vol * 0.6, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function noise(bus, t, dur, vol, hp) {
    const src = actx.createBufferSource();
    src.buffer = noiseBuf;
    const f = actx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = actx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // ── BGM ────────────────────────────────────────
  const compiled = {};
  let cur = null;       // いま鳴らしている曲
  let want = null;      // 鳴らしたい曲（音がオフでも覚えておく）
  let step = 0, nextT = 0, timer = null;

  function playStep(e, t, sd) {
    const len = (e.len || 1) * sd;
    if (e.ch === 'lead') tone(musicBus, 0.25, e.f, t, len * 0.92, 0.16);
    else if (e.ch === 'harm') tone(musicBus, 0.5, e.f, t, len * 0.8, 0.06);
    else if (e.ch === 'bass') tone(musicBus, 'tri', e.f, t, len * 0.85, 0.32);
    else if (e.ch === 'kick') tone(musicBus, 'tri', 150, t, 0.09, 0.4, 50);
    else if (e.ch === 'snare') noise(musicBus, t, 0.09, 0.22, 1800);
    else if (e.ch === 'hat') noise(musicBus, t, 0.03, 0.08, 7000);
  }
  function tick() {
    if (!cur || !actx) return;
    const tr = compiled[cur];
    while (nextT < actx.currentTime + 0.15) {
      const list = tr.ev[step % tr.total];
      if (list) for (const e of list) playStep(e, nextT, tr.stepDur);
      step++;
      nextT += tr.stepDur;
    }
  }
  function start(name, delay) {
    stopNow();
    if (!compiled[name]) compiled[name] = compile(TRACKS[name]);
    cur = name;
    step = 0;
    nextT = actx.currentTime + 0.06 + (delay || 0);
    tick();
    timer = setInterval(tick, 30);
  }
  function stopNow() {
    if (timer) clearInterval(timer);
    timer = null;
    cur = null;
  }
  // 状態に合わせて、鳴らす・止める
  function sync(delay) {
    const can = on && unlocked && !document.hidden && want;
    if (!can) { stopNow(); return; }
    if (!ensure()) return;
    if (cur !== want) start(want, delay);
  }

  // ── 効果音 ──────────────────────────────────────
  const SFX = {
    move(t) { tone(sfxBus, 0.5, 1320, t, 0.035, 0.12); },
    ok(t) { tone(sfxBus, 0.25, 988, t, 0.06, 0.18); tone(sfxBus, 0.25, 1319, t + 0.06, 0.1, 0.18); },
    back(t) { tone(sfxBus, 0.25, 784, t, 0.06, 0.15); tone(sfxBus, 0.25, 523, t + 0.06, 0.09, 0.15); },
    buzz(t) { tone(sfxBus, 0.5, 98, t, 0.12, 0.2); tone(sfxBus, 0.5, 98, t + 0.15, 0.16, 0.2); },
    start(t) {
      ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => tone(sfxBus, 0.25, freq(n), t + i * 0.07, 0.07, 0.2));
      tone(sfxBus, 0.25, freq('C6'), t + 0.28, 0.4, 0.2);
      tone(sfxBus, 0.5, freq('G5'), t + 0.28, 0.4, 0.09);
      noise(sfxBus, t + 0.28, 0.3, 0.18, 3000);
    },
    enter(t) {
      ['G5', 'C6', 'E6', 'G6'].forEach((n, i) => tone(sfxBus, 0.125, freq(n), t + i * 0.05, 0.06, 0.16));
    },
  };
  function sfx(name) {
    if (!on || !unlocked || !ensure()) return;
    SFX[name](actx.currentTime + 0.01);
  }

  // ── 外から使うもの ─────────────────────────────────
  H.audio = {
    // ユーザーの操作のときに呼ぶ（これより前は鳴らさない）
    unlock() {
      unlocked = true;
      if (on) ensure();
      sync();
    },
    music(name, delay) {
      want = name;
      sync(delay);
    },
    sfx,
    isOn: () => on,
    setOn(v) {
      on = !!v;
      try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* 保存できなくても続ける */ }
      if (!on && actx) actx.suspend().catch(() => {});
      sync();
    },
    // ページを離れるとき・戻ってきたとき
    pause() { stopNow(); },
    resume() { sync(); },
    // いま鳴っている曲の名前（鳴っていなければ null）と、音の準備ができたか（確認用）
    current: () => cur,
    started: () => !!actx,
  };
  document.addEventListener('visibilitychange', () => sync());
})();
