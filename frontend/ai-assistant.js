/**
 * ai-assistant.js -- CodeForge AI Assistant Page Logic
 *
 * Security rules:
 *  - No API keys in frontend code.
 *  - All fetch calls use credentials: 'include' for Flask session auth.
 *  - AI responses rendered via safe DOM construction (textContent / createElement).
 *  - Compiler context loaded from sessionStorage (same-origin, cleared after use).
 *  - Suggested code can only be applied to the compiler via explicit user action.
 *  - Chat history lives in the current page session only (not persisted to localStorage).
 */

'use strict';

const AI_API_BASE  = 'http://localhost:5000';
const AI_ENDPOINT  = AI_API_BASE + '/api/ai/chat';
const COMPILER_URL = 'compiler.html';

// Context loaded from compiler (via sessionStorage)
let _compilerCtx = null;

// Last AI-suggested code block (for optional Apply Fix feature)
let _lastSuggestedCode = null;
let _lastSuggestedLang = null;

// ── DOM refs ──────────────────────────────────────────────────────────
let _messagesEl, _inputEl, _sendBtn, _sendText, _charCount, _modeSelect;
let _clearChatBtn, _contextBanner, _contextLabel, _clearContextBtn;
let _applyFixCard, _applyFixBtn, _contextCardBody, _aiStatusDot;

document.addEventListener('DOMContentLoaded', function () {
    _messagesEl    = document.getElementById('aiMessages');
    _inputEl       = document.getElementById('aiInput');
    _sendBtn       = document.getElementById('aiSendBtn');
    _sendText      = document.getElementById('aiSendText');
    _charCount     = document.getElementById('aiCharCount');
    _modeSelect    = document.getElementById('aiModeSelect');
    _clearChatBtn  = document.getElementById('clearChatBtn');
    _contextBanner = document.getElementById('aiContextBanner');
    _contextLabel  = document.getElementById('aiContextLabel');
    _clearContextBtn = document.getElementById('clearContextBtn');
    _applyFixCard  = document.getElementById('applyFixCard');
    _applyFixBtn   = document.getElementById('applyFixBtn');
    _contextCardBody = document.getElementById('contextCardBody');
    _aiStatusDot   = document.getElementById('aiStatusDot');

    // Hamburger nav
    var hamburger = document.getElementById('navHamburger');
    var navLinks  = document.getElementById('navLinks');
    if (hamburger && navLinks) {
        hamburger.addEventListener('click', function () {
            var isOpen = navLinks.classList.toggle('open');
            hamburger.setAttribute('aria-expanded', String(isOpen));
        });
    }

    // Load compiler context from sessionStorage (safe, same-origin)
    _loadCompilerContext();

    // Event listeners
    _inputEl.addEventListener('input', _onInputChange);
    _inputEl.addEventListener('keydown', _onInputKeydown);
    _sendBtn.addEventListener('click', _sendMessage);
    _clearChatBtn.addEventListener('click', _clearChat);
    _clearContextBtn.addEventListener('click', _clearContext);
    _applyFixBtn.addEventListener('click', _applyFix);

    // Quick action buttons
    document.querySelectorAll('.ai-quick-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var mode = btn.getAttribute('data-mode') || 'chat';
            _triggerQuickAction(mode);
        });
    });

    // Auth guard updates the nav user name via .nav-user-name class
    _setStatusReady();
});

// ─────────────────────────────────────────────────────────────────────
// Compiler Context
// ─────────────────────────────────────────────────────────────────────

