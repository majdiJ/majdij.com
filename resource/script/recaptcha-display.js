(function () {
  /* ---------- Config ---------- */
  const BREAKPOINT = 410;
  const DEBOUNCE_MS = 120;
  const FORM_ID = 'contactForm';

  // retry/backoff config
  const MAX_RENDER_RETRIES = 5;
  const RETRY_BASE_MS = 700;

  /* ---------- State ---------- */
  let grecaptchaReady = false;
  const grecaptchaReadyQueue = [];
  let allowSubmit = false;

  // Map element -> retry state
  const retryState = new WeakMap();

  // Called by Google's API script: onload=onRecaptchaApiLoaded
  window.onRecaptchaApiLoaded = function onRecaptchaApiLoaded() {
    grecaptchaReady = true;
    while (grecaptchaReadyQueue.length) {
      const fn = grecaptchaReadyQueue.shift();
      try { fn(); } catch (err) { console.error('queued grecaptcha handler failed', err); }
    }
  };

  function whenGrecaptchaReady(fn) {
    if (grecaptchaReady) fn();
    else grecaptchaReadyQueue.push(fn);
  }

  function copyDataAttributes(srcEl, destEl) {
    Array.from(srcEl.attributes).forEach((attr) => {
      if (attr.name.startsWith('data-')) destEl.setAttribute(attr.name, attr.value);
    });
  }

  function desiredSize() {
    return window.innerWidth < BREAKPOINT ? 'compact' : null;
  }

  // show a single inline error inside the container (not repeated)
  function showInlineError(container, text) {
    if (!container) return;
    let box = container.querySelector('.recaptcha-error-box');
    if (!box) {
      box = document.createElement('div');
      box.className = 'recaptcha-error-box';
      // minimal styling; you can override in your CSS
      box.style.color = '#ffdddd';
      box.style.background = '#5a1a1a';
      box.style.padding = '8px';
      box.style.borderRadius = '6px';
      box.style.marginTop = '10px';
      box.style.fontSize = '13px';
      container.appendChild(box);
    }
    box.textContent = text;
  }

  function clearInlineError(container) {
    if (!container) return;
    const box = container.querySelector('.recaptcha-error-box');
    if (box) box.remove();
  }

  // Build grecaptcha.render options (we pass callbacks explicitly)
  function buildRenderOptions(el, size, callbacks) {
    const opts = { sitekey: el.getAttribute('data-sitekey') };
    const theme = el.getAttribute('data-theme');
    if (theme) opts.theme = theme;
    if (size) opts.size = size;
    if (callbacks && typeof callbacks.callback === 'function') opts.callback = callbacks.callback;
    if (callbacks && typeof callbacks['expired-callback'] === 'function') opts['expired-callback'] = callbacks['expired-callback'];
    if (callbacks && typeof callbacks['error-callback'] === 'function') opts['error-callback'] = callbacks['error-callback'];
    return opts;
  }

  // Replace DOM node and optionally render immediately if API is present.
  // Returns { el, widgetId } where widgetId may be null if not rendered yet.
  function replaceAndMaybeRender(oldEl, size, callbacks) {
    const parent = oldEl.parentNode;
    if (!parent) return null;

    const newEl = document.createElement('div');
    newEl.className = oldEl.className || 'g-recaptcha';
    copyDataAttributes(oldEl, newEl);

    if (size) newEl.setAttribute('data-size', size);
    else newEl.removeAttribute('data-size');

    if (size) newEl.setAttribute('data-recaptcha-rendered-size', size);
    else newEl.setAttribute('data-recaptcha-rendered-size', '');

    parent.replaceChild(newEl, oldEl);

    if (window.grecaptcha && typeof window.grecaptcha.render === 'function') {
      try {
        const opts = buildRenderOptions(newEl, size, callbacks || {});
        const widgetId = window.grecaptcha.render(newEl, opts);
        newEl.setAttribute('data-recaptcha-widget-id', String(widgetId));
        return { el: newEl, widgetId: widgetId };
      } catch (err) {
        console.error('grecaptcha.render threw:', err);
        // we will handle retry scheduling elsewhere
        return { el: newEl, widgetId: null, error: err };
      }
    } else {
      // API not yet present - caller should schedule rendering via whenGrecaptchaReady
      return { el: newEl, widgetId: null };
    }
  }

  // schedule a render attempt with exponential backoff (per-element)
  function scheduleRenderAttempt(container, callbacks) {
    if (!container) return;
    const el = container.querySelector('.g-recaptcha');
    if (!el) return;

    const state = retryState.get(el) || { attempts: 0, scheduled: false };
    if (state.scheduled) return; // already scheduled

    if (state.attempts >= MAX_RENDER_RETRIES) {
      // give up and show friendly message
      showInlineError(container, 'reCAPTCHA failed to load. Please disable adblockers or check your network/permissions.');
      console.warn('recaptcha-display: reached max render retries for', el);
      retryState.set(el, state);
      return;
    }

    const delay = RETRY_BASE_MS * Math.pow(2, state.attempts); // exponential backoff
    state.scheduled = true;
    state.attempts += 1;
    retryState.set(el, state);

    setTimeout(() => {
      state.scheduled = false;
      retryState.set(el, state);
      attemptRender(container, callbacks);
    }, delay);
  }

  // attempt actual render: if grecaptcha present, render and handle errors; otherwise queue when ready
  function attemptRender(container, callbacks) {
    if (!container) return;
    clearInlineError(container);

    const current = container.querySelector('.g-recaptcha');
    if (!current) {
      // nothing to render
      return;
    }

    // if already has a widget id and grecaptcha available, assume it's rendered
    const widAttr = current.getAttribute('data-recaptcha-widget-id');
    if (widAttr && window.grecaptcha && typeof window.grecaptcha.render === 'function') {
      return; // already rendered
    }

    // If grecaptcha is ready, try rendering now
    if (window.grecaptcha && typeof window.grecaptcha.render === 'function') {
      try {
        const size = desiredSize();
        // replace to avoid duplicate render into same node errors
        const res = replaceAndMaybeRender(current, size, callbacks);
        if (res && res.widgetId != null) {
          // success: reset retry state
          retryState.delete(res.el);
          clearInlineError(container);
          return;
        } else {
          // render failed synchronously (exception), schedule retry
          console.warn('recaptcha-display: render attempt failed; scheduling retry');
          scheduleRenderAttempt(container, callbacks);
        }
      } catch (err) {
        console.error('recaptcha-display: render attempt exception', err);
        scheduleRenderAttempt(container, callbacks);
      }
      return;
    }

    // grecaptcha not present — queue work and schedule a retry in case onload never fires
    whenGrecaptchaReady(() => {
      // when API becomes ready, try immediately
      attemptRender(container, callbacks);
    });

    // schedule fallback retry in case API never becomes available (blocking/adblock/CSP); this avoids silent infinite waiting
    scheduleRenderAttempt(container, callbacks);
  }

  /* ---------- recaptcha callbacks + submit flow ---------- */

  function onRecaptchaSuccess(token) {
    const form = document.getElementById(FORM_ID);
    if (!form) return;
    let hidden = form.querySelector('input[name="g-recaptcha-response"]');
    if (!hidden) {
      hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'g-recaptcha-response';
      form.appendChild(hidden);
    }
    hidden.value = token;
    allowSubmit = true;
    form.submit(); // programmatic submit; bypasses onsubmit
  }

  function onRecaptchaExpired() {
    const form = document.getElementById(FORM_ID);
    if (!form) return;
    const container = form.querySelector('.recaptcha-container');
    showInlineError(container, 'reCAPTCHA expired. Please try again.');
    try {
      const el = container.querySelector('.g-recaptcha');
      const wid = el && el.getAttribute('data-recaptcha-widget-id');
      if (wid && window.grecaptcha && typeof window.grecaptcha.reset === 'function') {
        window.grecaptcha.reset(Number(wid));
      }
    } catch (err) {
      // ignore
    }
  }

  function onRecaptchaError() {
    const form = document.getElementById(FORM_ID);
    const container = form && form.querySelector('.recaptcha-container');
    // show inline error (but do not spam)
    showInlineError(container, 'reCAPTCHA error occurred. Please try again.');
    console.error('reCAPTCHA error callback fired');
    // schedule another render attempt with backoff
    scheduleRenderAttempt(container, {
      callback: onRecaptchaSuccess,
      'expired-callback': onRecaptchaExpired,
      'error-callback': onRecaptchaError
    });
  }

  // global onsubmit referenced by your inline attribute
  window.onSubmitForm = function onSubmitForm(event) {
    if (allowSubmit) {
      allowSubmit = false;
      return true;
    }
    if (event && typeof event.preventDefault === 'function') event.preventDefault();

    const form = document.getElementById(FORM_ID);
    if (!form) return false;

    const container = form.querySelector('.recaptcha-container');
    if (!container) {
      form.submit();
      return false;
    }

    if (container.classList.contains('recaptcha-hidden')) {
      container.classList.remove('recaptcha-hidden');
      setTimeout(() => {
        try { container.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
      }, 50);
    }

    const callbacks = {
      callback: onRecaptchaSuccess,
      'expired-callback': onRecaptchaExpired,
      'error-callback': onRecaptchaError
    };

    attemptRender(container, callbacks);
    return false;
  };

  /* ---------- responsive behavior ---------- */

  let resizeTimer = null;
  function applyCompact() {
    const captchas = document.querySelectorAll('.recaptcha-container .g-recaptcha');
    const size = desiredSize();

    captchas.forEach((el) => {
      const applied = el.getAttribute('data-recaptcha-rendered-size') || '';
      const desiredNorm = size === null ? '' : size;
      const currentAttrSize = el.getAttribute('data-size') || '';
      if (applied === desiredNorm && currentAttrSize === (size || '')) return;

      // re-render with callbacks
      const callbacks = {
        callback: onRecaptchaSuccess,
        'expired-callback': onRecaptchaExpired,
        'error-callback': onRecaptchaError
      };

      // use attemptRender on the container (element might be replaced)
      const container = el.closest('.recaptcha-container');
      if (container) attemptRender(container, callbacks);
    });
  }

  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyCompact, DEBOUNCE_MS);
  }

  document.addEventListener('DOMContentLoaded', applyCompact);
  window.addEventListener('resize', onResize);
  applyCompact();

  console.info('recaptcha-display: initialized (will queue rendering until grecaptcha API loads).');
})();
