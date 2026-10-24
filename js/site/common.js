/*
 * 夕照寮OB会サイト ― どのページでも使う小物
 *  - <footer data-ob-footer></footer> に、フィクションの注記などを入れる
 *  - OB.esc()：スプレッドシートから来た文字を HTML に入れるときは必ず通す
 */
(function () {
  'use strict';
  const OB = (window.OB = window.OB || {});

  OB.DISCLAIMER = 'このサイトに出てくる事件やゲームの題材は誇張であり、すべてフィクションです。';
  OB.NOT_OFFICIAL = '横浜市立大学の公式サイトではありません。夕照寮OB会の有志が作っています。';

  OB.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  // http(s) の URL だけ通す（設定ミスで javascript: などが入っても実行されないように）
  OB.safeUrl = function (u) {
    return /^https?:\/\//i.test(String(u || '')) ? String(u) : '';
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
