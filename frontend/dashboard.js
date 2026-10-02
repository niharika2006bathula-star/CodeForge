/**
 * CodeForge – Dashboard JavaScript (v2)
 * Reads this user's execution history from GET /api/history (SQLite backend).
 * Renders:
 *   - Stats cards: Total / Successful / Failed / Success Rate
 *   - Language Usage horizontal bar chart
 *   - Recent Activity cards (latest 5)
 *   - Platform Status (backend health check via /health)
 *   - Mobile hamburger navigation
 *
 * localStorage is NOT used for history. All data comes from SQLite via
 * the Flask API, scoped to the logged-in user's session.
 */

var AUTH_API_BASE = 'http://localhost:5000';   // also used by auth-guard.js (var is safe)
var BACKEND_URL   = AUTH_API_BASE + '/health';
const RECENT_COUNT  = 5;

/* ══════════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════════ */

/**
 * Fetch this user's execution history from the SQLite backend.
 * Falls back to empty array on error.
 */
async function getUserHistory() {
    try {
        const resp = await fetch(`${AUTH_API_BASE}/api/history`, {
            method:      "GET",
            credentials: "include"
        });
        if (!resp.ok) return [];
        const data = await resp.json();
        return data.records || [];
    } catch (_) {
        return [];
    }
}

function escapeHTML(str) {
    const d = document.createElement("div");
    d.textContent = String(str || "");
    return d.innerHTML;
}

function langDisplay(key) {
    const map = { C: "C", CPP: "C++", JAVA: "Java", PYTHON: "Python" };
    return map[(key || "").toUpperCase()] || key;
}

function isSuccess(status) {
    return (status || "").toLowerCase() === "accepted";
}

function statusBadgeHTML(status) {
    const s = (status || "").toLowerCase();
    let cls = "status-error";
    if      (s === "accepted")            cls = "status-accepted";
    else if (s === "compilation error")   cls = "status-compile-error";
    else if (s === "runtime error")       cls = "status-runtime-error";
    else if (s === "time limit exceeded") cls = "status-tle";
    return `<span class="status-badge ${cls}">${escapeHTML(status || "Unknown")}</span>`;
}

function langBadgeHTML(lang) {
    return `<span class="lang-badge">${escapeHTML(langDisplay(lang))}</span>`;
}

function formatTimestamp(isoStr) {
    if (!isoStr) return "—";
    try {
        const d   = new Date(isoStr);
        const now = new Date();
        const diffMs  = now - d;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHr  = Math.floor(diffMs / 3600000);
        const diffDay = Math.floor(diffMs / 86400000);

        if (diffMin < 1)  return "Just now";
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHr  < 24) return `${diffHr}h ago`;
        if (diffDay < 2)  return "Yesterday";
        if (diffDay < 7)  return `${diffDay} days ago`;

        return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    } catch (e) {
        return isoStr;
    }
}

/* ── Animated integer counter ──────────────────────── */
function animateCount(el, target, suffix, duration) {
    if (!el) return;
    if (target === 0) { el.textContent = "0" + suffix; return; }
    const start = performance.now();
    (function tick(now) {
        const pct  = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - pct, 3);
        el.textContent = Math.round(ease * target) + suffix;
        if (pct < 1) requestAnimationFrame(tick);
    })(performance.now());
}

/* ── Animated width (for progress bars) ────────────── */
function animateWidth(barEl, targetPct, duration) {
    if (!barEl) return;
    const start = performance.now();
    (function tick(now) {
        const pct  = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - pct, 3);
        barEl.style.width = (ease * targetPct).toFixed(1) + "%";
        if (pct < 1) requestAnimationFrame(tick);
    })(performance.now());
}

/* ══════════════════════════════════════════════════════
   STATISTICS CARDS
══════════════════════════════════════════════════════ */
function renderStats(history) {
    const total      = history.length;
    const successful = history.filter(r => isSuccess(r.status)).length;
    const failed     = total - successful;
    const rate       = total > 0 ? Math.round((successful / total) * 100) : 0;

    animateCount(document.getElementById("statTotal"),   total,      "",  650);
    animateCount(document.getElementById("statSuccess"), successful, "",  650);
    animateCount(document.getElementById("statFailed"),  failed,     "",  650);
    animateCount(document.getElementById("statRate"),    rate,       "%", 750);
}

/* ══════════════════════════════════════════════════════
   LANGUAGE USAGE BARS
══════════════════════════════════════════════════════ */
const LANG_CONFIG = [
    { key: "C",      label: "C",      colorClass: "bar-c"    },
    { key: "CPP",    label: "C++",    colorClass: "bar-cpp"  },
    { key: "JAVA",   label: "Java",   colorClass: "bar-java" },
    { key: "PYTHON", label: "Python", colorClass: "bar-py"   },
];

function renderLanguageUsage(history) {
    const listEl    = document.getElementById("langUsageList");
    const emptyEl   = document.getElementById("langUsageEmpty");
    if (!listEl) return;

    // Count per language (normalise key to upper)
    const counts = {};
    LANG_CONFIG.forEach(l => { counts[l.key] = 0; });
    history.forEach(r => {
        const k = (r.language || "").toUpperCase();
        if (k in counts) counts[k]++;
    });

    const total = history.length;

    if (total === 0) {
        listEl.innerHTML = "";
        if (emptyEl) emptyEl.style.display = "flex";
        return;
    }
    if (emptyEl) emptyEl.style.display = "none";

    const maxCount = Math.max(...LANG_CONFIG.map(l => counts[l.key]), 1);

    listEl.innerHTML = "";
    LANG_CONFIG.forEach(lang => {
        const count   = counts[lang.key];
        const pct     = (count / maxCount) * 100;
        const sharePct= total > 0 ? ((count / total) * 100).toFixed(0) : 0;

        const row = document.createElement("div");
        row.className = "lang-usage-row";
        row.innerHTML = `
            <div class="lang-usage-label">
                <span class="lang-usage-name">${escapeHTML(lang.label)}</span>
                <span class="lang-usage-count">${count} run${count !== 1 ? "s" : ""}</span>
            </div>
            <div class="lang-usage-bar-track" role="progressbar" aria-valuenow="${count}" aria-valuemin="0" aria-valuemax="${maxCount}" aria-label="${lang.label} usage">
                <div class="lang-usage-bar-fill ${lang.colorClass}" style="width:0%"></div>
            </div>
            <div class="lang-usage-pct">${sharePct}%</div>
        `;
        listEl.appendChild(row);

        // Animate bar
        const barFill = row.querySelector(".lang-usage-bar-fill");
        setTimeout(() => animateWidth(barFill, pct, 700), 80);
    });
}

