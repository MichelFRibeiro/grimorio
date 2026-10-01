/**
 * Isolamento de testes do Grimório.
 *
 * Importe este módulo ANTES de qualquer outro módulo do servidor
 * (db.js, auth.js, index.js). Ele:
 *   - remove DATABASE_URL para que nenhum teste alcance o Postgres;
 *   - marca GRIMORIO_TEST=1;
 *   - exige (ou cria) um GRIMORIO_DATA_DIR temporário, fora de data/;
 *   - escolhe uma porta alta aleatória se PORT/TEST_PORT não vierem definidos.
 *
 * Processos filhos devem receber childEnv() (ou childSpawnOptions()).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_DATA_DIR = path.resolve(__dirname, '..', 'data');

delete process.env.DATABASE_URL;
process.env.GRIMORIO_TEST = '1';

function isInsideProjectData(dir) {
  const resolved = path.resolve(dir);
  const root = PROJECT_DATA_DIR;
  return resolved === root || resolved.startsWith(root + path.sep);
}

if (!process.env.GRIMORIO_DATA_DIR || isInsideProjectData(process.env.GRIMORIO_DATA_DIR)) {
  process.env.GRIMORIO_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'grimorio-test-'));
}

if (!process.env.PORT && !process.env.TEST_PORT) {
  process.env.PORT = String(20000 + Math.floor(Math.random() * 20000));
}

/** Ambiente seguro para spawn/fork de filhos (servidor de teste, etc.). */
export function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.DATABASE_URL;
  env.GRIMORIO_TEST = '1';
  env.GRIMORIO_DATA_DIR = extra.GRIMORIO_DATA_DIR || process.env.GRIMORIO_DATA_DIR;
  if (!env.PORT) env.PORT = process.env.PORT;
  return env;
}

export function childSpawnOptions(extraEnv = {}, options = {}) {
  return {
    ...options,
    env: childEnv(extraEnv)
  };
}

export function getTestPort() {
  return Number(process.env.TEST_PORT || process.env.PORT);
}

/**
 * Sobe o servidor do Grimório num processo filho isolado (sem DATABASE_URL,
 * com diretório temporário) e espera /api/health responder.
 * Devolve { port, child, stop }.
 */
export async function startTestServer(extraEnv = {}) {
  const { spawn } = await import('child_process');
  const port = Number(extraEnv.PORT || getTestPort());
  const child = spawn(process.execPath, [path.join(__dirname, 'index.js')], childSpawnOptions(
    { ...extraEnv, PORT: String(port) },
    { stdio: 'pipe' }
  ));
  const logs = [];
  const capture = (chunk) => {
    logs.push(String(chunk));
    if (logs.length > 40) logs.shift();
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);

  const http = await import('http');
  const deadline = Date.now() + 15000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Servidor de teste encerrou antes de ficar pronto (code ${child.exitCode}).\n${logs.join('')}`);
    }
    ready = await new Promise((resolve) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: '/api/health', method: 'GET', timeout: 500 }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
    if (ready) break;
    await new Promise(r => setTimeout(r, 150));
  }
  if (!ready) {
    child.kill('SIGTERM');
    throw new Error(`Servidor de teste não respondeu em /api/health na porta ${port}.\n${logs.join('')}`);
  }

  return {
    port,
    child,
    logs,
    stop() {
      if (child.exitCode === null) child.kill('SIGTERM');
    }
  };
}
