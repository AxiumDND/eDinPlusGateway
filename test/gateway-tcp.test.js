const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const tcp = require('../gateway-tcp.js');

function fakeSocket(opts) {
  const socket = new EventEmitter();
  socket.destroyed = false;
  socket.endCalls = 0;
  socket.destroyCalls = 0;
  socket.end = function end() {
    socket.endCalls += 1;
    if (opts && opts.endCloses) {
      socket.destroyed = true;
      socket.emit('close');
    }
  };
  socket.destroy = function destroy() {
    socket.destroyCalls += 1;
    socket.destroyed = true;
    socket.emit('close');
  };
  return socket;
}

test('persist TCP only in TCP-only Setup mode', () => {
  assert.equal(tcp.shouldPersistTcp('http'), false);
  assert.equal(tcp.shouldPersistTcp(''), false);
  assert.equal(tcp.shouldPersistTcp('tcp'), true);
  assert.equal(tcp.NPU_MAX_TCP_SESSIONS, 4);
});

test('sameTcpTarget reuses one session per IP/port', () => {
  assert.equal(tcp.sameTcpTarget({ ip: '10.0.0.8', port: 26 }, '10.0.0.8', 26), true);
  assert.equal(tcp.sameTcpTarget({ ip: '10.0.0.8', port: 26 }, '10.0.0.9', 26), false);
  assert.equal(tcp.sameTcpTarget(null, '10.0.0.8', 26), false);
});

test('closeTcpSocket FIN-closes and does not destroy when end completes', async () => {
  const socket = fakeSocket({ endCloses: true });
  const result = await tcp.closeTcpSocket(socket, { graceMs: 50, schedule: () => 0 });
  assert.equal(result.method, 'end');
  assert.equal(socket.endCalls, 1);
  assert.equal(socket.destroyCalls, 0);
});

test('closeTcpSocket destroys only after the grace period', async () => {
  const socket = fakeSocket({ endCloses: false });
  let delayed;
  const pending = tcp.closeTcpSocket(socket, {
    graceMs: 10,
    schedule: (fn) => { delayed = fn; }
  });
  assert.equal(socket.endCalls, 1);
  assert.equal(socket.destroyCalls, 0);
  delayed();
  const result = await pending;
  assert.equal(result.method, 'destroy');
  assert.equal(socket.destroyCalls, 1);
});

test('closeTcpSocket is a no-op on a missing or already-dead socket', async () => {
  assert.deepEqual(await tcp.closeTcpSocket(null), { closed: true, method: 'already' });
  const dead = fakeSocket();
  dead.destroyed = true;
  assert.deepEqual(await tcp.closeTcpSocket(dead), { closed: true, method: 'already' });
  assert.equal(dead.endCalls, 0);
});
