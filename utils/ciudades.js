import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { getDistancia } from './barrios';
import { obtenerCiudadesSeed } from './territoriosSeed';

export const CIUDAD_FALLBACK = {
  id: 'es-madrid',
  nombre: 'Madrid',
  paisCodigo: 'ES',
  paisNombre: 'España',
  lat: 40.4168,
  lng: -3.7038,
  radioBusqueda: 35000,
  estadoCobertura: 'activa',
};

export const obtenerCiudades = async () => {
  const snap = await getDocs(collection(db, 'ciudades'));
  const ciudades = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (ciudades.length > 0) return ciudades;

  const ciudadesSeed = obtenerCiudadesSeed();
  return ciudadesSeed.length > 0 ? ciudadesSeed : [CIUDAD_FALLBACK];
};

export const obtenerCiudadCercana = async (punto) => {
  const ciudades = await obtenerCiudades();

  if (!punto) return CIUDAD_FALLBACK;

  const ciudadesOrdenadas = ciudades
    .map(ciudad => ({
      ...ciudad,
      distancia: getDistancia(punto, { latitude: ciudad.lat, longitude: ciudad.lng }),
    }))
    .sort((a, b) => a.distancia - b.distancia);

  const cercana = ciudadesOrdenadas[0] ?? CIUDAD_FALLBACK;
  const dentroCobertura = cercana.distancia <= (cercana.radioBusqueda ?? 35000);

  return dentroCobertura ? cercana : CIUDAD_FALLBACK;
};
