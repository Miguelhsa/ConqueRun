/**
 * Borra todos los datos ficticios generados por generarDatosFicticios.mjs.
 *
 * Uso:
 *   node scripts/borrarDatosFicticios.mjs
 */

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const RUTA_SERVICE_ACCOUNT = join(__dirname, 'serviceAccount.json');

let admin;
try { admin = require('firebase-admin'); } catch {
  console.error('❌ firebase-admin no instalado.');
  process.exit(1);
}

const raw = await readFile(RUTA_SERVICE_ACCOUNT, 'utf8').catch(() => null);
if (!raw) { console.error('❌ No se encontró scripts/serviceAccount.json'); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore();

const BATCH_SIZE = 400;

const chunked = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

const borrarColeccion = async (coleccion, campo = '_ficticio') => {
  const snap = await db.collection(coleccion).where(campo, '==', true).get();
  if (snap.empty) { console.log(`   ⚪ ${coleccion}: nada que borrar`); return 0; }
  for (const chunk of chunked(snap.docs, BATCH_SIZE)) {
    const batch = db.batch();
    chunk.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  console.log(`   🗑️  ${coleccion}: ${snap.size} documentos eliminados`);
  return snap.size;
};

console.log('\n🧹 Borrando datos ficticios...\n');

await borrarColeccion('usuarios');
await borrarColeccion('carreras');
await borrarColeccion('grupos');
await borrarColeccion('rankingsCiudad');

// Restaurar territorios (guardamos el estado anterior en _ficticioAnterior)
console.log('\n   🗺️  Restaurando territorios...');
const territoriosSnap = await db.collection('territorios')
  .where('_ficticioAnterior', '!=', null)
  .get();

if (!territoriosSnap.empty) {
  for (const chunk of chunked(territoriosSnap.docs, BATCH_SIZE)) {
    const batch = db.batch();
    chunk.forEach(d => {
      const anterior = d.data()._ficticioAnterior;
      batch.update(d.ref, {
        dueno: anterior.dueno ?? null,
        duenoPuntos: anterior.duenoPuntos ?? 0,
        _ficticioAnterior: admin.firestore.FieldValue.delete(),
      });
    });
    await batch.commit();
  }
  console.log(`   ✅ ${territoriosSnap.size} territorios restaurados`);
} else {
  console.log('   ⚪ Territorios: nada que restaurar');
}

// Limpiar logros ficticios del usuario real
const MI_UID = process.env.MI_UID;
if (MI_UID) {
  const userSnap = await db.collection('usuarios').doc(MI_UID).get();
  if (userSnap.exists() && userSnap.data()._ficticioLogros) {
    await db.collection('usuarios').doc(MI_UID).update({
      logros: [],
      _ficticioLogros: admin.firestore.FieldValue.delete(),
    });
    console.log('   🏅 Logros ficticios eliminados de tu usuario');
  }
}

console.log('\n✅ Datos ficticios eliminados. La app vuelve a su estado real.\n');
