const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export function isTransientHttpStatus(status) {
  return TRANSIENT_STATUS.has(Number(status));
}

export function parseRetryAfterMs(retryAfter, now = Date.now()) {
  if (retryAfter == null || retryAfter === '') return null;
  const asNumber = Number(retryAfter);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.min(30_000, asNumber * 1000);
  }
  const asDate = Date.parse(retryAfter);
  if (!Number.isNaN(asDate)) {
    return Math.min(30_000, Math.max(0, asDate - now));
  }
  return null;
}

export function retryDelayMs(attempt = 0, retryAfter, now = Date.now()) {
  const fromHeader = parseRetryAfterMs(retryAfter, now);
  if (fromHeader != null) return Math.max(400, fromHeader);
  const exp = Math.min(20_000, 1_200 * (2 ** Math.max(0, attempt)));
  const jitter = Math.floor(Math.random() * 400);
  return exp + jitter;
}

export function sleep(ms, signal) {
  const duration = Math.max(0, Number(ms) || 0);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      return;
    }
    const timer = setTimeout(resolve, duration);
    if (!signal) return;
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function isAbortError(err) {
  return err?.name === 'AbortError' || err?.code === 'ABORT_ERR';
}

/**
 * fetch com retry em erros transitórios (502/503/429/rede).
 * Não relança AbortError como falha de conexão.
 */
export async function fetchWithRetry(url, options = {}, config = {}) {
  const {
    retries = 5,
    retryOn = (res) => res && isTransientHttpStatus(res.status),
    signal = options.signal
  } = config;

  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal?.aborted) {
      throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    }

    try {
      const res = await fetch(url, { ...options, signal });
      if (res.ok || attempt === retries || !retryOn(res)) return res;
      lastError = Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      await sleep(retryDelayMs(attempt, res.headers.get('Retry-After')), signal);
    } catch (err) {
      if (isAbortError(err)) throw err;
      lastError = err;
      if (attempt === retries) throw err;
      await sleep(retryDelayMs(attempt), signal);
    }
  }

  throw lastError || new Error('Falha ao comunicar com o servidor.');
}

export function connectionErrorMessage(err, status) {
  const code = status || err?.status;
  if (code === 429) {
    return 'O servidor está ocupado (muitas requisições). Aguarde um instante e tente novamente.';
  }
  if (code === 502 || code === 503 || code === 504) {
    return 'O servidor está acordando ou temporariamente indisponível. Aguarde alguns segundos e tente novamente.';
  }
  if (isAbortError(err)) return null;
  return err?.message || 'Falha ao comunicar com o servidor.';
}
