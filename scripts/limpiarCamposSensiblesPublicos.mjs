// Limpia de las colecciones publicas los campos que identificaban el genero y el
// tramo de edad de cada usuario (incluido el tramo 13-17, que dejaba expuesto
// quien es menor). Ver docs/auditoria-cumplimiento-2026-11.md, hallazgo 6.
//
// Las Cloud Functions ya no escriben estos campos y los borran en cada escritura,
// pero un usuario que no vuelva a correr conservaria los valores antiguos. Este
// script los retira de los documentos existentes.
//
// Uso:  node scripts/limpiarCamposSensiblesPublicos.mjs [--dry]
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const serviceAccount = require('/Users/miguel/conqueRun/scripts/serviceAccount.json');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const DRY = process.argv.includes('--dry');

const OBJETIVOS = [
  { coleccion: 'usuariosPublicos', campos: ['genero', 'segmentoEtiqueta'] },
  { coleccion: 'rankingsCiudad', campos: ['genero', 'grupoEdad', 'segmentoGenero', 'segmentoEdad', 'segmentoEtiqueta'] },
];

async function limpiar({ coleccion, campos }) {
  const snap = await db.collection(coleccion).get();
  let pendientes = 0;
  let lote = db.batch();
  let enLote = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const presentes = campos.filter(c => c in data);
    if (presentes.length === 0) continue;
    pendientes += 1;
    if (DRY) {
      console.log(`  ${doc.id}: ${presentes.join(', ')}`);
      continue;
    }
    lote.update(doc.ref, Object.fromEntries(presentes.map(c => [c, FieldValue.delete()])));
    enLote += 1;
    if (enLote === 400) {
      await lote.commit();
      lote = db.batch();
      enLote = 0;
    }
  }
  if (!DRY && enLote > 0) await lote.commit();

  console.log(`${coleccion}: ${snap.size} documentos, ${pendientes} ${DRY ? 'por limpiar' : 'limpiados'}`);
}

async function main() {
  console.log(DRY ? '— SIMULACION, no escribe —\n' : '— Limpieza real —\n');
  for (const objetivo of OBJETIVOS) await limpiar(objetivo);
}
main().catch(e => { console.error(e); process.exit(1); });
