import './testEnv.js';
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { childEnv } from './testEnv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`✅ ${message}`);
}

function runChild(script, envExtra = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grimorio-child-'));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
      cwd: path.resolve(__dirname, '..'),
      env: childEnv({ ...envExtra, GRIMORIO_DATA_DIR: dataDir }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('exit', (code) => {
      resolve({ code, stdout, stderr, dataDir });
    });
    child.on('error', reject);
  });
}

async function testAtomicWriteAndBak() {
  console.log('\n--- escrita atômica + .bak ---');
  const { writeDbFileAtomic } = await import('./db.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grimorio-atomic-'));
  const file = path.join(dir, 'database.json');
  writeDbFileAtomic(file, '{"v":1}');
  assertOk(fs.readFileSync(file, 'utf8') === '{"v":1}', 'primeiro write cria o arquivo');
  assertOk(!fs.existsSync(file + '.bak'), 'primeiro write não cria .bak');
  writeDbFileAtomic(file, '{"v":2}');
  assertOk(fs.readFileSync(file, 'utf8') === '{"v":2}', 'rename substitui o arquivo');
  assertOk(fs.readFileSync(file + '.bak', 'utf8') === '{"v":1}', '.bak guarda a versão anterior boa');
  const leftovers = fs.readdirSync(dir).filter(name => name.endsWith('.tmp'));
  assertOk(leftovers.length === 0, 'nenhum temporário sobrou');
}

async function testCorruptRecovery() {
  console.log('\n--- recuperação de arquivo corrompido ---');
  const script = `
    import { getDb, saveDb, __resetDbCacheForTests, getDbFilePath, getDataDir } from './server/db.js';
    import fs from 'fs';
    import path from 'path';
    const db = getDb();
    db.userProfile.name = 'Herói do Bak';
    saveDb(db);
    // A segunda gravação deixa o .bak com o nome anterior (a última versão boa).
    db.userProfile.name = 'Herói Atual';
    saveDb(db);
    __resetDbCacheForTests();
    fs.writeFileSync(getDbFilePath(), '{isto não é json', 'utf8');
    const recovered = getDb();
    // O arquivo atual foi corrompido; o .bak guarda a versão boa anterior.
    if (recovered.userProfile.name !== 'Herói do Bak') {
      console.error('NAO_RECUPEROU:' + recovered.userProfile.name);
      process.exit(2);
    }
    const corrupt = fs.readdirSync(getDataDir()).filter(n => n.startsWith('database.corrupt-'));
    if (corrupt.length !== 1) {
      console.error('CORRUPT_NAO_PRESERVADO');
      process.exit(3);
    }
    console.log('RECOVERED');
  `;
  const result = await runChild(script);
  assertOk(
    result.code === 0 && result.stdout.includes('RECOVERED'),
    `corrupção recupera do .bak e preserva o arquivo (code ${result.code})\n${result.stderr}\n${result.stdout}`
  );
  const preserved = fs.readdirSync(result.dataDir).filter(n => n.startsWith('database.corrupt-'));
  assertOk(preserved.length === 1, 'arquivo corrompido foi renomeado, não sobrescrito');
}

async function testCorruptWithoutBakStartsDefault() {
  console.log('\n--- corrupção sem .bak inicia padrão ---');
  const script = `
    import fs from 'fs';
    import { getDb, getDbFilePath, getDataDir } from './server/db.js';
    fs.writeFileSync(getDbFilePath(), '<<<lixo>>>', 'utf8');
    const db = getDb();
    if (!db.userProfile || db.userProfile.level !== 1) {
      console.error('NAO_PADRAO');
      process.exit(2);
    }
    const corrupt = fs.readdirSync(getDataDir()).filter(n => n.startsWith('database.corrupt-'));
    if (corrupt.length !== 1) process.exit(3);
    console.log('DEFAULT_OK');
  `;
  const result = await runChild(script);
  assertOk(result.code === 0 && result.stdout.includes('DEFAULT_OK'), 'sem .bak, inicia padrão e preserva o corrompido');
}

