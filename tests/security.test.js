const request = require('supertest');
const app = require('../src/app');

describe('Security Middleware', () => {
    it('should set Helmet security headers', async () => {
        const res = await request(app).get('/');
        expect(res.headers).toHaveProperty('content-security-policy');
        expect(res.headers).toHaveProperty('x-dns-prefetch-control');
        expect(res.headers).toHaveProperty('x-frame-options');
    });

    it('should set Rate Limit headers', async () => {
        const res = await request(app).get('/');
        // standardHeaders: true enables `RateLimit-*` headers (draft-7) or `RateLimit-*` (legacy).
        // Express-rate-limit v6/7 with standardHeaders: true sends `RateLimit-Limit`, `RateLimit-Remaining`, etc.
        // Note: The exact header names can vary depending on version/config, but we generally expect some rate limit info.
        // Let's check for 'ratelimit-limit' which is common.
        expect(res.headers).toHaveProperty('ratelimit-limit');
        expect(res.headers).toHaveProperty('ratelimit-remaining');
    });
});
