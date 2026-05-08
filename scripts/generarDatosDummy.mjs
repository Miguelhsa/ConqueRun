/**
 * Genera datos dummy en Firestore para probar el frontend.
 * Garantiza consistencia en todas las pantallas: Correr, Ranking y Perfil.
 *
 * Uso:
 *   node scripts/generarDatosDummy.mjs                  → inserta datos
 *   node scripts/generarDatosDummy.mjs --limpiar         → borra los datos generados
 *
 * Fuentes de datos por pantalla:
 *   Correr  → usuarios/{uid}.ultimasCarreras
 *   Ranking → rankingsCiudad + territorios (conteo barrios)
 *   Perfil  → usuarios/{uid} + marcasTerritoriales subcollection + territorios
 */

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const RUTA_SERVICE_ACCOUNT = join(__dirname, 'serviceAccount.json');
const EMAIL_USUARIO = 'miguelhsa@gmail.com';
const CIUDAD_ID = 'es-madrid';
const CIUDAD_NOMBRE = 'Madrid';

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
const auth = admin.auth();
const limpiar = process.argv.includes('--limpiar');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const hace = (dias) => new Date(Date.now() - dias * 86400_000);
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

const IDS_DUMMY_RANKING = [
  'dummy_runner_1', 'dummy_runner_2', 'dummy_runner_3', 'dummy_runner_4',
  'dummy_runner_5', 'dummy_runner_6', 'dummy_runner_7', 'dummy_runner_8',
  'dummy_runner_9',
];

// Campos del doc usuario que sobrescribimos (para restaurar en --limpiar)
const CAMPOS_USUARIO = [
  'puntosTotales', 'distanciaTotal', 'duracionTotal', 'carrerasTotal',
  'barriosConquistadosTotal', 'racha', 'logros', 'ultimasCarreras',
  'ciudadActualId', 'ciudadActualNombre',
];

// ─── Obtener UID real ─────────────────────────────────────────────────────────

let uid;
try {
  const user = await auth.getUserByEmail(EMAIL_USUARIO);
  uid = user.uid;
  console.log(`\n👤 Usuario: ${EMAIL_USUARIO} → ${uid}`);
} catch {
  console.error(`❌ No se encontró el usuario ${EMAIL_USUARIO} en Firebase Auth`);
  process.exit(1);
}

// ─── LIMPIAR ─────────────────────────────────────────────────────────────────

if (limpiar) {
  console.log('\n🧹 Limpiando datos dummy...\n');

  const metaSnap = await db.collection('_dummyMeta').doc('generarDatosDummy').get();
  if (!metaSnap.exists) {
    console.error('❌ No se encontró _dummyMeta/generarDatosDummy — ¿ya se limpió?');
    process.exit(1);
  }
  const meta = metaSnap.data();

  // 1. Restaurar territorios a su estado original
  if ((meta.territoriosOriginales ?? []).length > 0) {
    const batchTerr = db.batch();
    for (const orig of meta.territoriosOriginales) {
      batchTerr.update(db.collection('territorios').doc(orig.id), {
        dueno: orig.dueno ?? null,
        duenoPuntos: orig.duenoPuntos ?? 0,
        conquistadoEn: orig.conquistadoEn ?? null,
      });
    }
    await batchTerr.commit();
    console.log(`   ✓ ${meta.territoriosOriginales.length} territorios restaurados`);
  }

  // 2. Borrar marcasTerritoriales del usuario
  const idsMarc = meta.marcasTerritoriales ?? [];
  if (idsMarc.length > 0) {
    const batchMarc = db.batch();
    for (const id of idsMarc) {
      batchMarc.delete(
        db.collection('usuarios').doc(uid).collection('marcasTerritoriales').doc(id)
      );
    }
    await batchMarc.commit();
    console.log(`   ✓ ${idsMarc.length} marcasTerritoriales eliminadas`);
  }

  // 3. Restaurar doc usuario (campos que sobrescribimos)
  const restoredUser = {};
  for (const campo of CAMPOS_USUARIO) {
    const val = meta.userDocOriginal?.[campo];
    restoredUser[campo] = val === '_AUSENTE_' ? FieldValue.delete() : (val ?? null);
  }
  await db.collection('usuarios').doc(uid).update(restoredUser);
  console.log('   ✓ Perfil de usuario restaurado');

  // 4. Borrar ranking dummy + entrada propia
  const batchRank = db.batch();
  for (const dummyUid of IDS_DUMMY_RANKING) {
    batchRank.delete(db.collection('rankingsCiudad').doc(`${CIUDAD_ID}_${dummyUid}`));
  }
  batchRank.delete(db.collection('rankingsCiudad').doc(`${CIUDAD_ID}_${uid}`));
  await batchRank.commit();
  console.log(`   ✓ ${IDS_DUMMY_RANKING.length + 1} entradas de ranking eliminadas`);

  // 5. Borrar metadatos
  await db.collection('_dummyMeta').doc('generarDatosDummy').delete();
  console.log('   ✓ Metadatos dummy eliminados\n');

  console.log('✅ Limpieza completada.\n');
  process.exit(0);
}

