import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';
import init, { batch_demangle } from './wasm/demangle.js';
import wasm from './wasm/demangle_bg.wasm';

const manifest = JSON.parse(manifestJSON);

let initialized = false;

async function initializeWasm() {
    if (!initialized) {
        await init(wasm);
        initialized = true;
    }
}

export default {
    async fetch(request: Request, env: any, ctx: any): Promise<Response> {
        const url = new URL(request.url);

        // API Endpoint
        if (url.pathname === '/api/demangle') {
            if (request.method !== 'POST') {
                return new Response('Method not allowed', { status: 405 });
            }

            try {
                await initializeWasm();
                
                const contentType = request.headers.get('content-type') || '';
                let symbols: string[] = [];

                if (contentType.includes('application/json')) {
                    const body = await request.json() as any;
                    if (Array.isArray(body.symbols)) {
                        symbols = body.symbols;
                    } else if (Array.isArray(body)) {
                        symbols = body;
                    }
                } else {
                    const text = await request.text();
                    symbols = text.split('\n');
                }

                // Filter out empty lines if any? WASM might handle it or return empty string.
                // batch_demangle takes string[], returns string[].
                const demangled = batch_demangle(symbols);

                if (contentType.includes('application/json')) {
                    return new Response(JSON.stringify({ result: demangled }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                } else {
                    return new Response(demangled.join('\n'), {
                        headers: { 'Content-Type': 'text/plain' }
                    });
                }
            } catch (e: any) {
                return new Response(JSON.stringify({ error: e.toString() }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // Static Assets
        try {
            return await getAssetFromKV(
                {
                    request,
                    waitUntil: ctx.waitUntil.bind(ctx),
                },
                {
                    ASSET_NAMESPACE: env.__STATIC_CONTENT,
                    ASSET_MANIFEST: manifest,
                }
            );
        } catch (e) {
            return new Response('Not Found', { status: 404 });
        }
    }
};