function _loadCompilerContext() {
    try {
        var raw = sessionStorage.getItem('codeforge_ai_ctx');
        if (!raw) return;
        var ctx = JSON.parse(raw);
        // Validate structure
        if (typeof ctx !== 'object' || ctx === null) return;
        _compilerCtx = {
            language:        String(ctx.language        || '').slice(0, 20),
            code:            String(ctx.code            || '').slice(0, 8000),
            stdin:           String(ctx.stdin           || '').slice(0, 1000),
            compiler_output: String(ctx.compiler_output || '').slice(0, 3000),
        };
        // Consume the context (one-time use)
        sessionStorage.removeItem('codeforge_ai_ctx');
        _showContextBanner();
        _renderContextCard();
    } catch (e) {
        // Malformed data — ignore
        sessionStorage.removeItem('codeforge_ai_ctx');
    }
}

function _showContextBanner() {
    if (!_compilerCtx) return;
    var lang = _compilerCtx.language || 'Unknown';
    _contextLabel.textContent = 'Compiler context loaded: ' + lang;
    _contextBanner.style.display = 'flex';
}

function _renderContextCard() {
    if (!_compilerCtx || !_contextCardBody) return;
    _contextCardBody.innerHTML = '';

    function addRow(label, value) {
        if (!value || !value.trim()) return;
        var row = document.createElement('div');
        row.className = 'ai-ctx-row';
        var labelEl = document.createElement('span');
        labelEl.className = 'ai-ctx-label';
        labelEl.textContent = label;
        var valueEl = document.createElement('code');
        valueEl.className = 'ai-ctx-value';
        valueEl.textContent = value.length > 120 ? value.slice(0, 120) + '...' : value;
        row.appendChild(labelEl);
        row.appendChild(valueEl);
        _contextCardBody.appendChild(row);
    }

    addRow('Language', _compilerCtx.language);
    var codePreview = _compilerCtx.code ? _compilerCtx.code.trim().split('\n').slice(0, 3).join('\n') : '';
    addRow('Code (preview)', codePreview);
    addRow('Stdin', _compilerCtx.stdin);
    addRow('Output (preview)', _compilerCtx.compiler_output ? _compilerCtx.compiler_output.slice(0, 100) : '');

    if (_contextCardBody.children.length === 0) {
        var p = document.createElement('p');
        p.className = 'ai-sidebar-empty';
        p.textContent = 'Context loaded but empty.';
        _contextCardBody.appendChild(p);
    }
}

function _clearContext() {
    _compilerCtx = null;
    _contextBanner.style.display = 'none';
    _contextCardBody.innerHTML = '<p class="ai-sidebar-empty">No compiler context loaded.</p>';
}

// ─────────────────────────────────────────────────────────────────────
// Quick Actions
// ─────────────────────────────────────────────────────────────────────

var _QUICK_PROMPTS = {
    explain:  'Please explain this code step by step.',
    debug:    'Please identify the bugs or errors in this code based on the compiler output.',
    fix:      'Please provide a corrected version of this code with an explanation of what was changed.',
    concept:  'Please explain the main programming concept used in this code.',
    optimize: 'Please suggest improvements to make this code more efficient and readable.',
};

var _QUICK_PROMPTS_NO_CODE = {
    explain:  'Please explain how programming works.',
    debug:    'Please help me understand common debugging techniques.',
    fix:      'Please explain how to fix common programming errors.',
    concept:  'Please explain a fundamental programming concept.',
    optimize: 'Please explain code optimization techniques.',
};

function _triggerQuickAction(mode) {
    _modeSelect.value = mode;
    var prompt = _compilerCtx && _compilerCtx.code
        ? _QUICK_PROMPTS[mode]
        : _QUICK_PROMPTS_NO_CODE[mode];
    _inputEl.value = prompt || '';
    _onInputChange();
    _sendMessage();
}

// ─────────────────────────────────────────────────────────────────────
// Input handling
// ─────────────────────────────────────────────────────────────────────

function _onInputChange() {
    var len = _inputEl.value.length;
    _charCount.textContent = len + ' / 2000';
    if (len > 1800) {
        _charCount.style.color = '#ffa198';
    } else {
        _charCount.style.color = '';
    }
}

function _onInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        _sendMessage();
    }
}