// ─── INSERTAR DATOS ───────────────────────────────────────────────────────────

console.log('\n🏗️  Generando datos dummy...\n');

// ── 0. Leer estado actual del usuario ────────────────────────────────────────

const userSnap = await db.collection('usuarios').doc(uid).get();
const userDataActual = userSnap.exists ? userSnap.data() : {};

// Guardar estado previo para restauración (sentinel '_AUSENTE_' = campo no existía)
const userDocOriginal = {};
for (const campo of CAMPOS_USUARIO) {
  userDocOriginal[campo] = campo in userDataActual ? (userDataActual[campo] ?? null) : '_AUSENTE_';
}

// ── 1. Leer territorios existentes de Madrid ──────────────────────────────────

const terrSnap = await db.collection('territorios')
  .where('ciudadId', '==', CIUDAD_ID).get();

if (terrSnap.empty) {
  console.error('❌ No hay territorios para Madrid. Ejecuta primero cargarBarrios.js');
  process.exit(1);
}

if (terrSnap.size < 7) {
  console.error(`❌ Hay solo ${terrSnap.size} territorios en Madrid. Se necesitan al menos 7.`);
  process.exit(1);
}

const todosTerrDocs = terrSnap.docs;
const terrsUid     = todosTerrDocs.slice(0, 4); // 4 territorios → propiedad del usuario
const terrsDisputa = todosTerrDocs.slice(4, 7); // 3 territorios → user tiene marcas, rival es dueño

// Estado original de los 7 territorios que vamos a modificar
const territoriosOriginales = todosTerrDocs.slice(0, 7).map(d => {
  const data = d.data();
  return {
    id: d.id,
    dueno: data.dueno ?? null,
    duenoPuntos: data.duenoPuntos ?? 0,
    conquistadoEn: data.conquistadoEn ?? null,
  };
});

// ── 2. Definir números consistentes ──────────────────────────────────────────

/*
  Carreras:
    carrera_1: 10.24 km, 49:00, ritmo 4:47 → 114 pts  (hace 1 día)
    carrera_2:  5.18 km, 27:30, ritmo 5:18 →  44 pts  (hace 4 días)
    carrera_3: 21.10 km, 1:52:00, ritmo 5:19 → 180 pts (hace 7 días)
    ─────────────────────────────────────────────────────
    Total:     36.52 km  |  3h 08:30  |  338 pts  |  3 carreras

  Territorios propiedad del usuario (4):
    pts acumulados: 114 + 87 + 62 + 75 = 338 (coincide con puntosTotales)

  Zonas en disputa (3):
    user tiene marcas pero rival lleva ventaja
*/

const ultimasCarreras = [
  {
    id: 'dummy_carrera_1',
    fecha: hace(1).getTime(),
    distancia: 10240,
    duracion: 2940,
    ritmoMedio: 287,
    puntos: 114,
    puntosPersonales: 114,
    source: 'conqurun',
    verificationStatus: 'self_recorded',
  },
  {
    id: 'dummy_carrera_2',
    fecha: hace(4).getTime(),
    distancia: 5180,
    duracion: 1650,
    ritmoMedio: 319,
    puntos: 44,
    puntosPersonales: 44,
    source: 'conqurun',
    verificationStatus: 'self_recorded',
  },
  {
    id: 'dummy_carrera_3',
    fecha: hace(7).getTime(),
    distancia: 21100,
    duracion: 6720,
    ritmoMedio: 318,
    puntos: 180,
    puntosPersonales: 180,
    source: 'conqurun',
    verificationStatus: 'self_recorded',
  },
];

