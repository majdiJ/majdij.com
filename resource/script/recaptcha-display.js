(function () {
  const BREAKPOINT = 410; // px
  const DEBOUNCE_MS = 120;

  function desiredSize() {
    return window.innerWidth < BREAKPOINT ? 'compact' : null;
  }

  function copyDataAttributes(srcEl, destEl) {
    // copy all data-* attributes from source to destination
    Array.from(srcEl.attributes).forEach((attr) => {
      if (attr.name.startsWith('data-')) {
        destEl.setAttribute(attr.name, attr.value);
      }
    });
  }

  function buildRenderOptions(el, size) {
    const opts = {
      sitekey: el.getAttribute('data-sitekey')
    };
    const theme = el.getAttribute('data-theme');
    if (theme) opts.theme = theme;
    if (size) opts.size = size;

    // If there are optional callback attributes, copy them into opts
    const callback = el.getAttribute('data-callback');
    const expiredCallback = el.getAttribute('data-expired-callback');
    const errorCallback = el.getAttribute('data-error-callback');
    if (callback && typeof window[callback] === 'function') opts.callback = window[callback];
    if (expiredCallback && typeof window[expiredCallback] === 'function') opts['expired-callback'] = window[expiredCallback];
    if (errorCallback && typeof window[errorCallback] === 'function') opts['error-callback'] = window[errorCallback];

    return opts;
  }

  function replaceAndMaybeRender(oldEl, size) {
    const parent = oldEl.parentNode;
    if (!parent) return;

    const newEl = document.createElement('div');
    newEl.className = oldEl.className || 'g-recaptcha';

    // copy over all data-* attributes, then ensure data-size matches requested size (or remove)
    copyDataAttributes(oldEl, newEl);
    if (size) {
      newEl.setAttribute('data-size', size);
    } else {
      newEl.removeAttribute('data-size');
    }

    // Mark what size was rendered (for later comparisons)
    if (size) newEl.setAttribute('data-recaptcha-rendered-size', size);
    else newEl.setAttribute('data-recaptcha-rendered-size', '');

    // Replace in DOM
    parent.replaceChild(newEl, oldEl);

    // If grecaptcha is available, render into the new element. If it fails, leave attributes so
    // the normal grecaptcha script (if run later) can auto-render.
    if (window.grecaptcha && typeof window.grecaptcha.render === 'function') {
      try {
        const opts = buildRenderOptions(newEl, size);
        const widgetId = window.grecaptcha.render(newEl, opts);
        // store widget id in dataset for potential future use
        newEl.setAttribute('data-recaptcha-widget-id', String(widgetId));
      } catch (err) {
        console.warn('recaptcha-display: failed to render grecaptcha after replacing element', err);
      }
    }
  }

  function applyCompact() {
    const captchas = document.querySelectorAll('.recaptcha-container .g-recaptcha');
    const size = desiredSize();

    captchas.forEach((el) => {
      const applied = el.getAttribute('data-recaptcha-rendered-size');
      const currentAttrSize = el.getAttribute('data-size');

      // Normalize null/empty
      const appliedNorm = applied === null ? '' : applied;
      const desiredNorm = size === null ? '' : size;

      // If the element already reflects the desired size, nothing to do
      if (appliedNorm === desiredNorm && currentAttrSize === (size || null)) {
        return;
      }

      // Replace the element and (re-)render with the desired size. We replace rather than
      // attempting to render into the same element because grecaptcha will throw if you try
      // to render twice into the same DOM node.
      replaceAndMaybeRender(el, size);
    });
  }

  // Debounced resize handler
  let resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyCompact, DEBOUNCE_MS);
  }

  // Run on DOM ready and also immediately (in case script runs after DOMContentLoaded)
  document.addEventListener('DOMContentLoaded', applyCompact);
  window.addEventListener('resize', onResize);
  applyCompact();
})();