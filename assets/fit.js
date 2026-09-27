/* ICHAR heading fit.

   Display headings are never broken mid-word: type.css sets them to wrap only
   between words. When a single word is still wider than its box (ENVIRONMENTAL
   in a narrow card, a long surname on a phone), this shrinks that heading's
   font until the word fits, instead of splitting it or letting it overflow.

   It re-runs when the page renders, when fonts arrive and on resize, and it
   always starts again from the size in the markup, so a wider window gets the
   full size back. */
(function () {
  var SEL = 'h1, h2, h3, h4, strong, [data-fit]';
  var MIN = 0.55;

  function fitOne(el) {
    if (!el.hasAttribute('data-fit-base')) {
      el.setAttribute('data-fit-base', el.style.getPropertyValue('font-size') || '');
    }
    var base = el.getAttribute('data-fit-base');
    if (base) el.style.setProperty('font-size', base);
    else el.style.removeProperty('font-size');

    var cs = getComputedStyle(el);
    if (cs.display === 'inline' || !el.clientWidth) return;
    if (el.scrollWidth <= el.clientWidth + 1) return;

    var start = parseFloat(cs.fontSize), size = start;
    while (el.scrollWidth > el.clientWidth + 1 && size > start * MIN) {
      size = size * 0.96;
      el.style.setProperty('font-size', size.toFixed(2) + 'px', 'important');
    }
  }

  function fitAll() {
    var els = document.querySelectorAll(SEL);
    for (var i = 0; i < els.length; i++) fitOne(els[i]);
  }

  var t = null;
  function soon() { clearTimeout(t); t = setTimeout(fitAll, 60); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', soon);
  else soon();
  window.addEventListener('load', soon);
  window.addEventListener('resize', soon);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(soon);
  /* The component pages render after load, so watch for them arriving. */
  if (window.MutationObserver) {
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].type === 'childList' && list[i].addedNodes.length) { soon(); return; }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
