import { db, auth } from '../firebaseConfig';
import { doc, getDoc, setDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { calcularLogrosDesbloqueados } from './logros';
import { refRanking } from './rankingsCiudad';

export const comprobarYNotificarLogros = async ({
  territorioCarrera = [],
  segmentos = null,
  ciudadId = null,
  ciudadNombre = null,
  paisCodigo = null,
} = {}) => {
  const uid = auth.currentUser.uid;

  const userRef = doc(db, 'usuarios', uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return [];

  const data = userSnap.data();

  // Stats desnormalizados — racha ya actualizada en el batch del save de carrera
  const totalKm = data.distanciaTotal ?? 0;
  const totalBarrios = data.barriosConquistadosTotal ?? 0;
  const racha = data.racha ?? 0;
  const logrosAnteriores = data.logros ?? [];
  const desbloqueadosPrevios = new Set(logrosAnteriores);

  const desbloqueados = calcularLogrosDesbloqueados(totalKm, totalBarrios, racha);
  const nuevos = desbloqueados.filter(l => !desbloqueadosPrevios.has(l.id));

  if (nuevos.length > 0) {
    const bonusTotal = nuevos.reduce((sum, l) => sum + l.bonus, 0);

    const ciudadRankingId = ciudadId ?? data.ciudadActualId ?? null;
    const topLogros = desbloqueados.map(l => l.id).slice(0, 3);
    const territorioRefuerzo = [...territorioCarrera]
      .filter(t => t?.barrioId && t?.puntos > 0)
      .sort((a, b) => (b.puntos ?? 0) - (a.puntos ?? 0))[0] ?? null;
    const topBarrioId = territorioRefuerzo?.barrioId ?? null;
    const topColeccion = territorioRefuerzo?.coleccion ?? null;
    const topSegmento = segmentos?.segmentoCompetitivo ?? data.segmentoCompetitivo ?? null;
    const topMarcaId = topBarrioId && topSegmento ? `${topBarrioId}_${topSegmento}` : null;

    await setDoc(userRef, {
      logros: desbloqueados.map(l => l.id),
      racha,
      puntosTotales: increment(bonusTotal),
      actualizadoEn: serverTimestamp(),
    }, { merge: true });

    if (ciudadRankingId) {
      await setDoc(refRanking(ciudadRankingId, uid), {
        ciudadId: ciudadRankingId,
        uid,
        puntos: increment(bonusTotal),
        topLogros,
        actualizadoEn: serverTimestamp(),
      }, { merge: true });
    }

    if (topMarcaId && topColeccion) {
      const marcaRef = doc(db, 'usuarios', uid, 'marcasTerritoriales', topMarcaId);
      const marcaSnap = await getDoc(marcaRef);
      const puntosAntesBonus = marcaSnap.exists() ? (marcaSnap.data().puntos ?? 0) : 0;
      const puntosDespuesBonus = puntosAntesBonus + bonusTotal;

      await setDoc(marcaRef, {
        territorioId: topBarrioId,
        puntos: increment(bonusTotal),
        coleccion: topColeccion,
        ciudadId: ciudadRankingId,
        segmentoCompetitivo: topSegmento,
        actualizadoEn: serverTimestamp(),
      }, { merge: true });

      const segmentoRef = doc(db, topColeccion, topBarrioId, 'segmentos', topSegmento);
      const barrioSnap = await getDoc(segmentoRef);
      const barrioData = barrioSnap.exists() ? barrioSnap.data() : {};
      const duenoActual = barrioData.dueno ?? null;
      const puntosDuenoActual = barrioData.duenoPuntos ?? 0;
      const top10 = barrioData.top10 ?? [];
      const nuevoTop10 = [...top10.filter(e => e.uid !== uid), { uid, puntos: puntosDespuesBonus }]
        .sort((a, b) => b.puntos - a.puntos)
        .slice(0, 10);
      const conquistaConBonus = duenoActual !== uid && puntosDespuesBonus > puntosDuenoActual;

      await setDoc(segmentoRef, {
        territorioId: topBarrioId,
        ciudadId: ciudadRankingId,
        ciudadNombre: ciudadNombre ?? data.ciudadActualNombre ?? null,
        paisCodigo: paisCodigo ?? data.paisCodigo ?? null,
        segmentoRitmo: segmentos?.segmentoRitmo ?? data.segmentoRitmo ?? null,
        segmentoGenero: segmentos?.segmentoGenero ?? data.segmentoGenero ?? null,
        segmentoEdad: segmentos?.segmentoEdad ?? data.segmentoEdad ?? null,
        segmentoCompetitivo: topSegmento,
        segmentoEtiqueta: segmentos?.segmentoEtiqueta ?? data.segmentoEtiqueta ?? null,
        top10: nuevoTop10,
        ...(duenoActual === uid
          ? { duenoPuntos: increment(bonusTotal) }
          : conquistaConBonus
            ? { dueno: uid, duenoPuntos: puntosDespuesBonus, conquistadoEn: serverTimestamp() }
            : {}),
        actualizadoEn: serverTimestamp(),
      }, { merge: true });

      if (conquistaConBonus) {
        await setDoc(userRef, {
          barriosConquistadosTotal: increment(1),
          actualizadoEn: serverTimestamp(),
        }, { merge: true });
        if (ciudadRankingId) {
          await setDoc(refRanking(ciudadRankingId, uid), {
            ciudadId: ciudadRankingId,
            uid,
            barrios: increment(1),
            actualizadoEn: serverTimestamp(),
          }, { merge: true });
        }
      }
    }
  }

  return nuevos;
};
