import Cxxfilt, { CxxfiltModule } from '../wasm/llvm-cxxfilt.js';

const getElement = <T extends HTMLElement>(id: string): T => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Element with id ${id} not found`);
    return el as T;
};

class ThemeManager {
    private themeToggle: HTMLButtonElement;

    constructor(themeToggle: HTMLButtonElement) {
        this.themeToggle = themeToggle;
        this.initialize();
    }

    private initialize(): void {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = savedTheme || (prefersDark ? 'dark' : 'light');
        
        this.setTheme(theme);
        this.updateThemeIcon(theme);
        this.themeToggle.addEventListener('click', () => this.toggleTheme());
    }

    private setTheme(theme: string): void {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        localStorage.setItem('theme', theme);
    }

    private updateThemeIcon(theme: string): void {
        const themeIcon = this.themeToggle.querySelector('.theme-icon');
        if (themeIcon) {
            themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
        }
    }

    private toggleTheme(): void {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        this.setTheme(newTheme);
        this.updateThemeIcon(newTheme);
    }
}

class StatusManager {
    private statusDiv: HTMLDivElement;

    constructor(statusDiv: HTMLDivElement) {
        this.statusDiv = statusDiv;
    }

    setStatus(message: string, isError: boolean = false): void {
        this.statusDiv.textContent = message;
        this.statusDiv.className = isError ? 'status error' : 'status';
    }

    clearStatus(): void {
        this.setStatus('');
    }
}

class DemanglerService {
    private statusManager: StatusManager;
    private demangledOutput: HTMLTextAreaElement;
    private demangleHadError = false;

    constructor(statusManager: StatusManager, demangledOutput: HTMLTextAreaElement) {
        this.statusManager = statusManager;
        this.demangledOutput = demangledOutput;
    }

    private async initializeWasm(): Promise<CxxfiltModule | null> {
        try {
            this.statusManager.setStatus('Initializing wasm module...');
            const Module = {
                noInitialRun: true,
                print: (text: string) => {
                    this.demangledOutput.value += text + '\n';
                },
                printErr: (text: string) => {
                    this.demangledOutput.value += text + '\n';
                    this.demangleHadError = true;
                },
            };
            const cxxfiltModule = await Cxxfilt(Module);
            this.statusManager.setStatus('Wasm module loaded successfully.');
            return cxxfiltModule as CxxfiltModule;
        } catch (error) {
            console.error('Error loading wasm module:', error);
            this.statusManager.setStatus('Failed to load wasm module. See console for details.', true);
            return null;
        }
    }

    async demangle(input: string, demangleBtn: HTMLButtonElement): Promise<void> {
        const cxxfiltModule = await this.initializeWasm();
        if (!cxxfiltModule) {
            return;
        }

        if (input.trim() === '') {
            this.statusManager.setStatus('Please enter symbols to demangle.', true);
            return;
        }

        this.demangledOutput.value = '';
        this.demangleHadError = false;
        const mangledSymbols = input.trim().split('\n');

        try {
            this.statusManager.setStatus('Demangling...');
            demangleBtn.disabled = true;
            await cxxfiltModule.callMain(mangledSymbols);
            
            if (this.demangleHadError) {
                this.statusManager.setStatus('Demangling completed, but some symbols could not be demangled.', true);
            } else {
                this.statusManager.setStatus('Demangling completed successfully.');
            }
        } catch (error) {
            console.error('Error during demangling:', error);
            this.statusManager.setStatus('An error occurred during demangling.', true);
        } finally {
            demangleBtn.disabled = false;
        }
    }
}

class DemanglerApp {
    private elements: {
        mangledInput: HTMLTextAreaElement;
        demangledOutput: HTMLTextAreaElement;
        demangleBtn: HTMLButtonElement;
        clearBtn: HTMLButtonElement;
        exampleBtn: HTMLButtonElement;
        copyBtn: HTMLButtonElement;
        themeToggle: HTMLButtonElement;
        statusDiv: HTMLDivElement;
    };

    private statusManager: StatusManager;
    private demanglerService: DemanglerService;
    private themeManager: ThemeManager;

    constructor() {
        this.elements = {
            mangledInput: getElement<HTMLTextAreaElement>('mangled-input'),
            demangledOutput: getElement<HTMLTextAreaElement>('demangled-output'),
            demangleBtn: getElement<HTMLButtonElement>('demangle-btn'),
            clearBtn: getElement<HTMLButtonElement>('clear-btn'),
            exampleBtn: getElement<HTMLButtonElement>('example-btn'),
            copyBtn: getElement<HTMLButtonElement>('copy-btn'),
            themeToggle: getElement<HTMLButtonElement>('theme-toggle'),
            statusDiv: getElement<HTMLDivElement>('status')
        };

        this.statusManager = new StatusManager(this.elements.statusDiv);
        this.demanglerService = new DemanglerService(this.statusManager, this.elements.demangledOutput);
        this.themeManager = new ThemeManager(this.elements.themeToggle);

        this.bindEvents();
    }

    private bindEvents(): void {
        this.elements.demangleBtn.addEventListener('click', () => this.handleDemangle());
        this.elements.clearBtn.addEventListener('click', () => this.handleClear());
        this.elements.exampleBtn.addEventListener('click', () => this.handleLoadExamples());
        this.elements.copyBtn.addEventListener('click', () => this.handleCopyToClipboard());
    }

    private async handleDemangle(): Promise<void> {
        await this.demanglerService.demangle(this.elements.mangledInput.value, this.elements.demangleBtn);
    }

    private handleClear(): void {
        this.elements.mangledInput.value = '';
        this.elements.demangledOutput.value = '';
        this.statusManager.clearStatus();
    }

    private handleLoadExamples(): void {
        const examples = [
            '_Z3fooi',
            '_ZN3std6vectorIiSaIiEE9push_backERKi',
            '_ZNK6MyBaseD2Ev',
            '_RNvMsr_NtCs3ssYzQotkvD_3std4pathNtB5_7PathBuf3newCs15kBYyAo9fc_7mycrate'
        ];
        this.elements.mangledInput.value = examples.join('\n');
    }

    private async handleCopyToClipboard(): Promise<void> {
        if (!this.elements.demangledOutput.value) {
            return;
        }
        
        try {
            await navigator.clipboard.writeText(this.elements.demangledOutput.value);
            this.statusManager.setStatus('Copied to clipboard!');
            setTimeout(() => this.statusManager.clearStatus(), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new DemanglerApp();
});
