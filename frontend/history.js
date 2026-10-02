/**
 * CodeForge – History Page JavaScript (v2 — SQLite backend)
 *
 * Fetches the current user's execution history from:
 *   GET  /api/history   (credentials: 'include')
 *
 * Renders:
 *  - Stats bar (total, accepted, errors, rate)
 *  - Paginated history table (10 records per page)
 *  - Clear History button → DELETE /api/history
 *  - Mobile hamburger navigation
 *
 * localStorage is no longer used for history storage.
 * Every user sees ONLY their own executions — isolation is
 * enforced server-side by the Flask session.
 */

'use strict';

// Use a page-local variable name to avoid redeclaration conflict with auth-guard.js
// (both scripts share the global scope — 'const' cannot be declared twice)
const HIST_API_BASE = 'http://localhost:5000';
const PAGE_SIZE     = 10;
let currentPage     = 1;
let allRecords      = [];

// ── Utility: Escape HTML ──────────────────────────────────────────
function escapeHTML(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
}

// ── Utility: Language display name ────────────────────────────────
function langDisplay(lang) {
    const map = { C: 'C', CPP: 'C++', JAVA: 'Java', PYTHON: 'Python' };
    return map[(lang || '').toUpperCase()] || lang;
}

// ── Utility: Status badge ─────────────────────────────────────────
function statusBadgeHTML(status) {
    const s = (status || '').toLowerCase();
    let cls = 'status-error';
    if      (s === 'accepted')            cls = 'status-accepted';
    else if (s === 'compilation error')   cls = 'status-compile-error';
    else if (s === 'runtime error')       cls = 'status-runtime-error';
    else if (s === 'time limit exceeded') cls = 'status-tle';
    return `<span class="status-badge ${cls}">${escapeHTML(status || 'Unknown')}</span>`;
}