async function testWriteQueueOrdering() {
  console.log('\n--- fila de escrita do Postgres (pool falso) ---');
  const { __setPoolForTests, saveDb, flushDb, getDb, defaultDatabase } = await import('./db.js');
  const queries = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const fakePool = {
    async query(_sql, params) {
      calls += 1;
      const payload = params[0];
      queries.push(payload.marker);
      if (calls === 1) await gate;
    }
  };
  __setPoolForTests(fakePool);

  const base = defaultDatabase();
  base.marker = 'a';
  saveDb(base);
  // A fila começa num microtask: espera a primeira query entrar no gate.
  await new Promise(r => setImmediate(r));
  const mid = getDb();
  mid.marker = 'b';
  saveDb(mid);
  const last = getDb();
  last.marker = 'c';
  saveDb(last);

  assertOk(queries.length === 1 && queries[0] === 'a', 'só a primeira escrita está em voo');
  release();
  await flushDb();
  assertOk(queries.length === 2 && queries[1] === 'c', 'escritas intermediárias foram coalescidas no snapshot mais recente');
  __setPoolForTests(null);
}

async function testOwnerAllowlist() {
  console.log('\n--- allowlist do dono ---');
  const auth = await import('./auth.js');
  const { getDb, saveDb } = await import('./db.js');

  const previous = process.env.OWNER_EMAILS;
  delete process.env.OWNER_EMAILS;
  const db = getDb();
  delete db.ownerEmail;
  db.users = [];
  saveDb(db);

  const adopted = auth.assertOwnerEmail('Dono@Gmail.com');
  assertOk(adopted === 'dono@gmail.com', 'trust-on-first-use adota o primeiro e-mail');
  assertOk(getDb().ownerEmail === 'dono@gmail.com', 'ownerEmail foi persistido');
  let rejected = false;
  try {
    auth.assertOwnerEmail('outro@gmail.com');
  } catch (err) {
    rejected = err.status === 403;
  }
  assertOk(rejected, 'segunda conta Google recebe 403');

  db.users = [{ provider: 'google', email: 'antigo@gmail.com' }];
  delete db.ownerEmail;
  saveDb(db);
  const fromUser = auth.resolveOwnerEmail(getDb());
  assertOk(fromUser === 'antigo@gmail.com', 'adota o primeiro usuário Google existente');

  process.env.OWNER_EMAILS = 'Um@Dono.com, Dois@Dono.com';
  assertOk(auth.assertOwnerEmail('dois@dono.com') === 'dois@dono.com', 'OWNER_EMAILS aceita a lista');
  let envRejected = false;
  try {
    auth.assertOwnerEmail('antigo@gmail.com');
  } catch (err) {
    envRejected = err.status === 403;
  }
  assertOk(envRejected, 'fora de OWNER_EMAILS recebe 403');
  if (previous === undefined) delete process.env.OWNER_EMAILS;
  else process.env.OWNER_EMAILS = previous;
}

