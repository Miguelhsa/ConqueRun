import { db, auth } from '../firebaseConfig';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  collection, doc, addDoc, getDoc, getDocs, setDoc,
  updateDoc, arrayUnion, arrayRemove, deleteField, query, where, limit, serverTimestamp,
  increment, writeBatch
} from 'firebase/firestore';

const BATCH_LIMIT = 450;

const ejecutarOps = async (ops) => {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const chunk = ops.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    chunk.forEach(({ ref, data, merge }) =>
      merge ? batch.set(ref, data, { merge: true }) : batch.set(ref, data)
    );
    await batch.commit();
  }
};

const MAX_GRUPOS_POR_USUARIO = 50;
const CHARS_CODIGO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// Código criptográficamente seguro de 6 caracteres
export const generarCodigo = () => {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => CHARS_CODIGO[b % CHARS_CODIGO.length]).join('');
};

export const RITMO_MINIMO_VALIDO = 150; // 2:30 min/km: por debajo se considera carrera sospechosa.
export const RITMO_MAXIMO_VALIDO = 1200; // 20:00 min/km: caminar muy lento no debería puntuar como carrera.
export const DISTANCIA_MINIMA_CARRERA = 200; // 200 m: evita guardar arranques accidentales.
export const DURACION_MINIMA_CARRERA = 60; // 60 s: evita pruebas demasiado cortas.

export const validarCarrera = (distancia, duracion) => {
  if (distancia < DISTANCIA_MINIMA_CARRERA) {
    return { valida: false, motivo: 'Carrera demasiado corta: mínimo 200 m' };
  }

  if (duracion < DURACION_MINIMA_CARRERA) {
    return { valida: false, motivo: 'Carrera demasiado corta: mínimo 1 minuto' };
  }

  const ritmoMedio = distancia > 0 ? duracion / (distancia / 1000) : 0;

  if (!ritmoMedio || !isFinite(ritmoMedio)) {
    return { valida: false, motivo: 'No se pudo calcular el ritmo medio' };
  }

  if (ritmoMedio < RITMO_MINIMO_VALIDO) {
    return { valida: false, motivo: 'Ritmo demasiado rápido para una carrera válida' };
  }

  if (ritmoMedio > RITMO_MAXIMO_VALIDO) {
    return { valida: false, motivo: 'Ritmo demasiado lento para puntuar como carrera' };
  }

  return { valida: true, ritmoMedio };
};

// Calcular puntos personales de una carrera. Los grupos no multiplican el ranking individual.
// Zona rápida (≤5:00): cuadrática 2:50→×5, 5:00→×1. Zona lenta (>5:00): lineal 5:00→×1, 10:00→×0.5.
export const calcularPuntos = (distancia, ritmoMedio) => {
  const km = distancia / 1000;
  const factorRitmo = ritmoMedio <= 300
    ? Math.min(5, Math.max(1, 5 - 4 * ((ritmoMedio - 170) / 130) ** 2))
    : Math.min(1, Math.max(0.5, 1 - 0.5 * (ritmoMedio - 300) / 300));
  return Math.round(km * factorRitmo);
};

export const calcularAportacionesGrupo = (grupos, puntosPersonales, carreraId, uid) => (
  grupos
    .filter(grupo => Array.isArray(grupo.miembros))
    .map(grupo => ({
      id: `${carreraId}_${grupo.id}`,
      carreraId,
      grupoId: grupo.id,
      grupoNombre: grupo.nombre,
      uid,
      puntosBase: puntosPersonales,
      multiplicadorGrupo: 1,
      puntosGrupo: puntosPersonales,
      miembrosGrupoEnEseMomento: grupo.miembros.length,
    }))
);

export const registrarAportacionesGrupo = async ({
  carreraId,
  uid,
  puntosPersonales,
  distancia,
  duracion,
  aportaciones: aportacionesCalculadas = null,
}) => {
  const grupos = aportacionesCalculadas ? [] : await obtenerMisGrupos();
  const aportaciones = aportacionesCalculadas ?? calcularAportacionesGrupo(grupos, puntosPersonales, carreraId, uid);

  if (aportaciones.length === 0) return [];

  const ops = [];

  for (const aportacion of aportaciones) {
    ops.push({
      ref: doc(db, 'aportacionesGrupo', aportacion.id),
      data: { ...aportacion, distancia: Math.round(distancia), fecha: serverTimestamp() },
      merge: false,
    });
    ops.push({
      ref: doc(db, 'grupos', aportacion.grupoId),
      data: {
        puntosTotales: increment(aportacion.puntosGrupo),
        carrerasTotales: increment(1),
        distanciaTotal: increment(Math.round(distancia)),
        duracionTotal: increment(Math.round(duracion)),
        actualizadoEn: serverTimestamp(),
      },
      merge: true,
    });
  }

  await ejecutarOps(ops);
  return aportaciones;
};

// Generar un ref con ID para el grupo (permite subir foto antes de crear el doc)
export const generarRefGrupo = () => doc(collection(db, 'grupos'));

const comprobarLimiteGrupos = async (uid) => {
  const snap = await getDocs(query(
    collection(db, 'grupos'),
    where('miembros', 'array-contains', uid),
    limit(MAX_GRUPOS_POR_USUARIO)
  ));
  if (snap.size >= MAX_GRUPOS_POR_USUARIO) {
    throw new Error(`Puedes pertenecer a un máximo de ${MAX_GRUPOS_POR_USUARIO} grupos.`);
  }
};


