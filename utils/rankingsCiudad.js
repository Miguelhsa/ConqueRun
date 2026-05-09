import { collection, doc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export const idRanking = (ciudadId, uid) => `${ciudadId}_${uid}`;

export const refRanking = (ciudadId, uid) =>
  doc(db, 'rankingsCiudad', idRanking(ciudadId, uid));

const contarBarriosPorUid = async (uids, segmentoCompetitivo = null) => {
  if (!uids.length) return {};
  if (segmentoCompetitivo) {
    return {};
  }

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

export const cargarTopRankingCiudad = async (ciudadId, segmentoCompetitivo = null) => {
  const filtros = [where('ciudadId', '==', ciudadId)];
  if (segmentoCompetitivo) filtros.push(where('segmentoCompetitivo', '==', segmentoCompetitivo));
  const snap = await getDocs(query(
    collection(db, 'rankingsCiudad'),
    ...filtros,
    orderBy('puntos', 'desc'),
    limit(10),
  ));
  const top10 = snap.docs
    .map(d => d.data())
    .sort((a, b) => (b.puntos ?? 0) - (a.puntos ?? 0));

  const uids = top10.map(d => d.uid).filter(Boolean);
  const barrioPorUid = await contarBarriosPorUid(uids, segmentoCompetitivo);

  return top10.map((d, i) => ({
    ...d,
    barrios: segmentoCompetitivo ? (d.barrios ?? 0) : (barrioPorUid[d.uid] ?? 0),
    posicion: i + 1,
  }));
};

export const cargarPosicionUsuario = async (ciudadId, misPuntos, segmentoCompetitivo = null) => {
  if (!misPuntos || misPuntos <= 0) return null;
  const filtros = [where('ciudadId', '==', ciudadId)];
  if (segmentoCompetitivo) filtros.push(where('segmentoCompetitivo', '==', segmentoCompetitivo));
  const snap = await getDocs(query(collection(db, 'rankingsCiudad'), ...filtros));
  const mayorPuntos = snap.docs.filter(d => (d.data().puntos ?? 0) > misPuntos).length;
  return mayorPuntos + 1;
};

export const cargarTotalCorredoresCiudad = async (ciudadId, segmentoCompetitivo = null) => {
  const filtros = [where('ciudadId', '==', ciudadId)];
  if (segmentoCompetitivo) filtros.push(where('segmentoCompetitivo', '==', segmentoCompetitivo));
  const snap = await getDocs(query(collection(db, 'rankingsCiudad'), ...filtros));
  return snap.size;
};

export const cargarMiEntradaRanking = async (ciudadId, uid, segmentoCompetitivo = null) => {
  const filtros = [
    where('ciudadId', '==', ciudadId),
    where('uid', '==', uid),
  ];
  if (segmentoCompetitivo) filtros.push(where('segmentoCompetitivo', '==', segmentoCompetitivo));
  const snap = await getDocs(
    query(
      collection(db, 'rankingsCiudad'),
      ...filtros,
    )
  );
  if (snap.empty) return null;
  return snap.docs[0].data();
};
