/**
 * Sala de Bate Papo.
 * A chave do OpenRouter nunca sai do servidor. Cada convocação recebe o
 * histórico inteiro até aquele ponto e responde em no máximo 60 palavras.
 */

export const CHAT_WORD_LIMIT = 60;
/** Folga para o raciocínio. 180 tokens faziam o Haiku 5.5 pensar até o fim e devolver texto vazio. */
export const CHAT_MAX_OUTPUT_TOKENS = 2048;
export const CHAT_RETRY_OUTPUT_TOKENS = 8192;
export const CHAT_MAX_ROOMS = 40;
export const CHAT_MAX_MESSAGES = 400;
export const CHAT_MAX_PARTICIPANTS = 24;
export const CHAT_MAX_CONTENT = 8000;
export const CHAT_MAX_TITLE = 80;
export const CHAT_MAX_LABEL = 60;
export const MODEL_CACHE_MS = 10 * 60 * 1000;

export const CHAT_MODELS_URL = 'https://openrouter.ai/api/v1/models';
export const CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

const ROLE_LABELS = {
  user: 'Você',
  assistant: 'Modelo'
};

export function countWords(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Corta no limite de palavras, de preferência no fim de uma frase.
 * O limite é absoluto: nenhum caminho devolve mais palavras do que o pedido.
 */
export function limitWords(text, maxWords = CHAT_WORD_LIMIT) {
  const limit = Math.max(1, Math.round(Number(maxWords) || CHAT_WORD_LIMIT));
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const words = cleaned.split(' ').filter(Boolean);
  if (words.length <= limit) return cleaned;

  const slice = words.slice(0, limit);
  const joined = slice.join(' ');
  const sentenceEnd = Math.max(joined.lastIndexOf('. '), joined.lastIndexOf('! '), joined.lastIndexOf('? '));
  if (sentenceEnd >= Math.floor(joined.length * 0.45)) {
    return joined.slice(0, sentenceEnd + 1).trim();
  }
  return `${joined.replace(/[.,;:!?-]+$/, '')}…`;
}

export function chatSystemPrompt(participant) {
  const name = String(participant?.label || participant?.modelId || 'modelo').trim();
  return [
    `Você é ${name} na Sala de Bate Papo do Grimório.`,
    'Responda sempre em português.',
    `Sua resposta deve ter no máximo ${CHAT_WORD_LIMIT} palavras. Nunca ultrapasse esse limite.`,
    'Seja direto. Não repita o histórico. Não cumprimente de novo se a conversa já começou.',
    'Você vê as falas do herói e de todos os outros modelos. Responda ao que foi dito até agora, inclusive ao que os outros modelos disseram.',
    'Não finja ser outro participante.'
  ].join(' ');
}

export function publicChatMessage(message) {
  if (!message || typeof message !== 'object') return null;
  return {
    id: String(message.id || ''),
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: String(message.content || ''),
    modelId: message.modelId ? String(message.modelId) : null,
    label: message.label ? String(message.label) : null,
    wordCount: countWords(message.content),
    createdAt: message.createdAt || null,
    error: message.error ? String(message.error) : null
  };
}

export function publicChatRoom(room) {
  if (!room || typeof room !== 'object') return null;
  const participants = Array.isArray(room.participants) ? room.participants.map(publicParticipant).filter(Boolean) : [];
  const messages = Array.isArray(room.messages) ? room.messages.map(publicChatMessage).filter(Boolean) : [];
  return {
    id: String(room.id || ''),
    title: String(room.title || 'Sala sem título'),
    participants,
    messages,
    createdAt: room.createdAt || null,
    updatedAt: room.updatedAt || null
  };
}

export function publicParticipant(participant) {
  if (!participant || typeof participant !== 'object') return null;
  const modelId = String(participant.modelId || '').trim();
  if (!modelId) return null;
  return {
    modelId,
    label: String(participant.label || modelLabelFromId(modelId)).slice(0, CHAT_MAX_LABEL),
    color: sanitizeColor(participant.color)
  };
}

export function modelLabelFromId(modelId) {
  const id = String(modelId || '').trim();
  const slash = id.lastIndexOf('/');
  const raw = slash >= 0 ? id.slice(slash + 1) : id;
  return raw.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, CHAT_MAX_LABEL) || 'Modelo';
}

const PARTICIPANT_COLORS = ['#f59e0b', '#38bdf8', '#a78bfa', '#34d399', '#fb7185', '#fbbf24', '#22d3ee', '#c084fc'];

export function colorForIndex(index) {
  return PARTICIPANT_COLORS[Math.abs(Number(index) || 0) % PARTICIPANT_COLORS.length];
}

function sanitizeColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
}

