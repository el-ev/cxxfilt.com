import { getAssetFromKV, NotFoundError, MethodNotAllowedError } from '@cloudflare/kv-asset-handler';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';
import { handleApiRequest } from './api';

const manifest = JSON.parse(manifestJSON);

export default {
    async fetch(request: Request, env: any, ctx: any): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === '/layout') {
            return Response.redirect(url.origin + '/layout/', 301);
        }

        if (url.pathname === '/api/demangle') {
            return handleApiRequest(request);
        }

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
            if (e instanceof NotFoundError) {
                return new Response('Not Found', { status: 404 });
            }
            if (e instanceof MethodNotAllowedError) {
                return new Response('Method Not Allowed', { status: 405 });
            }
            console.error('asset handler error', e);
            return new Response('Internal Server Error', { status: 500 });
        }
    }
};
