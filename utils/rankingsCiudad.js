import { collection, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export const idRanking = (ciudadId, uid) => `${ciudadId}_${uid}`;

export const refRanking = (ciudadId, uid) =>
  doc(db, 'rankingsCiudad', idRanking(ciudadId, uid));

const esErrorIndiceFirestore = (error) => (
  error?.code === 'failed-precondition' && String(error?.message ?? '').toLowerCase().includes('index')
);

export const cargarTopRankingCiudad = async (ciudadId, segmentoCompetitivo = null) => {
  const filtros = [where('ciudadId', '==', ciudadId)];
  if (segmentoCompetitivo) filtros.push(where('segmentoCompetitivo', '==', segmentoCompetitivo));
  const snap = await getDocs(query(
    collection(db, 'rankingsCiudad'),
    ...filtros,
    orderBy('barrios', 'desc'),
    orderBy('puntos', 'desc'),
    limit(10),
  ));

  return snap.docs
    .map(d => d.data())
    .map((d, i) => ({ ...d, posicion: i + 1 }));
};

export const cargarPosicionUsuario = async (ciudadId, misBarrios, misPuntos = 0, segmentoCompetitivo = null) => {
  if (misBarrios == null) return null;
  const barrios = Number(misBarrios) || 0;
  const puntos = Number(misPuntos) || 0;
  const filtrosBase = [where('ciudadId', '==', ciudadId)];
  if (segmentoCompetitivo) filtrosBase.push(where('segmentoCompetitivo', '==', segmentoCompetitivo));

  try {
    const [conMasBarrios, empateConMasPuntos] = await Promise.all([
      getCountFromServer(query(
        collection(db, 'rankingsCiudad'),
        ...filtrosBase,
        where('barrios', '>', barrios),
      )),
      getCountFromServer(query(
        collection(db, 'rankingsCiudad'),
        ...filtrosBase,
        where('barrios', '==', barrios),
        where('puntos', '>', puntos),
      )),
    ]);
    return conMasBarrios.data().count + empateConMasPuntos.data().count + 1;
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

export const cargarMiEntradaRanking = async (ciudadId, uid, segmentoCompetitivo = null) => {
  const snap = await getDoc(refRanking(ciudadId, uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (segmentoCompetitivo && data.segmentoCompetitivo !== segmentoCompetitivo) return null;
  return data;
};
