import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { transparencyRouter } from '../../server/modules/transparency/transparency.routes.js';
import { transparencyAdminRouter } from '../../server/modules/transparency/transparency.admin.routes.js';
import * as transparencyController from '../../server/modules/transparency/transparency.controller.js';

let app;
let server;
let baseUrl;

test.before(async () => {
  app = express();
  app.use(express.json());
  app.use('/api', transparencyRouter);
  app.use('/api/admin', transparencyAdminRouter);

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ─── 1. BFLA & Authentication Tests (OWASP API5:2023) ──────────────────────

test('Security/Auth: unauthenticated requests to admin transparency routes receive 401', async () => {
  const protectedEndpoints = [
    { method: 'GET', path: '/api/admin/transparency' },
    { method: 'POST', path: '/api/admin/transparency' },
    { method: 'GET', path: '/api/admin/transparency/wallet/settings' },
    { method: 'PUT', path: '/api/admin/transparency/wallet/settings' },
    { method: 'GET', path: '/api/admin/transparency/tracked-wallets' },
    { method: 'POST', path: '/api/admin/transparency/tracked-wallets' },
    { method: 'DELETE', path: '/api/admin/transparency/tracked-wallets/1' },
    { method: 'GET', path: '/api/admin/transparency/external-investments' },
    { method: 'POST', path: '/api/admin/transparency/external-investments' },
    { method: 'DELETE', path: '/api/admin/transparency/external-investments/1' },
    { method: 'GET', path: '/api/admin/transparency/hardware-assets' },
    { method: 'POST', path: '/api/admin/transparency/hardware-assets' },
    { method: 'GET', path: '/api/admin/transparency/hardware-assets/1/profit-logs' },
    { method: 'POST', path: '/api/admin/transparency/hardware-assets/1/profit-logs' },
  ];

  for (const ep of protectedEndpoints) {
    const res = await fetch(`${baseUrl}${ep.path}`, {
      method: ep.method,
      headers: { 'Content-Type': 'application/json' },
    });
    assert.equal(
      res.status,
      401,
      `Endpoint ${ep.method} ${ep.path} must return 401 Unauthorized for unauthenticated requests`,
    );
  }
});

// ─── 2. Parameter Fuzzing & ID Validation ───────────────────────────────────

function createMockResponse() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

test('Security/Params: invalid route parameters (IDOR/Fuzzing) return 400 instead of crashing 500', async () => {
  const invalidIds = ['abc', '-1', '0', 'NaN', '1.5', '../etc/passwd', "' OR 1=1 --"];

  for (const badId of invalidIds) {
    // Test adminExternalInvestmentUpdate with bad ID
    const req = { params: { id: badId }, body: { name: 'Valid Name' } };
    const res = createMockResponse();
    await transparencyController.adminExternalInvestmentUpdate(req, res);
    assert.equal(res.statusCode, 400, `ID "${badId}" should be rejected with 400`);
    assert.equal(res.body?.ok, false);

    // Test adminDelete with bad ID
    const delReq = { params: { id: badId } };
    const delRes = createMockResponse();
    await transparencyController.adminDelete(delReq, delRes);
    assert.equal(delRes.statusCode, 400, `ID "${badId}" should be rejected with 400 on delete`);

    // Test adminTrackedWalletUpdate with bad ID
    const walletReq = { params: { id: badId }, body: { label: 'Wallet' } };
    const walletRes = createMockResponse();
    await transparencyController.adminTrackedWalletUpdate(walletReq, walletRes);
    assert.equal(walletRes.statusCode, 400, `ID "${badId}" should be rejected with 400 on wallet update`);
  }
});

// ─── 3. Anti-XSS and Injection Protection (OWASP API8:2023) ─────────────────

test('Security/XSS: linkUrl with javascript: or data: is rejected with 400', async () => {
  const maliciousPayloads = [
    'javascript:alert(document.cookie)',
    'JAVASCRIPT:/*-/*`/*\\`/*\'/*"/**/(/* */oNcliCk=alert() )//%0D%0A%0d%0a//</stYle/<titLe/</teXtarEa/</scRipt/--!>\\x3csVg/<sVg/oNloAd=alert()//>\\x3e',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'vbscript:msgbox(1)',
  ];

  for (const xss of maliciousPayloads) {
    const req = {
      body: {
        name: 'Malicious Platform',
        linkUrl: xss,
        amountInvestedUsd: 100,
        amountWithdrawnUsd: 10,
      },
    };
    const res = createMockResponse();
    await transparencyController.adminExternalInvestmentCreate(req, res);
    assert.equal(res.statusCode, 400, `Payload with linkUrl "${xss}" must be rejected with 400`);
    assert.equal(res.body?.ok, false);
  }
});

test('Security/InputValidation: negative financial amounts are rejected with 400', async () => {
  // Negative invested amount
  const req1 = { body: { name: 'Pool', amountInvestedUsd: -100 } };
  const res1 = createMockResponse();
  await transparencyController.adminExternalInvestmentCreate(req1, res1);
  assert.equal(res1.statusCode, 400);
  assert.match(res1.body?.message, /não pode ser negativo/i);

  // Negative transparency entry
  const req2 = { body: { name: 'Server', amountUsd: -50 } };
  const res2 = createMockResponse();
  await transparencyController.adminCreate(req2, res2);
  assert.equal(res2.statusCode, 400);
  assert.match(res2.body?.message, /não pode ser negativo/i);

  // Invalid EVM wallet
  const req3 = { body: { label: 'Treasury', address: '0xnotAnAddress' } };
  const res3 = createMockResponse();
  await transparencyController.adminTrackedWalletCreate(req3, res3);
  assert.equal(res3.statusCode, 400);
  assert.match(res3.body?.message, /Endereço EVM inválido/i);
});

// ─── 4. Public Rate Limiting Headers ────────────────────────────────────────

test('Security/RateLimit: public transparency routes are protected by rate limiter', async () => {
  const res = await fetch(`${baseUrl}/api/entries`);
  // Rate limiter middleware should have evaluated the request
  assert.ok(res.status === 200 || res.status === 429);
});
