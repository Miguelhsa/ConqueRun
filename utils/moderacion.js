import { db, auth } from '../firebaseConfig';
import { EmailAuthProvider, reauthenticateWithCredential, signOut } from 'firebase/auth';
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
  return Boolean(url && estado === FOTO_ESTADOS.APROBADA);
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

  await setDoc(doc(db, 'usuarios', uid), {
    usuariosBloqueados: arrayUnion(uidBloqueado),
  }, { merge: true });
};

export const eliminarCuentaCompleta = async (password) => {
  const user = auth.currentUser;
  if (!user) throw new Error('no_session');

  // Firebase exige sesión reciente; la limpieza real necesita privilegios admin.
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);

  const eliminarCuenta = httpsCallable(getFunctions(), 'eliminarCuenta');
  await eliminarCuenta();
  await signOut(auth).catch(() => {});
};

const PALABRAS_PROHIBIDAS = [
  'puta',
  'puto',
  'mierda',
  'joder',
  'cabrón',
  'cabron',
  'maricón',
  'maricon',
  'nazi',
  'porno',
  'xxx',
];

export const contieneTextoProhibido = (texto = '') => {
  const normalizado = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return PALABRAS_PROHIBIDAS.some(palabra => normalizado.includes(
    palabra.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  ));
};