// ─────────────────────────────────────────────────────────────────────
// Send message
// ─────────────────────────────────────────────────────────────────────

async function _sendMessage() {
    var question = _inputEl.value.trim();
    if (!question) return;
    if (question.length > 2000) {
        _appendErrorMsg('Your message is too long (max 2000 characters).');
        return;
    }

    var mode = _modeSelect.value || 'chat';

    // Append user bubble
    _appendUserMsg(question);
    _inputEl.value = '';
    _onInputChange();

    // Show loading
    _setLoading(true);
    var thinkingId = _appendThinking();

    // Build request payload
    var payload = { question: question, mode: mode };
    if (_compilerCtx) {
        if (_compilerCtx.language)        payload.language        = _compilerCtx.language;
        if (_compilerCtx.code)            payload.code            = _compilerCtx.code;
        if (_compilerCtx.stdin)           payload.stdin           = _compilerCtx.stdin;
        if (_compilerCtx.compiler_output) payload.compiler_output = _compilerCtx.compiler_output;
    }

    try {
        var resp = await fetch(AI_ENDPOINT, {
            method:      'POST',
            headers:     { 'Content-Type': 'application/json' },
            credentials: 'include',
            body:        JSON.stringify(payload),
        });

        _removeThinking(thinkingId);

        if (resp.status === 401) {
            _appendErrorMsg('Your session has expired. Please log in again.');
            setTimeout(function () { window.location.href = 'login.html'; }, 2000);
            return;
        }

        if (resp.status === 429) {
            _appendErrorMsg('You have reached the AI request limit for this session. Please log out and back in to continue.');
            return;
        }

        var data = await resp.json().catch(function () { return null; });

        if (!data) {
            _appendErrorMsg('Received an unexpected response from the server. Please try again.');
            return;
        }

        if (data.success && data.reply) {
            _appendAssistantMsg(data.reply, mode);
        } else {
            _appendErrorMsg(data.error || 'The AI returned an unexpected response. Please try again.');
        }

    } catch (err) {
        _removeThinking(thinkingId);
        if (err && err.message && err.message.includes('Failed to fetch')) {
            _appendErrorMsg('Cannot connect to the backend server. Please ensure it is running at http://localhost:5000.');
        } else {
            _appendErrorMsg('Something went wrong. Please try again.');
        }
    } finally {
        _setLoading(false);
    }
}

// ─────────────────────────────────────────────────────────────────────
// Message rendering (safe DOM construction — no innerHTML for AI text)
// ─────────────────────────────────────────────────────────────────────

function _appendUserMsg(text) {
    var wrapper = document.createElement('div');
    wrapper.className = 'ai-message ai-message--user';

    var content = document.createElement('div');
    content.className = 'ai-message-content';

    var bubble = document.createElement('div');
    bubble.className = 'ai-message-bubble';
    var p = document.createElement('p');
    p.textContent = text;
    bubble.appendChild(p);

    var timeEl = document.createElement('span');
    timeEl.className = 'ai-message-time';
    timeEl.textContent = 'You';

    content.appendChild(bubble);
    content.appendChild(timeEl);
    wrapper.appendChild(content);
    _messagesEl.appendChild(wrapper);
    _scrollToBottom();
}

function _appendThinking() {
    var id = 'thinking-' + Date.now();
    var wrapper = document.createElement('div');
    wrapper.className = 'ai-message ai-message--assistant ai-message--thinking';
    wrapper.id = id;

    var avatarEl = document.createElement('div');
    avatarEl.className = 'ai-message-avatar';
    avatarEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"></path><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>';

    var content = document.createElement('div');
    content.className = 'ai-message-content';

    var bubble = document.createElement('div');
    bubble.className = 'ai-message-bubble ai-thinking-bubble';

    var dots = document.createElement('div');
    dots.className = 'ai-thinking-dots';
    dots.innerHTML = '<span></span><span></span><span></span>';
    bubble.appendChild(dots);
    content.appendChild(bubble);
    wrapper.appendChild(avatarEl);
    wrapper.appendChild(content);
    _messagesEl.appendChild(wrapper);
    _scrollToBottom();
    return id;
}

