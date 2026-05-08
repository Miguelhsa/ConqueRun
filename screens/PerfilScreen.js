import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, Alert, Modal, ImageBackground, Linking } from 'react-native';
import { EstadoVacio, PantallaCargando } from '../components/ui';
import { auth, db } from '../firebaseConfig';
import { signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, setDoc, serverTimestamp, where } from 'firebase/firestore';
import { refRanking } from '../utils/rankingsCiudad';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { obtenerBarrios } from '../utils/barrios';
import { obtenerMisGrupos } from '../utils/grupos';
import { LOGROS } from '../utils/logros';
import { formatDuracion, formatRitmo } from '../utils/formatters';
import { PAISES } from '../utils/paises';
import { FOTO_ESTADOS, fotoAprobada, eliminarCuentaCompleta } from '../utils/moderacion';
import { obtenerEstadoPermiso, registrarNotificaciones } from '../utils/notificaciones';
import { colors, radius } from '../utils/theme';


export default function PerfilScreen() {
  const [stats, setStats] = useState(null);
  const [nickname, setNickname] = useState('');
  const [pais, setPais] = useState(null);
  const [fechaNacimiento, setFechaNacimiento] = useState(null);
  const [fechaNacimientoInput, setFechaNacimientoInput] = useState('');
  const [fotoPerfil, setFotoPerfil] = useState(null);
  const [fotoPerfilEstado, setFotoPerfilEstado] = useState(null);
  const [fotoPendiente, setFotoPendiente] = useState(null);
  const [barrios, setBarrios] = useState([]);
  const [barriosEnDisputa, setBarriosEnDisputa] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [posicionRanking, setPosicionRanking] = useState(null);
  const [ciudadNombre, setCiudadNombre] = useState(null);
  const [ciudadActualId, setCiudadActualId] = useState(null);
  const [logros, setLogros] = useState([]);
  const [racha, setRacha] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mostrarPaises, setMostrarPaises] = useState(false);
  const [editando, setEditando] = useState(false);
  const [mostrarEditorPerfil, setMostrarEditorPerfil] = useState(false);
  const [mostrarInfo, setMostrarInfo] = useState(false);
  const [mostrarModalEliminar, setMostrarModalEliminar] = useState(false);
  const [passwordEliminar, setPasswordEliminar] = useState('');
  const [eliminando, setEliminando] = useState(false);
  const [estadoNotif, setEstadoNotif] = useState(null);

  useEffect(() => {
    cargarPerfil();
    obtenerEstadoPermiso().then(setEstadoNotif).catch(() => {});
  }, []);

  const cargarPerfil = async () => {
    try {
      const uid = auth.currentUser.uid;

      const userSnap = await getDoc(doc(db, 'usuarios', uid));
      if (userSnap.exists()) {
        const data = userSnap.data();
        setNickname(data.nickname ?? '');
        setPais(data.pais ?? null);
        setFechaNacimiento(data.fechaNacimiento ?? null);
        setFotoPerfil(data.fotoPerfil ?? null);
        setFotoPerfilEstado(data.fotoPerfilEstado ?? null);
        setFotoPendiente(data.fotoPendiente ?? null);
        setLogros(data.logros ?? []);
        setRacha(data.racha ?? 0);
        setCiudadNombre(data.ciudadActualNombre ?? null);
        setCiudadActualId(data.ciudadActualId ?? null);
        setStats({
          carreras: data.carrerasTotal ?? 0,
          totalKm: data.distanciaTotal ?? 0,
          totalSegundos: data.duracionTotal ?? 0,
          ritmoMedio: data.distanciaTotal > 0 ? ((data.duracionTotal ?? 0) / ((data.distanciaTotal ?? 1) / 1000)) : 0,
        });
      }

      // Posición en ranking usando rankingsCiudad en vez de leer todos los usuarios
      const ciudadId = userSnap.exists() ? userSnap.data().ciudadActualId : null;

      // Marcas territoriales desde subcolección (sin límite de campos en el doc usuario)
      const marcasSnap = ciudadId
        ? await getDocs(query(collection(db, 'usuarios', uid, 'marcasTerritoriales'), where('ciudadId', '==', ciudadId)))
        : null;
      const marcas = marcasSnap
        ? Object.fromEntries(marcasSnap.docs.map(d => [d.id, d.data().puntos ?? 0]))
        : {};

      if (ciudadId) {
        const { cargarPosicionUsuario, cargarTotalCorredoresCiudad } = await import('../utils/rankingsCiudad');
        const userData = userSnap.exists() ? userSnap.data() : {};
        const [pos, total] = await Promise.all([
          cargarPosicionUsuario(ciudadId, userData.puntosTotales ?? 0),
          cargarTotalCorredoresCiudad(ciudadId),
        ]);
        if (pos !== null) setPosicionRanking(pos);
      }
      const todosBarrios = await obtenerBarrios(ciudadId);
      setBarrios(
        todosBarrios
          .filter(b => b.dueno === uid)
          .map(b => ({ ...b, misMarcas: marcas[b.id] ?? b.duenoPuntos }))
          .sort((a, b) => b.misMarcas - a.misMarcas)
      );
      setBarriosEnDisputa(
        todosBarrios
          .filter(b => b.top10?.some(e => e.uid === uid) && b.dueno !== uid)
          .map(b => ({ ...b, misMarcas: marcas[b.id] ?? b.top10?.find(e => e.uid === uid)?.puntos ?? 0 }))
          .sort((a, b) => b.misMarcas - a.misMarcas)
      );

      const misGrupos = await obtenerMisGrupos();
      setGrupos(misGrupos);

    } catch (e) {
      console.error(e);
    } finally {
      setCargando(false);
    }
  };

  const seleccionarFoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      const uid = auth.currentUser.uid;
      let fotoUrl = fotoPendiente;
      const fechaNacimientoNormalizada = fechaNacimiento ? null : normalizarFechaNacimiento(fechaNacimientoInput);

      if (fechaNacimientoInput.trim() && !fechaNacimientoNormalizada) {
        Alert.alert('Fecha no válida', 'Escribe tu fecha de nacimiento como DD/MM/AAAA');
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
        ...(pais ? { pais } : {}),
        ...(fechaNacimientoNormalizada
          ? {
              fechaNacimiento: fechaNacimientoNormalizada,
              fechaNacimientoGuardadaEn: serverTimestamp(),
            }
          : {}),
        ...(fotoPendiente && fotoPendiente.startsWith('file://')
          ? {
              fotoPendiente: fotoUrl,
              fotoPerfilEstado: FOTO_ESTADOS.PENDIENTE,
              fotoMotivoRechazo: null,
              fotoRevisadaEn: null,
            }
          : {}),
      }, { merge: true });

      // Sincronizar nickname y pais en rankingsCiudad para que el ranking refleje el cambio inmediatamente
      if (ciudadActualId) {
        setDoc(refRanking(ciudadActualId, uid), {
          nickname,
          ...(pais ? { pais } : {}),
        }, { merge: true }).catch(() => {});
      }

      if (fotoPendiente && fotoPendiente.startsWith('file://')) {
        setFotoPendiente(fotoUrl);
        setFotoPerfilEstado(FOTO_ESTADOS.PENDIENTE);
      }
      if (fechaNacimientoNormalizada) {
        setFechaNacimiento(fechaNacimientoNormalizada);
        setFechaNacimientoInput('');
      }
      setEditando(false);
      setMostrarEditorPerfil(false);
      Alert.alert('Perfil guardado', fotoPendiente?.startsWith('file://')
        ? 'Tu foto queda pendiente de revisión antes de mostrarse públicamente'
        : 'Tus cambios se han guardado');
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar el perfil');
    } finally {
      setGuardando(false);
    }
  };

  const normalizarFechaNacimiento = (valor) => {
    const limpio = valor.trim();
    if (!limpio) return null;

    const match = limpio.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;

    const dia = Number(match[1]);
    const mes = Number(match[2]);
    const anio = Number(match[3]);
    const fecha = new Date(anio, mes - 1, dia);
    const ahora = new Date();

    if (
      fecha.getFullYear() !== anio ||
      fecha.getMonth() !== mes - 1 ||
      fecha.getDate() !== dia ||
      fecha > ahora ||
      anio < 1900
    ) {
      return null;
    }

    return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
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

        <Text style={styles.nickname}>{pais?.bandera ? `${pais.bandera} ` : ''}{nickname}</Text>
        <Text style={styles.email}>{auth.currentUser?.email}</Text>

        <TouchableOpacity
          style={styles.botonEditarPerfil}
          onPress={() => setMostrarEditorPerfil(v => !v)}
        >
          <Text style={styles.botonEditarPerfilTexto}>
            {mostrarEditorPerfil ? 'Cerrar edición' : 'Modificar perfil'}
          </Text>
        </TouchableOpacity>

        {posicionRanking > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeTexto}>#{posicionRanking} en {ciudadNombre ?? 'tu ciudad'}</Text>
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

          {!pais ? (
            <>
              <Text style={styles.inputLabel}>País</Text>
              <TouchableOpacity
                style={styles.paisSelector}
                onPress={() => setMostrarPaises(!mostrarPaises)}
              >
                <Text style={styles.paisTexto}>Selecciona tu país</Text>
                <Text style={styles.paisChevron}>{mostrarPaises ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {mostrarPaises && (
                <View style={styles.paisLista}>
                  {PAISES.map(p => (
                    <TouchableOpacity
                      key={p.nombre}
                      style={styles.paisOpcion}
                      onPress={() => { setPais(p); setMostrarPaises(false); setEditando(true); }}
                    >
                      <Text style={styles.paisOpcionTexto}>{p.bandera}  {p.nombre}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          ) : (
            <Text style={styles.ayudaPerfil}>
              El país ya está guardado. Si necesitas corregirlo, contacta con soporte.
            </Text>
          )}

          {!fechaNacimiento ? (
            <>
              <Text style={styles.inputLabel}>Fecha de nacimiento</Text>
              <TextInput
                style={styles.input}
                value={fechaNacimientoInput}
                onChangeText={v => { setFechaNacimientoInput(v); setEditando(true); }}
                placeholder="DD/MM/AAAA"
                placeholderTextColor={colors.subdued}
                keyboardType="number-pad"
                maxLength={10}
              />
              <Text style={styles.ayudaPerfil}>
                No se mostrará en tu perfil. La usaremos solo si más adelante activamos categorías o funciones por edad.
              </Text>
            </>
          ) : (
            <Text style={styles.ayudaPerfil}>
              La fecha de nacimiento ya está guardada y no se muestra en tu perfil.
            </Text>
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
      <Text style={styles.seccionTitulo}>📊 Mis estadísticas</Text>
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
          <Text style={styles.statLabel}>ritmo medio</Text>
        </View>
      </View>

      {/* Barrios conquistados */}
      <Text style={styles.seccionTitulo}>🚩 Barrios conquistados ({barrios.length})</Text>
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
          <Text style={styles.seccionTitulo}>⚔️ Zonas en disputa ({barriosEnDisputa.length})</Text>
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
      <Text style={styles.seccionTitulo}>🏅 Logros ({logros.length}/{LOGROS.length})</Text>
      <Text style={styles.logrosIntro}>
        Cada logro desbloquea un bonus de puntos que se suma una sola vez a tu total.
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
      <Text style={styles.seccionTitulo}>👥 Mis grupos ({grupos.length})</Text>
      {grupos.length === 0 ? (
        <EstadoVacio titulo="No perteneces a ningún grupo" subtitulo="Únete o crea uno en la pestaña Grupos." />
      ) : (
        grupos.map(grupo => (
          <View key={grupo.id} style={styles.barrioFila}>
            <View style={styles.barrioIcono}>
              <Text style={styles.barrioIconoTexto}>👥</Text>
            </View>
            <View style={styles.barrioInfo}>
              <Text style={styles.barrioNombre}>{grupo.nombre}</Text>
              <Text style={styles.barrioPuntos}>
                {grupo.miembros.length} miembros · {((grupo.distanciaTotal ?? 0) / 1000).toFixed(0)} km · {grupo.puntosTotales ?? 0} pts
              </Text>
            </View>
            <Text style={{ color: grupo.esPublico ? colors.route : colors.muted, fontSize: 12 }}>
              {grupo.esPublico ? '🌍' : '🔒'}
            </Text>
          </View>
        ))
      )}

      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>🔔 Notificaciones</Text>
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
              obtenerEstadoPermiso().then(setEstadoNotif).catch(() => {});
            }}
          >
            <Text style={styles.botonNotifTexto}>Activar notificaciones</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>Privacidad y seguridad</Text>
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
                texto: 'Tus puntos totales te sitúan en el ranking de corredores de tu ciudad. Se actualiza en tiempo real.',
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
    </>
  );
}

const styles = StyleSheet.create({
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
  nickname: { fontSize: 24, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  email: { fontSize: 13, color: colors.subdued, marginBottom: 10 },
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
  badge: {
    backgroundColor: colors.surface, borderColor: colors.gold, borderWidth: 1,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 8,
  },
  badgeTexto: { color: colors.gold, fontSize: 13, fontWeight: 'bold' },
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
  paisSelector: {
    backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, padding: 12, marginBottom: 8,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  paisTexto: { color: colors.text, fontSize: 15 },
  paisChevron: { color: colors.muted, fontSize: 12 },
  paisLista: {
    backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, marginBottom: 14, overflow: 'hidden',
  },
  paisOpcion: { padding: 12, borderBottomColor: colors.border, borderBottomWidth: 1 },
  paisOpcionActiva: { backgroundColor: '#d6aa4c20' },
  paisOpcionTexto: { color: colors.text, fontSize: 15 },
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
  statLabel: { fontSize: 12, color: colors.muted, marginTop: 4 },

  rachaBox: {
    backgroundColor: '#d6aa4c20', borderColor: colors.gold, borderWidth: 1,
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
    backgroundColor: '#d6aa4c18',
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
    backgroundColor: '#d6aa4c20', alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  barrioIconoConquista: { backgroundColor: '#ef344420', borderColor: '#ef3444', borderWidth: 1 },
  barrioIconoDisputa: { backgroundColor: '#d6aa4c20', borderColor: colors.gold, borderWidth: 1 },
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
  botonNotifTexto: { color: colors.gold ?? '#d6aa4c', fontSize: 14, fontWeight: '600' },
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
