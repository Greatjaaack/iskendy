/* global URL, console */
import assert from 'node:assert/strict';
import { request } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const origin = 'http://127.0.0.1:8103';
const results = [];
const client = await request.newContext({
  baseURL: origin,
  extraHTTPHeaders: { 'X-Forwarded-For': '192.0.2.31' },
});
async function post(api, body, owner = client) {
  return owner.post(api, { data: body });
}
try {
  for (const path of [
    '/',
    '/board',
    '/tv',
    '/staff',
    '/stats',
    '/api/status',
  ]) {
    const response = await client.get(path);
    assert.equal(response.status(), 200);
    const headers = response.headers();
    assert.ok(headers['content-security-policy'].includes("script-src 'self'"));
    assert.equal(headers['x-frame-options'], 'SAMEORIGIN');
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['referrer-policy'], 'same-origin');
    if (path !== '/')
      assert.equal(headers['x-robots-tag'], 'noindex, nofollow, noarchive');
    results.push({ check: 'headers and route', path, passed: true });
  }
  const board = await (await client.get('/api/status')).json();
  assert.ok(board.orders.some((o) => o.number === 102 && o.status === 'ready'));
  assert.ok(
    board.orders.some((o) => o.number === 110 && o.status === 'preparing'),
  );
  assert.ok(!board.orders.some((o) => o.number === 993));
  results.push({
    check: 'status ready/preparing; served excluded',
    passed: true,
  });
  const config = await (await client.get('/api/feedback/config')).json();
  assert.equal(typeof config.promptDelaySec, 'number');
  assert.equal(typeof config.links, 'object');
  const reportingCodes = [];
  for (let i = 0; i < 31; i++)
    reportingCodes.push(
      (
        await post('/api/client/event', {
          kind: 'offline',
          screen: 'synthetic-check',
        })
      ).status(),
    );
  assert.equal(reportingCodes.filter((c) => c === 200).length, 30);
  assert.equal(reportingCodes[30], 429);
  const claimCodes = [];
  for (let i = 0; i < 11; i++) {
    const response = await post('/api/guest/claim', {
      number: 400 + i,
      guest: 'synthetic-limiter-' + i,
    });
    claimCodes.push(response.status());
    if (i < 10) assert.equal((await response.json()).ok, true);
  }
  assert.equal(claimCodes.filter((c) => c === 200).length, 10);
  assert.equal(claimCodes[10], 429);
  assert.equal(
    (
      await post('/api/guest/event', {
        step: 'open',
        session: 'synthetic-limiter',
      })
    ).status(),
    200,
  );
  assert.equal(
    (await client.get('/api/feedback/check?number=993')).status(),
    200,
  );
  results.push({
    check:
      'client/event 30+429 does not consume claim 10+429; guest event/read unaffected',
    reportingCodes,
    claimCodes,
    passed: true,
  });
  const guest = await request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { 'X-Forwarded-For': '192.0.2.32' },
  });
  try {
    assert.equal(
      (
        await (
          await post('/api/feedback', { number: 993, rating: 5 }, guest)
        ).json()
      ).reason,
      'not_claimed',
    );
    const claimed = await (
      await post(
        '/api/guest/claim',
        { number: 993, guest: 'synthetic-contract' },
        guest,
      )
    ).json();
    assert.equal(claimed.ok, true);
    const repeated = await (
      await post(
        '/api/guest/claim',
        { number: 993, guest: 'synthetic-contract' },
        guest,
      )
    ).json();
    assert.ok(
      repeated.claimToken === claimed.claimToken &&
        claimed.claimToken.length > 0,
    );
    assert.equal(
      (
        await (
          await post(
            '/api/guest/claim',
            { number: 993, guest: 'synthetic-other' },
            guest,
          )
        ).json()
      ).reason,
      'taken',
    );
    const active = await (
      await post(
        '/api/guest/claim',
        { number: 110, guest: 'synthetic-contract' },
        guest,
      )
    ).json();
    assert.equal(
      (
        await (
          await post(
            '/api/feedback',
            { number: 110, rating: 5, claim_token: active.claimToken },
            guest,
          )
        ).json()
      ).reason,
      'not_served',
    );
    const created = await (
      await post(
        '/api/feedback',
        { number: 993, rating: 5, claim_token: claimed.claimToken },
        guest,
      )
    ).json();
    assert.equal(created.ok, true);
    assert.equal(created.branch, 'positive');
    assert.equal(
      (
        await (
          await post(
            '/api/feedback',
            { number: 993, rating: 5, claim_token: claimed.claimToken },
            guest,
          )
        ).json()
      ).reason,
      'already',
    );
    const changed = await (
      await post(
        '/api/feedback/rate',
        {
          feedback_id: created.feedbackId,
          edit_token: created.editToken,
          rating: 1,
        },
        guest,
      )
    ).json();
    assert.equal(changed.ok, true);
    assert.equal(changed.branch, 'negative');
    assert.equal(
      (
        await (
          await post(
            '/api/feedback/detail',
            {
              feedback_id: created.feedbackId,
              edit_token: created.editToken,
              tags: ['Остыло'],
              comment: 'Synthetic API check',
            },
            guest,
          )
        ).json()
      ).ok,
      true,
    );
    assert.equal(
      (
        await (
          await post(
            '/api/feedback/rate',
            {
              feedback_id: created.feedbackId,
              edit_token: created.editToken,
              rating: 5,
            },
            guest,
          )
        ).json()
      ).reason,
      'locked',
    );
    assert.equal(
      (await (await guest.get('/api/feedback/check?number=993')).json()).reason,
      'already',
    );
    assert.equal(
      (
        await post(
          '/api/guest/claim',
          { number: 0, guest: 'synthetic-contract' },
          guest,
        )
      ).status(),
      422,
    );
    results.push({
      check:
        'claim idempotence/taken; feedback not_claimed/not_served/create/already/rate/detail/locked; invalid number',
      passed: true,
    });
  } finally {
    await guest.dispose();
  }
  await writeFile(
    new URL('http-contract-result.json', import.meta.url),
    JSON.stringify(
      {
        origin,
        backendCommit: '166f35d63366a0da6551158fee4f2ba9760473c5',
        syntheticOnly: true,
        results,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'PASS: route/CSP/status/claim/feedback and independent client/event/claim limiter checks. No tokens logged.',
  );
} finally {
  await client.dispose();
}