// Puntos acumulados del usuario en cada territorio que posee
const ptsUid = [114, 87, 62, 75];

// Para territorios en disputa: rival es dueño, usuario tiene marcas menores
const configDisputa = [
  { duenoId: 'dummy_runner_1', duenoPuntos: 180, misMarcas: 75 },
  { duenoId: 'dummy_runner_2', duenoPuntos: 195, misMarcas: 44 },
  { duenoId: 'dummy_runner_4', duenoPuntos: 158, misMarcas: 30 },
];

// ── 3. Batch principal ────────────────────────────────────────────────────────

const batch = db.batch();

// Territorios propiedad del usuario
for (let i = 0; i < terrsUid.length; i++) {
  batch.update(terrsUid[i].ref, {
    dueno: uid,
    duenoPuntos: ptsUid[i],
    conquistadoEn: FieldValue.serverTimestamp(),
  });
  // marcasTerritorial: el usuario acumuló esos mismos puntos corriendo ahí
  batch.set(
    db.collection('usuarios').doc(uid).collection('marcasTerritoriales').doc(terrsUid[i].id),
    { puntos: ptsUid[i], ciudadId: CIUDAD_ID, coleccion: 'territorios', actualizadoEn: FieldValue.serverTimestamp() }
  );
}

// Territorios en disputa
for (let i = 0; i < terrsDisputa.length; i++) {
  batch.update(terrsDisputa[i].ref, {
    dueno: configDisputa[i].duenoId,
    duenoPuntos: configDisputa[i].duenoPuntos,
    conquistadoEn: FieldValue.serverTimestamp(),
  });
  // marcasTerritorial: el usuario pasó por ahí pero no pudo conquistarlo
  batch.set(
    db.collection('usuarios').doc(uid).collection('marcasTerritoriales').doc(terrsDisputa[i].id),
    { puntos: configDisputa[i].misMarcas, ciudadId: CIUDAD_ID, coleccion: 'territorios', actualizadoEn: FieldValue.serverTimestamp() }
  );
}

// Doc usuario: stats + ultimasCarreras + ciudad
batch.set(db.collection('usuarios').doc(uid), {
  ultimasCarreras,
  puntosTotales: 338,
  distanciaTotal: 36520,
  duracionTotal: 11310,
  carrerasTotal: 3,
  barriosConquistadosTotal: 4,
  racha: 3,
  logros: ['km_10', 'b_1', 'b_5', 'racha_3'],
  ciudadActualId: CIUDAD_ID,
  ciudadActualNombre: CIUDAD_NOMBRE,
}, { merge: true });

// Ranking: 9 corredores dummy
const competidores = [
  { uid: 'dummy_runner_1', nickname: 'LaraVelez',    puntos: 1240, carreras: 31, totalMetros: 312000, pais: { nombre: 'España',   bandera: '🇪🇸' } },
  { uid: 'dummy_runner_2', nickname: 'MarcTorres',   puntos:  980, carreras: 25, totalMetros: 248000, pais: { nombre: 'España',   bandera: '🇪🇸' } },
  { uid: 'dummy_runner_3', nickname: 'SofíaRuiz',    puntos:  870, carreras: 22, totalMetros: 198000, pais: { nombre: 'España',   bandera: '🇪🇸' } },
  { uid: 'dummy_runner_4', nickname: 'CarlosNúñez',  puntos:  710, carreras: 18, totalMetros: 167000, pais: { nombre: 'España',   bandera: '🇪🇸' } },
  { uid: 'dummy_runner_5', nickname: 'AnaFernández', puntos:  590, carreras: 15, totalMetros: 143000, pais: { nombre: 'México',   bandera: '🇲🇽' } },
  { uid: 'dummy_runner_6', nickname: 'JavierLópez',  puntos:  480, carreras: 13, totalMetros: 121000, pais: { nombre: 'España',   bandera: '🇪🇸' } },
  { uid: 'dummy_runner_7', nickname: 'IsabelMolina', puntos:  410, carreras: 11, totalMetros:  98000, pais: { nombre: 'España',   bandera: '🇪🇸' } },
  { uid: 'dummy_runner_8', nickname: 'PedroAlba',    puntos:  370, carreras:  9, totalMetros:  84000, pais: { nombre: 'Colombia', bandera: '🇨🇴' } },
  { uid: 'dummy_runner_9', nickname: 'NuriaOrtega',  puntos:  350, carreras:  8, totalMetros:  76000, pais: { nombre: 'España',   bandera: '🇪🇸' } },
];

