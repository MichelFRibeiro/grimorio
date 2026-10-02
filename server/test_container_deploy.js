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

    // HEAD precisa espelhar o GET: players sondam com HEAD + Range antes de baixar.
    const headPlain = await request(server.port, '/api/focus/audio', { method: 'HEAD' });
    ok(headPlain.status === 200, 'HEAD /api/focus/audio responde 200 sem Range');
    ok(Number(headPlain.headers['content-length']) === trackJson.sizeBytes,
      'HEAD devolve Content-Length do arquivo inteiro');
    ok(String(headPlain.headers['accept-ranges']) === 'bytes',
      'HEAD anuncia Accept-Ranges: bytes');

    const headRanged = await request(server.port, '/api/focus/audio', {
      method: 'HEAD',
      headers: { Range: 'bytes=0-1023' }
    });
    ok(headRanged.status === 206, 'HEAD /api/focus/audio espelha o 206 do GET quando há Range');
    ok(String(headRanged.headers['content-range'] || '').startsWith('bytes 0-1023/'),
      `HEAD devolve Content-Range (${headRanged.headers['content-range']})`);
    ok(Number(headRanged.headers['content-length']) === 1024,
      'HEAD com Range devolve o Content-Length do trecho pedido');

    const headUnsatisfiable = await request(server.port, '/api/focus/audio', {
      method: 'HEAD',
      headers: { Range: `bytes=${trackJson.sizeBytes + 10}-` }
    });
    ok(headUnsatisfiable.status === 416,
      'HEAD com Range fora do arquivo responde 416 (mesmo comportamento do GET)');

    fs.writeFileSync(path.join(dataDir, 'database.json'), JSON.stringify({ hero: { name: 'Volume' } }));
    ok(fs.existsSync(path.join(dataDir, 'database.json')), 'o data dir é gravável (volume persistente)');
  } finally {
    server.stop();
  }
}

/**
 * O backup só pode ser baixado com o Bearer da sessão: é o que impede o link
 * direto (window.location / <a href>) de funcionar — o navegador não manda o
 * header numa navegação normal e a API responde 401.
 */
async function testBackupExportRequiresBearer() {
  console.log('\n--- backup export exige sessão (Bearer) ---');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grimorio-backup-'));
  const server = await startTestServer({ HOST: '127.0.0.1', GRIMORIO_DATA_DIR: dataDir });
  try {
    const anonymous = await request(server.port, '/api/backup/export');
    ok(anonymous.status === 401, '/api/backup/export sem Bearer responde 401 (link direto não funciona)');
    ok(String(JSON.parse(anonymous.body).error || '').includes('Não autorizado'),
      'a resposta 401 é a mensagem de sessão ausente');

    const login = await request(server.port, '/api/auth/guest', { method: 'POST' });
    ok(login.status === 200 && JSON.parse(login.body).token, 'POST /api/auth/guest fornece um token de sessão');
    const token = JSON.parse(login.body).token;

    const authorized = await request(server.port, '/api/backup/export', {
      headers: { Authorization: `Bearer ${token}` }
    });
    ok(authorized.status === 200, '/api/backup/export com Bearer responde 200');
    ok(String(authorized.headers['content-disposition'] || '').includes('attachment; filename=grimorio-backup-'),
      `Content-Disposition de download presente (${authorized.headers['content-disposition']})`);
    const payload = JSON.parse(authorized.body);
    ok(payload && typeof payload === 'object', 'o corpo é o JSON do backup, pronto para virar Blob');

    const badToken = await request(server.port, '/api/backup/export', {
      headers: { Authorization: 'Bearer token-invalido' }
    });
    ok(badToken.status === 401, 'Bearer inválido continua sendo 401');
  } finally {
    server.stop();
  }
}

async function main() {
  await testHostAndPublicEndpoints();
  await testFocusAudioComesFromImage();
  await testBackupExportRequiresBearer();
  console.log('\n✅ Container: HOST, áudio empacotado, backup autenticado e endpoints públicos validados.');
}

main().catch((err) => {
  console.error('\n❌ Falhou:', err.message);
  process.exit(1);
});
