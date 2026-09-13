import { requestCacheKey } from '../../src/utils/cache.js';

describe('requestCacheKey', () => {
    test('differs when only the query parameters differ', () => {
        const jan = requestCacheKey('etag', 'get', '/entries', { from: '2024-01-01', to: '2024-01-31' });
        const feb = requestCacheKey('etag', 'get', '/entries', { from: '2024-02-01', to: '2024-02-29' });

        expect(jan).not.toBe(feb);
    });

    test('is stable regardless of parameter insertion order', () => {
        const a = requestCacheKey('data', 'get', '/entries', { from: '2024-01-01', to: '2024-01-31', page: 1 });
        const b = requestCacheKey('data', 'get', '/entries', { page: 1, to: '2024-01-31', from: '2024-01-01' });

        expect(a).toBe(b);
    });

    test('treats missing, undefined and empty params alike', () => {
        const none = requestCacheKey('etag', 'get', '/accounts', undefined);
        const empty = requestCacheKey('etag', 'get', '/accounts', {});

        expect(none).toBe(empty);
    });

    test('keeps etag and data slots apart and is method-sensitive', () => {
        expect(requestCacheKey('etag', 'get', '/x', {})).not.toBe(requestCacheKey('data', 'get', '/x', {}));
        expect(requestCacheKey('etag', 'get', '/x', {})).not.toBe(requestCacheKey('etag', 'post', '/x', {}));
    });
});
