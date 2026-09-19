const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('../gateway-http.js');

test('HTTP is the default path; TCP only when Setup forces it', () => {
  assert.equal(http.shouldSendViaTcpOnly('http'), false);
  assert.equal(http.shouldSendViaTcpOnly(''), false);
  assert.equal(http.shouldSendViaTcpOnly(undefined), false);
  assert.equal(http.shouldSendViaTcpOnly('tcp'), true);
  assert.equal(http.shouldSendViaTcpOnly('TCP'), true);
});

test('skip HTTP for a cooldown after a failure', () => {
  const now = 1_000_000;
  assert.equal(http.shouldSkipHttp(0, now), false);
  assert.equal(http.shouldSkipHttp(now + 1, now), true);
  assert.equal(http.shouldSkipHttp(now, now), false);
  assert.equal(http.nextHttpUnavailableUntil(now, 30_000), now + 30_000);
});

test('POST URL and TCP fallback port', () => {
  assert.equal(http.gatewayPostUrl('192.168.1.50', 80), 'http://192.168.1.50:80/gateway?');
  assert.equal(http.gatewayPostUrl('http://npu.local/extra', 80), 'http://npu.local:80/gateway?');
  assert.equal(http.TCP_FALLBACK_PORT, 26);
});

test('postGatewayCommand rejects non-OK status', async () => {
  const fetchFn = async () => ({ ok: false, status: 503, text: async () => 'busy' });
  await assert.rejects(
    () => http.postGatewayCommand(fetchFn, 'http://npu/gateway?', '$OK;', 1000),
    /HTTP 503/
  );
});

test('postGatewayCommand returns body when OK', async () => {
  const fetchFn = async (url, opts) => {
    assert.equal(opts.method, 'POST');
    assert.equal(opts.body, '$OK;');
    assert.equal(opts.timeout, 1000);
    return { ok: true, status: 200, text: async () => '!OK;' };
  };
  assert.equal(await http.postGatewayCommand(fetchFn, 'http://npu/gateway?', '$OK;', 1000), '!OK;');
});
