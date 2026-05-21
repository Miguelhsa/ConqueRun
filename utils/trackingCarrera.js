import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getDistancia } from './barrios';

export const CARRERA_LOCATION_TASK = 'conqurun-carrera-location-task';
export const GPS_ACCURACY_MAX_METROS = 50;
export const GPS_VELOCIDAD_MAX_MS = 7;

const RUTA_KEY = 'conqurun:carrera:ruta';
const META_KEY = 'conqurun:carrera:meta';

const normalizarPunto = (location) => ({
  latitude: location.coords.latitude,
  longitude: location.coords.longitude,
  speed: location.coords.speed ?? null,
  accuracy: location.coords.accuracy ?? null,
  timestamp: location.timestamp ?? Date.now(),
  segmentStart: Boolean(location.segmentStart),
});

const leerJson = async (key, fallback) => {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

export const puntoTienePrecisionAceptable = (punto) => (
  punto.accuracy == null || punto.accuracy <= GPS_ACCURACY_MAX_METROS
);

export const tramoTieneVelocidadAceptable = (anterior, actual) => {
  if (!anterior?.timestamp || !actual?.timestamp) return true;

  const segundos = (actual.timestamp - anterior.timestamp) / 1000;
  if (segundos <= 0) return true;

  const distancia = getDistancia(anterior, actual);
  return distancia / segundos <= GPS_VELOCIDAD_MAX_MS;
};

export const puntoCuentaParaDistancia = (anterior, actual) => {
  if (!actual || actual.segmentStart) return false;
  if (!puntoTienePrecisionAceptable(actual)) return false;
  if (anterior && !puntoTienePrecisionAceptable(anterior)) return false;
  return tramoTieneVelocidadAceptable(anterior, actual);
};

export const calcularDistanciaFiltrada = (puntos) => puntos.reduce((total, punto, index) => {
  if (index === 0) return total;
  const anterior = puntos[index - 1];
  if (!puntoCuentaParaDistancia(anterior, punto)) return total;
  return total + getDistancia(anterior, punto);
}, 0);

const distanciaPuntoSegmentoMetros = (punto, inicio, fin) => {
  const latReferencia = ((inicio.latitude + fin.latitude) / 2) * (Math.PI / 180);
  const metrosPorLatitud = 111320;
  const metrosPorLongitud = 111320 * Math.cos(latReferencia);
  const ax = inicio.longitude * metrosPorLongitud;
  const ay = inicio.latitude * metrosPorLatitud;
  const bx = fin.longitude * metrosPorLongitud;
  const by = fin.latitude * metrosPorLatitud;
  const px = punto.longitude * metrosPorLongitud;
  const py = punto.latitude * metrosPorLatitud;
  const dx = bx - ax;
  const dy = by - ay;

  if (dx === 0 && dy === 0) {
    return getDistancia(punto, inicio);
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
};

const limitarPuntosRuta = (puntos, maxPuntos) => {
  if (puntos.length <= maxPuntos) return puntos;
  if (maxPuntos <= 2) return [puntos[0], puntos[puntos.length - 1]];

  const reducida = [];
  for (let i = 0; i < maxPuntos; i += 1) {
    const indice = Math.round((i * (puntos.length - 1)) / (maxPuntos - 1));
    if (reducida[reducida.length - 1] !== puntos[indice]) {
      reducida.push(puntos[indice]);
    }
  }
  return reducida;
};

export const simplificarRutaParaGuardar = (
  puntos = [],
  { toleranciaMetros = 8, maxPuntos = 1000 } = {}
) => {
  if (!Array.isArray(puntos) || puntos.length <= 2) return puntos;

  const mantener = new Array(puntos.length).fill(false);
  mantener[0] = true;
  mantener[puntos.length - 1] = true;

  puntos.forEach((punto, index) => {
    if (punto.segmentStart) mantener[index] = true;
  });

  const tramos = [[0, puntos.length - 1]];
  while (tramos.length > 0) {
    const [inicio, fin] = tramos.pop();
    let distanciaMaxima = 0;
    let indiceMaximo = null;

    for (let i = inicio + 1; i < fin; i += 1) {
      const distancia = distanciaPuntoSegmentoMetros(puntos[i], puntos[inicio], puntos[fin]);
      if (distancia > distanciaMaxima) {
        distanciaMaxima = distancia;
        indiceMaximo = i;
      }
    }

    if (indiceMaximo != null && distanciaMaxima > toleranciaMetros) {
      mantener[indiceMaximo] = true;
      tramos.push([inicio, indiceMaximo], [indiceMaximo, fin]);
    }
  }

  return limitarPuntosRuta(
    puntos.filter((_, index) => mantener[index]),
    maxPuntos
  );
};

export const obtenerRutaTracking = () => leerJson(RUTA_KEY, []);

export const obtenerMetaTracking = () => leerJson(META_KEY, null);

export const agregarPuntosTracking = async (locations = []) => {
  if (!locations.length) return [];

  const [[, rutaStr], [, metaStr]] = await AsyncStorage.multiGet([RUTA_KEY, META_KEY]);
  let rutaActual = [];
  let meta = null;
  try { if (rutaStr) rutaActual = JSON.parse(rutaStr); } catch {}
  try { if (metaStr) meta = JSON.parse(metaStr); } catch {}
  const puntos = locations.map(normalizarPunto);
  const rutaNueva = [...rutaActual];
  let distanciaAcumulada = meta?.distanciaAcumulada ?? 0;

  puntos.forEach((punto) => {
    const ultimo = rutaNueva[rutaNueva.length - 1];
    const repetido = ultimo
      && ultimo.latitude === punto.latitude
      && ultimo.longitude === punto.longitude
      && ultimo.timestamp === punto.timestamp;

    if (!repetido) {
      if (ultimo && puntoCuentaParaDistancia(ultimo, punto)) {
        distanciaAcumulada += getDistancia(ultimo, punto);
      }
      rutaNueva.push(punto);
    }
  });

  const updates = [[RUTA_KEY, JSON.stringify(rutaNueva)]];
  if (meta) {
    updates.push([META_KEY, JSON.stringify({ ...meta, distanciaAcumulada })]);
  }
  await AsyncStorage.multiSet(updates);
  return rutaNueva;
};

export const prepararTrackingCarrera = async ({ segundoPlano = false } = {}) => {
  await AsyncStorage.multiSet([
    [RUTA_KEY, JSON.stringify([])],
    [META_KEY, JSON.stringify({
      iniciadaEn: Date.now(),
      segundoPlano,
      pausada: false,
      pausadaEn: null,
      tiempoPausadoMs: 0,
    })],
  ]);
};

export const limpiarTrackingCarrera = async () => {
  await AsyncStorage.multiRemove([RUTA_KEY, META_KEY]);
};

export const iniciarTrackingCarrera = async () => {
  const activo = await Location.hasStartedLocationUpdatesAsync(CARRERA_LOCATION_TASK);
  if (activo) {
    await Location.stopLocationUpdatesAsync(CARRERA_LOCATION_TASK);
  }

  await Location.startLocationUpdatesAsync(CARRERA_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 5,
    timeInterval: 2000,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'ConqueRun activo',
      notificationBody: 'Grabando tu carrera y conquistando barrios.',
      notificationColor: '#C6F432',
    },
  });
};