function _removeThinking(id) {
    var el = document.getElementById(id);
    if (el) el.remove();
}

/**
 * Render AI response safely.
 * Parses markdown-style code blocks (`...`) and renders them as <pre><code>,
 * everything else is rendered as plain text paragraphs.
 * NO innerHTML is used for untrusted AI text.
 */
function _appendAssistantMsg(text, mode) {
    _lastSuggestedCode = null;
    _lastSuggestedLang = null;

    var wrapper = document.createElement('div');
    wrapper.className = 'ai-message ai-message--assistant';

    var avatarEl = document.createElement('div');
    avatarEl.className = 'ai-message-avatar';
    avatarEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"></path><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>';

    var content = document.createElement('div');
    content.className = 'ai-message-content';

    var bubble = document.createElement('div');
    bubble.className = 'ai-message-bubble';

    // Parse into segments: text | code block
    var segments = _parseAIResponse(text);
    segments.forEach(function (seg) {
        if (seg.type === 'code') {
            var pre = document.createElement('pre');
            pre.className = 'ai-code-block';
            if (seg.lang) {
                var langLabel = document.createElement('div');
                langLabel.className = 'ai-code-lang';
                langLabel.textContent = seg.lang;
                pre.appendChild(langLabel);
            }
            var copyBtn = document.createElement('button');
            copyBtn.className = 'ai-code-copy';
            copyBtn.textContent = 'Copy';
            copyBtn.setAttribute('aria-label', 'Copy code to clipboard');
            var codeText = seg.text;
            copyBtn.addEventListener('click', function () {
                navigator.clipboard.writeText(codeText).then(function () {
                    copyBtn.textContent = 'Copied!';
                    setTimeout(function () { copyBtn.textContent = 'Copy'; }, 2000);
                }).catch(function () { copyBtn.textContent = 'Copy'; });
            });
            var code = document.createElement('code');
            code.textContent = codeText;
            pre.appendChild(copyBtn);
            pre.appendChild(code);
            bubble.appendChild(pre);

            // Track last code block for Apply Fix feature
            if (mode === 'fix' || mode === 'debug') {
                _lastSuggestedCode = codeText;
                _lastSuggestedLang = seg.lang || (_compilerCtx && _compilerCtx.language) || null;
            }
        } else {
            // Plain text — split into paragraphs
            var paras = seg.text.split('\n\n');
            paras.forEach(function (para) {
                var trimmed = para.trim();
                if (!trimmed) return;

                // Check if it's a list (lines starting with - or *)
                var lines = trimmed.split('\n');
                var isList = lines.length > 1 && lines.every(function (l) {
                    return /^[\-\*\d]/.test(l.trim());
                });

                if (isList) {
                    var ul = document.createElement('ul');
                    ul.className = 'ai-response-list';
                    lines.forEach(function (line) {
                        var li = document.createElement('li');
                        li.textContent = line.replace(/^[\-\*\d\.\)]+\s*/, '');
                        ul.appendChild(li);
                    });
                    bubble.appendChild(ul);
                } else {
                    // Inline line breaks
                    var p = document.createElement('p');
                    var lineArr = trimmed.split('\n');
                    lineArr.forEach(function (line, i) {
                        // Bold text between **
                        var parts = line.split(/\*\*(.*?)\*\*/g);
                        parts.forEach(function (part, idx) {
                            if (idx % 2 === 1) {
                                var b = document.createElement('strong');
                                b.textContent = part;
                                p.appendChild(b);
                            } else if (part) {
                                p.appendChild(document.createTextNode(part));
                            }
                        });
                        if (i < lineArr.length - 1) {
                            p.appendChild(document.createElement('br'));
                        }
                    });
                    bubble.appendChild(p);
                }
            });
        }
    });

    var timeEl = document.createElement('span');
    timeEl.className = 'ai-message-time';
    timeEl.textContent = 'CodeForge AI';

    content.appendChild(bubble);
    content.appendChild(timeEl);
    wrapper.appendChild(avatarEl);
    wrapper.appendChild(content);
    _messagesEl.appendChild(wrapper);
    _scrollToBottom();

    // Show Apply Fix card if a code fix was found
    if (_lastSuggestedCode && (mode === 'fix' || mode === 'debug') && _compilerCtx) {
        _applyFixCard.style.display = 'block';
    }
}

