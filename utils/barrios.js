import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebaseConfig';
import { collection, collectionGroup, getDocs, limit, query, where } from 'firebase/firestore';
import { obtenerTerritoriosSeed } from './territoriosSeed';
import { registrarError } from './monitoring';

const COLECCION_TERRITORIOS = 'territorios';
const COLECCION_BARRIOS = 'barrios';
const GPS_ACCURACY_MAX_METROS = 50;
const GPS_VELOCIDAD_MAX_MS = 7;

const TTL_MS = 10 * 60 * 1000;
const cacheKey = (ciudadId) => `territorios_v1_${ciudadId ?? 'global'}`;

const leerCache = async (ciudadId) => {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(ciudadId));
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
};

const escribirCache = async (ciudadId, data) => {
  try {
    await AsyncStorage.setItem(cacheKey(ciudadId), JSON.stringify({ data, ts: Date.now() }));
  } catch {}
};

let _ultimaInvalidacion = 0;
export const getUltimaInvalidacionTerritorios = () => _ultimaInvalidacion;

export const invalidarCacheTerritorios = async (ciudadId) => {
  _ultimaInvalidacion = Date.now();
  try {
    await AsyncStorage.removeItem(cacheKey(ciudadId ?? 'global'));
  } catch {}
};

const normalizarTerritorio = (id, data, coleccion) => ({
  ...data,
  id,
  barrioId: id,
  territorioId: id,
  coleccion,
  tipo: data.tipo ?? 'barrio',
  nombreVisible: data.nombreVisible ?? data.nombre,
  nombreBase: data.nombreBase ?? data.nombre,
  radio: data.radio ?? 800,
  dueno: data.dueno ?? null,
  duenoPuntos: data.duenoPuntos ?? 0,
});

const esTerritorioValido = (territorio) => (
  territorio &&
  typeof territorio.lat === 'number' &&
  typeof territorio.lng === 'number' &&
  isFinite(territorio.lat) &&
  isFinite(territorio.lng)
);