// Crear grupo — acepta fotoPendienteUrl y grupoRef opcionales para escritura atómica con foto
export const crearGrupo = async ({ nombre, descripcion, esPublico }, { grupoRef, fotoPendienteUrl } = {}) => {
  const uid = auth.currentUser.uid;
  const codigo = generarCodigo();
  const snap = await getDoc(doc(db, 'usuarios', uid));
  const data = snap.exists() ? snap.data() : {};
  const nickname = data.nickname ?? 'Corredor';
  const ciudadId = data.ciudadActualId ?? null;
  const ciudadNombre = data.ciudadActualNombre ?? null;

  if (!ciudadId) throw new Error('Necesitas tener una ciudad asignada para crear un grupo.');
  await comprobarLimiteGrupos(uid);

  const ref = grupoRef ?? doc(collection(db, 'grupos'));
  await setDoc(ref, {
    nombre,
    descripcion,
    esPublico,
    codigo,
    creador: uid,
    miembros: [uid],
    nicknames: { [uid]: nickname },
    ciudadId,
    ciudadNombre,
    foto: null,
    fotoPendiente: fotoPendienteUrl ?? null,
    fotoEstado: fotoPendienteUrl ? 'pendiente' : null,
    fotoMotivoRechazo: null,
    fotoRevisadaEn: null,
    puntosTotales: 0,
    carrerasTotales: 0,
    distanciaTotal: 0,
    creadoEn: serverTimestamp(),
  });

  return { id: ref.id, codigo };
};

// Unirse a grupo por código
export const unirseACodigo = async (codigo) => {
  await comprobarLimiteGrupos(auth.currentUser.uid);
  const unirse = httpsCallable(getFunctions(), 'unirseAGrupoConCodigo');
  const result = await unirse({ codigo });
  return result.data?.grupoId;
};

// Unirse a grupo público
export const unirseAGrupo = async (grupoId) => {
  const uid = auth.currentUser.uid;
  const [userSnap, grupoSnap] = await Promise.all([
    getDoc(doc(db, 'usuarios', uid)),
    getDoc(doc(db, 'grupos', grupoId)),
  ]);
  const userData = userSnap.exists() ? userSnap.data() : {};
  const grupoData = grupoSnap.exists() ? grupoSnap.data() : {};
  const nickname = userData.nickname ?? 'Corredor';

  if (grupoData.ciudadId && userData.ciudadActualId && userData.ciudadActualId !== grupoData.ciudadId) {
    throw new Error(`Este grupo es de ${grupoData.ciudadNombre}. Solo puedes unirte a grupos de tu ciudad.`);
  }
  await comprobarLimiteGrupos(uid);

  await updateDoc(doc(db, 'grupos', grupoId), {
    miembros: arrayUnion(uid),
    [`nicknames.${uid}`]: nickname,
  });

};

// Salir de un grupo (el creador no puede abandonarlo)
export const salirDeGrupo = async (grupoId) => {
  const uid = auth.currentUser.uid;
  const grupoSnap = await getDoc(doc(db, 'grupos', grupoId));
  if (!grupoSnap.exists()) throw new Error('Grupo no encontrado');
  if (grupoSnap.data().creador === uid) throw new Error('El creador no puede abandonar el grupo');
  await updateDoc(doc(db, 'grupos', grupoId), {
    miembros: arrayRemove(uid),
    [`nicknames.${uid}`]: deleteField(),
  });
};

// Regenerar el código de invitación (solo el creador)
export const regenerarCodigo = async (grupoId) => {
  const uid = auth.currentUser.uid;
  const grupoSnap = await getDoc(doc(db, 'grupos', grupoId));
  if (!grupoSnap.exists()) throw new Error('Grupo no encontrado');
  if (grupoSnap.data().creador !== uid) throw new Error('Solo el creador puede regenerar el código');
  const nuevoCodigo = generarCodigo();
  await updateDoc(doc(db, 'grupos', grupoId), { codigo: nuevoCodigo });
  return nuevoCodigo;
};

// Expulsar a un miembro (solo el creador puede hacerlo, y no puede expulsarse a sí mismo)
export const expulsarMiembro = async (grupoId, miembroUid) => {
  const uid = auth.currentUser.uid;
  const grupoSnap = await getDoc(doc(db, 'grupos', grupoId));
  if (!grupoSnap.exists()) throw new Error('Grupo no encontrado');
  if (grupoSnap.data().creador !== uid) throw new Error('Solo el creador puede expulsar miembros');
  if (miembroUid === uid) throw new Error('No puedes expulsarte a ti mismo');
  await updateDoc(doc(db, 'grupos', grupoId), {
    miembros: arrayRemove(miembroUid),
    [`nicknames.${miembroUid}`]: deleteField(),
  });
};

// Obtener mis grupos
export const obtenerMisGrupos = async () => {
  const uid = auth.currentUser.uid;
  const q = query(collection(db, 'grupos'), where('miembros', 'array-contains', uid), limit(50));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

const PAGE_SIZE = 20;

// Sin orderBy para evitar índices compuestos: filtra y ordena en cliente, pagina por offset.
export const obtenerGruposPublicos = async (ciudadId, { offset = 0 } = {}) => {
  const q = ciudadId
    ? query(collection(db, 'grupos'), where('ciudadId', '==', ciudadId), where('esPublico', '==', true))
    : query(collection(db, 'grupos'), where('esPublico', '==', true));
  const snap = await getDocs(q);
  const todos = snap.docs
    .filter(d => d.data().esPublico)
    .sort((a, b) => (b.data().puntosTotales ?? 0) - (a.data().puntosTotales ?? 0));
  const pagina = todos.slice(offset, offset + PAGE_SIZE);
  return {
    grupos: pagina.map(d => ({ id: d.id, ...d.data() })),
    hayMas: offset + PAGE_SIZE < todos.length,
  };
};
