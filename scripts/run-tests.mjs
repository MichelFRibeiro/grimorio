/**
 * Roda cada server/test*.js em um processo filho isolado.
 * DATABASE_URL é removida, GRIMORIO_TEST=1 e cada teste recebe
 * um diretório temporário próprio (nunca data/ do projeto).
 *
 * Uso: node scripts/run-tests.mjs [filtro]
 */
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');
const filter = process.argv[2] || '';

const files = fs.readdirSync(SERVER_DIR)
  .filter(name => /^test.*\.js$/.test(name))
  .filter(name => !filter || name.includes(filter))
  .sort();

if (files.length === 0) {
  console.error(`Nenhum teste encontrado${filter ? ` para o filtro "${filter}"` : ''}.`);
  process.exit(1);
}

function runOne(file) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grimorio-test-'));
  const env = { ...process.env };
  delete env.DATABASE_URL;
  env.GRIMORIO_TEST = '1';
  env.GRIMORIO_DATA_DIR = dataDir;
  // Porta alta aleatória: testes que sobem o servidor sozinhos não colidem
  // com 3000/3090 nem entre si (cada um roda sequencialmente de qualquer forma).
  env.PORT = String(25000 + Math.floor(Math.random() * 15000));
  env.TEST_PORT = env.PORT;

  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(SERVER_DIR, file)], {
      cwd: ROOT,
      env,
      stdio: 'inherit'
    });
    child.on('error', (err) => {
      resolve({ file, code: 1, ms: Date.now() - started, error: err.message });
    });
    child.on('exit', (code, signal) => {
      resolve({
        file,
        code: code ?? 1,
        signal,
        ms: Date.now() - started
      });
    });
  });
}

const results = [];
console.log(`\n🗡️  Grimório — suíte de testes (${files.length} arquivo${files.length === 1 ? '' : 's'})\n`);

for (const file of files) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`▶ ${file}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  const result = await runOne(file);
  results.push(result);
  const mark = result.code === 0 ? 'PASSOU' : 'FALHOU';
  console.log(`\n${result.code === 0 ? '✅' : '❌'} ${file}: ${mark} (${(result.ms / 1000).toFixed(1)}s)`);
}

const failed = results.filter(r => r.code !== 0);
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Resumo: ${results.length - failed.length}/${results.length} passaram.`);
for (const r of results) {
  console.log(`  ${r.code === 0 ? '✅' : '❌'} ${r.file}`);
}
if (failed.length) {
  console.log(`\nFalharam: ${failed.map(r => r.file).join(', ')}`);
  process.exit(1);
}
console.log('');
process.exit(0);
