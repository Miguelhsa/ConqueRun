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

const SEGMENTOS_RITMO = [
  { id: 'elite', nombre: 'Leyenda', max: 255 },
  { id: 'oro', nombre: 'Señor del mapa', min: 255, max: 300 },
  { id: 'plata', nombre: 'Conquistador', min: 300, max: 345 },
  { id: 'bronce', nombre: 'Retador', min: 345, max: 390 },
  { id: 'popular', nombre: 'Marcador', min: 390, max: 480 },
  { id: 'iniciacion', nombre: 'Explorador', min: 480, max: 720 },
];

const calcularGrupoEdad = (fechaNacimiento) => {
  if (!fechaNacimiento) return 'sin_edad';
  const hoy = new Date();
  const nac = new Date(fechaNacimiento);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  if (edad < 18) return '13-17';
  if (edad < 30) return '18-30';
  if (edad < 45) return '30-45';
  if (edad < 60) return '45-60';
  return '60+';
};

const calcularSegmentoRitmo = (ritmoSegundosKm) => {
  if (!ritmoSegundosKm || !isFinite(ritmoSegundosKm)) return 'popular';
  const segmento = SEGMENTOS_RITMO.find(s =>
    (s.min == null || ritmoSegundosKm >= s.min) &&
    (s.max == null || ritmoSegundosKm < s.max)
  );
  return segmento?.id ?? 'popular';
};

const normalizarGeneroSegmento = (genero) => (
  genero === 'hombre' || genero === 'mujer' ? genero : 'sin_genero'
);

const etiquetaSegmentoRitmo = (segmentoRitmo) => (
  SEGMENTOS_RITMO.find(s => s.id === segmentoRitmo)?.nombre ?? 'Marcador'
);

const etiquetaSegmentoCompetitivo = ({ segmentoRitmo, genero, grupoEdad }) => {
  const generoLabel = genero === 'hombre' ? 'Hombre' : genero === 'mujer' ? 'Mujer' : 'General';
  return `${etiquetaSegmentoRitmo(segmentoRitmo)} · ${generoLabel} · ${grupoEdad ?? 'Sin edad'}`;
};

const IDS_DUMMY_RANKING = [
  'dummy_runner_1', 'dummy_runner_2', 'dummy_runner_3', 'dummy_runner_4',
  'dummy_runner_5', 'dummy_runner_6', 'dummy_runner_7', 'dummy_runner_8',
  'dummy_runner_9',
];
const GRUPO_USUARIO_ID = 'dummy_group_conquistadores';
const GRUPO_RIVAL_ID = 'dummy_group_rivales';
const IDS_DUMMY_GRUPOS = [GRUPO_USUARIO_ID, GRUPO_RIVAL_ID];

