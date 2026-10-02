/**
 * Backup diário local em modo JSON (GRIMORIO_DAILY_BACKUPS=1).
 *
 * O que precisa ficar provado:
 *  - desligado por padrão: sem a variável, nenhuma pasta backups/ é criada
 *    (é isso que mantém o Render exatamente como está);
 *  - ligado: a primeira gravação do dia deixa backups/database-AAAA-MM-DD.json
 *    com o estado real do banco, e uma segunda gravação não cria outro arquivo;
 *  - o retrato do dia é imutável (não sobrescreve o arquivo que já existe);
 *  - a retenção (GRIMORIO_BACKUP_RETENTION) apaga só os mais antigos;
 *  - o boot do servidor de verdade também gera o backup do dia.
 */
import './testEnv.js';
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { childEnv, startTestServer } from './testEnv.js';
import { getSaoPauloDateStr } from './timeUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function ok(condition, message) {
  assert.ok(condition, message);
  console.log(`  ✓ ${message}`);
}

/** Roda um script ESM isolado (data dir temporário próprio) e devolve stdout/JSON. */
function runChild(script, envExtra = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grimorio-backup-'));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
      cwd: ROOT,
      env: childEnv({ ...envExtra, GRIMORIO_DATA_DIR: dataDir }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stdout, stderr, dataDir }));
  });
}

/** Extrai a última linha JSON marcada pelo script filho. */
function marker(stdout) {
  const line = stdout.split('\n').filter(l => l.startsWith('@@')).pop();
  assert.ok(line, `script filho não emitiu marcador. Saída:\n${stdout}`);
  return JSON.parse(line.slice(2));
}

function backupFiles(dataDir) {
  const dir = path.join(dataDir, 'backups');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort();
}

async function testDisabledByDefault() {
  console.log('\n--- desligado por padrão (Render intacto) ---');
  const { code, stdout, stderr, dataDir } = await runChild(`
    import fs from 'fs';
    import path from 'path';
    const db = await import('./server/db.js');
    const data = db.getDb();
    data.hero = data.hero || {};
    data.hero.name = 'Sem backup';
    db.saveDb(data);
    const out = {
      enabled: db.dailyBackupsEnabled(),
      backupDir: db.getDailyBackupDir(),
      backups: fs.existsSync(path.join(db.getDataDir(), 'backups')),
      file: fs.existsSync(db.getDbFilePath())
    };
    console.log('@@' + JSON.stringify(out));
  `);
  assert.equal(code, 0, `processo filho falhou: ${stderr}`);
  const out = marker(stdout);
  ok(out.enabled === false, 'GRIMORIO_DAILY_BACKUPS ausente desliga o recurso');
  ok(out.file === true, 'o database.json do modo arquivo continua sendo gravado');
  ok(out.backups === false, 'nenhuma pasta backups/ é criada quando está desligado');
  ok(backupFiles(dataDir).length === 0, 'nenhum arquivo de backup foi gravado');
}

async function testBackupOnFirstSaveOfDay() {
  console.log('\n--- ligado: primeira gravação do dia ---');
  const { code, stdout, stderr, dataDir } = await runChild(`
    import fs from 'fs';
    import path from 'path';
    // Banco pré-existente: getDb() carrega do disco (não grava) e a primeira
    // gravação do dia passa a ser o saveDb() abaixo.
    fs.writeFileSync(
      path.join(process.env.GRIMORIO_DATA_DIR, 'database.json'),
      JSON.stringify({ hero: { name: 'Estado inicial' } })
    );
    const db = await import('./server/db.js');
    const data = db.getDb();
    const loadedName = data.hero && data.hero.name;
    data.hero = data.hero || {};
    data.hero.name = 'Retrato do dia';
    db.saveDb(data);
    const first = fs.readdirSync(path.join(db.getDataDir(), 'backups')).sort();
    db.saveDb(data);
    db.saveDb(data);
    const after = fs.readdirSync(path.join(db.getDataDir(), 'backups')).sort();
    const content = JSON.parse(fs.readFileSync(path.join(db.getDataDir(), 'backups', first[0]), 'utf-8'));
    console.log('@@' + JSON.stringify({
      today: (await import('./server/timeUtils.js')).getSaoPauloDateStr(),
      enabled: db.dailyBackupsEnabled(),
      loadedName,
      first,
      after,
      name: content.hero && content.hero.name
    }));
  `, { GRIMORIO_DAILY_BACKUPS: '1' });
  assert.equal(code, 0, `processo filho falhou: ${stderr}`);
  const out = marker(stdout);
  ok(out.enabled === true, 'GRIMORIO_DAILY_BACKUPS=1 liga o recurso');
  ok(out.loadedName === 'Estado inicial', 'o banco existente é carregado do disco');
  ok(out.first.length === 1, `uma gravação por dia (${out.first.length} arquivo)`);
  ok(out.first[0] === `database-${out.today}.json`, `nome do arquivo é database-${out.today}.json`);
  ok(out.after.length === 1, 'gravações seguintes no mesmo dia não criam outro arquivo');
  ok(out.name === 'Retrato do dia', 'o backup contém o estado real do banco');
  const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, 'backups', out.first[0]), 'utf-8'));
  ok(parsed.hero.name === 'Retrato do dia', 'o arquivo no disco é JSON válido e completo');
}

