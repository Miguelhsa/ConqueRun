import { collection, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export const idRanking = (ciudadId, uid) => `${ciudadId}_${uid}`;

export const refRanking = (ciudadId, uid) =>
  doc(db, 'rankingsCiudad', idRanking(ciudadId, uid));

const esErrorIndiceFirestore = (error) => (
  error?.code === 'failed-precondition' && String(error?.message ?? '').toLowerCase().includes('index')
);

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
  const filtros = [where('ciudadId', '==', ciudadId), where('puntos', '>', misPuntos)];
  if (segmentoCompetitivo) filtros.push(where('segmentoCompetitivo', '==', segmentoCompetitivo));
  try {
    const snap = await getCountFromServer(query(collection(db, 'rankingsCiudad'), ...filtros));
    return snap.data().count + 1;
  } catch (error) {
    if (esErrorIndiceFirestore(error)) {
      console.warn('[rankingsCiudad] Índice de posición todavía no disponible:', error.message);
      return null;
    }
    throw error;
  }
};

export const cargarTotalCorredoresCiudad = async (ciudadId, segmentoCompetitivo = null) => {
  const filtros = [where('ciudadId', '==', ciudadId)];
  if (segmentoCompetitivo) filtros.push(where('segmentoCompetitivo', '==', segmentoCompetitivo));
  const snap = await getCountFromServer(query(collection(db, 'rankingsCiudad'), ...filtros));
  return snap.data().count;
};

export const cargarMiEntradaRanking = async (ciudadId, uid) => {
  const snap = await getDoc(refRanking(ciudadId, uid));
  return snap.exists() ? snap.data() : null;
};
