import { collection, doc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export const idRanking = (ciudadId, uid) => `${ciudadId}_${uid}`;

export const refRanking = (ciudadId, uid) =>
  doc(db, 'rankingsCiudad', idRanking(ciudadId, uid));

const contarBarriosPorUid = async (uids) => {
  if (!uids.length) return {};
  const [snapTerritorios, snapBarrios] = await Promise.all([
    getDocs(query(collection(db, 'territorios'), where('dueno', 'in', uids))),
    getDocs(query(collection(db, 'barrios'), where('dueno', 'in', uids))),
  ]);
  const conteo = {};
  [...snapTerritorios.docs, ...snapBarrios.docs].forEach(d => {
    const dueno = d.data().dueno;
    conteo[dueno] = (conteo[dueno] ?? 0) + 1;
  });
  return conteo;
};

export const cargarTopRankingCiudad = async (ciudadId) => {
  const snap = await getDocs(
    query(collection(db, 'rankingsCiudad'), where('ciudadId', '==', ciudadId))
  );
  const top10 = snap.docs
    .map(d => d.data())
    .sort((a, b) => (b.puntos ?? 0) - (a.puntos ?? 0))
    .slice(0, 10);

  const uids = top10.map(d => d.uid).filter(Boolean);
  const barrioPorUid = await contarBarriosPorUid(uids);

  return top10.map((d, i) => ({
    ...d,
    barrios: barrioPorUid[d.uid] ?? 0,
    posicion: i + 1,
  }));
};

export const cargarPosicionUsuario = async (ciudadId, misPuntos) => {
  if (!misPuntos || misPuntos <= 0) return null;
  const snap = await getDocs(
    query(collection(db, 'rankingsCiudad'), where('ciudadId', '==', ciudadId))
  );
  const mayorPuntos = snap.docs.filter(d => (d.data().puntos ?? 0) > misPuntos).length;
  return mayorPuntos + 1;
};

export const cargarTotalCorredoresCiudad = async (ciudadId) => {
  const snap = await getDocs(
    query(collection(db, 'rankingsCiudad'), where('ciudadId', '==', ciudadId))
  );
  return snap.size;
};

export const cargarMiEntradaRanking = async (ciudadId, uid) => {
  const snap = await getDocs(
    query(
      collection(db, 'rankingsCiudad'),
      where('ciudadId', '==', ciudadId),
      where('uid', '==', uid),
    )
  );
  if (snap.empty) return null;
  return snap.docs[0].data();
};