// Campos del doc usuario que sobrescribimos (para restaurar en --limpiar)
const CAMPOS_USUARIO = [
  'puntosTotales', 'distanciaTotal', 'duracionTotal', 'carrerasTotal',
  'barriosConquistadosTotal', 'racha', 'logros', 'ultimasCarreras',
  'ciudadActualId', 'ciudadActualNombre', 'paisCodigo', 'ritmo30d',
  'segmentoRitmo', 'segmentoGenero', 'segmentoEdad', 'grupoEdad',
  'segmentoCompetitivo', 'segmentoEtiqueta',
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
      batchTerr.set(db.collection('territorios').doc(orig.id), {
        dueno: orig.dueno ?? null,
        duenoPuntos: orig.duenoPuntos ?? 0,
        conquistadoEn: orig.conquistadoEn ?? null,
      }, { merge: true });
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

  // 3. Borrar carreras dummy usadas por el cálculo de ritmo 30d
  const idsCarreras = meta.carreras ?? [];
  if (idsCarreras.length > 0) {
    const batchCarr = db.batch();
    for (const id of idsCarreras) {
      batchCarr.delete(db.collection('carreras').doc(id));
    }
    await batchCarr.commit();
    console.log(`   ✓ ${idsCarreras.length} carreras eliminadas`);
  }

  // 4. Borrar dueños segmentados dummy del mapa
  const segmentosTerritoriales = meta.segmentosTerritoriales ?? [];
  if (segmentosTerritoriales.length > 0) {
    const batchSeg = db.batch();
    for (const item of segmentosTerritoriales) {
      batchSeg.delete(
        db.collection(item.coleccion ?? 'territorios')
          .doc(item.id)
          .collection('segmentos')
          .doc(item.segmentoCompetitivo)
      );
    }
    await batchSeg.commit();
    console.log(`   ✓ ${segmentosTerritoriales.length} segmentos territoriales eliminados`);
  }

  // 5. Restaurar doc usuario (campos que sobrescribimos)
  const restoredUser = {};
  for (const campo of CAMPOS_USUARIO) {
    const val = meta.userDocOriginal?.[campo];
    restoredUser[campo] = val === '_AUSENTE_' ? FieldValue.delete() : (val ?? null);
  }
  await db.collection('usuarios').doc(uid).update(restoredUser);
  console.log('   ✓ Perfil de usuario restaurado');

  // 6. Borrar ranking dummy + entrada propia
  const batchRank = db.batch();
  for (const dummyUid of IDS_DUMMY_RANKING) {
    batchRank.delete(db.collection('rankingsCiudad').doc(`${CIUDAD_ID}_${dummyUid}`));
  }
  batchRank.delete(db.collection('rankingsCiudad').doc(`${CIUDAD_ID}_${uid}`));
  await batchRank.commit();
  console.log(`   ✓ ${IDS_DUMMY_RANKING.length + 1} entradas de ranking eliminadas`);

  // 7. Borrar grupos dummy y sus marcas territoriales
  const grupoMarcas = meta.grupoMarcas ?? [];
  if (grupoMarcas.length > 0 || IDS_DUMMY_GRUPOS.length > 0) {
    const batchGrupos = db.batch();
    for (const marca of grupoMarcas) {
      batchGrupos.delete(
        db.collection('grupoMarcas')
          .doc(marca.grupoId)
          .collection('marcasTerritoriales')
          .doc(marca.territorioId)
      );
    }
    for (const grupoId of IDS_DUMMY_GRUPOS) {
      batchGrupos.delete(db.collection('grupos').doc(grupoId));
    }
    await batchGrupos.commit();
    console.log(`   ✓ ${IDS_DUMMY_GRUPOS.length} grupos dummy eliminados`);
  }

  // 8. Borrar metadatos
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

if (terrSnap.size < 16) {
  console.error(`❌ Hay solo ${terrSnap.size} territorios en Madrid. Se necesitan al menos 16.`);
  process.exit(1);
}

const todosTerrDocs = terrSnap.docs;
const terrsUid     = todosTerrDocs.slice(0, 4); // 4 territorios → propiedad del usuario
const terrsDisputa = todosTerrDocs.slice(4, 7); // 3 territorios → user tiene marcas, rival es dueño
const terrsDummy   = todosTerrDocs.slice(7, 16); // 9 territorios → propiedad de corredores dummy

// Estado original de los territorios que vamos a modificar
const territoriosOriginales = todosTerrDocs.slice(0, 16).map(d => {
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
    carrera_1: 10.24 km, 49:00, ritmo 4:47 → 18 pts  (hace 1 día)
    carrera_2:  5.18 km, 27:30, ritmo 5:18 →  5 pts  (hace 4 días)
    carrera_3: 21.10 km, 1:52:00, ritmo 5:19 → 20 pts (hace 7 días)
    ─────────────────────────────────────────────────────
    Total:     36.52 km  |  3h 08:30  |  43 pts  |  3 carreras

  Territorios propiedad del usuario (4):
    pts acumulados: 18 + 10 + 7 + 8 = 43 (coincide con puntosTotales)

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
    puntos: 18,
    puntosPersonales: 18,
    source: 'conqurun',
    verificationStatus: 'self_recorded',
  },
  {
    id: 'dummy_carrera_2',
    fecha: hace(4).getTime(),
    distancia: 5180,
    duracion: 1650,
    ritmoMedio: 319,
    puntos: 5,
    puntosPersonales: 5,
    source: 'conqurun',
    verificationStatus: 'self_recorded',
  },
  {
    id: 'dummy_carrera_3',
    fecha: hace(7).getTime(),
    distancia: 21100,
    duracion: 6720,
    ritmoMedio: 318,
    puntos: 20,
    puntosPersonales: 20,
    source: 'conqurun',
    verificationStatus: 'self_recorded',
  },
];

const distancia30d = ultimasCarreras.reduce((acc, carrera) => acc + carrera.distancia, 0);
const duracion30d = ultimasCarreras.reduce((acc, carrera) => acc + carrera.duracion, 0);
const ritmo30d = Math.round(duracion30d / (distancia30d / 1000)); // 5:10/km
const segmentoRitmo = calcularSegmentoRitmo(ritmo30d);
const segmentoGenero = normalizarGeneroSegmento(userDataActual.genero);
const segmentoEdad = calcularGrupoEdad(userDataActual.fechaNacimiento);
const segmentoCompetitivo = `${segmentoRitmo}_${segmentoGenero}_${segmentoEdad}`;
const segmentoEtiqueta = etiquetaSegmentoCompetitivo({
  segmentoRitmo,
  genero: segmentoGenero,
  grupoEdad: segmentoEdad,
});
const puntosTotales = ultimasCarreras.reduce((acc, carrera) => acc + carrera.puntos, 0);

// Puntos acumulados del usuario en cada territorio que posee
const ptsUid = [18, 10, 7, 8];

// Para territorios en disputa: rival es dueño, usuario tiene marcas menores
const configDisputa = [
  { duenoId: 'dummy_runner_1', duenoPuntos: 180, misMarcas: 12 },
  { duenoId: 'dummy_runner_2', duenoPuntos: 195, misMarcas: 8 },
  { duenoId: 'dummy_runner_4', duenoPuntos: 158, misMarcas: 6 },
];

// Ranking: 9 corredores dummy — nombres del mismo género que el usuario real
const PERFILES_HOMBRE = [
  { nickname: 'MarcTorres',    pais: { nombre: 'España',    bandera: '🇪🇸' } },
  { nickname: 'CarlosNúñez',   pais: { nombre: 'España',    bandera: '🇪🇸' } },
  { nickname: 'JavierLópez',   pais: { nombre: 'España',    bandera: '🇪🇸' } },
  { nickname: 'PedroAlba',     pais: { nombre: 'Colombia',  bandera: '🇨🇴' } },
  { nickname: 'DiegoMora',     pais: { nombre: 'México',    bandera: '🇲🇽' } },
  { nickname: 'AlbertoVega',   pais: { nombre: 'España',    bandera: '🇪🇸' } },
  { nickname: 'SergioRueda',   pais: { nombre: 'España',    bandera: '🇪🇸' } },
  { nickname: 'RubénCastro',   pais: { nombre: 'Argentina', bandera: '🇦🇷' } },
  { nickname: 'FernandoGil',   pais: { nombre: 'España',    bandera: '🇪🇸' } },
];
const PERFILES_MUJER = [
  { nickname: 'LaraVelez',     pais: { nombre: 'España',    bandera: '🇪🇸' } },
  { nickname: 'SofíaRuiz',     pais: { nombre: 'España',    bandera: '🇪🇸' } },
  { nickname: 'AnaFernández',  pais: { nombre: 'México',    bandera: '🇲🇽' } },
  { nickname: 'IsabelMolina',  pais: { nombre: 'España',    bandera: '🇪🇸' } },
  { nickname: 'NuriaOrtega',   pais: { nombre: 'España',    bandera: '🇪🇸' } },
  { nickname: 'MaríaHidalgo',  pais: { nombre: 'España',    bandera: '🇪🇸' } },
  { nickname: 'CristinaOlmo',  pais: { nombre: 'Colombia',  bandera: '🇨🇴' } },
  { nickname: 'LucíaBlanco',   pais: { nombre: 'España',    bandera: '🇪🇸' } },
  { nickname: 'PatriciaReyes', pais: { nombre: 'Argentina', bandera: '🇦🇷' } },
];
const perfilesDummy = segmentoGenero === 'mujer' ? PERFILES_MUJER : PERFILES_HOMBRE;
const competidores = IDS_DUMMY_RANKING.map((dummyUid, i) => ({
  uid: dummyUid,
  ...perfilesDummy[i],
  puntos:      [1240, 980, 870, 710, 590, 480, 410, 370, 350][i],
  carreras:    [31,   25,  22,  18,  15,  13,  11,   9,   8 ][i],
  totalMetros: [312000, 248000, 198000, 167000, 143000, 121000, 98000, 84000, 76000][i],
}));

const barriosPorCompetidor = Object.fromEntries(competidores.map(c => [c.uid, 0]));
configDisputa.forEach(c => { barriosPorCompetidor[c.duenoId] = (barriosPorCompetidor[c.duenoId] ?? 0) + 1; });
terrsDummy.forEach((_, i) => {
  const duenoId = competidores[i]?.uid;
  if (duenoId) barriosPorCompetidor[duenoId] = (barriosPorCompetidor[duenoId] ?? 0) + 1;
});

const configGrupos = [
  { territorio: terrsUid[0], grupoId: GRUPO_USUARIO_ID, puntos: 60 },
  { territorio: terrsUid[1], grupoId: GRUPO_USUARIO_ID, puntos: 45 },
  { territorio: terrsDisputa[0], grupoId: GRUPO_RIVAL_ID, puntos: 80 },
  { territorio: terrsDummy[0], grupoId: GRUPO_RIVAL_ID, puntos: 95 },
];

// ── 3. Batch principal ────────────────────────────────────────────────────────

const batch = db.batch();

const setTerritorioSegmentado = (territorioDoc, dueno, duenoPuntos, extras = {}) => {
  const data = territorioDoc.data();
  batch.set(territorioDoc.ref.collection('segmentos').doc(segmentoCompetitivo), {
    ciudadId: CIUDAD_ID,
    territorioId: territorioDoc.id,
    coleccion: 'territorios',
    nombre: data.nombre ?? null,
    nombreVisible: data.nombreVisible ?? data.nombre ?? territorioDoc.id,
    dueno,
    duenoPuntos,
    conquistadoEn: FieldValue.serverTimestamp(),
    segmentoRitmo,
    segmentoGenero,
    segmentoEdad,
    segmentoCompetitivo,
    segmentoEtiqueta,
    actualizadoEn: FieldValue.serverTimestamp(),
    ...extras,
  }, { merge: true });
};

const carrerasPreviasSnap = await db.collection('carreras').where('uid', '==', uid).get();
for (const carreraDoc of carrerasPreviasSnap.docs) {
  if (
    carreraDoc.id.startsWith('dummy_carrera_') ||
    carreraDoc.id.startsWith(`ficticio_carrera_${uid}_`) ||
    carreraDoc.data()._dummy === true ||
    carreraDoc.data()._ficticio === true
  ) {
    batch.delete(carreraDoc.ref);
  }
}

// Territorios propiedad del usuario
for (let i = 0; i < terrsUid.length; i++) {
  batch.update(terrsUid[i].ref, {
    dueno: uid,
    duenoPuntos: ptsUid[i],
    conquistadoEn: FieldValue.serverTimestamp(),
  });
  setTerritorioSegmentado(terrsUid[i], uid, ptsUid[i]);
  // marcasTerritorial: el usuario acumuló esos mismos puntos corriendo ahí
  batch.set(
    db.collection('usuarios').doc(uid).collection('marcasTerritoriales').doc(`${terrsUid[i].id}_${segmentoCompetitivo}`),
    {
      puntos: ptsUid[i],
      ciudadId: CIUDAD_ID,
      territorioId: terrsUid[i].id,
      coleccion: 'territorios',
      segmentoCompetitivo,
      actualizadoEn: FieldValue.serverTimestamp(),
    }
  );
}

// Territorios en disputa
for (let i = 0; i < terrsDisputa.length; i++) {
  batch.update(terrsDisputa[i].ref, {
    dueno: configDisputa[i].duenoId,
    duenoPuntos: configDisputa[i].duenoPuntos,
    conquistadoEn: FieldValue.serverTimestamp(),
  });
  setTerritorioSegmentado(terrsDisputa[i], configDisputa[i].duenoId, configDisputa[i].duenoPuntos);
  // marcasTerritorial: el usuario pasó por ahí pero no pudo conquistarlo
  batch.set(
    db.collection('usuarios').doc(uid).collection('marcasTerritoriales').doc(`${terrsDisputa[i].id}_${segmentoCompetitivo}`),
    {
      puntos: configDisputa[i].misMarcas,
      ciudadId: CIUDAD_ID,
      territorioId: terrsDisputa[i].id,
      coleccion: 'territorios',
      segmentoCompetitivo,
      actualizadoEn: FieldValue.serverTimestamp(),
    }
  );
}

// Territorios de corredores dummy dentro del mismo segmento, para que ranking y mapa cuadren
for (let i = 0; i < terrsDummy.length; i++) {
  const competidor = competidores[i];
  if (!competidor) continue;
  const puntosTerritorio = Math.max(25, Math.round(competidor.puntos / 8));
  batch.update(terrsDummy[i].ref, {
    dueno: competidor.uid,
    duenoPuntos: puntosTerritorio,
    conquistadoEn: FieldValue.serverTimestamp(),
  });
  setTerritorioSegmentado(terrsDummy[i], competidor.uid, puntosTerritorio);
}

// Grupos dummy: conquistas de equipo en los mismos territorios segmentados que pinta el mapa
batch.set(db.collection('grupos').doc(GRUPO_USUARIO_ID), {
  nombre: 'Conquistadores Centro',
  descripcion: 'Equipo dummy para probar el mapa de equipos',
  esPublico: true,
  codigo: 'DUM001',
  creador: uid,
  miembros: [uid, 'dummy_runner_1'],
  nicknames: {
    [uid]: userDataActual.nickname ?? 'Corredor anónimo',
    dummy_runner_1: competidores[0].nickname,
  },
  ciudadId: CIUDAD_ID,
  ciudadNombre: CIUDAD_NOMBRE,
  puntosTotales: 105,
  carrerasTotales: 3,
  distanciaTotal: 36520,
  duracionTotal: 11310,
  barriosConquistados: 2,
  creadoEn: FieldValue.serverTimestamp(),
  actualizadoEn: FieldValue.serverTimestamp(),
}, { merge: true });

batch.set(db.collection('grupos').doc(GRUPO_RIVAL_ID), {
  nombre: 'Rivales Norte',
  descripcion: 'Equipo rival dummy para probar el mapa de equipos',
  esPublico: true,
  codigo: 'DUM002',
  creador: 'dummy_runner_2',
  miembros: ['dummy_runner_2', 'dummy_runner_4'],
  nicknames: {
    dummy_runner_2: competidores[1].nickname,
    dummy_runner_4: competidores[3].nickname,
  },
  ciudadId: CIUDAD_ID,
  ciudadNombre: CIUDAD_NOMBRE,
  puntosTotales: 175,
  carrerasTotales: 5,
  distanciaTotal: 58000,
  duracionTotal: 17400,
  barriosConquistados: 2,
  creadoEn: FieldValue.serverTimestamp(),
  actualizadoEn: FieldValue.serverTimestamp(),
}, { merge: true });

for (const item of configGrupos) {
  if (!item.territorio) continue;
  batch.set(item.territorio.ref.collection('segmentos').doc(segmentoCompetitivo), {
    duenoGrupo: item.grupoId,
    duenoGrupoPuntos: item.puntos,
    actualizadoGrupoEn: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(
    db.collection('grupoMarcas').doc(item.grupoId).collection('marcasTerritoriales').doc(item.territorio.id),
    {
      puntos: item.puntos,
      ciudadId: CIUDAD_ID,
      territorioId: item.territorio.id,
      segmentoCompetitivo,
      actualizadoEn: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

// Carreras reales para que el cálculo de ritmo de 30 días lea la misma fuente que la app
for (const carrera of ultimasCarreras) {
  batch.set(db.collection('carreras').doc(carrera.id), {
    ...carrera,
    uid,
    fecha: Timestamp.fromMillis(carrera.fecha),
    ciudadId: CIUDAD_ID,
    ciudadNombre: CIUDAD_NOMBRE,
    paisCodigo: 'ES',
    ruta: [],
    aportacionesGrupo: [],
    gruposAportados: [],
    territorioCarrera: [],
    externalProvider: null,
    externalActivityId: null,
    importedAt: null,
    stravaActivityUrl: null,
    ritmo30d,
    segmentoRitmo,
    segmentoGenero,
    segmentoEdad,
    grupoEdad: segmentoEdad,
    segmentoCompetitivo,
    segmentoEtiqueta,
    creadoEn: FieldValue.serverTimestamp(),
    actualizadoEn: FieldValue.serverTimestamp(),
    _dummy: true,
  }, { merge: true });
}

// Doc usuario: stats + ultimasCarreras + ciudad
batch.set(db.collection('usuarios').doc(uid), {
  ultimasCarreras,
  puntosTotales,
  distanciaTotal: 36520,
  duracionTotal: 11310,
  carrerasTotal: 3,
  barriosConquistadosTotal: 4,
  racha: 3,
  logros: ['km_10', 'b_1', 'b_5', 'racha_3'],
  ciudadActualId: CIUDAD_ID,
  ciudadActualNombre: CIUDAD_NOMBRE,
  paisCodigo: 'ES',
  ritmo30d,
  segmentoRitmo,
  segmentoGenero,
  segmentoEdad,
  grupoEdad: segmentoEdad,
  segmentoCompetitivo,
  segmentoEtiqueta,
}, { merge: true });

for (const c of competidores) {
  batch.set(db.collection('rankingsCiudad').doc(`${CIUDAD_ID}_${c.uid}`), {
    ciudadId: CIUDAD_ID,
    uid: c.uid,
    nickname: c.nickname,
    puntos: c.puntos,
    carreras: c.carreras,
    totalMetros: c.totalMetros,
    barrios: barriosPorCompetidor[c.uid] ?? 0,
    stravaVerificadas: 0,
    topLogros: [],
    fotoPerfil: null,
    fotoPerfilEstado: null,
    pais: c.pais,
    genero: segmentoGenero,
    grupoEdad: segmentoEdad,
    ritmo30d,
    segmentoRitmo,
    segmentoGenero,
    segmentoEdad,
    segmentoCompetitivo,
    segmentoEtiqueta,
    actualizadoEn: FieldValue.serverTimestamp(),
  });
}

// Entrada del usuario real en el ranking
batch.set(db.collection('rankingsCiudad').doc(`${CIUDAD_ID}_${uid}`), {
  ciudadId: CIUDAD_ID,
  uid,
  puntos: puntosTotales,
  carreras: 3,
  totalMetros: 36520,
  stravaVerificadas: 0,
  barrios: 4,
  topLogros: ['km_10', 'b_1', 'b_5'],
  fotoPerfil: userDataActual.fotoPerfil ?? null,
  fotoPerfilEstado: userDataActual.fotoPerfilEstado ?? null,
  pais: userDataActual.pais ?? null,
  genero: segmentoGenero,
  grupoEdad: segmentoEdad,
  ritmo30d,
  segmentoRitmo,
  segmentoGenero,
  segmentoEdad,
  segmentoCompetitivo,
  segmentoEtiqueta,
  nickname: userDataActual.nickname ?? 'Corredor anónimo',
  actualizadoEn: FieldValue.serverTimestamp(),
}, { merge: true });

await batch.commit();

console.log('   ✓ Territorios actualizados (4 propios + 3 en disputa + 9 dummy)');
console.log('   ✓ Dueños segmentados escritos para mapa y ranking');
console.log('   ✓ Conquistas de equipos dummy escritas para el modo Equipos');
console.log('   ✓ marcasTerritoriales escritas (7 entradas)');
console.log(`   ✓ ${ultimasCarreras.length} carreras 30d escritas en la colección carreras`);
console.log('   ✓ ultimasCarreras y stats del usuario escritos');
console.log(`   ✓ ${competidores.length} corredores dummy + entrada propia en rankingsCiudad`);

// ── 4. Guardar metadatos para restaurar en --limpiar ──────────────────────────

await db.collection('_dummyMeta').doc('generarDatosDummy').set({
  uid,
  ciudadId: CIUDAD_ID,
  userDocOriginal,
  territoriosOriginales,
  marcasTerritoriales: [
    ...terrsUid.map(d => `${d.id}_${segmentoCompetitivo}`),
    ...terrsDisputa.map(d => `${d.id}_${segmentoCompetitivo}`),
  ],
  segmentosTerritoriales: [
    ...terrsUid.map(d => d.id),
    ...terrsDisputa.map(d => d.id),
    ...terrsDummy.map(d => d.id),
  ].map(id => ({ coleccion: 'territorios', id, segmentoCompetitivo })),
  grupos: IDS_DUMMY_GRUPOS,
  grupoMarcas: configGrupos
    .filter(item => item.territorio)
    .map(item => ({ grupoId: item.grupoId, territorioId: item.territorio.id })),
  carreras: ultimasCarreras.map(c => c.id),
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
      Puntos totales : ${puntosTotales}  |  Carreras: 3  |  Barrios conquistados: 4
      Distancia total: 36.5 km  |  Tiempo total: 3h 08:30
      Ritmo 30d      : 5:10/km  |  Ritmo de conquista: ${etiquetaSegmentoRitmo(segmentoRitmo)}

   🚩 Territorios conquistados (dueno = tú):
      · ${nombresUid.join('\n      · ')}

   ⚔️  Zonas en disputa (tus marcas < rival):
      · ${nombresDisputa.join('\n      · ')}

   📱 Pantallas para revisar:
      • Correr  → 3 carreras (10,2 km / 5,2 km / 21,1 km)
      • Ranking → top 10 Madrid, tú en posición 10ª
      • Perfil  → stats, 4 barrios, 3 zonas en disputa, racha 3, 4 logros
      • Mapa    → modo Individual y modo Equipos con conquistas visibles

   ⚠️  Si la app Expo muestra datos viejos → sacude el dispositivo → Reload JS

   🧹 Para limpiar:
      node scripts/generarDatosDummy.mjs --limpiar
`);
