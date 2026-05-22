import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, Alert, Modal, ImageBackground, Linking } from 'react-native';
import GruposScreen from './GruposScreen';
import { useFocusEffect } from '@react-navigation/native';
import { EstadoVacio, PantallaCargando } from '../components/ui';
import { auth, db } from '../firebaseConfig';
import { signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { invalidarCacheTerritorios, obtenerBarriosSegmentados } from '../utils/barrios';
import { repararConsistenciaUsuario } from '../utils/consistencia';
import { obtenerCiudades } from '../utils/ciudades';
import { obtenerMisGrupos } from '../utils/grupos';
import { LOGROS } from '../utils/logros';
import { formatDuracion, formatRitmo } from '../utils/formatters';
import { FOTO_ESTADOS, fotoAprobada, eliminarCuentaCompleta } from '../utils/moderacion';
import { obtenerEstadoPermiso, registrarNotificaciones } from '../utils/notificaciones';
import { cargarMiEntradaRanking, cargarPosicionUsuario } from '../utils/rankingsCiudad';
import { abrirResenaManual, prepararSolicitudResena } from '../utils/reviews';
import { calcularSegmentoRitmo, calcularSegmentos30d, etiquetaSegmentoRitmo, SEGMENTOS_RITMO } from '../utils/segmentos';
import { colors, radius } from '../utils/theme';


export default function PerfilScreen() {
  const [stats, setStats] = useState(null);
  const [nickname, setNickname] = useState('');
  const [pais, setPais] = useState(null);
  const [fotoPerfil, setFotoPerfil] = useState(null);
  const [fotoPerfilEstado, setFotoPerfilEstado] = useState(null);
  const [fotoMotivoRechazo, setFotoMotivoRechazo] = useState(null);
  const [fotoPendiente, setFotoPendiente] = useState(null);
  const [barrios, setBarrios] = useState([]);
  const [barriosEnDisputa, setBarriosEnDisputa] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [posicionRanking, setPosicionRanking] = useState(null);
  const [cargandoRanking, setCargandoRanking] = useState(false);
  const [ciudadNombre, setCiudadNombre] = useState(null);
  const [ciudadActualId, setCiudadActualId] = useState(null);
  const [ciudadSeleccionada, setCiudadSeleccionada] = useState(null);
  const [busquedaCiudad, setBusquedaCiudad] = useState('');
  const [busquedaPais, setBusquedaPais] = useState('');
  const [mostrarPaises, setMostrarPaises] = useState(false);
  const [paisConquistaCodigo, setPaisConquistaCodigo] = useState(null);
  const [ciudadesPerfil, setCiudadesPerfil] = useState([]);
  const [mostrarCiudades, setMostrarCiudades] = useState(false);
  const [logros, setLogros] = useState([]);
  const [genero, setGenero] = useState(null);
  const [segmentoCompetitivo, setSegmentoCompetitivo] = useState(null);
  const [segmentoEtiqueta, setSegmentoEtiqueta] = useState(null);
  const [segmentoRitmo, setSegmentoRitmo] = useState(null);
  const [ritmo30d, setRitmo30d] = useState(null);
  const [racha, setRacha] = useState(0);
  const [cargando, setCargando] = useState(true);
  const ultimoRecalculoSegmentosRef = useRef(0);
  const reparacionConsistenciaRef = useRef(null);
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [mostrarEditorPerfil, setMostrarEditorPerfil] = useState(false);
  const [mostrarInfo, setMostrarInfo] = useState(false);
  const [mostrarSegmentosRitmo, setMostrarSegmentosRitmo] = useState(false);
  const [mostrarModalEliminar, setMostrarModalEliminar] = useState(false);
  const [passwordEliminar, setPasswordEliminar] = useState('');
  const [eliminando, setEliminando] = useState(false);
  const [estadoNotif, setEstadoNotif] = useState(null);
  const [tabPrincipal, setTabPrincipal] = useState('perfil');
  const [totalConquistas, setTotalConquistas] = useState(0);
  const [maxBarriosSimultaneos, setMaxBarriosSimultaneos] = useState(0);

  useFocusEffect(useCallback(() => {
    cargarPerfil();
    obtenerEstadoPermiso().then(setEstadoNotif).catch(() => {});
  }, []));

  const cargarPerfil = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const [userSnap, privadoSnap] = await Promise.all([
        getDoc(doc(db, 'usuarios', uid)),
        getDoc(doc(db, 'usuarios', uid, 'privado', 'datos')),
      ]);
      let userData = userSnap.exists() ? userSnap.data() : {};
      if (userSnap.exists()) {
        const data = {
          ...userData,
          ...(privadoSnap.exists() ? { fechaNacimiento: privadoSnap.data().fechaNacimiento } : {}),
        };
        const ritmoMedioTotal = data.distanciaTotal > 0
          ? ((data.duracionTotal ?? 0) / ((data.distanciaTotal ?? 1) / 1000))
          : 0;
        let segmentosPerfil = {
          ritmo30d: data.ritmo30d ?? null,
          segmentoRitmo: data.segmentoRitmo ?? data.segmentoCompetitivo?.split('_')?.[0] ?? calcularSegmentoRitmo(data.ritmo30d),
          segmentoCompetitivo: data.segmentoCompetitivo ?? null,
          segmentoEtiqueta: data.segmentoEtiqueta ?? null,
        };

        const TTL_SEGMENTOS_MS = 60 * 60 * 1000;
        const segmentosRecientes = Date.now() - ultimoRecalculoSegmentosRef.current < TTL_SEGMENTOS_MS;
        try {
          const recalculados = segmentosRecientes
            ? segmentosPerfil
            : await calcularSegmentos30d({ uid, perfil: data });
          const cambioSegmento = !segmentosRecientes && (
            recalculados.ritmo30d !== (data.ritmo30d ?? null) ||
            recalculados.segmentoRitmo !== data.segmentoRitmo ||
            recalculados.segmentoGenero !== data.segmentoGenero ||
            recalculados.segmentoEdad !== data.segmentoEdad ||
            recalculados.segmentoCompetitivo !== data.segmentoCompetitivo ||
            recalculados.segmentoEtiqueta !== data.segmentoEtiqueta
          );

          if (!segmentosRecientes) ultimoRecalculoSegmentosRef.current = Date.now();
          segmentosPerfil = recalculados;

          if (cambioSegmento) {
            invalidarCacheTerritorios(data.ciudadActualId).catch(() => {});
          }
        } catch (e) {
          console.warn('[PerfilScreen] No se pudo recalcular segmento 30d:', e);
        }

        setNickname(data.nickname ?? '');
        setPais(data.pais ?? null);
        setFotoPerfil(data.fotoPerfil ?? null);
        setFotoPerfilEstado(data.fotoPerfilEstado ?? null);
        setFotoMotivoRechazo(data.fotoMotivoRechazo ?? null);
        setFotoPendiente(data.fotoPendiente ?? null);
        setGenero(data.genero ?? null);
        setSegmentoCompetitivo(segmentosPerfil.segmentoCompetitivo ?? null);
        setSegmentoEtiqueta(segmentosPerfil.segmentoEtiqueta ?? null);
        setSegmentoRitmo(segmentosPerfil.segmentoRitmo);
        setRitmo30d(segmentosPerfil.ritmo30d ?? null);
        setLogros(data.logros ?? []);
        setRacha(data.racha ?? 0);
        setMaxBarriosSimultaneos(Math.max(data.maxBarriosSimultaneos ?? 0, data.barriosConquistadosTotal ?? 0));
        setCiudadNombre(data.ciudadActualNombre ?? null);
        setCiudadActualId(data.ciudadActualId ?? null);
        setPaisConquistaCodigo(data.paisCodigo ?? null);
        setCiudadSeleccionada(data.ciudadActualId ? {
          id: data.ciudadActualId,
          nombre: data.ciudadActualNombre,
          paisCodigo: data.paisCodigo ?? null,
        } : null);
        setStats({
          carreras: data.carrerasTotal ?? 0,
          totalKm: data.distanciaTotal ?? 0,
          totalSegundos: data.duracionTotal ?? 0,
          ritmoMedio: ritmoMedioTotal,
        });
        userData = { ...data, ...segmentosPerfil };
      }

      const ciudadId = userData.ciudadActualId ?? null;
      const segmento = userData.segmentoCompetitivo ?? null;
      const claveConsistencia = `${uid}_${ciudadId ?? 'sin-ciudad'}_${segmento ?? 'sin-segmento'}`;

      // Marcas territoriales — filtramos solo por ciudadId para evitar índice compuesto,
      // el filtro de segmento se aplica en cliente (pocos docs por usuario/ciudad)
      const marcasSnap = ciudadId
        ? await getDocs(query(
            collection(db, 'usuarios', uid, 'marcasTerritoriales'),
            where('ciudadId', '==', ciudadId),
          ))
        : null;
      const marcas = marcasSnap
        ? Object.fromEntries(
            marcasSnap.docs
              .filter(d => !segmento || d.data().segmentoCompetitivo === segmento)
              .map(d => [d.data().territorioId ?? d.id, d.data().puntos ?? 0])
          )
        : {};

      const todosBarrios = await obtenerBarriosSegmentados(ciudadId, segmento);
      const barriosPropios = todosBarrios
        .filter(b => b.dueno === uid)
        .map(b => ({ ...b, misMarcas: marcas[b.id] ?? b.duenoPuntos }))
        .sort((a, b) => b.misMarcas - a.misMarcas);
      const barriosActuales = barriosPropios.length;
      setBarrios(barriosPropios);
      setMaxBarriosSimultaneos(prev => Math.max(prev ?? 0, userData.maxBarriosSimultaneos ?? 0, barriosActuales));

      let rankingEntrada = null;
      if (
        ciudadId &&
        segmento &&
        reparacionConsistenciaRef.current !== claveConsistencia &&
        barriosActuales !== (userData.barriosConquistadosTotal ?? 0)
      ) {
        reparacionConsistenciaRef.current = claveConsistencia;
        try {
          const reparacion = await repararConsistenciaUsuario({ clave: claveConsistencia, force: true });
          if (typeof reparacion?.barrios === 'number') {
            userData = {
              ...userData,
              barriosConquistadosTotal: reparacion.barrios,
              barriosConquistadosHistorico: reparacion.barriosConquistadosHistorico ?? userData.barriosConquistadosHistorico,
              maxBarriosSimultaneos: reparacion.maxBarriosSimultaneos ?? userData.maxBarriosSimultaneos,
            };
            setMaxBarriosSimultaneos(reparacion.maxBarriosSimultaneos ?? Math.max(userData.maxBarriosSimultaneos ?? 0, barriosActuales));
          }
          rankingEntrada = reparacion?.ranking ?? null;
        } catch (e) {
          reparacionConsistenciaRef.current = null;
          console.warn('[PerfilScreen] No se pudo reparar consistencia:', e);
        }
      }

      if (ciudadId) {
        setCargandoRanking(true);
        try {
          rankingEntrada = rankingEntrada ?? await cargarMiEntradaRanking(ciudadId, uid, segmento);
          if (!rankingEntrada && segmento) {
            const reparacion = await repararConsistenciaUsuario({ clave: claveConsistencia });
            rankingEntrada = reparacion?.ranking ?? await cargarMiEntradaRanking(ciudadId, uid, segmento);
          }
          const pos = await cargarPosicionUsuario(
            ciudadId,
            barriosActuales,
            rankingEntrada?.puntos ?? userData.puntosTotales ?? 0,
            segmento
          );
          setPosicionRanking(pos);
        } finally {
          setCargandoRanking(false);
        }
      } else {
        setPosicionRanking(null);
        setCargandoRanking(false);
      }

      setBarriosEnDisputa(
        todosBarrios
          .filter(b => b.dueno !== uid && (marcas[b.id] ?? 0) > 0)
          .map(b => ({ ...b, misMarcas: marcas[b.id] ?? 0 }))
          .sort((a, b) => b.misMarcas - a.misMarcas)
      );

      const misGrupos = await obtenerMisGrupos();
      setGrupos(misGrupos);

      setTotalConquistas(Math.max(
        userData.barriosConquistadosHistorico ?? 0,
        userData.barriosConquistadosTotal ?? 0,
        barriosActuales
      ));

    } catch (e) {
      console.error(e);
    } finally {
      setCargando(false);
    }
  };

  const formatoRangoRitmo = (segmento) => {
    if (!segmento) return 'sin rango asignado';
    if (segmento.min == null) return `< ${formatRitmo(segmento.max)}/km`;
    if (segmento.max == null) return `> ${formatRitmo(segmento.min)}/km`;
    return `${formatRitmo(segmento.min)}-${formatRitmo(segmento.max)}/km`;
  };

  const segmentoRitmoActual = () => (
    SEGMENTOS_RITMO.find(segmento => segmento.id === segmentoRitmo) ?? null
  );

  const cargarCiudadesPerfil = async () => {
    if (ciudadesPerfil.length > 0) return;
    try {
      const lista = await obtenerCiudades();
      setCiudadesPerfil(lista.filter(c => c.estadoCobertura !== 'inactiva'));
    } catch (e) {
      console.error('[PerfilScreen] cargar ciudades:', e);
      Alert.alert('Error', 'No se pudieron cargar las ciudades.');
    }
  };

  const toggleEditorPerfil = () => {
    setMostrarEditorPerfil(v => {
      const siguiente = !v;
      if (siguiente) cargarCiudadesPerfil();
      return siguiente;
    });
  };

  const paisesConquista = [...new Map(
    ciudadesPerfil
      .filter(c => c.paisCodigo)
      .map(c => [c.paisCodigo, c.paisNombre ?? c.paisCodigo])
  ).entries()]
    .map(([codigo, nombre]) => ({ codigo, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const ciudadesConquista = ciudadesPerfil
    .filter(c => c.paisCodigo === paisConquistaCodigo)
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const seleccionarFoto = async () => {
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
      setFotoPendiente(result.assets[0].uri);
      setEditando(true);
    }
  };

  const guardarPerfil = async () => {
    setGuardando(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      let fotoUrl = fotoPendiente;

      if (paisConquistaCodigo && !ciudadSeleccionada?.id) {
        Alert.alert('Selecciona una ciudad', 'Elige la ciudad que quieres conquistar en ese país.');
        return;
      }

      if (fotoPendiente && fotoPendiente.startsWith('file://')) {
        const storage = getStorage();
        const storageRef = ref(storage, `fotos/${uid}.jpg`);
        const response = await fetch(fotoPendiente);
        const blob = await response.blob();
        await uploadBytes(storageRef, blob);
        fotoUrl = await getDownloadURL(storageRef);
      }

      await setDoc(doc(db, 'usuarios', uid), {
        nickname,
        ...(ciudadSeleccionada?.id && ciudadSeleccionada.id !== ciudadActualId
          ? {
              ciudadActualId: ciudadSeleccionada.id,
              ciudadActualNombre: ciudadSeleccionada.nombre,
              paisCodigo: ciudadSeleccionada.paisCodigo ?? null,
            }
          : {}),
        ...(fotoPendiente && fotoPendiente.startsWith('file://')
          ? {
              fotoPerfil: fotoUrl,
              fotoPendiente: null,
              fotoPerfilEstado: FOTO_ESTADOS.APROBADA,
              fotoMotivoRechazo: null,
            }
          : {}),
      }, { merge: true });

      obtenerMisGrupos().then(misGrupos => {
        for (const grupo of misGrupos) {
          updateDoc(doc(db, 'grupos', grupo.id), { [`nicknames.${uid}`]: nickname }).catch(() => {});
        }
      }).catch(() => {});

      if (fotoPendiente && fotoPendiente.startsWith('file://')) {
        setFotoPerfil(fotoUrl);
        setFotoPendiente(null);
        setFotoPerfilEstado(FOTO_ESTADOS.APROBADA);
      }
      if (ciudadSeleccionada?.id) {
        setCiudadActualId(ciudadSeleccionada.id);
        setCiudadNombre(ciudadSeleccionada.nombre);
        setPaisConquistaCodigo(ciudadSeleccionada.paisCodigo ?? null);
      }
      setEditando(false);
      setMostrarEditorPerfil(false);
      setMostrarCiudades(false);
      Alert.alert('Perfil guardado', 'Tus cambios se han guardado');
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar el perfil');
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminacion = () => {
    setPasswordEliminar('');
    setMostrarModalEliminar(true);
  };

  const ejecutarEliminacion = async () => {
    if (!passwordEliminar.trim()) return;
    setEliminando(true);
    try {
      await eliminarCuentaCompleta(passwordEliminar);
    } catch (e) {
      setEliminando(false);
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        Alert.alert('Contraseña incorrecta', 'Introduce tu contraseña actual para confirmar.');
      } else if (e.code === 'auth/too-many-requests') {
        Alert.alert('Demasiados intentos', 'Espera unos minutos e inténtalo de nuevo.');
      } else {
        Alert.alert('Error', 'No se pudo eliminar la cuenta. Comprueba tu conexión.');
      }
    }
  };

  if (cargando) return <PantallaCargando />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.selectorPrincipal}>
        <TouchableOpacity
          style={[styles.selectorTab, tabPrincipal === 'perfil' && styles.selectorTabActivo]}
          onPress={() => setTabPrincipal('perfil')}
        >
          <Text style={[styles.selectorTabTexto, tabPrincipal === 'perfil' && styles.selectorTabTextoActivo]}>Perfil</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.selectorTab, tabPrincipal === 'grupos' && styles.selectorTabActivo]}
          onPress={() => setTabPrincipal('grupos')}
        >
          <Text style={[styles.selectorTabTexto, tabPrincipal === 'grupos' && styles.selectorTabTextoActivo]}>Grupos</Text>
        </TouchableOpacity>
      </View>

      {tabPrincipal === 'grupos' ? (
        <GruposScreen />
      ) : (
    <>
    <ImageBackground
      source={require('../assets/login-map-flag-centered.jpg')}
      style={styles.imageFondo}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>

      {/* Avatar y datos básicos */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.botonInfo} onPress={() => setMostrarInfo(true)}>
          <Text style={styles.botonInfoTexto}>ⓘ</Text>
        </TouchableOpacity>
        <View style={styles.avatarWrapper}>
          {fotoAprobada(fotoPerfil, fotoPerfilEstado) ? (
            <Image source={{ uri: fotoPerfil }} style={styles.avatarFoto} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarTexto}>{nickname?.[0]?.toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.avatarEditar}>
            <Text style={styles.avatarEditarTexto}>📷</Text>
          </View>
        </View>

        {fotoPendiente && fotoPerfilEstado === FOTO_ESTADOS.PENDIENTE && (
          <Text style={styles.fotoPendienteTexto}>Foto pendiente de revisión</Text>
        )}
        {fotoPerfilEstado === FOTO_ESTADOS.RECHAZADA && (
          <Text style={styles.fotoRechazadaTexto}>Foto rechazada — contenido no permitido. Sube una nueva.</Text>
        )}

        <Text style={styles.nickname}>{pais?.bandera ? `${pais.bandera} ` : ''}{nickname}</Text>
        <TouchableOpacity
          style={styles.segmentoRitmoBoton}
          onPress={() => setMostrarSegmentosRitmo(true)}
          activeOpacity={0.85}
        >
          <View style={styles.segmentoRitmoBotonContenido}>
            <Text style={styles.segmentoRitmoTexto}>
              Ritmo de conquista: {etiquetaSegmentoRitmo(segmentoRitmo)}
            </Text>
            <Text style={styles.segmentoRitmoSubtexto}>
              Rango: {formatoRangoRitmo(segmentoRitmoActual())}
            </Text>
          </View>
          <Text style={styles.segmentoRitmoChevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.botonEditarPerfil}
          onPress={toggleEditorPerfil}
        >
          <Text style={styles.botonEditarPerfilTexto}>
            {mostrarEditorPerfil ? 'Cerrar edición' : 'Modificar perfil'}
          </Text>
        </TouchableOpacity>

        {(posicionRanking > 0 || cargandoRanking) && (
          <View style={styles.rankingResumen}>
            <Text style={styles.rankingResumenLabel}>Ranking {ciudadNombre ?? 'tu ciudad'}</Text>
            {cargandoRanking
              ? <ActivityIndicator size="small" color={colors.gold} />
              : <Text style={styles.rankingResumenValor}>#{posicionRanking}</Text>
            }
          </View>
        )}

      </View>

      {mostrarEditorPerfil && (
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Editar perfil</Text>

          <TouchableOpacity style={styles.botonFoto} onPress={seleccionarFoto}>
            <Text style={styles.botonFotoTexto}>Cambiar foto</Text>
          </TouchableOpacity>

          <Text style={styles.inputLabel}>Nickname</Text>
          <TextInput
            style={styles.input}
            value={nickname}
            onChangeText={v => { setNickname(v); setEditando(true); }}
            placeholder="Tu nickname"
            placeholderTextColor={colors.subdued}
            autoCapitalize="none"
            maxLength={20}
          />

          <Text style={styles.inputLabel}>País a conquistar</Text>
          <TouchableOpacity
            style={styles.ciudadSelector}
            onPress={() => {
              cargarCiudadesPerfil();
              setMostrarPaises(v => !v);
              setBusquedaPais('');
            }}
          >
            <Text style={styles.ciudadSelectorNombre}>
              {paisConquistaCodigo
                ? (paisesConquista.find(p => p.codigo === paisConquistaCodigo)?.nombre ?? paisConquistaCodigo)
                : 'Selecciona un país'}
            </Text>
            <Text style={styles.ciudadChevron}>{mostrarPaises ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {mostrarPaises && (
            <View style={styles.ciudadLista}>
              {ciudadesPerfil.length === 0 ? (
                <Text style={styles.ciudadVacia}>Cargando países...</Text>
              ) : (
                <>
                  <TextInput
                    style={styles.ciudadBusqueda}
                    placeholder="Buscar país..."
                    placeholderTextColor={colors.subdued}
                    value={busquedaPais}
                    onChangeText={setBusquedaPais}
                    autoCorrect={false}
                  />
                  <ScrollView style={styles.ciudadListaScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                    {[
                      ...paisesConquista.filter(p => p.nombre.toLowerCase().includes(busquedaPais.toLowerCase())),
                    ].map(paisItem => (
                      <TouchableOpacity
                        key={paisItem.codigo}
                        style={[
                          styles.ciudadOpcion,
                          paisConquistaCodigo === paisItem.codigo && styles.ciudadOpcionActiva,
                        ]}
                        onPress={() => {
                          setPaisConquistaCodigo(paisItem.codigo);
                          if (ciudadSeleccionada?.paisCodigo !== paisItem.codigo) {
                            setCiudadSeleccionada(null);
                            setBusquedaCiudad('');
                          }
                          setMostrarPaises(false);
                          setBusquedaPais('');
                          setMostrarCiudades(true);
                          setEditando(true);
                        }}
                      >
                        <Text style={styles.ciudadOpcionNombre}>{paisItem.nombre}</Text>
                        {paisConquistaCodigo === paisItem.codigo && (
                          <Text style={styles.ciudadCheck}>✓</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                    {paisesConquista.filter(p => p.nombre.toLowerCase().includes(busquedaPais.toLowerCase())).length === 0 && (
                      <Text style={styles.ciudadVacia}>Sin resultados para "{busquedaPais}"</Text>
                    )}
                    <View style={styles.paisProximamente}>
                      <Text style={styles.paisProximamenteTexto}>Más países próximamente</Text>
                    </View>
                  </ScrollView>
                </>
              )}
            </View>
          )}

          <Text style={styles.inputLabel}>Ciudad a conquistar</Text>
          <TouchableOpacity
            style={[styles.ciudadSelector, !paisConquistaCodigo && styles.ciudadSelectorDesactivado]}
            onPress={() => {
              cargarCiudadesPerfil();
              if (paisConquistaCodigo) {
                setMostrarCiudades(v => !v);
                setBusquedaCiudad('');
              }
            }}
          >
            <View style={styles.ciudadSelectorInfo}>
              <Text style={styles.ciudadSelectorNombre}>
                {ciudadSeleccionada?.nombre ?? 'Selecciona una ciudad'}
              </Text>
              {ciudadSeleccionada?.paisNombre ? (
                <Text style={styles.ciudadSelectorPais}>{ciudadSeleccionada.paisNombre}</Text>
              ) : null}
            </View>
            <Text style={styles.ciudadChevron}>{mostrarCiudades ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {mostrarCiudades && (
            <View style={styles.ciudadLista}>
              {!paisConquistaCodigo ? (
                <Text style={styles.ciudadVacia}>Elige primero un país.</Text>
              ) : ciudadesPerfil.length === 0 ? (
                <Text style={styles.ciudadVacia}>Cargando ciudades...</Text>
              ) : ciudadesConquista.length === 0 ? (
                <Text style={styles.ciudadVacia}>No hay ciudades activas en este país.</Text>
              ) : (
                <>
                  <TextInput
                    style={styles.ciudadBusqueda}
                    placeholder="Buscar ciudad..."
                    placeholderTextColor={colors.subdued}
                    value={busquedaCiudad}
                    onChangeText={setBusquedaCiudad}
                    autoCorrect={false}
                  />
                  <ScrollView style={styles.ciudadListaScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  {ciudadesConquista
                    .filter(c => c.nombre.toLowerCase().includes(busquedaCiudad.toLowerCase()))
                    .map(ciudad => (
                      <TouchableOpacity
                        key={ciudad.id}
                        style={[
                          styles.ciudadOpcion,
                          ciudadSeleccionada?.id === ciudad.id && styles.ciudadOpcionActiva,
                        ]}
                        onPress={() => {
                          setCiudadSeleccionada(ciudad);
                          setPaisConquistaCodigo(ciudad.paisCodigo ?? null);
                          setMostrarCiudades(false);
                          setBusquedaCiudad('');
                          setEditando(true);
                        }}
                      >
                        <View>
                          <Text style={styles.ciudadOpcionNombre}>{ciudad.nombre}</Text>
                          <Text style={styles.ciudadOpcionPais}>{ciudad.paisNombre ?? ciudad.paisCodigo}</Text>
                        </View>
                        {ciudadSeleccionada?.id === ciudad.id && (
                          <Text style={styles.ciudadCheck}>✓</Text>
                        )}
                      </TouchableOpacity>
                    ))
                  }
                  {ciudadesConquista.filter(c => c.nombre.toLowerCase().includes(busquedaCiudad.toLowerCase())).length === 0 && (
                    <Text style={styles.ciudadVacia}>Sin resultados para "{busquedaCiudad}"</Text>
                  )}
                  </ScrollView>
                </>
              )}
            </View>
          )}

          {editando && (
            <TouchableOpacity
              style={[styles.botonGuardar, guardando && { opacity: 0.6 }]}
              onPress={guardarPerfil}
              disabled={guardando}
            >
              <Text style={styles.botonGuardarTexto}>
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Stats */}
      <SeccionTitulo icon="chart-bar">Mis estadísticas</SeccionTitulo>
      <View style={styles.statsGrid}>
        <View style={styles.statBox}>
          <Text style={styles.statValor}>{stats?.carreras ?? 0}</Text>
          <Text style={styles.statLabel}>carreras</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValor}>{((stats?.totalKm ?? 0) / 1000).toFixed(1)}</Text>
          <Text style={styles.statLabel}>km totales</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValor}>{formatDuracion(stats?.totalSegundos ?? 0)}</Text>
          <Text style={styles.statLabel}>tiempo total</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValor}>{formatRitmo(stats?.ritmoMedio)}</Text>
          <Text style={styles.statLabel}>ritmo medio total</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValor}>{totalConquistas}</Text>
          <Text style={styles.statLabel}>histórico barrios conquistados</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValor}>{maxBarriosSimultaneos}</Text>
          <Text style={styles.statLabel}>máximo barrios a la vez</Text>
        </View>
      </View>

      {/* Barrios conquistados */}
      <SeccionTitulo icon="flag-checkered">Barrios conquistados ({barrios.length})</SeccionTitulo>
      {barrios.length === 0 ? (
        <EstadoVacio titulo="Aún no has conquistado ningún barrio" subtitulo="¡Sal a correr y conquista tu zona!" />
      ) : (
        barrios.map(barrio => (
          <View key={barrio.id} style={styles.barrioFila}>
            <View style={[styles.barrioIcono, styles.barrioIconoConquista]}>
              <Text style={styles.barrioIconoTexto}>🚩</Text>
            </View>
            <View style={styles.barrioInfo}>
              <Text style={styles.barrioNombre}>{barrio.nombreVisible ?? barrio.nombre}</Text>
              <Text style={styles.barrioPuntos}>
                {(barrio.misMarcas ?? barrio.duenoPuntos).toLocaleString()} pts acumulados
              </Text>
            </View>
          </View>
        ))
      )}

      {/* Barrios en disputa */}
      {barriosEnDisputa.length > 0 && (
        <>
          <SeccionTitulo icon="sword-cross">Zonas en disputa ({barriosEnDisputa.length})</SeccionTitulo>
          {barriosEnDisputa.map(barrio => {
            const progreso = barrio.duenoPuntos > 0
              ? Math.min(1, barrio.misMarcas / barrio.duenoPuntos)
              : 1;
            return (
              <View key={barrio.id} style={styles.barrioFila}>
                <View style={[styles.barrioIcono, styles.barrioIconoDisputa]}>
                  <Text style={styles.barrioIconoTexto}>⚔️</Text>
                </View>
                <View style={styles.barrioInfo}>
                  <Text style={styles.barrioNombre}>{barrio.nombreVisible ?? barrio.nombre}</Text>
                  <Text style={styles.barrioPuntos}>
                    {barrio.misMarcas.toLocaleString()} pts · rival {barrio.duenoPuntos.toLocaleString()} pts
                  </Text>
                  <View style={styles.disputaTrack}>
                    <View style={[styles.disputaRelleno, { width: `${Math.round(progreso * 100)}%` }]} />
                  </View>
                </View>
              </View>
            );
          })}
        </>
      )}

      {/* Logros */}
      <SeccionTitulo icon="medal-outline">Logros ({logros.length}/{LOGROS.length})</SeccionTitulo>
      <Text style={styles.logrosIntro}>
        Cada logro suma puntos una sola vez y refuerza el territorio donde más hayas puntuado en esa carrera.
      </Text>

      {racha > 0 && (
        <View style={styles.rachaBox}>
          <Text style={styles.rachaTexto}>🔥 Racha actual: {racha} día{racha !== 1 ? 's' : ''} seguidos</Text>
        </View>
      )}

      <View style={styles.logrosGrid}>
        {LOGROS.map(logro => {
          const desbloqueado = logros.includes(logro.id);
          return (
            <View key={logro.id} style={[styles.logroBox, desbloqueado ? styles.logroBoxDesbloqueado : styles.logroBoxBloqueado]}>
              <Text style={styles.logroEmoji}>{desbloqueado ? logro.emoji : '🔒'}</Text>
              <Text style={styles.logroNombre}>
                {logro.nombre}
              </Text>
              <Text style={styles.logroDesc}>
                {logro.desc}
              </Text>
              {desbloqueado ? (
                <View style={styles.logroMultBadge}>
                  <Text style={styles.logroMultTexto}>+{logro.bonus.toLocaleString()} pts</Text>
                </View>
              ) : (
                <Text style={styles.logroMultBloqueado}>+{logro.bonus.toLocaleString()} pts</Text>
              )}
            </View>
          );
        })}
      </View>

      {/* Grupos */}
      <View style={styles.seccion}>
        <SeccionTitulo icon="bell-outline">Notificaciones</SeccionTitulo>
        <Text style={styles.privacidadTexto}>
          Recibe avisos cuando conquistes un territorio, te lo quiten o desbloquees un logro.
        </Text>
        {estadoNotif === 'granted' && (
          <View style={styles.notifFila}>
            <View style={[styles.notifPunto, { backgroundColor: '#22c55e' }]} />
            <Text style={styles.notifTexto}>Notificaciones activadas</Text>
          </View>
        )}
        {estadoNotif === 'denied' && (
          <View>
            <View style={styles.notifFila}>
              <View style={[styles.notifPunto, { backgroundColor: '#ef4444' }]} />
              <Text style={styles.notifTexto}>Notificaciones desactivadas</Text>
            </View>
            <TouchableOpacity
              style={styles.botonNotif}
              onPress={() => Linking.openSettings()}
            >
              <Text style={styles.botonNotifTexto}>Abrir ajustes del sistema</Text>
            </TouchableOpacity>
          </View>
        )}
        {(estadoNotif === 'undetermined' || estadoNotif === null) && (
          <TouchableOpacity
            style={styles.botonNotif}
            onPress={async () => {
              const uid = auth.currentUser?.uid;
              if (!uid) return;
              await registrarNotificaciones(uid);
              await prepararSolicitudResena(uid);
              obtenerEstadoPermiso().then(setEstadoNotif).catch(() => {});
            }}
          >
            <Text style={styles.botonNotifTexto}>Activar notificaciones</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.seccion}>
        <SeccionTitulo icon="information-outline">ConqueRun</SeccionTitulo>
        <Text style={styles.privacidadTexto}>
          Tu reseña ayuda a que más corredores descubran el juego de conquistar la ciudad.
        </Text>
        <TouchableOpacity style={styles.botonNotif} onPress={() => abrirResenaManual().catch(() => {})}>
          <Text style={styles.botonNotifTexto}>Valorar ConqueRun</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.seccion}>
        <SeccionTitulo icon="shield-outline">Privacidad y seguridad</SeccionTitulo>
        <Text style={styles.privacidadTexto}>
          ConqueRun usa tu email para la cuenta, tu ubicación solo mientras grabas carreras, y tus fotos se revisan antes de mostrarse públicamente. Puedes solicitar la eliminación de tu cuenta y datos desde aquí.
        </Text>
        <TouchableOpacity style={styles.botonEliminar} onPress={confirmarEliminacion}>
          <Text style={styles.botonEliminarTexto}>Solicitar eliminación de cuenta</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.botonSalir} onPress={() => signOut(auth)}>
        <Text style={styles.botonSalirTexto}>Cerrar sesión</Text>
      </TouchableOpacity>

    </ScrollView>
    </ImageBackground>

    {/* Modal eliminación de cuenta */}
    <Modal visible={mostrarModalEliminar} transparent animationType="fade">
      <View style={styles.eliminarOverlay}>
        <View style={styles.eliminarCard}>
          <Text style={styles.eliminarTitulo}>Eliminar cuenta</Text>
          <Text style={styles.eliminarTexto}>
            Esta acción borrará permanentemente tu cuenta, territorios, historial y datos. No se puede deshacer.
          </Text>
          <Text style={styles.eliminarTexto}>Introduce tu contraseña para confirmar:</Text>
          <TextInput
            style={styles.eliminarInput}
            placeholder="Contraseña"
            placeholderTextColor={colors.subdued}
            secureTextEntry
            value={passwordEliminar}
            onChangeText={setPasswordEliminar}
            autoFocus
          />
          <View style={styles.eliminarBotones}>
            <TouchableOpacity
              style={styles.eliminarBotonCancelar}
              onPress={() => setMostrarModalEliminar(false)}
              disabled={eliminando}
            >
              <Text style={styles.eliminarBotonCancelarTexto}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.eliminarBotonConfirmar, (!passwordEliminar.trim() || eliminando) && { opacity: 0.5 }]}
              onPress={ejecutarEliminacion}
              disabled={!passwordEliminar.trim() || eliminando}
            >
              <Text style={styles.eliminarBotonConfirmarTexto}>
                {eliminando ? 'Eliminando...' : 'Eliminar'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* Modal de instrucciones */}
    <Modal visible={mostrarInfo} transparent animationType="slide">
      <View style={styles.infoOverlay}>
        <View style={styles.infoCard}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.infoTitulo}>Cómo funciona ConqueRun</Text>

            {[
              {
                emoji: '🚩',
                titulo: 'Conquista barrios',
                texto: 'Corre por cualquier zona de tu ciudad. Si tus puntos superan los del dueño actual de ese barrio, pasa a ser tuyo.',
              },
              {
                emoji: '⭐',
                titulo: 'Gana puntos con cada carrera',
                texto: 'Los puntos dependen de la distancia y el ritmo. Mínimo 200 m y 1 minuto para que cuente. El ritmo base son 5:00 min/km.',
              },
              {
                emoji: '🏆',
                titulo: 'Ranking de ciudad',
                texto: 'Compites por barrios conquistados dentro de tu ritmo de conquista. Los puntos sirven para conquistar y desempatar.',
              },
              {
                emoji: '👥',
                titulo: 'Grupos',
                texto: 'Únete o crea grupos. Cada carrera que hagas suma los mismos puntos al grupo, fomentando la colaboración sin ventajas por tamaño.',
              },
              {
                emoji: '🏅',
                titulo: 'Logros',
                texto: 'Se desbloquean automáticamente al alcanzar hitos: distancias, rachas, barrios conquistados y más.',
              },
              {
                emoji: '🔒',
                titulo: 'Defiende tu territorio',
                texto: 'Si otro corredor pasa por un barrio tuyo y te supera en puntos, te lo arrebata. Vuelve a correr por ahí para recuperarlo.',
              },
            ].map((item, i) => (
              <View key={i} style={styles.infoItem}>
                <Text style={styles.infoEmoji}>{item.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoItemTitulo}>{item.titulo}</Text>
                  <Text style={styles.infoItemTexto}>{item.texto}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.infoCerrar} onPress={() => setMostrarInfo(false)}>
            <Text style={styles.infoCerrarTexto}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

    {/* Modal segmentos de ritmo */}
    <Modal visible={mostrarSegmentosRitmo} transparent animationType="slide">
      <View style={styles.infoOverlay}>
        <View style={styles.infoCard}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.infoTitulo}>Ritmos de conquista</Text>

            {SEGMENTOS_RITMO.map(segmento => {
              const activo = segmento.id === segmentoRitmo;
              return (
                <View
                  key={segmento.id}
                  style={[styles.segmentoRitmoFila, activo && styles.segmentoRitmoFilaActiva]}
                >
                  <View>
                    <Text style={[styles.segmentoRitmoNombre, activo && styles.segmentoRitmoNombreActivo]}>
                      {segmento.nombre}
                    </Text>
                    <Text style={styles.segmentoRitmoRango}>{formatoRangoRitmo(segmento)}</Text>
                  </View>
                  {activo && ritmo30d && (
                    <View style={styles.segmentoRitmoActualBox}>
                      <Text style={styles.segmentoRitmoActualLabel}>Ritmo de los últimos 30 días</Text>
                      <Text style={styles.segmentoRitmoActual}>
                        {formatRitmo(ritmo30d)}/km
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={styles.infoCerrar} onPress={() => setMostrarSegmentosRitmo(false)}>
            <Text style={styles.infoCerrarTexto}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </>
      )}
    </View>
  );
}


function SeccionTitulo({ icon, children }) {
  return (
    <View style={seccionTituloStyle.fila}>
      <MaterialCommunityIcons name={icon} size={16} color="#C6F432" style={seccionTituloStyle.icono} />
      <Text style={seccionTituloStyle.texto}>{children}</Text>
    </View>
  );
}

const seccionTituloStyle = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  icono: { marginRight: 7 },
  texto: { fontSize: 13, fontWeight: '700', color: '#C6F432', textTransform: 'uppercase', letterSpacing: 0.8 },
});

const styles = StyleSheet.create({
  selectorPrincipal: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  selectorTab: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
  },
  selectorTabActivo: {
    borderBottomWidth: 2,
    borderBottomColor: colors.gold,
  },
  selectorTabTexto: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.subdued,
  },
  selectorTabTextoActivo: {
    color: colors.gold,
  },
  imageFondo: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3,7,18,0.78)' },
  container: { flex: 1 },
  contenido: { padding: 20, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 28 },
  botonInfo: {
    position: 'absolute', top: 0, right: 0,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', zIndex: 1,
  },
  botonInfoTexto: { color: colors.muted, fontSize: 16, fontWeight: 'bold' },
  infoOverlay: {
    flex: 1, backgroundColor: '#000000aa',
    justifyContent: 'flex-end',
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, maxHeight: '85%',
  },
  infoTitulo: {
    fontSize: 20, fontWeight: '900', color: colors.text,
    marginBottom: 20,
  },
  infoItem: {
    flexDirection: 'row', gap: 14, marginBottom: 18, alignItems: 'flex-start',
  },
  infoEmoji: { fontSize: 26, marginTop: 2 },
  infoItemTitulo: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 3 },
  infoItemTexto: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  infoCerrar: {
    backgroundColor: colors.gold, borderRadius: radius.md,
    padding: 14, alignItems: 'center', marginTop: 16,
  },
  infoCerrarTexto: { color: colors.bg, fontWeight: '900', fontSize: 15 },
  avatarWrapper: { marginBottom: 12, position: 'relative' },
  avatar: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center',
  },
  avatarFoto: { width: 90, height: 90, borderRadius: 45 },
  avatarTexto: { fontSize: 38, fontWeight: 'bold', color: colors.text },
  avatarEditar: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: colors.surface, borderRadius: 14,
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
    borderColor: colors.border, borderWidth: 1,
  },
  avatarEditarTexto: { fontSize: 14 },
  fotoPendienteTexto: { color: colors.gold, fontSize: 12, marginBottom: 8 },
  fotoRechazadaTexto: { color: colors.conquest, fontSize: 12, marginBottom: 8, textAlign: 'center' },
  nickname: { fontSize: 24, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  segmentoPerfilTexto: { fontSize: 12, color: colors.gold, fontWeight: '800', marginBottom: 4 },
  segmentoRitmoBoton: {
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: 'rgba(214,170,76,0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  segmentoRitmoBotonContenido: { flex: 1, alignItems: 'center' },
  segmentoRitmoTexto: { fontSize: 16, color: colors.gold, fontWeight: '900' },
  segmentoRitmoSubtexto: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: 3 },
  segmentoRitmoChevron: { color: colors.gold, fontSize: 24, fontWeight: '900', lineHeight: 24 },
  segmentoRitmoFila: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  segmentoRitmoFilaActiva: { borderColor: colors.gold, backgroundColor: 'rgba(214,170,76,0.10)' },
  segmentoRitmoNombre: { color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 4 },
  segmentoRitmoNombreActivo: { color: colors.gold },
  segmentoRitmoRango: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  segmentoRitmoActualBox: { alignItems: 'flex-end', flexShrink: 1 },
  segmentoRitmoActualLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 3,
    textAlign: 'right',
  },
  segmentoRitmoActual: { color: colors.gold, fontSize: 14, fontWeight: '900' },
  botonEditarPerfil: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 10,
  },
  botonEditarPerfilTexto: { color: colors.subdued, fontSize: 13, fontWeight: 'bold' },
  rankingResumen: {
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 8,
  },
  rankingResumenLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  rankingResumenValor: {
    color: colors.gold,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 1,
  },
  multBadge: {
    backgroundColor: '#38bdf820', borderColor: colors.route, borderWidth: 1,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
  },
  multTexto: { color: colors.route, fontSize: 13, fontWeight: 'bold' },

  seccion: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 24 },
  seccionTitulo: { fontSize: 16, fontWeight: 'bold', color: colors.text, marginBottom: 12 },
  inputLabel: { fontSize: 13, color: colors.muted, marginBottom: 6 },
  input: {
    backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, padding: 12, color: colors.text, fontSize: 15, marginBottom: 14,
  },
  ciudadSelector: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ciudadSelectorDesactivado: { opacity: 0.55 },
  ciudadSelectorInfo: { flex: 1, paddingRight: 12 },
  ciudadSelectorNombre: { color: colors.text, fontSize: 15, fontWeight: '700' },
  ciudadSelectorPais: { color: colors.muted, fontSize: 12, marginTop: 2 },
  ciudadChevron: { color: colors.muted, fontSize: 12 },
  paisConquistaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  paisConquistaBoton: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  paisConquistaBotonActivo: {
    backgroundColor: '#C6F43218',
    borderColor: colors.gold,
  },
  paisConquistaTexto: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  paisConquistaTextoActivo: { color: colors.gold },
  paisProximamente: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  paisProximamenteTexto: { color: colors.subdued, fontSize: 12, fontStyle: 'italic' },
  ciudadBusqueda: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    marginBottom: 4,
  },
  ciudadListaScroll: {
    maxHeight: 220,
  },
  ciudadLista: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 14,
    overflow: 'hidden',
  },
  ciudadVacia: { color: colors.muted, fontSize: 13, padding: 12 },
  ciudadOpcion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  ciudadOpcionActiva: { backgroundColor: '#C6F43218' },
  ciudadOpcionNombre: { color: colors.text, fontSize: 15, fontWeight: '700' },
  ciudadOpcionPais: { color: colors.muted, fontSize: 12, marginTop: 2 },
  ciudadCheck: { color: colors.gold, fontSize: 16, fontWeight: '900' },
  botonFoto: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 13,
    alignItems: 'center',
    marginBottom: 16,
  },
  botonFotoTexto: { color: colors.text, fontSize: 14, fontWeight: 'bold' },
  ayudaPerfil: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 14 },
  botonGuardar: {
    backgroundColor: colors.gold, borderRadius: 10,
    padding: 14, alignItems: 'center', marginTop: 4,
  },
  botonGuardarTexto: { color: colors.bg, fontSize: 15, fontWeight: 'bold' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  statBox: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 16,
    alignItems: 'center', width: '47%',
  },
  statValor: { fontSize: 22, fontWeight: 'bold', color: colors.text },
  statLabel: { fontSize: 12, color: colors.muted, marginTop: 4, textAlign: 'center' },

  rachaBox: {
    backgroundColor: '#C6F43220', borderColor: colors.gold, borderWidth: 1,
    borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 14,
  },
  rachaTexto: { color: colors.gold, fontSize: 15, fontWeight: 'bold' },

  logrosIntro: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: -4,
    marginBottom: 14,
  },
  logrosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  logroBox: {
    borderRadius: 12, padding: 12, alignItems: 'center', width: '47%',
  },
  logroBoxDesbloqueado: {
    backgroundColor: '#C6F43218',
    borderColor: colors.gold,
    borderWidth: 1,
  },
  logroBoxBloqueado: {
    backgroundColor: '#111827',
    borderColor: colors.border,
    borderWidth: 1,
  },
  logroEmoji: { fontSize: 28, marginBottom: 6 },
  logroNombre: { fontSize: 13, fontWeight: 'bold', color: colors.text, textAlign: 'center', marginBottom: 2 },
  logroDesc: { fontSize: 11, color: colors.muted, textAlign: 'center', marginBottom: 6 },
  logroMultBadge: {
    backgroundColor: '#38bdf820', borderColor: colors.route, borderWidth: 1,
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  logroMultTexto: { color: colors.route, fontSize: 11, fontWeight: 'bold' },
  logroMultBloqueado: { color: colors.subdued, fontSize: 11, fontWeight: 'bold' },


  barrioFila: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 12,
    padding: 14, marginBottom: 8,
  },
  barrioIcono: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#C6F43220', alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  barrioIconoConquista: { backgroundColor: '#ef344420', borderColor: '#ef3444', borderWidth: 1 },
  barrioIconoDisputa: { backgroundColor: '#C6F43220', borderColor: colors.gold, borderWidth: 1 },
  disputaTrack: {
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 6,
  },
  disputaRelleno: {
    height: '100%',
    backgroundColor: colors.gold,
    borderRadius: 2,
  },
  barrioIconoTexto: { fontSize: 18 },
  barrioInfo: { flex: 1 },
  barrioNombre: { fontSize: 16, fontWeight: 'bold', color: colors.text },
  barrioPuntos: { fontSize: 13, color: colors.muted, marginTop: 2 },

  botonSalir: {
    marginTop: 24, backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1,
    padding: 16, borderRadius: 12, alignItems: 'center',
  },
  botonSalirTexto: { color: '#e63946', fontSize: 16, fontWeight: 'bold' },
  privacidadTexto: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  notifFila: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  notifPunto: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  notifTexto: { color: colors.text, fontSize: 14 },
  botonNotif: {
    backgroundColor: '#1e2d45',
    borderColor: colors.border,
    borderWidth: 1,
    padding: 13,
    borderRadius: 10,
    alignItems: 'center',
  },
  botonNotifTexto: { color: colors.gold ?? '#C6F432', fontSize: 14, fontWeight: '600' },
  botonEliminar: {
    backgroundColor: '#2a1215',
    borderColor: '#e63946',
    borderWidth: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  botonEliminarTexto: { color: '#e63946', fontSize: 14, fontWeight: 'bold' },

  eliminarOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', padding: 24,
  },
  eliminarCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: 24, borderColor: '#e63946', borderWidth: 1,
  },
  eliminarTitulo: { fontSize: 18, fontWeight: '900', color: '#e63946', marginBottom: 12 },
  eliminarTexto: { fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: 10 },
  eliminarInput: {
    backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, padding: 13, color: colors.text,
    fontSize: 15, marginTop: 4, marginBottom: 20,
  },
  eliminarBotones: { flexDirection: 'row', gap: 10 },
  eliminarBotonCancelar: {
    flex: 1, padding: 13, borderRadius: radius.md,
    backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1,
    alignItems: 'center',
  },
  eliminarBotonCancelarTexto: { color: colors.text, fontWeight: 'bold' },
  eliminarBotonConfirmar: {
    flex: 1, padding: 13, borderRadius: radius.md,
    backgroundColor: '#e63946', alignItems: 'center',
  },
  eliminarBotonConfirmarTexto: { color: '#fff', fontWeight: '900' },
});
