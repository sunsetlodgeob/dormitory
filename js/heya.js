/*
 * 夕照寮OB会サイト ― 部屋割り
 * 年度をえらぶと、寮さんぽと同じドット絵の地図（js/art.js）の上に、その年度に住んでいた人の名前を出す。
 * 一覧表にも切りかえられる。データは OB.data.loadPublic()（スプレッドシート。設定が空ならサンプル）。
 * スプレッドシートから来た名前は、textContent で入れる（HTML としては扱わない）。
 */
(function () {
  'use strict';
  const OB = window.OB;
  const D = window.DORM;
  const TS = D.TS;
  const FLOORS = ['3F', '2F', '1F'];
  const FULL_W = Math.max(...FLOORS.map((id) => D.WORLD.maps[id].rows[0].length)); // 各階の左端をそろえて並べる
  // 住人の見た目（名前から決める。同じ人は、どの年度でも同じ見た目）
  const LOOKS = ['player', 'ryocho', 'tv', 'kotatsu', 'guitar', 'mj1', 'mj2', 'mj3', 'study', 'call', 'roommate', 'yashoku', 'nap', 'bike'];
  const STAND = new Set(',*`&'.split('')); // 人を立たせてよい床
  const MAX_TAGS = 3; // 地図の部屋に出す札の数（これより多いときは「ほか N人」にまとめる）
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (id) => document.getElementById(id);
  const el = {
    sample: $('heya-sample'), error: $('heya-error'), retry: $('heya-retry'),
    yearBox: $('heya-year'), prev: $('year-prev'), next: $('year-next'), select: $('year-select'),
    viewMap: $('view-map'), viewList: $('view-list'), walk: $('walk-link'), summary: $('heya-summary'),
    mapView: $('map-view'), maps: $('heya-maps'), stack: $('heya-stack'), zoom: $('heya-zoom'),
    listView: $('list-view'), list: $('heya-list'), form: $('heya-form'),
    panel: $('heya-panel'), panelTitle: $('panel-title'), panelBody: $('panel-body'), panelClose: $('panel-close'),
  };

  const params = new URLSearchParams(location.search);
  const S = {
    years: [], byYear: new Map(), year: null, loaded: false, failed: false,
    view: params.get('view') === 'list' ? 'list' : 'map',
    askYear: /^\d{4}$/.test(params.get('year') || '') ? +params.get('year') : null,
    zoom: false, tile: TS, sel: null, floors: [],
  };

  const formUrl = () => OB.safeUrl((window.OB_CONFIG || {}).FORM_MEMBER_URL);
  const namesFor = (room) => (S.byYear.get(S.year) || new Map()).get(room) || [];

  // ── データ ─────────────────────────────────────
  // rooms: [{ year, room, name }] を 年度 → 部屋 → 名前の一覧 にまとめる
  // 全角の数字や「305号室」もそろえ、寮にない部屋番号は捨てる（名前の字は変えない）
  function index(rooms) {
    const by = new Map();
    const str = (v) => String(v == null ? '' : v).trim();
    for (const r of rooms || []) {
      const year = Number(str(r && r.year).normalize('NFKC'));
      const room = str(r && r.room).normalize('NFKC').replace(/[^0-9]/g, '');
      const name = str(r && r.name);
      if (!Number.isInteger(year) || OB.data.ROOM_NUMBERS.indexOf(room) < 0 || !name) continue;
      if (!by.has(year)) by.set(year, new Map());
      const m = by.get(year);
      if (!m.has(room)) m.set(room, []);
      if (m.get(room).indexOf(name) < 0) m.get(room).push(name);
    }
    return by;
  }

  async function load() {
    el.error.hidden = true;
    el.summary.textContent = '読み込み中…';
    let d;
    try {
      d = await OB.data.loadPublic();
    } catch (e) {
      d = { rooms: [], sample: false, failed: true };
    }
    el.error.hidden = !d.failed;
    el.sample.hidden = !d.sample;
    S.failed = !!d.failed;
    S.byYear = index(d.rooms);
    S.years = [...S.byYear.keys()].sort((a, b) => a - b);
    S.loaded = true;
    const asked = S.askYear != null && S.byYear.has(S.askYear);
    const want = asked ? S.askYear : S.years.length ? S.years[S.years.length - 1] : null;
    renderYearOptions();
    // URL の年度がデータにないときは、URL を表示している年度に書きかえる（読み込みの失敗ならそのまま）
    const fixUrl = S.askYear != null && !asked && !S.failed;
    setYear(want, !fixUrl);
  }

  // ── 年度 ──────────────────────────────────────
  function renderYearOptions() {
    el.select.textContent = '';
    for (const y of S.years) {
      const o = document.createElement('option');
      o.value = String(y);
      o.textContent = y + '年度';
      el.select.appendChild(o);
    }
    el.yearBox.hidden = !S.years.length;
    el.select.disabled = !S.years.length;
  }
  function setYear(y, first) {
    S.year = y;
    const i = S.years.indexOf(y);
    if (i >= 0) el.select.value = String(y);
    el.prev.disabled = i <= 0;
    el.next.disabled = i < 0 || i >= S.years.length - 1;
    el.walk.href = '../sanpo/' + (y != null ? '?year=' + y : '');
    el.walk.textContent = y != null ? 'この年度の寮を歩く' : '寮を歩く';
    renderSummary();
    for (const f of S.floors) paintFloor(f);
    renderList();
    if (S.sel && !el.panel.hidden) openPanel(S.sel, true);
    if (!first) saveUrl();
  }
  function stepYear(k) {
    const i = S.years.indexOf(S.year) + k;
    if (i >= 0 && i < S.years.length) setYear(S.years[i]);
  }
  function saveUrl() {
    const q = new URLSearchParams();
    if (S.year != null) q.set('year', String(S.year));
    if (S.view === 'list') q.set('view', 'list');
    try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '')); } catch (e) { /* 使えなくても続行 */ }
  }

  function renderSummary() {
    if (!S.loaded) return;
    if (S.year == null) {
      // 読み込みに失敗したときは、上のお知らせだけにする
      el.summary.textContent = S.failed ? '' : 'まだ部屋割りの情報がありません。';
    } else {
      const known = (S.byYear.get(S.year) || new Map()).size;
      const total = OB.data.ROOM_NUMBERS.length;
      el.summary.textContent = '';
      const b = document.createElement('strong');
      b.textContent = S.year + '年度';
      el.summary.append(b, '　わかっている部屋 ' + known + ' / ' + total);
    }
    el.form.hidden = false;
    el.form.textContent = 'まだわからない部屋がたくさんあります。覚えていることがあれば、教えてください。';
    const a = contactLink('情報を送る（フォーム）');
    if (a) el.form.append(' ', a);
  }
  // 情報の送り先：フォームがあればフォーム、なければ連絡先のメール
  function contactLink(label) {
    const url = formUrl();
    const mail = String((window.OB_CONFIG || {}).CONTACT_EMAIL || '').trim();
    const a = document.createElement('a');
    if (url) {
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = label;
    } else if (/^[^\s@<>"'()]+@[^\s@<>"'()]+\.[^\s@<>"'()]+$/.test(mail)) {
      a.href = 'mailto:' + mail + '?subject=' + encodeURIComponent('部屋割りの情報');
      a.textContent = 'メールで送る';
    } else {
      return null;
    }
    return a;
  }

  // ── 寮の地図 ────────────────────────────────────
  function buildFloors() {
    for (const id of FLOORS) {
      const map = D.WORLD.maps[id];
      // js/game.js と同じ下ごしらえ
      map.id = id;
      map.h = map.rows.length;
      map.w = map.rows[0].length;
      if (!map.bg) D.renderMap(map);

      const sec = document.createElement('section');
      sec.className = 'heya-floor';
      sec.dataset.floor = id;
      const head = document.createElement('h2');
      head.className = 'heya-floor-head';
      const tag = document.createElement('span');
      tag.className = 'heya-floor-tag';
      tag.textContent = id;
      const nos = map.labels.map((l) => (/^(\d+)号室$/.exec(l.name) || [])[1]).filter(Boolean);
      // 「301〜317号室」、1 階は「101号室・食堂・風呂など」
      head.append(tag, nos.length > 1 ? nos[0] + '〜' + nos[nos.length - 1] + '号室' : nos[0] + '号室・食堂・風呂など');
      const box = document.createElement('div');
      box.className = 'heya-map';
      const cv = document.createElement('canvas');
      cv.className = 'heya-canvas';
      cv.setAttribute('aria-hidden', 'true');
      box.appendChild(cv);
      const pct = (v, all) => (v / all) * 100 + '%';
      const place = (node, l) => {
        node.style.left = pct(l.x, map.w);
        node.style.top = pct(l.y, map.h);
        node.style.width = pct(l.w, map.w);
        node.style.height = pct(l.h, map.h);
      };

      const rooms = [];
      for (const l of map.labels) {
        const m = /^(\d+)号室$/.exec(l.name);
        if (!m) {
          if (l.h < 2) continue; // 玄関の細い帯などは出さない
          const a = document.createElement('span');
          a.className = 'heya-area';
          const t = document.createElement('span');
          t.textContent = l.name;
          a.appendChild(t);
          place(a, l);
          box.appendChild(a);
          continue;
        }
        const no = m[1];
        const north = l.y + l.h / 2 < map.h / 2; // 上の並び（川側）か
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'heya-room' + (north ? '' : ' is-south');
        b.dataset.room = no;
        place(b, l);
        const num = document.createElement('span');
        num.className = 'heya-room-no';
        num.textContent = no;
        const names = document.createElement('span');
        names.className = 'heya-room-names';
        b.append(num, names);
        b.addEventListener('click', () => openPanel(no));
        box.appendChild(b);
        rooms.push({ no, btn: b, names, spots: spots(map, l, north) });
      }
      sec.append(head, box);
      el.stack.appendChild(sec);
      S.floors.push({ map, box, cv, rooms, scene: null });
    }
  }

  // 部屋の中で人を立たせる場所（ドアの側の床から順に）
  function spots(map, l, north) {
    const out = [];
    const cx = l.x + (l.w - 1) / 2;
    const cy = north ? l.y + l.h - 2 : l.y + 1;
    for (let y = l.y; y < l.y + l.h; y++) {
      for (let x = l.x; x < l.x + l.w; x++) {
        if (STAND.has(map.rows[y][x])) out.push({ x, y, d: Math.abs(x - cx) + Math.abs(y - cy) * 1.2 });
      }
    }
    out.sort((a, b) => a.d - b.d || a.x - b.x);
    // となり合わせにならないように、少し間をあける
    const pick = [];
    for (const s of out) {
      if (pick.every((p) => Math.abs(p.x - s.x) + Math.abs(p.y - s.y) >= 2)) pick.push(s);
      if (pick.length >= 3) break;
    }
    for (const s of out) {
      if (pick.length >= 3) break;
      if (pick.indexOf(s) < 0) pick.push(s);
    }
    return pick;
  }

  function lookFor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (Math.imul(h, 31) + name.charCodeAt(i)) | 0;
    return LOOKS[(h >>> 0) % LOOKS.length];
  }

  // 年度が変わったら：住人のドット絵を描いた原寸の絵を作り、部屋の札を書きかえる
  function paintFloor(f) {
    const map = f.map;
    const sc = f.scene || (f.scene = D.art.canvas(map.w * TS, map.h * TS));
    const c = sc.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, sc.width, sc.height);
    c.drawImage(map.bg, 0, 0);
    for (const r of f.rooms) {
      const names = namesFor(r.no);
      const has = names.length > 0;
      r.btn.classList.toggle('has-data', has);
      r.btn.classList.toggle('no-data', !has && S.loaded); // 読み込み中は暗くしない
      r.btn.classList.toggle('is-sel', S.sel === r.no && !el.panel.hidden);
      r.btn.setAttribute('aria-label', r.no + '号室' + (has ? '：' + names.join('、') : S.loaded ? '：まだ情報がありません' : ''));
      r.btn.title = r.no + '号室' + (has ? '　' + names.join('、') : '');
      r.names.textContent = '';
      // 部屋の高さに入るのは札 3 枚まで。多いときは 2 人と「ほか N人」
      const shown = names.length > MAX_TAGS ? names.slice(0, MAX_TAGS - 1) : names;
      shown.forEach((n) => {
        const t = document.createElement('span');
        t.className = 'heya-tag';
        t.textContent = n;
        r.names.appendChild(t);
      });
      if (shown.length < names.length) {
        const t = document.createElement('span');
        t.className = 'heya-tag heya-tag-more';
        t.textContent = 'ほか' + (names.length - shown.length) + '人';
        r.names.appendChild(t);
      }
      names.slice(0, r.spots.length).forEach((n, i) => {
        const s = r.spots[i];
        const sx = s.x * TS, sy = s.y * TS;
        D.art.R(c, sx + 3, sy + 13, 10, 3, 'rgba(0,0,0,0.18)');
        c.drawImage(D.art.sprite(lookFor(n), 'down', 's'), sx, sy - 5);
      });
    }
    drawFloor(f);
  }

  // 画面の大きさに合わせて、原寸の絵を拡大・縮小して描く
  function drawFloor(f) {
    if (!f.scene) return;
    const map = f.map;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = map.w * S.tile, h = map.h * S.tile;
    const cw = Math.max(1, Math.round(w * dpr)), ch = Math.max(1, Math.round(h * dpr));
    if (f.cv.width !== cw) f.cv.width = cw;
    if (f.cv.height !== ch) f.cv.height = ch;
    const c = f.cv.getContext('2d');
    // 縮めるときはなめらかに、広げるときはドットをくっきり
    c.imageSmoothingEnabled = cw < f.scene.width;
    c.imageSmoothingQuality = 'high';
    c.clearRect(0, 0, cw, ch);
    c.drawImage(f.scene, 0, 0, cw, ch);
  }

  let lastKey = '';
  function layout(force) {
    const cs = getComputedStyle(el.maps);
    const inner = el.maps.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (inner <= 0) return; // 一覧表を見ているあいだ（地図は隠れている）
    // 幅か画面の細かさ（ブラウザの拡大）が変わったときだけ描き直す
    const key = inner + ':' + (window.devicePixelRatio || 1);
    if (!force && key === lastKey) return;
    lastKey = key;
    const fit = Math.max(3, Math.min(TS, Math.floor((inner / FULL_W) * 100) / 100));
    const canZoom = fit < TS - 1;
    const t = S.zoom && canZoom ? TS : fit;
    S.tile = t;
    el.zoom.hidden = !canZoom;
    el.zoom.textContent = S.zoom && canZoom ? '全体を見る' : '拡大する';
    el.zoom.setAttribute('aria-pressed', S.zoom && canZoom ? 'true' : 'false');
    el.mapView.style.setProperty('--t', String(t));
    el.mapView.classList.toggle('is-compact', t < 11);
    el.stack.style.width = FULL_W * t + 'px';
    for (const f of S.floors) {
      f.box.style.width = f.map.w * t + 'px';
      f.box.style.height = f.map.h * t + 'px';
      drawFloor(f);
    }
  }

  // ── 部屋の情報（下に出るウインドウ） ─────────────────────
  function openPanel(no, keep) {
    S.sel = no;
    const names = namesFor(no);
    el.panelTitle.textContent = no + '号室' + (S.year != null ? '（' + S.year + '年度）' : '');
    el.panelBody.textContent = '';
    if (names.length) {
      const ul = document.createElement('ul');
      ul.className = 'heya-panel-names';
      for (const n of names) {
        const li = document.createElement('li');
        li.textContent = n;
        ul.appendChild(li);
      }
      el.panelBody.appendChild(ul);
    } else {
      const p = document.createElement('p');
      p.className = 'heya-panel-none';
      p.textContent = 'まだ情報がありません。情報募集中です。';
      el.panelBody.appendChild(p);
      const a = contactLink('情報を送る');
      if (a) {
        a.className = 'fc-btn heya-panel-form';
        el.panelBody.appendChild(a);
      }
    }
    const wasHidden = el.panel.hidden;
    el.panel.hidden = false;
    for (const f of S.floors) for (const r of f.rooms) r.btn.classList.toggle('is-sel', r.no === no);
    document.body.classList.add('has-panel');
    if (wasHidden && !keep) {
      el.panel.classList.remove('is-pop');
      void el.panel.offsetWidth;
      el.panel.classList.add('is-pop');
    }
    if (!keep) revealAbovePanel(no);
  }
  // えらんだ部屋が下のウインドウに隠れたら、ページを少し送る
  function revealAbovePanel(no) {
    const btn = el.stack.querySelector('.heya-room[data-room="' + no + '"]');
    if (!btn || el.mapView.hidden) return;
    const r = btn.getBoundingClientRect();
    const top = el.panel.getBoundingClientRect().top - 12;
    if (r.bottom > top) window.scrollBy({ top: Math.min(r.bottom - top, Math.max(0, r.top - 8)), behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  function closePanel() {
    if (el.panel.hidden) return;
    el.panel.hidden = true;
    document.body.classList.remove('has-panel');
    const sel = S.sel;
    S.sel = null;
    for (const f of S.floors) for (const r of f.rooms) r.btn.classList.remove('is-sel');
    const btn = sel && el.stack.querySelector('.heya-room[data-room="' + sel + '"]');
    if (btn && document.activeElement && el.panel.contains(document.activeElement)) btn.focus({ preventScroll: true });
  }

  // ── 一覧表 ─────────────────────────────────────
  function renderList() {
    el.list.textContent = '';
    const groups = new Map();
    for (const no of OB.data.ROOM_NUMBERS) {
      const f = no[0] + 'F';
      if (!groups.has(f)) groups.set(f, []);
      groups.get(f).push(no);
    }
    const grid = document.createElement('div');
    grid.className = 'heya-list-grid';
    for (const f of FLOORS) {
      const list = groups.get(f);
      if (!list) continue;
      const sec = document.createElement('section');
      sec.className = 'heya-list-floor';
      const h = document.createElement('h2');
      h.textContent = D.WORLD.maps[f].name;
      const table = document.createElement('table');
      table.className = 'fc-table';
      const cap = document.createElement('caption');
      cap.className = 'heya-sr';
      cap.textContent = D.WORLD.maps[f].name + 'の部屋割り' + (S.year != null ? '（' + S.year + '年度）' : '');
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th scope="col">部屋</th><th scope="col">住んでいた人</th></tr>';
      const tbody = document.createElement('tbody');
      for (const no of list) {
        const names = namesFor(no);
        const tr = document.createElement('tr');
        tr.className = names.length ? 'has-data' : 'no-data';
        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = no;
        const td = document.createElement('td');
        if (names.length) {
          names.forEach((n, i) => {
            const s = document.createElement('span');
            s.className = 'heya-list-name';
            s.textContent = n;
            if (i) td.append(' ');
            td.appendChild(s);
          });
        } else {
          td.textContent = '？';
          td.className = 'heya-unknown';
        }
        tr.append(th, td);
        tbody.appendChild(tr);
      }
      table.append(cap, thead, tbody);
      sec.append(h, table);
      grid.appendChild(sec);
    }
    el.list.appendChild(grid);
  }

  // ── 見かたの切りかえ ─────────────────────────────────
  function setView(v, first) {
    S.view = v;
    el.viewMap.setAttribute('aria-pressed', v === 'map' ? 'true' : 'false');
    el.viewList.setAttribute('aria-pressed', v === 'list' ? 'true' : 'false');
    el.mapView.hidden = v !== 'map';
    el.listView.hidden = v !== 'list';
    if (v !== 'map') closePanel();
    else layout(true);
    if (!first) saveUrl();
  }

  // ── 操作 ──────────────────────────────────────
  el.prev.addEventListener('click', () => stepYear(-1));
  el.next.addEventListener('click', () => stepYear(1));
  el.select.addEventListener('change', () => setYear(+el.select.value));
  el.viewMap.addEventListener('click', () => setView('map'));
  el.viewList.addEventListener('click', () => setView('list'));
  el.zoom.addEventListener('click', () => {
    S.zoom = !S.zoom;
    layout(true);
  });
  el.panelClose.addEventListener('click', closePanel);
  el.retry.addEventListener('click', () => load());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
  });

  buildFloors();
  for (const f of S.floors) paintFloor(f); // 読み込みを待つあいだも、寮の絵は出しておく
  setView(S.view, true);
  if (window.ResizeObserver) new ResizeObserver(() => layout()).observe(el.maps);
  window.addEventListener('resize', () => layout());
  layout(true);
  load();

  // テスト用の窓口
  window.HEYA = { S, setYear, setView, openPanel, closePanel };
})();