function cleanText(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function sanitizeChatRoom(room) {
  if (!room || typeof room !== 'object') return null;
  const id = cleanText(room.id, 80);
  if (!id) return null;
  const participants = [];
  const seen = new Set();
  for (const item of Array.isArray(room.participants) ? room.participants : []) {
    const modelId = cleanText(item?.modelId, 160);
    if (!modelId || seen.has(modelId) || participants.length >= CHAT_MAX_PARTICIPANTS) continue;
    seen.add(modelId);
    participants.push({
      modelId,
      label: cleanText(item.label, CHAT_MAX_LABEL) || modelLabelFromId(modelId),
      color: sanitizeColor(item.color) || colorForIndex(participants.length)
    });
  }
  const messages = [];
  for (const item of Array.isArray(room.messages) ? room.messages : []) {
    if (!item || typeof item !== 'object' || messages.length >= CHAT_MAX_MESSAGES) continue;
    const role = item.role === 'assistant' ? 'assistant' : 'user';
    const content = String(item.content || '').trim().slice(0, CHAT_MAX_CONTENT);
    if (!content && !item.error) continue;
    messages.push({
      id: cleanText(item.id, 80) || `msg-${messages.length}`,
      role,
      content: role === 'assistant' ? limitWords(content) : content,
      modelId: item.modelId ? cleanText(item.modelId, 160) : null,
      label: item.label ? cleanText(item.label, CHAT_MAX_LABEL) : null,
      createdAt: item.createdAt || null,
      error: item.error ? cleanText(item.error, 300) : null
    });
  }
  return {
    id,
    title: cleanText(room.title, CHAT_MAX_TITLE) || 'Nova sala',
    participants,
    messages,
    createdAt: room.createdAt || null,
    updatedAt: room.updatedAt || null
  };
}

export function sanitizeChatRooms(list) {
  if (!Array.isArray(list)) return [];
  return list.map(sanitizeChatRoom).filter(Boolean).slice(0, CHAT_MAX_ROOMS);
}

export function buildChatTranscript(messages, participant) {
  // Tudo vai como fala do usuário, com o nome de quem disse. Se as respostas
  // dos outros modelos fossem role=assistant, a API trataria como se o modelo
  // convocado tivesse dito aquilo.
  const lines = (Array.isArray(messages) ? messages : [])
    .filter((item) => item && item.content && !item.error)
    .map((item) => {
      const who = item.role === 'user'
        ? ROLE_LABELS.user
        : (item.label || modelLabelFromId(item.modelId) || ROLE_LABELS.assistant);
      return `[${who}]: ${String(item.content)}`;
    });
  lines.push('Manifeste-se agora sobre o que foi dito até aqui, em no máximo 60 palavras.');
  return [
    { role: 'system', content: chatSystemPrompt(participant) },
    { role: 'user', content: lines.join('\n\n') }
  ];
}

function textFromContent(content) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      if (part.type === 'reasoning' || part.type === 'thinking') return '';
      return part.text || part.content || '';
    }).join(' ').trim();
  }
  return '';
}

export function extractCompletionText(payload) {
  const choice = payload?.choices?.[0];
  const message = choice?.message || {};
  return textFromContent(message.content ?? choice?.text ?? '')
    || textFromContent(message.reasoning || message.reasoning_content || '');
}

export function chatCompletionBody(participant, messages, maxTokens = CHAT_MAX_OUTPUT_TOKENS) {
  return {
    model: participant.modelId,
    messages: buildChatTranscript(messages, participant),
    max_tokens: maxTokens,
    // Sem temperature: o Haiku 5.5 recusa qualquer valor diferente de 1.
    // Esforço baixo deixa espaço para a resposta; exclude não devolve o raciocínio.
    reasoning: { effort: 'low', exclude: true }
  };
}

export function normalizeOpenRouterModel(model) {
  const id = String(model?.id || '').trim();
  if (!id) return null;
  return {
    id,
    name: String(model.name || modelLabelFromId(id)).slice(0, 120),
    contextLength: Number(model.context_length) || null
  };
}

let modelCache = { at: 0, keyHint: '', models: [] };

export function clearChatModelCache() {
  modelCache = { at: 0, keyHint: '', models: [] };
}

export async function listOpenRouterModels(apiKey, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const hint = String(apiKey || '').slice(-4);
  const fresh = Date.now() - modelCache.at < MODEL_CACHE_MS && modelCache.keyHint === hint && modelCache.models.length;
  if (fresh && !options.force) return modelCache.models;
  const response = await fetchImpl(CHAT_MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json?.error?.message || `OpenRouter respondeu ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const models = (Array.isArray(json.data) ? json.data : [])
    .map(normalizeOpenRouterModel)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  modelCache = { at: Date.now(), keyHint: hint, models };
  return models;
}

async function postChatCompletion({ apiKey, body, timeoutMs, fetchImpl }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://grimorio.local',
        'X-Title': 'Grimorio Sala de Bate Papo'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const json = await response.json().catch(() => ({}));
    return { response, json };
  } finally {
    clearTimeout(timer);
  }
}

function emptyCompletionError(json) {
  const reason = json?.choices?.[0]?.finish_reason || json?.choices?.[0]?.native_finish_reason;
  const error = new Error(
    reason === 'length'
      ? 'O modelo gastou o limite pensando e não chegou a responder. Tente de novo.'
      : 'O modelo não devolveu texto.'
  );
  error.status = 502;
  return error;
}

export async function completeChatTurn({ apiKey, participant, messages, timeoutMs = 45000, fetchImpl = fetch }) {
  try {
    const firstBody = chatCompletionBody(participant, messages);
    let { response, json } = await postChatCompletion({
      apiKey,
      body: firstBody,
      timeoutMs,
      fetchImpl
    });
    if (!response.ok) {
      const error = new Error(json?.error?.message || `OpenRouter respondeu ${response.status}`);
      error.status = response.status;
      throw error;
    }
    let limited = limitWords(extractCompletionText(json));
    const spentOnThinking = !limited && (json?.choices?.[0]?.finish_reason === 'length');
    if (spentOnThinking) {
      ({ response, json } = await postChatCompletion({
        apiKey,
        body: chatCompletionBody(participant, messages, CHAT_RETRY_OUTPUT_TOKENS),
        timeoutMs,
        fetchImpl
      }));
      if (!response.ok) {
        const error = new Error(json?.error?.message || `OpenRouter respondeu ${response.status}`);
        error.status = response.status;
        throw error;
      }
      limited = limitWords(extractCompletionText(json));
    }
    if (!limited) throw emptyCompletionError(json);
    return {
      content: limited,
      wordCount: countWords(limited)
    };
  } catch (err) {
    if (err?.name === 'AbortError') {
      const error = new Error('O modelo excedeu o tempo limite.');
      error.status = 504;
      throw error;
    }
    throw err;
  }
}
