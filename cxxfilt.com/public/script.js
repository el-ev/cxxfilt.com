import init, { batch_demangle } from './wasm/demangle.js';

// Elements
const mangledInput = document.getElementById('mangled-input');
const demangledOutput = document.getElementById('demangled-output');
const demangleBtn = document.getElementById('demangle-btn');
const clearBtn = document.getElementById('clear-btn');
const exampleBtn = document.getElementById('example-btn');
const copyBtn = document.getElementById('copy-btn');
const statusDiv = document.getElementById('status');
const themeToggle = document.getElementById('theme-toggle');

// State
let wasmInitialized = false;

// Helpers
function setStatus(msg, type = 'info') {
    statusDiv.textContent = msg;
    statusDiv.className = `status ${type}`;
}

// Theme Logic
function initTheme() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
    const icon = themeToggle.querySelector('.theme-icon');
    if(icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
});

// Main
async function initialize() {
    try {
        setStatus('Loading WASM...', 'info');
        await init();
        wasmInitialized = true;
        setStatus('Ready', 'success');
    } catch (e) {
        console.error(e);
        setStatus('Failed to load WASM', 'error');
    }
}

// Event Listeners
demangleBtn.addEventListener('click', () => {
    if (!wasmInitialized) {
        setStatus('WASM not loaded yet', 'error');
        return;
    }
    const text = mangledInput.value;
    if (!text.trim()) return;

    // Split by newlines
    const lines = text.split('\n');
    // Using batch_demangle from WASM
    // Note: rust strings are passed as normal JS strings (utf-8)
    try {
        const result = batch_demangle(lines);
        demangledOutput.value = result.join('\n');
        setStatus('Demangled successfully', 'success');
    } catch (e) {
        console.error(e);
        setStatus('Error during demangling', 'error');
    }
});

clearBtn.addEventListener('click', () => {
    mangledInput.value = '';
    demangledOutput.value = '';
    setStatus('Ready', 'success');
});

exampleBtn.addEventListener('click', () => {
    const examples = [
        '_Z3fooi',
        '_ZN3std6vectorIiSaIiEE9push_backERKi',
        '_ZNK6MyBaseD2Ev',
        '_RNvMsr_NtCs3ssYzQotkvD_3std4pathNtB5_7PathBuf3newCs15kBYyAo9fc_7mycrate',
        '?func@@YAHH@Z' // MSVC example
    ];
    mangledInput.value = examples.join('\n');
    setStatus('Examples loaded', 'success');
});

copyBtn.addEventListener('click', () => {
    if (demangledOutput.value) {
        navigator.clipboard.writeText(demangledOutput.value).then(() => {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✅';
            setTimeout(() => copyBtn.textContent = originalText, 1500);
        });
    }
});

// Start
initTheme();
initialize();
