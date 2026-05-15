import CxxLayout, { CxxLayoutModule } from '../wasm/clang-cxx-layout.js';

const CPP_KEYWORDS = new Set([
    'alignas', 'alignof', 'and', 'asm', 'auto', 'bitand', 'bitor', 'break', 'case',
    'catch', 'class', 'compl', 'concept', 'const', 'consteval', 'constexpr',
    'constinit', 'const_cast', 'continue', 'co_await', 'co_return', 'co_yield',
    'decltype', 'default', 'delete', 'do', 'dynamic_cast', 'else', 'enum',
    'explicit', 'export', 'extern', 'false', 'final', 'for', 'friend', 'goto',
    'if', 'inline', 'mutable', 'namespace', 'new', 'noexcept', 'not', 'nullptr',
    'operator', 'or', 'override', 'private', 'protected', 'public', 'register',
    'reinterpret_cast', 'requires', 'return', 'sizeof', 'static', 'static_assert',
    'static_cast', 'struct', 'switch', 'template', 'this', 'thread_local',
    'throw', 'true', 'try', 'typedef', 'typeid', 'typename', 'union', 'using',
    'virtual', 'volatile', 'while', 'xor',
]);

const CPP_TYPES = new Set([
    'bool', 'char', 'char8_t', 'char16_t', 'char32_t', 'double', 'float', 'int',
    'long', 'short', 'signed', 'unsigned', 'void', 'wchar_t',
    'size_t', 'ssize_t', 'ptrdiff_t', 'intptr_t', 'uintptr_t',
    'int8_t', 'int16_t', 'int32_t', 'int64_t',
    'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
]);

const HTML_ESCAPES: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};
function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

