import { getFunctions, httpsCallable } from 'firebase/functions';

const TTL_REPARACION_MS = 5 * 60 * 1000;
const reparacionesRecientes = new Map();

export const repararConsistenciaUsuario = async ({ clave = 'default', force = false } = {}) => {
  const ahora = Date.now();
  const ultima = reparacionesRecientes.get(clave) ?? 0;
  if (!force && ahora - ultima < TTL_REPARACION_MS) return null;

  const reparar = httpsCallable(getFunctions(), 'repararConsistenciaUsuario');
  const respuesta = await reparar();
  reparacionesRecientes.set(clave, ahora);
  return respuesta.data ?? null;
};

export const invalidarReparacionConsistencia = (clave = null) => {
  if (clave) {
    reparacionesRecientes.delete(clave);
    return;
  }
  reparacionesRecientes.clear();
};
