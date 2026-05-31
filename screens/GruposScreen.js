import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, Modal, Image, Share, ImageBackground
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { auth, db } from '../firebaseConfig';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import {
  crearGrupo, generarRefGrupo, unirseACodigo, unirseAGrupo, salirDeGrupo, expulsarMiembro, regenerarCodigo,
  obtenerMisGrupos, obtenerGruposPublicos
} from '../utils/grupos';
import { FOTO_ESTADOS, contieneTextoProhibido, crearReporte, fotoAprobada } from '../utils/moderacion';
import { colors, radius } from '../utils/theme';
import { EstadoError, EstadoVacio, PantallaCargando } from '../components/ui';

export default function GruposScreen() {
  const [misGrupos, setMisGrupos] = useState([]);
  const [gruposPublicos, setGruposPublicos] = useState([]);
  const [offsetPublicos, setOffsetPublicos] = useState(0);
  const [hayMasPublicos, setHayMasPublicos] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const cargandoMasRef = useRef(false);
  const [ciudadActualId, setCiudadActualId] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorRed, setErrorRed] = useState(false);
  const [tab, setTab] = useState('mis');
  const [modalCodigo, setModalCodigo] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [nuevoGrupo, setNuevoGrupo] = useState({ nombre: '', descripcion: '', esPublico: true, foto: null });
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    setErrorRed(false);
    try {
      const uid = auth.currentUser?.uid;
      const userSnap = await getDoc(doc(db, 'usuarios', uid));
      const ciudad = userSnap.exists() ? userSnap.data().ciudadActualId : null;
      setCiudadActualId(ciudad);

      const [mios, resultPublicos] = await Promise.all([
        obtenerMisGrupos(),
        obtenerGruposPublicos(ciudad),
      ]);
      const { grupos: publicos, hayMas } = resultPublicos;

      // Calcular posición de cada grupo en su ciudad (una query por ciudad)
      const ciudadesUnicas = [...new Set(mios.filter(g => g.ciudadId).map(g => g.ciudadId))];
      const rankingsPorCiudad = {};
      try {
        await Promise.all(ciudadesUnicas.map(async cid => {
          const snap = await getDocs(query(
            collection(db, 'grupos'),
            where('ciudadId', '==', cid),
            limit(100)
          ));
          rankingsPorCiudad[cid] = snap.docs
            .map(d => ({ id: d.id, pts: d.data().puntosTotales ?? 0 }))
            .sort((a, b) => b.pts - a.pts)
            .map(d => d.id);
        }));
      } catch (e) {
        console.warn('[GruposScreen] posición no disponible:', e?.message);
      }
      const miosConPosicion = mios.map(grupo => {
        if (!grupo.ciudadId || !rankingsPorCiudad[grupo.ciudadId]) return { ...grupo, posicion: null };
        const pos = rankingsPorCiudad[grupo.ciudadId].indexOf(grupo.id) + 1;
        return { ...grupo, posicion: pos || null };
      });

      setMisGrupos(miosConPosicion);
      setGruposPublicos(publicos.filter(g => !mios.find(m => m.id === g.id)));
      setOffsetPublicos(publicos.length);
      setHayMasPublicos(hayMas);
    } catch (e) {
      console.error('[GruposScreen] cargarDatos error:', e);
      setErrorRed(true);
    } finally {
      setCargando(false);
    }
  };

  const seleccionarFotoGrupo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled) {
      setNuevoGrupo(p => ({ ...p, foto: result.assets[0].uri }));
    }
  };

  const subirFotoGrupo = async (uri, grupoId) => {
    const storage = getStorage();
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Sesión no iniciada');
    const storageRef = ref(storage, `gruposPendientes/${uid}/${grupoId}.jpg`);
    const response = await fetch(uri);
    const blob = await response.blob();
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  };

  const handleCrear = async () => {
    if (!nuevoGrupo.nombre.trim()) {
      Alert.alert('Error', 'El grupo necesita un nombre');
      return;
    }
    if (contieneTextoProhibido(`${nuevoGrupo.nombre} ${nuevoGrupo.descripcion}`)) {
      Alert.alert('Contenido no permitido', 'Revisa el nombre o la descripción del grupo');
      return;
    }
    setSubiendoFoto(true);
    const grupoRef = generarRefGrupo();
    let fotoPendienteUrl = null;
    try {
      fotoPendienteUrl = nuevoGrupo.foto
        ? await subirFotoGrupo(nuevoGrupo.foto, grupoRef.id)
        : null;

      const { id, codigo } = await crearGrupo(nuevoGrupo, { grupoRef, fotoPendienteUrl });

      setTab('mis');
      setNuevoGrupo({ nombre: '', descripcion: '', esPublico: true, foto: null });
      cargarDatos();
      Alert.alert('¡Grupo creado!', `Comparte este código con tus compañeros:\n\n${codigo}`);
    } catch (e) {
      if (fotoPendienteUrl) {
        const storage = getStorage();
        deleteObject(ref(storage, `gruposPendientes/${auth.currentUser?.uid}/${grupoRef.id}.jpg`)).catch(() => {});
      }
      Alert.alert('Error', 'No se pudo crear el grupo');
    } finally {
      setSubiendoFoto(false);
    }
  };

  const cargarMasPublicos = async () => {
    if (!hayMasPublicos || cargandoMasRef.current) return;
    cargandoMasRef.current = true;
    setCargandoMas(true);
    try {
      const miosIds = new Set(misGrupos.map(g => g.id));
      const { grupos: mas, hayMas: nuevoHayMas } = await obtenerGruposPublicos(ciudadActualId, { offset: offsetPublicos });
      const nuevos = mas.filter(g => !miosIds.has(g.id));
      setGruposPublicos(prev => [...prev, ...nuevos]);
      setOffsetPublicos(prev => prev + mas.length);
      setHayMasPublicos(nuevoHayMas);
    } finally {
      cargandoMasRef.current = false;
      setCargandoMas(false);
    }
  };

  const handleUnirseACodigo = async () => {
    if (!codigo.trim()) return;
    try {
      await unirseACodigo(codigo);
      setModalCodigo(false);
      setCodigo('');
      Alert.alert('¡Te has unido!', '', [{ text: 'OK', onPress: cargarDatos }]);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const handleUnirsePublico = async (grupoId, nombre) => {
    try {
      await unirseAGrupo(grupoId);
      Alert.alert('¡Te has unido!', `Ahora eres parte de ${nombre}`, [{ text: 'OK', onPress: cargarDatos }]);
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo unir al grupo');
    }
  };

  const handleRegenerarCodigo = (grupoId) => {
    Alert.alert(
      'Regenerar código',
      'El código anterior dejará de funcionar. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Regenerar', style: 'destructive',
          onPress: async () => {
            try {
              await regenerarCodigo(grupoId);
              cargarDatos();
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  const handleExpulsar = (grupoId, miembroUid, nick) => {
    Alert.alert(
      'Expulsar miembro',
      `¿Seguro que quieres expulsar a ${nick} del grupo?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Expulsar', style: 'destructive',
          onPress: async () => {
            try {
              await expulsarMiembro(grupoId, miembroUid);
              cargarDatos();
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  const handleSalir = (grupoId, nombre) => {
    Alert.alert(
      'Abandonar grupo',
      `¿Seguro que quieres salir de "${nombre}"? Perderás el acceso y tus aportaciones pasadas seguirán contando para el grupo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir', style: 'destructive',
          onPress: async () => {
            try {
              await salirDeGrupo(grupoId);
              cargarDatos();
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  if (cargando) return <PantallaCargando />;
  if (errorRed) return <EstadoError mensaje="No se pudieron cargar los grupos. Revisa tu conexión." onReintentar={cargarDatos} />;

  return (
    <ImageBackground
      source={require('../assets/login-map-flag-centered.jpg')}
      style={styles.container}
      resizeMode="cover"
    >
      <View style={styles.overlay} />

      {/* Tabs */}
      <View style={styles.tabs}>
        {[['mis', 'Mis grupos'], ['publicos', 'Explorar'], ['crear', 'Crear']].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, tab === key && styles.tabActivo]}
            onPress={() => setTab(key)}
          >
            <Text style={[styles.tabTexto, tab === key && styles.tabTextoActivo]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.contenido}>

        {/* Mis grupos */}
        {tab === 'mis' && (
          <>
            <TouchableOpacity style={styles.botonCodigo} onPress={() => setModalCodigo(true)}>
              <Text style={styles.botonCodigoTexto}>🔑 Unirse con código</Text>
            </TouchableOpacity>

            {misGrupos.length === 0 ? (
              <EstadoVacio titulo="No perteneces a ningún grupo" subtitulo="Crea uno o únete con un código." />
            ) : (
              misGrupos.map(grupo => (
                <GrupoCard
                  key={grupo.id}
                  grupo={grupo}
                  esMio
                  uid={auth.currentUser?.uid}
                  onSalir={grupo.creador !== auth.currentUser?.uid ? () => handleSalir(grupo.id, grupo.nombre) : null}
                  onExpulsar={grupo.creador === auth.currentUser?.uid
                    ? (miembroUid, nick) => handleExpulsar(grupo.id, miembroUid, nick)
                    : null}
                  onRegenerarCodigo={grupo.creador === auth.currentUser?.uid
                    ? () => handleRegenerarCodigo(grupo.id)
                    : null}
                  onReportar={() => crearReporte({ tipo: 'grupo', recursoId: grupo.id, motivo: 'contenido_inapropiado' })
                    .then(() => Alert.alert('Reporte enviado', 'Revisaremos este grupo cuanto antes'))
                    .catch(() => Alert.alert('Error', 'No se pudo enviar el reporte'))}
                />
              ))
            )}
          </>
        )}

        {/* Grupos públicos */}
        {tab === 'publicos' && (
          <>
            {gruposPublicos.length === 0 ? (
              <EstadoVacio titulo="No hay grupos públicos disponibles" subtitulo="¡Crea el primero!" />
            ) : (
              <>
                {gruposPublicos.map(grupo => (
                  <GrupoCard
                    key={grupo.id}
                    grupo={grupo}
                    onUnirse={() => handleUnirsePublico(grupo.id, grupo.nombre)}
                    onReportar={() => crearReporte({ tipo: 'grupo', recursoId: grupo.id, motivo: 'contenido_inapropiado' })
                      .then(() => Alert.alert('Reporte enviado', 'Revisaremos este grupo cuanto antes'))
                      .catch(() => Alert.alert('Error', 'No se pudo enviar el reporte'))}
                  />
                ))}
                {hayMasPublicos && (
                  <TouchableOpacity
                    style={styles.botonCargarMas}
                    onPress={cargarMasPublicos}
                    disabled={cargandoMas}
                  >
                    <Text style={styles.botonCargarMasTexto}>
                      {cargandoMas ? 'Cargando...' : 'Cargar más grupos'}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </>
        )}

        {/* Crear grupo */}
        {tab === 'crear' && (
          <View style={styles.formCard}>
            <Text style={styles.formTitulo}>Nuevo grupo</Text>

            {/* Foto del grupo */}
            <TouchableOpacity style={styles.fotoSelector} onPress={seleccionarFotoGrupo}>
              {nuevoGrupo.foto ? (
                <Image source={{ uri: nuevoGrupo.foto }} style={styles.fotoPreview} />
              ) : (
                <View style={styles.fotoPlaceholder}>
                  <Text style={styles.fotoPlaceholderEmoji}>📷</Text>
                  <Text style={styles.fotoPlaceholderTexto}>Foto del grupo</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.inputLabel}>Nombre del grupo</Text>
            <TextInput
              style={styles.input}
              value={nuevoGrupo.nombre}
              onChangeText={v => setNuevoGrupo(p => ({ ...p, nombre: v }))}
              placeholder="Ej: Los Leones de Malasaña"
              placeholderTextColor={colors.subdued}
              maxLength={40}
            />

            <Text style={styles.inputLabel}>Descripción (opcional)</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              value={nuevoGrupo.descripcion}
              onChangeText={v => setNuevoGrupo(p => ({ ...p, descripcion: v }))}
              placeholder="Describe tu grupo..."
              placeholderTextColor={colors.subdued}
              multiline
              maxLength={120}
            />

            <Text style={styles.inputLabel}>Visibilidad</Text>
            <View style={styles.toggleRow}>
              {[true, false].map(val => (
                <TouchableOpacity
                  key={String(val)}
                  style={[styles.toggleBtn, nuevoGrupo.esPublico === val && styles.toggleBtnActivo]}
                  onPress={() => setNuevoGrupo(p => ({ ...p, esPublico: val }))}
                >
                  <Text style={[styles.toggleTexto, nuevoGrupo.esPublico === val && styles.toggleTextoActivo]}>
                    {val ? '🌍 Público' : '🔒 Privado'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.botonCrear, subiendoFoto && { opacity: 0.6 }]}
              onPress={handleCrear}
              disabled={subiendoFoto}
            >
              <Text style={styles.botonCrearTexto}>
                {subiendoFoto ? 'Creando...' : 'Crear grupo'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      {/* Modal código */}
      <Modal visible={modalCodigo} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>Unirse con código</Text>
            <TextInput
              style={styles.input}
              value={codigo}
              onChangeText={setCodigo}
              placeholder="Introduce el código"
              placeholderTextColor={colors.subdued}
              autoCapitalize="characters"
              maxLength={6}
            />
            <TouchableOpacity style={styles.botonCrear} onPress={handleUnirseACodigo}>
              <Text style={styles.botonCrearTexto}>Unirse</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalCodigo(false)} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.muted }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </ImageBackground>
  );
}

function GrupoCard({ grupo, esMio, uid, onUnirse, onSalir, onExpulsar, onRegenerarCodigo, onReportar }) {
  const esCreador = esMio && grupo.creador === uid;

  return (
    <View style={styles.grupoCard}>
      <View style={styles.grupoHeaderRow}>
        {fotoAprobada(grupo.foto, grupo.fotoEstado) ? (
          <Image source={{ uri: grupo.foto }} style={styles.grupoFoto} />
        ) : (
          <View style={styles.grupoFotoPlaceholder}>
            <Text style={{ fontSize: 22 }}>👥</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={styles.grupoHeader}>
            <Text style={styles.grupoNombre}>{grupo.nombre}</Text>
            <Text style={styles.grupoBadge}>
              {grupo.esPublico ? '🌍 Público' : '🔒 Privado'}
            </Text>
          </View>
          {grupo.descripcion ? (
            <Text style={styles.grupoDesc}>{grupo.descripcion}</Text>
          ) : null}
        </View>
      </View>

      {grupo.fotoPendiente && grupo.fotoEstado === FOTO_ESTADOS.PENDIENTE && esMio && (
        <Text style={styles.fotoPendienteTexto}>Foto pendiente de revisión</Text>
      )}

      <View style={styles.grupoStats}>
        <Text style={styles.grupoStat}>👥 {grupo.miembros.length} miembros</Text>
        <Text style={styles.grupoStat}>🏃 {((grupo.distanciaTotal ?? 0) / 1000).toFixed(0)} km</Text>
        <Text style={styles.grupoStat}>⭐ {(grupo.puntosTotales ?? 0).toLocaleString()} pts</Text>
        {(grupo.barriosConquistados ?? 0) > 0 && (
          <Text style={styles.grupoStat}>🚩 {grupo.barriosConquistados} barrio{grupo.barriosConquistados !== 1 ? 's' : ''}</Text>
        )}
      </View>
      <View style={styles.grupoPie}>
        {grupo.ciudadNombre && (
          <Text style={styles.grupoCiudad}>📍 {grupo.ciudadNombre}</Text>
        )}
        {grupo.posicion != null && (
          <Text style={styles.grupoPosicion}>#{grupo.posicion} en {grupo.ciudadNombre ?? 'su ciudad'}</Text>
        )}
      </View>

      {esCreador && (
        <View style={styles.codigoBox}>
          <Text style={styles.codigoLabel}>Gestión del grupo</Text>
          <Text style={styles.codigoTexto}>{grupo.codigo}</Text>
          <View style={styles.codigoAcciones}>
            <TouchableOpacity
              style={styles.botonCompartir}
              onPress={() => Share.share({ message: `Únete a mi grupo "${grupo.nombre}" en ConqueRun con el código: ${grupo.codigo}` })}
            >
              <Text style={styles.botonCompartirTexto}>Compartir</Text>
            </TouchableOpacity>
            {onRegenerarCodigo && (
              <TouchableOpacity style={styles.botonRegenerarCodigo} onPress={onRegenerarCodigo}>
                <Text style={styles.botonRegenerarCodigoTexto}>Regenerar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {esMio && (
        <>
          <Text style={styles.miembrosTitle}>Miembros:</Text>
          {Object.entries(grupo.nicknames ?? {}).map(([memberId, nick]) => (
            <View key={memberId} style={styles.miembroRow}>
              <Text style={styles.miembroItem}>
                {memberId === grupo.creador ? '👑 ' : '• '}{nick}
              </Text>
              {esCreador && onExpulsar && memberId !== grupo.creador && (
                <TouchableOpacity style={styles.botonExpulsar} onPress={() => onExpulsar(memberId, nick)}>
                  <Text style={styles.botonExpulsarTexto}>Expulsar</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </>
      )}

      {onUnirse && (
        <TouchableOpacity style={styles.botonUnirse} onPress={onUnirse}>
          <Text style={styles.botonUnirseTexto}>Unirse al grupo</Text>
        </TouchableOpacity>
      )}

      {onSalir && (
        <TouchableOpacity style={styles.botonSalir} onPress={onSalir}>
          <Text style={styles.botonSalirTexto}>Salir del grupo</Text>
        </TouchableOpacity>
      )}

      {onReportar && (
        <TouchableOpacity style={styles.botonReportar} onPress={onReportar}>
          <Text style={styles.botonReportarTexto}>Reportar contenido</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3,7,18,0.78)' },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, padding: 4, margin: 16, borderRadius: radius.lg },
  tab: { flex: 1, padding: 10, alignItems: 'center', borderRadius: radius.sm },
  tabActivo: { backgroundColor: colors.gold },
  tabTexto: { color: colors.muted, fontSize: 14, fontWeight: 'bold' },
  tabTextoActivo: { color: colors.bg },
  contenido: { padding: 16, paddingBottom: 40 },

  botonCodigo: {
    backgroundColor: colors.surface, borderColor: colors.gold, borderWidth: 1,
    borderRadius: radius.lg, padding: 14, alignItems: 'center', marginBottom: 16,
  },
  botonCodigoTexto: { color: colors.gold, fontSize: 15, fontWeight: 'bold' },


  grupoCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, marginBottom: 12 },
  grupoHeaderRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  grupoFoto: { width: 56, height: 56, borderRadius: 12 },
  grupoFotoPlaceholder: {
    width: 56, height: 56, borderRadius: 12,
    backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },
  grupoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  grupoNombre: { fontSize: 17, fontWeight: 'bold', color: colors.text, flex: 1 },
  grupoBadge: { fontSize: 12, color: colors.muted },
  grupoDesc: { fontSize: 13, color: colors.muted },
  fotoPendienteTexto: { color: colors.gold, fontSize: 12, marginBottom: 8 },
  grupoStats: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  grupoStat: { fontSize: 13, color: colors.muted },
  grupoPie: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  grupoCiudad: { fontSize: 12, color: colors.subdued },
  grupoPosicion: { fontSize: 12, color: colors.gold, fontWeight: 'bold' },
  codigoBox: {
    backgroundColor: colors.bg, borderRadius: radius.sm,
    padding: 10, alignItems: 'center', marginBottom: 10,
  },
  codigoLabel: { fontSize: 11, color: colors.subdued, marginBottom: 4 },
  codigoTexto: { fontSize: 22, fontWeight: 'bold', color: colors.gold, letterSpacing: 4 },
  miembrosTitle: { fontSize: 12, color: colors.subdued, marginBottom: 6 },
  miembroRow: {
    minHeight: 34,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  miembroItem: { fontSize: 14, color: colors.muted, flex: 1 },
  botonExpulsar: {
    borderColor: colors.conquest,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  botonExpulsarTexto: { fontSize: 12, color: colors.conquest, fontWeight: '600' },

  botonUnirse: {
    backgroundColor: colors.gold, borderRadius: radius.sm,
    padding: 12, alignItems: 'center', marginTop: 8,
  },
  botonUnirseTexto: { color: colors.bg, fontSize: 14, fontWeight: 'bold' },
  botonCargarMas: {
    padding: 14, alignItems: 'center', marginTop: 4, marginBottom: 8,
    borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg,
  },
  botonCargarMasTexto: { color: colors.muted, fontSize: 14 },
  codigoAcciones: { flexDirection: 'row', gap: 8, marginTop: 10 },
  botonCompartir: {
    flex: 1, backgroundColor: colors.surface,
    borderColor: colors.gold, borderWidth: 1,
    borderRadius: radius.sm, paddingVertical: 8, alignItems: 'center',
  },
  botonCompartirTexto: { color: colors.gold, fontSize: 13, fontWeight: '600' },
  botonRegenerarCodigo: {
    flex: 1, backgroundColor: colors.surface,
    borderColor: colors.muted, borderWidth: 1,
    borderRadius: radius.sm, paddingVertical: 8, alignItems: 'center',
  },
  botonRegenerarCodigoTexto: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  botonSalir: { alignItems: 'center', marginTop: 12 },
  botonSalirTexto: { color: colors.conquest, fontSize: 13, fontWeight: '600' },
  botonReportar: { alignItems: 'center', marginTop: 8 },
  botonReportarTexto: { color: colors.muted, fontSize: 12 },

  formCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16 },
  formTitulo: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 16 },

  fotoSelector: { alignSelf: 'center', marginBottom: 20 },
  fotoPreview: { width: 100, height: 100, borderRadius: 16 },
  fotoPlaceholder: {
    width: 100, height: 100, borderRadius: 16,
    backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  fotoPlaceholderEmoji: { fontSize: 28 },
  fotoPlaceholderTexto: { fontSize: 12, color: colors.subdued },

  inputLabel: { fontSize: 13, color: colors.muted, marginBottom: 6 },
  input: {
    backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.sm, padding: 12, color: colors.text, fontSize: 15, marginBottom: 14,
  },
  toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  toggleBtn: {
    flex: 1, padding: 12, borderRadius: 8,
    borderColor: colors.border, borderWidth: 1, alignItems: 'center',
  },
  toggleBtnActivo: { borderColor: colors.gold, backgroundColor: '#C6F43220' },
  toggleTexto: { color: colors.muted, fontSize: 14 },
  toggleTextoActivo: { color: colors.gold, fontWeight: 'bold' },
  botonCrear: {
    backgroundColor: colors.gold, borderRadius: radius.md,
    padding: 14, alignItems: 'center',
  },
  botonCrearTexto: { color: colors.bg, fontSize: 15, fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surface, borderTopLeftRadius: 20,
    borderTopRightRadius: 20, padding: 24,
  },
  modalTitulo: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 16 },
});
