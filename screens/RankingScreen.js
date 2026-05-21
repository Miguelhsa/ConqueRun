import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Image, TouchableOpacity, Alert, ImageBackground } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { PantallaCargando, EstadoVacio } from '../components/ui';
import { db, auth } from '../firebaseConfig';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { LOGROS } from '../utils/logros';
import { bloquearUsuario, crearReporte, fotoAprobada } from '../utils/moderacion';
import { CIUDAD_FALLBACK } from '../utils/ciudades';
import { repararConsistenciaUsuario } from '../utils/consistencia';
import { cargarTopRankingCiudad, cargarPosicionUsuario, cargarTotalCorredoresCiudad, cargarMiEntradaRanking } from '../utils/rankingsCiudad';
import { colors, radius } from '../utils/theme';

export default function RankingScreen() {
  const [rankingCiudad, setRankingCiudad] = useState([]);
  const [rankingGrupos, setRankingGrupos] = useState([]);
  const [ciudad, setCiudad] = useState(CIUDAD_FALLBACK);
  const [miResumen, setMiResumen] = useState(null);
  const [miSegmentoCompetitivo, setMiSegmentoCompetitivo] = useState(null);
  const [miSegmentoEtiqueta, setMiSegmentoEtiqueta] = useState(null);
  const [miPosicion, setMiPosicion] = useState(null);
  const [miPosicionFueroTop, setMiPosicionFueraTop] = useState(false);
  const [totalCorredores, setTotalCorredores] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState('individual');
  const [bloqueados, setBloqueados] = useState([]);

  useFocusEffect(useCallback(() => {
    cargarInicial();
  }, []));

  useEffect(() => {
    if (!cargando) cargarRankingCiudad(ciudad);
  }, [ciudad]);

  const cargarInicial = async () => {
    try {
      const { ciudad: ciudadUsuario, segmentoCompetitivo, bloqueados: listaBloqueados } = await cargarCiudadUsuario();
      const uid = auth.currentUser?.uid;
      if (uid && ciudadUsuario.id && segmentoCompetitivo) {
        await repararConsistenciaUsuario({
          clave: `${uid}_${ciudadUsuario.id}_${segmentoCompetitivo}`,
        }).catch(e => console.warn('[RankingScreen] No se pudo reparar consistencia:', e));
      }
      await Promise.all([
        cargarRankingCiudad(ciudadUsuario, segmentoCompetitivo, listaBloqueados),
        cargarMiResumen(ciudadUsuario.id, segmentoCompetitivo),
        cargarGrupos(ciudadUsuario.id),
      ]);
    } finally {
      setCargando(false);
    }
  };

  const cargarCiudadUsuario = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return { ciudad: CIUDAD_FALLBACK, segmentoCompetitivo: null };
    const snap = await getDoc(doc(db, 'usuarios', uid));
    const data = snap.exists() ? snap.data() : {};
    const c = {
      ...CIUDAD_FALLBACK,
      id: data.ciudadActualId ?? CIUDAD_FALLBACK.id,
      nombre: data.ciudadActualNombre ?? CIUDAD_FALLBACK.nombre,
    };
    const segmentoCompetitivo = data.segmentoCompetitivo ?? null;
    setMiSegmentoCompetitivo(segmentoCompetitivo);
    setMiSegmentoEtiqueta(data.segmentoEtiqueta ?? null);
    setBloqueados(data.usuariosBloqueados ?? []);
    setCiudad(c);
    return { ciudad: c, segmentoCompetitivo, bloqueados: data.usuariosBloqueados ?? [] };
  };

  const cargarMiResumen = async (ciudadId, segmentoCompetitivo) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const [snap, miEntrada] = await Promise.all([
      getDoc(doc(db, 'usuarios', uid)),
      ciudadId ? cargarMiEntradaRanking(ciudadId, uid, segmentoCompetitivo) : Promise.resolve(null),
    ]);
    if (!snap.exists()) return;
    const data = snap.data();
    const sinEntradaEnSegmento = !miEntrada && segmentoCompetitivo;
    setMiResumen({
      barrios: sinEntradaEnSegmento ? 0 : (miEntrada?.barrios ?? data.barriosConquistadosTotal ?? 0),
      puntos: sinEntradaEnSegmento ? 0 : (miEntrada?.puntos ?? data.puntosTotales ?? 0),
      nickname: data.nickname ?? 'Tú',
      fotoPerfil: data.fotoPerfil ?? null,
      fotoPerfilEstado: data.fotoPerfilEstado ?? null,
      segmentoEtiqueta: data.segmentoEtiqueta ?? null,
    });
  };

  const cargarRankingCiudad = async (c, segmentoCompetitivo = miSegmentoCompetitivo, listaBloqueados = bloqueados) => {
    const uid = auth.currentUser?.uid;

    const [lista, miEntrada, total] = await Promise.all([
      cargarTopRankingCiudad(c.id, segmentoCompetitivo),
      uid ? cargarMiEntradaRanking(c.id, uid, segmentoCompetitivo) : Promise.resolve(null),
      cargarTotalCorredoresCiudad(c.id, segmentoCompetitivo),
    ]);

    const listaFiltrada = listaBloqueados.length > 0
      ? lista.filter(item => !listaBloqueados.includes(item.uid))
      : lista;
    setRankingCiudad(listaFiltrada);
    setTotalCorredores(total);

    const estaEnTop = lista.some(item => item.uid === uid);

    if (uid && miEntrada) {
      const posicion = estaEnTop
        ? lista.find(item => item.uid === uid)?.posicion ?? null
        : await cargarPosicionUsuario(c.id, miEntrada.barrios ?? 0, miEntrada.puntos ?? 0, segmentoCompetitivo);
      setMiPosicion(posicion);
      setMiPosicionFueraTop(!estaEnTop);
    } else {
      setMiPosicion(null);
      setMiPosicionFueraTop(false);
    }
  };

  const cargarGrupos = async (ciudadId) => {
    const q = ciudadId
      ? query(collection(db, 'grupos'), where('ciudadId', '==', ciudadId), where('esPublico', '==', true), limit(200))
      : query(collection(db, 'grupos'), where('esPublico', '==', true), limit(200));
    const snap = await getDocs(q);
    const lista = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.puntosTotales ?? 0) - (a.puntosTotales ?? 0))
      .slice(0, 10)
      .map((g, i) => ({ ...g, posicion: i + 1 }));
    setRankingGrupos(lista);
  };

  const medalla = (pos) => {
    if (pos === 1) return '🥇';
    if (pos === 2) return '🥈';
    if (pos === 3) return '🥉';
    return `${pos}`;
  };

  const esmiGrupo = (grupo) => grupo.miembros?.includes(auth.currentUser?.uid);

  const renderIndividual = ({ item }) => {
    const esTuyo = item.uid === auth.currentUser?.uid;
    const reportarUsuario = () => {
      Alert.alert('Reportar usuario', '¿Quieres reportar este perfil?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reportar', style: 'destructive',
          onPress: () => crearReporte({ tipo: 'usuario', recursoId: item.uid, motivo: 'contenido_inapropiado' })
            .then(() => Alert.alert('Reporte enviado', 'Revisaremos este perfil cuanto antes'))
            .catch(() => Alert.alert('Error', 'No se pudo enviar el reporte')),
        },
      ]);
    };
    const bloquear = () => {
      Alert.alert('Bloquear usuario', '¿Seguro que quieres bloquear a este corredor?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear', style: 'destructive',
          onPress: () => bloquearUsuario(item.uid)
            .then(() => {
              setBloqueados(prev => [...prev, item.uid]);
              setRankingCiudad(prev => prev.filter(u => u.uid !== item.uid));
              Alert.alert('Usuario bloqueado', 'Ya no verás a este corredor en el ranking.');
            })
            .catch(() => Alert.alert('Error', 'No se pudo bloquear el usuario')),
        },
      ]);
    };

    return (
      <TouchableOpacity
        style={[styles.fila, esTuyo && styles.filaTuya]}
        onLongPress={esTuyo ? undefined : () => Alert.alert(item.nickname, '', [
          { text: 'Reportar', onPress: reportarUsuario },
          { text: 'Bloquear', style: 'destructive', onPress: bloquear },
          { text: 'Cancelar', style: 'cancel' },
        ])}
      >
        <Text style={styles.posicion}>{medalla(item.posicion)}</Text>
        <View style={styles.avatarWrapper}>
          {fotoAprobada(item.fotoPerfil, item.fotoPerfilEstado) ? (
            <Image source={{ uri: item.fotoPerfil }} style={styles.avatarFoto} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarTexto}>{item.nickname?.[0]?.toUpperCase()}</Text>
            </View>
          )}
          {item.pais?.bandera && (
            <Text style={styles.bandera}>{item.pais.bandera}</Text>
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.nombre}>{item.nickname}{esTuyo ? ' (tú)' : ''}</Text>
          <Text style={styles.detalle}>
            {item.carreras} carreras · {((item.totalMetros ?? item.totalKm ?? 0) / 1000).toFixed(1)} km
          </Text>
          <View style={styles.barriosRow}>
            <Text style={styles.barriosBadge}>🚩 {item.barrios} barrio{item.barrios !== 1 ? 's' : ''}</Text>
            {item.stravaVerificadas > 0 && (
              <Text style={styles.stravaBadge}>Strava {item.stravaVerificadas}</Text>
            )}
            {item.topLogros?.length > 0 && (
              <Text style={styles.logrosEmojis}>
                {item.topLogros.map(id => LOGROS.find(l => l.id === id)?.emoji).join(' ')}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.puntosBox}>
          <Text style={styles.puntos}>{item.puntos.toLocaleString()}</Text>
          <Text style={styles.puntosLabel}>pts</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderGrupo = ({ item }) => {
    const mio = esmiGrupo(item);
    const tieneFoto = fotoAprobada(item.foto, item.fotoEstado);
    return (
      <View style={[styles.fila, mio && styles.filaTuya]}>
        <Text style={[styles.posicion, item.posicion <= 3 && styles.posicionMedalla]}>{medalla(item.posicion)}</Text>
        <View style={styles.grupoIcono}>
          {tieneFoto ? (
            <Image source={{ uri: item.foto }} style={styles.grupoFoto} />
          ) : (
            <Text style={styles.grupoIconoTexto}>{item.nombre?.[0]?.toUpperCase() ?? '👥'}</Text>
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.nombre}>{item.nombre}{mio ? ' (tuyo)' : ''}</Text>
          <Text style={styles.detalle}>
            {item.miembros?.length ?? 0} miembros · {((item.distanciaTotal ?? 0) / 1000).toFixed(0)} km
            {item.duracionTotal && item.distanciaTotal
              ? ` · ${Math.floor(item.duracionTotal / (item.distanciaTotal / 1000) / 60)}:${String(Math.round(item.duracionTotal / (item.distanciaTotal / 1000) % 60)).padStart(2, '0')} min/km`
              : ''}
          </Text>
          <View style={styles.barriosRow}>
            <Text style={styles.barriosBadge}>🚩 {item.barriosConquistados ?? 0} barrio{(item.barriosConquistados ?? 0) !== 1 ? 's' : ''}</Text>
          </View>
        </View>
        <View style={styles.puntosBox}>
          <Text style={styles.puntos}>{(item.puntosTotales ?? 0).toLocaleString()}</Text>
          <Text style={styles.puntosLabel}>pts</Text>
        </View>
      </View>
    );
  };

  if (cargando) return <PantallaCargando />;

  return (
    <ImageBackground
      source={require('../assets/login-map-flag-centered.jpg')}
      style={styles.container}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'individual' && styles.tabActivo]}
          onPress={() => setTab('individual')}
        >
          <Text style={[styles.tabTexto, tab === 'individual' && styles.tabTextoActivo]}>Individual</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'grupos' && styles.tabActivo]}
          onPress={() => setTab('grupos')}
        >
          <Text style={[styles.tabTexto, tab === 'grupos' && styles.tabTextoActivo]}>Grupos</Text>
        </TouchableOpacity>
      </View>

      {tab === 'individual' ? (
        <FlatList
          data={rankingCiudad}
          keyExtractor={item => item.uid}
          renderItem={renderIndividual}
          ListHeaderComponent={
            <>
              {/* Mi resumen */}
              {miResumen && (
                <View style={styles.miResumen}>
                  <View style={styles.miResumenFila}>
                    <View style={styles.avatar}>
                      {fotoAprobada(miResumen.fotoPerfil, miResumen.fotoPerfilEstado) ? (
                        <Image source={{ uri: miResumen.fotoPerfil }} style={styles.avatarFoto} />
                      ) : (
                        <Text style={styles.avatarTexto}>{miResumen.nickname?.[0]?.toUpperCase()}</Text>
                      )}
                    </View>
                    <View style={styles.miResumenInfo}>
                      <Text style={styles.miResumenNombre}>{miResumen.nickname}</Text>
                      <Text style={styles.miResumenSub}>
                        {miPosicion ? `#${miPosicion} en ${ciudad.nombre}` : 'Sin carreras en esta ciudad'}
                      </Text>
                      {miResumen.segmentoEtiqueta && (
                        <Text style={styles.miResumenSegmento}>{miResumen.segmentoEtiqueta}</Text>
                      )}
                    </View>
                    <View style={styles.miResumenBarrios}>
                      <Text style={styles.miResumenBarriosNum}>{miResumen.barrios}</Text>
                      <Text style={styles.miResumenBarriosLabel}>🚩 barrios</Text>
                    </View>
                  </View>
                </View>
              )}

              <View style={styles.headerBox}>
                <Text style={styles.titulo}>Top 10 {ciudad.nombre}</Text>
                <Text style={styles.subtitulo}>
                  {miSegmentoEtiqueta ? `Tu liga: ${miSegmentoEtiqueta}` : 'Tu liga competitiva'}
                </Text>
              </View>
            </>
          }
          ListFooterComponent={
            miPosicionFueroTop ? (
              <View style={styles.miPosicionFooter}>
                <View style={styles.separadorPosicion}>
                  <View style={styles.separadorLinea} />
                  <Text style={styles.separadorTexto}>Tu posición</Text>
                  <View style={styles.separadorLinea} />
                </View>
                <View style={styles.miPosicionCard}>
                  <Text style={styles.miPosicionNum}>{miPosicion}</Text>
                  <Text style={styles.miPosicionSub}>de {totalCorredores} corredores en {ciudad.nombre}</Text>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={<EstadoVacio titulo={`Aún no hay carreras en ${ciudad.nombre}`} />}
          contentContainerStyle={styles.lista}
        />
      ) : (
        <FlatList
          data={rankingGrupos}
          keyExtractor={item => item.id}
          renderItem={renderGrupo}
          ListHeaderComponent={
            <View style={styles.headerBox}>
              <Text style={styles.titulo}>Top 10 Grupos · {ciudad.nombre}</Text>
              <Text style={styles.subtitulo}>Puntos acumulados por el grupo</Text>
            </View>
          }
          ListEmptyComponent={<EstadoVacio titulo="Aún no hay grupos con puntos" subtitulo="Crea uno o únete para competir." />}
          contentContainerStyle={styles.lista}
        />
      )}

    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3,7,18,0.78)' },
  lista: { padding: 16 },

  tabs: { flexDirection: 'row', backgroundColor: colors.surface, padding: 4, margin: 16, borderRadius: radius.lg },
  tab: { flex: 1, padding: 10, alignItems: 'center', borderRadius: radius.sm },
  tabActivo: { backgroundColor: colors.gold },
  tabTexto: { color: colors.muted, fontSize: 13, fontWeight: 'bold' },
  tabTextoActivo: { color: colors.bg },

  miResumen: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 12,
    borderColor: colors.gold,
    borderWidth: 1,
  },
  miResumenFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  miResumenInfo: { flex: 1 },
  miResumenNombre: { color: colors.text, fontSize: 15, fontWeight: 'bold' },
  miResumenSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  miResumenSegmento: { color: colors.gold, fontSize: 11, fontWeight: '800', marginTop: 4 },
  miResumenBarrios: { alignItems: 'center' },
  miResumenBarriosNum: { color: colors.gold, fontSize: 22, fontWeight: 'bold' },
  miResumenBarriosLabel: { color: colors.muted, fontSize: 11 },

  headerBox: { alignItems: 'center', marginBottom: 20 },
  titulo: { fontSize: 22, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  subtitulo: { fontSize: 12, color: colors.subdued },

  fila: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: 12, marginBottom: 10, gap: 10,
  },
  filaTuya: { borderColor: colors.gold, borderWidth: 1 },
  posicion: { fontSize: 18, width: 40, textAlign: 'center', color: colors.gold, fontWeight: 'bold' },
  posicionMedalla: { fontSize: 30 },
  avatarWrapper: { position: 'relative', width: 46, height: 52 },
  avatarFoto: { width: 46, height: 46, borderRadius: 23 },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center',
  },
  avatarTexto: { fontSize: 20, fontWeight: 'bold', color: colors.bg },
  bandera: { fontSize: 14, position: 'absolute', bottom: 0, right: -4 },
  grupoIcono: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  grupoFoto: { width: 46, height: 46, borderRadius: 23 },
  grupoIconoTexto: { fontSize: 20, fontWeight: 'bold', color: colors.bg },
  info: { flex: 1 },
  nombre: { fontSize: 15, fontWeight: 'bold', color: colors.text, marginBottom: 2 },
  detalle: { fontSize: 12, color: colors.muted },
  grupoCiudad: { fontSize: 11, color: colors.subdued, marginTop: 2 },
  puntosBox: { alignItems: 'flex-end' },
  puntos: { fontSize: 14, fontWeight: 'bold', color: colors.gold },
  puntosLabel: { fontSize: 11, color: colors.muted },
  barriosRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  barriosBadge: {
    fontSize: 11, color: colors.conquest, backgroundColor: '#e6394620',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  stravaBadge: {
    fontSize: 11, color: colors.strava, backgroundColor: '#fc520020',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  logrosEmojis: { fontSize: 14 },

  miPosicionFooter: { marginTop: 8 },
  separadorPosicion: { flexDirection: 'row', alignItems: 'center', marginVertical: 12, gap: 10 },
  separadorLinea: { flex: 1, height: 1, backgroundColor: colors.border },
  separadorTexto: { color: colors.subdued, fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' },
  miPosicionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    alignItems: 'center',
    borderColor: colors.gold,
    borderWidth: 1,
  },
  miPosicionNum: { fontSize: 32, fontWeight: 'bold', color: colors.gold },
  miPosicionSub: { fontSize: 12, color: colors.muted, marginTop: 4 },

});
