import { useState, useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';

if (!__DEV__) {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  console.info = () => {};
  console.debug = () => {};
}
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import * as LocalAuthentication from 'expo-local-authentication';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { auth, db } from './firebaseConfig';
import './utils/trackingCarrera';
import { registrarNotificaciones } from './utils/notificaciones';
import { colors } from './utils/theme';
import { calcularDistanciaFiltrada, obtenerMetaTracking, obtenerRutaTracking } from './utils/trackingCarrera';
import { formatTiempo } from './utils/formatters';
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

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [tieneNickname, setTieneNickname] = useState(false);
  const [tieneCiudad, setTieneCiudad] = useState(false);
  const [onboardingCompletado, setOnboardingCompletado] = useState(false);
  const [onboardingPendiente, setOnboardingPendiente] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);
  const [biometriaBloqueada, setBiometriaBloqueada] = useState(false);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [mostrandoIntro, setMostrandoIntro] = useState(true);
  const [carreraActiva, setCarreraActiva] = useState(null);
  const [notifPendientes, setNotifPendientes] = useState([]);
  const loginManualRef = useRef(false);

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
          if (!loginManualRef.current) {
            setBiometriaBloqueada(await debeUsarBiometria());
          }
          loginManualRef.current = false;
          const perfil = await comprobarPerfil(user.uid);
          if (perfil?.onboardingCompletado) {
            registrarNotificaciones(user.uid).catch(() => {});
            cargarNotifPendientes(user.uid).catch(() => {});
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setCargandoSesion(false);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => setMostrandoIntro(false), 1800);
    return () => clearTimeout(timeout);
  }, []);

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

      const distancia = meta.distanciaAcumulada ?? calcularDistanciaFiltrada(ruta);
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
    const perdidas = pendientes.filter(n =>
      n.tipo === 'territorio_perdido' || n.tipo === 'territorio_perdido_grupo'
    );
    if (perdidas.length > 0) setNotifPendientes(perdidas);
    await updateDoc(doc(db, 'usuarios', uid, 'privado', 'notificaciones'), {
      notificacionesPendientes: [],
    });
  };

  const debeUsarBiometria = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;

    const inscrito = await LocalAuthentication.isEnrolledAsync();
    return Boolean(inscrito);
  };

  if (mostrandoIntro || cargandoSesion) {
    return (
      <SplashIntro cargando={cargandoSesion} />
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
    return <CiudadScreen onGuardado={() => setTieneCiudad(true)} />;
  }
  if (onboardingPendiente && !onboardingCompletado) {
    return <OnboardingScreen onCompletado={() => {
      setOnboardingCompletado(true);
      setOnboardingPendiente(false);
    }} />;
  }

  return (
    <NavigationContainer>
      <View style={styles.appShell}>

      <Modal visible={notifPendientes.length > 0} transparent animationType="fade">
        <View style={styles.notifOverlay}>
          <View style={styles.notifCard}>
            <Text style={styles.notifTitulo}>⚔️ Territorios perdidos</Text>
            <Text style={styles.notifSubtitulo}>
              Mientras estabas fuera perdiste {notifPendientes.length === 1 ? 'este barrio' : 'estos barrios'}:
            </Text>
            {notifPendientes.map((n, i) => (
              <View key={i} style={styles.notifFila}>
                <Text style={styles.notifBullet}>🏴</Text>
                <View>
                  <Text style={styles.notifNombre}>{n.nombre}</Text>
                  {n.tipo === 'territorio_perdido_grupo' && (
                    <Text style={styles.notifGrupo}>
                      {n.grupoNombre}{n.grupoGanadorNombre ? ` · conquistado por ${n.grupoGanadorNombre}` : ''}
                    </Text>
                  )}
                </View>
              </View>
            ))}
            <TouchableOpacity style={styles.notifBoton} onPress={() => setNotifPendientes([])}>
              <Text style={styles.notifBotonTexto}>¡Voy a recuperarlo!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: TAB_BAR_HEIGHT },
          tabBarActiveTintColor: colors.gold,
          tabBarInactiveTintColor: colors.subdued,
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          tabBarIcon: TabIcon(iconoTab(route.name), route.name === 'Correr' && Boolean(carreraActiva)),
        })}
      >
        <Tab.Screen name="Mapa" component={MapaScreen} />
        <Tab.Screen name="Ranking" component={RankingScreen} />
        <Tab.Screen name="Correr" component={CorrerScreen} />
        <Tab.Screen name="Perfil" component={PerfilScreen} />
        {esAdmin && (
          <Tab.Screen
            name="Admin"
            component={ModeracionScreen}
            options={{ title: 'Moderación', tabBarLabel: 'Admin' }}
          />
        )}
      </Tab.Navigator>
        <ConquistandoBanner carrera={carreraActiva} />
      </View>
    </NavigationContainer>
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


function ConquistandoBanner({ carrera }) {
  if (!carrera) return null;

  return (
    <View style={styles.conquistandoBanner}>
      <Text style={styles.conquistandoTitulo}>{carrera.pausada ? 'Pausado' : 'Conquistando'}</Text>
      <Text style={styles.conquistandoDato}>{(carrera.distancia / 1000).toFixed(2)} km</Text>
      <Text style={styles.conquistandoDato}>{formatTiempo(carrera.segundos)}</Text>
    </View>
  );
}

function SplashIntro({ cargando }) {
  return (
    <View style={styles.splash}>
      <Image
        source={require('./assets/conquerun-logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      {cargando && <ActivityIndicator color={colors.gold} size="small" />}
    </View>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  conquistandoBanner: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: TAB_BAR_HEIGHT,
    backgroundColor: colors.conquest,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  conquistandoTitulo: {
    color: colors.text,
    fontSize: 13,
    fontWeight: 'bold',
  },
  conquistandoDato: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: 28,
  },
  logo: {
    width: '86%',
    maxWidth: 420,
    aspectRatio: 1,
    marginBottom: 18,
  },
  notifOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 24,
  },
  notifCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#4a3000',
  },
  notifTitulo: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 10,
  },
  notifSubtitulo: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 16,
    lineHeight: 20,
  },
  notifFila: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    gap: 10,
  },
  notifBullet: { fontSize: 16 },
  notifGrupo: { fontSize: 12, color: '#64748b', marginTop: 1 },
  notifNombre: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f8fafc',
    flex: 1,
  },
  notifBoton: {
    marginTop: 20,
    backgroundColor: '#d6aa4c',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  notifBotonTexto: {
    color: '#080b14',
    fontSize: 15,
    fontWeight: '800',
  },
});
