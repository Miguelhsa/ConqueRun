import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { invalidarCacheTerritorios } from './barrios';

const KEY = 'carrerasPendientes_v1';
const MAX_INTENTOS = 5;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const enviosEnCurso = new Map();
let colaMutacionesPendientes = Promise.resolve();

const leerCarrerasPersistidas = async () => {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  const todas = JSON.parse(raw);
  return Array.isArray(todas) ? todas : [];
};

const filtrarCarrerasVigentes = (carreras = []) => {
  const ahora = Date.now();
  return carreras.filter(c =>
    (c.intentos ?? 0) < MAX_INTENTOS &&
    ahora - (c.guardadoEn ?? 0) < TTL_MS
  );
};

const esperarMutacionesPendientes = () => colaMutacionesPendientes.catch(() => {});

const encolarMutacionPendientes = (mutacion) => {
  const siguiente = colaMutacionesPendientes
    .catch(() => {})
    .then(mutacion);
  colaMutacionesPendientes = siguiente.catch(() => {});
  return siguiente;
};

export const guardarCarreraPendiente = async (uid, payload) => {
  try {
    return await encolarMutacionPendientes(async () => {
      const pendientes = filtrarCarrerasVigentes(await leerCarrerasPersistidas());
      const idBase = payload?.carreraId ? String(payload.carreraId) : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const id = `${uid}_${idBase}`;
      const existente = pendientes.find(c => c.id === id);
      const nueva = {
        id,
        uid,
        payload,
        guardadoEn: existente?.guardadoEn ?? Date.now(),
        intentos: existente?.intentos ?? 0,
      };
      await AsyncStorage.setItem(KEY, JSON.stringify([
        ...pendientes.filter(c => c.id !== id),
        nueva,
      ]));
      return id;
    });
  } catch {
    return null;
  }
};

export const obtenerCarrerasPendientes = async () => {
  try {
    await esperarMutacionesPendientes();
    return filtrarCarrerasVigentes(await leerCarrerasPersistidas());
  } catch {
    return [];
  }
};

export const eliminarCarreraPendiente = async (id) => {
  try {
    await encolarMutacionPendientes(async () => {
      const todas = await leerCarrerasPersistidas();
      await AsyncStorage.setItem(KEY, JSON.stringify(todas.filter(c => c.id !== id)));
    });
  } catch {}
};

export const enviarCarrerasPendientesConGuard = async (uid, {
  onPendientes = null,
  onProcesada = null,
  onDescartada = null,
  onFallo = null,
} = {}) => {
  if (!uid) return { pendientes: 0, procesadas: 0, descartadas: 0 };
  const envioExistente = enviosEnCurso.get(uid);
  if (envioExistente) {
    const resultado = await envioExistente.catch(() => ({ error: true }));
    return { ...resultado, enCurso: true };
  }

  const envio = (async () => {
    let procesadas = 0;
    let descartadas = 0;
    let total = 0;

    const pendientes = await obtenerCarrerasPendientes();
    const propias = pendientes.filter(c => c.uid === uid);
    total = propias.length;
    onPendientes?.(total);
    if (propias.length === 0) return { pendientes: 0, procesadas, descartadas };

    const registrarCarrera = httpsCallable(getFunctions(), 'registrarCarreraConqurun');
    for (const carrera of propias) {
      try {
        await registrarCarrera(carrera.payload);
        invalidarCacheTerritorios(carrera.payload?.ciudadId).catch(() => {});
        await eliminarCarreraPendiente(carrera.id);
        procesadas += 1;
        onProcesada?.(carrera);
      } catch (e) {
        if (e.code === 'functions/failed-precondition' || e.code === 'functions/invalid-argument') {
          await eliminarCarreraPendiente(carrera.id);
          descartadas += 1;
          onDescartada?.(carrera, e);
        } else {
          await marcarIntentoFallido(carrera.id);
          onFallo?.(carrera, e);
          break;
        }
      }
    }
    return { pendientes: total, procesadas, descartadas };
  })();

  enviosEnCurso.set(uid, envio);

  try {
    return await envio;
  } finally {
    if (enviosEnCurso.get(uid) === envio) enviosEnCurso.delete(uid);
  }
};

// Envía carreras pendientes sin actualizar estado de UI.
// Llamar desde App.js (AppState) para que funcione aunque CorrerScreen no esté montada.
export const enviarCarrerasPendientesBackground = (uid) => (
  enviarCarrerasPendientesConGuard(uid)
);

export const marcarIntentoFallido = async (id) => {
  try {
    await encolarMutacionPendientes(async () => {
      const todas = await leerCarrerasPersistidas();
      await AsyncStorage.setItem(KEY, JSON.stringify(
        todas.map(c => c.id === id ? { ...c, intentos: (c.intentos ?? 0) + 1 } : c)
      ));
    });
  } catch {}
};
