/**
 * Sala de Bate Papo: limite de 60 palavras, histórico compartilhado e
 * chave do OpenRouter só no servidor.
 */
import './testEnv.js';
import assert from 'node:assert/strict';
import http from 'node:http';
import { defaultDatabase, getDb, saveDb } from './db.js';
import { setStoredOpenRouterKey } from './jevClient.js';
import { createApp } from './index.js';
import {
  CHAT_WORD_LIMIT,
  buildChatTranscript,
  clearChatModelCache,
  countWords,
  limitWords,
  sanitizeChatRooms
} from './chatRoom.js';

let failed = 0;

function check(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(
        () => console.log(`✅ ${name}`),
        (err) => {
          failed += 1;
          console.error(`❌ ${name}\n   ${err.stack || err.message}`);
        }
      );
    }
    console.log(`✅ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`❌ ${name}\n   ${err.stack || err.message}`);
  }
  return Promise.resolve();
}

function freshDb() {
  const db = defaultDatabase();
  saveDb(db);
  setStoredOpenRouterKey('');
  clearChatModelCache();
  return getDb();
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function request(port, path, { method = 'GET', body, token } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function guestToken(port) {
  const res = await request(port, '/api/auth/guest', { method: 'POST', body: {} });
  assert.equal(res.status, 200);
  return res.data.token;
}

await check('limitWords nunca devolve mais de 60 palavras', () => {
  const long = Array.from({ length: 90 }, (_, index) => `palavra${index + 1}`).join(' ');
  const cut = limitWords(long);
  assert.equal(countWords(cut) <= CHAT_WORD_LIMIT, true);
  assert.equal(countWords(cut), CHAT_WORD_LIMIT);
  assert.match(cut, /…$/);

  const sentences = Array.from({ length: 12 }, (_, index) => `Frase ${index + 1} termina aqui.`).join(' ');
  const trimmed = limitWords(sentences);
  assert.equal(countWords(trimmed) <= CHAT_WORD_LIMIT, true);
  assert.match(trimmed, /\.$/);

  assert.equal(limitWords('  curta   resposta  '), 'curta resposta');
  assert.equal(limitWords(''), '');
});

await check('o histórico enviado inclui as falas de todos os modelos', () => {
  const transcript = buildChatTranscript([
    { role: 'user', content: 'O que é foco?' },
    { role: 'assistant', modelId: 'a/um', label: 'Modelo Um', content: 'Foco é escolher uma coisa.' },
    { role: 'assistant', modelId: 'b/dois', label: 'Modelo Dois', content: 'E recusar o resto.' }
  ], { modelId: 'c/tres', label: 'Modelo Três' });

  assert.equal(transcript[0].role, 'system');
  assert.match(transcript[0].content, /60 palavras/);
  assert.match(transcript[0].content, /Modelo Três/);
  const joined = transcript.map((item) => item.content).join('\n');
  assert.match(joined, /O que é foco/);
  assert.match(joined, /\[Modelo Um\]: Foco é escolher uma coisa/);
  assert.match(joined, /\[Modelo Dois\]: E recusar o resto/);
  assert.equal(transcript.filter((item) => item.role === 'assistant').length, 0);
  assert.equal(transcript.at(-1).role, 'user');
});

await check('sanitizeChatRooms corta resposta antiga acima do limite', () => {
  const rooms = sanitizeChatRooms([{
    id: 'chat-1',
    title: 'Sala',
    participants: [{ modelId: 'vendor/model', label: 'Modelo' }],
    messages: [{
      id: 'msg-1',
      role: 'assistant',
      content: Array.from({ length: 80 }, () => 'longa').join(' '),
      modelId: 'vendor/model'
    }]
  }]);
  assert.equal(countWords(rooms[0].messages[0].content) <= CHAT_WORD_LIMIT, true);
});

await check('a sala exige chave, guarda o histórico e corta a resposta do modelo', async () => {
  const db = freshDb();
  delete db.integrations;
  saveDb(db);
  setStoredOpenRouterKey('');
  const savedEnvKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null, authorization: options.headers?.Authorization });
    if (String(url).includes('/models')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: 'alpha/one', name: 'Alpha' }, { id: 'beta/two', name: 'Beta' }] })
      };
    }
    const verbose = Array.from({ length: 75 }, (_, index) => `verbo${index + 1}`).join(' ');
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: verbose } }] })
    };
  };

  const app = createApp();
  const server = await listen(app);
  try {
    const port = server.address().port;
    const token = await guestToken(port);

    const blocked = await request(port, '/api/chat/models', { token });
    assert.equal(blocked.status, 503);

    const saved = await request(port, '/api/integrations/openrouter', {
      method: 'PUT',
      token,
      body: { apiKey: 'sk-or-test-room-key' }
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.openRouter.configured, true);
    assert.equal(JSON.stringify(saved.data).includes('sk-or-test-room-key'), false);

    const models = await request(port, '/api/chat/models', { token });
    assert.equal(models.status, 200);
    assert.equal(models.data.models.length, 2);
    assert.match(calls.at(-1).authorization, /sk-or-test-room-key/);

    const empty = await request(port, '/api/chat/rooms', { method: 'POST', token, body: { title: 'Vazia' } });
    assert.equal(empty.status, 400);

    const created = await request(port, '/api/chat/rooms', {
      method: 'POST',
      token,
      body: {
        title: 'Conselho',
        participants: [
          { modelId: 'alpha/one', label: 'Alpha' },
          { modelId: 'beta/two', label: 'Beta' }
        ]
      }
    });
    assert.equal(created.status, 200);
    const roomId = created.data.room.id;

    const tooSoon = await request(port, `/api/chat/rooms/${roomId}/speak`, {
      method: 'POST',
      token,
      body: { modelId: 'alpha/one' }
    });
    assert.equal(tooSoon.status, 400);

    const spoken = await request(port, `/api/chat/rooms/${roomId}/messages`, {
      method: 'POST',
      token,
      body: { content: 'Qual o próximo passo?' }
    });
    assert.equal(spoken.status, 200);
    assert.equal(spoken.data.room.messages.length, 1);

    const alpha = await request(port, `/api/chat/rooms/${roomId}/speak`, {
      method: 'POST',
      token,
      body: { modelId: 'alpha/one' }
    });
    assert.equal(alpha.status, 200);
    assert.equal(countWords(alpha.data.message.content) <= CHAT_WORD_LIMIT, true);
    assert.equal(alpha.data.message.label, 'Alpha');
    const alphaCall = calls.filter((item) => String(item.url).includes('/chat/completions')).at(-1);
    assert.equal(alphaCall.body.model, 'alpha/one');
    assert.match(alphaCall.body.messages.map((item) => item.content).join('\n'), /Qual o próximo passo/);

    const beta = await request(port, `/api/chat/rooms/${roomId}/speak`, {
      method: 'POST',
      token,
      body: { modelId: 'beta/two' }
    });
    assert.equal(beta.status, 200);
    const betaCall = calls.filter((item) => String(item.url).includes('/chat/completions')).at(-1);
    const betaTranscript = betaCall.body.messages.map((item) => item.content).join('\n');
    assert.match(betaTranscript, /Qual o próximo passo/);
    assert.match(betaTranscript, /\[Alpha\]:/);
    assert.equal(beta.data.room.messages.length, 3);
    assert.equal(beta.data.room.messages[2].modelId, 'beta/two');

    const state = await request(port, '/api/state', { token });
    assert.equal(state.data.chatRooms.length, 1);
    assert.equal(state.data.chatRooms[0].messages.length, 3);
    assert.equal(JSON.stringify(state.data).includes('sk-or-test-room-key'), false);

    const removed = await request(port, `/api/chat/rooms/${roomId}`, { method: 'DELETE', token });
    assert.equal(removed.status, 200);
    const after = await request(port, '/api/chat/rooms', { token });
    assert.equal(after.data.rooms.length, 0);
  } finally {
    server.close();
    globalThis.fetch = originalFetch;
    if (savedEnvKey) process.env.OPENROUTER_API_KEY = savedEnvKey;
    setStoredOpenRouterKey(savedEnvKey || '');
    clearChatModelCache();
  }
});

if (failed) {
  console.error(`\n${failed} teste(s) da Sala de Bate Papo falharam.`);
  process.exit(1);
}
console.log('\n🎉 Sala de Bate Papo ok.');
