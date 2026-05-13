/**
 * Migracion de seguridad previa a produccion:
 *
 * 1. Crea usuariosPublicos/{uid} desde usuarios/{uid} con campos no sensibles.
 * 2. Rellena top10Uids en segmentos existentes para poder limpiar usuarios
 *    eliminados sin recorrer todo el mapa en cada borrado de cuenta.
 *
 * Uso:
 *   node scripts/migrarSeguridadPerfilesTop10.mjs
 */

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const RUTA_SA = join(__dirname, 'serviceAccount.json');
const BATCH_SIZE = 400;

let admin;
try {
  admin = require('firebase-admin');
} catch {
  console.error('firebase-admin no instalado. Ejecuta: npm install --save-dev firebase-admin');
  process.exit(1);
}

const raw = await readFile(RUTA_SA, 'utf8').catch(() => null);
if (!raw) {
  console.error('No se encontro scripts/serviceAccount.json');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore();

const chunked = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

const top10Uids = (top10 = []) => [...new Set(
  top10
    .map(item => item?.uid)
    .filter(uid => typeof uid === 'string' && uid.length > 0)
)];

const perfilPublico = (uid, data) => ({
  uid,
  nickname: data.nickname ?? 'Corredor anonimo',
  fotoPerfil: data.fotoPerfil ?? null,
  fotoPerfilEstado: data.fotoPerfilEstado ?? null,
  pais: data.pais ?? null,
  genero: data.genero ?? null,
  ciudadActualId: data.ciudadActualId ?? null,
  ciudadActualNombre: data.ciudadActualNombre ?? null,
  paisCodigo: data.paisCodigo ?? null,
  segmentoEtiqueta: data.segmentoEtiqueta ?? null,
  topLogros: (data.logros ?? []).slice(0, 3),
  actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
});

console.log('\nCreando perfiles publicos...');
const usuariosSnap = await db.collection('usuarios').get();
let perfilesCreados = 0;
for (const chunk of chunked(usuariosSnap.docs, BATCH_SIZE)) {
  const batch = db.batch();
  for (const docSnap of chunk) {
    batch.set(
      db.collection('usuariosPublicos').doc(docSnap.id),
      perfilPublico(docSnap.id, docSnap.data()),
      { merge: true }
    );
    perfilesCreados++;
  }
  await batch.commit();
}
console.log(`Perfiles publicos actualizados: ${perfilesCreados}`);

console.log('\nRellenando top10Uids en segmentos...');
const segmentosSnap = await db.collectionGroup('segmentos').get();
let segmentosActualizados = 0;
for (const chunk of chunked(segmentosSnap.docs, BATCH_SIZE)) {
  const batch = db.batch();
  let writes = 0;
  for (const docSnap of chunk) {
    const data = docSnap.data();
    const top10 = Array.isArray(data.top10) ? data.top10 : [];
    if (top10.length === 0) continue;
    batch.set(docSnap.ref, {
      top10Uids: top10Uids(top10),
      actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    writes++;
    segmentosActualizados++;
  }
  if (writes > 0) await batch.commit();
}
console.log(`Segmentos actualizados: ${segmentosActualizados}`);
console.log('\nMigracion completada.\n');
