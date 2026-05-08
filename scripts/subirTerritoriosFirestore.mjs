/**
 * Sube los territorios y ciudades generados a Firestore usando Firebase Admin SDK.
 *
 * Requisitos previos:
 *   1. Descarga tu service account key desde:
 *      Firebase Console → Proyecto → Configuración del proyecto → Cuentas de servicio → "Generar nueva clave privada"
 *      Guárdala como: scripts/serviceAccount.json  (está en .gitignore)
 *
 *   2. Instala el SDK de admin (solo la primera vez):
 *      npm install --save-dev firebase-admin
 *
 *   3. Genera el JSON de territorios si no existe:
 *      node scripts/generarTerritoriosEspana.mjs
 *
 *   4. Ejecuta este script:
 *      node scripts/subirTerritoriosFirestore.mjs
 *
 *      O para subir solo una ciudad (útil para pruebas):
 *      CIUDAD_ID=es-madrid node scripts/subirTerritoriosFirestore.mjs
 *
 *      O para sobrescribir todo (borra primero los territorios existentes):
 *      FORZAR=1 node scripts/subirTerritoriosFirestore.mjs
 */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Configuración ────────────────────────────────────────────────────────────

const RUTA_SERVICE_ACCOUNT = join(__dirname, 'serviceAccount.json');
const RUTA_DATOS = join(__dirname, '..', 'data', 'generated', 'territorios-espana.json');
const CIUDAD_ID_FILTRO = process.env.CIUDAD_ID ?? null;
const FORZAR = Boolean(process.env.FORZAR);
const BATCH_SIZE = 400; // Firestore limita a 500 operaciones por batch

// ── Bootstrap ────────────────────────────────────────────────────────────────

let admin;
try {
  admin = require('firebase-admin');
} catch {
  console.error('❌ firebase-admin no está instalado. Ejecuta: npm install --save-dev firebase-admin');
  process.exit(1);
}

let serviceAccount;
try {
  const raw = await readFile(RUTA_SERVICE_ACCOUNT, 'utf8');
  serviceAccount = JSON.parse(raw);
} catch {
  console.error(`❌ No se encontró el archivo de credenciales en: ${RUTA_SERVICE_ACCOUNT}`);
  console.error('   Descárgalo desde Firebase Console → Configuración → Cuentas de servicio');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ── Carga de datos ───────────────────────────────────────────────────────────

const raw = await readFile(RUTA_DATOS, 'utf8');
const { ciudades: todasCiudades, territorios: todosTerritorios } = JSON.parse(raw);

const ciudades = CIUDAD_ID_FILTRO
  ? todasCiudades.filter(c => c.id === CIUDAD_ID_FILTRO)
  : todasCiudades;

const territorios = CIUDAD_ID_FILTRO
  ? todosTerritorios.filter(t => t.ciudadId === CIUDAD_ID_FILTRO)
  : todosTerritorios;

if (ciudades.length === 0) {
  console.error(`❌ No se encontró la ciudad "${CIUDAD_ID_FILTRO}" en los datos generados.`);
  process.exit(1);
}

console.log(`\n📦 Datos listos: ${ciudades.length} ciudades · ${territorios.length} territorios`);
if (CIUDAD_ID_FILTRO) console.log(`   (filtrado por ciudad: ${CIUDAD_ID_FILTRO})`);
if (FORZAR) console.log('   ⚠️  Modo FORZAR activado — se sobrescribirán documentos existentes');

// ── Utilidades de batch ──────────────────────────────────────────────────────

const chunked = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

const ejecutarBatch = async (operaciones) => {
  for (const chunk of chunked(operaciones, BATCH_SIZE)) {
    const batch = db.batch();
    for (const { ref, data, merge } of chunk) {
      if (merge) {
        batch.set(ref, data, { merge: true });
      } else {
        batch.set(ref, data);
      }
    }
    await batch.commit();
  }
};

// ── Subir ciudades ───────────────────────────────────────────────────────────

console.log('\n🏙️  Subiendo ciudades...');

const opsCiudades = ciudades.map(ciudad => ({
  ref: db.collection('ciudades').doc(ciudad.id),
  data: ciudad,
  merge: true,
}));

await ejecutarBatch(opsCiudades);
console.log(`   ✅ ${ciudades.length} ciudades subidas`);

// ── Limpiar territorios obsoletos (solo con FORZAR) ─────────────────────────

if (FORZAR) {
  console.log('\n🧹 Eliminando territorios obsoletos...');
  const ciudadIds = [...new Set(territorios.map(t => t.ciudadId))];
  const idsNuevos = new Set(territorios.map(t => t.id));
  let eliminados = 0;

  for (const ciudadId of ciudadIds) {
    const snap = await db.collection('territorios').where('ciudadId', '==', ciudadId).get();
    const obsoletos = snap.docs.filter(d => !idsNuevos.has(d.id));
    for (const chunk of chunked(obsoletos, BATCH_SIZE)) {
      const batch = db.batch();
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
      eliminados += chunk.length;
    }
  }
  console.log(`   ✅ ${eliminados} territorios obsoletos eliminados`);
} else {
  const primerSnap = await db.collection('territorios').doc(territorios[0].id).get();
  if (primerSnap.exists) {
    console.log('\n⚠️  Los territorios ya existen en Firestore.');
    console.log('   Para sobrescribirlos, usa: FORZAR=1 node scripts/subirTerritoriosFirestore.mjs');
    console.log('   Abortando para no duplicar datos.');
    process.exit(0);
  }
}

// ── Subir territorios ────────────────────────────────────────────────────────

console.log('\n🗺️  Subiendo territorios...');

const opsTerritorios = territorios.map(territorio => ({
  ref: db.collection('territorios').doc(territorio.id),
  data: {
    nombre: territorio.nombre,
    nombreBase: territorio.nombreBase,
    nombreVisible: territorio.nombreVisible,
    tipo: territorio.tipo,
    distrito: territorio.distrito ?? null,
    capaIdentidad: territorio.capaIdentidad ?? 'zona_base',
    fuenteNombre: territorio.fuenteNombre ?? 'seed_base_espana',
    ciudadId: territorio.ciudadId,
    ciudadNombre: territorio.ciudadNombre,
    paisCodigo: territorio.paisCodigo,
    paisNombre: territorio.paisNombre,
    lat: territorio.lat,
    lng: territorio.lng,
    radio: territorio.radio,
    dueno: null,
    duenoPuntos: 0,
  },
  merge: FORZAR,
}));

// Progreso por chunks
let subidos = 0;
for (const chunk of chunked(opsTerritorios, BATCH_SIZE)) {
  const batch = db.batch();
  for (const { ref, data, merge } of chunk) {
    if (merge) batch.set(ref, data, { merge: true });
    else batch.set(ref, data);
  }
  await batch.commit();
  subidos += chunk.length;
  process.stdout.write(`\r   ${subidos}/${territorios.length} territorios...`);
}

console.log(`\n   ✅ ${territorios.length} territorios subidos`);

// ── Resumen ──────────────────────────────────────────────────────────────────

console.log('\n🎉 Importación completada:');
console.log(`   • ${ciudades.length} ciudades → colección "ciudades"`);
console.log(`   • ${territorios.length} territorios → colección "territorios"`);
console.log('\n   Los usuarios ya pueden ver estos territorios en el mapa de ConqueRun.\n');
