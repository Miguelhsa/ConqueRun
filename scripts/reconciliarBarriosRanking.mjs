/**
 * Reconcilia el campo `barrios` en rankingsCiudad para todos los usuarios.
 * El trigger descontarTerritorioSegmentadoPerdido no es 100% fiable, por lo
 * que los contadores pueden quedar inflados. Este script los recalcula contando
 * los territorios donde cada usuario es dueño real en su segmento.
 *
 * Uso: node scripts/reconciliarBarriosRanking.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccount.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function contarBarriosReales(uid, ciudadId, segmentoCompetitivo) {
  if (!uid || !ciudadId || !segmentoCompetitivo) return 0;
  try {
    const snap = await db.collectionGroup('segmentos')
      .where('ciudadId', '==', ciudadId)
      .where('segmentoCompetitivo', '==', segmentoCompetitivo)
      .where('dueno', '==', uid)
      .count()
      .get();
    return snap.data().count;
  } catch (e) {
    // Fallback sin índice compuesto: leer todos y filtrar
    const [terrs, barrs] = await Promise.all([
      db.collection('territorios').where('ciudadId', '==', ciudadId).get(),
      db.collection('barrios').where('ciudadId', '==', ciudadId).get(),
    ]);
    const todos = [...terrs.docs, ...barrs.docs];
    let count = 0;
    for (const t of todos) {
      const segSnap = await t.ref.collection('segmentos').doc(segmentoCompetitivo).get();
      if (segSnap.exists && segSnap.data()?.dueno === uid) count++;
    }
    return count;
  }
}

async function main() {
  console.log('Cargando entradas de rankingsCiudad...');
  const snap = await db.collection('rankingsCiudad').get();
  console.log(`Total entradas: ${snap.size}`);

  let actualizados = 0;
  let sinCambio = 0;
  let errores = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const { uid, ciudadId, segmentoCompetitivo, barrios: barriosActual } = data;

    if (!uid || !ciudadId || !segmentoCompetitivo) {
      console.log(`  SKIP ${docSnap.id} — faltan campos`);
      continue;
    }

    try {
      const barriosReales = await contarBarriosReales(uid, ciudadId, segmentoCompetitivo);

      if (barriosReales === barriosActual) {
        sinCambio++;
        continue;
      }

      console.log(`  ${uid} (${data.nickname ?? '?'}): ${barriosActual} → ${barriosReales}`);
      await docSnap.ref.set(
        { barrios: barriosReales, actualizadoEn: FieldValue.serverTimestamp() },
        { merge: true }
      );
      actualizados++;
    } catch (e) {
      console.error(`  ERROR ${docSnap.id}:`, e.message);
      errores++;
    }
  }

  console.log(`\nResultado: ${actualizados} actualizados, ${sinCambio} sin cambio, ${errores} errores`);
}

main().catch(console.error);