for (const c of competidores) {
  batch.set(db.collection('rankingsCiudad').doc(`${CIUDAD_ID}_${c.uid}`), {
    ciudadId: CIUDAD_ID,
    uid: c.uid,
    nickname: c.nickname,
    puntos: c.puntos,
    carreras: c.carreras,
    totalMetros: c.totalMetros,
    barrios: 0,  // contarBarriosPorUid lo calcula dinámicamente desde los territorios reales
    stravaVerificadas: 0,
    topLogros: [],
    fotoPerfil: null,
    fotoPerfilEstado: null,
    pais: c.pais,
    actualizadoEn: FieldValue.serverTimestamp(),
  });
}

// Entrada del usuario real en el ranking
batch.set(db.collection('rankingsCiudad').doc(`${CIUDAD_ID}_${uid}`), {
  ciudadId: CIUDAD_ID,
  uid,
  puntos: 338,
  carreras: 3,
  totalMetros: 36520,
  stravaVerificadas: 0,
  barrios: 4,
  topLogros: ['km_10', 'b_1', 'b_5'],
  fotoPerfil: userDataActual.fotoPerfil ?? null,
  fotoPerfilEstado: userDataActual.fotoPerfilEstado ?? null,
  pais: userDataActual.pais ?? null,
  nickname: userDataActual.nickname ?? 'Corredor anónimo',
  actualizadoEn: FieldValue.serverTimestamp(),
}, { merge: true });

await batch.commit();

console.log('   ✓ Territorios actualizados (4 propios + 3 en disputa)');
console.log('   ✓ marcasTerritoriales escritas (7 entradas)');
console.log('   ✓ ultimasCarreras y stats del usuario escritos');
console.log(`   ✓ ${competidores.length} corredores dummy + entrada propia en rankingsCiudad`);

// ── 4. Guardar metadatos para restaurar en --limpiar ──────────────────────────

await db.collection('_dummyMeta').doc('generarDatosDummy').set({
  uid,
  ciudadId: CIUDAD_ID,
  userDocOriginal,
  territoriosOriginales,
  marcasTerritoriales: [
    ...terrsUid.map(d => d.id),
    ...terrsDisputa.map(d => d.id),
  ],
  creadoEn: FieldValue.serverTimestamp(),
});
console.log('   ✓ Metadatos de restauración guardados en _dummyMeta');

// ─── Resumen ──────────────────────────────────────────────────────────────────

const nombresUid = terrsUid.map(d => d.data().nombreVisible ?? d.data().nombre ?? d.id);
const nombresDisputa = terrsDisputa.map((d, i) => {
  const nombre = d.data().nombreVisible ?? d.data().nombre ?? d.id;
  return `${nombre} — tus pts: ${configDisputa[i].misMarcas} vs rival: ${configDisputa[i].duenoPuntos}`;
});

console.log(`
✅ Datos dummy generados correctamente.

   📊 Números consistentes en todas las pantallas:
      Puntos totales : 338  |  Carreras: 3  |  Barrios conquistados: 4
      Distancia total: 36.5 km  |  Tiempo total: 3h 08:30

   🚩 Territorios conquistados (dueno = tú):
      · ${nombresUid.join('\n      · ')}

   ⚔️  Zonas en disputa (tus marcas < rival):
      · ${nombresDisputa.join('\n      · ')}

   📱 Pantallas para revisar:
      • Correr  → 3 carreras (10,2 km / 5,2 km / 21,1 km)
      • Ranking → top 10 Madrid, tú en posición 10ª
      • Perfil  → stats, 4 barrios, 3 zonas en disputa, racha 3, 4 logros

   ⚠️  Si la app Expo muestra datos viejos → sacude el dispositivo → Reload JS

   🧹 Para limpiar:
      node scripts/generarDatosDummy.mjs --limpiar
`);
