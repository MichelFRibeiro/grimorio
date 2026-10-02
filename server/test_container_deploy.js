/**
 * Regressões do empacotamento em container (VPS com Docker + Traefik).
 *
 * O que precisa ficar provado sem Docker:
 *  - HOST é respeitado no listen (no container o Traefik precisa de 0.0.0.0;
 *    aqui usamos 127.0.0.1 e conferimos o banner, que só mostra o host quando
 *    HOST está definido) e sem HOST nada muda;
 *  - o áudio de foco continua sendo encontrado quando GRIMORIO_DATA_DIR aponta
 *    para o volume (/data) e NÃO existe data/audio lá dentro — ou seja, o
 *    áudio vem da imagem, não do volume;
 *  - /api/health é público (é o que o HEALTHCHECK do Dockerfile usa);
 *  - a API protegida continua exigindo sessão e o SPA segue sendo servido.
 */
import './testEnv.js';
import assert from 'assert';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { startTestServer } from './testEnv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_INDEX = path.resolve(__dirname, '..', 'dist', 'index.html');
const EXPECTED_MIN_AUDIO_BYTES = 40 * 1024 * 1024;

function ok(condition, message) {
  assert.ok(condition, message);
  console.log(`  ✓ ${message}`);
}

function request(port, requestPath, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: requestPath, method, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function waitForLog(logs, needle, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (logs.join('').includes(needle)) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return logs.join('').includes(needle);
}

async function testHostAndPublicEndpoints() {
  console.log('\n--- HOST, health e SPA ---');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grimorio-container-'));
  const server = await startTestServer({ HOST: '127.0.0.1', GRIMORIO_DATA_DIR: dataDir });
  try {
    ok(await waitForLog(server.logs, `http://127.0.0.1:${server.port}`),
      'HOST=127.0.0.1 aparece no banner (o listen usou o host informado)');

    const health = await request(server.port, '/api/health');
    ok(health.status === 200, '/api/health responde 200 sem sessão (usado pelo HEALTHCHECK)');
    const healthJson = JSON.parse(health.body);
    ok(healthJson.status === 'ok', '/api/health devolve status ok');

    const authConfig = await request(server.port, '/api/auth/config');
    ok(authConfig.status === 200, '/api/auth/config é público');

    const protectedRes = await request(server.port, '/api/analytics');
    ok(protectedRes.status === 401, 'a API de dados continua exigindo sessão (401)');

    const root = await request(server.port, '/');
    if (fs.existsSync(DIST_INDEX)) {
      ok(root.status === 200 && root.body.includes('<div id="root">'), '/ serve o SPA construído (dist/index.html)');
    } else {
      ok(root.status === 200, '/ responde 200 mesmo sem dist/ (mensagem de fallback)');
    }
  } finally {
    server.stop();
  }
}

async function testFocusAudioComesFromImage() {
  console.log('\n--- áudio de foco com o data dir separado (volume) ---');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grimorio-volume-'));
  const server = await startTestServer({ HOST: '127.0.0.1', GRIMORIO_DATA_DIR: dataDir });
  try {
    ok(!fs.existsSync(path.join(dataDir, 'audio')), 'o data dir do "volume" não tem pasta audio/');

    const track = await request(server.port, '/api/focus/track');
    ok(track.status === 200, '/api/focus/track encontra o áudio mesmo com data dir separado');
    const trackJson = JSON.parse(track.body);
    ok(trackJson.sizeBytes >= EXPECTED_MIN_AUDIO_BYTES,
      `tamanho do áudio confere (${(trackJson.sizeBytes / 1048576).toFixed(1)} MB)`);

    const ranged = await request(server.port, '/api/focus/audio', { headers: { Range: 'bytes=0-1023' } });
    ok(ranged.status === 206, '/api/focus/audio responde 206 a Range (streaming de áudio)');
    ok(String(ranged.headers['content-range'] || '').startsWith('bytes 0-1023/'),
      `Content-Range correto (${ranged.headers['content-range']})`);

    fs.writeFileSync(path.join(dataDir, 'database.json'), JSON.stringify({ hero: { name: 'Volume' } }));
    ok(fs.existsSync(path.join(dataDir, 'database.json')), 'o data dir é gravável (volume persistente)');
  } finally {
    server.stop();
  }
}

async function main() {
  await testHostAndPublicEndpoints();
  await testFocusAudioComesFromImage();
  console.log('\n✅ Container: HOST, áudio empacotado e endpoints públicos validados.');
}

main().catch((err) => {
  console.error('\n❌ Falhou:', err.message);
  process.exit(1);
});
