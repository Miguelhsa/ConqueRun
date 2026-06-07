import { db, auth } from '../firebaseConfig';
import { signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  arrayUnion, doc, getDoc, serverTimestamp, setDoc,
} from 'firebase/firestore';

export const FOTO_ESTADOS = {
  PENDIENTE: 'pendiente',
  APROBADA: 'aprobada',
  RECHAZADA: 'rechazada',
};

export const fotoAprobada = (url, estado) => {
  return Boolean(url && estado !== FOTO_ESTADOS.RECHAZADA);
};

export const crearReporte = async ({ tipo, recursoId, motivo }) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const id = `${uid}_${recursoId}`;
  const reporteRef = doc(db, 'reportes', id);
  const snap = await getDoc(reporteRef);
  if (snap.exists()) return; // Ya reportado — evita duplicar notificación al admin

  await setDoc(reporteRef, {
    tipo,
    recursoId,
    motivo,
    reportadoPor: uid,
    estado: 'pendiente',
    creadoEn: serverTimestamp(),
  });
};

export const bloquearUsuario = async (uidBloqueado) => {
  const uid = auth.currentUser?.uid;
  if (!uid || !uidBloqueado || uid === uidBloqueado) return;

  const snap = await getDoc(doc(db, 'usuarios', uid));
  const bloqueados = snap.exists() ? (snap.data().usuariosBloqueados ?? []) : [];
  if (bloqueados.includes(uidBloqueado)) return;

  await setDoc(doc(db, 'usuarios', uid), {
    usuariosBloqueados: arrayUnion(uidBloqueado),
  }, { merge: true });
};

export const eliminarCuentaCompleta = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error('no_session');

  const eliminarCuenta = httpsCallable(getFunctions(), 'eliminarCuenta');
  await eliminarCuenta();
  await signOut(auth).catch(() => {});
};

const PALABRAS_PROHIBIDAS = [
  'puta',
  'puto',
  'mierda',
  'joder',
  'cabron',
  'maricon',
  'nazi',
  'porno',
  'xxx',
];

const normalizarParaFiltro = (texto) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // leet speak: dígitos usados como sustitutos de letras
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/5/g, 's').replace(/8/g, 'b')
    // eliminar separadores no alfanuméricos (pu.ta → puta, pu-ta → puta)
    .replace(/[^a-z0-9\s]/g, '');

export const contieneTextoProhibido = (texto = '') =>
  PALABRAS_PROHIBIDAS.some(palabra => normalizarParaFiltro(texto).includes(normalizarParaFiltro(palabra)));
