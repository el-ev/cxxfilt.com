function mustGetEl<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing required element #${id}`);
    return el as T;
}

const mangledInput = mustGetEl<HTMLTextAreaElement>('mangled-input');
const demangledOutput = mustGetEl<HTMLTextAreaElement>('demangled-output');
const demangleBtn = mustGetEl<HTMLButtonElement>('demangle-btn');
const clearBtn = mustGetEl<HTMLButtonElement>('clear-btn');
const exampleBtn = mustGetEl<HTMLButtonElement>('example-btn');
const copyBtn = mustGetEl<HTMLButtonElement>('copy-btn');
const shareBtn = document.getElementById('share-btn') as HTMLButtonElement | null;
const statusDiv = mustGetEl<HTMLElement>('status');
const themeToggle = mustGetEl<HTMLButtonElement>('theme-toggle');

let wasmReady = false;
let nextRequestId = 1;
const pending = new Map<number, (result: string[]) => void>();

function setStatus(msg: string, type: 'info' | 'success' | 'error' = 'info') {
    statusDiv.textContent = msg;
    statusDiv.className = `status ${type}`;
}

const SUN_ICON ='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>';

function applyTheme(theme: string) {
    document.documentElement.setAttribute('data-theme', theme);
    themeToggle.innerHTML = theme === 'dark' ? SUN_ICON : MOON_ICON;
    themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
}

function initTheme() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (prefersDark ? 'dark' : 'light'));
}

themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('theme', next);
});

const demangler = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

type WorkerResponse =
    | { type: 'ready' }
    | { type: 'error'; message: string }
    | { id: number; type: 'result'; result: string[] }
    | { id: number; type: 'error'; message: string };

demangler.addEventListener('message', (ev: MessageEvent<WorkerResponse>) => {
    const msg = ev.data;
    if (msg.type === 'ready') {
        wasmReady = true;
        setStatus('Ready', 'success');
        loadFromHash();
        return;
    }
    if (msg.type === 'error' && !('id' in msg)) {
        setStatus(`Failed to load WASM: ${msg.message}`, 'error');
        return;
    }
    const cb = pending.get(msg.id);
    if (!cb) return;
    pending.delete(msg.id);
    if (msg.type === 'error') {
        setStatus(`Demangle failed: ${msg.message}`, 'error');
        return;
    }
    cb(msg.result);
});

function demangleAsync(symbols: string[]): Promise<string[]> {
    return new Promise((resolve) => {
        const id = nextRequestId++;
        pending.set(id, resolve);
        demangler.postMessage({ id, type: 'demangle', symbols });
    });
}

async function doDemangle() {
    if (!wasmReady) {
        setStatus('WASM not ready', 'error');
        return;
    }

    const input = mangledInput.value;
    if (!input.trim()) {
        demangledOutput.value = '';
        updateHash('');
        return;
    }

    const lines = input.split(/\r?\n/);
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

    setStatus('Demangling…', 'info');
    const result = await demangleAsync(lines);
    demangledOutput.value = result.join('\n');
    setStatus('Demangled successfully', 'success');
    updateHash(input);
}

const HASH_PREFIX = '#s=';
const MAX_HASH_INPUT = 8 * 1024;

function updateHash(input: string) {
    const trimmed = input.trim();
    if (!trimmed || trimmed.length > MAX_HASH_INPUT) {
        if (location.hash) history.replaceState(null, '', location.pathname + location.search);
        return;
    }
    const encoded = HASH_PREFIX + encodeURIComponent(trimmed);
    history.replaceState(null, '', location.pathname + location.search + encoded);
}

function loadFromHash() {
    if (!location.hash.startsWith(HASH_PREFIX)) return;
    try {
        const decoded = decodeURIComponent(location.hash.slice(HASH_PREFIX.length));
        if (!decoded) return;
        mangledInput.value = decoded;
        void doDemangle();
    } catch {
        /* malformed hash */
    }
}

demangleBtn.addEventListener('click', () => { void doDemangle(); });

clearBtn.addEventListener('click', () => {
    mangledInput.value = '';
    demangledOutput.value = '';
    updateHash('');
    setStatus('Cleared', 'info');
});

exampleBtn.addEventListener('click', () => {
    const examples = [
        '_Z3fooi',
        '_ZN3std6vectorIiSaIiEE9push_backERKi',
        '_ZNK6MyBaseD2Ev',
        '_RNvMsr_NtCs3ssYzQotkvD_3std4pathNtB5_7PathBuf3newCs15kBYyAo9fc_7mycrate',
        '?func@@YAHH@Z',
    ];
    mangledInput.value = examples.join('\n');
    setStatus('Examples loaded', 'success');
});

copyBtn.addEventListener('click', async () => {
    if (!demangledOutput.value) return;
    try {
        await navigator.clipboard.writeText(demangledOutput.value);
        const original = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = original; }, 2000);
    } catch (err) {
        console.error('Failed to copy', err);
    }
});

if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
        if (!location.hash.startsWith(HASH_PREFIX)) {
            updateHash(mangledInput.value);
        }
        try {
            await navigator.clipboard.writeText(location.href);
            const original = shareBtn.textContent;
            shareBtn.textContent = 'Link copied!';
            setTimeout(() => { shareBtn.textContent = original; }, 2000);
        } catch (err) {
            console.error('Failed to copy share link', err);
        }
    });
}

mangledInput.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
        ev.preventDefault();
        void doDemangle();
    }
});

initTheme();
setStatus('Loading WASM…', 'info');
