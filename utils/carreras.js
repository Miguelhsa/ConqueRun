import { validarCarrera } from './grupos';

export const FUENTES_CARRERA = {
  CONQURUN: 'conqurun',
  STRAVA: 'strava',
};

export const PROVEEDORES_EXTERNOS = {
  STRAVA: 'strava',
};

export const ESTADOS_VERIFICACION = {
  SELF_RECORDED: 'self_recorded',
  STRAVA_VERIFIED: 'strava_verified',
  REJECTED: 'rejected',
  SUSPICIOUS: 'suspicious',
};

export const normalizarCarrera = (carrera) => {
  const source = carrera.source ?? FUENTES_CARRERA.CONQURUN;
  const externalProvider = carrera.externalProvider ?? null;

  return {
    ...carrera,
    source,
    externalProvider,
    externalActivityId: carrera.externalActivityId ?? null,
    verificationStatus: carrera.verificationStatus ?? ESTADOS_VERIFICACION.SELF_RECORDED,
    importedAt: carrera.importedAt ?? null,
    stravaActivityUrl: carrera.stravaActivityUrl ?? null,
    puntosPersonales: carrera.puntosPersonales ?? carrera.puntos ?? 0,
    aportacionesGrupo: carrera.aportacionesGrupo ?? [],
    grupoActivoId: carrera.grupoActivoId ?? null,
    grupoActivoNombre: carrera.grupoActivoNombre ?? null,
    gruposAportados: carrera.gruposAportados ?? [],
    territorioCarrera: carrera.territorioCarrera ?? [],
    barriosConquistados: carrera.barriosConquistados ?? carrera.conquistasCarrera?.length ?? 0,
    conquistasCarrera: carrera.conquistasCarrera ?? [],
    ritmo30d: carrera.ritmo30d ?? null,
    segmentoRitmo: carrera.segmentoRitmo ?? null,
    segmentoGenero: carrera.segmentoGenero ?? null,
    segmentoEdad: carrera.segmentoEdad ?? null,
    grupoEdad: carrera.grupoEdad ?? null,
    segmentoCompetitivo: carrera.segmentoCompetitivo ?? null,
    segmentoEtiqueta: carrera.segmentoEtiqueta ?? null,
  };
};

export const crearCarreraConqurun = ({
  uid,
  ruta,
  distancia,
  duracion,
  ritmoMedio,
  puntos,
  aportacionesGrupo = [],
  grupoActivoId = null,
  grupoActivoNombre = null,
  territorioCarrera = [],
  conquistasCarrera = [],
  ciudadId,
  ciudadNombre,
  paisCodigo,
  segmentos = {},
  fecha,
}) => ({
  uid,
  ruta,
  distancia: Math.round(distancia),
  duracion,
  ritmoMedio: Math.round(ritmoMedio),
  puntos,
  puntosPersonales: puntos,
  aportacionesGrupo,
  grupoActivoId,
  grupoActivoNombre,
  gruposAportados: aportacionesGrupo.map(aportacion => aportacion.grupoId),
  territorioCarrera,
  barriosConquistados: conquistasCarrera.length,
  conquistasCarrera,
  ciudadId: ciudadId ?? null,
  ciudadNombre: ciudadNombre ?? null,
  paisCodigo: paisCodigo ?? null,
  ritmo30d: segmentos.ritmo30d ?? null,
  segmentoRitmo: segmentos.segmentoRitmo ?? null,
  segmentoGenero: segmentos.segmentoGenero ?? null,
  segmentoEdad: segmentos.segmentoEdad ?? null,
  grupoEdad: segmentos.grupoEdad ?? segmentos.segmentoEdad ?? null,
  segmentoCompetitivo: segmentos.segmentoCompetitivo ?? null,
  segmentoEtiqueta: segmentos.segmentoEtiqueta ?? null,
  fecha,
  source: FUENTES_CARRERA.CONQURUN,
  externalProvider: null,
  externalActivityId: null,
  verificationStatus: ESTADOS_VERIFICACION.SELF_RECORDED,
  importedAt: null,
  stravaActivityUrl: null,
});

export const esCarreraPuntuable = (carrera) => {
  const normalizada = normalizarCarrera(carrera);

  if (
    normalizada.verificationStatus === ESTADOS_VERIFICACION.REJECTED ||
    normalizada.verificationStatus === ESTADOS_VERIFICACION.SUSPICIOUS
  ) {
    return false;
  }

  return validarCarrera(normalizada.distancia, normalizada.duracion).valida;
};

export const esCarreraStravaVerificada = (carrera) => {
  const normalizada = normalizarCarrera(carrera);
  return (
    normalizada.source === FUENTES_CARRERA.STRAVA &&
    normalizada.externalProvider === PROVEEDORES_EXTERNOS.STRAVA &&
    normalizada.verificationStatus === ESTADOS_VERIFICACION.STRAVA_VERIFIED
  );
};
