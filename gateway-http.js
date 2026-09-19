// HTTP-first gateway transport helpers (Volume 1: POST /gateway?, TCP port 26 fallback)

const HTTP_TIMEOUT_MS = 5000;
const HTTP_RETRY_AFTER_MS = 30000;
const TCP_FALLBACK_PORT = 26;

function shouldSendViaTcpOnly(connection) {
  return String(connection || '').toLowerCase() === 'tcp';
}

function shouldSkipHttp(httpUnavailableUntil, now) {
  return Number(now || Date.now()) < Number(httpUnavailableUntil || 0);
}

function nextHttpUnavailableUntil(now, retryAfterMs) {
  return Number(now || Date.now()) + Number(retryAfterMs || HTTP_RETRY_AFTER_MS);
}

function gatewayPostUrl(ip, port) {
  const host = String(ip || '').replace(/^https?:\/\//, '').split('/')[0];
  return `http://${host}:${port || 80}/gateway?`;
}

function postGatewayCommand(fetchFn, url, command, timeoutMs) {
  const ms = timeoutMs == null ? HTTP_TIMEOUT_MS : timeoutMs;
  return fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: command,
    timeout: ms
  }).then(response => {
    return response.text().then(text => {
      if (!response.ok) {
        const err = new Error('HTTP ' + response.status);
        err.status = response.status;
        err.body = text;
        throw err;
      }
      return text;
    });
  });
}

module.exports = {
  HTTP_TIMEOUT_MS,
  HTTP_RETRY_AFTER_MS,
  TCP_FALLBACK_PORT,
  shouldSendViaTcpOnly,
  shouldSkipHttp,
  nextHttpUnavailableUntil,
  gatewayPostUrl,
  postGatewayCommand
};
