/**
 * Genera datos ficticios en Firestore para previsualizar las pantallas:
 * Mapa, Correr, Ranking y Grupos.
 *
 * Todos los documentos llevan el prefijo "ficticio_" en su ID o el flag _ficticio: true
 * para poder borrarlos limpiamente después.
 *
 * Uso:
 *   MI_UID=<tu_uid_de_firebase> node scripts/generarDatosFicticios.mjs
 *
 * Para borrarlos después:
 *   node scripts/borrarDatosFicticios.mjs
 */

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const RUTA_SERVICE_ACCOUNT = join(__dirname, 'serviceAccount.json');
const MI_UID = process.env.MI_UID;

if (!MI_UID) {
  console.error('❌ Debes pasar tu UID: MI_UID=<uid> node scripts/generarDatosFicticios.mjs');
  console.error('   Encuéntralo en Firebase Console → Authentication → Users');
  process.exit(1);
}

let admin;
try { admin = require('firebase-admin'); } catch {
  console.error('❌ firebase-admin no instalado. Ejecuta: npm install firebase-admin');
  process.exit(1);
}

const raw = await readFile(RUTA_SERVICE_ACCOUNT, 'utf8').catch(() => null);
if (!raw) { console.error('❌ No se encontró scripts/serviceAccount.json'); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const CIUDAD_ID = 'es-madrid';
const CIUDAD_NOMBRE = 'Madrid';
const ahora = Date.now();
const dia = 86400000;

// ── Segmentos (igual que Cloud Functions) ────────────────────────────────────

const SEGMENTOS_RITMO = [
  { id: 'elite',      nombre: 'Leyenda',         max: 255 },
  { id: 'oro',        nombre: 'Señor del mapa',  min: 255, max: 300 },
  { id: 'plata',      nombre: 'Conquistador',    min: 300, max: 345 },
  { id: 'bronce',     nombre: 'Retador',         min: 345, max: 390 },
  { id: 'popular',    nombre: 'Marcador',        min: 390, max: 480 },
  { id: 'iniciacion', nombre: 'Explorador',      min: 480, max: 720 },
];

const segmentoRitmo = (ritmo) => {
  if (!ritmo) return 'popular';
  return SEGMENTOS_RITMO.find(s => (s.min == null || ritmo >= s.min) && (s.max == null || ritmo < s.max))?.id ?? 'popular';
};

const etiquetaSegmento = (ritmoId, genero, edad) => {
  const r = SEGMENTOS_RITMO.find(s => s.id === ritmoId)?.nombre ?? 'Marcador';
  const g = genero === 'hombre' ? 'Hombre' : 'Mujer';
  return `${r} · ${g} · ${edad}`;
};

const segmento = (ritmo, genero, edad) => {
  const r = segmentoRitmo(ritmo);
  return {
    ritmo30d: ritmo,
    segmentoRitmo: r,
    segmentoGenero: genero,
    segmentoEdad: edad,
    grupoEdad: edad,
    segmentoCompetitivo: `${r}_${genero}_${edad}`,
    segmentoEtiqueta: etiquetaSegmento(r, genero, edad),
  };
};

// ── Usuarios ficticios ────────────────────────────────────────────────────────
// ritmo en segundos/km | edad = grupo edad (18-30 / 30-45 / 45-60)

const usuarios = [
  // Hombres 30-45 (segmento más poblado)
  { id: 'ficticio_u1',  nickname: 'CarlosRunner',    genero: 'hombre', edad: '30-45', ritmo: 278, pais: { bandera: '🇪🇸', nombre: 'España'    }, barrios: 14, carreras: 28, pts: 4820, dist: 312000, logros: ['primer_km', 'primer_barrio', 'maratonista'] },
  { id: 'ficticio_u2',  nickname: 'PabloMontaña',    genero: 'hombre', edad: '30-45', ritmo: 312, pais: { bandera: '🇪🇸', nombre: 'España'    }, barrios: 9,  carreras: 21, pts: 3240, dist: 198000, logros: ['primer_km', 'primer_barrio'] },
  { id: 'ficticio_u3',  nickname: 'AndresMaraton',   genero: 'hombre', edad: '30-45', ritmo: 328, pais: { bandera: '🇲🇽', nombre: 'México'    }, barrios: 6,  carreras: 15, pts: 2340, dist: 143000, logros: ['primer_km'] },
  { id: 'ficticio_u4',  nickname: 'JavierKm',        genero: 'hombre', edad: '30-45', ritmo: 358, pais: { bandera: '🇦🇷', nombre: 'Argentina' }, barrios: 4,  carreras: 10, pts: 1420, dist: 87000,  logros: [] },
  { id: 'ficticio_u5',  nickname: 'ManuelSport',     genero: 'hombre', edad: '30-45', ritmo: 415, pais: { bandera: '🇪🇸', nombre: 'España'    }, barrios: 3,  carreras: 8,  pts: 980,  dist: 61000,  logros: [] },
  { id: 'ficticio_u6',  nickname: 'DavidTrail',      genero: 'hombre', edad: '30-45', ritmo: 442, pais: { bandera: '🇨🇴', nombre: 'Colombia'  }, barrios: 2,  carreras: 5,  pts: 580,  dist: 38000,  logros: [] },

  // Mujeres 30-45
  { id: 'ficticio_u7',  nickname: 'LauraVelocidad',  genero: 'mujer',  edad: '30-45', ritmo: 264, pais: { bandera: '🇪🇸', nombre: 'España'    }, barrios: 11, carreras: 23, pts: 3910, dist: 248000, logros: ['primer_km', 'primer_barrio'] },
  { id: 'ficticio_u8',  nickname: 'CristinaMCorre',  genero: 'mujer',  edad: '30-45', ritmo: 318, pais: { bandera: '🇪🇸', nombre: 'España'    }, barrios: 7,  carreras: 17, pts: 2780, dist: 165000, logros: ['primer_km'] },
  { id: 'ficticio_u9',  nickname: 'MireiaSprint',    genero: 'mujer',  edad: '30-45', ritmo: 362, pais: { bandera: '🇨🇱', nombre: 'Chile'     }, barrios: 4,  carreras: 11, pts: 1890, dist: 112000, logros: [] },

  // Hombres 18-30
  { id: 'ficticio_u10', nickname: 'AlejandroV',      genero: 'hombre', edad: '18-30', ritmo: 238, pais: { bandera: '🇪🇸', nombre: 'España'    }, barrios: 16, carreras: 32, pts: 5640, dist: 384000, logros: ['primer_km', 'primer_barrio', 'maratonista'] },
  { id: 'ficticio_u11', nickname: 'SergioCross',     genero: 'hombre', edad: '18-30', ritmo: 355, pais: { bandera: '🇪🇸', nombre: 'España'    }, barrios: 5,  carreras: 12, pts: 1680, dist: 95000,  logros: ['primer_km'] },

  // Mujeres 18-30
  { id: 'ficticio_u12', nickname: 'MartaCorre',      genero: 'mujer',  edad: '18-30', ritmo: 251, pais: { bandera: '🇪🇸', nombre: 'España'    }, barrios: 13, carreras: 26, pts: 4450, dist: 298000, logros: ['primer_km', 'primer_barrio'] },
  { id: 'ficticio_u13', nickname: 'SofiaJogger',     genero: 'mujer',  edad: '18-30', ritmo: 432, pais: { bandera: '🇵🇪', nombre: 'Perú'      }, barrios: 2,  carreras: 6,  pts: 640,  dist: 41000,  logros: [] },

  // 45-60
  { id: 'ficticio_u14', nickname: 'RosaVeterana',    genero: 'mujer',  edad: '45-60', ritmo: 395, pais: { bandera: '🇪🇸', nombre: 'España'    }, barrios: 3,  carreras: 7,  pts: 820,  dist: 52000,  logros: [] },
];

// Barrios de Madrid asignados (uno por usuario, sin solapar)
const BARRIOS_ASIGNADOS = [
  // ficticio_u10 (16 barrios — el top hombre 18-30)
  { id: 'es-madrid-sol',           dueno: 'ficticio_u10', pts: 850 },
  { id: 'es-madrid-malasana',      dueno: 'ficticio_u10', pts: 720 },
  { id: 'es-madrid-chueca',        dueno: 'ficticio_u10', pts: 690 },
  { id: 'es-madrid-palacio',       dueno: 'ficticio_u10', pts: 610 },
  { id: 'es-madrid-universidad',   dueno: 'ficticio_u10', pts: 580 },
  { id: 'es-madrid-recoletos',     dueno: 'ficticio_u10', pts: 540 },
  { id: 'es-madrid-bellas-vistas', dueno: 'ficticio_u10', pts: 510 },
  { id: 'es-madrid-cuatro-caminos',dueno: 'ficticio_u10', pts: 490 },
  { id: 'es-madrid-castellana',    dueno: 'ficticio_u10', pts: 460 },
  { id: 'es-madrid-almagro',       dueno: 'ficticio_u10', pts: 440 },
  { id: 'es-madrid-trafalgar',     dueno: 'ficticio_u10', pts: 420 },
  { id: 'es-madrid-justicia',      dueno: 'ficticio_u10', pts: 400 },
  { id: 'es-madrid-rios-rosas',    dueno: 'ficticio_u10', pts: 380 },
  { id: 'es-madrid-castillejos',   dueno: 'ficticio_u10', pts: 360 },
  { id: 'es-madrid-almenara',      dueno: 'ficticio_u10', pts: 340 },
  { id: 'es-madrid-valdeacederas', dueno: 'ficticio_u10', pts: 320 },

  // ficticio_u12 (13 barrios — top mujer 18-30)
  { id: 'es-madrid-lavapies',      dueno: 'ficticio_u12', pts: 780 },
  { id: 'es-madrid-la-latina',     dueno: 'ficticio_u12', pts: 710 },
  { id: 'es-madrid-embajadores',   dueno: 'ficticio_u12', pts: 660 },
  { id: 'es-madrid-goya',          dueno: 'ficticio_u12', pts: 620 },
  { id: 'es-madrid-guindalera',    dueno: 'ficticio_u12', pts: 590 },
  { id: 'es-madrid-lista',         dueno: 'ficticio_u12', pts: 550 },
  { id: 'es-madrid-ibiza',         dueno: 'ficticio_u12', pts: 520 },
  { id: 'es-madrid-jeronimos',     dueno: 'ficticio_u12', pts: 490 },
  { id: 'es-madrid-nino-jesus',    dueno: 'ficticio_u12', pts: 460 },
  { id: 'es-madrid-estrella',      dueno: 'ficticio_u12', pts: 430 },
  { id: 'es-madrid-adelfas',       dueno: 'ficticio_u12', pts: 400 },
  { id: 'es-madrid-pacifico',      dueno: 'ficticio_u12', pts: 370 },
  { id: 'es-madrid-cortes',        dueno: 'ficticio_u12', pts: 340 },

  // ficticio_u1 (14 barrios — top hombre 30-45)
  { id: 'es-madrid-gaztambide',    dueno: 'ficticio_u1', pts: 740 },
  { id: 'es-madrid-arapiles',      dueno: 'ficticio_u1', pts: 680 },
  { id: 'es-madrid-vallehermoso',  dueno: 'ficticio_u1', pts: 630 },
  { id: 'es-madrid-fuente-del-berro', dueno: 'ficticio_u1', pts: 590 },
  { id: 'es-madrid-delicias',      dueno: 'ficticio_u1', pts: 550 },
  { id: 'es-madrid-legazpi',       dueno: 'ficticio_u1', pts: 510 },
  { id: 'es-madrid-chopera',       dueno: 'ficticio_u1', pts: 470 },
  { id: 'es-madrid-acacias',       dueno: 'ficticio_u1', pts: 440 },
  { id: 'es-madrid-imperial',      dueno: 'ficticio_u1', pts: 410 },
  { id: 'es-madrid-palos-de-moguer', dueno: 'ficticio_u1', pts: 380 },
  { id: 'es-madrid-atocha',        dueno: 'ficticio_u1', pts: 350 },
  { id: 'es-madrid-niño-jesus',    dueno: 'ficticio_u1', pts: 320 }, // alt spelling
  { id: 'es-madrid-retiro',        dueno: 'ficticio_u1', pts: 300 },
  { id: 'es-madrid-pacífico',      dueno: 'ficticio_u1', pts: 280 },

  // ficticio_u7 (11 barrios — top mujer 30-45)
  { id: 'es-madrid-cortes',        dueno: 'ficticio_u7', pts: 700 },
  { id: 'es-madrid-atocha',        dueno: 'ficticio_u7', pts: 640 },
  { id: 'es-madrid-palos-de-moguer', dueno: 'ficticio_u7', pts: 600 },
  { id: 'es-madrid-chopera',       dueno: 'ficticio_u7', pts: 560 },
  { id: 'es-madrid-legazpi',       dueno: 'ficticio_u7', pts: 520 },
  { id: 'es-madrid-delicias',      dueno: 'ficticio_u7', pts: 480 },
  { id: 'es-madrid-acacias',       dueno: 'ficticio_u7', pts: 450 },
  { id: 'es-madrid-imperial',      dueno: 'ficticio_u7', pts: 410 },
  { id: 'es-madrid-niño-jesus',    dueno: 'ficticio_u7', pts: 380 },
  { id: 'es-madrid-adelfas',       dueno: 'ficticio_u7', pts: 350 },
  { id: 'es-madrid-pacifico',      dueno: 'ficticio_u7', pts: 320 },
];

// ── Carreras ficticias para tu usuario real ───────────────────────────────────

const rutaRetiro = [
  { latitude: 40.4151, longitude: -3.6845 }, { latitude: 40.4162, longitude: -3.6812 },
  { latitude: 40.4178, longitude: -3.6798 }, { latitude: 40.4195, longitude: -3.6810 },
  { latitude: 40.4188, longitude: -3.6843 }, { latitude: 40.4170, longitude: -3.6858 },
  { latitude: 40.4151, longitude: -3.6845 },
];
const rutaSalamanca = [
  { latitude: 40.4220, longitude: -3.6780 }, { latitude: 40.4235, longitude: -3.6750 },
  { latitude: 40.4248, longitude: -3.6730 }, { latitude: 40.4260, longitude: -3.6748 },
  { latitude: 40.4245, longitude: -3.6772 }, { latitude: 40.4220, longitude: -3.6780 },
];
const rutaChamberí = [
  { latitude: 40.4310, longitude: -3.7020 }, { latitude: 40.4328, longitude: -3.6998 },
  { latitude: 40.4340, longitude: -3.6975 }, { latitude: 40.4325, longitude: -3.6955 },
  { latitude: 40.4308, longitude: -3.6978 }, { latitude: 40.4310, longitude: -3.7020 },
];

const carreras = [
  { id: `ficticio_carrera_${MI_UID}_1`, distancia: 8420,  duracion: 2580, ritmoMedio: 306, puntos: 312, ruta: rutaRetiro,    fecha: ahora - dia * 1,  source: 'conqurun',  verificationStatus: 'self_recorded', externalProvider: null },
  { id: `ficticio_carrera_${MI_UID}_2`, distancia: 12100, duracion: 3840, ritmoMedio: 317, puntos: 487, ruta: rutaSalamanca, fecha: ahora - dia * 4,  source: 'conqurun',  verificationStatus: 'self_recorded', externalProvider: null },
  { id: `ficticio_carrera_${MI_UID}_3`, distancia: 5800,  duracion: 1740, ritmoMedio: 300, puntos: 198, ruta: rutaChamberí,  fecha: ahora - dia * 9,  source: 'strava',    verificationStatus: 'strava_verified', externalProvider: 'strava', externalActivityId: '9876543210' },
  { id: `ficticio_carrera_${MI_UID}_4`, distancia: 15300, duracion: 5100, ritmoMedio: 333, puntos: 680, ruta: rutaRetiro,    fecha: ahora - dia * 15, source: 'conqurun',  verificationStatus: 'self_recorded', externalProvider: null },
  { id: `ficticio_carrera_${MI_UID}_5`, distancia: 6200,  duracion: 1860, ritmoMedio: 300, puntos: 220, ruta: rutaSalamanca, fecha: ahora - dia * 22, source: 'conqurun',  verificationStatus: 'self_recorded', externalProvider: null },
];

// ── Grupos ficticios ──────────────────────────────────────────────────────────

const grupos = [
  {
    id: 'ficticio_grupo_1',
    nombre: 'Corredores del Retiro',
    descripcion: 'Conquistamos Madrid un barrio a la vez. ¡Únete!',
    esPublico: true, codigo: 'RETR01',
    creador: 'ficticio_u1',
    miembros: [MI_UID, 'ficticio_u1', 'ficticio_u2', 'ficticio_u3'],
    nicknames: { [MI_UID]: 'Tú', ficticio_u1: 'CarlosRunner', ficticio_u2: 'PabloMontaña', ficticio_u3: 'AndresMaraton' },
    ciudadId: CIUDAD_ID, ciudadNombre: CIUDAD_NOMBRE,
    foto: null, fotoPendiente: null, fotoEstado: null, fotoMotivoRechazo: null, fotoRevisadaEn: null,
    puntosTotales: 11800, carrerasTotales: 76, distanciaTotal: 851000, duracionTotal: 264000,
    creadoEn: new Date(ahora - dia * 60),
  },
  {
    id: 'ficticio_grupo_2',
    nombre: 'Madrid Runners Club',
    descripcion: 'El grupo más rápido de la capital. Solo para valientes.',
    esPublico: true, codigo: 'MRC202',
    creador: 'ficticio_u10',
    miembros: ['ficticio_u10', 'ficticio_u12', 'ficticio_u7'],
    nicknames: { ficticio_u10: 'AlejandroV', ficticio_u12: 'MartaCorre', ficticio_u7: 'LauraVelocidad' },
    ciudadId: CIUDAD_ID, ciudadNombre: CIUDAD_NOMBRE,
    foto: null, fotoPendiente: null, fotoEstado: null, fotoMotivoRechazo: null, fotoRevisadaEn: null,
    puntosTotales: 14000, carrerasTotales: 81, distanciaTotal: 930000, duracionTotal: 289000,
    creadoEn: new Date(ahora - dia * 45),
  },
  {
    id: 'ficticio_grupo_3',
    nombre: 'Nocturnos de Chamberí',
    descripcion: 'Corremos cuando los demás duermen.',
    esPublico: false, codigo: 'NOCH77',
    creador: 'ficticio_u4',
    miembros: ['ficticio_u4', 'ficticio_u8', 'ficticio_u11'],
    nicknames: { ficticio_u4: 'JavierKm', ficticio_u8: 'CristinaMCorre', ficticio_u11: 'SergioCross' },
    ciudadId: CIUDAD_ID, ciudadNombre: CIUDAD_NOMBRE,
    foto: null, fotoPendiente: null, fotoEstado: null, fotoMotivoRechazo: null, fotoRevisadaEn: null,
    puntosTotales: 5880, carrerasTotales: 39, distanciaTotal: 247000, duracionTotal: 82000,
    creadoEn: new Date(ahora - dia * 30),
  },
  {
    id: 'ficticio_grupo_4',
    nombre: 'Madrugadores de Malasaña',
    descripcion: 'Salimos a las 7am. El barrio es nuestro antes de que despierte.',
    esPublico: true, codigo: 'MALA7A',
    creador: 'ficticio_u2',
    miembros: ['ficticio_u2', 'ficticio_u5', 'ficticio_u9'],
    nicknames: { ficticio_u2: 'PabloMontaña', ficticio_u5: 'ManuelSport', ficticio_u9: 'MireiaSprint' },
    ciudadId: CIUDAD_ID, ciudadNombre: CIUDAD_NOMBRE,
    foto: null, fotoPendiente: null, fotoEstado: null, fotoMotivoRechazo: null, fotoRevisadaEn: null,
    puntosTotales: 6210, carrerasTotales: 44, distanciaTotal: 402000, duracionTotal: 126000,
    creadoEn: new Date(ahora - dia * 20),
  },
  {
    id: 'ficticio_grupo_5',
    nombre: 'Kilómetro Cero',
    descripcion: 'Todo empieza en el centro. Desde la Puerta del Sol hasta el último barrio.',
    esPublico: true, codigo: 'KM0MAD',
    creador: 'ficticio_u3',
    miembros: ['ficticio_u3', 'ficticio_u6', 'ficticio_u13', 'ficticio_u14'],
    nicknames: { ficticio_u3: 'AndresMaraton', ficticio_u6: 'DavidTrail', ficticio_u13: 'SofiaJogger', ficticio_u14: 'RosaVeterana' },
    ciudadId: CIUDAD_ID, ciudadNombre: CIUDAD_NOMBRE,
    foto: null, fotoPendiente: null, fotoEstado: null, fotoMotivoRechazo: null, fotoRevisadaEn: null,
    puntosTotales: 3860, carrerasTotales: 28, distanciaTotal: 234000, duracionTotal: 78000,
    creadoEn: new Date(ahora - dia * 10),
  },
];

// ── Subida ────────────────────────────────────────────────────────────────────

console.log('\n🎭 Generando datos ficticios...\n');

// Usuarios + ranking en una sola pasada
const BATCH_SIZE = 400;
let ops = [];

for (const u of usuarios) {
  const seg = segmento(u.ritmo, u.genero, u.edad);

  // Documento usuario
  ops.push({
    ref: db.collection('usuarios').doc(u.id),
    data: {
      nickname: u.nickname,
      pais: u.pais,
      genero: u.genero,
      puntosTotales: u.pts,
      distanciaTotal: u.dist,
      duracionTotal: Math.round(u.dist / (1000 / u.ritmo)),
      carrerasTotal: u.carreras,
      barriosConquistadosTotal: u.barrios,
      barriosConquistadosHistorico: u.barrios,
      logros: u.logros,
      ciudadActualId: CIUDAD_ID,
      ciudadActualNombre: CIUDAD_NOMBRE,
      paisCodigo: 'ES',
      fotoPerfil: null,
      fotoPerfilEstado: null,
      esAdmin: false,
      onboardingCompletado: true,
      racha: Math.floor(u.carreras / 4),
      ...seg,
      _ficticio: true,
    },
  });

  // Entrada ranking — ID correcto: ${ciudadId}_${uid}
  ops.push({
    ref: db.collection('rankingsCiudad').doc(`${CIUDAD_ID}_${u.id}`),
    data: {
      uid: u.id,
      ciudadId: CIUDAD_ID,
      ciudadNombre: CIUDAD_NOMBRE,
      nickname: u.nickname,
      pais: u.pais,
      genero: u.genero,
      fotoPerfil: null,
      fotoPerfilEstado: null,
      puntos: u.pts,
      barrios: u.barrios,
      carreras: u.carreras,
      stravaVerificadas: u.id === 'ficticio_u1' ? 3 : 0,
      topLogros: u.logros.slice(0, 3),
      ...seg,
      actualizadoEn: FieldValue.serverTimestamp(),
      _ficticio: true,
    },
  });
}

// Carreras para tu usuario real
for (const c of carreras) {
  const { id, ...data } = c;
  ops.push({
    ref: db.collection('carreras').doc(id),
    data: {
      ...data,
      uid: MI_UID,
      ciudadId: CIUDAD_ID,
      ciudadNombre: CIUDAD_NOMBRE,
      paisCodigo: 'ES',
      puntosPersonales: data.puntos,
      bonusLogros: 0,
      aportacionesGrupo: [],
      gruposAportados: [],
      grupoActivoId: null,
      grupoActivoNombre: null,
      territorioCarrera: [],
      conquistasCarrera: [],
      barriosConquistados: 0,
      externalActivityId: data.externalActivityId ?? null,
      importedAt: null,
      stravaActivityUrl: null,
      fecha: admin.firestore.Timestamp.fromMillis(data.fecha),
      _ficticio: true,
    },
  });
}

// Grupos
for (const g of grupos) {
  const { id, ...data } = g;
  ops.push({ ref: db.collection('grupos').doc(id), data: { ...data, _ficticio: true } });
}

// Subir en batches
const chunks = [];
for (let i = 0; i < ops.length; i += BATCH_SIZE) chunks.push(ops.slice(i, i + BATCH_SIZE));
for (const chunk of chunks) {
  const batch = db.batch();
  chunk.forEach(({ ref, data }) => batch.set(ref, data));
  await batch.commit();
}

console.log(`   👤 ${usuarios.length} usuarios ficticios`);
console.log(`   🏆 ${usuarios.length} entradas de ranking (con segmentoCompetitivo correcto)`);
console.log(`   🏃 ${carreras.length} carreras para tu usuario`);
console.log(`   👥 ${grupos.length} grupos ficticios`);

// Asignar dueños en barrios de Madrid
console.log('\n   🗺️  Asignando dueños en barrios de Madrid...');
const barrioBatch = db.batch();
let asignados = 0;

// Cargamos territorios (colección principal con IDs legibles)
const barriosSnap = await db.collection('territorios').where('ciudadId', '==', CIUDAD_ID).limit(60).get();
const barriosPorId = new Map(barriosSnap.docs.map(d => [d.id, d]));

// Asignamos según el mapa definido arriba (solo si el barrio existe)
const dueñosPorBarrio = new Map();
const ASIGNACIONES = [
  // Repartimos barrios entre los usuarios top
  { ids: ['es-madrid-sol', 'es-madrid-malasana', 'es-madrid-chueca', 'es-madrid-palacio', 'es-madrid-universidad'],    dueno: 'ficticio_u10', basePts: 600 },
  { ids: ['es-madrid-recoletos', 'es-madrid-bellas-vistas', 'es-madrid-cuatro-caminos', 'es-madrid-castellana'],        dueno: 'ficticio_u10', basePts: 470 },
  { ids: ['es-madrid-lavapies', 'es-madrid-la-latina', 'es-madrid-embajadores', 'es-madrid-goya', 'es-madrid-guindalera'], dueno: 'ficticio_u12', basePts: 580 },
  { ids: ['es-madrid-ibiza', 'es-madrid-jeronimos', 'es-madrid-nino-jesus', 'es-madrid-estrella'],                       dueno: 'ficticio_u12', basePts: 440 },
  { ids: ['es-madrid-gaztambide', 'es-madrid-arapiles', 'es-madrid-vallehermoso', 'es-madrid-trafalgar'],                dueno: 'ficticio_u1',  basePts: 520 },
  { ids: ['es-madrid-fuente-del-berro', 'es-madrid-almagro', 'es-madrid-delicias', 'es-madrid-legazpi'],                 dueno: 'ficticio_u1',  basePts: 400 },
  { ids: ['es-madrid-justicia', 'es-madrid-rios-rosas', 'es-madrid-castillejos'],                                        dueno: 'ficticio_u7',  basePts: 480 },
  { ids: ['es-madrid-chopera', 'es-madrid-acacias', 'es-madrid-imperial'],                                               dueno: 'ficticio_u7',  basePts: 360 },
  { ids: ['es-madrid-pacifico', 'es-madrid-adelfas'],                                                                    dueno: 'ficticio_u8',  basePts: 340 },
  { ids: ['es-madrid-almenara', 'es-madrid-valdeacederas'],                                                              dueno: 'ficticio_u2',  basePts: 300 },
  { ids: ['es-madrid-palos-de-moguer', 'es-madrid-atocha'],                                                              dueno: 'ficticio_u3',  basePts: 260 },
  { ids: ['es-madrid-cortes', 'es-madrid-lista'],                                                                        dueno: 'ficticio_u4',  basePts: 220 },
];

for (const grupo of ASIGNACIONES) {
  for (let i = 0; i < grupo.ids.length; i++) {
    const barrioId = grupo.ids[i];
    if (dueñosPorBarrio.has(barrioId)) continue; // no solapar
    dueñosPorBarrio.set(barrioId, { dueno: grupo.dueno, pts: grupo.basePts - i * 20 });
  }
}

for (const [barrioId, { dueno, pts }] of dueñosPorBarrio) {
  const barrioDoc = barriosPorId.get(barrioId);
  if (!barrioDoc) continue;
  barrioBatch.update(barrioDoc.ref, {
    dueno,
    duenoPuntos: pts,
    conquistadoEn: FieldValue.serverTimestamp(),
    _ficticioAnterior: { dueno: barrioDoc.data().dueno ?? null, duenoPuntos: barrioDoc.data().duenoPuntos ?? 0 },
  });
  asignados++;
}

await barrioBatch.commit();
console.log(`   ✅ ${asignados} barrios con dueño asignado`);

// Actualizar stats de tu usuario real
console.log('\n   📊 Actualizando tu usuario real...');
const totalDist = carreras.reduce((s, c) => s + c.distancia, 0);
const totalDur  = carreras.reduce((s, c) => s + c.duracion, 0);
const totalPts  = carreras.reduce((s, c) => s + c.puntos, 0);
const ritmo30d  = Math.round(totalDur / (totalDist / 1000));

const miSeg = segmento(ritmo30d, 'hombre', '30-45');

await db.collection('usuarios').doc(MI_UID).set({
  carrerasTotal: carreras.length,
  distanciaTotal: totalDist,
  duracionTotal: totalDur,
  puntosTotales: totalPts,
  ciudadActualId: CIUDAD_ID,
  ciudadActualNombre: CIUDAD_NOMBRE,
  paisCodigo: 'ES',
  barriosConquistadosTotal: 4,
  logros: ['primer_km', 'primer_barrio', 'racha_3'],
  racha: 3,
  ...miSeg,
  _ficticioStats: true,
}, { merge: true });

const miNickSnap = await db.collection('usuarios').doc(MI_UID).get();
const miNick = miNickSnap.exists ? (miNickSnap.data().nickname ?? 'Tú') : 'Tú';

await db.collection('rankingsCiudad').doc(`${CIUDAD_ID}_${MI_UID}`).set({
  uid: MI_UID,
  ciudadId: CIUDAD_ID,
  ciudadNombre: CIUDAD_NOMBRE,
  nickname: miNick,
  pais: { nombre: 'España', bandera: '🇪🇸' },
  genero: 'hombre',
  fotoPerfil: null,
  fotoPerfilEstado: null,
  puntos: totalPts,
  barrios: 4,
  carreras: carreras.length,
  stravaVerificadas: 1,
  topLogros: ['primer_km', 'primer_barrio', 'racha_3'],
  ...miSeg,
  actualizadoEn: FieldValue.serverTimestamp(),
  _ficticio: true,
}, { merge: true });

console.log(`   ✅ Stats: ${carreras.length} carreras · ${(totalDist/1000).toFixed(1)} km · ${totalPts} pts`);
console.log(`   ✅ Segmento: ${miSeg.segmentoCompetitivo} (${miSeg.segmentoEtiqueta})`);

console.log('\n✅ Datos ficticios creados correctamente.\n');
console.log('Cuando quieras borrarlos:');
console.log('   node scripts/borrarDatosFicticios.mjs\n');
