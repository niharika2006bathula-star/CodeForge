/**
 * auth-guard.js — CodeForge Shared Authentication Guard
 *
 * Include this script on every protected page (index.html, compiler.html,
 * history.html). It:
 *   1. Calls GET /api/auth/me at page load
 *   2. Redirects to login.html if the session has expired / never existed
 *   3. Populates .nav-user-name elements with the logged-in user's name
 *   4. Wires up the logout button (#navLogoutBtn) on any page that has one
 *
 * No passwords or secrets are read, stored, or exposed here.
 *
 * NOTE: Uses var (not const) for AUTH_GUARD_BASE so that dashboard.js and
 * other page scripts can also declare AUTH_API_BASE without a redeclaration
 * error in the global scope.
 */

'use strict';

// Use a uniquely-named variable to avoid const-redeclaration conflict
// (dashboard.js also declares AUTH_API_BASE in global scope).
var AUTH_GUARD_BASE = 'http://localhost:5000';

/**
 * Check whether the current visitor has an active Flask session.
 * Redirects to login.html immediately if not authenticated.
 * On success, updates nav name elements and wires up logout.
 */
async function initAuthGuard() {
    let data;
    try {
        const resp = await fetch(`${AUTH_GUARD_BASE}/api/auth/me`, {
            method: 'GET',
            credentials: 'include'   // send Flask session cookie cross-origin
        });
        data = await resp.json();
    } catch (_) {
        // Backend unreachable — redirect to login for safety
        window.location.href = 'login.html';
        return;
    }

    if (!data.authenticated) {
        window.location.href = 'login.html';
        return;
    }

    // ── Update nav with the user's real name ─────────────────────────
    const user = data.user;
    document.querySelectorAll('.nav-user-name').forEach(function (el) {
        el.textContent = user.name;
    });

    // ── Wire logout button ────────────────────────────────────────────
    const logoutBtn = document.getElementById('navLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function () {
            logoutBtn.disabled = true;
            try {
                await fetch(`${AUTH_GUARD_BASE}/api/auth/logout`, {
                    method: 'POST',
                    credentials: 'include'
                });
            } catch (_) {
                // Even if the request fails, send the user to login
            }
            window.location.href = 'login.html';
        });
    }
}

// Run on DOMContentLoaded so nav elements are ready.
document.addEventListener('DOMContentLoaded', initAuthGuard);
