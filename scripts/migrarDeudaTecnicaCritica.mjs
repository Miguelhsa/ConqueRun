/**
 * Migración de deuda técnica crítica:
 *
 * 1. Añade `marcasCiudadActualId` a todos los usuarios existentes
 *    (marca qué ciudad corresponden las marcasTerritoriales actuales)
 *
 * 2. Añade `totalBarrios` a grupos existentes contando su subcolección
 *    (reemplaza el array `barriosConquistados` para el conteo)
 *
 * Uso:
 *   node scripts/migrarDeudaTecnicaCritica.mjs
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
try { admin = require('firebase-admin'); } catch {
  console.error('❌ firebase-admin no instalado.'); process.exit(1);
}
const raw = await readFile(RUTA_SA, 'utf8').catch(() => null);
if (!raw) { console.error('❌ No se encontró serviceAccount.json'); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore();

const chunked = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

// ── 1. Usuarios: añadir marcasCiudadActualId ─────────────────────────────────

console.log('\n👤 Migrando usuarios → marcasCiudadActualId...');
const usuariosSnap = await db.collection('usuarios').get();
let migradosUsuarios = 0;
let yaTeníanCampo = 0;

for (const chunk of chunked(usuariosSnap.docs, BATCH_SIZE)) {
  const batch = db.batch();
  for (const d of chunk) {
    const data = d.data();
    if (data.marcasCiudadActualId) { yaTeníanCampo++; continue; }
    if (!data.ciudadActualId) continue;
    batch.update(d.ref, { marcasCiudadActualId: data.ciudadActualId });
    migradosUsuarios++;
  }
  await batch.commit();
}

console.log(`   ✅ ${migradosUsuarios} usuarios migrados`);
if (yaTeníanCampo > 0) console.log(`   ⏭️  ${yaTeníanCampo} ya tenían el campo`);

// ── 2. Grupos: añadir totalBarrios desde array existente ─────────────────────

console.log('\n👥 Migrando grupos → totalBarrios...');
const gruposSnap = await db.collection('grupos').get();
let migradosGrupos = 0;

for (const chunk of chunked(gruposSnap.docs, BATCH_SIZE)) {
  const batch = db.batch();
  for (const d of chunk) {
    const data = d.data();
    if (data.totalBarrios !== undefined) continue;
    const totalBarrios = data.barriosConquistados?.length ?? 0;
    batch.update(d.ref, { totalBarrios });
    migradosGrupos++;
  }
  await batch.commit();
}

console.log(`   ✅ ${migradosGrupos} grupos migrados`);

// ── Resumen ───────────────────────────────────────────────────────────────────

console.log('\n🎉 Migración completada.');
console.log('   • marcasCiudadActualId añadido a usuarios existentes');
console.log('   • totalBarrios calculado en grupos existentes');
console.log('\n   Los datos históricos de marcasTerritoriales se archivan');
console.log('   automáticamente la próxima vez que el usuario cambie de ciudad.\n');
