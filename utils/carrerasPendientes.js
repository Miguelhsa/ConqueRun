import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFunctions, httpsCallable } from 'firebase/functions';

const KEY = 'carrerasPendientes_v1';
const MAX_INTENTOS = 5;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const enviosEnCurso = new Set();

export const guardarCarreraPendiente = async (uid, payload) => {
  try {
    const pendientes = await obtenerCarrerasPendientes();
    const id = `${uid}_${Date.now()}`;
    const nueva = { id, uid, payload, guardadoEn: Date.now(), intentos: 0 };
    await AsyncStorage.setItem(KEY, JSON.stringify([...pendientes, nueva]));
    return id;
  } catch {
    return null;
  }
};

export const obtenerCarrerasPendientes = async () => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const todas = JSON.parse(raw);
    return todas.filter(c =>
      (c.intentos ?? 0) < MAX_INTENTOS &&
      Date.now() - (c.guardadoEn ?? 0) < TTL_MS
    );
  } catch {
    return [];
  }
};

export const eliminarCarreraPendiente = async (id) => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    const todas = JSON.parse(raw);
    await AsyncStorage.setItem(KEY, JSON.stringify(todas.filter(c => c.id !== id)));
  } catch {}
};

// Envía carreras pendientes sin actualizar estado de UI.
// Llamar desde App.js (AppState) para que funcione aunque CorrerScreen no esté montada.
export const enviarCarrerasPendientesBackground = async (uid) => {
  if (!uid || enviosEnCurso.has(uid)) return;
  enviosEnCurso.add(uid);
  try {
    const pendientes = await obtenerCarrerasPendientes();
    const propias = pendientes.filter(c => c.uid === uid);
    if (propias.length === 0) return;
    const registrarCarrera = httpsCallable(getFunctions(), 'registrarCarreraConqurun');
    for (const carrera of propias) {
      try {
        await registrarCarrera(carrera.payload);
        await eliminarCarreraPendiente(carrera.id);
      } catch (e) {
        if (e.code === 'functions/failed-precondition' || e.code === 'functions/invalid-argument') {
          await eliminarCarreraPendiente(carrera.id);
        } else {
          await marcarIntentoFallido(carrera.id);
          break;
        }
      }
    }
  } finally {
    enviosEnCurso.delete(uid);
  }
};

export const marcarIntentoFallido = async (id) => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    const todas = JSON.parse(raw);
    await AsyncStorage.setItem(KEY, JSON.stringify(
      todas.map(c => c.id === id ? { ...c, intentos: (c.intentos ?? 0) + 1 } : c)
    ));
  } catch {}
};
