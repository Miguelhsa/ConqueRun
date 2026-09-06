import { Platform } from 'react-native';
import { formatearTiempo, formatearDistancia, formatearRitmo } from './notificacionCarrera';

// Puente hacia la Live Activity de iOS (módulo nativo activity-controller).
// En Android (o si el módulo aún no está compilado) todo es no-op silencioso.

const INTERVALO_MIN_REFRESCO_MS = 3000;
let ultimoRefrescoEn = 0;

let modulo = null;
if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line global-require
    modulo = require('../modules/activity-controller');
  } catch {
    modulo = null;
  }
}

const construirEstado = ({ distanciaMetros = 0, segundos = 0, pausada = false } = {}) => ({
  // Ancla del cronómetro nativo: epoch (s) del inicio efectivo = ahora - tiempo transcurrido.
  // Reenviarlo en cada update mantiene el cronómetro alineado aunque los updates sean escasos.
  inicioTimer: (Date.now() - segundos * 1000) / 1000,
  tiempoTexto: formatearTiempo(segundos),
  distancia: formatearDistancia(distanciaMetros),
  ritmo: formatearRitmo(distanciaMetros, segundos),
  pausada: Boolean(pausada),
});

export const iniciarLiveActivityCarrera = (stats = {}) => {
  if (Platform.OS !== 'ios' || !modulo) return;
  ultimoRefrescoEn = Date.now();
  try {
    if (modulo.areLiveActivitiesEnabled && !modulo.areLiveActivitiesEnabled()) return;
    modulo.startLiveActivity(construirEstado(stats));
  } catch {}
};

export const actualizarLiveActivityCarrera = (stats = {}) => {
  if (Platform.OS !== 'ios' || !modulo) return;
  const ahora = Date.now();
  if (!stats.pausada && ahora - ultimoRefrescoEn < INTERVALO_MIN_REFRESCO_MS) return;
  ultimoRefrescoEn = ahora;
  try {
    modulo.updateLiveActivity(construirEstado(stats));
  } catch {}
};

export const finalizarLiveActivityCarrera = () => {
  if (Platform.OS !== 'ios' || !modulo) return;
  ultimoRefrescoEn = 0;
  try {
    modulo.endLiveActivity();
  } catch {}
};
