/*
 * 夕照寮OB会サイト ― どのページでも使う小物
 *  - <footer data-ob-footer></footer> に、フィクションの注記などを入れる
 *  - OB.esc()：スプレッドシートから来た文字を HTML に入れるときは必ず通す
 *  - OB.safeUrl()：設定の URL を使うときに通す
 *  - OB.wareki()・OB.normSearch()：名簿・年表で使う、元号と、さがすときのそろえ方
 */
(function () {
  'use strict';
  const OB = (window.OB = window.OB || {});

  OB.DISCLAIMER = 'このサイトに出てくる事件やゲームの題材は誇張であり、すべてフィクションです。';
  // 投稿フォーム（トップページの下）。中のページはどれもサイトの 1 段下にある
  OB.POST_HREF = '../#post';
  OB.NOT_OFFICIAL = '横浜市立大学の公式サイトではありません。夕照寮OB会の有志が作っています。';

  OB.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  // http(s) の URL だけ通す（設定ミスで javascript: などが入っても実行されないように）
  OB.safeUrl = function (u) {
    return /^https?:\/\//i.test(String(u || '')) ? String(u) : '';
  };

  // 年度（4月はじまり）の元号。元年は「元」と書く（2019 → 令和元、2005 → 平成17）
  OB.wareki = function (y) {
    const f = (era, n) => era + (n === 1 ? '元' : n);
    if (y >= 2019) return f('令和', y - 2018);
    if (y >= 1989) return f('平成', y - 1988);
    if (y >= 1926) return f('昭和', y - 1925);
    return '';
  };

  // さがすときは、全角・半角、カタカナ・ひらがな、大文字・小文字、空白の違いを気にしない
  OB.normSearch = function (s) {
    return String(s == null ? '' : s)
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
      .replace(/\s+/g, '');
  };

  function fillFooter() {
    document.querySelectorAll('[data-ob-footer]').forEach((el) => {
      if (el.childElementCount) return;
      el.classList.add('ob-footer');
      el.innerHTML = '<p>' + OB.esc(OB.DISCLAIMER) + '</p><p>' + OB.esc(OB.NOT_OFFICIAL) + '</p>';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fillFooter);
  else fillFooter();
})();
