/**
 * Cliente do Jev (TypeSafe) via Decisions API do OpenRouter.
 * A chave fica só no servidor. Sem chave, as chamadas não saem.
 */

const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
export const JEV_MODEL = 'typesafe/jev-1.13';
const DEFAULT_TIMEOUT_MS = 8000;

let storedOpenRouterKey = '';

export function setStoredOpenRouterKey(key) {
  storedOpenRouterKey = key && String(key).trim() ? String(key).trim() : '';
  return !!storedOpenRouterKey;
}

export function getStoredOpenRouterKey() {
  return storedOpenRouterKey;
}

export function getOpenRouterApiKey() {
  if (storedOpenRouterKey) return storedOpenRouterKey;
  const key = process.env.OPENROUTER_API_KEY;
  return key && String(key).trim() ? String(key).trim() : '';
}

export function openRouterKeyStatus() {
  const key = getOpenRouterApiKey();
  return {
    configured: !!key,
    source: storedOpenRouterKey ? 'saved' : (key ? 'env' : 'missing'),
    // Só os 4 últimos caracteres: o suficiente para o herói reconhecer a chave
    // sem devolver metade do segredo ao navegador.
    hint: key ? `••••${key.slice(-4)}` : ''
  };
}

function recordTrace(options, entry) {
  if (!Array.isArray(options?.trace)) return;
  options.trace.push({
    at: new Date().toISOString(),
    ...entry
  });
}

export function hasOpenRouterApiKey() {
  return !!getOpenRouterApiKey();
}

/**
 * @param {object} body
 * @param {{ timeoutMs?: number, fetchImpl?: typeof fetch }} [options]
 */
export async function callJevDecisions(body, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const apiKey = options.apiKey !== undefined ? options.apiKey : getOpenRouterApiKey();
  if (!apiKey && !options.fetchImpl) {
    const error = new Error('OPENROUTER_API_KEY ausente');
    error.code = 'NO_KEY';
    throw error;
  }
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const request = { model: JEV_MODEL, ...body };
  try {
    const response = await fetchImpl(DECISIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey || 'test'}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request),
      signal: controller.signal
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(json?.error?.message || `Jev respondeu ${response.status}`);
      error.code = 'HTTP';
      error.status = response.status;
      error.payload = json;
      // Um registro por chamada: o catch abaixo não registra de novo.
      recordTrace(options, {
        step: options.step || 'decision',
        request,
        response: json,
        status: response.status,
        ok: false,
        error: error.message
      });
      throw error;
    }
    recordTrace(options, {
      step: options.step || 'decision',
      request,
      response: json,
      status: response.status,
      ok: true
    });
    return json;
  } catch (err) {
    if (err?.code === 'HTTP') throw err;
    const timedOut = err?.name === 'AbortError';
    recordTrace(options, {
      step: options.step || 'decision',
      request,
      response: null,
      ok: false,
      error: timedOut ? 'Tempo esgotado' : (err?.message || 'Falha na chamada')
    });
    if (timedOut) {
      const error = new Error('Jev excedeu o tempo limite');
      error.code = 'TIMEOUT';
      throw error;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
