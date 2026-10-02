/**
 * signup.js — CodeForge Signup Page
 *
 * Sends registration data to POST /api/auth/signup via fetch().
 * On success the user is shown a confirmation and redirected to login.html.
 *
 * SECURITY:
 *  - Passwords are sent only in the POST body over the network.
 *  - Passwords are NEVER stored in localStorage, sessionStorage,
 *    or any JavaScript variable beyond the immediate request.
 */

'use strict';

const AUTH_API_BASE = 'http://localhost:5000';

/* ──────────────────────────────────────────────────────────
   DOM References
────────────────────────────────────────────────────────── */
const signupForm          = document.getElementById('signupForm');
const signupName          = document.getElementById('signupName');
const signupEmail         = document.getElementById('signupEmail');
const signupPassword      = document.getElementById('signupPassword');
const signupConfirm       = document.getElementById('signupConfirm');

const signupNameError     = document.getElementById('signupNameError');
const signupEmailError    = document.getElementById('signupEmailError');
const signupPasswordError = document.getElementById('signupPasswordError');
const signupConfirmError  = document.getElementById('signupConfirmError');

const signupNameGroup     = document.getElementById('signupNameGroup');
const signupEmailGroup    = document.getElementById('signupEmailGroup');
const signupPasswordGroup = document.getElementById('signupPasswordGroup');
const signupConfirmGroup  = document.getElementById('signupConfirmGroup');

const signupStatus        = document.getElementById('signupStatus');
const signupSubmitBtn     = document.getElementById('signupSubmitBtn');

const toggleSignupPw      = document.getElementById('toggleSignupPassword');
const toggleSignupConf    = document.getElementById('toggleSignupConfirm');

/* ──────────────────────────────────────────────────────────
   Utilities
────────────────────────────────────────────────────────── */

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function setFieldError(group, errorEl, message) {
    errorEl.textContent = message;
    group.classList.remove('field-valid');
    group.classList.add('field-error');
    const input = group.querySelector('.auth-input');
    if (input) input.classList.add('input-error');
}

function clearFieldError(group, errorEl) {
    errorEl.textContent = '';
    group.classList.remove('field-error');
    group.classList.add('field-valid');
    const input = group.querySelector('.auth-input');
    if (input) input.classList.remove('input-error');
}

function resetFieldStates() {
    [signupNameGroup, signupEmailGroup, signupPasswordGroup, signupConfirmGroup].forEach(function (g) {
        g.classList.remove('field-error', 'field-valid');
        const input = g.querySelector('.auth-input');
        if (input) input.classList.remove('input-error');
    });
    [signupNameError, signupEmailError, signupPasswordError, signupConfirmError].forEach(function (e) {
        e.textContent = '';
    });
}

function showStatus(message, type) {
    signupStatus.textContent = message;
    signupStatus.className   = 'auth-status ' + type;
    signupStatus.hidden      = false;
}

function hideStatus() {
    signupStatus.hidden     = true;
    signupStatus.className  = 'auth-status';
    signupStatus.textContent = '';
}

function setLoading(isLoading) {
    const textEl    = signupSubmitBtn.querySelector('.auth-btn-text');
    const spinnerEl = signupSubmitBtn.querySelector('.auth-btn-spinner');
    signupSubmitBtn.disabled = isLoading;
    textEl.textContent = isLoading ? 'Creating account…' : 'Create Account';
    spinnerEl.hidden   = !isLoading;
}

/* ──────────────────────────────────────────────────────────
   Frontend Validation
────────────────────────────────────────────────────────── */

function validateSignupForm() {
    let valid = true;

    const nameVal     = signupName.value.trim();
    const emailVal    = signupEmail.value.trim();
    const passwordVal = signupPassword.value;
    const confirmVal  = signupConfirm.value;

    if (!nameVal) {
        setFieldError(signupNameGroup, signupNameError, 'Please enter your full name.');
        valid = false;
    } else {
        clearFieldError(signupNameGroup, signupNameError);
    }

    if (!emailVal) {
        setFieldError(signupEmailGroup, signupEmailError, 'Please enter your email.');
        valid = false;
    } else if (!isValidEmail(emailVal)) {
        setFieldError(signupEmailGroup, signupEmailError, 'Please enter a valid email.');
        valid = false;
    } else {
        clearFieldError(signupEmailGroup, signupEmailError);
    }

    if (!passwordVal) {
        setFieldError(signupPasswordGroup, signupPasswordError, 'Please enter a password.');
        valid = false;
    } else if (passwordVal.length < 6) {
        setFieldError(signupPasswordGroup, signupPasswordError, 'Password must be at least 6 characters.');
        valid = false;
    } else {
        clearFieldError(signupPasswordGroup, signupPasswordError);
    }

    if (!confirmVal) {
        setFieldError(signupConfirmGroup, signupConfirmError, 'Please confirm your password.');
        valid = false;
    } else if (passwordVal && confirmVal !== passwordVal) {
        setFieldError(signupConfirmGroup, signupConfirmError, 'Passwords do not match.');
        valid = false;
    } else if (passwordVal) {
        clearFieldError(signupConfirmGroup, signupConfirmError);
    }

    return valid;
}

