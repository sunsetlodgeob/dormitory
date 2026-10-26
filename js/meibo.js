/*
 * 夕照寮OB会サイト ― 名簿（meibo/）
 * 入学した年度ごとに、寮生の名前を並べる。名前でさがせて、年度へとべる。
 * スプレッドシートから来た文字は、すべて OB.esc() を通してから HTML に入れる。
 */
(function () {
  'use strict';
  const OB = window.OB;
  const cfg = window.OB_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const el = {
    sample: $('mb-sample'), error: $('mb-error'), errorText: $('mb-error-text'), retry: $('mb-retry'),
    bar: $('mb-bar'), q: $('mb-q'), clear: $('mb-clear'), year: $('mb-year'), count: $('mb-count'),
    loading: $('mb-loading'), list: $('mb-list'), empty: $('mb-empty'), emptyText: $('mb-empty-text'),
    emptyClear: $('mb-empty-clear'), contact: $('mb-contact'), mail: $('mb-mail'), form: $('mb-form'),
    formLink: $('mb-form-link'), updated: $('mb-updated'), top: $('mb-top'),
  };

  // 年度ごとのまとまり：{ year, id, label, items: [{ key, li }], section, countEl }
  let groups = [];
  let total = 0;

  // ── 小物 ──────────────────────────────────────
  const wareki = OB.wareki; // 年度の元号（js/site/common.js）
  function cleanYear(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : null;
  }
  // さがすときは、全角・半角、カタカナ・ひらがな、大文字・小文字、空白の違いを気にしない（js/site/common.js）
  const norm = OB.normSearch;
  // 更新日は日本の日付で出す（"2026-10-31T20:00:00Z" なら 11月1日）
  function fmtDate(s) {
    if (!s) return '';
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const p = {};
      new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric' })
        .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
      return p.year + '年' + p.month + '月' + p.day + '日';
    }
    // ブラウザが読めない形（"2026-10-24 12:00" など）は、頭の日付だけ使う
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(s));
    return m ? Number(m[1]) + '年' + Number(m[2]) + '月' + Number(m[3]) + '日' : '';
  }
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function validEmail(s) {
    return /^[^\s@<>"'()]+@[^\s@<>"'()]+\.[^\s@<>"'()]+$/.test(String(s || ''));
  }

  // ── 連絡先・フォーム（設定にあるときだけ出す） ──────────
  function setupLinks() {
    const mail = String(cfg.CONTACT_EMAIL || '').trim();
    if (validEmail(mail)) {
      el.mail.href = 'mailto:' + mail + '?subject=' + encodeURIComponent('夕照寮OB会 名簿について');
      el.mail.textContent = mail;
      el.contact.hidden = false;
    }
    const form = OB.safeUrl(cfg.FORM_MEMBER_URL);
    if (form) {
      el.formLink.href = form;
      el.form.hidden = false;
    }
  }

  // ── 名簿を組み立てる ──────────────────────────────
  function group(members) {
    const map = new Map();
    for (const m of members || []) {
      if (!m || m.name == null) continue;
      const name = String(m.name).trim();
      if (!name) continue;
      const y = cleanYear(m.entryYear);
      if (!map.has(y)) map.set(y, []);
      map.get(y).push({ name, grad: cleanYear(m.gradYear) });
    }
    // 年度の古い順。年度のわからない人は最後
    const years = [...map.keys()].sort((a, b) => (a == null) - (b == null) || a - b);
    return years.map((y) => ({ year: y, people: map.get(y) }));
  }

  function render(members) {
    const gs = group(members);
    total = 0;
    const html = gs.map((g) => {
      const id = g.year == null ? 'y-unknown' : 'y' + g.year;
      const label = g.year == null ? '入学年度不明' : g.year + '年度入学';
      const era = g.year == null ? '' : wareki(g.year);
      total += g.people.length;
      const lis = g.people.map((p) =>
        '<li class="mb-person"><span class="mb-name">' + OB.esc(p.name) + '</span>' +
        (p.grad ? '<span class="mb-grad">' + OB.esc(p.grad) + '年度卒</span>' : '') + '</li>').join('');
      return '<section class="mb-year" id="' + id + '" aria-labelledby="' + id + '-h">' +
        '<h2 class="mb-year-head" id="' + id + '-h"><span class="mb-year-num">' + OB.esc(label) + '</span>' +
        (era ? '<span class="mb-year-era">' + OB.esc(era) + '年度</span>' : '') + '</h2>' +
        '<span class="mb-year-count">' + g.people.length + '人</span>' +
        '<ul class="mb-names">' + lis + '</ul></section>';
    }).join('');
    el.list.innerHTML = html;

    // さがすときに使う形を、あらかじめ作っておく
    groups = gs.map((g) => {
      const id = g.year == null ? 'y-unknown' : 'y' + g.year;
      const section = document.getElementById(id);
      const lis = section.querySelectorAll('.mb-person');
      return {
        year: g.year, id,
        label: g.year == null ? '年度不明' : g.year + '年度',
        section, countEl: section.querySelector('.mb-year-count'),
        items: g.people.map((p, i) => ({ key: norm(p.name), li: lis[i] })),
        size: g.people.length,
      };
    });
    el.q.disabled = el.year.disabled = !groups.length;
    if (!groups.length) {
      el.list.innerHTML = '<p class="mb-none">まだ名簿に載っている人はいません。</p>';
      el.count.textContent = '0人';
      return;
    }
    filter();
  }

  // ── さがす ──────────────────────────────────────
  function filter() {
    const raw = el.q.value;
    const q = norm(raw);
    let hit = 0;
    for (const g of groups) {
      let n = 0;
      for (const it of g.items) {
        const on = !q || it.key.includes(q);
        it.li.hidden = !on;
        if (on) n++;
      }
      g.shown = n;
      g.section.hidden = n === 0;
      g.countEl.textContent = q ? n + ' / ' + g.size + '人' : g.size + '人';
      hit += n;
    }
    el.clear.hidden = !raw;
    if (!q) {
      const ys = groups.filter((g) => g.year != null).map((g) => g.year);
      el.count.textContent = '全 ' + total + '人' +
        (ys.length ? '（' + ys[0] + (ys.length > 1 ? '〜' + ys[ys.length - 1] : '') + '年度入学）' : '');
    } else {
      el.count.textContent = hit ? '「' + raw.trim() + '」で ' + hit + '人 見つかりました' : '見つかりませんでした';
    }
    el.empty.hidden = !(q && hit === 0);
    if (q && hit === 0) el.emptyText.textContent = '「' + raw.trim() + '」に当てはまる名前はありません。字をかえて、さがしてみてください。';
    fillYears();
  }

  // 年度へとぶ：いま見えている年度だけを選べるようにする
  function fillYears() {
    const opts = ['<option value="">― 年度 ―</option>'];
    for (const g of groups) {
      if (g.section.hidden) continue;
      opts.push('<option value="' + OB.esc(g.id) + '">' + OB.esc(g.label) + '（' + g.shown + '人）</option>');
    }
    el.year.innerHTML = opts.join('');
  }

  function jump(id, smooth) {
    const sec = document.getElementById(id);
    if (!sec || sec.hidden) return;
    sec.scrollIntoView({ behavior: smooth && !reduceMotion() ? 'smooth' : 'auto', block: 'start' });
    try { history.replaceState(null, '', '#' + id); } catch (e) { /* file:// などでは無視 */ }
    sec.classList.remove('is-flash');
    void sec.offsetWidth;
    sec.classList.add('is-flash');
  }

  // 上の帯（固定）の高さぶん、とび先をずらす
  function syncBarHeight() {
    document.documentElement.style.setProperty('--mb-bar-h', el.bar.offsetHeight + 'px');
  }

  // ── 読み込み ──────────────────────────────────────
  async function load() {
    el.error.hidden = true;
    el.loading.hidden = false;
    el.count.textContent = '読み込み中…';
    try {
      const d = await OB.data.loadPublic();
      el.sample.hidden = !d.sample;
      const up = fmtDate(d.updated);
      el.updated.hidden = !up;
      el.updated.textContent = up ? up + ' 更新' : '';
      render(d.members);
      // URL の #y2005 などで開いたときは、その年度へ（年度の id は英数字だけなので、デコードしない）
      const h = location.hash.slice(1);
      if (/^y(\d{4}|-unknown)$/.test(h)) requestAnimationFrame(() => jump(h, false));
    } catch (e) {
      el.list.innerHTML = '';
      el.count.textContent = '';
      el.error.hidden = false;
    } finally {
      el.loading.hidden = true;
      syncBarHeight();
    }
  }

  // 下のほうで打ちこんだときは、一覧の頭が上の帯のすぐ下に来るまでもどす（結果が上にかくれないように）。
  // 28 は、ふちに乗った年度の見出し（上に 15 ドットはみ出す）とすき間のぶん
  function showResults() {
    const gap = el.list.getBoundingClientRect().top - el.bar.getBoundingClientRect().bottom - 28;
    if (gap < 0) window.scrollBy(0, gap);
  }

  // ── 操作 ──────────────────────────────────────
  el.q.addEventListener('input', () => { filter(); showResults(); });
  el.q.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.q.value) { el.q.value = ''; filter(); }
  });
  el.clear.addEventListener('click', () => { el.q.value = ''; filter(); el.q.focus(); });
  el.emptyClear.addEventListener('click', () => { el.q.value = ''; filter(); el.q.focus(); });
  // 年度へとぶ。マウス・タッチで選んだら「― 年度 ―」にもどす。
  // キーボードの ↑↓ で選んでいるときは、もどすと次の ↓ がまた先頭からになるので、フォーカスが外れるまで残す
  let yearByKey = false;
  el.year.addEventListener('keydown', () => { yearByKey = true; });
  el.year.addEventListener('pointerdown', () => { yearByKey = false; });
  el.year.addEventListener('change', () => {
    const id = el.year.value;
    if (!yearByKey) el.year.value = '';
    if (id) jump(id, true);
  });
  el.year.addEventListener('blur', () => { el.year.value = ''; });
  el.retry.addEventListener('click', load);
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
  if (window.ResizeObserver) new ResizeObserver(syncBarHeight).observe(el.bar);
  else window.addEventListener('resize', syncBarHeight);

  setupLinks();
  load();
})();