async function testDailySnapshotIsImmutable() {
  console.log('\n--- o retrato do dia não é sobrescrito ---');
  const { code, stdout, stderr } = await runChild(`
    import fs from 'fs';
    import path from 'path';
    const { getSaoPauloDateStr } = await import('./server/timeUtils.js');
    const dir = path.join(process.env.GRIMORIO_DATA_DIR, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'database-' + getSaoPauloDateStr() + '.json');
    fs.writeFileSync(target, '{"sentinel":true}');
    const db = await import('./server/db.js');
    const data = db.getDb();
    data.hero = data.hero || {};
    data.hero.name = 'Depois do sentinela';
    db.saveDb(data);
    console.log('@@' + JSON.stringify({
      files: fs.readdirSync(dir).sort(),
      content: fs.readFileSync(target, 'utf-8'),
      due: db.runDailyBackupIfDue()
    }));
  `, { GRIMORIO_DAILY_BACKUPS: '1' });
  assert.equal(code, 0, `processo filho falhou: ${stderr}`);
  const out = marker(stdout);
  ok(out.files.length === 1, 'continua havendo exatamente um arquivo por dia');
  ok(out.content === '{"sentinel":true}', 'o arquivo do dia existente é preservado');
  ok(out.due === null, 'a checagem seguinte no mesmo dia não faz mais nada');
}

async function testRetention() {
  console.log('\n--- retenção (GRIMORIO_BACKUP_RETENTION) ---');
  const { code, stdout, stderr } = await runChild(`
    import fs from 'fs';
    import path from 'path';
    const dir = path.join(process.env.GRIMORIO_DATA_DIR, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    for (const day of ['01','02','03','04','05']) {
      fs.writeFileSync(path.join(dir, 'database-2020-01-' + day + '.json'), '{"old":true}');
    }
    const db = await import('./server/db.js');
    const data = db.getDb();
    data.hero = data.hero || {};
    data.hero.name = 'Hoje';
    db.saveDb(data);
    console.log('@@' + JSON.stringify({ files: fs.readdirSync(dir).sort() }));
  `, { GRIMORIO_DAILY_BACKUPS: '1', GRIMORIO_BACKUP_RETENTION: '3' });
  assert.equal(code, 0, `processo filho falhou: ${stderr}`);
  const out = marker(stdout);
  ok(out.files.length === 3, `retenção mantém 3 arquivos (manteve ${out.files.length})`);
  ok(out.files[0] === 'database-2020-01-04.json', 'os mais antigos foram apagados primeiro');
  ok(out.files.includes(`database-${getSaoPauloDateStr()}.json`), 'o backup de hoje sobrevive à limpeza');
  ok(!out.files.includes('database-2020-01-01.json'), 'o arquivo mais antigo foi removido');
}

async function testServerBootCreatesBackup() {
  console.log('\n--- boot do servidor gera o backup do dia ---');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grimorio-boot-'));
  const server = await startTestServer({ GRIMORIO_DAILY_BACKUPS: '1', GRIMORIO_DATA_DIR: dataDir });
  try {
    const today = getSaoPauloDateStr();
    const files = backupFiles(dataDir);
    ok(files.includes(`database-${today}.json`), `o servidor no boot criou database-${today}.json`);
    const content = JSON.parse(fs.readFileSync(path.join(dataDir, 'backups', `database-${today}.json`), 'utf-8'));
    ok(typeof content === 'object' && content !== null, 'o backup do boot é JSON válido');
    ok(fs.existsSync(path.join(dataDir, 'database.json')), 'o database.json vive no mesmo data dir');
  } finally {
    server.stop();
  }
}

async function main() {
  await testDisabledByDefault();
  await testBackupOnFirstSaveOfDay();
  await testDailySnapshotIsImmutable();
  await testRetention();
  await testServerBootCreatesBackup();
  console.log('\n✅ Backup diário local: tudo certo (modo JSON, desligado por padrão).');
}

main().catch((err) => {
  console.error('\n❌ Falhou:', err.message);
  process.exit(1);
});
