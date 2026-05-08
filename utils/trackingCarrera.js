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
  const value = await AsyncStorage.getItem(key);
  return value ? JSON.parse(value) : fallback;
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

export const obtenerRutaTracking = () => leerJson(RUTA_KEY, []);

export const obtenerMetaTracking = () => leerJson(META_KEY, null);

export const agregarPuntosTracking = async (locations = []) => {
  if (!locations.length) return [];

  const [[, rutaStr], [, metaStr]] = await AsyncStorage.multiGet([RUTA_KEY, META_KEY]);
  const rutaActual = rutaStr ? JSON.parse(rutaStr) : [];
  const meta = metaStr ? JSON.parse(metaStr) : null;
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
      notificationColor: '#d6aa4c',
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