async function testBackupSecrets() {
  console.log('\n--- backup: export limpo e import preserva segredos ---');
  const { stripBackupSecrets, buildImportedDb, validateImportedProfile } = await import('./httpGuards.js');
  const current = {
    userProfile: { level: 3, xp: 10, xpToNextLevel: 100, coins: 40, streak: 2, stats: { wisdom: 1, focus: 1, willpower: 1, consistency: 1 } },
    quests: [{ id: 'q1' }],
    users: [{ email: 'dono@gmail.com', accessToken: 'segredo-user', refreshToken: 'r' }],
    mcpToken: 'mcp_real',
    integrations: { openrouterApiKey: 'sk-real' },
    authSessions: [{ tokenHash: 'abc' }],
    ownerEmail: 'dono@gmail.com'
  };
  const exported = stripBackupSecrets(current);
  assertOk(!('mcpToken' in exported), 'export não leva mcpToken');
  assertOk(!('integrations' in exported), 'export não leva integrations');
  assertOk(!('authSessions' in exported), 'export não leva authSessions');
  assertOk(exported.users[0].accessToken === undefined && exported.users[0].refreshToken === undefined, 'export remove tokens dos usuários');
  assertOk(exported.users[0].email === 'dono@gmail.com', 'export mantém o e-mail do usuário');

  const incoming = {
    userProfile: { level: 4, xp: 1, xpToNextLevel: 120, coins: 9, streak: 1 },
    quests: [{ id: 'q-importado' }],
    users: [{ email: 'invasor@gmail.com', accessToken: 'roubado' }],
    mcpToken: 'mcp_invasor',
    integrations: { openrouterApiKey: 'sk-invasor' },
    authSessions: [{ tokenHash: 'forjado' }],
    ownerEmail: 'invasor@gmail.com',
    campoDesconhecido: { malicioso: true }
  };
  const merged = buildImportedDb(incoming, current);
  assertOk(merged.mcpToken === 'mcp_real', 'import preserva mcpToken atual');
  assertOk(merged.integrations.openrouterApiKey === 'sk-real', 'import preserva integrations atuais');
  assertOk(merged.authSessions[0].tokenHash === 'abc', 'import preserva authSessions atuais');
  assertOk(merged.ownerEmail === 'dono@gmail.com', 'import preserva ownerEmail');
  assertOk(merged.users[0].email === 'dono@gmail.com', 'import preserva users atuais');
  assertOk(merged.quests[0].id === 'q-importado', 'import aplica as missões do arquivo');
  assertOk(!('campoDesconhecido' in merged), 'import descarta chaves fora da whitelist');

  const bad = validateImportedProfile({ level: Infinity, xp: 0, xpToNextLevel: 10, coins: 0, streak: 0 });
  assertOk(typeof bad === 'string', 'userProfile com número não finito é recusado');
  let threw = false;
  try {
    buildImportedDb({ userProfile: { level: Number.NaN }, quests: [] }, current);
  } catch (err) {
    threw = err.status === 400;
  }
  assertOk(threw, 'import recusa perfil inválido com status 400');
}

async function testGuestDisabledInProduction() {
  console.log('\n--- convidado desligado em produção ---');
  const script = `
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_GUEST;
    const { isGuestLoginEnabled, isEmailLoginEnabled } = await import('./server/auth.js');
    if (isGuestLoginEnabled() || isEmailLoginEnabled()) process.exit(2);
    process.env.ALLOW_GUEST = '1';
    if (!isGuestLoginEnabled()) process.exit(3);
    console.log('GUEST_GATED');
  `;
  const result = await runChild(script, { NODE_ENV: 'production' });
  assertOk(result.code === 0 && result.stdout.includes('GUEST_GATED'), 'produção desliga convidado/e-mail, ALLOW_GUEST=1 religa');
}

async function testTestModeRefusesDatabaseUrl() {
  console.log('\n--- modo teste recusa DATABASE_URL ---');
  const script = `
    process.env.DATABASE_URL = 'postgres://user:pass@db.example.com/grimorio';
    const { getPool } = await import('./server/db.js');
    try {
      getPool();
      process.exit(2);
    } catch (err) {
      if (!String(err.message).includes('DATABASE_URL')) process.exit(3);
      console.log('REFUSED');
    }
  `;
  const result = await runChild(script);
  assertOk(result.code === 0 && result.stdout.includes('REFUSED'), 'GRIMORIO_TEST=1 recusa criar pool quando DATABASE_URL existe');
}

async function main() {
  console.log('🧪 Persistência atômica, fila e controle de acesso...');
  await testAtomicWriteAndBak();
  await testCorruptRecovery();
  await testCorruptWithoutBakStartsDefault();
  await testWriteQueueOrdering();
  await testOwnerAllowlist();
  await testBackupSecrets();
  await testGuestDisabledInProduction();
  await testTestModeRefusesDatabaseUrl();
  console.log('\n🎉 Persistência e segurança validadas.');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
