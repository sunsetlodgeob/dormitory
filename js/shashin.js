/*
 * 夕照寮OB会サイト ― 写真館（shashin/）
 * 寮の写真を年度ごとに並べる。本番（GAS_URL あり）では、Google でログインして
 * 見る権限があると確かめられた人にだけ表示する（年表と同じ入り口）。
 *  - ログインまわり（Google のボタン・権限の確かめ・申請・ログアウト）は js/site/login.js（OB.loginGate）
 *  - 写真は Apps Script が小さくして data URL で返す（OB.data.loadThumbs）。一覧は 400、大きく見るときは 1600
 *  - 一覧の写真は、画面の近くに来たものだけ、24 枚ずつまとめて読む。同時に送るのは 3 つまで
 *  - 読んだ写真と ID トークンはメモリだけに置く（保存しない。ログアウトで消す）
 *  - サーバーから来た id は /^[\w-]{1,200}$/ に合うものだけ使う。文字はすべて textContent か OB.esc を通す
 */
(function () {
  'use strict';
  const OB = window.OB;
  const $ = (id) => document.getElementById(id);
  const el = {
    demo: $('ps-demo'), setup: $('ps-setup'), login: $('ps-login'), gbtn: $('ps-gbtn'), status: $('ps-status'),
    reload: $('ps-reload'), loading: $('ps-loading'), board: $('ps-board'),
    user: $('ps-user'), userText: $('ps-user-text'), logout: $('ps-logout'),
    req: $('ps-req'), reqEmail: $('ps-req-email'), reqStatus: $('ps-req-status'),
    count: $('ps-count'), jump: $('ps-jump'), years: $('ps-years'), retry: $('ps-retry'), retryBtn: $('ps-retry-btn'),
    lb: $('ps-lb'), lbTitle: $('ps-lb-title'), lbCount: $('ps-lb-count'), lbClose: $('ps-lb-close'), lbStage: $('ps-lb-stage'),
    lbImg: $('ps-lb-img'), lbWait: $('ps-lb-wait'), lbErr: $('ps-lb-err'), lbPrev: $('ps-lb-prev'), lbNext: $('ps-lb-next'),
    lbInfo: $('ps-lb-info'), dl: $('ps-dl'), dlStatus: $('ps-dl-status'), top: $('ps-top'),
  };

  const ID_RE = /^[\w-]{1,200}$/;
  const IMG_RE = /^data:image\/(?:jpeg|png|gif|webp|svg\+xml)[;,]/i;
  const BATCH = 24;      // 1 回に頼む枚数（Apps Script 側の上限）
  const MAX_FLIGHT = 3;  // 同時に送るのは 3 つまで
  const GRID = 400, BIG = 1600;
  const BIG_KEEP = 12;   // 大きい写真は、最近見た 12 枚だけ覚えておく
  const EXPIRED = 'ログインの期限が切れました（ログインしてから 1 時間ほどで切れます）。もう一度ログインしてください。';
  const REVOKED = 'このアカウントでは、写真館を見られなくなりました。幹事に連絡してください。';

  let photos = [];             // 整えた写真の一覧（年度の順）
  let token = '';              // ID トークン（メモリだけ。デモでは空）
  let canDownload = false;
  let gen = 0;                 // ログアウトのたびに増やす（古い返事を捨てるため）
  const thumbs = new Map();    // id → 一覧の写真（data URL）
  const bigs = new Map();      // id → 大きい写真（data URL）
  const state = new Map();     // id → 'queued' | 'loading' | 'done' | 'fail'
  const queue = new Set();     // 画面の近くにあって、まだ頼んでいない id
  const btnOf = new Map();     // id → 一覧のボタン
  let io = null;
  let flight = 0;              // いま送っている数
  const jobs = [];             // 送る順番を待っているもの（大きい写真・ダウンロード）

  // ── 小物 ──────────────────────────────────────
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function cleanInt(v, lo, hi) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
  }
  const yearId = (y) => (y == null ? 'py-unknown' : 'py' + y);
  function yearLabel(y) {
    if (y == null) return '年度不明';
    const era = OB.wareki(y);
    return y + '年度' + (era ? '（' + era + '年度）' : '');
  }
  function dateLabel(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
    return m ? Number(m[1]) + '年' + Number(m[2]) + '月' + Number(m[3]) + '日' : '撮影日不明';
  }

  // ── 写真の一覧を整える ──────────────────────────────
  function tidy(list) {
    const seen = new Set();
    const out = [];
    (Array.isArray(list) ? list : []).forEach((p, i) => {
      if (!p || typeof p !== 'object') return;
      const id = typeof p.id === 'string' || typeof p.id === 'number' ? String(p.id) : '';
      if (!ID_RE.test(id) || seen.has(id)) return; // あやしい id は使わない
      seen.add(id);
      const date = typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : '';
      out.push({ id, year: cleanInt(p.year, 1900, 2100), date, i });
    });
    // 年度の順（不明は最後）→ 撮影日の順（日付のないものはその年度の最後）
    out.sort((a, b) => ((a.year == null) - (b.year == null)) || (a.year - b.year) ||
      ((!a.date) - (!b.date)) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.i - b.i));
    out.forEach((p, n) => { p.n = n; });
    return out;
  }

  // ── 表示 ──────────────────────────────────────
  function render() {
    const groups = [];
    for (const p of photos) {
      const g = groups[groups.length - 1];
      if (g && g.year === p.year) g.list.push(p);
      else groups.push({ year: p.year, list: [p] });
    }
    el.count.textContent = '全 ' + photos.length + '枚';
    el.jump.innerHTML = groups.map((g) =>
      '<button type="button" class="ps-chip" data-target="' + yearId(g.year) + '">' + (g.year == null ? '年度不明' : g.year + '年度') +
      '<small>' + g.list.length + '枚</small></button>').join('');
    el.jump.parentNode.hidden = !groups.length;
    if (!groups.length) {
      el.years.innerHTML = '<p class="ps-none">まだ写真はありません。</p>';
      return;
    }
    el.years.innerHTML = groups.map((g) => {
      const id = yearId(g.year);
      const era = g.year == null ? '' : OB.wareki(g.year);
      const items = g.list.map((p, k) =>
        '<li><button type="button" class="ps-thumb" data-id="' + OB.esc(p.id) + '" data-n="' + p.n + '" aria-label="' +
        OB.esc(yearLabel(p.year) + 'の写真 ' + (k + 1) + '枚目（' + dateLabel(p.date) + '）') + '">' +
        '<img alt="" draggable="false" decoding="async" hidden></button></li>').join('');
      return '<section class="ps-year" id="' + id + '" aria-labelledby="' + id + '-h">' +
        '<h2 class="ps-year-head" id="' + id + '-h" tabindex="-1"><span class="ps-year-num">' + (g.year == null ? '年度不明' : g.year + '年度') + '</span>' +
        (era ? '<span class="ps-year-era">（' + era + '年度）</span>' : '') +
        '<span class="ps-year-count">' + g.list.length + '枚</span></h2>' +
        '<ul class="ps-grid">' + items + '</ul></section>';
    }).join('');
    el.years.querySelectorAll('.ps-thumb').forEach((b) => btnOf.set(b.dataset.id, b));
    watch();
  }

  // ── 一覧の写真を、画面の近くに来たものだけ読む ──────────────────
  function watch() {
    if (!('IntersectionObserver' in window)) {
      // 古いブラウザ：上から順に全部読む
      for (const id of btnOf.keys()) { queue.add(id); state.set(id, 'queued'); }
      pump();
      return;
    }
    io = new IntersectionObserver(onSee, { rootMargin: '300px 0px 500px 0px' });
    for (const b of btnOf.values()) io.observe(b);
  }
  function onSee(entries) {
    for (const e of entries) {
      const id = e.target.dataset.id;
      const st = state.get(id);
      if (e.isIntersecting) {
        if (!st) { queue.add(id); state.set(id, 'queued'); }
      } else if (st === 'queued') {
        // 頼む前に画面から遠ざかったら、頼むのをやめる（さっと下まで送ったときに全部読まないように）
        queue.delete(id);
        state.delete(id);
      }
    }
    pump();
  }

  // 送る数をおさえる。urgent（大きい写真・ダウンロード）は先に送る
  function limit(fn, urgent) {
    return new Promise((resolve, reject) => {
      const job = { fn, resolve, reject };
      if (urgent) jobs.unshift(job);
      else jobs.push(job);
      drain();
    });
  }
  function drain() {
    while (flight < MAX_FLIGHT && jobs.length) {
      const job = jobs.shift();
      const g = gen;
      flight++;
      Promise.resolve().then(job.fn).then(job.resolve, job.reject).finally(() => {
        if (g !== gen) return;
        flight--;
        drain();
        pump();
      });
    }
  }
  // 一覧の写真を 24 枚ずつ頼む（大きく見ている間は止めておく）
  function pump() {
    while (el.lb.hidden && queue.size && flight + jobs.length < MAX_FLIGHT) {
      const ids = [];
      for (const id of queue) {
        ids.push(id);
        if (ids.length >= BATCH) break;
      }
      ids.forEach((id) => { queue.delete(id); state.set(id, 'loading'); });
      loadBatch(ids);
    }
  }
  async function loadBatch(ids) {
    const g = gen;
    try {
      const d = await limit(() => OB.data.loadThumbs(token, ids, GRID));
      if (g !== gen) return;
      for (const id of ids) {
        const u = d.images[id];
        if (typeof u === 'string' && IMG_RE.test(u)) {
          thumbs.set(id, u);
          state.set(id, 'done');
          paint(id, u);
        } else {
          state.set(id, 'fail');
          paintFail(id);
        }
      }
    } catch (e) {
      if (g !== gen || authFailed(e)) return;
      ids.forEach((id) => { state.set(id, 'fail'); paintFail(id); });
    }
  }
  function paint(id, u) {
    const b = btnOf.get(id);
    if (!b) return;
    const img = b.querySelector('img');
    img.src = u; // data URL だけ（IMG_RE で確かめたもの）
    img.hidden = false;
    b.classList.remove('is-fail');
    b.classList.add('is-loaded');
  }
  function paintFail(id) {
    const b = btnOf.get(id);
    if (b) b.classList.add('is-fail');
    el.retry.hidden = false;
  }
  function retryFailed() {
    el.retry.hidden = true;
    for (const [id, st] of state) {
      if (st !== 'fail') continue;
      state.delete(id);
      const b = btnOf.get(id);
      if (!b) continue;
      b.classList.remove('is-fail');
      if (io) { io.unobserve(b); io.observe(b); } // 見えていれば、もう一度 onSee が呼ばれる
      else { queue.add(id); state.set(id, 'queued'); }
    }
    pump();
  }

  // ログインが切れた・権限がなくなった：ログインの画面にもどす
  function authFailed(e) {
    const code = e && e.code;
    if (code !== 'invalid_token' && code !== 'not_member') return false;
    gate.logout();
    gate.setStatus(code === 'invalid_token' ? EXPIRED : REVOKED, 'error');
    return true;
  }

  // ── 大きく見る ────────────────────────────────────
  let cur = -1;       // いま見ている写真（photos の番号）
  let lbSeq = 0;      // 表示を切りかえるたびに増やす
  let lastFocus = null;
  let dlBusy = false;
  const OUTSIDE = () => [document.querySelector('.ob-top'), document.querySelector('.ob-main'), document.querySelector('footer'), el.top];

  function openLb(n) {
    if (!photos[n]) return;
    lastFocus = document.activeElement;
    el.lb.hidden = false;
    el.lb.classList.toggle('is-nosave', !canDownload);
    // うしろのページは操作できないようにする（Tab でも出ない・読み上げない）
    OUTSIDE().forEach((x) => { if (x) x.inert = true; });
    document.documentElement.classList.add('ps-lock');
    showLb(n);
    el.lbClose.focus();
  }
  function closeLb(back) {
    if (el.lb.hidden) return;
    lbSeq++;
    el.lb.hidden = true;
    OUTSIDE().forEach((x) => { if (x) x.inert = false; });
    document.documentElement.classList.remove('ps-lock');
    el.lbImg.removeAttribute('src');
    if (back !== false) {
      // 最後に見た写真の場所にもどる
      const p = photos[cur];
      const b = p && btnOf.get(p.id);
      if (b) {
        b.scrollIntoView({ block: 'nearest' });
        b.focus({ preventScroll: true });
      } else if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    lastFocus = null;
    pump();
  }
  function step(d) {
    const n = cur + d;
    if (el.lb.hidden || !photos[n]) return;
    showLb(n);
    // 押したボタンが使えなくなったら（いちばん端）、フォーカスを残す
    const a = document.activeElement;
    if (!a || a === document.body || a.disabled || a.hidden) (d > 0 ? el.lbPrev : el.lbNext).focus();
  }
  function setImg(u, preview) {
    el.lbImg.src = u;
    el.lbImg.hidden = false;
    el.lbImg.classList.toggle('is-preview', !!preview);
  }
  function showLb(n) {
    const p = photos[n];
    cur = n;
    const my = ++lbSeq;
    el.lbTitle.textContent = yearLabel(p.year);
    el.lbCount.textContent = (n + 1) + ' / ' + photos.length;
    el.lbInfo.textContent = '撮影日：' + dateLabel(p.date);
    el.lbImg.alt = yearLabel(p.year) + 'の写真（' + dateLabel(p.date) + '）';
    el.lbPrev.disabled = n === 0;
    el.lbNext.disabled = n === photos.length - 1;
    el.lbErr.hidden = true;
    el.dl.hidden = !canDownload;
    el.dl.disabled = dlBusy;
    dlSay('');
    const big = bigs.get(p.id);
    if (big) { el.lbWait.hidden = true; setImg(big, false); return; }
    const small = thumbs.get(p.id);
    if (small) setImg(small, true);
    else { el.lbImg.hidden = true; el.lbImg.removeAttribute('src'); }
    el.lbWait.hidden = false;
    // ←→ を続けて押したときに、とばした写真まで頼まないよう、少し待ってから
    setTimeout(() => { if (my === lbSeq) loadBig(p.id, my); }, 150);
  }
  async function loadBig(id, my) {
    const g = gen;
    try {
      const d = await limit(() => (my === lbSeq ? OB.data.loadThumbs(token, [id], BIG) : null), true);
      if (g !== gen || !d) return;
      const u = d.images[id];
      if (typeof u === 'string' && IMG_RE.test(u)) {
        bigs.delete(id);
        bigs.set(id, u);
        while (bigs.size > BIG_KEEP) bigs.delete(bigs.keys().next().value);
        if (my === lbSeq) { el.lbWait.hidden = true; setImg(u, false); }
      } else if (my === lbSeq) lbFail();
    } catch (e) {
      if (g !== gen || authFailed(e)) return;
      if (my === lbSeq) lbFail();
    }
  }
  function lbFail() {
    el.lbWait.hidden = true;
    el.lbErr.hidden = false;
    el.lbErr.textContent = el.lbImg.hidden
      ? 'この写真を読み込めませんでした。時間をおいて、もう一度ためしてください。'
      : '大きい写真を読み込めませんでした（小さい写真を出しています）。';
  }

  // ── ダウンロード ──────────────────────────────────
  function dlSay(text, kind) {
    el.dlStatus.className = 'ps-dl-status' + (kind ? ' is-' + kind : '');
    el.dlStatus.textContent = text || '';
  }
  const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/heic': '.heic', 'image/svg+xml': '.svg' };
  function fileName(name, p, mime) {
    let s = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_').replace(/^[.\s]+/, '').trim();
    if (s.length > 120) s = s.slice(-120);
    return s || 'shashin-' + (p.date || p.year || 'photo') + '-' + p.id.slice(0, 12) + (EXT[mime] || '');
  }
  function bytesOf(b64) {
    const bin = atob(String(b64 || '').replace(/\s+/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function download() {
    const p = photos[cur];
    if (!p || dlBusy || !canDownload) return;
    const g = gen;
    dlBusy = true;
    el.dl.disabled = true;
    dlSay('用意しています…', 'busy');
    try {
      const f = await limit(() => OB.data.loadPhotoFile(token, p.id), true);
      if (g !== gen) return;
      const bytes = bytesOf(f.data);
      if (!bytes.length) throw Object.assign(new Error('空'), { code: 'empty' });
      const mime = /^[\w.+-]+\/[\w.+-]+$/.test(f.mime) ? f.mime.toLowerCase() : 'application/octet-stream';
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName(f.name, p, mime);
      a.hidden = true;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      dlSay('保存しました（' + a.download + '）', 'done');
    } catch (e) {
      if (g !== gen || authFailed(e)) return;
      const code = e && e.code;
      if (code === 'not_allowed') {
        // 幹事がダウンロードを止めた
        setDownload(false);
        el.dl.hidden = true;
        el.lbClose.focus();
        dlSay('写真のダウンロードは、いま止めてあります。', 'error');
      } else {
        dlSay(code === 'network'
          ? '通信に失敗しました。電波のよい所で、もう一度ためしてください。'
          : 'うまく保存できませんでした。時間をおいて、もう一度ためしてください。', 'error');
      }
    } finally {
      if (g === gen) {
        dlBusy = false;
        el.dl.disabled = false;
      }
    }
  }
  // ダウンロードを止めているときは、長押し・右クリック・ドラッグでの保存を出にくくする。
  // （スクリーンショットなどがあるので、これで保存を完全に止めることはできない。気休めの「止めてあります」の印）
  function setDownload(on) {
    canDownload = !!on;
    el.board.classList.toggle('is-nosave', !canDownload);
    el.lb.classList.toggle('is-nosave', !canDownload);
  }
  function noSave(e) {
    if (!canDownload && e.target && e.target.tagName === 'IMG') e.preventDefault();
  }

  // ── ログインのあと（デモではすぐに） ─────────────────────────
  function reset() {
    gen++;
    if (io) io.disconnect();
    io = null;
    flight = 0;
    jobs.length = 0;
    queue.clear();
    closeLb(false);
    state.clear();
    thumbs.clear();
    bigs.clear();
    btnOf.clear();
    photos = [];
    token = '';
    cur = -1;
    dlBusy = false;
    el.retry.hidden = true;
  }
  function showBoard(d) {
    reset();
    token = d.token || '';
    setDownload(d.download === true);
    photos = tidy(d.photos);
    render();
  }
  function clearBoard() {
    reset();
    el.years.innerHTML = '';
    el.jump.innerHTML = '';
    el.count.textContent = '';
    el.board.hidden = true;
  }

  // ── 操作 ──────────────────────────────────────
  el.years.addEventListener('click', (e) => {
    const b = e.target.closest('.ps-thumb');
    if (b) openLb(Number(b.dataset.n));
  });
  el.jump.addEventListener('click', (e) => {
    const b = e.target.closest('.ps-chip');
    const sec = b && document.getElementById(b.dataset.target);
    if (!sec) return;
    sec.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    const h = sec.querySelector('.ps-year-head');
    if (h) h.focus({ preventScroll: true });
    sec.classList.remove('is-flash');
    void sec.offsetWidth;
    sec.classList.add('is-flash');
  });
  el.retryBtn.addEventListener('click', retryFailed);
  el.lbClose.addEventListener('click', () => closeLb());
  el.lbPrev.addEventListener('click', () => step(-1));
  el.lbNext.addEventListener('click', () => step(1));
  el.dl.addEventListener('click', download);
  for (const x of [el.years, el.lbStage]) {
    x.addEventListener('contextmenu', noSave);
    x.addEventListener('dragstart', noSave);
  }
  document.addEventListener('keydown', (e) => {
    if (el.lb.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeLb(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'Tab') {
      // フォーカスを大きく見る画面の中にとどめる
      const f = [...el.lb.querySelectorAll('button')].filter((b) => !b.hidden && !b.disabled && b.getClientRects().length);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      const a = document.activeElement;
      if (!el.lb.contains(a)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    }
  });
  // スマホ：左右にはらって前・次
  let sx = null, sy = 0;
  el.lbStage.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } else sx = null;
  }, { passive: true });
  el.lbStage.addEventListener('touchend', (e) => {
    if (sx == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }, { passive: true });
  el.top.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
  });
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { el.top.hidden = el.board.hidden || window.scrollY < 500; ticking = false; });
  }, { passive: true });

  const gate = OB.loginGate({
    what: '写真館',
    el,
    // ID トークンは、写真を頼むときにも使うので、中身といっしょに受けとる（メモリだけ）
    load: (cred) => OB.data.loadPhotos(cred).then((d) => Object.assign(d, { token: cred })),
    show: showBoard,
    clear: clearBoard,
  });
  gate.start();
})();
