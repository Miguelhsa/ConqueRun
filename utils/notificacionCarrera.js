import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Notificación persistente (ongoing) que muestra el resumen de la carrera en curso
// —tiempo, distancia y ritmo— visible con la pantalla bloqueada.
//
// Solo Android: se apoya en un canal de baja importancia (sin sonido ni heads-up)
// y en una notificación sticky que se refresca desde el bucle de tracking.
// iOS usará una Live Activity aparte (pendiente).

export const TIPO_NOTIF_CARRERA = 'carreraResumen';

const CANAL_CARRERA_ID = 'carrera-en-curso';
const NOTIF_CARRERA_ID = 'conqurun-carrera-resumen';
const INTERVALO_MIN_REFRESCO_MS = 3000;

let canalConfigurado = false;
let ultimoRefrescoEn = 0;

export const configurarCanalCarrera = async () => {
  if (Platform.OS !== 'android' || canalConfigurado) return;
  try {
    await Notifications.setNotificationChannelAsync(CANAL_CARRERA_ID, {
      name: 'Carrera en curso',
      importance: Notifications.AndroidImportance.LOW, // sin sonido ni heads-up
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: false,
      sound: null,
      enableVibrate: false,
    });
    canalConfigurado = true;
  } catch {
    // Un fallo de canal nunca debe bloquear la carrera.
  }
};

const dos = (n) => String(n).padStart(2, '0');

export const formatearTiempo = (segundos) => {
  const s = Math.max(0, Math.floor(segundos || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  return h > 0 ? `${h}:${dos(m)}:${dos(seg)}` : `${dos(m)}:${dos(seg)}`;
};

export const formatearDistancia = (metros) => {
  const km = Math.max(0, metros || 0) / 1000;
  return `${km.toFixed(2).replace('.', ',')} km`;
};

export const formatearRitmo = (metros, segundos) => {
  const km = (metros || 0) / 1000;
  if (km < 0.05 || !segundos) return '—';
  const segPorKm = segundos / km;
  let m = Math.floor(segPorKm / 60);
  let s = Math.round(segPorKm % 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${dos(s)} /km`;
};

export const mostrarNotificacionCarrera = async ({
  distanciaMetros = 0,
  segundos = 0,
  pausada = false,
  forzar = false,
} = {}) => {
  if (Platform.OS !== 'android') return; // iOS: Live Activity (pendiente)

  const ahora = Date.now();
  if (!forzar && !pausada && ahora - ultimoRefrescoEn < INTERVALO_MIN_REFRESCO_MS) return;
  ultimoRefrescoEn = ahora;

  try {
    await configurarCanalCarrera();
    const cuerpo = `⏱ ${formatearTiempo(segundos)}    📍 ${formatearDistancia(distanciaMetros)}    🏃 ${formatearRitmo(distanciaMetros, segundos)}`;
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF_CARRERA_ID,
      content: {
        title: pausada ? 'ConqueRun · Carrera pausada' : 'ConqueRun · Carrera en curso',
        body: cuerpo,
        sticky: true,
        sound: null,
        color: '#C0E020',
        data: { tipo: TIPO_NOTIF_CARRERA },
      },
      trigger: { channelId: CANAL_CARRERA_ID },
    });
  } catch {
    // La notificación es un extra: nunca debe romper el tracking.
  }
};

export const ocultarNotificacionCarrera = async () => {
  if (Platform.OS !== 'android') return;
  ultimoRefrescoEn = 0;
  try {
    await Notifications.dismissNotificationAsync(NOTIF_CARRERA_ID);
  } catch {}
  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIF_CARRERA_ID);
  } catch {}
};
