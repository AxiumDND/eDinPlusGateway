// TCP session rules for the NPU gateway (Volume 1: max 4 raw TCP sessions).
// Always FIN-close. destroy() is a last resort — a RST can leave the slot occupied.

const NPU_MAX_TCP_SESSIONS = 4;
const TCP_CLOSE_GRACE_MS = 2000;
const TCP_ONESHOT_IDLE_MS = 250;
const TCP_ONESHOT_TIMEOUT_MS = 5000;

function shouldPersistTcp(connection) {
  return String(connection || '').toLowerCase() === 'tcp';
}

function isSocketOpen(socket) {
  return !!(socket && !socket.destroyed);
}

function sameTcpTarget(current, ip, port) {
  if (!current) return false;
  return current.ip === ip && Number(current.port) === Number(port);
}

function closeTcpSocket(socket, opts) {
  const graceMs = opts && opts.graceMs != null ? opts.graceMs : TCP_CLOSE_GRACE_MS;
  const schedule = (opts && opts.schedule) || ((fn, ms) => setTimeout(fn, ms));
  return new Promise(resolve => {
    if (!isSocketOpen(socket)) {
      resolve({ closed: true, method: 'already' });
      return;
    }

    let done = false;
    let forcedDestroy = false;
    const finish = (method) => {
      if (done) return;
      done = true;
      resolve({ closed: true, method });
    };

    socket.once('close', () => finish(forcedDestroy ? 'destroy' : 'end'));

    try {
      if (typeof socket.end === 'function') {
        socket.end();
      } else {
        forcedDestroy = true;
        socket.destroy();
        return;
      }
    } catch (err) {
      forcedDestroy = true;
      try { socket.destroy(); } catch (destroyErr) { /* ignore */ }
      if (!done) finish('destroy');
      return;
    }

    schedule(() => {
      if (done) return;
      if (isSocketOpen(socket) && typeof socket.destroy === 'function') {
        forcedDestroy = true;
        try { socket.destroy(); } catch (err) { /* ignore */ }
        return;
      }
      finish('destroy');
    }, graceMs);
  });
}

module.exports = {
  NPU_MAX_TCP_SESSIONS,
  TCP_CLOSE_GRACE_MS,
  TCP_ONESHOT_IDLE_MS,
  TCP_ONESHOT_TIMEOUT_MS,
  shouldPersistTcp,
  isSocketOpen,
  sameTcpTarget,
  closeTcpSocket
};
