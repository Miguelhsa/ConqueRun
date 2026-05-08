/**
 * Genera la colección rankingsCiudad desde las carreras existentes en Firestore.
 *
 * Solo necesita ejecutarse una vez. A partir de ahí, CorrerScreen mantiene
 * la colección actualizada con cada carrera nueva.
 *
 * Uso:
 *   node scripts/migrarRankingsCiudad.mjs
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

const chunked = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

const ESTADOS_VALIDOS = ['self_recorded', 'strava_verified'];
const MIN_DISTANCIA = 1000;
const MIN_DURACION = 180;

const esValida = (c) => {
  if (!ESTADOS_VALIDOS.includes(c.verificationStatus ?? 'self_recorded')) return false;
  return (c.distancia ?? 0) >= MIN_DISTANCIA && (c.duracion ?? 0) >= MIN_DURACION;
};

console.log('\n📦 Cargando carreras desde Firestore...');
const carrerasSnap = await db.collection('carreras').get();
console.log(`   ${carrerasSnap.size} carreras encontradas`);

// Agregar por ciudad + uid
const agregados = {};
let descartadas = 0;

for (const d of carrerasSnap.docs) {
  const c = d.data();
  if (!c.uid || !c.ciudadId || !esValida(c)) { descartadas++; continue; }

  const clave = `${c.ciudadId}_${c.uid}`;
  const actual = agregados[clave] ?? {
    ciudadId: c.ciudadId,
    uid: c.uid,
    puntos: 0,
    carreras: 0,
    totalMetros: 0,
    stravaVerificadas: 0,
  };
  actual.puntos += c.puntos ?? 0;
  actual.carreras += 1;
  actual.totalMetros += Math.round(c.distancia ?? 0);
  if (c.verificationStatus === 'strava_verified') actual.stravaVerificadas += 1;
  agregados[clave] = actual;
}

const entradas = Object.entries(agregados);
console.log(`   ${entradas.length} entradas de ranking (${descartadas} carreras descartadas)\n`);

// Enriquecer con datos de usuario
console.log('👤 Enriqueciendo con perfiles de usuario...');
const uids = [...new Set(entradas.map(([, v]) => v.uid))];
const perfiles = {};

for (const uid of uids) {
  const snap = await db.collection('usuarios').doc(uid).get();
  if (snap.exists) {
    const data = snap.data();
    perfiles[uid] = {
      nickname: data.nickname ?? 'Corredor anónimo',
      fotoPerfil: data.fotoPerfil ?? null,
      fotoPerfilEstado: data.fotoPerfilEstado ?? null,
      pais: data.pais ?? null,
      topLogros: (data.logros ?? []).slice(0, 3),
      barrios: data.barriosConquistadosTotal ?? 0,
    };
  }
}
console.log(`   ${Object.keys(perfiles).length} perfiles cargados\n`);

// Subir en batches
console.log('🚀 Subiendo rankingsCiudad...');
const docs = entradas.map(([id, entrada]) => ({
  id,
  data: {
    ...entrada,
    ...(perfiles[entrada.uid] ?? {}),
    actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
  },
}));

let subidos = 0;
for (const chunk of chunked(docs, BATCH_SIZE)) {
  const batch = db.batch();
  for (const { id, data } of chunk) {
    batch.set(db.collection('rankingsCiudad').doc(id), data);
  }
  await batch.commit();
  subidos += chunk.length;
  process.stdout.write(`\r   ${subidos}/${docs.length} documentos...`);
}

console.log(`\n\n✅ Migración completada: ${subidos} entradas en rankingsCiudad`);
console.log('\nA partir de ahora cada carrera nueva actualiza la colección automáticamente.\n');
