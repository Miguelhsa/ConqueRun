import territoriosEspana from '../data/generated/territorios-espana.json';

export const obtenerCiudadesSeed = () => territoriosEspana.ciudades ?? [];

export const obtenerTerritoriosSeed = (ciudadId = null) => {
  const territorios = territoriosEspana.territorios ?? [];
  if (!ciudadId) return territorios;
  return territorios.filter(territorio => territorio.ciudadId === ciudadId);
};
