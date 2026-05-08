/**
 * Lee todos los territorios de Firestore, aplica ajuste Voronoi para eliminar
 * solapamientos (radio = min(dist_al_vecino_más_cercano * 0.48, RADIO_MAX))
 * y escribe los radios corregidos de vuelta.
 *
 * No toca nombres, coordenadas ni dueños — solo el campo `radio`.
 *
 * Uso:
 *   node scripts/ajustarRadiosFirestore.mjs
 *   CIUDAD_ID=es-madrid node scripts/ajustarRadiosFirestore.mjs   ← solo una ciudad
 *   DRY_RUN=1 node scripts/ajustarRadiosFirestore.mjs             ← solo muestra cambios
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const RADIO_MAX = 750;
const RADIO_MIN = 300;
const CIUDAD_ID = process.env.CIUDAD_ID ?? null;
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

// ── Utilidades ───────────────────────────────────────────────────────────────

const distanciaM = (a, b) => {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
    Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const ajustarRadios = (territorios) => {
  const porCiudad = new Map();
  for (const t of territorios) {
    if (!porCiudad.has(t.ciudadId)) porCiudad.set(t.ciudadId, []);
    porCiudad.get(t.ciudadId).push(t);
  }

  const resultado = [];
  for (const zonas of porCiudad.values()) {
    for (const zona of zonas) {
      let minDist = Infinity;
      for (const otra of zonas) {
        if (otra.id === zona.id) continue;
        const d = distanciaM(zona, otra);
        if (d < minDist) minDist = d;
      }
      const nuevoRadio = Math.round(
        Math.min(minDist === Infinity ? RADIO_MAX : minDist * 0.48, RADIO_MAX)
      );
      resultado.push({ ...zona, radioNuevo: nuevoRadio });
    }
  }
  return resultado;
};

// ── Main ─────────────────────────────────────────────────────────────────────

const COLECCIONES = ['territorios', 'barrios'];

let todos = [];
for (const col of COLECCIONES) {
  let q = db.collection(col);
  if (CIUDAD_ID) q = q.where('ciudadId', '==', CIUDAD_ID);
  const snap = await q.get();
  snap.docs.forEach(d => todos.push({ id: d.id, coleccion: col, ref: d.ref, ...d.data() }));
}

if (todos.length === 0) {
  console.log('No se encontraron territorios en Firestore.');
  process.exit(0);
}

console.log(`Leídos ${todos.length} territorios de Firestore.`);

const ajustados = ajustarRadios(todos);
const aActualizar = ajustados.filter(t => t.radioNuevo !== t.radio && t.radioNuevo >= RADIO_MIN);
const eliminados  = ajustados.filter(t => t.radioNuevo < RADIO_MIN);

console.log(`→ ${aActualizar.length} territorios con radio a ajustar`);
console.log(`→ ${eliminados.length} territorios que quedarían < ${RADIO_MIN}m (se dejan sin cambio)`);

// Muestra resumen por ciudad
const resumen = new Map();
for (const t of aActualizar) {
  if (!resumen.has(t.ciudadId)) resumen.set(t.ciudadId, { antes: [], despues: [] });
  resumen.get(t.ciudadId).antes.push(t.radio);
  resumen.get(t.ciudadId).despues.push(t.radioNuevo);
}
for (const [ciudad, { antes, despues }] of [...resumen].sort()) {
  const med = arr => Math.round(arr.reduce((a, b) => a + b) / arr.length);
  console.log(`  ${ciudad}: media ${med(antes)}m → ${med(despues)}m (${antes.length} zonas)`);
}

if (DRY_RUN) {
  console.log('\nDRY_RUN activado — no se escriben cambios.');
  process.exit(0);
}

// Escribe en batches
let escritos = 0;
let batch = db.batch();
let ops = 0;

for (const t of aActualizar) {
  batch.update(t.ref, { radio: t.radioNuevo });
  ops++;
  if (ops >= BATCH_SIZE) {
    await batch.commit();
    escritos += ops;
    batch = db.batch();
    ops = 0;
  }
}
if (ops > 0) {
  await batch.commit();
  escritos += ops;
}

console.log(`\n✅ ${escritos} territorios actualizados en Firestore.`);
process.exit(0);
