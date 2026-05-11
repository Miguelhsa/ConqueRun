import { auth } from '../firebaseConfig';
import { colors } from './theme';

export const MAP_PROVIDER = {
  ACTUAL: 'react-native-maps',
  FUTURO: 'maplibre',
};

export const getEstadoTerritorio = (territorio, uid = auth.currentUser?.uid) => {
  if (!territorio.dueno) return 'libre';
  if (territorio.dueno === uid) return 'propio';
  return 'rival';
};

export const getEstiloTerritorio = (territorio, seleccionado = false) => {
  const estado = getEstadoTerritorio(territorio);
  const color = {
    libre: colors.route,
    propio: colors.gold,
    rival: colors.conquest,
  }[estado];

  return {
    estado,
    color,
    fillColor: `${color}${seleccionado ? '66' : '38'}`,
    strokeColor: color,
    strokeWidth: seleccionado ? 4 : 2,
  };
};

export const getEstadoTerritorioGrupo = (territorio, misGruposIds = new Set()) => {
  if (!territorio.duenoGrupo) return 'libre';
  if (misGruposIds.has(territorio.duenoGrupo)) return 'propio';
  return 'rival';
};

export const getEstiloTerritorioGrupo = (territorio, misGruposIds = new Set(), seleccionado = false) => {
  const estado = getEstadoTerritorioGrupo(territorio, misGruposIds);
  const color = {
    libre: colors.route,
    propio: colors.gold,
    rival: colors.conquest,
  }[estado];

  return {
    estado,
    color,
    fillColor: `${color}${seleccionado ? '66' : '38'}`,
    strokeColor: color,
    strokeWidth: seleccionado ? 4 : 2,
  };
};

export const getNombreTerritorio = (territorio) => (
  territorio.nombreVisible ?? territorio.nombre ?? 'Territorio'
);

export const contarTerritoriosPorEstado = (territorios) => territorios.reduce((acc, territorio) => {
  const estado = getEstadoTerritorio(territorio);
  return { ...acc, [estado]: acc[estado] + 1 };
}, { propio: 0, rival: 0, libre: 0 });

export const shouldMostrarEtiquetas = (region) => {
  if (!region) return false;
  return region.longitudeDelta <= 0.08;
};
