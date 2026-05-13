import init, { batch_demangle } from './wasm/demangle.js';
import wasm from './wasm/demangle_bg.wasm';

const MAX_REQUEST_BYTES = 1 * 1024 * 1024; // 1 MiB
const MAX_SYMBOLS = 10_000;

let initPromise: Promise<unknown> | null = null;

function ensureInit(): Promise<unknown> {
    return (initPromise ??= init(wasm));
}

function isStringArray(v: unknown): v is string[] {
    return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

function jsonError(message: string, status: number): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function handleApiRequest(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
        return jsonError('Payload too large', 413);
    }

    try {
        await ensureInit();

        const contentType = request.headers.get('content-type') || '';
        const wantsJson = contentType.includes('application/json');
        let symbols: string[];

        if (wantsJson) {
            const body = await request.json() as unknown;
            const candidate =
                body && typeof body === 'object' && 'symbols' in body
                    ? (body as { symbols: unknown }).symbols
                    : body;
            if (!isStringArray(candidate)) {
                return jsonError('Expected an array of strings or { symbols: string[] }', 400);
            }
            symbols = candidate;
        } else {
            const text = await request.text();
            // Defense-in-depth in case Content-Length was missing or wrong.
            if (text.length > MAX_REQUEST_BYTES) {
                return jsonError('Payload too large', 413);
            }
            symbols = text.split(/\r?\n/);
            if (symbols.length > 0 && symbols[symbols.length - 1] === '') {
                symbols.pop();
            }
        }

        if (symbols.length > MAX_SYMBOLS) {
            return jsonError(`Too many symbols (max ${MAX_SYMBOLS})`, 413);
        }

        const demangled = batch_demangle(symbols);

        if (wantsJson) {
            return new Response(JSON.stringify({ result: demangled }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        return new Response(demangled.join('\n'), {
            headers: { 'Content-Type': 'text/plain' }
        });
    } catch (e) {
        console.error('demangle api error', e);
        return jsonError('Internal error', 500);
    }
}