function _appendErrorMsg(text) {
    var wrapper = document.createElement('div');
    wrapper.className = 'ai-message ai-message--error';

    var content = document.createElement('div');
    content.className = 'ai-message-content';

    var bubble = document.createElement('div');
    bubble.className = 'ai-message-bubble ai-error-bubble';
    var p = document.createElement('p');

    var icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '⚠️ ';
    p.appendChild(icon);
    p.appendChild(document.createTextNode(text));
    bubble.appendChild(p);

    var timeEl = document.createElement('span');
    timeEl.className = 'ai-message-time';
    timeEl.textContent = 'System';

    content.appendChild(bubble);
    content.appendChild(timeEl);
    wrapper.appendChild(content);
    _messagesEl.appendChild(wrapper);
    _scrollToBottom();
}

// ─────────────────────────────────────────────────────────────────────
// AI Response Parser (safe, no innerHTML for AI content)
// ─────────────────────────────────────────────────────────────────────

function _parseAIResponse(text) {
    var segments = [];
    var codeBlockRe = /`(\w*)\n?([\s\S]*?)`/g;
    var lastIndex = 0;
    var match;

    while ((match = codeBlockRe.exec(text)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ type: 'text', text: text.slice(lastIndex, match.index) });
        }
        segments.push({ type: 'code', lang: match[1] || '', text: match[2] });
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        segments.push({ type: 'text', text: text.slice(lastIndex) });
    }

    return segments;
}

// ─────────────────────────────────────────────────────────────────────
// Apply Fix (optional, explicit user action)
// ─────────────────────────────────────────────────────────────────────

function _applyFix() {
    if (!_lastSuggestedCode) return;

    // Store in sessionStorage for compiler.html to pick up
    try {
        var lang = _lastSuggestedLang || (_compilerCtx && _compilerCtx.language) || '';
        sessionStorage.setItem('codeforge_apply_fix', JSON.stringify({
            code:     _lastSuggestedCode,
            language: lang,
        }));
        window.location.href = COMPILER_URL;
    } catch (e) {
        _appendErrorMsg('Could not pass the fix to the compiler. Please copy the code manually.');
    }
}

// ─────────────────────────────────────────────────────────────────────
// Clear chat
// ─────────────────────────────────────────────────────────────────────

function _clearChat() {
    // Remove all messages except the welcome message
    var msgs = _messagesEl.querySelectorAll('.ai-message:not(#welcomeMsg)');
    msgs.forEach(function (el) { el.remove(); });
    _lastSuggestedCode = null;
    _applyFixCard.style.display = 'none';
}

// ─────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────

function _setLoading(isLoading) {
    _sendBtn.disabled  = isLoading;
    _inputEl.disabled  = isLoading;
    if (isLoading) {
        _sendText.textContent = 'Thinking...';
        _aiStatusDot.className = 'ai-status-dot ai-status-dot--thinking';
    } else {
        _sendText.textContent = 'Send';
        _setStatusReady();
    }
}

function _setStatusReady() {
    if (_aiStatusDot) {
        _aiStatusDot.className = 'ai-status-dot ai-status-dot--ready';
        _aiStatusDot.title = 'AI ready';
    }
}

function _scrollToBottom() {
    _messagesEl.scrollTop = _messagesEl.scrollHeight;
}