/* ══════════════════════════════════════════════════════
   RECENT ACTIVITY CARDS
══════════════════════════════════════════════════════ */
function renderRecentActivity(history) {
    const container = document.getElementById("activityCards");
    const emptyEl   = document.getElementById("activityEmpty");
    if (!container) return;

    container.innerHTML = "";

    if (history.length === 0) {
        if (emptyEl) emptyEl.style.display = "flex";
        return;
    }
    if (emptyEl) emptyEl.style.display = "none";

    const recent = history.slice(0, RECENT_COUNT);
    recent.forEach(record => {
        const success = isSuccess(record.status);
        const card = document.createElement("div");
        card.className = "activity-card";
        card.innerHTML = `
            <div class="activity-card-left">
                <div class="activity-lang-dot ${success ? "dot-green" : "dot-red"}" aria-hidden="true"></div>
                <div>
                    <div class="activity-card-lang">${langBadgeHTML(record.language)}</div>
                    <div class="activity-card-program" title="${escapeHTML(record.programName || '')}">${escapeHTML(record.programName || "(untitled)")}</div>
                </div>
            </div>
            <div class="activity-card-right">
                ${statusBadgeHTML(record.status)}
                <div class="activity-card-meta">
                    ${record.executionTime ? `<span>${escapeHTML(record.executionTime)}</span>` : ""}
                    <span>${escapeHTML(formatTimestamp(record.timestamp))}</span>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

/* ══════════════════════════════════════════════════════
   PLATFORM STATUS (backend health check)
   Uses the existing /health endpoint if it exists.
   Fails gracefully — no crash if backend is down.
══════════════════════════════════════════════════════ */
async function checkBackendStatus() {
    const indicator = document.getElementById("backendIndicator");
    const statusEl  = document.getElementById("backendStatus");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);

    try {
        const resp = await fetch(BACKEND_URL, { method: "GET", signal: controller.signal });
        clearTimeout(timer);
        if (resp.ok) {
            if (indicator) { indicator.className = "status-indicator online"; indicator.setAttribute("aria-label", "Connected"); }
            if (statusEl)  { statusEl.textContent = "Connected"; statusEl.className = "status-card-value online-text"; }
        } else {
            throw new Error("Non-OK response");
        }
    } catch (_) {
        if (indicator) { indicator.className = "status-indicator offline"; indicator.setAttribute("aria-label", "Offline"); }
        if (statusEl)  { statusEl.textContent = "Not Running"; statusEl.className = "status-card-value offline-text"; }
    }
}

/* ══════════════════════════════════════════════════════
   MOBILE HAMBURGER NAV
══════════════════════════════════════════════════════ */
function initNav() {
    const hamburger = document.getElementById("navHamburger");
    const navLinks  = document.getElementById("navLinks");
    if (!hamburger || !navLinks) return;

    hamburger.addEventListener("click", () => {
        const isOpen = navLinks.classList.toggle("open");
        hamburger.setAttribute("aria-expanded", String(isOpen));
    });

    navLinks.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", () => {
            navLinks.classList.remove("open");
            hamburger.setAttribute("aria-expanded", "false");
        });
    });
}

/* ══════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════
   AUTH CHECK — runs before rendering anything
   Redirects to login.html if session has expired.
   Updates the nav user name with the real name from Flask.
══════════════════════════════════════════════════════ */
async function checkAuth() {
    try {
        const resp = await fetch(`${AUTH_API_BASE}/api/auth/me`, {
            method: "GET",
            credentials: "include"
        });
        const data = await resp.json();

        if (!data.authenticated) {
            window.location.href = "login.html";
            return false;
        }

        // Update nav profile with the real user name
        const nameEl = document.getElementById("navUserName");
        if (nameEl) nameEl.textContent = data.user.name;

        return true;
    } catch (_) {
        // Backend unreachable — redirect to login for safety
        window.location.href = "login.html";
        return false;
    }
}

/* ══════════════════════════════════════════════════════
   LOGOUT
══════════════════════════════════════════════════════ */
async function logoutUser() {
    const btn = document.getElementById("navLogoutBtn");
    if (btn) btn.disabled = true;
    try {
        await fetch(`${AUTH_API_BASE}/api/auth/logout`, {
            method: "POST",
            credentials: "include"
        });
    } catch (_) { /* ignore — redirect anyway */ }
    window.location.href = "login.html";
}

document.addEventListener("DOMContentLoaded", async () => {
    const authed = await checkAuth();
    if (!authed) return;   // redirecting — stop

    // Fetch this user's history from the SQLite backend
    const history = await getUserHistory();

    initNav();
    renderStats(history);
    renderLanguageUsage(history);
    renderRecentActivity(history);
    checkBackendStatus();

    // Wire logout button
    const logoutBtn = document.getElementById("navLogoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", logoutUser);
});
