/**
 * Online Compiler & Code Execution Platform
 * Frontend JavaScript Application Logic
 */

document.addEventListener("DOMContentLoaded", () => {
    // API Endpoint for Python Flask Backend
    const API_BASE_URL = "http://localhost:5000/api/execute";

    // DOM Elements
    const languageSelect = document.getElementById("languageSelect");
    const codeEditor = document.getElementById("codeEditor");
    const lineNumbers = document.getElementById("lineNumbers");
    const customInput = document.getElementById("customInput");
    const lineCountSpan = document.getElementById("lineCount");
    const charCountSpan = document.getElementById("charCount");

    const runBtn = document.getElementById("runBtn");
    const runBtnText = document.getElementById("runBtnText");
    const runBtnIcon = document.getElementById("runBtnIcon");
    const clearCodeBtn = document.getElementById("clearCodeBtn");
    const resetCodeBtn = document.getElementById("resetCodeBtn");
    const clearOutputBtn = document.getElementById("clearOutputBtn");

    const statusBadge = document.getElementById("statusBadge");
    const executionTimePill = document.getElementById("executionTime");
    const timeValSpan = document.getElementById("timeVal");
    const executionMemoryPill = document.getElementById("executionMemory");
    const memoryValSpan = document.getElementById("memoryVal");

    const placeholderMsg = document.getElementById("placeholderMsg");
    const loaderOverlay = document.getElementById("loaderOverlay");
    const outputContent = document.getElementById("outputContent");

    // Sample code templates
    const SAMPLES = {
        C: `#include <stdio.h>\n\nint main() {\n    printf("Hello, World!");\n    return 0;\n}`,
        CPP: `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!";\n    return 0;\n}`,
        JAVA: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}`,
        PYTHON: `print("Hello, World!")`
    };

    let previousLanguage = languageSelect.value;

    // Initialize editor with default sample code
    codeEditor.value = SAMPLES[previousLanguage] || "";
    updateEditorStatsAndLines();

    // Event Listeners
    languageSelect.addEventListener("change", handleLanguageChange);
    codeEditor.addEventListener("input", updateEditorStatsAndLines);
    codeEditor.addEventListener("scroll", syncLineNumbersScroll);
    codeEditor.addEventListener("keydown", handleEditorTabKey);

    runBtn.addEventListener("click", handleRunCode);
    clearCodeBtn.addEventListener("click", () => {
        codeEditor.value = "";
        updateEditorStatsAndLines();
        codeEditor.focus();
    });

    resetCodeBtn.addEventListener("click", () => {
        const currentLang = languageSelect.value;
        codeEditor.value = SAMPLES[currentLang] || "";
        updateEditorStatsAndLines();
    });

    clearOutputBtn.addEventListener("click", clearOutputSection);

    /**
     * Language Selector Change Handler
     */
    function handleLanguageChange() {
        const newLang = languageSelect.value;
        const currentCode = codeEditor.value.trim();
        const prevSample = (SAMPLES[previousLanguage] || "").trim();

        // Overwrite only if editor is empty or matches the previous sample program
        if (currentCode === "" || currentCode === prevSample) {
            codeEditor.value = SAMPLES[newLang] || "";
            updateEditorStatsAndLines();
        }

        previousLanguage = newLang;
    }

    /**
     * Update Line Numbers Gutter and Stats
     */
    function updateEditorStatsAndLines() {
        const text = codeEditor.value;
        const lines = text.split("\n");
        const count = lines.length;

        // Render line numbers
        let lineNumsHTML = "";
        for (let i = 1; i <= count; i++) {
            lineNumsHTML += i + "\n";
        }
        lineNumbers.textContent = lineNumsHTML;

        // Update stats
        lineCountSpan.textContent = `Lines: ${count}`;
        charCountSpan.textContent = `Chars: ${text.length}`;

        syncLineNumbersScroll();
    }

    /**
     * Synchronize Scroll between Editor and Line Numbers Gutter
     */
    function syncLineNumbersScroll() {
        lineNumbers.scrollTop = codeEditor.scrollTop;
    }

    /**
     * Handle Tab key in Editor (inserts 4 spaces)
     */
    function handleEditorTabKey(e) {
        if (e.key === "Tab") {
            e.preventDefault();
            const start = codeEditor.selectionStart;
            const end = codeEditor.selectionEnd;

            codeEditor.value = codeEditor.value.substring(0, start) + "    " + codeEditor.value.substring(end);
            codeEditor.selectionStart = codeEditor.selectionEnd = start + 4;
            updateEditorStatsAndLines();
        }
    }

    /**
     * Run Code Execution Handler
     */
    async function handleRunCode() {
        const sourceCode = codeEditor.value;
        const language = languageSelect.value;
        const stdin = customInput.value;

        // Validation
        if (!sourceCode || sourceCode.trim() === "") {
            setStatus("Ready", "status-ready");
            showOutputError("Please enter some code before running.");
            return;
        }

        // Set Loading State
        setLoadingState(true);

        const payload = {
            language: language,
            sourceCode: sourceCode,
            stdin: stdin
        };

        try {
            const response = await fetch(API_BASE_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => null);
                const msg = (errData && errData.message) ? errData.message : `HTTP Error ${response.status}: ${response.statusText}`;
                throw new Error(msg);
            }

            const data = await response.json();
            renderExecutionResult(data);

        } catch (error) {
            console.error("Execution Request Failed:", error);
            setStatus("Error", "status-error");
            
            let userMsg = "Unable to connect to backend server at http://localhost:5000.\n\n" +
                          "Possible causes:\n" +
                          "1. Python Flask backend is not running yet (Run: 'python app.py' inside /backend).\n" +
                          "2. Backend CORS restriction or server port conflict.\n\n" +
                          "Details: " + error.message;
            
            showOutputError(userMsg);
        } finally {
            setLoadingState(false);
        }
    }

    /**
     * Render Output and Metadata
     */
    function renderExecutionResult(result) {
        // Status Badges
        const status = result.status || "Completed";
        mapAndSetStatus(status);

        // Metrics Display
        if (result.executionTime !== null && result.executionTime !== undefined && result.executionTime !== "") {
            timeValSpan.textContent = formatTime(result.executionTime);
            executionTimePill.style.display = "inline-flex";
        } else {
            executionTimePill.style.display = "none";
        }

        if (result.memory !== null && result.memory !== undefined && result.memory > 0) {
            memoryValSpan.textContent = formatMemory(result.memory);
            executionMemoryPill.style.display = "inline-flex";
        } else {
            executionMemoryPill.style.display = "none";
        }

        // Output Content
        placeholderMsg.style.display = "none";
        outputContent.style.display = "block";
        outputContent.innerHTML = "";

        let hasOutput = false;

        // 1. Stdout Output
        if (result.stdout && result.stdout.trim() !== "") {
            const stdoutSpan = document.createElement("span");
            stdoutSpan.className = "out-stdout";
            stdoutSpan.textContent = result.stdout;
            outputContent.appendChild(stdoutSpan);
            hasOutput = true;
        }

        // 2. Compilation Errors
        if (result.compileOutput && result.compileOutput.trim() !== "") {
            if (hasOutput) outputContent.appendChild(document.createTextNode("\n-- Compilation Log --\n"));
            const compileSpan = document.createElement("span");
            compileSpan.className = "out-compile";
            compileSpan.textContent = result.compileOutput;
            outputContent.appendChild(compileSpan);
            hasOutput = true;
        }

        // 3. Stderr / Runtime Errors
        if (result.stderr && result.stderr.trim() !== "") {
            if (hasOutput) outputContent.appendChild(document.createTextNode("\n-- Error Log --\n"));
            const stderrSpan = document.createElement("span");
            stderrSpan.className = "out-stderr";
            stderrSpan.textContent = result.stderr;
            outputContent.appendChild(stderrSpan);
            hasOutput = true;
        }

        // 4. Message / Fallback
        if (!hasOutput) {
            if (result.message && result.message.trim() !== "") {
                outputContent.textContent = result.message;
            } else {
                outputContent.textContent = "Program executed successfully with no output returned.";
            }
        }
    }

    /**
     * Display Single Error Output
     */
    function showOutputError(msg) {
        placeholderMsg.style.display = "none";
        outputContent.style.display = "block";
        outputContent.innerHTML = "";
        
        const errSpan = document.createElement("span");
        errSpan.className = "out-stderr";
        errSpan.textContent = msg;
        outputContent.appendChild(errSpan);

        executionTimePill.style.display = "none";
        executionMemoryPill.style.display = "none";
    }

    /**
     * Map Status String to CSS Classes
     */
    function mapAndSetStatus(statusStr) {
        const s = statusStr.toLowerCase();
        if (s.includes("accept") || s.includes("complete")) {
            setStatus("Accepted", "status-accepted");
        } else if (s.includes("compile") || s.includes("compilation")) {
            setStatus("Compilation Error", "status-compile-error");
        } else if (s.includes("time limit") || s.includes("tle")) {
            setStatus("Time Limit Exceeded", "status-tle");
        } else if (s.includes("runtime")) {
            setStatus("Runtime Error", "status-runtime-error");
        } else if (s.includes("running")) {
            setStatus("Running...", "status-running");
        } else {
            setStatus(statusStr, "status-error");
        }
    }

    /**
     * Set Status Badge Text & Style
     */
    function setStatus(text, cssClass) {
        statusBadge.textContent = text;
        statusBadge.className = `status-badge ${cssClass}`;
    }

    /**
     * Loading UI Toggle
     */
    function setLoadingState(isLoading) {
        if (isLoading) {
            runBtn.disabled = true;
            runBtnText.textContent = "Running...";
            setStatus("Running...", "status-running");
            placeholderMsg.style.display = "none";
            outputContent.style.display = "none";
            loaderOverlay.style.display = "flex";
        } else {
            runBtn.disabled = false;
            runBtnText.textContent = "Run Code";
            loaderOverlay.style.display = "none";
        }
    }

    /**
     * Clear Output Handler
     */
    function clearOutputSection() {
        outputContent.innerHTML = "";
        outputContent.style.display = "none";
        placeholderMsg.style.display = "flex";
        executionTimePill.style.display = "none";
        executionMemoryPill.style.display = "none";
        setStatus("Ready", "status-ready");
    }

    /**
     * Helpers for Time and Memory Formatting
     */
    function formatTime(timeVal) {
        const num = parseFloat(timeVal);
        if (isNaN(num)) return timeVal + "s";
        return num.toFixed(3) + "s";
    }

    function formatMemory(bytes) {
        const kb = bytes / 1024;
        if (kb > 1024) {
            return (kb / 1024).toFixed(2) + " MB";
        }
        return kb.toFixed(1) + " KB";
    }
});
