/**
 * Cliente do Jev (TypeSafe) via Decisions API do OpenRouter.
 * A chave fica só no servidor. Sem chave, as chamadas não saem.
 */

const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
export const JEV_MODEL = 'typesafe/jev-1.13';
const DEFAULT_TIMEOUT_MS = 8000;

export function getOpenRouterApiKey() {
  const key = process.env.OPENROUTER_API_KEY;
  return key && String(key).trim() ? String(key).trim() : '';
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
  try {
    const response = await fetchImpl(DECISIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey || 'test'}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: JEV_MODEL, ...body }),
      signal: controller.signal
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(json?.error?.message || `Jev respondeu ${response.status}`);
      error.code = 'HTTP';
      error.status = response.status;
      error.payload = json;
      throw error;
    }
    return json;
  } catch (err) {
    if (err?.name === 'AbortError') {
      const error = new Error('Jev excedeu o tempo limite');
      error.code = 'TIMEOUT';
      throw error;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
