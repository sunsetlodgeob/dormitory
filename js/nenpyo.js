/*
 * 夕照寮OB会サイト ― 年表（nenpyo/）
 * 事件簿を年度ごとに並べる。本番（GAS_URL あり）では、Google でログインして
 * 見る権限があると確かめられた人にだけ表示する。
 *  - ログインで受け取った ID トークンは、読み込みに使うだけで保存しない（メモリだけ）
 *  - スプレッドシートから来た文字は、すべて OB.esc() を通してから HTML に入れる
 */
(function () {
  'use strict';
  const OB = window.OB;
  const cfg = window.OB_CONFIG || {};
  const GSI_SRC = 'https://accounts.google.com/gsi/client';
  const $ = (id) => document.getElementById(id);
  const el = {
    demo: $('np-demo'), setup: $('np-setup'), login: $('np-login'), gbtn: $('np-gbtn'), status: $('np-status'),
    reload: $('np-reload'), loading: $('np-loading'), board: $('np-board'),
    user: $('np-user'), userText: $('np-user-text'), logout: $('np-logout'), q: $('np-q'), clear: $('np-clear'),
    year: $('np-year'), tags: $('np-tags'), count: $('np-count'), post: $('np-post'), post2: $('np-post2'),
    timeline: $('np-timeline'), empty: $('np-empty'), emptyText: $('np-empty-text'), reset: $('np-reset'),
    tail: $('np-tail'), top: $('np-top'),
  };

  const MSG = {
    not_member: 'このアカウントには見る権限がありません。幹事に連絡して、見る権限をもらってください。',
    invalid_token: 'ログインを確かめられませんでした（時間がたって切れたのかもしれません）。もう一度ログインしてください。',
    not_configured: '年表の準備がまだ終わっていません（Apps Script の設定がまだです）。しばらくしてから、もう一度ためしてください。',
    network: '通信に失敗しました。電波のよい所で、もう一度ログインしてください。',
    gsi: 'Google のログインを読み込めませんでした。電波のよい所で、ページを読み込みなおしてください。',
    other: 'うまく読み込めませんでした。時間をおいて、もう一度ためしてください。',
  };

  let events = [];        // 整えた事件の一覧
  let tagList = [];       // [{ tag, n }]
  let curTag = '';        // しぼりこみ中のタグ（空ならすべて）
  let gsiReady = false;
  let tries = 0;          // ログインの回数（古い返事を捨てるため）

  // ── 小物 ──────────────────────────────────────
  const wareki = OB.wareki; // 年度の元号（js/site/common.js）
  function cleanInt(v, lo, hi) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
  }
  // さがすときは、全角・半角、カタカナ・ひらがな、大文字・小文字、空白の違いを気にしない（js/site/common.js）
  const norm = OB.normSearch;
  // 見つかった所に印をつける（文字はすべて OB.esc を通す）。
  // さがすときと同じそろえ方（norm）で比べるので、カタカナ・ひらがなや全角・半角が違っても印がつく
  function mark(text, raw) {
    const s = String(text);
    const q = norm(raw);
    if (!q) return OB.esc(s);
    // そろえた文字の 1 つずつが、もとの文字のどこからどこまでか
    let ns = '';
    const from = [], to = [];
    let pos = 0;
    // 濁点・半濁点（半角の ﾞ ﾟ など）は前の文字といっしょにそろえる（ﾊﾞ → ば）
    for (const ch of s.match(/[\s\S][\uFF9E\uFF9F\u3099-\u309C]*/gu) || []) {
      const n = norm(ch);
      for (let k = 0; k < n.length; k++) { from.push(pos); to.push(pos + ch.length); }
      ns += n;
      pos += ch.length;
    }
    let out = '', last = 0, i = 0;
    for (;;) {
      const j = ns.indexOf(q, i);
      if (j < 0) break;
      const a = from[j], b = to[j + q.length - 1];
      if (a >= last) {
        out += OB.esc(s.slice(last, a)) + '<mark>' + OB.esc(s.slice(a, b)) + '</mark>';
        last = b;
      }
      i = j + q.length;
    }
    return out + OB.esc(s.slice(last));
  }
  // ID トークンの中のメールアドレス（表示に使うだけ。確かめるのは Apps Script 側）
  function emailOf(jwt) {
    try {
      let p = String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      p += '='.repeat((4 - (p.length % 4)) % 4);
      const bin = atob(p);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const o = JSON.parse(new TextDecoder().decode(bytes));
      return typeof o.email === 'string' ? o.email.slice(0, 200) : '';
    } catch (e) {
      return '';
    }
  }
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── 事件を整える ──────────────────────────────────
  // 年度の中の順番：4月 … 12月、1月 … 3月、時期不明
  const monthOrder = (m) => (m == null ? 99 : m >= 4 ? m - 4 : m + 8);

  function tidy(list) {
    const out = (Array.isArray(list) ? list : []).map((e, i) => {
      e = e || {};
      let tags = Array.isArray(e.tags) ? e.tags : typeof e.tags === 'string' ? e.tags.split(/[,、，]/) : [];
      tags = [...new Set(tags.map((t) => String(t == null ? '' : t).trim()).filter(Boolean))];
      const title = String(e.title == null ? '' : e.title).trim();
      const body = String(e.body == null ? '' : e.body).replace(/\r\n?/g, '\n').trim();
      const ev = {
        i,
        year: cleanInt(e.year, 1900, 2100),
        month: cleanInt(e.month, 1, 12),
        title: title || '（題名なし）',
        body,
        tags,
      };
      ev.key = norm(ev.title + ' ' + ev.body + ' ' + tags.join(' '));
      return ev;
    });
    out.sort((a, b) => ((a.year == null) - (b.year == null)) || (a.year - b.year) ||
      (monthOrder(a.month) - monthOrder(b.month)) || (a.i - b.i));
    return out;
  }

  function countTags() {
    const m = new Map();
    for (const e of events) for (const t of e.tags) m.set(t, (m.get(t) || 0) + 1);
    return [...m.entries()].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, 'ja'));
  }

  // ── 表示 ──────────────────────────────────────
  function renderTags() {
    const chip = (tag, label, n) => '<button type="button" class="np-chip" data-tag="' + OB.esc(tag) + '" aria-pressed="' +
      (curTag === tag) + '">' + OB.esc(label) + '<small>' + n + '</small></button>';
    el.tags.innerHTML = chip('', 'すべて', events.length) + tagList.map((t) => chip(t.tag, t.tag, t.n)).join('');
    el.tags.parentNode.hidden = !tagList.length;
  }
  // 上のタグは作りなおさず、押した印だけ付けかえる（作りなおすと、キーボードで押したときにフォーカスが消える）
  function markTags() {
    el.tags.querySelectorAll('.np-chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tag === curTag)));
  }

  function yearId(y) { return y == null ? 'ny-unknown' : 'ny' + y; }

  function renderTimeline() {
    const raw = el.q.value.trim();
    const q = norm(raw);
    const shown = events.filter((e) => (!curTag || e.tags.includes(curTag)) && (!q || e.key.includes(q)));

    // 年度ごとにまとめる（events は並べ替え済み）
    const groups = [];
    for (const e of shown) {
      const g = groups[groups.length - 1];
      if (g && g.year === e.year) g.list.push(e);
      else groups.push({ year: e.year, list: [e] });
    }
    el.timeline.innerHTML = groups.map((g) => {
      const id = yearId(g.year);
      const era = g.year == null ? '' : wareki(g.year);
      const cards = g.list.map((e) => {
        const month = e.month == null
          ? '<span class="np-month is-unknown">時期<br>不明</span>'
          : '<span class="np-month"><b>' + e.month + '</b>月</span>';
        const tags = e.tags.length
          ? '<ul class="np-ev-tags" aria-label="タグ">' + e.tags.map((t) =>
            '<li><button type="button" class="np-chip is-small" data-tag="' + OB.esc(t) + '" aria-pressed="' + (curTag === t) + '">' +
            OB.esc(t) + '</button></li>').join('') + '</ul>'
          : '';
        return '<li class="np-ev" id="np-e' + e.i + '"><article class="np-card">' + month +
          '<div class="np-card-main"><h3 class="np-ev-title">' + mark(e.title, raw) + '</h3>' +
          (e.body ? '<p class="np-ev-body">' + mark(e.body, raw) + '</p>' : '') + tags + '</div></article></li>';
      }).join('');
      return '<section class="np-year" id="' + id + '" aria-labelledby="' + id + '-h">' +
        '<h2 class="np-year-head" id="' + id + '-h"><span class="np-year-num">' + (g.year == null ? '年度不明' : g.year + '年度') + '</span>' +
        (era ? '<span class="np-year-era">' + era + '年度</span>' : '') +
        '<span class="np-year-count">' + g.list.length + '件</span></h2>' +
        '<ol class="np-events">' + cards + '</ol></section>';
    }).join('');

    // 年度へとぶ：いま見えている年度だけ
    el.year.innerHTML = '<option value="">― 年度 ―</option>' + groups.map((g) =>
      '<option value="' + yearId(g.year) + '">' + (g.year == null ? '年度不明' : g.year + '年度') + '（' + g.list.length + '件）</option>').join('');
    el.year.disabled = !groups.length;

    const filtered = !!(q || curTag);
    el.count.textContent = filtered
      ? '全 ' + events.length + '件のうち ' + shown.length + '件' + (curTag ? '（タグ「' + curTag + '」）' : '')
      : '全 ' + events.length + '件';
    el.clear.hidden = !el.q.value;
    el.empty.hidden = !(events.length && !shown.length);
    if (!el.empty.hidden) {
      el.emptyText.textContent = (raw ? '「' + raw + '」' : '') + (raw && curTag ? 'と' : '') + (curTag ? 'タグ「' + curTag + '」' : '') +
        'に当てはまる事件はありません。';
    }
    el.timeline.classList.toggle('is-empty', !events.length);
    if (!events.length) el.timeline.innerHTML = '<p class="np-none">まだ年表に載っている事件はありません。</p>';
  }

  function setTag(tag, cardId) {
    curTag = curTag === tag ? '' : tag;
    markTags();
    renderTimeline();
    // カードのタグを押したときは、描きなおしたそのカードを見える位置にもどし、フォーカスも同じタグにもどす
    const card = cardId && document.getElementById(cardId);
    if (card) {
      card.scrollIntoView({ block: 'center', behavior: 'auto' });
      const b = card.querySelector('.np-chip[data-tag="' + CSS.escape(tag) + '"]');
      if (b) b.focus({ preventScroll: true });
    }
  }

  function showBoard(list, email) {
    events = tidy(list);
    tagList = countTags();
    curTag = '';
    el.q.value = '';
    el.q.disabled = !events.length;
    renderTags();
    renderTimeline();
    el.board.hidden = false;
    el.login.hidden = true;
    el.loading.hidden = true;
    el.user.hidden = !OB.data.isLive();
    el.userText.textContent = email ? 'ログイン中：' + email : 'ログイン中';
    const form = OB.safeUrl(cfg.FORM_TIMELINE_URL);
    el.post.hidden = el.tail.hidden = !form;
    if (form) el.post.href = el.post2.href = form;
  }

  function clearBoard() {
    events = [];
    tagList = [];
    curTag = '';
    el.q.value = '';
    el.timeline.innerHTML = '';
    el.tags.innerHTML = '';
    el.year.innerHTML = '';
    el.count.textContent = '';
    el.board.hidden = true;
  }

  // ── ログイン ──────────────────────────────────────
  function setStatus(text, kind) {
    el.status.hidden = !text;
    el.status.className = 'np-status' + (kind ? ' is-' + kind : '');
    el.status.textContent = '';
    if (!text) return;
    String(text).split('\n').forEach((line, i) => {
      const p = document.createElement('p');
      p.textContent = line;
      if (i) p.className = 'np-status-sub';
      el.status.appendChild(p);
    });
  }

  function showLogin() {
    el.login.hidden = false;
    renderButton();
  }

  function loadGsi() {
    if (window.google && google.accounts && google.accounts.id) { initGsi(); return; }
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.onload = initGsi;
    s.onerror = gsiFailed;
    document.head.appendChild(s);
    setTimeout(() => { if (!gsiReady && !el.login.hidden) gsiFailed(); }, 15000);
  }
  function gsiFailed() {
    if (gsiReady) return;
    setStatus(MSG.gsi, 'error');
    el.gbtn.hidden = true;
    el.reload.hidden = false;
  }
  function initGsi() {
    if (gsiReady) return;
    try {
      google.accounts.id.initialize({
        client_id: cfg.GOOGLE_CLIENT_ID,
        callback: onCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
        context: 'signin',
        ux_mode: 'popup',
        itp_support: true,
      });
      gsiReady = true;
      el.gbtn.hidden = false;
      el.reload.hidden = true;
      if (el.status.classList.contains('is-error') && el.status.textContent === MSG.gsi) setStatus('');
      renderButton();
    } catch (e) {
      gsiFailed();
    }
  }
  let btnW = 0; // いま出しているログインボタンの幅
  const wantBtnW = () => Math.max(200, Math.min(300, (el.gbtn.clientWidth || 280)));
  function renderButton() {
    if (!gsiReady) return;
    el.gbtn.innerHTML = '';
    const w = (btnW = wantBtnW());
    try {
      google.accounts.id.renderButton(el.gbtn, {
        type: 'standard', theme: 'filled_blue', size: 'large', text: 'signin_with',
        shape: 'rectangular', logo_alignment: 'left', locale: 'ja', width: w,
      });
    } catch (e) {
      setStatus(MSG.gsi, 'error');
      el.reload.hidden = false;
    }
  }

  // Google から ID トークン（credential）を受け取ったとき
  async function onCredential(resp) {
    const cred = resp && resp.credential;
    if (!cred) { setStatus(MSG.invalid_token, 'error'); return; }
    const email = emailOf(cred);
    const my = ++tries;
    setStatus('見る権限を確かめています…', 'busy');
    try {
      const d = await OB.data.loadTimeline(cred);
      if (my !== tries) return;
      setStatus('');
      showBoard(d.events, email);
      // 読み上げソフトでも、年表に切りかわったことが分かるように
      el.board.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (my !== tries) return;
      const code = (e && e.code) || 'network';
      let text = MSG[code] || MSG.other;
      if (code === 'not_member') {
        if (email) text += '\nためしたアカウント：' + email;
        text += '\n別のアカウントでログインしなおすこともできます。';
      }
      if (code === 'not_member' || code === 'invalid_token') disableAuto();
      setStatus(text, 'error');
      renderButton();
    }
  }

  function disableAuto() {
    try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); } catch (e) { /* なにもしない */ }
  }

  function logout() {
    tries++;
    disableAuto();
    clearBoard();
    showLogin();
    setStatus('ログアウトしました。', 'ok');
    window.scrollTo({ top: 0 });
  }

  // ── はじめ ──────────────────────────────────────
  async function startDemo() {
    el.demo.hidden = false;
    el.loading.hidden = false;
    try {
      const d = await OB.data.loadTimeline('');
      showBoard(d.events, '');
    } finally {
      el.loading.hidden = true;
    }
  }

  function start() {
    if (!OB.data.isLive()) { startDemo(); return; }
    if (!String(cfg.GOOGLE_CLIENT_ID || '').trim()) { el.setup.hidden = false; return; }
    el.login.hidden = false;
    loadGsi();
  }

  // ── 操作 ──────────────────────────────────────
  el.q.addEventListener('input', renderTimeline);
  el.q.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.q.value) { el.q.value = ''; renderTimeline(); }
  });
  el.clear.addEventListener('click', () => { el.q.value = ''; renderTimeline(); el.q.focus(); });
  el.reset.addEventListener('click', () => { el.q.value = ''; curTag = ''; markTags(); renderTimeline(); el.q.focus(); });
  el.tags.addEventListener('click', (e) => {
    const b = e.target.closest('.np-chip');
    if (b) setTag(b.dataset.tag || '');
  });
  el.timeline.addEventListener('click', (e) => {
    const b = e.target.closest('.np-chip');
    if (!b) return;
    const card = b.closest('.np-ev');
    setTag(b.dataset.tag || '', card && card.id);
  });
  // 年度へとぶ。マウス・タッチで選んだら「― 年度 ―」にもどす。
  // キーボードの ↑↓ で選んでいるときは、もどすと次の ↓ がまた先頭からになるので、フォーカスが外れるまで残す
  let yearByKey = false;
  el.year.addEventListener('keydown', () => { yearByKey = true; });
  el.year.addEventListener('pointerdown', () => { yearByKey = false; });
  el.year.addEventListener('blur', () => { el.year.value = ''; });
  el.year.addEventListener('change', () => {
    const id = el.year.value;
    if (!yearByKey) el.year.value = '';
    const sec = id && document.getElementById(id);
    if (!sec) return;
    sec.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    sec.classList.remove('is-flash');
    void sec.offsetWidth;
    sec.classList.add('is-flash');
  });
  el.logout.addEventListener('click', logout);
  el.reload.addEventListener('click', () => location.reload());
  el.top.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
  });
  // スマホを横にしたときなど、ログインボタンの入る幅が変わったら描きなおす
  let resizeT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      if (gsiReady && !el.login.hidden && !el.gbtn.hidden && wantBtnW() !== btnW) renderButton();
    }, 250);
  });
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { el.top.hidden = window.scrollY < 500; ticking = false; });
  }, { passive: true });

  start();
})();
