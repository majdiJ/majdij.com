/*
 * dynamic-text-url.js
 * Inserts the current full browser URL into any <span class="dynamic-text-url"> elements on the page.
 * Loads once when the page is ready.
 */
(function () {
  'use strict';

  /**
   * Update all matching spans with the provided url.
   * @param {string} url
   */
  function updateUrlSpans(url) {
    var spans = document.querySelectorAll('span.dynamic-text-url');
    if (!spans || spans.length === 0) return;
    spans.forEach(function (span) {
      // Replace the span content with the full URL and add a tooltip
      span.textContent = url;
      span.setAttribute('title', url);
    });
  }

  // Run once when DOM is ready
  function init() {
    try {
      updateUrlSpans(window.location.href);
    } catch (e) {
      // Fail silently in environments where window/location may be restricted (e.g. some embedded contexts)
      // eslint-disable-next-line no-console
      console.error('dynamic-text-url: could not set URL', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