export const iniciarTrackingPrimerPlano = async (onUpdate) => Location.watchPositionAsync(
  {
    accuracy: Location.Accuracy.High,
    distanceInterval: 5,
    timeInterval: 2000,
  },
  async (loc) => {
    const ruta = await agregarPuntosTracking([loc]);
    onUpdate?.(ruta);
  }
);

export const pararTrackingCarrera = async () => {
  const activo = await Location.hasStartedLocationUpdatesAsync(CARRERA_LOCATION_TASK);
  if (activo) {
    await Location.stopLocationUpdatesAsync(CARRERA_LOCATION_TASK);
  }
};

export const pausarTrackingCarrera = async () => {
  const meta = await obtenerMetaTracking();
  if (!meta || meta.pausada) return;

  await pararTrackingCarrera();
  await AsyncStorage.setItem(META_KEY, JSON.stringify({
    ...meta,
    pausada: true,
    pausadaEn: Date.now(),
  }));
};

export const reanudarTrackingCarrera = async () => {
  const meta = await obtenerMetaTracking();
  if (!meta) return null;

  const ahora = Date.now();
  const tiempoPausadoMs = meta.pausadaEn
    ? (meta.tiempoPausadoMs ?? 0) + (ahora - meta.pausadaEn)
    : (meta.tiempoPausadoMs ?? 0);
  const metaNueva = {
    ...meta,
    pausada: false,
    pausadaEn: null,
    tiempoPausadoMs,
  };

  await AsyncStorage.setItem(META_KEY, JSON.stringify(metaNueva));
  return metaNueva;
};

export const trackingSegundoPlanoActivo = () => (
  Location.hasStartedLocationUpdatesAsync(CARRERA_LOCATION_TASK)
);

TaskManager.defineTask(CARRERA_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error(error);
    return;
  }

  await agregarPuntosTracking(data?.locations ?? []);
});