// Construye un índice espacial por cuadrícula para lookups O(1) en tiempo real.
// cellSizeM debe ser >= 2 * radio_máximo de las zonas.
export const buildIndiceEspacial = (barrios, cellSizeM = 1600) => {
  const maxSearchM = barrios.length
    ? barrios.reduce((max, b) => Math.max(max, (Number(b.radio) || 800) + 500), 1300)
    : 1300;
  const searchRadiusCells = Math.max(1, Math.ceil(maxSearchM / cellSizeM));
  const cellLat = cellSizeM / 111_320;
  const avgLat = barrios.length ? barrios.reduce((s, b) => s + b.lat, 0) / barrios.length : 40;
  const cellLng = cellSizeM / (111_320 * Math.cos((avgLat * Math.PI) / 180));
  const grid = new Map();
  for (const barrio of barrios) {
    const row = Math.floor(barrio.lat / cellLat);
    const col = Math.floor(barrio.lng / cellLng);
    const key = `${row},${col}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(barrio);
  }
  return { grid, cellLat, cellLng, searchRadiusCells };
};

export const calcularBarrio = (punto, barriosOIndice) => {
  let mejor = null;
  let mejorDist = Infinity;
  const candidatos = Array.isArray(barriosOIndice)
    ? barriosOIndice
    : (() => {
        const { grid, cellLat, cellLng, searchRadiusCells = 1 } = barriosOIndice;
        const row = Math.floor(punto.latitude / cellLat);
        const col = Math.floor(punto.longitude / cellLng);
        const result = [];
        for (let dr = -searchRadiusCells; dr <= searchRadiusCells; dr++)
          for (let dc = -searchRadiusCells; dc <= searchRadiusCells; dc++)
            result.push(...(grid.get(`${row + dr},${col + dc}`) ?? []));
        return result;
      })();
  for (const barrio of candidatos) {
    const d = getDistancia(punto, { latitude: barrio.lat, longitude: barrio.lng });
    if (d < mejorDist) { mejorDist = d; mejor = barrio; }
  }
  if (!mejor) return null;
  const maxDist = (mejor.radio ?? 800) + 500;
  return mejorDist <= maxDist ? mejor : null;
};

export const getDistancia = (a, b) => {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const puntoMedio = (a, b) => ({
  latitude: (a.latitude + b.latitude) / 2,
  longitude: (a.longitude + b.longitude) / 2,
});

const puntoPrecisionAceptable = (punto) => (
  punto?.accuracy == null || punto.accuracy <= GPS_ACCURACY_MAX_METROS
);

const distanciaTramoPuntuable = (anterior, actual) => {
  if (!anterior || !actual || actual.segmentStart || actual.gapStart) return null;
  if (!puntoPrecisionAceptable(anterior) || !puntoPrecisionAceptable(actual)) return null;

  const distancia = getDistancia(anterior, actual);
  if (!distancia || !isFinite(distancia)) return null;

  const dt = actual.timestamp && anterior.timestamp
    ? (actual.timestamp - anterior.timestamp) / 1000
    : null;
  if (dt != null && dt > 0 && distancia / dt > GPS_VELOCIDAD_MAX_MS) return null;

  return distancia;
};

export const calcularResumenTerritorial = (ruta, barrios, puntosPersonales, distanciaTotal) => {
  if (!Array.isArray(ruta) || ruta.length < 2 || !Array.isArray(barrios) || barrios.length === 0) {
    return [];
  }

  const distanciaBase = distanciaTotal > 0 ? distanciaTotal : 0;
  const acumulado = new Map();

  for (let i = 1; i < ruta.length; i++) {
    const anterior = ruta[i - 1];
    const actual = ruta[i];
    const distanciaTramo = distanciaTramoPuntuable(anterior, actual);
    if (!distanciaTramo) continue;

    const barrio = calcularBarrio(puntoMedio(anterior, actual), barrios)
      ?? calcularBarrio(actual, barrios)
      ?? calcularBarrio(anterior, barrios);

    if (!barrio) continue;

    const previo = acumulado.get(barrio.id) ?? {
      barrioId: barrio.id,
      territorioId: barrio.territorioId ?? barrio.id,
      coleccion: barrio.coleccion ?? COLECCION_BARRIOS,
      nombre: barrio.nombre,
      nombreVisible: barrio.nombreVisible ?? barrio.nombre,
      tipo: barrio.tipo ?? 'barrio',
      ciudadId: barrio.ciudadId ?? null,
      dueno: barrio.dueno ?? null,
      duenoPuntos: barrio.duenoPuntos ?? 0,
      distanciaMetros: 0,
    };

    acumulado.set(barrio.id, {
      ...previo,
      distanciaMetros: previo.distanciaMetros + distanciaTramo,
    });
  }

  return [...acumulado.values()]
    .map(item => {
      const proporcion = distanciaBase > 0 ? item.distanciaMetros / distanciaBase : 0;
      return {
        ...item,
        distanciaMetros: Math.round(item.distanciaMetros),
        proporcion,
        puntos: Math.round(puntosPersonales * proporcion),
      };
    })
    .filter(item => item.distanciaMetros > 0 && item.puntos > 0)
    .sort((a, b) => b.distanciaMetros - a.distanciaMetros);
};

const obtenerPorColeccion = async (nombreColeccion, ciudadId = null) => {
  const ref = ciudadId
    ? query(collection(db, nombreColeccion), where('ciudadId', '==', ciudadId), limit(2000))
    : query(collection(db, nombreColeccion), limit(2000));
  const snap = await getDocs(ref);
  return snap.docs
    .map(d => normalizarTerritorio(d.id, d.data(), nombreColeccion))
    .filter(esTerritorioValido);
};

export const obtenerTerritorios = async (ciudadId = null) => {
  const cached = await leerCache(ciudadId);
  if (cached) return cached;

  const territorios = await obtenerPorColeccion(COLECCION_TERRITORIOS, ciudadId);
  if (territorios.length > 0) {
    await escribirCache(ciudadId, territorios);
    return territorios;
  }

  const barrios = await obtenerPorColeccion(COLECCION_BARRIOS, ciudadId);
  if (barrios.length > 0) {
    await escribirCache(ciudadId, barrios);
    return barrios;
  }

  const seed = obtenerTerritoriosSeed(ciudadId)
    .map(territorio => normalizarTerritorio(territorio.id, territorio, 'seed_espana'))
    .filter(esTerritorioValido);
  if (seed.length > 0) await escribirCache(ciudadId, seed);
  return seed;
};

export const obtenerBarrios = obtenerTerritorios;

export const aplicarSegmentoCompetitivo = async (territorios, segmentoCompetitivo) => {
  if (!segmentoCompetitivo || !Array.isArray(territorios) || territorios.length === 0) {
    return territorios;
  }

  try {
    const porTerritorioId = new Map();
    const chunks = [];
    for (let i = 0; i < territorios.length; i += 30) chunks.push(territorios.slice(i, i + 30));

    const snapshots = await Promise.all(
      chunks
        .map(chunk => chunk.map(t => t.territorioId ?? t.id).filter(Boolean))
        .filter(ids => ids.length > 0)
        .map(ids => getDocs(query(
          collectionGroup(db, 'segmentos'),
          where('segmentoCompetitivo', '==', segmentoCompetitivo),
          where('territorioId', 'in', ids)
        )))
    );
    snapshots.forEach(snap =>
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.territorioId) porTerritorioId.set(data.territorioId, data);
      })
    );

    return territorios.map(territorio => {
      const data = porTerritorioId.get(territorio.territorioId ?? territorio.id);
      if (!data) {
        return {
          ...territorio,
          segmentoCompetitivo,
          dueno: null,
          duenoNombre: null,
          duenoPuntos: 0,
          duenoGrupo: null,
          duenoGrupoPuntos: 0,
          top10: [],
          top10Uids: [],
        };
      }
      return {
        ...territorio,
        ...data,
        id: territorio.id,
        barrioId: territorio.barrioId,
        territorioId: territorio.territorioId,
        coleccion: territorio.coleccion,
        segmentoCompetitivo,
      };
    });
  } catch (e) {
    registrarError(e, 'aplicarSegmentoCompetitivo');
    // Devolver territorios sin dueño en lugar de datos base incorrectos:
    // los datos base ignoran el segmento y mezclarían propietarios de otras ligas.
    return territorios.map(t => ({
      ...t,
      segmentoCompetitivo,
      dueno: null,
      duenoNombre: null,
      duenoPuntos: 0,
      duenoGrupo: null,
      duenoGrupoPuntos: 0,
      top10: [],
      top10Uids: [],
    }));
  }
};

export const obtenerBarriosSegmentados = async (ciudadId = null, segmentoCompetitivo = null) => {
  const territorios = await obtenerTerritorios(ciudadId);
  return aplicarSegmentoCompetitivo(territorios, segmentoCompetitivo);
};
