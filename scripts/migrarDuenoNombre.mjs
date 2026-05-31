/**
 * Rellena el campo `duenoNombre` en todos los documentos de territorio
 * que tienen `dueno` pero no tienen `duenoNombre`.
 *
 * Actualiza tres ubicaciones:
 *   - Colección `territorios` (documentos raíz)
 *   - Colección `barrios`     (documentos raíz)
 *   - CollectionGroup `segmentos` (subcollecciones de territorios/barrios)
 *
 * Uso:
 *   node scripts/migrarDuenoNombre.mjs
 *   DRY_RUN=1 node scripts/migrarDuenoNombre.mjs   ← muestra cambios sin escribir
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const DRY_RUN = Boolean(process.env.DRY_RUN);
const BATCH_SIZE = 400;

// ── Bootstrap ────────────────────────────────────────────────────────────────

let admin;
try {
  admin = require('firebase-admin');
} catch {
  console.error('❌ firebase-admin no instalado. Ejecuta: npm install --save-dev firebase-admin');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(await readFile(join(__dirname, 'serviceAccount.json'), 'utf8'));
} catch {
  console.error('❌ No se encontró scripts/serviceAccount.json');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function commitBatch(ops) {
  if (ops.length === 0) return;
  const chunks = [];
  for (let i = 0; i < ops.length; i += BATCH_SIZE) chunks.push(ops.slice(i, i + BATCH_SIZE));
  for (const chunk of chunks) {
    const batch = db.batch();
    for (const { ref, data } of chunk) batch.update(ref, data);
    await batch.commit();
    process.stdout.write('.');
  }
}

// ── Paso 1: Recoger todos los refs que necesitan migración ───────────────────

console.log('\n📦 Leyendo documentos con dueno pero sin duenoNombre...\n');

const [territoriosSnap, barriosSnap, segmentosSnap] = await Promise.all([
  db.collection('territorios').where('dueno', '!=', null).get(),
  db.collection('barrios').where('dueno', '!=', null).get(),
  db.collectionGroup('segmentos').get(),
]);

const pendientes = [
  ...territoriosSnap.docs,
  ...barriosSnap.docs,
  ...segmentosSnap.docs,
].filter(doc => {
  const data = doc.data();
  return data.dueno != null && !data.duenoNombre;
});

if (pendientes.length === 0) {
  console.log('✅ Todos los documentos ya tienen duenoNombre. Nada que migrar.');
  process.exit(0);
}

console.log(`📋 ${pendientes.length} documentos a actualizar`);

// ── Paso 2: Recoger UIDs únicos y buscar nicknames ───────────────────────────

const uidsUnicos = [...new Set(pendientes.map(doc => doc.data().dueno))];
console.log(`👥 ${uidsUnicos.length} usuarios únicos a resolver...\n`);

const nicknamesPorUid = new Map();

// Fetch en paralelo de 10 en 10 para no saturar
for (let i = 0; i < uidsUnicos.length; i += 10) {
  const chunk = uidsUnicos.slice(i, i + 10);
  const snaps = await Promise.all(
    chunk.map(uid => db.collection('usuariosPublicos').doc(uid).get())
  );
  for (const snap of snaps) {
    const nickname = snap.exists ? (snap.data().nickname ?? 'Corredor anónimo') : 'Corredor anónimo';
    nicknamesPorUid.set(snap.id, nickname);
    process.stdout.write('.');
  }
}

console.log('\n');

// ── Paso 3: Preparar y aplicar escrituras ────────────────────────────────────

const ops = pendientes.map(doc => ({
  ref: doc.ref,
  data: { duenoNombre: nicknamesPorUid.get(doc.data().dueno) ?? 'Corredor anónimo' },
}));

if (DRY_RUN) {
  console.log('\n🔍 DRY RUN — cambios que se aplicarían:');
  for (const { ref, data } of ops.slice(0, 20)) {
    console.log(`  ${ref.path} → duenoNombre: "${data.duenoNombre}"`);
  }
  if (ops.length > 20) console.log(`  ... y ${ops.length - 20} más`);
  process.exit(0);
}

console.log(`✍️  Escribiendo ${ops.length} actualizaciones en batches de ${BATCH_SIZE}...`);
await commitBatch(ops);

console.log(`\n\n✅ Migración completada. ${ops.length} documentos actualizados.`);
