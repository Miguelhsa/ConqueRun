import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebaseConfig';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';
import { obtenerTerritoriosSeed } from './territoriosSeed';

const COLECCION_TERRITORIOS = 'territorios';
const COLECCION_BARRIOS = 'barrios';

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

export const invalidarCacheTerritorios = async (ciudadId) => {
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
  return { grid, cellLat, cellLng };
};

export const calcularBarrio = (punto, barriosOIndice) => {
  let mejor = null;
  let mejorDist = Infinity;
  const candidatos = Array.isArray(barriosOIndice)
    ? barriosOIndice
    : (() => {
        const { grid, cellLat, cellLng } = barriosOIndice;
        const row = Math.floor(punto.latitude / cellLat);
        const col = Math.floor(punto.longitude / cellLng);
        const result = [];
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++)
            result.push(...(grid.get(`${row + dr},${col + dc}`) ?? []));
        return result;
      })();
  for (const barrio of candidatos) {
    const d = getDistancia(punto, { latitude: barrio.lat, longitude: barrio.lng });
    if (d < mejorDist) { mejorDist = d; mejor = barrio; }
  }
  return mejor;
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

export const calcularResumenTerritorial = (ruta, barrios, puntosPersonales, distanciaTotal) => {
  if (!Array.isArray(ruta) || ruta.length < 2 || !Array.isArray(barrios) || barrios.length === 0) {
    return [];
  }

  const distanciaBase = distanciaTotal > 0 ? distanciaTotal : 0;
  const acumulado = new Map();

  for (let i = 1; i < ruta.length; i++) {
    const anterior = ruta[i - 1];
    const actual = ruta[i];
    const distanciaTramo = getDistancia(anterior, actual);
    if (!distanciaTramo || !isFinite(distanciaTramo)) continue;

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

export const actualizarDueno = async (barrioId, uid, puntos, coleccion = COLECCION_BARRIOS) => {
  const ref = doc(db, coleccion, barrioId);
  await updateDoc(ref, { dueno: uid, duenoPuntos: puntos });
};

const obtenerPorColeccion = async (nombreColeccion, ciudadId = null) => {
  const ref = ciudadId
    ? query(collection(db, nombreColeccion), where('ciudadId', '==', ciudadId))
    : collection(db, nombreColeccion);
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
  return seed;
};

export const obtenerBarrios = obtenerTerritorios;
