/*
  Behavior:
  - First click on submit => prevent submission, unhide recaptcha, render it if needed, scroll into view.
  - When reCAPTCHA is solved, onRecaptchaSuccess() auto-submits the form.
  - If expired or error, user must click the checkbox again (we reset the widget).
  - Works if the grecaptcha library hasn't loaded yet (it will render once ready).
*/

(function () {
    const FORM_ID = 'contactForm';
    const RECAPTCHA_CONTAINER_SEL = '.recaptcha-container';
    const RECAPTCHA_WIDGET_SEL = '.recaptcha-container .g-recaptcha';

    let recaptchaWidgetId = null;
    let recaptchaRenderedSize = null; // optional: if you want to keep track
    let pendingForm = null;
    let apiLoaded = false;

    // Called by Google when api script loads (because we added ?onload=onRecaptchaApiLoad&render=explicit)
    window.onRecaptchaApiLoad = function () {
        apiLoaded = true;
        // If the container is already visible and not rendered, render now:
        const container = document.querySelector(RECAPTCHA_CONTAINER_SEL);
        if (container && !container.classList.contains('recaptcha-hidden')) {
            renderRecaptchaIfNeeded();
        }
    };

    function renderRecaptchaIfNeeded() {
        // If already rendered, nothing to do
        if (recaptchaWidgetId !== null) return;

        const el = document.querySelector(RECAPTCHA_WIDGET_SEL);
        if (!el) return;

        // if grecaptcha isn't ready, wait briefly
        if (!window.grecaptcha || typeof window.grecaptcha.render !== 'function') {
            // poll briefly until grecaptcha available
            const to = setInterval(() => {
                if (window.grecaptcha && typeof window.grecaptcha.render === 'function') {
                    clearInterval(to);
                    renderRecaptchaIfNeeded();
                }
            }, 200);
            return;
        }

        const sitekey = el.getAttribute('data-sitekey');
        const theme = el.getAttribute('data-theme') || 'light';
        const sizeAttr = el.getAttribute('data-size') || null;

        const opts = {
            sitekey: sitekey,
            theme: theme,
            callback: onRecaptchaSuccess,
            'expired-callback': onRecaptchaExpired,
            'error-callback': onRecaptchaError
        };
        if (sizeAttr) opts.size = sizeAttr;

        try {
            recaptchaWidgetId = window.grecaptcha.render(el, opts);
            // store optional metadata
            if (sizeAttr) recaptchaRenderedSize = sizeAttr;
        } catch (err) {
            console.warn('reCAPTCHA render failed', err);
        }
    }

    function showRecaptcha() {
        const container = document.querySelector(RECAPTCHA_CONTAINER_SEL);
        if (!container) return;
        container.classList.remove('recaptcha-hidden');
        container.classList.add('recaptcha-visible');

        // render it
        renderRecaptchaIfNeeded();

        // give the user visual context
        container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Called when grecaptcha calls back with a token
    window.onRecaptchaSuccess = function (token) {
        // token is the g-recaptcha-response. If there's a pending form submit, submit now.
        if (pendingForm) {
            // (Optionally attach token to a hidden input - grecaptcha normally injects one)
            // Submit the form programmatically
            // use requestSubmit when available to trigger native form validation behaviours
            try {
                if (typeof pendingForm.requestSubmit === 'function') pendingForm.requestSubmit();
                else pendingForm.submit();
            } catch (err) {
                // fallback to simple submit
                pendingForm.submit();
            }
            pendingForm = null;
        }
    };

    window.onRecaptchaExpired = function () {
        // token expired. reset widget so user can click again.
        if (recaptchaWidgetId !== null && window.grecaptcha && typeof window.grecaptcha.reset === 'function') {
            window.grecaptcha.reset(recaptchaWidgetId);
        }
        // keep the recaptcha visible so the user can click again
    };

    window.onRecaptchaError = function () {
        // Something went wrong, allow user to try again.
        // Optionally show a message to the user here.
        console.warn('reCAPTCHA error occurred. Please try again.');
        if (recaptchaWidgetId !== null && window.grecaptcha && typeof window.grecaptcha.reset === 'function') {
            window.grecaptcha.reset(recaptchaWidgetId);
        }
    };

    // Form submit handler attached inline in your markup: onsubmit="return onSubmitForm(event)"
    window.onSubmitForm = function (event) {
        event = event || window.event;
        const form = event.target || document.getElementById(FORM_ID);
        if (!form) return true;

        // If recaptcha is rendered and already has a response -> allow native submit
        if (recaptchaWidgetId !== null && window.grecaptcha && typeof window.grecaptcha.getResponse === 'function') {
            const resp = window.grecaptcha.getResponse(recaptchaWidgetId);
            if (resp && resp.length > 0) {
                // recaptcha already solved — allow submit to proceed
                return true; // allow normal submit
            }
        }

        // Otherwise: prevent submission, show recaptcha and wait for user to solve it
        event.preventDefault();
        pendingForm = form;
        showRecaptcha();

        // We return false to ensure the form doesn't submit synchronously
        return false;
    };

    // Optional: if user clicks submit again while the widget is visible but not solved,
    // just re-focus/scroll to recaptcha instead of attempting to re-render.
    // Attach a second handler on click of submit to improve UX:
    document.addEventListener('DOMContentLoaded', function () {
        const form = document.getElementById(FORM_ID);
        if (!form) return;
        const submit = form.querySelector('[type="submit"]');
        if (!submit) return;

        submit.addEventListener('click', function (ev) {
            // if container visible and no response, focus on it
            const container = document.querySelector(RECAPTCHA_CONTAINER_SEL);
            if (container && !container.classList.contains('recaptcha-hidden')) {
                // If grecaptcha is rendered but not solved, ask user to interact
                if (recaptchaWidgetId !== null && window.grecaptcha && typeof window.grecaptcha.getResponse === 'function') {
                    const resp = window.grecaptcha.getResponse(recaptchaWidgetId);
                    if (!resp || resp.length === 0) {
                        ev.preventDefault();
                        container.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        // give small visual hint (flash) maybe — optional
                        container.classList.add('recaptcha-attention');
                        setTimeout(() => container.classList.remove('recaptcha-attention'), 800);
                        pendingForm = form;
                        return false;
                    }
                }
            }
            // otherwise let the onsubmit handler handle it
        });
    });
})();