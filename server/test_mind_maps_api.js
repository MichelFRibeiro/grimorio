import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: body ? JSON.parse(body) : {} });
        } catch {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`✅ ${message}`);
}

async function run() {
  const port = 3017;
  const serverProcess = spawn('node', [path.join(__dirname, 'index.js')], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'pipe'
  });
  serverProcess.stdout.on('data', d => process.stdout.write(`   [Server] ${d}`));
  serverProcess.stderr.on('data', d => process.stderr.write(`   [Server Err] ${d}`));
  await sleep(1600);

  const base = { hostname: '127.0.0.1', port, headers: { 'Content-Type': 'application/json' } };

  try {
    const created = await request({ ...base, path: '/api/mind-maps', method: 'POST' }, {
      title: 'Direito Administrativo',
      description: 'Mapa de prova',
      category: 'Estudos'
    });
    assert(created.status === 200 && created.body.mindMap?.id, 'POST cria o mapa');
    const mapId = created.body.mindMap.id;
    const rootId = created.body.mindMap.rootId;

    const child = await request({ ...base, path: `/api/mind-maps/${mapId}/nodes`, method: 'POST' }, {
      parentId: rootId,
      label: 'Atos administrativos',
      notes: 'Requisitos: competência, finalidade, forma, motivo, objeto'
    });
    assert(child.status === 200 && child.body.mindMap.nodes.length === 2, 'POST adiciona ramo');

    const grandchildParent = child.body.mindMap.nodes.find(n => n.label === 'Atos administrativos').id;
    const g = await request({ ...base, path: `/api/mind-maps/${mapId}/nodes`, method: 'POST' }, {
      parentId: grandchildParent,
      label: 'Anulação vs. Revogação'
    });
    assert(g.status === 200 && g.body.mindMap.nodes.length === 3, 'POST ramifica o filho');

    const study = await request({ ...base, path: `/api/mind-maps/${mapId}/study`, method: 'POST' }, {
      reviews: [{ nodeId: grandchildParent, quality: 3 }],
      durationMinutes: 12,
      mode: 'branches'
    });
    assert(study.status === 200 && study.body.session.reviewed === 1, 'POST study registra sessão');
    assert(study.body.rewardResult?.logEntry?.xp > 0, 'Estudo concede XP');

    const state = await request({ ...base, path: '/api/state', method: 'GET' });
    assert(Array.isArray(state.body.mindMaps) && state.body.mindMaps.some(m => m.id === mapId), 'GET /api/state inclui mapas');

    const del = await request({ ...base, path: `/api/mind-maps/${mapId}`, method: 'DELETE' });
    assert(del.status === 200, 'DELETE remove o mapa');
    console.log('\n🎉 API de mapas mentais validada.');
  } finally {
    serverProcess.kill('SIGTERM');
  }
}

run().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
