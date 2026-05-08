import { FUENTES_CARRERA, PROVEEDORES_EXTERNOS, ESTADOS_VERIFICACION } from './carreras';

export const STRAVA_SCOPES = ['read', 'activity:read'];

export const crearCarreraDesdeStrava = ({ uid, activity, importedAt }) => {
  const distancia = Math.round(activity.distance ?? 0);
  const duracion = Math.round(activity.moving_time ?? activity.elapsed_time ?? 0);
  const ritmoMedio = distancia > 0 ? Math.round(duracion / (distancia / 1000)) : 0;

  return {
    uid,
    ruta: [],
    distancia,
    duracion,
    ritmoMedio,
    fecha: activity.start_date ?? null,
    source: FUENTES_CARRERA.STRAVA,
    externalProvider: PROVEEDORES_EXTERNOS.STRAVA,
    externalActivityId: String(activity.id),
    verificationStatus: ESTADOS_VERIFICACION.STRAVA_VERIFIED,
    importedAt,
    stravaActivityUrl: activity.id ? `https://www.strava.com/activities/${activity.id}` : null,
    stravaSummaryPolyline: activity.map?.summary_polyline ?? null,
    stravaSportType: activity.sport_type ?? activity.type ?? null,
    stravaRawVisibility: activity.visibility ?? null,
  };
};
