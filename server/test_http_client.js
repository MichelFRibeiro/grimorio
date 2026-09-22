import assert from 'assert';
import {
  isTransientHttpStatus,
  parseRetryAfterMs,
  retryDelayMs,
  fetchWithRetry,
  connectionErrorMessage
} from '../src/utils/httpClient.js';

function run() {
  console.log('🧪 Testando cliente HTTP resiliente...\n');

  assert.strictEqual(isTransientHttpStatus(429), true);
  assert.strictEqual(isTransientHttpStatus(502), true);
  assert.strictEqual(isTransientHttpStatus(503), true);
  assert.strictEqual(isTransientHttpStatus(404), false);
  assert.strictEqual(isTransientHttpStatus(200), false);
  console.log('✅ 429/502/503 são tratados como erros transitórios.');

  assert.strictEqual(parseRetryAfterMs('2'), 2000);
  assert.strictEqual(parseRetryAfterMs('0.5'), 500);
  const later = new Date(Date.now() + 4000).toUTCString();
  const fromDate = parseRetryAfterMs(later);
  assert.ok(fromDate != null && fromDate <= 4000 && fromDate >= 0);
  console.log('✅ parseRetryAfterMs lê segundos e datas HTTP.');

  const delayed = retryDelayMs(0, '1', Date.now());
  assert.ok(delayed >= 400);
  assert.ok(delayed <= 1000);
  console.log('✅ retryDelayMs respeita Retry-After.');

  assert.match(connectionErrorMessage(null, 502), /acordando|indisponível/);
  assert.match(connectionErrorMessage(null, 429), /ocupado|requisições/);
  console.log('✅ Mensagens de conexão distinguem 502/503 de 429.');

  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls < 3) {
      return { ok: false, status: 503, headers: { get: () => '0' } };
    }
    return { ok: true, status: 200, headers: { get: () => null } };
  };

  return fetchWithRetry('/api/state', {}, { retries: 4 }).then((res) => {
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls, 3);
    console.log('✅ fetchWithRetry recupera após 503 transitório.');
    console.log('\n🎉 TODOS OS TESTES DO CLIENTE HTTP PASSARAM!');
  }).finally(() => {
    globalThis.fetch = originalFetch;
  });
}

run();
