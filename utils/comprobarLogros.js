import { db, auth } from '../firebaseConfig';
import { doc, getDoc, setDoc, updateDoc, increment, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { calcularLogrosDesbloqueados } from './logros';

export const comprobarYNotificarLogros = async () => {
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

    // Buscar el barrio con más marcas en la subcolección para aplicar el bonus
    const ciudadId = data.ciudadActualId ?? null;
    const marcasSnap = ciudadId
      ? await getDocs(query(collection(db, 'usuarios', uid, 'marcasTerritoriales'), where('ciudadId', '==', ciudadId)))
      : null;
    const marcasDocs = marcasSnap?.docs ?? [];
    const topDoc = marcasDocs.sort((a, b) => (b.data().puntos ?? 0) - (a.data().puntos ?? 0))[0];
    const topBarrioId = topDoc?.id ?? null;
    const topColeccion = topDoc ? (topDoc.data().coleccion ?? 'barrios') : null;

    await setDoc(userRef, {
      logros: desbloqueados.map(l => l.id),
      racha,
      puntosTotales: increment(bonusTotal),
    }, { merge: true });

    if (topBarrioId) {
      await updateDoc(doc(db, 'usuarios', uid, 'marcasTerritoriales', topBarrioId), {
        puntos: increment(bonusTotal),
        actualizadoEn: serverTimestamp(),
      });
    }

    if (topBarrioId && topColeccion) {
      const barrioSnap = await getDoc(doc(db, topColeccion, topBarrioId));
      if (barrioSnap.exists() && barrioSnap.data().dueno === uid) {
        await updateDoc(doc(db, topColeccion, topBarrioId), {
          duenoPuntos: increment(bonusTotal),
        });
      }
    }
  }

  return nuevos;
};
