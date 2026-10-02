/**
 * login.js — CodeForge Login Page
 *
 * Sends credentials to POST /api/auth/login via fetch().
 * On success the Flask backend sets a session cookie and this
 * script redirects the browser to index.html.
 *
 * SECURITY:
 *  - Passwords are sent only in the POST body over the network.
 *  - Passwords are NEVER stored in localStorage, sessionStorage,
 *    or any JavaScript variable beyond the immediate request.
 *  - The Flask session cookie (HTTPOnly) handles all auth state.
 */

'use strict';   // Directive prologue — must be FIRST statement (before any declarations)

var LOGIN_API_BASE = 'http://localhost:5000';   // var avoids any const-redeclaration edge cases

document.addEventListener('DOMContentLoaded', function () {

    /* ──────────────────────────────────────────────────────────
       DOM References
    ────────────────────────────────────────────────────────── */
    var loginForm          = document.getElementById('loginForm');
    var loginEmail         = document.getElementById('loginEmail');
    var loginPassword      = document.getElementById('loginPassword');
    var loginEmailError    = document.getElementById('loginEmailError');
    var loginPasswordError = document.getElementById('loginPasswordError');
    var loginEmailGroup    = document.getElementById('loginEmailGroup');
    var loginPasswordGroup = document.getElementById('loginPasswordGroup');
    var loginStatus        = document.getElementById('loginStatus');
    var loginSubmitBtn     = document.getElementById('loginSubmitBtn');
    var toggleLoginPwBtn   = document.getElementById('toggleLoginPassword');
    var forgotPasswordBtn  = document.getElementById('forgotPasswordBtn');
    var forgotPasswordMsg  = document.getElementById('forgotPasswordMsg');
    var forgotMsgClose     = document.getElementById('forgotMsgClose');

    // Safety guard: if any critical element is missing, stop silently
    if (!loginForm || !loginEmail || !loginPassword || !loginSubmitBtn) {
        console.error('[CodeForge] login.js: critical form elements not found');
        return;
    }

    /* ──────────────────────────────────────────────────────────
       Utilities
    ────────────────────────────────────────────────────────── */

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    }

    function setFieldError(group, errorEl, message) {
        if (!group || !errorEl) return;
        errorEl.textContent = message;
        group.classList.remove('field-valid');
        group.classList.add('field-error');
        var input = group.querySelector('.auth-input');
        if (input) input.classList.add('input-error');
    }

    function clearFieldError(group, errorEl) {
        if (!group || !errorEl) return;
        errorEl.textContent = '';
        group.classList.remove('field-error');
        group.classList.add('field-valid');
        var input = group.querySelector('.auth-input');
        if (input) input.classList.remove('input-error');
    }

    function resetFieldStates() {
        [loginEmailGroup, loginPasswordGroup].forEach(function (g) {
            if (!g) return;
            g.classList.remove('field-error', 'field-valid');
            var input = g.querySelector('.auth-input');
            if (input) input.classList.remove('input-error');
        });
        if (loginEmailError)    loginEmailError.textContent    = '';
        if (loginPasswordError) loginPasswordError.textContent = '';
    }

    function showStatus(message, type) {
        if (!loginStatus) return;
        loginStatus.textContent = message;
        loginStatus.className   = 'auth-status ' + type;
        loginStatus.hidden      = false;
    }

    function hideStatus() {
        if (!loginStatus) return;
        loginStatus.hidden      = true;
        loginStatus.className   = 'auth-status';
        loginStatus.textContent = '';
    }

    function setLoading(isLoading) {
        var textEl    = loginSubmitBtn.querySelector('.auth-btn-text');
        var spinnerEl = loginSubmitBtn.querySelector('.auth-btn-spinner');
        loginSubmitBtn.disabled = isLoading;
        if (textEl)    textEl.textContent  = isLoading ? 'Logging in\u2026' : 'Login';
        if (spinnerEl) spinnerEl.hidden    = !isLoading;
    }

    /* ──────────────────────────────────────────────────────────
       Frontend Validation
    ────────────────────────────────────────────────────────── */

    function validateLoginForm() {
        var valid = true;

        var emailVal    = loginEmail.value.trim();
        var passwordVal = loginPassword.value;

        if (!emailVal) {
            setFieldError(loginEmailGroup, loginEmailError, 'Please enter your email.');
            valid = false;
        } else if (!isValidEmail(emailVal)) {
            setFieldError(loginEmailGroup, loginEmailError, 'Please enter a valid email.');
            valid = false;
        } else {
            clearFieldError(loginEmailGroup, loginEmailError);
        }

        if (!passwordVal) {
            setFieldError(loginPasswordGroup, loginPasswordError, 'Please enter your password.');
            valid = false;
        } else {
            clearFieldError(loginPasswordGroup, loginPasswordError);
        }

        return valid;
    }

    /* ──────────────────────────────────────────────────────────
       Live Validation
    ────────────────────────────────────────────────────────── */

    loginEmail.addEventListener('input', function () {
        hideStatus();
        var val = this.value.trim();
        if (!val) {
            setFieldError(loginEmailGroup, loginEmailError, 'Please enter your email.');
        } else if (!isValidEmail(val)) {
            setFieldError(loginEmailGroup, loginEmailError, 'Please enter a valid email.');
        } else {
            clearFieldError(loginEmailGroup, loginEmailError);
        }
    });

    loginPassword.addEventListener('input', function () {
        hideStatus();
        if (!this.value) {
            setFieldError(loginPasswordGroup, loginPasswordError, 'Please enter your password.');
        } else {
            clearFieldError(loginPasswordGroup, loginPasswordError);
        }
    });

    loginEmail.addEventListener('focus', function () {
        if (loginEmailError && loginEmailError.textContent) {
            clearFieldError(loginEmailGroup, loginEmailError);
        }
    });

    loginPassword.addEventListener('focus', function () {
        if (loginPasswordError && loginPasswordError.textContent) {
            clearFieldError(loginPasswordGroup, loginPasswordError);
        }
    });

    /* ──────────────────────────────────────────────────────────
       Password Visibility Toggle
    ────────────────────────────────────────────────────────── */

    if (toggleLoginPwBtn) {
        toggleLoginPwBtn.addEventListener('click', function () {
            var isPassword = loginPassword.type === 'password';
            loginPassword.type = isPassword ? 'text' : 'password';

            var eyeShow = this.querySelector('.icon-eye-show');
            var eyeHide = this.querySelector('.icon-eye-hide');
            if (eyeShow) eyeShow.style.display = isPassword ? 'none' : '';
            if (eyeHide) eyeHide.style.display = isPassword ? ''     : 'none';

            this.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        });
    }

    /* ──────────────────────────────────────────────────────────
       Forgot Password
    ────────────────────────────────────────────────────────── */

    if (forgotPasswordBtn && forgotPasswordMsg) {
        forgotPasswordBtn.addEventListener('click', function () {
            forgotPasswordMsg.hidden = !forgotPasswordMsg.hidden;
        });
    }

    if (forgotMsgClose && forgotPasswordMsg) {
        forgotMsgClose.addEventListener('click', function () {
            forgotPasswordMsg.hidden = true;
        });
    }

    /* ──────────────────────────────────────────────────────────
       Form Submit — Real fetch() to Flask /api/auth/login
    ────────────────────────────────────────────────────────── */

    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        e.stopPropagation();

        hideStatus();
        resetFieldStates();

        if (!validateLoginForm()) return;

        var emailVal    = loginEmail.value.trim().toLowerCase();
        var passwordVal = loginPassword.value;

        setLoading(true);

        fetch(LOGIN_API_BASE + '/api/auth/login', {
            method:      'POST',
            headers:     { 'Content-Type': 'application/json' },
            credentials: 'include',          // send/receive Flask session cookie
            body: JSON.stringify({
                email:    emailVal,
                password: passwordVal        // sent over network only; never stored
            })
        })
        .then(function (resp) {
            return resp.json().then(function (data) {
                return { resp: resp, data: data };
            });
        })
        .then(function (result) {
            var resp = result.resp;
            var data = result.data;

            if (resp.ok && data.success) {
                // Success: session cookie is set — redirect immediately.
                // Use replace() so the back button skips the login page.
                window.location.replace('./index.html');
            } else if (resp.status === 401) {
                setLoading(false);
                showStatus(data.message || 'Invalid email or password.', 'error');
            } else {
                setLoading(false);
                showStatus(data.message || 'Login failed. Please try again.', 'error');
            }
        })
        .catch(function () {
            setLoading(false);
            showStatus('Cannot connect to the server. Is Flask running on port 5000?', 'error');
        });
    });

}); // end DOMContentLoaded
