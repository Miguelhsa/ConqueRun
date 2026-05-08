import { db, auth } from '../firebaseConfig';
import { EmailAuthProvider, reauthenticateWithCredential, deleteUser } from 'firebase/auth';
import { getStorage, ref, deleteObject } from 'firebase/storage';
import {
  addDoc, arrayRemove, arrayUnion, collection, collectionGroup,
  deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch,
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

  // 1. Reautenticar (Firebase exige sesión reciente para borrar cuenta)
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);

  const uid = user.uid;
  const batch = writeBatch(db);

  // 2. Liberar territorios conquistados
  const terSnap = await getDocs(
    query(collection(db, 'territorios'), where('dueno', '==', uid))
  );
  terSnap.docs.forEach(d => batch.update(d.ref, { dueno: null, duenoPuntos: 0 }));

  // 3. Eliminar del ranking de su ciudad
  const userSnap = await getDocs(query(collection(db, 'usuarios'), where('__name__', '==', uid)));
  const userData = userSnap.docs[0]?.data() ?? {};
  if (userData.ciudadActualId) {
    batch.delete(doc(db, 'rankings', userData.ciudadActualId, 'corredores', uid));
  }

  // 4. Salir de grupos
  const gruposSnap = await getDocs(
    query(collection(db, 'grupos'), where('miembros', 'array-contains', uid))
  );
  gruposSnap.docs.forEach(d => batch.update(d.ref, { miembros: arrayRemove(uid) }));

  // 5. Borrar marcasTerritoriales (subcollección)
  const marcasSnap = await getDocs(collection(db, 'usuarios', uid, 'marcasTerritoriales'));
  marcasSnap.docs.forEach(d => batch.delete(d.ref));

  // 6. Borrar documento de usuario
  batch.delete(doc(db, 'usuarios', uid));

  await batch.commit();

  // 7. Borrar foto de Storage (no crítico si falla)
  if (userData.fotoPerfil) {
    try {
      await deleteObject(ref(getStorage(), userData.fotoPerfil));
    } catch {}
  }

  // 8. Borrar cuenta de Firebase Auth (debe ser lo último)
  await deleteUser(user);
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
