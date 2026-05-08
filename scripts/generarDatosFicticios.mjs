/**
 * Genera datos ficticios en Firestore para previsualizar las pantallas:
 * Mapa, Correr, Ranking y Grupos.
 *
 * Todos los documentos llevan el prefijo "ficticio_" para identificarlos.
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
  console.error('❌ firebase-admin no instalado. Ejecuta: npm install --save-dev firebase-admin');
  process.exit(1);
}

const raw = await readFile(RUTA_SERVICE_ACCOUNT, 'utf8').catch(() => null);
if (!raw) { console.error('❌ No se encontró scripts/serviceAccount.json'); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const CIUDAD_ID = 'es-madrid';
const CIUDAD_NOMBRE = 'Madrid';

// ── Usuarios ficticios ────────────────────────────────────────────────────────

const usuarios = [
  { id: 'ficticio_u1', nickname: 'CarlosRunner', pais: { bandera: '🇪🇸', nombre: 'España' }, puntosTotales: 4820, distanciaTotal: 312000, carrerasTotal: 28, barriosConquistadosTotal: 14, logros: ['primer_km', 'primer_barrio', 'maratonista'] },
  { id: 'ficticio_u2', nickname: 'LauraVelocidad', pais: { bandera: '🇪🇸', nombre: 'España' }, puntosTotales: 3910, distanciaTotal: 248000, carrerasTotal: 21, barriosConquistadosTotal: 9, logros: ['primer_km', 'primer_barrio'] },
  { id: 'ficticio_u3', nickname: 'PabloMontaña', pais: { bandera: '🇪🇸', nombre: 'España' }, puntosTotales: 3240, distanciaTotal: 198000, carrerasTotal: 17, barriosConquistadosTotal: 7, logros: ['primer_km'] },
  { id: 'ficticio_u4', nickname: 'SofíaSprinter', pais: { bandera: '🇪🇸', nombre: 'España' }, puntosTotales: 2780, distanciaTotal: 165000, carrerasTotal: 14, barriosConquistadosTotal: 5, logros: ['primer_km'] },
  { id: 'ficticio_u5', nickname: 'AndresMaraton', pais: { bandera: '🇲🇽', nombre: 'México' }, puntosTotales: 2340, distanciaTotal: 143000, carrerasTotal: 12, barriosConquistadosTotal: 4, logros: ['primer_km'] },
  { id: 'ficticio_u6', nickname: 'MireiaCorre', pais: { bandera: '🇪🇸', nombre: 'España' }, puntosTotales: 1890, distanciaTotal: 112000, carrerasTotal: 10, barriosConquistadosTotal: 3, logros: [] },
  { id: 'ficticio_u7', nickname: 'JavierKm', pais: { bandera: '🇦🇷', nombre: 'Argentina' }, puntosTotales: 1420, distanciaTotal: 87000, carrerasTotal: 8, barriosConquistadosTotal: 2, logros: [] },
  { id: 'ficticio_u8', nickname: 'ElenaUltra', pais: { bandera: '🇪🇸', nombre: 'España' }, puntosTotales: 980, distanciaTotal: 61000, carrerasTotal: 5, barriosConquistadosTotal: 1, logros: [] },
];

// ── Carreras ficticias para Miguel ───────────────────────────────────────────

const ahora = Date.now();
const dia = 86400000;

// Ruta simulada alrededor del Retiro (Madrid)
const rutaRetiro = [
  { latitude: 40.4151, longitude: -3.6845 },
  { latitude: 40.4162, longitude: -3.6812 },
  { latitude: 40.4178, longitude: -3.6798 },
  { latitude: 40.4195, longitude: -3.6810 },
  { latitude: 40.4188, longitude: -3.6843 },
  { latitude: 40.4170, longitude: -3.6858 },
  { latitude: 40.4151, longitude: -3.6845 },
];

const rutaSalamanca = [
  { latitude: 40.4220, longitude: -3.6780 },
  { latitude: 40.4235, longitude: -3.6750 },
  { latitude: 40.4248, longitude: -3.6730 },
  { latitude: 40.4260, longitude: -3.6748 },
  { latitude: 40.4245, longitude: -3.6772 },
  { latitude: 40.4220, longitude: -3.6780 },
];

const rutaChamberí = [
  { latitude: 40.4310, longitude: -3.7020 },
  { latitude: 40.4328, longitude: -3.6998 },
  { latitude: 40.4340, longitude: -3.6975 },
  { latitude: 40.4325, longitude: -3.6955 },
  { latitude: 40.4308, longitude: -3.6978 },
  { latitude: 40.4310, longitude: -3.7020 },
];

const carreras = [
  {
    id: `ficticio_carrera_${MI_UID}_1`,
    uid: MI_UID,
    distancia: 8420,
    duracion: 2580,
    ritmoMedio: 306,
    puntos: 312,
    puntosPersonales: 312,
    ruta: rutaRetiro,
    ciudadId: CIUDAD_ID,
    ciudadNombre: CIUDAD_NOMBRE,
    paisCodigo: 'ES',
    fecha: new Date(ahora - dia * 1),
    source: 'conqurun',
    verificationStatus: 'self_recorded',
    aportacionesGrupo: [],
    gruposAportados: [],
    territorioCarrera: [],
    externalProvider: null,
    externalActivityId: null,
    importedAt: null,
    stravaActivityUrl: null,
  },
  {
    id: `ficticio_carrera_${MI_UID}_2`,
    uid: MI_UID,
    distancia: 12100,
    duracion: 3840,
    ritmoMedio: 317,
    puntos: 487,
    puntosPersonales: 487,
    ruta: rutaSalamanca,
    ciudadId: CIUDAD_ID,
    ciudadNombre: CIUDAD_NOMBRE,
    paisCodigo: 'ES',
    fecha: new Date(ahora - dia * 4),
    source: 'conqurun',
    verificationStatus: 'self_recorded',
    aportacionesGrupo: [],
    gruposAportados: [],
    territorioCarrera: [],
    externalProvider: null,
    externalActivityId: null,
    importedAt: null,
    stravaActivityUrl: null,
  },
  {
    id: `ficticio_carrera_${MI_UID}_3`,
    uid: MI_UID,
    distancia: 5800,
    duracion: 1740,
    ritmoMedio: 300,
    puntos: 198,
    puntosPersonales: 198,
    ruta: rutaChamberí,
    ciudadId: CIUDAD_ID,
    ciudadNombre: CIUDAD_NOMBRE,
    paisCodigo: 'ES',
    fecha: new Date(ahora - dia * 9),
    source: 'conqurun',
    verificationStatus: 'strava_verified',
    aportacionesGrupo: [],
    gruposAportados: [],
    territorioCarrera: [],
    externalProvider: 'strava',
    externalActivityId: '9876543210',
    importedAt: new Date(ahora - dia * 9 + 3600000),
    stravaActivityUrl: null,
  },
];

// ── Grupos ficticios ──────────────────────────────────────────────────────────

const grupos = [
  {
    id: 'ficticio_grupo_1',
    nombre: 'Corredores del Retiro',
    descripcion: 'Conquistamos Madrid un barrio a la vez. ¡Únete!',
    esPublico: true,
    codigo: 'RETR01',
    creador: 'ficticio_u1',
    miembros: [MI_UID, 'ficticio_u1', 'ficticio_u2', 'ficticio_u3'],
    nicknames: { [MI_UID]: 'tú', ficticio_u1: 'CarlosRunner', ficticio_u2: 'LauraVelocidad', ficticio_u3: 'PabloMontaña' },
    ciudadId: CIUDAD_ID, ciudadNombre: CIUDAD_NOMBRE,
    foto: 'https://picsum.photos/seed/retiro/200/200', fotoPendiente: null, fotoEstado: 'aprobada', fotoMotivoRechazo: null, fotoRevisadaEn: null,
    puntosTotales: 5840, carrerasTotales: 42, distanciaTotal: 318000, duracionTotal: 101760,
    creadoEn: new Date(ahora - dia * 60),
  },
  {
    id: 'ficticio_grupo_2',
    nombre: 'Madrid Runners Club',
    descripcion: 'El grupo más rápido de la capital. Solo para valientes.',
    esPublico: true,
    codigo: 'MRC202',
    creador: 'ficticio_u4',
    miembros: ['ficticio_u4', 'ficticio_u5', 'ficticio_u6'],
    nicknames: { ficticio_u4: 'SofíaSprinter', ficticio_u5: 'AndresMaraton', ficticio_u6: 'MireiaCorre' },
    ciudadId: CIUDAD_ID, ciudadNombre: CIUDAD_NOMBRE,
    foto: 'https://picsum.photos/seed/runners/200/200', fotoPendiente: null, fotoEstado: 'aprobada', fotoMotivoRechazo: null, fotoRevisadaEn: null,
    puntosTotales: 3210, carrerasTotales: 24, distanciaTotal: 187000, duracionTotal: 55230,
    creadoEn: new Date(ahora - dia * 45),
  },
  {
    id: 'ficticio_grupo_3',
    nombre: 'Nocturnos de Chamberí',
    descripcion: 'Corremos cuando los demás duermen.',
    esPublico: false,
    codigo: 'NOCH77',
    creador: 'ficticio_u7',
    miembros: ['ficticio_u7', 'ficticio_u8'],
    nicknames: { ficticio_u7: 'JavierKm', ficticio_u8: 'ElenaUltra' },
    ciudadId: CIUDAD_ID, ciudadNombre: CIUDAD_NOMBRE,
    foto: 'https://picsum.photos/seed/noche/200/200', fotoPendiente: null, fotoEstado: 'aprobada', fotoMotivoRechazo: null, fotoRevisadaEn: null,
    puntosTotales: 980, carrerasTotales: 9, distanciaTotal: 61000, duracionTotal: 20130,
    creadoEn: new Date(ahora - dia * 30),
  },
  {
    id: 'ficticio_grupo_4',
    nombre: 'Madrugadores de Malasaña',
    descripcion: 'Salimos a las 7am. El barrio es nuestro antes de que despierte.',
    esPublico: true,
    codigo: 'MALA7A',
    creador: 'ficticio_u2',
    miembros: ['ficticio_u2', 'ficticio_u5', 'ficticio_u7'],
    nicknames: { ficticio_u2: 'LauraVelocidad', ficticio_u5: 'AndresMaraton', ficticio_u7: 'JavierKm' },
    ciudadId: CIUDAD_ID, ciudadNombre: CIUDAD_NOMBRE,
    foto: null, fotoPendiente: null, fotoEstado: null, fotoMotivoRechazo: null, fotoRevisadaEn: null,
    puntosTotales: 2140, carrerasTotales: 18, distanciaTotal: 134000, duracionTotal: 41540,
    creadoEn: new Date(ahora - dia * 20),
  },
  {
    id: 'ficticio_grupo_5',
    nombre: 'Kilómetro Cero',
    descripcion: 'Todo empieza en el centro. Desde la Puerta del Sol hasta el último barrio.',
    esPublico: true,
    codigo: 'KM0MAD',
    creador: 'ficticio_u3',
    miembros: ['ficticio_u3', 'ficticio_u6', 'ficticio_u8'],
    nicknames: { ficticio_u3: 'PabloMontaña', ficticio_u6: 'MireiaCorre', ficticio_u8: 'ElenaUltra' },
    ciudadId: CIUDAD_ID, ciudadNombre: CIUDAD_NOMBRE,
    foto: null, fotoPendiente: null, fotoEstado: null, fotoMotivoRechazo: null, fotoRevisadaEn: null,
    puntosTotales: 1560, carrerasTotales: 14, distanciaTotal: 98000, duracionTotal: 33320,
    creadoEn: new Date(ahora - dia * 10),
  },
];

// ── Ranking Madrid ────────────────────────────────────────────────────────────

const rankingEntradas = usuarios.map(u => ({
  id: `ficticio_ranking_${CIUDAD_ID}_${u.id}`,
  ciudadId: CIUDAD_ID,
  uid: u.id,
  puntos: u.puntosTotales,
  carreras: u.carrerasTotal,
  totalKm: u.distanciaTotal,
  stravaVerificadas: 0,
  nickname: u.nickname,
  fotoPerfil: null,
  fotoPerfilEstado: null,
  pais: u.pais,
  topLogros: u.logros.slice(0, 3),
  barrios: u.barriosConquistadosTotal,
}));

// ── Subida ────────────────────────────────────────────────────────────────────

console.log('\n🎭 Generando datos ficticios...\n');

const batch = db.batch();

// Usuarios
for (const u of usuarios) {
  batch.set(db.collection('usuarios').doc(u.id), {
    nickname: u.nickname,
    pais: u.pais,
    puntosTotales: u.puntosTotales,
    distanciaTotal: u.distanciaTotal,
    carrerasTotal: u.carrerasTotal,
    barriosConquistadosTotal: u.barriosConquistadosTotal,
    logros: u.logros,
    ciudadActualId: CIUDAD_ID,
    ciudadActualNombre: CIUDAD_NOMBRE,
    fotoPerfil: null,
    fotoPerfilEstado: null,
    esAdmin: false,
    onboardingCompletado: true,
    _ficticio: true,
  });
}
console.log(`   👤 ${usuarios.length} usuarios ficticios`);

// Carreras de Miguel
for (const c of carreras) {
  const { id, ...data } = c;
  batch.set(db.collection('carreras').doc(id), { ...data, _ficticio: true });
}
console.log(`   🏃 ${carreras.length} carreras para tu usuario`);

// Grupos
for (const g of grupos) {
  const { id, ...data } = g;
  batch.set(db.collection('grupos').doc(id), { ...data, _ficticio: true });
}
console.log(`   👥 ${grupos.length} grupos ficticios`);

// Ranking Madrid
for (const r of rankingEntradas) {
  const { id, ...data } = r;
  batch.set(db.collection('rankingsCiudad').doc(id), { ...data, _ficticio: true });
}
console.log(`   🏆 ${rankingEntradas.length} entradas de ranking en Madrid`);

await batch.commit();

// Asignar dueños en algunos territorios de Madrid
console.log('\n   🗺️  Asignando dueños en territorios de Madrid...');
const territoriosSnap = await db.collection('territorios')
  .where('ciudadId', '==', CIUDAD_ID)
  .limit(20)
  .get();

const dueños = [MI_UID, 'ficticio_u1', 'ficticio_u2', 'ficticio_u3', 'ficticio_u4'];
const batchTerritorios = db.batch();
let asignados = 0;

territoriosSnap.docs.forEach((d, i) => {
  const dueno = dueños[i % dueños.length];
  batchTerritorios.update(d.ref, {
    dueno,
    duenoPuntos: 200 + Math.floor(Math.random() * 300),
    _ficticioAnterior: { dueno: d.data().dueno, duenoPuntos: d.data().duenoPuntos },
  });
  asignados++;
});

await batchTerritorios.commit();
console.log(`   ✅ ${asignados} territorios con dueño asignado`);

// Añadir stats, logros y entrada de ranking al usuario real
console.log('\n   📊 Actualizando stats de tu usuario real...');
const totalDistancia = carreras.reduce((s, c) => s + c.distancia, 0);
const totalDuracion = carreras.reduce((s, c) => s + c.duracion, 0);
const totalPuntos = carreras.reduce((s, c) => s + c.puntos, 0);

await db.collection('usuarios').doc(MI_UID).set({
  carrerasTotal: carreras.length,
  distanciaTotal: totalDistancia,
  duracionTotal: totalDuracion,
  puntosTotales: totalPuntos,
  ciudadActualId: CIUDAD_ID,
  ciudadActualNombre: CIUDAD_NOMBRE,
  paisCodigo: 'ES',
  logros: ['km_10', 'b_1', 'racha_3'],
  _ficticioStats: true,
}, { merge: true });

// Entrada en rankingsCiudad para que aparezca en el ranking individual
const miNickSnap = await db.collection('usuarios').doc(MI_UID).get();
const miNick = miNickSnap.exists ? (miNickSnap.data().nickname ?? 'Tú') : 'Tú';
await db.collection('rankingsCiudad').doc(`${CIUDAD_ID}_${MI_UID}`).set({
  ciudadId: CIUDAD_ID,
  uid: MI_UID,
  puntos: totalPuntos,
  carreras: carreras.length,
  totalKm: totalDistancia,
  stravaVerificadas: 1,
  nickname: miNick,
  fotoPerfil: null,
  fotoPerfilEstado: null,
  pais: { nombre: 'España', bandera: '🇪🇸' },
  topLogros: ['km_10', 'b_1', 'racha_3'],
  barrios: 4,
  _ficticio: true,
}, { merge: true });

console.log(`   ✅ Stats: ${carreras.length} carreras · ${(totalDistancia/1000).toFixed(1)} km · ${totalPuntos} pts`);
console.log('   ✅ Logros ficticios: km_10 (Primeros pasos), b_1 (Primer territorio), racha_3 (Constante)');

console.log('\n✅ Datos ficticios creados correctamente.');
console.log('\nCuando quieras borrarlos:');
console.log('   node scripts/borrarDatosFicticios.mjs\n');