const TOKEN_RE = /(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)|(^[ \t]*#[^\n]*)|("(?:\\.|[^"\\\n])*")|('(?:\\.|[^'\\\n])*')|(\b(?:0[xX][0-9a-fA-F']+|0[bB][01']+|\d[\d']*\.?\d*(?:[eE][+-]?\d+)?[uUlLfFdDzZ]*|\.\d[\d']*(?:[eE][+-]?\d+)?[fFlL]?)\b)|(\b[A-Za-z_]\w*\b)|([\s\S])/gm;

function highlightCpp(source: string): string {
    let out = '';
    for (const m of source.matchAll(TOKEN_RE)) {
        const [, lineComment, blockComment, pp, dstr, sstr, num, ident, other] = m;
        if (lineComment !== undefined || blockComment !== undefined) {
            out += `<span class="hl-comment">${escapeHtml(lineComment ?? blockComment)}</span>`;
        } else if (pp !== undefined) {
            out += `<span class="hl-pp">${escapeHtml(pp)}</span>`;
        } else if (dstr !== undefined || sstr !== undefined) {
            out += `<span class="hl-string">${escapeHtml(dstr ?? sstr)}</span>`;
        } else if (num !== undefined) {
            out += `<span class="hl-num">${escapeHtml(num)}</span>`;
        } else if (ident !== undefined) {
            if (CPP_KEYWORDS.has(ident)) {
                out += `<span class="hl-keyword">${ident}</span>`;
            } else if (CPP_TYPES.has(ident)) {
                out += `<span class="hl-type">${ident}</span>`;
            } else {
                out += escapeHtml(ident);
            }
        } else {
            out += escapeHtml(other ?? '');
        }
    }
    // Trailing newline keeps the overlay's last line height matching the textarea's caret line.
    if (source.endsWith('\n')) out += ' ';
    return out;
}

interface RecordInfo {
    id: string;
    name: string;
}

interface FieldLayout {
    fieldType: 'Simple' | 'Record' | 'VPtr' | 'VFPtr' | 'VBPtr' | 'BitField' | 'NVPrimaryBase' | 'NVBase' | 'VPrimaryBase' | 'VBase';
    name?: string;
    type: string;
    size: number;
    align: number;
    offset: number;
    bitWidth?: number;
    subFields?: FieldLayout[];
}

interface RecordLayout {
    fieldType: 'Record';
    type: string;
    size: number;
    align: number;
    offset: number;
    subFields: FieldLayout[];
}

class CxxLayoutVisualizer {
    private module: CxxLayoutModule | null = null;
    private moduleLoadingPromise: Promise<void> | null = null;
    private records: RecordInfo[] = [];
    private layouts: Map<string, RecordLayout> = new Map();
    private selectedRecordIds: Set<string> = new Set();

    private codeEditor: HTMLTextAreaElement;
    private codeHighlight: HTMLElement;
    private analyzeBtn: HTMLButtonElement;
    private targetSelect: HTMLSelectElement;
    private targetCustomWrapper: HTMLElement;
    private targetCustomInput: HTMLInputElement;
    private customTargetHint: HTMLElement;
    private extraFlagsInput: HTMLInputElement;
    private wasmStatus: HTMLElement;
    private loading: HTMLElement;
    private error: HTMLElement;
    private recordList: HTMLElement;
    private layoutVisualization: HTMLElement;
    private infoPanel: HTMLElement;
    private infoContent: HTMLElement;
    private clearInfoBtn: HTMLElement;

    private stderr: string = '';

    constructor() {
        this.codeEditor = document.getElementById('codeEditor') as HTMLTextAreaElement;
        this.codeHighlight = document.querySelector('#codeHighlight code') as HTMLElement;
        this.analyzeBtn = document.getElementById('analyzeBtn') as HTMLButtonElement;
        this.targetSelect = document.getElementById('targetSelect') as HTMLSelectElement;
        this.targetCustomWrapper = document.getElementById('customTargetWrapper') as HTMLElement;
        this.targetCustomInput = document.getElementById('customTargetInput') as HTMLInputElement;
        this.customTargetHint = document.getElementById('customTargetHint') as HTMLElement;
        this.extraFlagsInput = document.getElementById('extraFlagsInput') as HTMLInputElement;
        this.wasmStatus = document.getElementById('wasmStatus') as HTMLElement;
        this.loading = document.getElementById('loading') as HTMLElement;
        this.error = document.getElementById('error') as HTMLElement;
        this.recordList = document.getElementById('recordList') as HTMLElement;
        this.layoutVisualization = document.getElementById('layoutVisualization') as HTMLElement;
        this.infoPanel = document.getElementById('infoPanel') as HTMLElement;
        this.infoContent = document.getElementById('infoContent') as HTMLElement;
        this.clearInfoBtn = document.getElementById('clearInfo') as HTMLElement;

        this.initializeEventListeners();
        this.syncCustomTargetVisibility();
        this.updateWasmStatus('warning', 'Module not loaded');
        this.renderHighlight();
    }

    private renderHighlight(): void {
        this.codeHighlight.innerHTML = highlightCpp(this.codeEditor.value);
    }

    private syncHighlightScroll(): void {
        const overlay = this.codeHighlight.parentElement;
        if (!overlay) return;
        overlay.scrollTop = this.codeEditor.scrollTop;
        overlay.scrollLeft = this.codeEditor.scrollLeft;
    }

    private initializeEventListeners(): void {
        this.analyzeBtn.addEventListener('click', () => this.analyzeCode());
        this.targetSelect.addEventListener('change', () => this.syncCustomTargetVisibility());
        this.targetCustomInput.addEventListener('input', () => this.validateCustomTarget(false));
        this.clearInfoBtn.addEventListener('click', () => {
            this.hideInfo();
        });
        this.codeEditor.addEventListener('input', () => this.renderHighlight());
        this.codeEditor.addEventListener('scroll', () => this.syncHighlightScroll());
    }

    private static readonly TARGET_TRIPLE_RE = /^[A-Za-z0-9._-]+$/;

    private validateCustomTarget(showEmpty: boolean): boolean {
        const raw = this.targetCustomInput.value;
        const trimmed = raw.trim();
        const empty = trimmed.length === 0;
        const valid = !empty && CxxLayoutVisualizer.TARGET_TRIPLE_RE.test(raw);

        const showError = !valid && (showEmpty || !empty);
        this.targetCustomInput.classList.toggle('is-invalid', showError);
        this.customTargetHint.classList.toggle('is-error', showError);
        if (showError) {
            this.customTargetHint.textContent = empty
                ? 'Target triple is required.'
                : 'Invalid characters — only letters, digits, dots, underscores, and dashes.';
        } else {
            this.customTargetHint.textContent = 'Letters, digits, dots, underscores, dashes — no spaces.';
        }
        return valid;
    }

    private static splitFlags(input: string): string[] {
        return input.split(/\s+/).filter(Boolean);
    }
    private async loadModule(): Promise<void> {
        if (this.module) return;
        if (this.moduleLoadingPromise) {
            return this.moduleLoadingPromise;
        }

        this.updateWasmStatus('loading', 'Loading module...');

        this.moduleLoadingPromise = (async () => {
            try {
                this.module = await CxxLayout({
                    printErr: (text: string) => {
                        this.stderr += text + '\n';
                    }
                }) as CxxLayoutModule;
                this.updateWasmStatus('success', 'Module ready');
            } catch (err) {
                this.updateWasmStatus('error', 'Failed to load module');
                throw err;
            } finally {
                this.moduleLoadingPromise = null;
            }
        })();

        return this.moduleLoadingPromise;
    }

    private showError(message: string): void {
        this.error.textContent = message;
        this.error.style.display = 'block';
        setTimeout(() => {
            this.error.style.display = 'none';
        }, 5000);
    }

    private showLoading(show: boolean): void {
        this.loading.style.display = show ? 'block' : 'none';
        this.analyzeBtn.disabled = show;
    }

    private showInfo(message: string): void {
        this.infoContent.textContent = message;
        this.infoPanel.classList.add('is-visible');
    }

    private hideInfo(): void {
        this.infoPanel.classList.remove('is-visible');
        this.infoContent.textContent = '';
    }

    private clearResults(): void {
        this.records = [];
        this.layouts.clear();
        this.selectedRecordIds.clear();
        const items = this.recordList.querySelector('.record-items') as HTMLElement | null;
        if (items) items.innerHTML = '';
        const status = this.recordList.querySelector('.record-status') as HTMLElement | null;
        if (status) status.remove();
        this.layoutVisualization.innerHTML = '';
    }

    private async analyzeCode(): Promise<void> {
        try {
            await this.loadModule();
        } catch (err) {
            this.showError('Failed to load module: ' + (err as Error).message);
            return;
        }

        if (!this.module) {
            this.showError('Module not loaded yet. Please wait and try again.');
            return;
        }

        const source = this.codeEditor.value.trim();
        if (!source) {
            this.showError('Please enter some C++ code to analyze.');
            return;
        }

        this.showLoading(true);
        this.error.style.display = 'none';
        this.hideInfo();
        this.stderr = '';
        this.clearResults();

        try {
            const isCustom = this.targetSelect.value === 'custom';
            if (isCustom && !this.validateCustomTarget(true)) {
                this.showError('Invalid target triple.');
                this.targetCustomInput.focus();
                return;
            }
            const targetValue = isCustom
                ? this.targetCustomInput.value.trim()
                : this.targetSelect.value;

            const extra = CxxLayoutVisualizer.splitFlags(this.extraFlagsInput.value);
            const args = ['--target=' + targetValue, ...extra].join(' ');
            const encoder = new TextEncoder();

            const argsEncoded = encoder.encode(args);
            const argsPtr = this.module._malloc(argsEncoded.length + 1);
            this.module.stringToUTF8(args, argsPtr, argsEncoded.length + 1);
            this.module._setArgs(argsPtr);
            this.module._free(argsPtr);

            const sourceEncoded = encoder.encode(source);
            const sourcePtr = this.module._malloc(sourceEncoded.length + 1);
            this.module.stringToUTF8(source, sourcePtr, sourceEncoded.length + 1);
            this.module._analyzeSource(sourcePtr);
            this.module._free(sourcePtr);

            const resultPtr = this.module._getRecordList();
            const resultJson = this.module.UTF8ToString(resultPtr);
            this.module._free(resultPtr);
            this.records = JSON.parse(resultJson) as RecordInfo[];

            if (this.records.length === 0) {
                const diag = this.stderr.trim();
                if (diag) {
                    this.showError('Clang reported errors — see diagnostics.');
                    this.showInfo(diag);
                } else {
                    this.showError('No records found. Make sure your code contains struct or class definitions.');
                }
                try { this.module._cleanup(); } catch { /* best effort */ }
                return;
            }

            for (const record of this.records) {
                try {
                    let recordId: any = record.id;
                    let layoutPtr: number;
                    try {
                        layoutPtr = this.module._getLayoutForRecord(recordId);
                    } catch (e) {
                        recordId = parseInt(record.id);
                        layoutPtr = this.module._getLayoutForRecord(recordId);
                    }
                    const layoutJson = this.module.UTF8ToString(layoutPtr);
                    this.module._free(layoutPtr);
                    const layout = JSON.parse(layoutJson) as RecordLayout;
                    this.layouts.set(record.id, layout);
                } catch (err) {
                    console.error(`Failed to get layout for record ${record.name} (${record.id}):`, err);
                }
            }

            this.displayResults();
            this.module._cleanup();

            if (this.stderr.trim()) {
                this.showInfo(this.stderr.trim());
            }
        } catch (err) {
            this.showError('Analysis failed: ' + (err as Error).message);
        } finally {
            this.showLoading(false);
        }
    }

    private updateWasmStatus(state: 'warning' | 'loading' | 'success' | 'error', text: string): void {
        if (!this.wasmStatus) return;

        this.wasmStatus.textContent = text;
        this.wasmStatus.classList.remove('status-warning', 'status-loading', 'status-success', 'status-error');
        this.wasmStatus.classList.add(`status-${state}`);
    }

    private displayResults(): void {
        this.selectedRecordIds = new Set(this.records.map(record => record.id));
        this.displayRecordList();
        this.displaySelectedLayouts();
    }

    private displayRecordList(): void {
        let status = this.recordList.querySelector('.record-status') as HTMLElement;
        let recordItems = this.recordList.querySelector('.record-items') as HTMLElement;
        if (!status) {
            status = document.createElement('div');
            status.className = 'record-status';
            this.recordList.prepend(status);
        }
        if (!recordItems) {
            recordItems = document.createElement('div');
            recordItems.className = 'record-items';
            this.recordList.appendChild(recordItems);
        }

        recordItems.innerHTML = '';

        const showAllItem = document.createElement('div');
        showAllItem.className = 'record-item control';
        showAllItem.textContent = 'Show All';
        showAllItem.style.fontWeight = '600';
        showAllItem.style.fontStyle = 'italic';
        showAllItem.setAttribute('aria-pressed', 'false');
        showAllItem.addEventListener('click', () => {
            this.selectedRecordIds = new Set(this.records.map(record => record.id));
            recordItems.querySelectorAll('.record-item:not(.control)').forEach(item => {
                item.classList.add('selected');
                item.setAttribute('aria-pressed', 'true');
            });
            showAllItem.classList.add('selected');
            showAllItem.setAttribute('aria-pressed', 'true');
            clearItem.classList.remove('selected');
            clearItem.setAttribute('aria-pressed', 'false');
            this.updateSelectionStatus(status);
            this.displaySelectedLayouts();
        });
        recordItems.appendChild(showAllItem);

        const clearItem = document.createElement('div');
        clearItem.className = 'record-item control';
        clearItem.textContent = 'Clear';
        clearItem.setAttribute('aria-pressed', 'false');
        clearItem.addEventListener('click', () => {
            this.selectedRecordIds.clear();
            this.recordList.querySelectorAll('.record-item').forEach(item => {
                item.classList.remove('selected');
                item.setAttribute('aria-pressed', 'false');
            });
            clearItem.classList.add('selected');
            clearItem.setAttribute('aria-pressed', 'true');
            this.updateSelectionStatus(status);
            this.displaySelectedLayouts();
        });
        recordItems.appendChild(clearItem);

        this.records.forEach(record => {
            const recordItem = document.createElement('div');
            recordItem.className = 'record-item';
            recordItem.textContent = `${record.name} (${record.id})`;
            recordItem.setAttribute('aria-pressed', 'false');
            recordItem.addEventListener('click', () => {
                if (this.selectedRecordIds.has(record.id)) {
                    this.selectedRecordIds.delete(record.id);
                    recordItem.classList.remove('selected');
                    recordItem.setAttribute('aria-pressed', 'false');
                } else {
                    this.selectedRecordIds.add(record.id);
                    recordItem.classList.add('selected');
                    recordItem.setAttribute('aria-pressed', 'true');
                }

                if (this.selectedRecordIds.size === this.records.length && this.records.length > 0) {
                    showAllItem.classList.add('selected');
                    showAllItem.setAttribute('aria-pressed', 'true');
                    clearItem.classList.remove('selected');
                    clearItem.setAttribute('aria-pressed', 'false');
                } else {
                    showAllItem.classList.remove('selected');
                    showAllItem.setAttribute('aria-pressed', 'false');
                }

                if (this.selectedRecordIds.size === 0) {
                    clearItem.classList.add('selected');
                    clearItem.setAttribute('aria-pressed', 'true');
                } else {
                    clearItem.classList.remove('selected');
                    clearItem.setAttribute('aria-pressed', 'false');
                }

                this.updateSelectionStatus(status);
                this.displaySelectedLayouts();
            });
            recordItems.appendChild(recordItem);
        });

        this.records.forEach((record, index) => {
            const item = recordItems.children[index + 2] as HTMLElement;
            if (this.selectedRecordIds.has(record.id)) {
                item.classList.add('selected');
                item.setAttribute('aria-pressed', 'true');
            }
        });

        if (this.selectedRecordIds.size === this.records.length && this.records.length > 0) {
            showAllItem.classList.add('selected');
            clearItem.classList.remove('selected');
            showAllItem.setAttribute('aria-pressed', 'true');
            clearItem.setAttribute('aria-pressed', 'false');
        } else if (this.selectedRecordIds.size === 0) {
            clearItem.classList.add('selected');
            clearItem.setAttribute('aria-pressed', 'true');
        }
        this.updateSelectionStatus(status);
        this.recordList.style.display = 'block';
    }

    private displayAllLayouts(): void {
        this.layoutVisualization.innerHTML = '';
        this.records.forEach(record => {
            const layout = this.layouts.get(record.id);
            if (layout) {
                const recordElement = this.createRecordElement(record, layout);
                this.layoutVisualization.appendChild(recordElement);
            }
        });
    }

    private displaySingleLayout(recordId: string): void {
        this.layoutVisualization.innerHTML = '';
        const record = this.records.find(r => r.id === recordId);
        const layout = this.layouts.get(recordId);
        if (record && layout) {
            const recordElement = this.createRecordElement(record, layout);
            this.layoutVisualization.appendChild(recordElement);
        }
    }

    private displaySelectedLayouts(): void {
        this.layoutVisualization.innerHTML = '';

        const idsToRender = this.selectedRecordIds.size > 0
            ? Array.from(this.selectedRecordIds)
            : [];

        if (idsToRender.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-selection';
            emptyState.textContent = 'Select one or more records to view their layouts.';
            this.layoutVisualization.appendChild(emptyState);
            return;
        }

        idsToRender.forEach(recordId => {
            const record = this.records.find(r => r.id === recordId);
            const layout = this.layouts.get(recordId);
            if (record && layout) {
                const recordElement = this.createRecordElement(record, layout);
                this.layoutVisualization.appendChild(recordElement);
            }
        });
    }

    private updateSelectionStatus(statusEl: HTMLElement): void {
        statusEl.textContent = `${this.selectedRecordIds.size} of ${this.records.length} selected`;
    }

        private syncCustomTargetVisibility(): void {
            const isCustom = this.targetSelect.value === 'custom';
            this.targetCustomWrapper.style.display = isCustom ? 'block' : 'none';
            if (!isCustom) {
                this.targetCustomInput.value = '';
            }
        }


    private createRecordElement(record: RecordInfo, layout: RecordLayout): HTMLElement {
        const recordBox = document.createElement('div');
        recordBox.className = 'record-box';

        const header = document.createElement('div');
        header.className = 'record-header';
        header.innerHTML = `
            <span>${record.name}</span>
            <span>${layout.size}B • ${layout.align}B align</span>
        `;
        recordBox.appendChild(header);

        if (layout.subFields.length > 0 || layout.size > 0) {
            const memoryBar = this.createMemoryBar(layout);
            recordBox.appendChild(memoryBar);
        }

        if (layout.subFields.length > 0) {
            const fieldHeader = document.createElement('div');
            fieldHeader.className = 'field-header';
            fieldHeader.innerHTML = `
                <span>Field • Type</span>
                <span>Size</span>
                <span>Align</span>
                <span>Offset</span>
            `;
            recordBox.appendChild(fieldHeader);

            layout.subFields.forEach(field => {
                const fieldElement = this.createCompactFieldElement(field);
                recordBox.appendChild(fieldElement);
            });
        }

        this.addHighlightEventListeners(recordBox, layout);

        return recordBox;
    }

    private createMemoryBar(layout: RecordLayout): HTMLElement {
        const memoryBar = document.createElement('div');
        memoryBar.className = 'memory-bar';

        const totalSizeInBytes = layout.size;

        // Create a map of byte offset to field
        const fieldMap = new Map<number, FieldLayout>();
        layout.subFields.forEach(field => {
            for (let i = 0; i < field.size; i++) {
                fieldMap.set(field.offset + i, field);
            }
        });

        for (let i = 0; i < totalSizeInBytes; i++) {
            const byteSquare = document.createElement('div');
            const field = fieldMap.get(i);

            byteSquare.dataset.byteOffset = `${i}`;

            if (field) {
                const fieldTypeClass = this.getFieldTypeClass(field.fieldType).replace('-field', '');
                byteSquare.className = `memory-segment ${fieldTypeClass}`;
                const displayName = field.name || `<${field.fieldType}>`;
                byteSquare.title = `${displayName}: ${field.type} (byte ${i + 1} of ${totalSizeInBytes})`;
                byteSquare.dataset.fieldOffset = `${field.offset}`;
            } else {
                // This is padding
                byteSquare.className = 'memory-segment padding';
                byteSquare.title = `Padding (byte ${i + 1} of ${totalSizeInBytes})`;
            }

            memoryBar.appendChild(byteSquare);
        }

        return memoryBar;
    }

    private createCompactFieldElement(field: FieldLayout, depth: number = 0): HTMLElement {
        const fieldDiv = document.createElement('div');
        fieldDiv.className = `field ${this.getFieldTypeClass(field.fieldType)}`;
        fieldDiv.dataset.fieldOffset = `${field.offset}`;
        if (depth > 0) {
            fieldDiv.style.paddingLeft = `${12 + depth * 12}px`;
        }

        let displayName = field.name || `<${field.fieldType}>`;
        if (field.fieldType === 'VPtr' || field.fieldType === 'VFPtr') {
            displayName = 'vtable ptr';
        } else if (field.fieldType === 'VBPtr') {
            displayName = 'vbtable ptr';
        } else if (field.fieldType === 'NVPrimaryBase') {
            displayName = `Non-virtual Primary Base: ${field.type}`;
        } else if (field.fieldType === 'NVBase') {
            displayName = `Non-virtual Base: ${field.type}`;
        } else if (field.fieldType === 'VPrimaryBase') {
            displayName = `Virtual Primary Base: ${field.type}`;
        } else if (field.fieldType === 'VBase') {
            displayName = `Virtual Base: ${field.type}`;
        }

        const extraMeta = field.fieldType === 'BitField' && field.bitWidth !== undefined
            ? `<div class="field-bitwidth">${field.bitWidth}b</div>`
            : '';

        fieldDiv.innerHTML = `
            <div class="field-info">
                <div class="field-name">${displayName}</div>
                <div class="field-type">${field.type}</div>
            </div>
            <div class="field-size">${field.size}B</div>
            <div class="field-align">${field.align}B</div>
            <div class="field-offset">@${field.offset}${extraMeta}</div>
        `;

        return fieldDiv;
    }

    private addHighlightEventListeners(recordBox: HTMLElement, layout: RecordLayout): void {
        const fieldElements = Array.from(recordBox.querySelectorAll('.field[data-field-offset]')) as HTMLElement[];
        const memorySegments = Array.from(recordBox.querySelectorAll('.memory-segment[data-byte-offset]')) as HTMLElement[];

        const getFieldFromOffset = (offset: string | undefined | null): FieldLayout | undefined => {
            if (!offset) return undefined;
            return layout.subFields.find(f => f.offset.toString() === offset);
        };

        fieldElements.forEach(fieldEl => {
            fieldEl.addEventListener('mouseover', () => {
                const field = getFieldFromOffset(fieldEl.dataset.fieldOffset);
                if (!field) return;

                fieldEl.classList.add('highlight');
                for (let i = 0; i < field.size; i++) {
                    const byteOffset = field.offset + i;
                    const segment = memorySegments.find(s => s.dataset.byteOffset === byteOffset.toString());
                    segment?.classList.add('highlight');
                }
            });

            fieldEl.addEventListener('mouseout', () => {
                const field = getFieldFromOffset(fieldEl.dataset.fieldOffset);
                if (!field) return;

                fieldEl.classList.remove('highlight');
                for (let i = 0; i < field.size; i++) {
                    const byteOffset = field.offset + i;
                    const segment = memorySegments.find(s => s.dataset.byteOffset === byteOffset.toString());
                    segment?.classList.remove('highlight');
                }
            });
        });

        memorySegments.forEach(segmentEl => {
            segmentEl.addEventListener('mouseover', () => {
                const field = getFieldFromOffset(segmentEl.dataset.fieldOffset);
                if (!field) return;

                const fieldEl = fieldElements.find(fe => fe.dataset.fieldOffset === field.offset.toString());
                fieldEl?.classList.add('highlight');

                for (let i = 0; i < field.size; i++) {
                    const byteOffset = field.offset + i;
                    const segment = memorySegments.find(s => s.dataset.byteOffset === byteOffset.toString());
                    segment?.classList.add('highlight');
                }
            });

            segmentEl.addEventListener('mouseout', () => {
                const field = getFieldFromOffset(segmentEl.dataset.fieldOffset);
                if (!field) return;

                const fieldEl = fieldElements.find(fe => fe.dataset.fieldOffset === field.offset.toString());
                fieldEl?.classList.remove('highlight');

                for (let i = 0; i < field.size; i++) {
                    const byteOffset = field.offset + i;
                    const segment = memorySegments.find(s => s.dataset.byteOffset === byteOffset.toString());
                    segment?.classList.remove('highlight');
                }
            });
        });
    }

    private getFieldTypeClass(fieldType: string): string {
        switch (fieldType) {
            case 'VPtr':
                return 'vptr-field';
            case 'VFPtr':
                return 'vfptr-field';
            case 'VBPtr':
                return 'vbptr-field';
            case 'NVBase':
                return 'base-field';
            case 'NVPrimaryBase':
                return 'base-primary-field';
            case 'VBase':
                return 'vbase-field';
            case 'VPrimaryBase':
                return 'vbase-primary-field';
            case 'BitField':
                return 'bitfield-field';
            case 'Simple':
                return 'simple-field';
            case 'Record':
                return 'record-field';
            default:
                return '';
        }
    }
}

const SUN_ICON ='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>';

function applyTheme(toggle: HTMLElement, theme: string) {
    document.documentElement.setAttribute('data-theme', theme);
    toggle.innerHTML = theme === 'dark' ? SUN_ICON : MOON_ICON;
    toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
}

function initTheme() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(toggle, saved || (prefersDark ? 'dark' : 'light'));
    toggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(toggle, next);
        localStorage.setItem('theme', next);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    new CxxLayoutVisualizer();
});

export { CxxLayoutVisualizer };
