import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export const SEGMENTOS_RITMO = [
  { id: 'elite', nombre: 'Leyenda', max: 255 },
  { id: 'oro', nombre: 'Señor del mapa', min: 255, max: 300 },
  { id: 'plata', nombre: 'Conquistador', min: 300, max: 345 },
  { id: 'bronce', nombre: 'Retador', min: 345, max: 390 },
  { id: 'popular', nombre: 'Marcador', min: 390, max: 480 },
  { id: 'iniciacion', nombre: 'Explorador', min: 480, max: 720 },
];

export const SEGMENTO_RITMO_FALLBACK = 'popular';
export const SEGMENTO_EDAD_FALLBACK = 'sin_edad';
export const SEGMENTO_GENERO_FALLBACK = 'sin_genero';

export const calcularGrupoEdad = (fechaNacimiento) => {
  if (!fechaNacimiento) return SEGMENTO_EDAD_FALLBACK;
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

export const calcularSegmentoRitmo = (ritmoSegundosKm) => {
  if (!ritmoSegundosKm || !isFinite(ritmoSegundosKm)) return SEGMENTO_RITMO_FALLBACK;
  const segmento = SEGMENTOS_RITMO.find(s =>
    (s.min == null || ritmoSegundosKm >= s.min) &&
    (s.max == null || ritmoSegundosKm < s.max)
  );
  return segmento?.id ?? SEGMENTO_RITMO_FALLBACK;
};

export const normalizarGeneroSegmento = (genero) => (
  genero === 'hombre' || genero === 'mujer' ? genero : SEGMENTO_GENERO_FALLBACK
);

export const construirSegmentoCompetitivo = ({ segmentoRitmo, genero, grupoEdad }) => (
  `${segmentoRitmo ?? SEGMENTO_RITMO_FALLBACK}_${normalizarGeneroSegmento(genero)}_${grupoEdad ?? SEGMENTO_EDAD_FALLBACK}`
);

export const etiquetaSegmentoRitmo = (segmentoRitmo) => (
  SEGMENTOS_RITMO.find(s => s.id === segmentoRitmo)?.nombre ?? 'Marcador'
);

export const etiquetaSegmentoCompetitivo = ({ segmentoRitmo, genero, grupoEdad }) => {
  const generoLabel = genero === 'hombre' ? 'Hombre' : genero === 'mujer' ? 'Mujer' : 'General';
  return `${etiquetaSegmentoRitmo(segmentoRitmo)} · ${generoLabel} · ${grupoEdad ?? 'Sin edad'}`;
};

export const obtenerSiguienteSegmentoRitmo = (segmentoRitmo) => {
  const index = SEGMENTOS_RITMO.findIndex(s => s.id === segmentoRitmo);
  if (index <= 0) return null;
  return SEGMENTOS_RITMO[index - 1];
};

export const calcularAvisoProximoSegmento = (ritmo30d, segmentoRitmo) => {
  if (!ritmo30d || !isFinite(ritmo30d)) return null;
  const segmentoActual = SEGMENTOS_RITMO.find(s => s.id === segmentoRitmo);
  const siguiente = obtenerSiguienteSegmentoRitmo(segmentoRitmo);
  if (!segmentoActual?.min || !siguiente) return null;

  const segundosParaSubir = Math.ceil(ritmo30d - segmentoActual.min);
  if (segundosParaSubir <= 0 || segundosParaSubir > 10) return null;

  return {
    segundosParaSubir,
    segmento: siguiente,
    clave: `cerca_${segmentoActual.id}_${siguiente.id}`,
  };
};

export const calcularSegmentosDesdePerfilYRitmo = (perfil = {}, ritmo30d = null) => {
  const segmentoRitmo = calcularSegmentoRitmo(ritmo30d);
  const segmentoGenero = normalizarGeneroSegmento(perfil.genero);
  const segmentoEdad = calcularGrupoEdad(perfil.fechaNacimiento);
  const segmentoCompetitivo = construirSegmentoCompetitivo({
    segmentoRitmo,
    genero: segmentoGenero,
    grupoEdad: segmentoEdad,
  });

  return {
    ritmo30d: ritmo30d ?? null,
    segmentoRitmo,
    segmentoGenero,
    segmentoEdad,
    grupoEdad: segmentoEdad,
    segmentoCompetitivo,
    segmentoEtiqueta: etiquetaSegmentoCompetitivo({
      segmentoRitmo,
      genero: segmentoGenero,
      grupoEdad: segmentoEdad,
    }),
  };
};

export const calcularRitmo30dDesdeCarreras = (carreras = []) => {
  const totales = carreras.reduce((acc, carrera) => {
    const distancia = carrera.distancia ?? carrera.totalMetros ?? 0;
    const duracion = carrera.duracion ?? 0;
    if (distancia <= 0 || duracion <= 0) return acc;
    return {
      distancia: acc.distancia + distancia,
      duracion: acc.duracion + duracion,
    };
  }, { distancia: 0, duracion: 0 });

  if (totales.distancia < 1000 || totales.duracion <= 0) return null;
  return Math.round(totales.duracion / (totales.distancia / 1000));
};

export const cargarCarreras30d = async (uid) => {
  if (!uid) return [];
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const snap = await getDocs(query(
    collection(db, 'carreras'),
    where('uid', '==', uid),
    where('fecha', '>=', Timestamp.fromDate(desde)),
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const calcularSegmentos30d = async ({ uid, perfil, carreraActual = null }) => {
  const carreras = await cargarCarreras30d(uid);
  const carrerasIncluyendoActual = carreraActual ? [...carreras, carreraActual] : carreras;
  const ritmo30d = calcularRitmo30dDesdeCarreras(carrerasIncluyendoActual);
  return calcularSegmentosDesdePerfilYRitmo(perfil, ritmo30d);
};
