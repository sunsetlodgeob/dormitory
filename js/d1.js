/*
 * 夕照寮OB会サイト ― D-1選手権（d1/）
 * 歴代の記録（年度・優勝・準優勝・出場メンバー・主催者・レフェリー・黒子・補足）を、古い年度から並べる。
 * 誰でも見られる（持ち主の決めたこと。ログインが要るのは年表と写真館だけ）。
 *  - データは名簿・部屋割りといっしょに来る（OB.data.loadPublic() の d1）。GAS_URL が空ならサンプル
 *  - スプレッドシートから来た文字は、すべて OB.esc() を通してから HTML に入れる
 */
(function () {
  'use strict';
  const OB = window.OB;
  const $ = (id) => document.getElementById(id);
  const el = {
    demo: $('d1-demo'), loading: $('d1-loading'), board: $('d1-board'), error: $('d1-error'), retry: $('d1-retry'),
    count: $('d1-count'), list: $('d1-list'), none: $('d1-none'),
  };

  // ── 記録を整える ──────────────────────────────────
  const str = (v) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim();
  function cleanYear(v) {
    if (v == null || v === '') return null;
    const n = Number(String(v).normalize('NFKC'));
    return Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : null;
  }
  // 名前の一覧。配列が来るはずだが、「A、B」のような文字でも受ける
  function names(v) {
    const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,、，]/) : [];
    return [...new Set(list.map((s) => str(s).replace(/\s+/g, ' ')).filter(Boolean))];
  }
  function tidy(list) {
    const out = (Array.isArray(list) ? list : []).map((r, i) => {
      r = r || {};
      return {
        i,
        year: cleanYear(r.year),
        winner: names(r.winner),
        second: names(r.second),
        members: names(r.members),
        host: str(r.host),
        referee: str(r.referee),
        kuroko: str(r.kuroko),
        note: str(r.note),
      };
    });
    // 古い年度から。年度のわからない記録は最後
    out.sort((a, b) => ((a.year == null) - (b.year == null)) || (a.year - b.year) || (a.i - b.i));
    return out;
  }

  // ── 表示 ──────────────────────────────────────
  // 名前の途中で折り返さないように、1 人ずつ包む（「、」は前の名前につける）
  const joinNames = (list) => list.map((n, i) => '<span class="d1-n">' + OB.esc(n) + (i < list.length - 1 ? '、' : '') + '</span>').join('');

  // id は d1-y2004 のように年度から（同じ年度が 2 つあれば d1-y2004-2）
  function card(r, id) {
    const era = r.year == null ? '' : OB.wareki(r.year);
    const head = '<h3 class="d1-card-head" id="' + id + '-h">' +
      '<span class="d1-name">' + (r.year == null ? 'D-1（年度不明）' : 'D-1-' + r.year) + '</span>' +
      (era ? '<span class="d1-era">' + era + '年度</span>' : '') + '</h3>';

    // 優勝・準優勝
    let podium = '<div class="d1-place is-win"><dt><span class="d1-badge is-gold">優勝</span></dt><dd class="d1-winner">' +
      (r.winner.length ? joinNames(r.winner) : '<span class="d1-nil">記録なし</span>') + '</dd></div>';
    if (r.second.length) {
      podium += '<div class="d1-place is-second"><dt><span class="d1-badge is-silver">準優勝</span></dt><dd class="d1-second">' +
        joinNames(r.second) + '</dd></div>';
    }

    // 出場メンバーと、裏方
    const facts = [];
    if (r.members.length) {
      facts.push('<div class="d1-fact is-members"><dt>出場メンバー<small>' + r.members.length + '人</small></dt><dd class="d1-members">' +
        joinNames(r.members) + '</dd></div>');
    }
    for (const [key, label] of [['host', '主催者'], ['referee', 'レフェリー'], ['kuroko', '黒子']]) {
      if (r[key]) facts.push('<div class="d1-fact"><dt>' + label + '</dt><dd class="d1-' + key + '">' + OB.esc(r[key]) + '</dd></div>');
    }

    const note = r.note
      ? '<div class="d1-note"><span class="d1-note-label">補足</span><p class="d1-note-text">' + OB.esc(r.note) + '</p></div>'
      : '';

    return '<li class="d1-year" id="' + id + '"><article class="d1-card" aria-labelledby="' + id + '-h">' + head +
      '<dl class="d1-podium">' + podium + '</dl>' +
      (facts.length ? '<dl class="d1-facts">' + facts.join('') + '</dl>' : '') + note + '</article></li>';
  }

  // 読みこんだら描く
  function showBoard(d) {
    const list = tidy(d && d.d1);
    const seen = {};
    el.list.innerHTML = list.map((r) => {
      const base = 'd1-y' + (r.year == null ? '-unknown' : r.year);
      seen[base] = (seen[base] || 0) + 1;
      return card(r, seen[base] > 1 ? base + '-' + seen[base] : base);
    }).join('');
    el.list.hidden = !list.length;
    el.none.hidden = !!list.length;
    const years = list.filter((r) => r.year != null).map((r) => r.year);
    el.count.textContent = list.length
      ? '全 ' + list.length + '回' + (years.length ? '（' + Math.min(...years) + '〜' + Math.max(...years) + '年度）' : '')
      : '';
    el.board.hidden = false;
  }

  let busy = false;
  async function load() {
    if (busy) return;
    busy = true;
    el.error.hidden = true;
    el.loading.hidden = false;
    try {
      const d = await OB.data.loadPublic();
      el.demo.hidden = !d.sample;
      showBoard(d);
    } catch (e) {
      el.board.hidden = true;
      el.error.hidden = false;
    } finally {
      el.loading.hidden = true;
      busy = false;
    }
  }

  el.retry.addEventListener('click', load);
  load();
})();
