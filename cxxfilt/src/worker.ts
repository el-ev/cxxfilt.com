import init, { batch_demangle } from '../wasm/demangle.js';

type Request =
    | { id: number; type: 'demangle'; symbols: string[] };

type Response =
    | { type: 'ready' }
    | { type: 'error'; message: string }
    | { id: number; type: 'result'; result: string[] }
    | { id: number; type: 'error'; message: string };

interface WorkerCtx {
    postMessage(msg: Response): void;
    onmessage: ((ev: MessageEvent<Request>) => void) | null;
}
const ctx = self as unknown as WorkerCtx;

const ready = init().then(
    () => { ctx.postMessage({ type: 'ready' }); },
    (err) => {
        ctx.postMessage({
            type: 'error',
            message: err instanceof Error ? err.message : String(err),
        });
        throw err;
    },
);

ctx.onmessage = async (ev) => {
    const msg = ev.data;
    if (msg.type !== 'demangle') return;
    try {
        await ready;
        const result = batch_demangle(msg.symbols);
        ctx.postMessage({ id: msg.id, type: 'result', result });
    } catch (err) {
        ctx.postMessage({
            id: msg.id,
            type: 'error',
            message: err instanceof Error ? err.message : String(err),
        });
    }
};