/* ──────────────────────────────────────────────────────────
   Live Validation
────────────────────────────────────────────────────────── */

signupName.addEventListener('input', function () {
    hideStatus();
    if (!this.value.trim()) {
        setFieldError(signupNameGroup, signupNameError, 'Please enter your full name.');
    } else {
        clearFieldError(signupNameGroup, signupNameError);
    }
});

signupEmail.addEventListener('input', function () {
    hideStatus();
    const val = this.value.trim();
    if (!val) {
        setFieldError(signupEmailGroup, signupEmailError, 'Please enter your email.');
    } else if (!isValidEmail(val)) {
        setFieldError(signupEmailGroup, signupEmailError, 'Please enter a valid email.');
    } else {
        clearFieldError(signupEmailGroup, signupEmailError);
    }
});

signupPassword.addEventListener('input', function () {
    hideStatus();
    if (!this.value) {
        setFieldError(signupPasswordGroup, signupPasswordError, 'Please enter a password.');
    } else if (this.value.length < 6) {
        setFieldError(signupPasswordGroup, signupPasswordError, 'Password must be at least 6 characters.');
    } else {
        clearFieldError(signupPasswordGroup, signupPasswordError);
    }
    if (signupConfirm.value) {
        if (signupConfirm.value !== this.value) {
            setFieldError(signupConfirmGroup, signupConfirmError, 'Passwords do not match.');
        } else {
            clearFieldError(signupConfirmGroup, signupConfirmError);
        }
    }
});

signupConfirm.addEventListener('input', function () {
    hideStatus();
    if (!this.value) {
        setFieldError(signupConfirmGroup, signupConfirmError, 'Please confirm your password.');
    } else if (this.value !== signupPassword.value) {
        setFieldError(signupConfirmGroup, signupConfirmError, 'Passwords do not match.');
    } else {
        clearFieldError(signupConfirmGroup, signupConfirmError);
    }
});

/* ──────────────────────────────────────────────────────────
   Focus — clear error on re-focus
────────────────────────────────────────────────────────── */
[
    [signupName,    signupNameGroup,     signupNameError],
    [signupEmail,   signupEmailGroup,    signupEmailError],
    [signupPassword,signupPasswordGroup, signupPasswordError],
    [signupConfirm, signupConfirmGroup,  signupConfirmError],
].forEach(function ([input, group, errorEl]) {
    input.addEventListener('focus', function () {
        if (errorEl.textContent) clearFieldError(group, errorEl);
    });
});

/* ──────────────────────────────────────────────────────────
   Password Visibility Toggles
────────────────────────────────────────────────────────── */

function wireVisibilityToggle(btn, input) {
    btn.addEventListener('click', function () {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';

        const eyeShow = btn.querySelector('.icon-eye-show');
        const eyeHide = btn.querySelector('.icon-eye-hide');
        eyeShow.style.display = isPassword ? 'none' : '';
        eyeHide.style.display = isPassword ? ''     : 'none';

        btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    });
}

wireVisibilityToggle(toggleSignupPw,   signupPassword);
wireVisibilityToggle(toggleSignupConf, signupConfirm);

/* ──────────────────────────────────────────────────────────
   Form Submit — Real fetch() to Flask /api/auth/signup
────────────────────────────────────────────────────────── */

signupForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideStatus();
    resetFieldStates();

    if (!validateSignupForm()) return;

    const nameVal     = signupName.value.trim();
    const emailVal    = signupEmail.value.trim().toLowerCase();
    const passwordVal = signupPassword.value;   // sent over network; never stored

    setLoading(true);

    try {
        const resp = await fetch(`${AUTH_API_BASE}/api/auth/signup`, {
            method:      'POST',
            headers:     { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                name:     nameVal,
                email:    emailVal,
                password: passwordVal
            })
        });

        const data = await resp.json();
        setLoading(false);

        if (resp.ok && data.success) {
            // ── Success: hide form, show confirmation ─────────────────
            signupForm.hidden = true;
            signupStatus.innerHTML =
                '<span style="display:flex;flex-direction:column;gap:0.85rem;width:100%;">' +
                '<span style="font-size:1.05rem;font-weight:700;color:var(--status-accepted-text);">' +
                '✓ Account created successfully!</span>' +
                '<span style="font-size:0.83rem;color:var(--text-secondary);">' +
                'Your account is ready. Click below to sign in.</span>' +
                '<a href="login.html" class="auth-btn-primary" ' +
                'style="text-align:center;text-decoration:none;margin-top:0.1rem;">' +
                'Go to Login</a>' +
                '</span>';
            signupStatus.className = 'auth-status success';
            signupStatus.hidden    = false;

        } else if (resp.status === 409) {
            // ── Duplicate email ───────────────────────────────────────
            setFieldError(signupEmailGroup, signupEmailError, data.message || 'An account with this email already exists.');
            showStatus(data.message || 'An account with this email already exists.', 'error');

        } else {
            showStatus(data.message || 'Registration failed. Please try again.', 'error');
        }

    } catch (_) {
        setLoading(false);
        showStatus('Cannot connect to the server. Is Flask running on port 5000?', 'error');
    }
});
