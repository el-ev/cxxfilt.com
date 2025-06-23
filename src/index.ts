import Cxxfilt, { CxxfiltModule } from '../wasm/llvm-cxxfilt.js';

document.addEventListener('DOMContentLoaded', async () => {
    const getElement = <T extends HTMLElement>(id: string): T => {
        const el = document.getElementById(id);
        if (!el) throw new Error(`Element with id ${id} not found`);
        return el as T;
    };

    const mangledInput = getElement<HTMLTextAreaElement>('mangled-input');
    const demangledOutput = getElement<HTMLTextAreaElement>('demangled-output');
    const demangleBtn = getElement<HTMLButtonElement>('demangle-btn');
    const clearBtn = getElement<HTMLButtonElement>('clear-btn');
    const exampleBtn = getElement<HTMLButtonElement>('example-btn');
    const copyBtn = getElement<HTMLButtonElement>('copy-btn');
    const statusDiv = getElement<HTMLDivElement>('status');

    let demangleHadError = false;

    const setStatus = (message: string, isError: boolean = false) => {
        statusDiv.textContent = message;
        statusDiv.className = isError ? 'status error' : 'status';
    };

    const initializeWasm = async () => {
        try {
            setStatus('Initializing wasm module...');
            demangleBtn.disabled = true;
            var Module = {
                noInitialRun: true,
                print: (text: string) => {
                    demangledOutput.value += text + '\n';
                },
                printErr: (text: string) => {
                    demangledOutput.value += text + '\n';
                    demangleHadError = true;
                },
            };
            var cxxfiltModule = await Cxxfilt(Module);
            setStatus('Wasm module loaded successfully.');
            demangleBtn.disabled = false;
            return cxxfiltModule as CxxfiltModule;
        } catch (error) {
            console.error('Error loading wasm module:', error);
            setStatus('Failed to load wasm module. See console for details.', true);
            return null;
        }
    };

    const demangleSymbols = async () => {
        var cxxfiltModule = await initializeWasm();
        if (!cxxfiltModule) {
            return;
        }

        if (mangledInput.value.trim() === '') {
            setStatus('Please enter symbols to demangle.', true);
            return;
        }
        demangledOutput.value = '';
        demangleHadError = false;
        const mangledSymbols = mangledInput.value.trim().split('\n');

        try {
            setStatus('Demangling...');
            demangleBtn.disabled = true;
            await cxxfiltModule?.callMain(mangledSymbols);
            if (demangleHadError) {
                setStatus('Demangling completed, but some symbols could not be demangled.', true);
            } else {
                setStatus('Demangling completed successfully.');
            }
        } catch (error) {
            console.error('Error during demangling:', error);
            setStatus('An error occurred during demangling.', true);
        } finally {
            demangleBtn.disabled = false;
        }
    };

    const clearFields = () => {
        mangledInput.value = '';
        demangledOutput.value = '';
        setStatus('');
    };

    const loadExamples = () => {
        const examples = [
            '_Z3fooi',
            '_ZN3std6vectorIiSaIiEE9push_backERKi',
            '_ZNK6MyBaseD2Ev',
            '_RNvMsr_NtCs3ssYzQotkvD_3std4pathNtB5_7PathBuf3newCs15kBYyAo9fc_7mycrate'
        ];
        mangledInput.value = examples.join('\n');
    };

    const copyToClipboard = async () => {
        if (!demangledOutput.value) {
            return;
        }
        try {
            await navigator.clipboard.writeText(demangledOutput.value);
            setStatus('Copied to clipboard!');
            setTimeout(() => setStatus(''), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    demangleBtn.addEventListener('click', demangleSymbols);
    clearBtn.addEventListener('click', clearFields);
    exampleBtn.addEventListener('click', loadExamples);
    copyBtn.addEventListener('click', copyToClipboard);
});
