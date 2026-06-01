/**
 * Rellena totalMetros en rankingsCiudad para docs donde el campo es 0 o no existe.
 * Suma distancia de las carreras reales del usuario en esa ciudad.
 *
 * Uso: node scripts/backfillTotalMetros.mjs
 */

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const RUTA_SERVICE_ACCOUNT = join(__dirname, 'serviceAccount.json');
const BATCH_SIZE = 400;

let admin;
try {
  admin = require('firebase-admin');
} catch {
  console.error('❌ firebase-admin no instalado. Ejecuta: npm install --save-dev firebase-admin');
  process.exit(1);
}

const raw = await readFile(RUTA_SERVICE_ACCOUNT, 'utf8').catch(() => null);
if (!raw) {
  console.error('❌ No se encontró scripts/serviceAccount.json');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore();

console.log('\n📦 Leyendo rankingsCiudad...');
const snap = await db.collection('rankingsCiudad').get();

const afectados = snap.docs.filter(d => {
  const data = d.data();
  return (data.totalMetros == null || data.totalMetros === 0) && (data.carreras ?? 0) > 0;
});

console.log(`   ${snap.size} docs totales, ${afectados.length} necesitan backfill\n`);

if (afectados.length === 0) {
  console.log('✅ Nada que actualizar.');
  process.exit(0);
}

let actualizados = 0;
let errores = 0;

for (const rankingDoc of afectados) {
  const { uid, ciudadId } = rankingDoc.data();
  if (!uid || !ciudadId) continue;

  try {
    const carrerasSnap = await db.collection('carreras')
      .where('uid', '==', uid)
      .where('ciudadId', '==', ciudadId)
      .get();

    const totalMetros = carrerasSnap.docs.reduce((sum, d) => {
      const data = d.data();
      if (data.fraudulenta) return sum;
      return sum + Math.round(data.distancia ?? 0);
    }, 0);

    if (totalMetros > 0) {
      await rankingDoc.ref.update({ totalMetros });
      console.log(`✅ ${rankingDoc.id}: ${totalMetros} m`);
      actualizados++;
    }
  } catch (e) {
    console.error(`❌ ${rankingDoc.id}: ${e.message}`);
    errores++;
  }
}

console.log(`\nResumen: ${actualizados} actualizados, ${errores} errores.`);
