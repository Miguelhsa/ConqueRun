import './utils/cryptoPolyfill';
import { useState, useEffect, useRef, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync().catch(() => {});

if (!__DEV__) {
  console.log = () => {};
  console.warn = () => {};
  console.error = (msg, ...args) => registrarError(msg instanceof Error ? msg : new Error(String(msg)));
  console.info = () => {};
  console.debug = () => {};
}
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AppState, Linking, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as LocalAuthentication from 'expo-local-authentication';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { auth, db } from './firebaseConfig';
import { registrarNotificaciones } from './utils/notificaciones';
import { prepararSolicitudResena } from './utils/reviews';
import * as Notifications from 'expo-notifications';
import { colors } from './utils/theme';
import { diagnosticarAppCheck } from './utils/appCheckDiagnostics';
import { obtenerMetaTracking, obtenerRutaTracking, resolverDistanciaTracking } from './utils/trackingCarrera';
import { enviarCarrerasPendientesBackground } from './utils/carrerasPendientes';
import { guardarStravaUrl } from './utils/stravaDeepLink';
import { formatTiempo } from './utils/formatters';
import ToastNotificacion from './components/ToastNotificacion';
import ErrorBoundary from './components/ErrorBoundary';
import { registrarError, identificarUsuario } from './utils/monitoring';
import BiometricUnlockScreen from './screens/BiometricUnlockScreen';
import CiudadScreen from './screens/CiudadScreen';
import LoginScreen from './screens/LoginScreen';
import NicknameScreen from './screens/NicknameScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import MapaScreen from './screens/MapaScreen';
import RankingScreen from './screens/RankingScreen';
import CorrerScreen from './screens/CorrerScreen';
import PerfilScreen from './screens/PerfilScreen';
import ModeracionScreen from './screens/ModeracionScreen';

const Tab = createBottomTabNavigator();
const TAB_BAR_HEIGHT = 84;

const STORE_URL = Platform.OS === 'ios'
  ? 'https://apps.apple.com/app/id6772089442'
  : 'https://play.google.com/store/apps/details?id=com.conquerun.app';

const versionPart = (valor) => {
  const numero = Number.parseInt(String(valor ?? '0'), 10);
  return Number.isFinite(numero) ? numero : 0;
};

const compararVersion = (a, b) => {
  const pa = String(a).split('.').map(versionPart);
  const pb = String(b).split('.').map(versionPart);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

const SPLASH_MIN_MS = 2500;
const biometricPreferenceKey = (uid) => `conqurun:biometria_habilitada:${uid}`;

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [tieneNickname, setTieneNickname] = useState(false);
  const [tieneCiudad, setTieneCiudad] = useState(false);
  const [onboardingCompletado, setOnboardingCompletado] = useState(false);
  const [onboardingPendiente, setOnboardingPendiente] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);
  const [biometriaBloqueada, setBiometriaBloqueada] = useState(false);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const splashInicioRef = useRef(Date.now());

  const [comprobandoVersion, setComprobandoVersion] = useState(true);
  const [actualizacionRequerida, setActualizacionRequerida] = useState(false);
  const [carreraActiva, setCarreraActiva] = useState(null);
  const [notifPendientes, setNotifPendientes] = useState([]);
  const [toast, setToast] = useState(null);
  const loginManualRef = useRef(false);

  const tabScreenOptions = useCallback(({ route }) => ({
    tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: TAB_BAR_HEIGHT },
    tabBarActiveTintColor: colors.gold,
    tabBarInactiveTintColor: colors.subdued,
    headerStyle: { backgroundColor: colors.bg },
    headerTintColor: colors.text,
    tabBarIcon: TabIcon(iconoTab(route.name), route.name === 'Correr' && Boolean(carreraActiva)),
  }), [carreraActiva]);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'config', 'app'));
        if (!snap.exists()) return;
        const { versionMinima } = snap.data();
        if (!versionMinima) return;
        const versionActual = Application.nativeApplicationVersion ?? '0.0.0';
        if (compararVersion(versionActual, versionMinima) < 0) {
          setActualizacionRequerida(true);
        }
      } catch {
        // Fail-open: si no hay red o Firestore no responde, no bloqueamos el arranque.
      } finally {
        setComprobandoVersion(false);
      }
    })();
  }, []);

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(notif => {
      const { title, body } = notif.request.content;
      if (title || body) setToast({ titulo: title ?? null, cuerpo: body ?? null });
    });
    return () => sub.remove();
  }, []);

  // Captura deep links de Strava en cold launch antes de que CorrerScreen monte
  useEffect(() => {
    Linking.getInitialURL().then(url => { if (url) guardarStravaUrl(url); }).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => guardarStravaUrl(url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        setUsuario(user);
        setTieneNickname(false);
        setTieneCiudad(false);
        setOnboardingCompletado(false);
        setOnboardingPendiente(false);
        setEsAdmin(false);
        setBiometriaBloqueada(false);

        if (user) {
          identificarUsuario(user.uid);
          if (!loginManualRef.current) {
            setBiometriaBloqueada(await debeUsarBiometria(user.uid));
          }
          loginManualRef.current = false;
          const perfil = await comprobarPerfil(user.uid);
          if (perfil?.onboardingCompletado) {
            prepararPostOnboarding(user.uid);
            cargarNotifPendientes(user.uid).catch(() => {});
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        const elapsed = Date.now() - splashInicioRef.current;
        const restante = Math.max(0, SPLASH_MIN_MS - elapsed);
        setTimeout(() => setCargandoSesion(false), restante);
      }
    });

    return unsubscribe;
  }, []);

  const reintentarCarrerasPendientes = useCallback(() => {
    const uid = auth.currentUser?.uid;
    if (uid) enviarCarrerasPendientesBackground(uid).catch(() => {});
  }, []);

  // Retry global de carreras pendientes: funciona aunque CorrerScreen no esté montada
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      reintentarCarrerasPendientes();
    });
    return () => sub.remove();
  }, [reintentarCarrerasPendientes]);

  useEffect(() => {
    if (!usuario || biometriaBloqueada || !tieneNickname || !tieneCiudad || (onboardingPendiente && !onboardingCompletado)) return;
    reintentarCarrerasPendientes();
  }, [usuario, biometriaBloqueada, tieneNickname, tieneCiudad, onboardingPendiente, onboardingCompletado, reintentarCarrerasPendientes]);

  useEffect(() => {
    if (!usuario || biometriaBloqueada) return;
    diagnosticarAppCheck().catch(() => {});
  }, [usuario, biometriaBloqueada]);

  useEffect(() => {
    if (!usuario || biometriaBloqueada || !tieneNickname || (onboardingPendiente && !onboardingCompletado)) {
      setCarreraActiva(null);
      return undefined;
    }

    const actualizarCarreraActiva = async () => {
      const [meta, ruta] = await Promise.all([
        obtenerMetaTracking(),
        obtenerRutaTracking(),
      ]);

      if (!meta) {
        setCarreraActiva(null);
        return;
      }

      const { distancia } = resolverDistanciaTracking(ruta, meta);
      const ahoraParaTiempo = meta.pausada && meta.pausadaEn ? meta.pausadaEn : Date.now();
      const segundos = Math.max(0, Math.floor((ahoraParaTiempo - meta.iniciadaEn - (meta.tiempoPausadoMs ?? 0)) / 1000));
      setCarreraActiva({ distancia, segundos, pausada: Boolean(meta.pausada) });
    };

    actualizarCarreraActiva().catch(console.error);
    const interval = setInterval(() => {
      actualizarCarreraActiva().catch(console.error);
    }, 1000);

    return () => clearInterval(interval);
  }, [usuario, biometriaBloqueada, tieneNickname, onboardingPendiente, onboardingCompletado]);

  const comprobarPerfil = async (uid) => {
    const snap = await getDoc(doc(db, 'usuarios', uid));
    const data = snap.exists() ? snap.data() : {};
    setTieneNickname(Boolean(data.nickname));
    setTieneCiudad(Boolean(data.ciudadActualId) || Boolean(data.ciudadActualNombre));
    setOnboardingCompletado(Boolean(data.onboardingCompletado));
    setOnboardingPendiente(Boolean(data.onboardingPendiente));
    setEsAdmin(Boolean(data.esAdmin));
    return data;
  };

  const cargarNotifPendientes = async (uid) => {
    const snap = await getDoc(doc(db, 'usuarios', uid, 'privado', 'notificaciones'));
    if (!snap.exists()) return;
    const pendientes = snap.data().notificacionesPendientes ?? [];
    if (pendientes.length === 0) return;
    const visibles = pendientes.filter(n =>
      n.tipo === 'territorio_perdido' ||
      n.tipo === 'territorio_perdido_grupo' ||
      n.tipo === 'territorio_ganado_grupo'
    );
    if (visibles.length > 0) setNotifPendientes(visibles);
  };

  const confirmarNotifPendientes = async () => {
    setNotifPendientes([]);
    if (!usuario?.uid) return;
    try {
      const marcarLeidas = httpsCallable(getFunctions(), 'marcarNotificacionesPendientesLeidas');
      await marcarLeidas();
    } catch (e) {
      console.warn('[App] No se pudieron marcar notificaciones como leídas:', e);
    }
  };

  const prepararPostOnboarding = (uid) => {
    registrarNotificaciones(uid)
      .catch(() => {})
      .finally(() => prepararSolicitudResena(uid).catch(() => {}));
  };

  const debeUsarBiometria = async (uid) => {
    if (!uid) return false;
    const biometriaHabilitada = await AsyncStorage.getItem(biometricPreferenceKey(uid));
    if (biometriaHabilitada !== 'true') return false;

    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;

    const inscrito = await LocalAuthentication.isEnrolledAsync();
    return Boolean(inscrito);
  };

  useEffect(() => {
    if (!cargandoSesion && !comprobandoVersion) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [cargandoSesion, comprobandoVersion]);

  if (cargandoSesion || comprobandoVersion) return null;

  if (actualizacionRequerida) {
    return (
      <View style={styles.updateScreen}>
        <MaterialCommunityIcons name="arrow-up-circle-outline" size={56} color="#C6F432" />
        <Text style={styles.updateTitulo}>Actualización necesaria</Text>
        <Text style={styles.updateTexto}>
          Esta versión de ConqueRun ya no está soportada. Actualiza para seguir conquistando.
        </Text>
        <TouchableOpacity style={styles.updateBoton} onPress={() => Linking.openURL(STORE_URL)}>
          <Text style={styles.updateBotonTexto}>Actualizar ahora</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!usuario) {
    return <LoginScreen onLogin={() => {
      loginManualRef.current = true;
      setBiometriaBloqueada(false);
    }} />;
  }
  if (biometriaBloqueada) {
    return <BiometricUnlockScreen onUnlocked={() => setBiometriaBloqueada(false)} />;
  }
  if (!tieneNickname) {
    return <NicknameScreen onGuardado={() => {
      setTieneNickname(true);
      setOnboardingPendiente(true);
    }} />;
  }
  if (!tieneCiudad) {
    return <CiudadScreen uid={usuario.uid} onGuardado={() => setTieneCiudad(true)} />;
  }
  if (onboardingPendiente && !onboardingCompletado) {
    return <OnboardingScreen uid={usuario.uid} onCompletado={() => {
      setOnboardingCompletado(true);
      setOnboardingPendiente(false);
      if (usuario?.uid) prepararPostOnboarding(usuario.uid);
    }} />;
  }

  return (
    <ErrorBoundary>
    <NavigationContainer>
      <View style={styles.appShell}>

      <Modal visible={notifPendientes.length > 0} transparent animationType="fade">
        <View style={styles.notifOverlay}>
          <View style={styles.notifCard}>
            <View style={styles.notifHeader}>
              <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#FF4F2E" />
              <Text style={styles.notifTitulo}>Novedades de territorios</Text>
            </View>
            <Text style={styles.notifSubtitulo}>
              Mientras estabas fuera hubo {notifPendientes.length === 1 ? 'este cambio' : 'estos cambios'}:
            </Text>
            {notifPendientes.map((n, i) => (
              <View key={i} style={styles.notifFila}>
                <MaterialCommunityIcons
                  name={n.tipo === 'territorio_ganado_grupo' ? 'flag-variant' : 'flag-remove'}
                  size={16}
                  color={n.tipo === 'territorio_ganado_grupo' ? '#C6F432' : '#FF4F2E'}
                />
                <View style={styles.notifFilaTexto}>
                  <Text style={styles.notifNombre}>{n.nombre}</Text>
                  {n.tipo === 'territorio_perdido_grupo' && (
                    <Text style={styles.notifGrupo}>
                      {n.grupoNombre}{n.grupoGanadorNombre ? ` · conquistado por ${n.grupoGanadorNombre}` : ''}
                    </Text>
                  )}
                  {n.tipo === 'territorio_ganado_grupo' && (
                    <Text style={styles.notifGrupo}>
                      {n.grupoNombre ? `${n.grupoNombre} lo conquistó` : 'Tu equipo lo conquistó'}
                    </Text>
                  )}
                </View>
              </View>
            ))}
            <TouchableOpacity style={styles.notifBoton} onPress={confirmarNotifPendientes}>
              <Text style={styles.notifBotonTexto}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Tab.Navigator screenOptions={tabScreenOptions}>
        <Tab.Screen name="Ranking" component={RankingScreen} />
        <Tab.Screen name="Correr" component={CorrerScreen} />
        <Tab.Screen name="Mapa" component={MapaScreen} />
        <Tab.Screen name="Perfil" component={PerfilScreen} />
        {esAdmin && (
          <Tab.Screen
            name="Admin"
            component={ModeracionScreen}
            options={{ title: 'Moderación', tabBarLabel: 'Admin' }}
          />
        )}
      </Tab.Navigator>

      <ToastNotificacion toast={toast} onOcultar={() => setToast(null)} />
      </View>
    </NavigationContainer>
    </ErrorBoundary>
  );
}

const iconoTab = (name) => ({
  Perfil: 'account-circle',
  Ranking: 'trophy',
  Correr: 'run-fast',
  Mapa: 'map-marker-radius',
  Admin: 'shield-check',
}[name]);

const TabIcon = (name, alertaActiva = false) => ({ color, size, focused }) => (
  <MaterialCommunityIcons
    name={name}
    color={alertaActiva ? colors.conquest : color}
    size={focused ? size + 2 : size}
  />
);




const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  notifOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    padding: 24,
  },
  notifCard: {
    backgroundColor: '#0A0A0A',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#C6F432',
    overflow: 'hidden',
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  notifTitulo: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F2EFE8',
    flex: 1,
    letterSpacing: 0.2,
  },
  notifSubtitulo: {
    fontSize: 13,
    color: '#555',
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 4,
    lineHeight: 18,
  },
  notifFila: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 12,
    marginTop: 8,
  },
  notifFilaTexto: { flex: 1 },
  notifGrupo: { fontSize: 11, color: '#4a4a4a', marginTop: 2 },
  notifNombre: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F2EFE8',
  },
  notifBoton: {
    margin: 16,
    marginTop: 12,
    backgroundColor: '#C6F432',
    borderRadius: 10,
    padding: 13,
    alignItems: 'center',
  },
  notifBotonTexto: {
    color: '#080b14',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  updateScreen: {
    flex: 1,
    backgroundColor: '#080b14',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 16,
  },
  updateTitulo: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F2EFE8',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  updateTexto: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 21,
  },
  updateBoton: {
    marginTop: 8,
    backgroundColor: '#C6F432',
    borderRadius: 12,
    paddingHorizontal: 36,
    paddingVertical: 14,
  },
  updateBotonTexto: {
    color: '#080b14',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
