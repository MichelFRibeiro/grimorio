import './testEnv.js';
import assert from 'node:assert/strict';
import { getDb, saveDb, initDb } from './db.js';
import {
  createSupplement,
  updateSupplement,
  deleteSupplement,
  logSupplementIntake,
  updateSupplementLog,
  deleteSupplementLog
} from './domain/supplements.js';

await initDb();
const db = getDb();
db.supplements = [];
db.supplementLogs = [];
saveDb(db);

const created = createSupplement(db, {
  name: '  Omega 3  ',
  unit: 'cápsula',
  defaultDose: 2,
  notes: 'Com o almoço'
});
assert.equal(created.error, undefined);
assert.equal(created.supplement.name, 'Omega 3');
assert.equal(created.supplement.unit, 'cápsula');
assert.equal(created.supplement.defaultDose, 2);
assert.equal(db.supplements.length, 1);

const missingName = createSupplement(db, { name: '   ' });
assert.equal(missingName.status, 400);

const creatina = createSupplement(db, { name: 'Creatina', unit: 'g', defaultDose: 5 });
assert.equal(creatina.error, undefined);

const badDose = logSupplementIntake(db, {
  supplementId: creatina.supplement.id,
  amount: 0,
  date: '2026-10-06',
  time: '08:30'
});
assert.match(badDose.error, /quantidade/i);

const badTime = logSupplementIntake(db, {
  supplementId: creatina.supplement.id,
  amount: 5,
  date: '2026-10-06',
  time: '8:30'
});
assert.match(badTime.error, /hora/i);

const logged = logSupplementIntake(db, {
  supplementId: creatina.supplement.id,
  amount: '5,5',
  date: '2026-10-06',
  time: '08:30',
  notes: 'Depois do treino'
});
assert.equal(logged.error, undefined);
assert.equal(logged.log.amount, 5.5);
assert.equal(logged.log.unit, 'g');
assert.equal(logged.log.date, '2026-10-06');
assert.equal(logged.log.time, '08:30');
assert.equal(logged.log.takenAt, '2026-10-06T11:30:00.000Z');

const edited = updateSupplementLog(db, logged.log.id, {
  amount: 3,
  time: '09:00',
  notes: 'Com água'
});
assert.equal(edited.log.amount, 3);
assert.equal(edited.log.time, '09:00');
assert.equal(edited.log.takenAt, '2026-10-06T12:00:00.000Z');
assert.equal(edited.log.notes, 'Com água');

const moved = updateSupplementLog(db, logged.log.id, { supplementId: created.supplement.id });
assert.equal(moved.log.supplementId, created.supplement.id);
assert.equal(moved.log.unit, 'cápsula');

const archived = updateSupplement(db, creatina.supplement.id, { archived: true, name: 'Creatina monohidratada' });
assert.equal(archived.supplement.archived, true);
assert.equal(archived.supplement.name, 'Creatina monohidratada');
const blocked = logSupplementIntake(db, {
  supplementId: creatina.supplement.id,
  amount: 5,
  date: '2026-10-06',
  time: '19:00'
});
assert.match(blocked.error, /arquivado/i);

const removedLog = deleteSupplementLog(db, logged.log.id);
assert.equal(removedLog.removed.id, logged.log.id);
assert.equal(db.supplementLogs.length, 0);

logSupplementIntake(db, {
  supplementId: created.supplement.id,
  amount: 1,
  date: '2026-10-05',
  time: '12:00'
});
const removed = deleteSupplement(db, created.supplement.id);
assert.equal(removed.removedLogs.length, 1);
assert.equal(db.supplements.some(item => item.id === created.supplement.id), false);
assert.equal(db.supplementLogs.length, 0);

const missing = updateSupplement(db, 'sup-inexistente', { name: 'Nada' });
assert.equal(missing.status, 404);

saveDb(db);
const reloaded = getDb();
assert.equal(reloaded.supplements.length, 1);
assert.equal(reloaded.supplements[0].name, 'Creatina monohidratada');

console.log('Suplementos: cadastro, tomada, edição e exclusão ok.');