// ── Utility: Format ISO timestamp ─────────────────────────────────
function formatTimestamp(isoStr) {
    if (!isoStr) return '—';
    try {
        const d = new Date(isoStr);
        return d.toLocaleString(undefined, {
            month:  'short',
            day:    'numeric',
            year:   'numeric',
            hour:   '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return isoStr;
    }
}

// ── Render stats bar ──────────────────────────────────────────────
function renderStats(records) {
    const total    = records.length;
    const accepted = records.filter(r => (r.status || '').toLowerCase() === 'accepted').length;
    const errors   = total - accepted;
    const rate     = total > 0 ? Math.round((accepted / total) * 100) : 0;

    const el = id => document.getElementById(id);
    if (el('hStatTotal'))    el('hStatTotal').textContent    = total;
    if (el('hStatAccepted')) el('hStatAccepted').textContent = accepted;
    if (el('hStatErrors'))   el('hStatErrors').textContent   = errors;
    if (el('hStatRate'))     el('hStatRate').textContent     = rate + '%';
}

// ── Render table page ─────────────────────────────────────────────
function renderPage(records, page) {
    const tbody      = document.getElementById('historyTableBody');
    const emptyMsg   = document.getElementById('historyEmpty');
    const pagination = document.getElementById('paginationBar');
    const pageInfo   = document.getElementById('pageInfo');

    if (!tbody) return;
    tbody.innerHTML = '';

    if (records.length === 0) {
        if (emptyMsg)   emptyMsg.style.display   = 'flex';
        if (pagination) pagination.style.display = 'none';
        return;
    }

    if (emptyMsg) emptyMsg.style.display = 'none';

    const totalPages = Math.ceil(records.length / PAGE_SIZE);
    page = Math.max(1, Math.min(page, totalPages));

    const start = (page - 1) * PAGE_SIZE;
    const end   = Math.min(start + PAGE_SIZE, records.length);
    const slice = records.slice(start, end);

    slice.forEach((record, idx) => {
        const globalIdx = records.length - start - idx; // descending row number
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="td-num">${globalIdx}</td>
            <td><span class="lang-badge">${escapeHTML(langDisplay(record.language))}</span></td>
            <td class="td-program" title="${escapeHTML(record.programName || '')}">${escapeHTML(record.programName || '(untitled)')}</td>
            <td>${statusBadgeHTML(record.status)}</td>
            <td>${escapeHTML(record.executionTime || '—')}</td>
            <td>${escapeHTML(formatTimestamp(record.timestamp))}</td>
        `;
        tbody.appendChild(tr);
    });

    // Pagination controls
    if (totalPages > 1) {
        if (pagination) pagination.style.display = 'flex';
        if (pageInfo)   pageInfo.textContent = `Page ${page} of ${totalPages}`;
        updatePageBtn('pageFirst', page <= 1);
        updatePageBtn('pagePrev',  page <= 1);
        updatePageBtn('pageNext',  page >= totalPages);
        updatePageBtn('pageLast',  page >= totalPages);
    } else {
        if (pagination) pagination.style.display = 'none';
    }
}

function updatePageBtn(id, disabled) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = disabled;
    if (disabled) btn.setAttribute('aria-disabled', 'true');
    else          btn.removeAttribute('aria-disabled');
}

// ── Show loading state in table ───────────────────────────────────
function showTableLoading() {
    const tbody  = document.getElementById('historyTableBody');
    const emptyMsg = document.getElementById('historyEmpty');
    if (tbody) {
        tbody.innerHTML = `
            <tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">
                Loading your history…
            </td></tr>`;
    }
    if (emptyMsg) emptyMsg.style.display = 'none';
}

// ── Show inline error in table ────────────────────────────────────
function showTableError(msg) {
    const tbody = document.getElementById('historyTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr><td colspan="6" style="text-align:center;padding:2rem;color:#ffa198;">
                ${escapeHTML(msg)}
            </td></tr>`;
    }
}

// ── Fetch history from /api/history ──────────────────────────────
async function loadHistory() {
    showTableLoading();
    try {
        const resp = await fetch(`${HIST_API_BASE}/api/history`, {
            method:      'GET',
            credentials: 'include'
        });

        if (resp.status === 401) {
            // Session expired — send back to login
            window.location.replace('login.html');
            return;
        }

        if (!resp.ok) {
            showTableError('Failed to load history. Please try again.');
            return;
        }

        const data = await resp.json();
        allRecords  = data.records || [];
        currentPage = 1;

        renderStats(allRecords);
        renderPage(allRecords, currentPage);

    } catch (_) {
        showTableError('Cannot connect to server. Is Flask running on port 5000?');
    }
}

// ── Pagination controls ───────────────────────────────────────────
function initPagination() {
    const totalPages = () => Math.ceil(allRecords.length / PAGE_SIZE);

    const go = (page) => {
        currentPage = page;
        renderPage(allRecords, currentPage);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    document.getElementById('pageFirst')?.addEventListener('click', () => go(1));
    document.getElementById('pageLast' )?.addEventListener('click', () => go(totalPages()));
    document.getElementById('pagePrev' )?.addEventListener('click', () => {
        if (currentPage > 1) go(currentPage - 1);
    });
    document.getElementById('pageNext' )?.addEventListener('click', () => {
        if (currentPage < totalPages()) go(currentPage + 1);
    });
}

// ── Clear History — calls DELETE /api/history ─────────────────────
function initClearHistory() {
    const overlay   = document.getElementById('confirmOverlay');
    const clearBtn  = document.getElementById('clearHistoryBtn');
    const cancelBtn = document.getElementById('confirmCancel');
    const okBtn     = document.getElementById('confirmOk');

    if (!clearBtn || !overlay) return;

    clearBtn.addEventListener('click', () => {
        overlay.classList.add('open');
        setTimeout(() => cancelBtn?.focus(), 50);
    });

    cancelBtn?.addEventListener('click', () => {
        overlay.classList.remove('open');
        clearBtn.focus();
    });

    okBtn?.addEventListener('click', async () => {
        overlay.classList.remove('open');
        okBtn.disabled = true;

        try {
            const resp = await fetch(`${HIST_API_BASE}/api/history`, {
                method:      'DELETE',
                credentials: 'include'
            });

            if (resp.ok) {
                // Update UI immediately without another network round-trip
                allRecords  = [];
                currentPage = 1;
                renderStats(allRecords);
                renderPage(allRecords, currentPage);
            } else {
                showTableError('Failed to clear history. Please try again.');
            }
        } catch (_) {
            showTableError('Cannot connect to server.');
        } finally {
            okBtn.disabled = false;
            clearBtn.focus();
        }
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('open');
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('open')) {
            overlay.classList.remove('open');
            clearBtn.focus();
        }
    });
}

// ── Mobile Hamburger Navigation ────────────────────────────────────
function initNav() {
    const hamburger = document.getElementById('navHamburger');
    const navLinks  = document.getElementById('navLinks');
    if (!hamburger || !navLinks) return;

    hamburger.addEventListener('click', () => {
        const isOpen = navLinks.classList.toggle('open');
        hamburger.setAttribute('aria-expanded', String(isOpen));
    });

    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('open');
            hamburger.setAttribute('aria-expanded', 'false');
        });
    });
}

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initNav();
    initPagination();
    initClearHistory();
    loadHistory();   // auth-guard.js handles the /api/auth/me check first
});
