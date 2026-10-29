/*
 * 夕照寮OB会サイト ― 年表（nenpyo/）
 * 事件簿を年度ごとに並べる。本番（GAS_URL あり）では、Google でログインして
 * 見る権限があると確かめられた人にだけ表示する。
 *  - ログインまわり（Google のボタン・権限の確かめ・ログアウト）は js/site/login.js（OB.loginGate）
 *  - スプレッドシートから来た文字は、すべて OB.esc() を通してから HTML に入れる
 */
(function () {
  'use strict';
  const OB = window.OB;
  const $ = (id) => document.getElementById(id);
  const el = {
    demo: $('np-demo'), setup: $('np-setup'), login: $('np-login'), gbtn: $('np-gbtn'), status: $('np-status'),
    reload: $('np-reload'), loading: $('np-loading'), board: $('np-board'),
    user: $('np-user'), userText: $('np-user-text'), logout: $('np-logout'), q: $('np-q'), clear: $('np-clear'),
    year: $('np-year'), tags: $('np-tags'), count: $('np-count'), post: $('np-post'), post2: $('np-post2'),
    timeline: $('np-timeline'), empty: $('np-empty'), emptyText: $('np-empty-text'), reset: $('np-reset'),
    tail: $('np-tail'), top: $('np-top'),
  };

  let events = [];        // 整えた事件の一覧
  let tagList = [];       // [{ tag, n }]
  let curTag = '';        // しぼりこみ中のタグ（空ならすべて）

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

  // ログインが通ったら（デモではすぐに）描く。ログインまわりは js/site/login.js
  function showBoard(d) {
    events = tidy(d.events);
    tagList = countTags();
    curTag = '';
    el.q.value = '';
    el.q.disabled = !events.length;
    renderTags();
    renderTimeline();
    el.post.hidden = el.tail.hidden = false;
    el.post.href = el.post2.href = OB.POST_HREF;
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
  el.top.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
  });
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { el.top.hidden = window.scrollY < 500; ticking = false; });
  }, { passive: true });

  OB.loginGate({
    what: '年表',
    el,
    load: (cred) => OB.data.loadTimeline(cred),
    show: showBoard,
    clear: clearBoard,
  }).start();
})();
