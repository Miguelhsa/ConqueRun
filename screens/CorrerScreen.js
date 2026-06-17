import { useState, useEffect, useRef } from 'react';
import { ActivityIndicator, AppState, Platform, View, Text, TouchableOpacity, StyleSheet, Alert, Modal, ScrollView, ImageBackground, Linking } from 'react-native';
import { RouteLine, TerritoryMap } from '../components/map/MapAdapter';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { db, auth } from '../firebaseConfig';
import { serverTimestamp, collection, doc, getDoc, getDocs, orderBy, query, setDoc, Timestamp, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { obtenerBarriosSegmentados, buildIndiceEspacial, calcularBarrio, calcularResumenTerritorial, invalidarCacheTerritorios } from '../utils/barrios';
import { notificarLogro, notificarSegmento } from '../utils/notificaciones';
import {
  calcularPuntos,
  obtenerMisGrupos,
  validarCarrera,
} from '../utils/grupos';
import { normalizarCarrera, esCarreraPuntuable } from '../utils/carreras';
import {
  guardarCarreraPendiente,
  obtenerCarrerasPendientes,
  eliminarCarreraPendiente,
  enviarCarrerasPendientesConGuard,
} from '../utils/carrerasPendientes';
import { consumirStravaUrl } from '../utils/stravaDeepLink';
import { registrarError, registrarEvento } from '../utils/monitoring';
import DetalleCarreraScreen from './DetalleCarreraScreen';
import { LOGROS } from '../utils/logros';
import { pedirResenaSiProcede } from '../utils/reviews';
import { calcularAvisoProximoSegmento, calcularSegmentos30d, calcularSegmentosDesdePerfilYRitmo, SEGMENTOS_RITMO } from '../utils/segmentos';
import { obtenerCiudadCercana, CIUDAD_FALLBACK } from '../utils/ciudades';
import { colors, radius } from '../utils/theme';
import { FontAwesome6, MaterialCommunityIcons } from '@expo/vector-icons';
import { formatTiempo, formatRitmo } from '../utils/formatters';
import {
  GPS_ACCURACY_MAX_METROS,
  GPS_TIMEOUT_SIN_SENYAL_MS,
  agregarPuntosTracking,
  actualizarMetaTracking,
  esperarEscriturasTracking,
  limpiarTrackingCarrera,
  iniciarTrackingCarrera,
  iniciarTrackingPrimerPlano,
  obtenerMetaTracking,
  obtenerRutaTracking,
  pausarTrackingCarrera,
  pararTrackingCarrera,
  prepararTrackingCarrera,
  reanudarTrackingCarrera,
  registrarEstadoServicioTracking,
  resolverDistanciaTracking,
  simplificarRutaParaGuardar,
  trackingSegundoPlanoActivo,
} from '../utils/trackingCarrera';

const STRAVA_CLIENT_ID = '238442';
const STRAVA_REDIRECT_URI = 'https://us-central1-conquerrun-8d30e.cloudfunctions.net/stravaOAuthCallback';

const crearCarreraId = (uid) => `${uid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default function CorrerScreen() {
  const [corriendo, setCorriendo] = useState(false);
  const [gpsDebil, setGpsDebil] = useState(false);
  const [distancia, setDistancia] = useState(0);
  const [segundos, setSegundos] = useState(0);
  const [barrioActual, setBarrioActual] = useState(null);
  const [ciudadActual, setCiudadActual] = useState(CIUDAD_FALLBACK);
  const [trackingSegundoPlano, setTrackingSegundoPlano] = useState(false);
  const [preparandoGps, setPreparandoGps] = useState(false);
  const [resumenCarrera, setResumenCarrera] = useState(null);
  const [pausada, setPausada] = useState(false);
  const [confirmarFin, setConfirmarFin] = useState(false);
  const [selectorGrupoFin, setSelectorGrupoFin] = useState({ visible: false, grupos: [] });
  const [carrerasRecientes, setCarrerasRecientes] = useState([]);
  const [carreraDetalle, setCarreraDetalle] = useState(null);
  const [mostrarInfoPuntos, setMostrarInfoPuntos] = useState(false);
  const [ritmoActual, setRitmoActual] = useState(null);
  const [stravaModalVisible, setStravaModalVisible] = useState(false);
  const [stravaConectado, setStravaConectado] = useState(false);
  const [importandoStrava, setImportandoStrava] = useState(false);
  const [desconectandoStrava, setDesconectandoStrava] = useState(false);
  const [carrerasPendientesCount, setCarrerasPendientesCount] = useState(0);
  const [finalizandoCarrera, setFinalizandoCarrera] = useState(false);
  const timerRef = useRef(null);
  const foregroundWatchRef = useRef(null);
  const barriosRef = useRef([]);
  const indiceBarriosRef = useRef(null);
  const segmentoBarriosRef = useRef(null);
  const barrioCargadoEnRef = useRef(0);
  const ciudadRef = useRef(CIUDAD_FALLBACK);
  const perfilRef = useRef({});
  const rutaRef = useRef([]);
  const distanciaRef = useRef(0);
  const segundosRef = useRef(0);
  const resolverGrupoFinRef = useRef(null);
  const esperandoStravaRef = useRef(false);
  const gpsDebilRef = useRef(false);
  const barrioNombreRef = useRef(null);
  const ritmoActualRef = useRef(null);
  const preparandoGpsRef = useRef(false);
  const finalizandoCarreraRef = useRef(false);
  const ultimoReintentoServicioRef = useRef(0);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    foregroundWatchRef.current?.remove();
    foregroundWatchRef.current = null;
  }, []);

  useEffect(() => {
    comprobarCarreraPendiente().catch(console.error);
    cargarUbicacionInicial().catch(console.error);
    cargarCarrerasRecientes().catch(console.error);
    enviarCarrerasPendientes().catch(console.error);
  }, []);

  const cargarCarrerasRecientes = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const [userSnap, privadoSnap, carrerasSnap] = await Promise.all([
      getDoc(doc(db, 'usuarios', uid)),
      getDoc(doc(db, 'usuarios', uid, 'privado', 'datos')),
      getDocs(query(
        collection(db, 'carreras'),
        where('uid', '==', uid),
        where('fecha', '>=', Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000)),
        orderBy('fecha', 'desc'),
      )),
    ]);
    setStravaConectado(Boolean(userSnap.exists() && userSnap.data().stravaConectado));
    setCarrerasRecientes(carrerasSnap.docs.map(d => normalizarCarrera({ id: d.id, ...d.data() })));
    const perfilData = {
      ...(userSnap.exists() ? userSnap.data() : {}),
      ...(privadoSnap.exists() ? privadoSnap.data() : {}),
    };
    if (!perfilData.segmentoCompetitivo) {
      Object.assign(perfilData, calcularSegmentosDesdePerfilYRitmo(perfilData, perfilData.ritmo30d ?? null));
    }
    perfilRef.current = perfilData;
  };

  const clasificarTerritorio = (territorioCarrera, uid) => territorioCarrera.reduce((acc, barrio) => {
    const puntosEfectivos = barrio.puntosAcumuladosUsuario ?? barrio.puntos;
    if (barrio.dueno === uid) {
      acc.defendidas.push(`${barrio.nombre} · ${(barrio.distanciaMetros / 1000).toFixed(2)} km`);
    } else if (!barrio.dueno || puntosEfectivos > (barrio.duenoPuntos ?? 0)) {
      acc.conquistadas.push(`${barrio.nombre} · ${(barrio.distanciaMetros / 1000).toFixed(2)} km`);
    } else {
      acc.rivalesPendientes.push({
        nombre: barrio.nombre,
        puntosDueno: barrio.duenoPuntos ?? 0,
        puntosCarrera: puntosEfectivos,
      });
    }

    return acc;
  }, {
    conquistadas: [],
    defendidas: [],
    rivalesPendientes: [],
  });

  const BARRIOS_CACHE_TTL_MS = 10 * 60 * 1000;

  const cargarCiudadYBarrios = async (punto) => {
    const segmentoActual = perfilRef.current?.segmentoCompetitivo ?? null;
    const cacheValido = barriosRef.current.length > 0
      && segmentoBarriosRef.current === segmentoActual
      && Date.now() - barrioCargadoEnRef.current < BARRIOS_CACHE_TTL_MS;
    if (cacheValido) return;

    const ciudadCercana = await obtenerCiudadCercana(punto);
    setCiudadActual(ciudadCercana);
    ciudadRef.current = ciudadCercana;
    const perfil = perfilRef.current;
    barriosRef.current = await obtenerBarriosSegmentados(ciudadCercana.id, perfil.segmentoCompetitivo);
    segmentoBarriosRef.current = perfil.segmentoCompetitivo ?? null;
    indiceBarriosRef.current = buildIndiceEspacial(barriosRef.current);
    barrioCargadoEnRef.current = Date.now();
  };

  const sincronizarTracking = async ({ forzarRecalculo = false } = {}) => {
    const [rutaTracking, metaTracking] = await Promise.all([
      obtenerRutaTracking(),
      obtenerMetaTracking(),
    ]);

    const distanciaInfo = resolverDistanciaTracking(rutaTracking, metaTracking, { forzarRecalculo });
    const distanciaActual = distanciaInfo.distancia;
    const ahoraParaTiempo = metaTracking?.pausada && metaTracking.pausadaEn
      ? metaTracking.pausadaEn
      : Date.now();
    const segundosActuales = metaTracking?.iniciadaEn
      ? Math.max(0, Math.floor((ahoraParaTiempo - metaTracking.iniciadaEn - (metaTracking.tiempoPausadoMs ?? 0)) / 1000))
      : segundosRef.current;
    const ultimoPunto = rutaTracking[rutaTracking.length - 1];

    rutaRef.current = rutaTracking;
    distanciaRef.current = distanciaActual;
    segundosRef.current = segundosActuales;
    setDistancia(distanciaActual);
    setSegundos(segundosActuales);
    setPausada(Boolean(metaTracking?.pausada));

    if (!ultimoPunto) {
      return {
        ruta: rutaTracking,
        distancia: distanciaActual,
        segundos: segundosActuales,
        meta: metaTracking,
        ...distanciaInfo,
      };
    }

    const tiempoSinPunto = Date.now() - ultimoPunto.timestamp;
    const sinSenyal = tiempoSinPunto > GPS_TIMEOUT_SIN_SENYAL_MS;
    const precisionMala = ultimoPunto.accuracy != null && ultimoPunto.accuracy > GPS_ACCURACY_MAX_METROS;
    const nuevoGpsDebil = sinSenyal || precisionMala;
    if (nuevoGpsDebil !== gpsDebilRef.current) {
      gpsDebilRef.current = nuevoGpsDebil;
      setGpsDebil(nuevoGpsDebil);
      if (nuevoGpsDebil && ritmoActualRef.current !== null) {
        ritmoActualRef.current = null;
        setRitmoActual(null);
      }
      if (!nuevoGpsDebil) {
        // GPS recuperado: resetear el contador para que el próximo fallo reintente de inmediato.
        ultimoReintentoServicioRef.current = 0;
      }
    }

    // Si llevamos >30s sin GPS y el servicio de segundo plano debería estar activo,
    // intentar reiniciarlo. Reintento cada 60s para cubrir el caso en que el SO lo
    // mata repetidamente mientras la pantalla sigue apagada.
    if (
      sinSenyal &&
      !metaTracking?.pausada &&
      !finalizandoCarreraRef.current
    ) {
      const ahora = Date.now();
      if (ahora - ultimoReintentoServicioRef.current >= 60_000) {
        ultimoReintentoServicioRef.current = ahora;
        iniciarServicioContinuo('auto_restart_pantalla_apagada').catch(() => {});
      }
    }

    await cargarCiudadYBarrios(ultimoPunto);

    const barrio = calcularBarrio(ultimoPunto, indiceBarriosRef.current ?? barriosRef.current);
    if (barrio && barrio.nombre !== barrioNombreRef.current) {
      barrioNombreRef.current = barrio.nombre;
      setBarrioActual(barrio);
    }

    if (!nuevoGpsDebil) {
      const recientes = rutaTracking.slice(-5).filter(p => p.speed != null && p.speed > 0.4);
      if (recientes.length > 0) {
        const speedMedia = recientes.reduce((sum, p) => sum + p.speed, 0) / recientes.length;
        const nuevoRitmo = Math.round(1000 / speedMedia);
        if (nuevoRitmo !== ritmoActualRef.current) {
          ritmoActualRef.current = nuevoRitmo;
          setRitmoActual(nuevoRitmo);
        }
      } else if (ritmoActualRef.current !== null) {
        ritmoActualRef.current = null;
        setRitmoActual(null);
      }
    }

    return {
      ruta: rutaTracking,
      distancia: distanciaActual,
      segundos: segundosActuales,
      meta: metaTracking,
      ...distanciaInfo,
    };
  };

  const detenerWatcherPrimerPlano = () => {
    foregroundWatchRef.current?.remove();
    foregroundWatchRef.current = null;
  };

  const iniciarWatcherPrimerPlano = async () => {
    detenerWatcherPrimerPlano();
    setTrackingSegundoPlano(false);
    foregroundWatchRef.current = await iniciarTrackingPrimerPlano(() => {
      sincronizarTracking().catch(console.error);
    });
  };

  const iniciarServicioContinuo = async (motivo) => {
    try {
      await iniciarTrackingCarrera();
      const activo = await trackingSegundoPlanoActivo();
      if (!activo) throw new Error('TRACKING_SEGUNDO_PLANO_NO_ACTIVO');
      detenerWatcherPrimerPlano();
      setTrackingSegundoPlano(true);
      await registrarEstadoServicioTracking({ segundoPlano: true, motivo });
      registrarEvento('tracking_segundo_plano_activo', { motivo });
      return true;
    } catch (e) {
      await registrarEstadoServicioTracking({
        segundoPlano: false,
        motivo: `${motivo}_fallback_primer_plano`,
        error: e,
      }).catch(() => {});
      registrarError(e, `iniciarServicioContinuo:${motivo}`);
      return false;
    }
  };

  const iniciarTrackingDisponible = async ({ preferirSegundoPlano, motivo }) => {
    if (preferirSegundoPlano) {
      const activo = await iniciarServicioContinuo(motivo);
      if (activo) return true;
    }
    await iniciarWatcherPrimerPlano();
    await registrarEstadoServicioTracking({
      segundoPlano: false,
      motivo: `${motivo}_primer_plano`,
    }).catch(() => {});
    return false;
  };

  const obtenerUbicacionCierre = async () => {
    const conTimeout = (promise, ms) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('GPS_TIMEOUT_CIERRE')), ms)),
    ]);

    try {
      const ultima = await Location.getLastKnownPositionAsync({ maxAge: 10000, requiredAccuracy: 80 });
      if (ultima) return ultima;
    } catch {}

    return conTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      6000,
    );
  };

  const agregarPuntoCierreSeguro = async () => {
    try {
      const loc = await obtenerUbicacionCierre();
      await agregarPuntosTracking([loc], { origen: 'cierre' });
      return true;
    } catch (e) {
      registrarError(e, 'agregarPuntoCierreSeguro');
      return false;
    }
  };

  const prepararTrackingParaCierre = async () => {
    const metaAntes = await obtenerMetaTracking();
    const servicioActivo = metaAntes?.segundoPlano
      ? await trackingSegundoPlanoActivo().catch(() => false)
      : false;

    // Al volver de pantalla apagada, Android/iOS pueden estar entregando el último lote
    // del background task. Damos una ventana corta antes de parar el servicio.
    if (servicioActivo) {
      await esperar(1500);
      await esperarEscriturasTracking();
    }

    await agregarPuntoCierreSeguro();
    await esperarEscriturasTracking();

    const metaDespues = await obtenerMetaTracking();
    registrarEvento('tracking_cierre_preparado', {
      servicio_activo: Boolean(servicioActivo),
      segundo_plano: Boolean(metaDespues?.segundoPlano),
      background_eventos: metaDespues?.backgroundEventos ?? 0,
      background_puntos: metaDespues?.backgroundPuntos ?? 0,
      puntos_ruta: metaDespues?.puntosRutaTotal ?? 0,
      ultimo_origen: metaDespues?.ultimoOrigenTracking ?? 'none',
    });
  };

  const iniciarFinalizacionCarrera = () => {
    if (finalizandoCarreraRef.current) return false;
    finalizandoCarreraRef.current = true;
    setFinalizandoCarrera(true);
    return true;
  };

  const terminarFinalizacionCarrera = () => {
    finalizandoCarreraRef.current = false;
    setFinalizandoCarrera(false);
  };

  const calcularSegundosMeta = (meta) => {
    if (!meta?.iniciadaEn) return 0;
    const ahoraParaTiempo = meta.pausada && meta.pausadaEn ? meta.pausadaEn : Date.now();
    return Math.max(0, Math.floor((ahoraParaTiempo - meta.iniciadaEn - (meta.tiempoPausadoMs ?? 0)) / 1000));
  };

  const arrancarSincronizacion = () => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      sincronizarTracking().catch(console.error);
    }, 1000);
  };

  const obtenerPrimeraUbicacion = async () => {
    const conTimeout = (promise, ms) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('GPS_TIMEOUT')), ms)),
    ]);

    try {
      const ultima = await Location.getLastKnownPositionAsync({ maxAge: 30000, requiredAccuracy: 100 });
      if (ultima) return ultima;
    } catch {}

    try {
      return await conTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        20000,
      );
    } catch (e) {
      if (e.message === 'GPS_TIMEOUT') throw e;
      // Alta precisión no disponible, intentar con precisión menor
      return await conTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        15000,
      );
    }
  };

  const cargarUbicacionInicial = async () => {
    const permiso = await Location.getForegroundPermissionsAsync();
    if (permiso.status !== 'granted') return;

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const punto = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    };
    await cargarCiudadYBarrios(punto);
  };

  const continuarCarreraPendiente = async () => {
    const metaTracking = await obtenerMetaTracking();
    let usaSegundoPlano = false;

    if (!metaTracking?.pausada) {
      usaSegundoPlano = await iniciarTrackingDisponible({
        preferirSegundoPlano: true,
        motivo: 'continuar_carrera',
      });
    }

    setTrackingSegundoPlano(usaSegundoPlano);
    setPausada(Boolean(metaTracking?.pausada));
    await sincronizarTracking();
    setCorriendo(true);
    if (!metaTracking?.pausada) arrancarSincronizacion();
  };

  const descartarCarreraPendiente = async () => {
    clearInterval(timerRef.current);
    detenerWatcherPrimerPlano();
    await pararTrackingCarrera();
    await limpiarTrackingCarrera();
    rutaRef.current = [];
    distanciaRef.current = 0;
    segundosRef.current = 0;
    setDistancia(0);
    setSegundos(0);
    barrioNombreRef.current = null;
    setBarrioActual(null);
    setTrackingSegundoPlano(false);
    setPausada(false);
    setCorriendo(false);
  };

  const enviarCarrerasPendientes = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const result = await enviarCarrerasPendientesConGuard(uid, {
      onPendientes: total => setCarrerasPendientesCount(total),
      onProcesada: () => {
        setCarrerasPendientesCount(prev => Math.max(0, prev - 1));
        cargarCarrerasRecientes().catch(() => {});
      },
      onDescartada: () => setCarrerasPendientesCount(prev => Math.max(0, prev - 1)),
    });

    if (result?.enCurso) {
      const pendientes = await obtenerCarrerasPendientes();
      setCarrerasPendientesCount(pendientes.filter(c => c.uid === uid).length);
    }
  };

  const comprobarCarreraPendiente = async () => {
    const [rutaTracking, metaTracking] = await Promise.all([
      obtenerRutaTracking(),
      obtenerMetaTracking(),
    ]);

    if (!metaTracking || rutaTracking.length === 0) return;

    await sincronizarTracking();
    const { distancia: distanciaPendiente } = resolverDistanciaTracking(rutaTracking, metaTracking);
    const segundosPendientes = calcularSegundosMeta(metaTracking);
    Alert.alert(
      metaTracking.pausada ? 'Carrera pausada' : 'Carrera en curso',
      `${(distanciaPendiente / 1000).toFixed(2)} km · ${formatTiempo(segundosPendientes)}\n¿Quieres continuarla?`,
      [
        { text: 'Descartar', style: 'destructive', onPress: descartarCarreraPendiente },
        { text: 'Continuar', onPress: () => continuarCarreraPendiente().catch(console.error) },
      ]
    );
  };

  const iniciarCarrera = async () => {
    if (preparandoGpsRef.current || finalizandoCarreraRef.current) return;
    preparandoGpsRef.current = true;
    setPreparandoGps(true);
    const uid = auth.currentUser?.uid;
    if (!uid) {
      preparandoGpsRef.current = false;
      setPreparandoGps(false);
      Alert.alert('Sesión expirada', 'Inicia sesión de nuevo para correr.');
      return;
    }

    try {
      if (Object.keys(perfilRef.current).length === 0) {
        const [userSnap, privadoSnap] = await Promise.all([
          getDoc(doc(db, 'usuarios', uid)),
          getDoc(doc(db, 'usuarios', uid, 'privado', 'datos')),
        ]);
        perfilRef.current = {
          ...(userSnap.exists() ? userSnap.data() : {}),
          ...(privadoSnap.exists() ? privadoSnap.data() : {}),
        };
        if (!perfilRef.current.segmentoCompetitivo) {
          perfilRef.current = {
            ...perfilRef.current,
            ...calcularSegmentosDesdePerfilYRitmo(perfilRef.current, perfilRef.current.ritmo30d ?? null),
          };
        }
      }
      const consentimientoUbicacion = Boolean(perfilRef.current.consentimientoUbicacionCarrera);

      if (!consentimientoUbicacion) {
        const aceptado = await new Promise(resolve => {
          Alert.alert(
            'Uso de ubicación',
            'ConqueRun accede a tu ubicación GPS para grabar carreras. En el siguiente paso pediremos acceso incluso cuando la app esté cerrada o en segundo plano, necesario para no perder la ruta al bloquear el móvil.\n\nSe usa exclusivamente para medir distancia, ritmo y conquistar barrios. No se usa para publicidad ni se comparte con terceros.',
            [
              { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continuar', onPress: () => resolve(true) },
            ]
          );
        });

        if (!aceptado) return;

        await setDoc(doc(db, 'usuarios', uid), {
          consentimientoUbicacionCarrera: true,
          consentimientoUbicacionCarreraEn: serverTimestamp(),
        }, { merge: true });
      }

      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!canAskAgain) {
          Alert.alert(
            'Permiso de ubicación bloqueado',
            'Has denegado el acceso a la ubicación. Para correr, actívalo en Ajustes.',
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Abrir Ajustes', onPress: () => Linking.openSettings() },
            ]
          );
        } else {
          Alert.alert('Permiso denegado', 'Necesitamos acceso a tu ubicación para grabar la carrera.');
        }
        return;
      }

      let permiteSegundoPlano = false;
      try {
        const bgPermiso = await Location.getBackgroundPermissionsAsync();
        if (bgPermiso.status === 'granted') {
          permiteSegundoPlano = true;
        } else {
          const aceptaSegundoPlano = await new Promise(resolve => {
            Alert.alert(
              'Ubicación en segundo plano',
              'Para grabar la carrera completa cuando bloqueas el móvil o cambias de aplicación, ConqueRun necesita acceder a tu ubicación incluso cuando la app esté cerrada o no estés usándola.\n\nSin este permiso la ruta puede tener huecos.',
              [
                { text: 'Solo mientras uso la app', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Permitir siempre', onPress: () => resolve(true) },
              ],
            );
          });
          if (aceptaSegundoPlano) {
            try {
              const background = await Location.requestBackgroundPermissionsAsync();
              permiteSegundoPlano = background.status === 'granted';
            } catch {
              // El dispositivo no soporta permisos en segundo plano — seguimos en primer plano
            }
          }
        }
      } catch {
        // getBackgroundPermissionsAsync no disponible, mantener permiteSegundoPlano = false
      }

      setDistancia(0);
      setSegundos(0);
      barrioNombreRef.current = null;
      setBarrioActual(null);
      const solicitaServicioContinuo = true;
      setTrackingSegundoPlano(false);
      setPausada(false);
      rutaRef.current = [];
      distanciaRef.current = 0;
      segundosRef.current = 0;

      await prepararTrackingCarrera({
        segundoPlano: false,
        carreraId: crearCarreraId(uid),
        uid,
      });
      await actualizarMetaTracking({
        segundoPlanoSolicitado: solicitaServicioContinuo,
        segundoPlanoPermisoBackground: permiteSegundoPlano,
        plataforma: Platform.OS,
      });
      const loc = await obtenerPrimeraUbicacion();
      await agregarPuntosTracking([loc], { origen: 'inicio' });

      await iniciarTrackingDisponible({
        preferirSegundoPlano: solicitaServicioContinuo,
        motivo: 'inicio_carrera',
      });

      await sincronizarTracking();
      setCorriendo(true);
      arrancarSincronizacion();
    } catch (e) {
      await pararTrackingCarrera().catch(() => {});
      await limpiarTrackingCarrera().catch(() => {});
      let mensaje;
      if (e.message === 'GPS_TIMEOUT') {
        mensaje = 'No se pudo obtener tu ubicación. Sal al exterior e inténtalo de nuevo.';
      } else if (e.code === 'E_LOCATION_SERVICES_DISABLED') {
        mensaje = 'Activa la ubicación en los ajustes del sistema e inténtalo de nuevo.';
      } else if (e.code === 'E_LOCATION_UNAUTHORIZED') {
        mensaje = 'Permiso de ubicación denegado. Actívalo en Ajustes > Privacidad > Ubicación.';
      } else {
        mensaje = `No se pudo iniciar la carrera.\n\n${e.message ?? 'Error desconocido'}`;
      }
      Alert.alert('GPS no disponible', mensaje);
    } finally {
      preparandoGpsRef.current = false;
      setPreparandoGps(false);
    }
  };

  const pararCarrera = async () => {
    if (!iniciarFinalizacionCarrera()) return;
    try {
      const uidSesion = auth.currentUser?.uid;
      setCorriendo(false);
      setTrackingSegundoPlano(false);
      setPausada(false);
      clearInterval(timerRef.current);
      detenerWatcherPrimerPlano();
      await prepararTrackingParaCierre();
      await pararTrackingCarrera().catch(e => registrarError(e, 'pararTrackingCarrera'));
      await esperarEscriturasTracking();
      const trackingFinal = await sincronizarTracking({ forzarRecalculo: true });
      const rutaFinal = trackingFinal.ruta;
      const distanciaFinal = trackingFinal.distancia;
      const segundosFinales = trackingFinal.segundos;
      const uidMeta = typeof trackingFinal.meta?.uid === 'string' && trackingFinal.meta.uid
        ? trackingFinal.meta.uid
        : null;
      const uid = uidMeta ?? uidSesion;
      const sesionCoincide = Boolean(uid && uidSesion === uid);
      const carreraId = uid
        ? (typeof trackingFinal.meta?.carreraId === 'string' && trackingFinal.meta.carreraId.startsWith(`${uid}_`)
          ? trackingFinal.meta.carreraId
          : crearCarreraId(uid))
        : null;

    if (rutaFinal.length < 2) {
      await descartarCarreraTerminada(
        'Carrera terminada',
        'No se guarda porque todavía no hay suficiente recorrido registrado.'
      );
      return;
    }

    const ritmoMedio = distanciaFinal > 0 ? (segundosFinales / (distanciaFinal / 1000)) : 0;
    const validacion = validarCarrera(distanciaFinal, segundosFinales);

    if (!validacion.valida) {
      registrarEvento('carrera_descartada_cliente', {
        motivo: validacion.motivo,
        distancia_m: Math.round(distanciaFinal),
        distancia_acumulada_m: Math.round(trackingFinal.distanciaAcumulada ?? 0),
        distancia_recalculada_m: Math.round(trackingFinal.distanciaRecalculada ?? 0),
        puntos_ruta: rutaFinal.length,
        duracion_s: segundosFinales,
        segundo_plano: Boolean(trackingFinal.meta?.segundoPlano),
        background_eventos: trackingFinal.meta?.backgroundEventos ?? 0,
        background_puntos: trackingFinal.meta?.backgroundPuntos ?? 0,
        ultimo_origen_tracking: trackingFinal.meta?.ultimoOrigenTracking ?? 'none',
      });
      await descartarCarreraTerminada(
        'Carrera terminada',
        `No se guarda porque no cumple las condiciones: ${validacion.motivo}.`
      );
      return;
    }

    const rutaFiltrada = (() => {
      const filtrada = [rutaFinal[0]];
      let cortePendiente = false;
      for (let i = 1; i < rutaFinal.length; i++) {
        const p = rutaFinal[i];
        if (p.segmentStart || p.gapStart) {
          filtrada.push(p);
          cortePendiente = false;
          continue;
        }
        if (p.accuracy != null && p.accuracy > GPS_ACCURACY_MAX_METROS) {
          cortePendiente = true;
          continue;
        }
        filtrada.push(cortePendiente ? { ...p, gapStart: true } : p);
        cortePendiente = false;
      }
      return filtrada.length >= 2 ? filtrada : rutaFinal;
    })();
    const rutaParaEnviar = rutaFiltrada.length > 20000
      ? simplificarRutaParaGuardar(rutaFiltrada, { toleranciaMetros: 1, maxPuntos: 20000 })
      : rutaFiltrada;
    let grupoActivo = null;
    let pendingId = null;

    if (!uid || !carreraId) {
      await limpiarTrackingCarrera().catch(() => {});
      Alert.alert('Sesión expirada', 'No se pudo guardar la carrera porque la sesión no está disponible.');
      return;
    }

    if (!sesionCoincide) {
      const payload = {
        carreraId,
        ruta: rutaParaEnviar,
        distancia: Math.round(distanciaFinal),
        duracion: segundosFinales,
        grupoActivoId: null,
        ciudadId: ciudadRef.current.id,
      };
      const savedId = await guardarCarreraPendiente(uid, payload);
      if (savedId) {
        await limpiarTrackingCarrera();
        Alert.alert('Sesión expirada', 'Tu carrera se ha guardado en este dispositivo. Inicia sesión de nuevo para enviarla.');
      } else {
        Alert.alert('Error al guardar', 'No se pudo guardar la carrera localmente. Comprueba el almacenamiento del dispositivo e inténtalo de nuevo.');
      }
      return;
    }

    try {
      await cargarCiudadYBarrios(rutaFinal[0]);

      let misGrupos = [];
      try {
        misGrupos = await obtenerMisGrupos();
      } catch (e) {
        misGrupos = [];
      }
      grupoActivo = await seleccionarGrupoFinCarrera(misGrupos);

      // Guardar en pendientes antes de llamar al CF: si la app peta aquí la carrera
      // está en AsyncStorage y se reenvía automáticamente al volver.
      const payload = {
        carreraId,
        ruta: rutaParaEnviar,
        distancia: Math.round(distanciaFinal),
        duracion: segundosFinales,
        grupoActivoId: grupoActivo?.id ?? null,
        ciudadId: ciudadRef.current.id,
      };
      if (uid) {
        pendingId = await guardarCarreraPendiente(uid, payload);
        if (pendingId) {
          await limpiarTrackingCarrera();
          setCarrerasPendientesCount(prev => prev + 1);
        }
      }

      const puntos = calcularPuntos(distanciaFinal, ritmoMedio || 360);
      const segmentoAnterior = perfilRef.current.segmentoCompetitivo ?? null;
      const notificacionSegmentoAnterior = perfilRef.current.notificacionSegmentoClave ?? null;
      const segmentos = await calcularSegmentos30d({
        uid,
        perfil: perfilRef.current,
        carreraActual: {
          distancia: Math.round(distanciaFinal),
          duracion: segundosFinales,
        },
      });
      const cambioSegmento = segmentoAnterior && segmentos.segmentoCompetitivo !== segmentoAnterior;
      const avisoProximoSegmento = cambioSegmento
        ? null
        : calcularAvisoProximoSegmento(segmentos.ritmo30d, segmentos.segmentoRitmo);
      const claveNotificacionSegmento = cambioSegmento
        ? `cambio_${segmentos.segmentoCompetitivo}`
        : avisoProximoSegmento?.clave ?? null;
      const debeNotificarSegmento = Boolean(
        claveNotificacionSegmento &&
        claveNotificacionSegmento !== notificacionSegmentoAnterior
      );

      if (segmentos.segmentoCompetitivo !== perfilRef.current.segmentoCompetitivo) {
        perfilRef.current = { ...perfilRef.current, ...segmentos };
        barriosRef.current = await obtenerBarriosSegmentados(ciudadRef.current.id, segmentos.segmentoCompetitivo);
        segmentoBarriosRef.current = segmentos.segmentoCompetitivo;
        indiceBarriosRef.current = buildIndiceEspacial(barriosRef.current);
      }
      const territorioCarrera = calcularResumenTerritorial(
        rutaFinal,
        barriosRef.current,
        puntos,
        distanciaFinal
      );
      const registrarCarrera = httpsCallable(getFunctions(), 'registrarCarreraConqurun');
      const { data } = await registrarCarrera(payload);
      const nuevosTerritorios = data.conquistas ?? [];
      const territorioConfirmado = data.territorioCarrera ?? territorioCarrera;
      const territorio = clasificarTerritorio(territorioConfirmado, uid);
      const segmentosGuardados = data.segmentos ?? segmentos;
      const puntosGuardados = data.puntos ?? puntos;
      const bonusLogros = data.bonusLogros ?? 0;
      const nuevosLogros = (data.nuevosLogros ?? [])
        .map(idLogro => LOGROS.find(logro => logro.id === idLogro))
        .filter(Boolean);

      // Fire-and-forget local notifications after successful commit
      if (debeNotificarSegmento) {
        if (cambioSegmento) {
          const ritmoAnterior = segmentoAnterior?.split('_')?.[0] ?? null;
          const indexAnterior = SEGMENTOS_RITMO.findIndex(s => s.id === ritmoAnterior);
          const indexNuevo = SEGMENTOS_RITMO.findIndex(s => s.id === segmentosGuardados.segmentoRitmo);
          const esSubida = indexAnterior > indexNuevo;
          notificarSegmento(
            esSubida ? '¡Subiste de liga!' : 'Has bajado de liga',
            `Ahora compites en ${segmentosGuardados.segmentoEtiqueta}.`
          ).catch(() => {});
        } else if (avisoProximoSegmento) {
          notificarSegmento(
            'Estás muy cerca de subir de liga',
            `Mejora ${avisoProximoSegmento.segundosParaSubir}s/km en tu ritmo de conquista de 30 días para entrar en ${avisoProximoSegmento.segmento.nombre}.`
          ).catch(() => {});
        }
      }
      for (const logro of nuevosLogros) {
        notificarLogro(logro).catch(() => {});
      }
      const barriosUnicos = [...new Set(nuevosTerritorios.map(b => `${b.nombre} · ${(b.distanciaMetros / 1000).toFixed(2)} km`))];
      const nombresConquistados = new Set(nuevosTerritorios.map(b => b.nombre));
      const territorioResumen = {
        ...territorio,
        conquistadas: barriosUnicos,
        rivalesPendientes: territorio.rivalesPendientes.filter(b => !nombresConquistados.has(b.nombre)),
      };

      // CF completado correctamente: eliminar de pendientes y mostrar resumen
      if (pendingId) {
        await eliminarCarreraPendiente(pendingId);
        setCarrerasPendientesCount(prev => Math.max(0, prev - 1));
      } else {
        await limpiarTrackingCarrera();
      }
      invalidarCacheTerritorios(ciudadRef.current?.id).catch(() => {});
      cargarCarrerasRecientes().catch(console.error);
      registrarEvento('carrera_completada', {
        distancia_m: Math.round(distanciaFinal),
        duracion_s: segundosFinales,
        puntos: puntosGuardados + bonusLogros,
        territorios_conquistados: nuevosTerritorios.length,
        con_grupo: Boolean(grupoActivo),
        segundo_plano: Boolean(trackingFinal.meta?.segundoPlano),
        background_eventos: trackingFinal.meta?.backgroundEventos ?? 0,
        background_puntos: trackingFinal.meta?.backgroundPuntos ?? 0,
      });
      setResumenCarrera({
        distancia: distanciaFinal,
        duracion: segundosFinales,
        ritmoMedio,
        puntos: puntosGuardados + bonusLogros,
        territorio: territorioResumen,
        logros: nuevosLogros,
        aportacionesGrupo: data.aportacionesGrupo ?? [],
        grupoActivoId: grupoActivo?.id ?? null,
        grupoActivoNombre: grupoActivo?.nombre ?? null,
      });
      setDistancia(0);
      setSegundos(0);
      barrioNombreRef.current = null;
      setBarrioActual(null);
    } catch (e) {
      if (e.code === 'functions/failed-precondition') {
        // Carrera inválida: eliminar de pendientes y descartar
        if (pendingId) {
          await eliminarCarreraPendiente(pendingId).catch(() => {});
          setCarrerasPendientesCount(prev => Math.max(0, prev - 1));
        } else {
          await limpiarTrackingCarrera().catch(() => {});
        }
        Alert.alert('Carrera no válida', e.message ?? 'La carrera no cumple las condiciones para guardar.');
      } else if (e.code === 'functions/invalid-argument') {
        if (pendingId) {
          await eliminarCarreraPendiente(pendingId).catch(() => {});
          setCarrerasPendientesCount(prev => Math.max(0, prev - 1));
        } else {
          await limpiarTrackingCarrera().catch(() => {});
        }
        Alert.alert('Datos incorrectos', e.message ?? 'Los datos de la carrera no son válidos.');
      } else {
        // Error de red u otro: si ya está en pendientes, no hace falta guardar de nuevo
        let savedId = null;
        if (uid && !pendingId) {
          savedId = await guardarCarreraPendiente(uid, {
            carreraId,
            ruta: rutaParaEnviar,
            distancia: Math.round(distanciaFinal),
            duracion: segundosFinales,
            grupoActivoId: grupoActivo?.id ?? null,
            ciudadId: ciudadRef.current.id,
          });
          if (savedId) {
            await limpiarTrackingCarrera();
            setCarrerasPendientesCount(prev => prev + 1);
          }
        } else if (!uid) {
          await limpiarTrackingCarrera().catch(() => {});
          Alert.alert('Error', 'No se pudo guardar la carrera. Revisa tu conexión e inténtalo de nuevo.');
          return;
        }
        registrarError(e, 'pararCarrera');
        const carreraGuardada = Boolean(pendingId || savedId);
        if (!carreraGuardada) {
          Alert.alert('Error al guardar', 'No se pudo guardar la carrera localmente. Comprueba el almacenamiento del dispositivo e inténtalo de nuevo.');
          return;
        }
        if (e.code === 'functions/unauthenticated') {
          Alert.alert('Sesión expirada', 'Tu carrera se ha guardado. Inicia sesión de nuevo para que se envíe automáticamente.');
        } else {
          registrarEvento('carrera_guardada_sin_red', { distancia_m: Math.round(distanciaFinal) });
          Alert.alert('Sin conexión', 'Tu carrera se ha guardado. Se enviará automáticamente cuando tengas conexión.', [{ text: 'Entendido' }]);
        }
      }
    }
    } finally {
      terminarFinalizacionCarrera();
    }
  };

  const descartarCarreraTerminada = async (titulo, mensaje) => {
    await limpiarTrackingCarrera();
    rutaRef.current = [];
    distanciaRef.current = 0;
    segundosRef.current = 0;
    setDistancia(0);
    setSegundos(0);
    barrioNombreRef.current = null;
    setBarrioActual(null);
    setTrackingSegundoPlano(false);
    setPausada(false);
    Alert.alert(titulo, mensaje);
  };

  const seleccionarGrupoFinCarrera = async (grupos) => {
    if (!Array.isArray(grupos) || grupos.length === 0) return null;
    if (grupos.length === 1) return grupos[0];

    return new Promise(resolve => {
      resolverGrupoFinRef.current = resolve;
      setSelectorGrupoFin({ visible: true, grupos });
    });
  };

  const resolverSeleccionGrupoFin = (grupo) => {
    const resolve = resolverGrupoFinRef.current;
    resolverGrupoFinRef.current = null;
    setSelectorGrupoFin({ visible: false, grupos: [] });
    if (resolve) resolve(grupo);
  };

  const pausarCarrera = async () => {
    if (finalizandoCarreraRef.current) return;
    clearInterval(timerRef.current);
    detenerWatcherPrimerPlano();
    await pausarTrackingCarrera();
    setPausada(true);
    await sincronizarTracking();
  };

  const reanudarCarrera = async () => {
    if (preparandoGpsRef.current || finalizandoCarreraRef.current) return;
    preparandoGpsRef.current = true;
    setPreparandoGps(true);
    try {
      const meta = await reanudarTrackingCarrera();
      const loc = await obtenerPrimeraUbicacion();
      await agregarPuntosTracking([{ ...loc, segmentStart: true }], { origen: 'reanudar' });
      await iniciarTrackingDisponible({
        preferirSegundoPlano: Boolean(
          meta?.segundoPlano ||
          meta?.segundoPlanoSolicitado ||
          Platform.OS === 'android'
        ),
        motivo: 'reanudar_carrera',
      });
      setPausada(false);
      await sincronizarTracking();
      arrancarSincronizacion();
    } catch (e) {
      Alert.alert(
        'GPS no disponible',
        e.message === 'GPS_TIMEOUT'
          ? 'No se pudo obtener tu ubicación para reanudar. Prueba en una zona abierta.'
          : 'No se pudo reanudar la carrera'
      );
      await pausarTrackingCarrera();
      setPausada(true);
    } finally {
      preparandoGpsRef.current = false;
      setPreparandoGps(false);
    }
  };

  const confirmarPararCarrera = () => {
    if (preparandoGpsRef.current || finalizandoCarreraRef.current) return;
    setConfirmarFin(true);
  };

  const cerrarResumenCarrera = () => {
    const uid = auth.currentUser?.uid;
    const resumen = resumenCarrera;
    setResumenCarrera(null);
    if (!uid || !resumen) return;
    pedirResenaSiProcede(uid, 'carrera_completada', { accionPositiva: true }).catch(() => {});
  };

  const construirUrlRetornoStrava = () => {
    const expoBase = Constants.linkingUri;
    if (!expoBase) return 'conquerun://strava';
    const base = expoBase.endsWith('/') ? expoBase.slice(0, -1) : expoBase;
    // Expo Go requiere /--/ antes de la ruta para no confundirla con rutas de Metro
    const separador = expoBase.startsWith('exp://') ? '/--' : '';
    return `${base}${separador}/strava`;
  };

  const abrirAutorizacionStrava = async () => {
    try {
      esperandoStravaRef.current = true;
      const generarNonce = httpsCallable(getFunctions(), 'generarNonceStrava');
      const { data } = await generarNonce({});
      const state = JSON.stringify({ returnUrl: construirUrlRetornoStrava(), nonce: data.nonce });
      const url = 'https://www.strava.com/oauth/mobile/authorize' +
        `?client_id=${STRAVA_CLIENT_ID}` +
        '&response_type=code' +
        `&redirect_uri=${encodeURIComponent(STRAVA_REDIRECT_URI)}` +
        '&approval_prompt=force' +
        '&scope=read,activity:read' +
        `&state=${encodeURIComponent(state)}`;
      await Linking.openURL(url);
    } catch (e) {
      esperandoStravaRef.current = false;
      Alert.alert('Strava', 'No se pudo abrir la autorización de Strava.');
    }
  };

  const importarConquistasStrava = async () => {
    if (importandoStrava) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setImportandoStrava(true);
    try {
      const importar = httpsCallable(getFunctions(), 'importarConquistasStrava');
      const { data } = await importar({});
      setStravaModalVisible(false);
      setStravaConectado(true);
      await cargarCarrerasRecientes();
      invalidarCacheTerritorios(ciudadRef.current?.id).catch(() => {});
      const importadas = data.importadas ?? 0;
      const totalConquistas = Array.isArray(data.conquistadas)
        ? data.conquistadas.length
        : data.conquistadas ?? 0;
      const sinTerritorio = (data.resultados ?? []).filter(r => r.motivo === 'sin_territorio').length;
      const accionPositiva = importadas > 0 || totalConquistas > 0;
      let mensaje;
      if (importadas === 0 && sinTerritorio === 0) {
        mensaje = 'Ya estás al día. No hay carreras nuevas desde la última importación.';
      } else if (importadas === 0 && sinTerritorio > 0) {
        mensaje = `${sinTerritorio} carrera${sinTerritorio !== 1 ? 's' : ''} fuera de las zonas conquistables de tu ciudad no se importó${sinTerritorio !== 1 ? 'n' : ''}.`;
      } else if (totalConquistas === 0) {
        mensaje = `Se importaron ${importadas} carrera${importadas !== 1 ? 's' : ''} de Strava, pero no conquistaste barrios nuevos en esta ciudad.`;
      } else {
        mensaje = `Se importaron ${importadas} carrera${importadas !== 1 ? 's' : ''} de Strava y conquistaste ${totalConquistas} barrio${totalConquistas !== 1 ? 's' : ''} nuevos. ¡Sigue así!`;
      }
      if (sinTerritorio > 0 && importadas > 0) {
        mensaje += `\n\n${sinTerritorio} carrera${sinTerritorio !== 1 ? 's' : ''} fuera de las zonas conquistables no se importó${sinTerritorio !== 1 ? 'n' : ''}.`;
      }
      Alert.alert('Importación Strava', mensaje, [
        {
          text: 'OK',
          onPress: () => {
            if (accionPositiva) {
              pedirResenaSiProcede(uid, 'strava_importado', { accionPositiva: true }).catch(() => {});
            }
          },
        },
      ]);
    } catch (e) {
      if (e.code === 'functions/failed-precondition' || e.message?.includes('conectar Strava')) {
        setStravaConectado(false);
        setStravaModalVisible(true);
      } else {
        Alert.alert('Strava', e.message ?? 'No se pudo importar desde Strava.');
      }
    } finally {
      setImportandoStrava(false);
    }
  };

  const iniciarImportacionStrava = () => {
    if (importandoStrava) return;
    if (!stravaConectado) {
      setStravaModalVisible(true);
      return;
    }
    importarConquistasStrava().catch(console.error);
  };

  const handleDesconectarStrava = () => {
    Alert.alert(
      'Desconectar Strava',
      '¿Quieres revocar el acceso de ConqueRun a tu cuenta de Strava? Las carreras ya importadas no se eliminarán.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desconectar',
          style: 'destructive',
          onPress: async () => {
            setDesconectandoStrava(true);
            try {
              const fn = httpsCallable(getFunctions(), 'desconectarStrava');
              await fn();
              setStravaConectado(false);
            } catch (e) {
              Alert.alert('Error', 'No se pudo desconectar Strava. Inténtalo de nuevo.');
              registrarError(e, 'desconectarStrava');
            } finally {
              setDesconectandoStrava(false);
            }
          },
        },
      ]
    );
  };

  const procesarStravaCallbackUrl = (url) => {
    const textoUrl = String(url ?? '');
    if (
      !textoUrl.startsWith('conquerun://strava') &&
      !textoUrl.startsWith('exp+conqurun://strava') &&
      !textoUrl.includes('/--/strava')
    ) {
      return false;
    }
    esperandoStravaRef.current = false;
    if (textoUrl.includes('error=')) {
      const errorParam = textoUrl.match(/[?&]error=([^&]*)/)?.[1] ?? '';
      const msg = errorParam === 'exchange_failed'
        ? 'No se pudo completar la conexión con Strava. Inténtalo de nuevo.'
        : 'Strava denegó el acceso.';
      Alert.alert('Strava', msg);
      return true;
    }
    setStravaConectado(true);
    setStravaModalVisible(false);
    importarConquistasStrava();
    return true;
  };

  useEffect(() => {
    // Cold launch: App.js capturó la URL antes de que montáramos; la consumimos aquí
    const urlBuffer = consumirStravaUrl();
    if (urlBuffer) procesarStravaCallbackUrl(urlBuffer);
    // Foreground: Linking ya escucha en App.js también, pero procesamos aquí para
    // tener acceso directo al estado de CorrerScreen (setStravaConectado, etc.)
    // consumirStravaUrl limpia el buffer para que un remount no reprocese.
    const subscription = Linking.addEventListener('url', ({ url }) => {
      consumirStravaUrl();
      procesarStravaCallbackUrl(url);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const handleAppState = async (nextState) => {
      // Cuando la pantalla se apaga o la app va a segundo plano: si hay carrera activa
      // usando el watcher de primer plano, elevar al servicio de fondo AHORA, antes de
      // que el SO pueda congelar el hilo JS o matar el watcher.
      if (nextState === 'background') {
        if (!finalizandoCarreraRef.current) {
          try {
            const meta = await obtenerMetaTracking();
            if (meta && !meta.pausada) {
              const bgActivo = await trackingSegundoPlanoActivo().catch(() => false);
              if (!bgActivo) {
                await iniciarServicioContinuo('pantalla_apagada').catch(() => {});
              }
            }
          } catch {}
        }
        return;
      }
      if (nextState !== 'active') return;
      // Retry de carreras pendientes centralizado en App.js — no duplicar aquí.

      // Si hay carrera activa y el servicio continuo no está vivo al volver a primer plano,
      // intentamos levantarlo de nuevo antes de caer al watcher normal.
      if (!finalizandoCarreraRef.current) {
        try {
          const meta = await obtenerMetaTracking();
          if (meta && !meta.pausada) {
            const bgActivo = meta.segundoPlano
              ? await trackingSegundoPlanoActivo()
              : false;

            if (bgActivo) {
              await esperar(1000);
              await esperarEscriturasTracking();
              detenerWatcherPrimerPlano();
              setTrackingSegundoPlano(true);
            } else {
              if (meta.segundoPlano) {
                try {
                  const loc = await obtenerUbicacionCierre();
                  await agregarPuntosTracking([{ ...loc, gapStart: true }], { origen: 'appstate_active' });
                } catch {}
              }

              await iniciarTrackingDisponible({
                preferirSegundoPlano: true,
                motivo: 'appstate_active',
              });
            }
            await sincronizarTracking();
          }
        } catch {}
      }

      if (!esperandoStravaRef.current) return;
      esperandoStravaRef.current = false;
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        const snap = await getDoc(doc(db, 'usuarios', uid));
        if (snap.exists() && snap.data().stravaConectado) {
          setStravaConectado(true);
          setStravaModalVisible(false);
          importarConquistasStrava();
        }
      } catch (e) {}
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);

  const modales = (
    <>
      <Modal visible={mostrarInfoPuntos} transparent animationType="slide">
        <View style={styles.infoPuntosOverlay}>
          <View style={styles.infoPuntosCard}>
            <Text style={styles.infoPuntosTitulo}>Cómo se calculan los puntos</Text>

            <Text style={styles.infoPuntosSeccion}>📏 Kilómetros</Text>
            <Text style={styles.infoPuntosTexto}>La base es <Text style={styles.infoPuntosDestacado}>1 punto por km</Text>. Cuanto más lejos, más puntos.</Text>

            <Text style={styles.infoPuntosSeccion}>⚡ Ritmo</Text>
            <Text style={styles.infoPuntosTexto}>El ritmo medio multiplica los puntos entre <Text style={styles.infoPuntosDestacado}>×0.5 y ×5</Text>:</Text>

            <View style={styles.infoPuntosTabla}>
              {[
                ['3:00 min/km', '×5.0'],
                ['3:30 min/km', '×4.6'],
                ['4:00 min/km', '×3.8'],
                ['4:30 min/km', '×2.6'],
                ['5:00 min/km', '×1.0'],
                ['6:00 min/km', '×0.9'],
                ['8:00 min/km', '×0.7'],
                ['10:00 min/km', '×0.5'],
              ].map(([ritmo, factor]) => (
                <View key={ritmo} style={styles.infoPuntosFilaTabla}>
                  <Text style={styles.infoPuntosRitmo}>{ritmo}</Text>
                  <Text style={styles.infoPuntosFactor}>{factor}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.infoPuntosEjemplo}>Ejemplo: 10 km a 4:00 min/km → 10 × 3.8 = <Text style={styles.infoPuntosDestacado}>38 pts</Text></Text>

            <TouchableOpacity style={styles.infoPuntosCerrar} onPress={() => setMostrarInfoPuntos(false)}>
              <Text style={styles.infoPuntosCerrarTexto}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ModalConfirmarFin
        visible={confirmarFin}
        distancia={distancia}
        segundos={segundos}
        finalizando={finalizandoCarrera}
        onCancelar={() => { if (!finalizandoCarrera) setConfirmarFin(false); }}
        onConfirmar={() => {
          if (finalizandoCarreraRef.current) return;
          setConfirmarFin(false);
          pararCarrera().catch(e => registrarError(e, 'pararCarrera'));
        }}
      />

      <ResumenCarreraModal
        resumen={resumenCarrera}
        onClose={cerrarResumenCarrera}
      />

      <StravaImportModal
        visible={stravaModalVisible}
        importando={importandoStrava}
        onAbrirStrava={abrirAutorizacionStrava}
        onCancelar={() => setStravaModalVisible(false)}
      />

      <SelectorGrupoFinCarrera
        visible={selectorGrupoFin.visible}
        grupos={selectorGrupoFin.grupos}
        onSeleccionar={resolverSeleccionGrupoFin}
      />
    </>
  );

  if (corriendo) {
    return (
      <View style={styles.containerSolido}>
        <VistaCorrer
          barrio={barrioActual}
          uid={auth.currentUser?.uid}
          distancia={distancia}
          segundos={segundos}
          ritmoActual={ritmoActual}
          gpsDebil={gpsDebil}
          pausada={pausada}
          trackingSegundoPlano={trackingSegundoPlano}
          preparandoGps={preparandoGps}
          finalizandoCarrera={finalizandoCarrera}
          onPausar={pausada ? reanudarCarrera : pausarCarrera}
          onTerminar={confirmarPararCarrera}
        />
        {modales}
      </View>
    );
  }

  return (
    <ImageBackground
      source={require('../assets/login-map-flag-centered.jpg')}
      style={styles.container}
      resizeMode="cover"
    >
      <View style={styles.overlay} />

      <ScrollView style={styles.historial} contentContainerStyle={styles.historialContenido}>
        <Text style={styles.historialTitulo}>Últimas carreras</Text>
        <TouchableOpacity
          style={[styles.stravaImportarCard, importandoStrava && styles.stravaImportarCardDisabled]}
          onPress={iniciarImportacionStrava}
          disabled={importandoStrava || desconectandoStrava}
          activeOpacity={0.85}
        >
          <View style={styles.stravaImportarCabecera}>
            <FontAwesome6 name="strava" size={16} color={colors.strava} />
            <Text style={styles.stravaImportarTitulo}>
              {importandoStrava ? 'Importando desde Strava...' : 'Importar conquistas de Strava'}
            </Text>
          </View>
          <Text style={styles.stravaImportarTexto}>Carreras recientes con GPS válido</Text>
        </TouchableOpacity>
        {stravaConectado && (
          <TouchableOpacity
            style={styles.stravaDesconectarBoton}
            onPress={handleDesconectarStrava}
            disabled={desconectandoStrava || importandoStrava}
            activeOpacity={0.7}
          >
            <Text style={styles.stravaDesconectarTexto}>
              {desconectandoStrava ? 'Desconectando...' : 'Desconectar Strava'}
            </Text>
          </TouchableOpacity>
        )}
        {carrerasRecientes.length === 0 ? (
          <Text style={styles.historialVacio}>Aún no has corrido. ¡A por el primer kilómetro!</Text>
        ) : (
          carrerasRecientes.map(carrera => {
            const puntuable = esCarreraPuntuable(carrera);
            return (
              <TouchableOpacity key={carrera.id} style={[styles.carreraCard, !puntuable && styles.carreraCardAtenuada]} onPress={() => setCarreraDetalle(carrera)} activeOpacity={0.8}>
                <View style={styles.carreraFila}>
                  <Text style={styles.carreraFecha}>{formatFecha(carrera.fecha)}</Text>
                  <View style={styles.carreraFilaDerecha}>
                    {carrera.source === 'strava' && (
                      <View style={styles.stravaBadge}>
                        <FontAwesome6 name="strava" size={11} color={colors.strava} />
                        <Text style={styles.stravaBadgeTexto}>Strava</Text>
                      </View>
                    )}
                    <Text style={styles.carreraPuntos}>{(carrera.puntosPersonales ?? carrera.puntos ?? 0).toLocaleString()} pts</Text>
                  </View>
                </View>
                <View style={styles.carreraFila}>
                  <Text style={styles.carreraMetrica}>{(carrera.distancia / 1000).toFixed(2)} km</Text>
                  <Text style={styles.carreraMetrica}>{formatRitmo(carrera.ritmoMedio)} min/km</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
        {carreraDetalle && (
          <DetalleCarreraScreen carrera={carreraDetalle} onClose={() => setCarreraDetalle(null)} />
        )}
      </ScrollView>

      {carrerasPendientesCount > 0 && (
        <View style={styles.bannerPendiente}>
          <MaterialCommunityIcons name="cloud-upload-outline" size={16} color={colors.gold} />
          <Text style={styles.bannerPendienteTexto}>
            {carrerasPendientesCount === 1
              ? '1 carrera pendiente de enviar'
              : `${carrerasPendientesCount} carreras pendientes de enviar`}
          </Text>
          <TouchableOpacity onPress={() => enviarCarrerasPendientes().catch(console.error)}>
            <Text style={styles.bannerPendienteBoton}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.panelInicio}>
        <TouchableOpacity
          style={[styles.botonEmpezar, (preparandoGps || finalizandoCarrera) && styles.botonDesactivado]}
          onPress={iniciarCarrera}
          disabled={preparandoGps || finalizandoCarrera}
          activeOpacity={0.85}
        >
          <Text style={styles.botonEmpezarTexto}>
            {finalizandoCarrera ? 'Guardando carrera...' : preparandoGps ? 'Preparando GPS...' : 'Empezar'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.botonInfoPuntos} onPress={() => setMostrarInfoPuntos(true)}>
        <Text style={styles.botonInfoPuntosTexto}>ⓘ</Text>
      </TouchableOpacity>

      {modales}
    </ImageBackground>
  );
}

function SelectorGrupoFinCarrera({ visible, grupos, onSeleccionar }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => onSeleccionar(null)}>
      <View style={styles.selectorGrupoOverlay}>
        <View style={styles.selectorGrupoPanel}>
          <Text style={styles.selectorGrupoTitulo}>Asignar carrera a equipo</Text>
          <Text style={styles.selectorGrupoTexto}>
            Elige qué equipo recibe los puntos y las conquistas de esta carrera.
          </Text>

          <TouchableOpacity
            style={styles.selectorGrupoOpcion}
            onPress={() => onSeleccionar(null)}
          >
            <Text style={styles.selectorGrupoOpcionNombre}>Sin equipo</Text>
            <Text style={styles.selectorGrupoOpcionMeta}>Solo puntuación individual</Text>
          </TouchableOpacity>

          {grupos.map(grupo => (
            <TouchableOpacity
              key={grupo.id}
              style={styles.selectorGrupoOpcion}
              onPress={() => onSeleccionar(grupo)}
            >
              <Text style={styles.selectorGrupoOpcionNombre}>{grupo.nombre}</Text>
              <Text style={styles.selectorGrupoOpcionMeta}>
                {(grupo.miembros?.length ?? 0)} miembros · {(grupo.puntosTotales ?? 0).toLocaleString()} pts
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function StravaImportModal({ visible, importando, onAbrirStrava, onCancelar }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={importando ? undefined : onCancelar}>
      <View style={styles.stravaOverlay}>
        <View style={styles.stravaPanel}>
          <Text style={styles.stravaModalTitulo}>
            {importando ? 'Importando desde Strava...' : 'Conectar Strava'}
          </Text>
          {importando ? (
            <ActivityIndicator color={colors.gold} size="large" style={{ marginVertical: 20 }} />
          ) : (
            <>
              <Text style={styles.stravaModalTexto}>
                Autoriza ConqueRun en Strava y volverás automáticamente a la app. Solo importaremos carreras con GPS válido para conquistar.
              </Text>
              <Text style={styles.stravaModalConsejo}>
                💡 ¿Usas Garmin, Suunto o Polar? Sincronízalos con Strava y tus carreras se importarán automáticamente.
              </Text>
              <TouchableOpacity style={styles.stravaAutorizarBoton} onPress={onAbrirStrava} activeOpacity={0.85}>
                <FontAwesome6 name="strava" size={20} color={colors.text} />
                <Text style={styles.stravaAutorizarTexto}>Conectar con Strava</Text>
              </TouchableOpacity>
              <View style={styles.stravaAcciones}>
                <TouchableOpacity style={styles.stravaCancelarBoton} onPress={onCancelar}>
                  <Text style={styles.stravaCancelarTexto}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ModalConfirmarFin({ visible, distancia, segundos, finalizando, onCancelar, onConfirmar }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancelar}>
      <View style={styles.confirmarOverlay}>
        <View style={styles.confirmarPanel}>
          <Text style={styles.confirmarTitulo}>¿Terminar carrera?</Text>
          <View style={styles.confirmarStats}>
            <View style={styles.confirmarStat}>
              <Text style={styles.confirmarStatValor}>{(distancia / 1000).toFixed(2)}</Text>
              <Text style={styles.confirmarStatLabel}>km</Text>
            </View>
            <View style={styles.confirmarSeparador} />
            <View style={styles.confirmarStat}>
              <Text style={styles.confirmarStatValor}>{formatTiempo(segundos)}</Text>
              <Text style={styles.confirmarStatLabel}>tiempo</Text>
            </View>
          </View>
          <View style={styles.confirmarBotones}>
            <TouchableOpacity
              style={[styles.confirmarBotonSeguir, finalizando && { opacity: 0.5 }]}
              onPress={onCancelar}
              disabled={finalizando}
            >
              <Text style={styles.confirmarBotonSeguirTexto}>Seguir corriendo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmarBotonTerminar, finalizando && { opacity: 0.5 }]}
              onPress={onConfirmar}
              disabled={finalizando}
            >
              <Text style={styles.confirmarBotonTerminarTexto}>
                {finalizando ? 'Guardando...' : 'Terminar'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ResumenCarreraModal({ resumen, onClose }) {
  if (!resumen) return null;

  const territorio = resumen.territorio ?? {
    conquistadas: [],
    defendidas: [],
    rivalesPendientes: [],
  };
  const hayConquistas = territorio.conquistadas.length > 0;
  const hayTerritorio = hayConquistas
    || territorio.defendidas.length > 0
    || territorio.rivalesPendientes.length > 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.resumenOverlay}>
        <View style={styles.resumenPanel}>
          <ScrollView contentContainerStyle={styles.resumenContenido}>
            <Text style={styles.resumenEyebrow}>Carrera completada</Text>
            <Text style={styles.resumenTitulo}>
              {hayConquistas
                ? `Has conquistado ${territorio.conquistadas.length} ${territorio.conquistadas.length === 1 ? 'zona' : 'zonas'}`
                : 'Buen entrenamiento'}
            </Text>
            <Text style={styles.resumenSubtitulo}>
              {hayConquistas
                ? 'Tu bandera gana terreno.'
                : 'No has conquistado zonas esta vez.'}
            </Text>

            <View style={styles.resumenPuntos}>
              <Text style={styles.resumenPuntosValor}>{resumen.puntos.toLocaleString()}</Text>
              <Text style={styles.resumenPuntosLabel}>puntos</Text>
            </View>

            <View style={styles.resumenGrid}>
              <ResumenMetrica label="Distancia" value={`${(resumen.distancia / 1000).toFixed(2)} km`} />
              <ResumenMetrica label="Tiempo" value={formatTiempo(resumen.duracion)} />
              <ResumenMetrica label="Ritmo medio" value={`${formatRitmo(resumen.ritmoMedio)} min/km`} />
              <ResumenMetrica label="Equipo" value={resumen.grupoActivoNombre ?? 'Sin equipo'} />
            </View>

            <ResumenTerritorio territorio={territorio} />

            {resumen.aportacionesGrupo.length > 0 && (
              <View style={styles.resumenSeccion}>
                <Text style={styles.resumenSeccionTitulo}>Aportación a grupos</Text>
                {resumen.aportacionesGrupo.map(aportacion => (
                  <View key={aportacion.id} style={styles.resumenAportacionFila}>
                    <View style={styles.resumenAportacionInfo}>
                      <Text style={styles.resumenAportacionNombre}>{aportacion.grupoNombre}</Text>
                      <Text style={styles.resumenAportacionDetalle}>
                        {aportacion.miembrosGrupoEnEseMomento} miembros · x{aportacion.multiplicadorGrupo.toFixed(2)}
                      </Text>
                    </View>
                    <Text style={styles.resumenAportacionPuntos}>
                      {aportacion.puntosGrupo.toLocaleString()} pts
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {(resumen.logros ?? []).length > 0 && (
              <View style={styles.resumenSeccion}>
                <Text style={styles.resumenSeccionTitulo}>Logros desbloqueados</Text>
                {(resumen.logros ?? []).map(logro => (
                  <View key={logro.id ?? logro.nombre} style={styles.resumenLogroFila}>
                    <Text style={styles.resumenLogroEmoji}>{logro.emoji}</Text>
                    <View style={styles.resumenLogroInfo}>
                      <Text style={styles.resumenLogroNombre}>{logro.nombre}</Text>
                      <Text style={styles.resumenLogroDesc}>{logro.desc}</Text>
                    </View>
                    <View style={styles.resumenLogroBadge}>
                      <Text style={styles.resumenLogroBadgeTexto}>+{logro.bonus.toLocaleString()} pts</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity style={styles.resumenBoton} onPress={onClose}>
              <Text style={styles.resumenBotonTexto}>Cerrar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ResumenTerritorio({ territorio }) {
  const hayDatos = territorio.conquistadas.length > 0
    || territorio.defendidas.length > 0
    || territorio.rivalesPendientes.length > 0;

  return (
    <View style={styles.resumenSeccion}>
      <Text style={styles.resumenSeccionTitulo}>Territorio</Text>
      <ResumenListaTerritorio titulo="Zonas conquistadas" items={territorio.conquistadas} variante="conquista" />
      <ResumenListaTerritorio titulo="Zonas defendidas" items={territorio.defendidas} variante="defensa" />
      <ResumenListaTerritorio
        titulo="Rivales pendientes"
        items={territorio.rivalesPendientes.map(item => `${item.nombre} · ${item.puntosDueno.toLocaleString()} pts`)}
        variante="rival"
      />
      {!hayDatos && (
        <Text style={styles.resumenTexto}>Sigue sumando puntos para atacar zonas cercanas.</Text>
      )}
    </View>
  );
}

function ResumenListaTerritorio({ titulo, items, variante }) {
  if (items.length === 0) return null;

  return (
    <View style={styles.resumenTerritorioGrupo}>
      <Text style={styles.resumenTerritorioTitulo}>{titulo}</Text>
      {items.map((item, i) => (
        <View key={i} style={[styles.resumenTerritorioChip, styles[`resumenTerritorio_${variante}`]]}>
          <Text style={styles.resumenTerritorioTexto}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function ResumenMetrica({ label, value }) {
  return (
    <View style={styles.resumenMetrica}>
      <Text style={styles.resumenMetricaValor}>{value}</Text>
      <Text style={styles.resumenMetricaLabel}>{label}</Text>
    </View>
  );
}

const formatFecha = (fecha) => {
  if (!fecha) return '';
  const ms = fecha?.toDate ? fecha.toDate().getTime() : new Date(fecha).getTime();
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

function VistaCorrer({ barrio, uid, distancia, segundos, ritmoActual, gpsDebil, pausada, trackingSegundoPlano, preparandoGps, finalizandoCarrera, onPausar, onTerminar }) {
  const km = (distancia / 1000).toFixed(2);
  const ritmoMedio = distancia > 0 ? segundos / (distancia / 1000) : null;
  const accionesBloqueadas = preparandoGps || finalizandoCarrera;

  const esPropio = barrio?.dueno === uid;
  const esLibre = barrio && !barrio.dueno;
  const barrioLabel = gpsDebil
    ? '⚠ GPS débil'
    : !barrio
    ? 'Buscando zona...'
    : esPropio
    ? `🛡 Defendiendo ${barrio.nombre}`
    : esLibre
    ? `📍 ${barrio.nombre} — zona libre`
    : `⚔ Conquistando ${barrio.nombre}`;
  const barrioColor = gpsDebil ? colors.conquest : !barrio ? colors.muted : esPropio ? colors.gold : esLibre ? colors.sport : colors.conquest;
  const barrioBg = gpsDebil ? '#e6394618' : !barrio ? colors.surfaceAlt : esPropio ? '#C6F43218' : esLibre ? '#2dd4bf18' : '#e6394618';
  const barrioBorder = gpsDebil ? '#e6394640' : !barrio ? colors.border : esPropio ? '#C6F43240' : esLibre ? '#2dd4bf40' : '#e6394640';

  return (
    <View style={styles.vistaCorrer}>

      {/* Tarjeta barrio */}
      <View style={[styles.tarjetaBarrio, { backgroundColor: barrioBg, borderColor: barrioBorder }]}>
        <Text style={[styles.tarjetaBarrioLabel, { color: barrioColor }]}>{barrioLabel}</Text>
        {pausada && (
          <Text style={[styles.tarjetaBarrioEstado, { color: colors.conquest }]}>Pausada · no suma tiempo ni distancia</Text>
        )}
      </View>


      {/* Tarjetas grandes: km y tiempo */}
      <View style={styles.filaTarjetas}>
        <View style={styles.tarjetaStat}>
          <Text style={styles.tarjetaStatValor}>{km}</Text>
          <Text style={styles.tarjetaStatLabel}>kilómetros</Text>
        </View>
        <View style={styles.tarjetaStat}>
          <Text style={styles.tarjetaStatValor}>{formatTiempo(segundos)}</Text>
          <Text style={styles.tarjetaStatLabel}>tiempo</Text>
        </View>
      </View>

      {/* Tarjetas secundarias: ritmos */}
      <View style={styles.filaTarjetas}>
        <View style={styles.tarjetaStat}>
          <Text style={styles.tarjetaStatValorSec}>{formatRitmo(ritmoMedio)}</Text>
          <Text style={styles.tarjetaStatLabel}>ritmo medio</Text>
        </View>
        <View style={styles.tarjetaStat}>
          <Text style={styles.tarjetaStatValorSec}>{ritmoActual ? formatRitmo(ritmoActual) : '–:––'}</Text>
          <Text style={styles.tarjetaStatLabel}>ritmo actual</Text>
        </View>
      </View>

      <View style={styles.botonesCarrera}>
        <TouchableOpacity
          style={[styles.botonCarrera, pausada ? styles.botonCarreraReanudar : styles.botonCarreraPausar, accionesBloqueadas && styles.botonDesactivado]}
          onPress={onPausar}
          disabled={accionesBloqueadas}
          activeOpacity={0.85}
        >
          <Text style={[styles.botonCarreraTexto, pausada && { color: colors.bg }]}>
            {finalizandoCarrera ? 'Guardando...' : preparandoGps ? 'GPS...' : pausada ? 'Reanudar' : 'Pausar'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.botonCarrera, styles.botonCarreraTerminar, accionesBloqueadas && styles.botonDesactivado]}
          onPress={onTerminar}
          disabled={accionesBloqueadas}
          activeOpacity={0.85}
        >
          <Text style={styles.botonCarreraTexto}>
            {finalizandoCarrera ? 'Terminando...' : 'Terminar'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1 },
  containerSolido: { flex: 1, backgroundColor: colors.bg },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3,7,18,0.78)' },
  mapa: { flex: 1 },
  mapaVacio: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapaVacioTitulo: { color: colors.muted, fontSize: 14, textAlign: 'center' },

  // Vista corriendo — pantalla de estadísticas
  vistaCorrer: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: Constants.statusBarHeight + 12,
    paddingHorizontal: 14,
    paddingBottom: 20,
    gap: 10,
  },
  tarjetaBarrio: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  tarjetaBarrioLabel: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  tarjetaBarrioEstado: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  filaTarjetas: {
    flexDirection: 'row',
    gap: 10,
    flex: 1,
  },
  tarjetaStat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tarjetaStatValor: {
    color: colors.text,
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: -1.5,
    lineHeight: 56,
  },
  tarjetaStatValorSec: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tarjetaStatLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4,
  },
  botonesCarrera: {
    flexDirection: 'row',
    gap: 10,
  },
  botonCarrera: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonCarreraPausar: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  botonCarreraReanudar: {
    backgroundColor: colors.gold,
  },
  botonCarreraTerminar: {
    backgroundColor: colors.conquest,
  },
  botonCarreraTexto: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },

  // Panel inicio (no corriendo)
  panelInicio: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 8,
    backgroundColor: 'rgba(8,11,20,0.92)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  botonEmpezar: {
    backgroundColor: colors.gold,
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: 'center',
  },
  botonEmpezarTexto: {
    color: colors.bg,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  historial: { flex: 1 },
  historialContenido: { padding: 16, paddingBottom: 8 },
  historialTitulo: { color: colors.muted, fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 10 },
  historialVacio: { color: colors.subdued, fontSize: 14, textAlign: 'center', marginTop: 20 },
  stravaImportarCard: {
    backgroundColor: '#fc520022',
    borderColor: colors.strava,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 10,
  },
  stravaImportarCabecera: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  stravaImportarTitulo: { color: colors.strava, fontSize: 14, fontWeight: '900' },
  stravaImportarTexto: { color: colors.muted, fontSize: 12, marginTop: 3 },
  stravaImportarCardDisabled: { opacity: 0.65 },
  stravaDesconectarBoton: { alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 2, marginTop: 4 },
  stravaDesconectarTexto: { color: colors.muted, fontSize: 11, textDecorationLine: 'underline' },
  stravaOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  stravaPanel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  stravaModalTitulo: { color: colors.text, fontSize: 20, fontWeight: '900' },
  stravaModalTexto: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  stravaModalConsejo: { color: colors.subdued, fontSize: 12, lineHeight: 17, marginTop: 10, fontStyle: 'italic' },
  stravaAutorizarBoton: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.strava,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stravaAutorizarTexto: { color: colors.text, fontSize: 15, fontWeight: '900' },
  stravaInput: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 13,
  },
  stravaAcciones: { flexDirection: 'row', gap: 10 },
  stravaCancelarBoton: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  stravaCancelarTexto: { color: colors.text, fontSize: 14, fontWeight: '800' },
  stravaImportarBoton: {
    flex: 1,
    backgroundColor: colors.strava,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  stravaImportarBotonTexto: { color: colors.text, fontSize: 14, fontWeight: '900' },
  carreraCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 8,
    borderColor: colors.border,
    borderWidth: 1,
  },
  carreraCardAtenuada: { opacity: 0.5 },
  carreraFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  carreraFilaDerecha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  carreraFecha: { color: colors.text, fontSize: 13, fontWeight: 'bold' },
  carreraPuntos: { color: colors.gold, fontSize: 13, fontWeight: 'bold' },
  stravaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(252,82,0,0.12)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(252,82,0,0.25)',
  },
  stravaBadgeTexto: { color: colors.strava, fontSize: 10, fontWeight: '700' },
  carreraMetrica: { color: colors.muted, fontSize: 12 },
  panel: {
    backgroundColor: colors.surface,
    padding: 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  barrio: { color: colors.gold, fontSize: 13, textAlign: 'center', marginBottom: 12 },
  gpsDebilTexto: { color: colors.conquest, fontSize: 12, textAlign: 'center', marginBottom: 8 },
  avisoSegundoPlano: { color: colors.conquest, fontSize: 11, textAlign: 'center', marginBottom: 8, paddingHorizontal: 12 },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 20,
  },
  stat: { alignItems: 'center', flex: 1 },
  statValor: { fontSize: 28, fontWeight: 'bold', color: colors.text },
  statLabel: { fontSize: 12, color: colors.muted, marginTop: 2 },
  separador: { width: 1, height: 40, backgroundColor: colors.border },
  estadoTrackingBox: {
    marginBottom: 12,
    alignItems: 'center',
  },
  estadoTrackingBoxPausado: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.gold,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  estadoTracking: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
  },
  estadoTrackingPausado: {
    color: colors.gold,
    fontWeight: 'bold',
  },
  estadoTrackingDetalle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
    textAlign: 'center',
  },
  accionesCarrera: {
    flexDirection: 'row',
    gap: 10,
  },
  boton: {
    backgroundColor: colors.gold,
    padding: 18,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  botonParar: { backgroundColor: colors.conquest },
  botonTerminar: { flex: 1 },
  botonSecundario: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 18,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  botonSecundarioTexto: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  botonReanudar: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  botonReanudarTexto: {
    color: colors.bg,
  },
  botonDesactivado: { opacity: 0.65 },
  botonTexto: { color: colors.bg, fontSize: 18, fontWeight: 'bold' },
  confirmarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  confirmarPanel: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 24,
  },
  confirmarTitulo: {
    color: colors.text,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  confirmarStats: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    gap: 24,
  },
  confirmarStat: { alignItems: 'center' },
  confirmarStatValor: { color: colors.text, fontSize: 32, fontWeight: 'bold' },
  confirmarStatLabel: { color: colors.muted, fontSize: 13, marginTop: 2 },
  confirmarSeparador: { width: 1, height: 40, backgroundColor: colors.border },
  confirmarBotones: { flexDirection: 'row', gap: 10 },
  confirmarBotonSeguir: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 16,
    alignItems: 'center',
  },
  confirmarBotonSeguirTexto: { color: colors.text, fontSize: 15, fontWeight: 'bold' },
  confirmarBotonTerminar: {
    flex: 1,
    backgroundColor: colors.conquest,
    borderRadius: radius.lg,
    padding: 16,
    alignItems: 'center',
  },
  confirmarBotonTerminarTexto: { color: colors.text, fontSize: 15, fontWeight: 'bold' },
  selectorGrupoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  selectorGrupoPanel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 20,
    gap: 10,
  },
  selectorGrupoTitulo: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 2,
  },
  selectorGrupoTexto: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  selectorGrupoOpcion: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
  },
  selectorGrupoOpcionNombre: { color: colors.text, fontSize: 15, fontWeight: '800' },
  selectorGrupoOpcionMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  resumenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  resumenPanel: {
    maxHeight: '88%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderColor: colors.border,
    borderWidth: 1,
  },
  resumenContenido: {
    padding: 22,
    paddingBottom: 32,
  },
  resumenEyebrow: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  resumenTitulo: {
    color: colors.text,
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  resumenSubtitulo: {
    color: colors.muted,
    fontSize: 15,
    marginBottom: 20,
  },
  resumenPuntos: {
    backgroundColor: colors.surface,
    borderColor: colors.gold,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 18,
    alignItems: 'center',
    marginBottom: 14,
  },
  resumenPuntosValor: {
    color: colors.gold,
    fontSize: 38,
    fontWeight: 'bold',
  },
  resumenPuntosLabel: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  resumenGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  resumenMetrica: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
  },
  resumenMetricaValor: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  resumenMetricaLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  resumenSeccion: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 12,
  },
  resumenSeccionTitulo: {
    color: colors.text,
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  resumenZona: {
    color: colors.muted,
    fontSize: 14,
    paddingVertical: 5,
  },
  resumenAportacionFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: 10,
    marginBottom: 8,
  },
  resumenAportacionInfo: {
    flex: 1,
    paddingRight: 10,
  },
  resumenAportacionNombre: {
    color: colors.text,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  resumenAportacionDetalle: {
    color: colors.muted,
    fontSize: 12,
  },
  resumenAportacionPuntos: {
    color: colors.gold,
    fontSize: 14,
    fontWeight: 'bold',
  },
  resumenLogroFila: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: 10,
    marginBottom: 8,
  },
  resumenLogroEmoji: {
    fontSize: 24,
    marginRight: 10,
  },
  resumenLogroInfo: {
    flex: 1,
    paddingRight: 8,
  },
  resumenLogroNombre: {
    color: colors.text,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  resumenLogroDesc: {
    color: colors.muted,
    fontSize: 12,
  },
  resumenLogroBadge: {
    backgroundColor: '#38bdf820',
    borderColor: colors.route,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  resumenLogroBadgeTexto: {
    color: colors.route,
    fontSize: 12,
    fontWeight: 'bold',
  },
  resumenTerritorioGrupo: {
    marginTop: 12,
  },
  resumenTerritorioTitulo: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  resumenTerritorioChip: {
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 8,
    borderWidth: 1,
  },
  resumenTerritorio_conquista: {
    backgroundColor: '#e6394620',
    borderColor: colors.conquest,
  },
  resumenTerritorio_defensa: {
    backgroundColor: '#C6F43220',
    borderColor: colors.gold,
  },
  resumenTerritorio_rival: {
    backgroundColor: '#38bdf820',
    borderColor: colors.route,
  },
  resumenTerritorioTexto: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  resumenTexto: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  resumenBoton: {
    backgroundColor: colors.gold,
    borderRadius: radius.lg,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  resumenBotonTexto: {
    color: colors.bg,
    fontSize: 16,
    fontWeight: 'bold',
  },
  botonInfoPuntos: {
    position: 'absolute', top: 12, right: 16,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  botonInfoPuntosTexto: { color: '#FF4F2E', fontSize: 16, fontWeight: 'bold' },
  infoPuntosOverlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  infoPuntosCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24,
  },
  infoPuntosTitulo: { fontSize: 18, fontWeight: '900', color: colors.text, marginBottom: 16 },
  infoPuntosSeccion: { fontSize: 14, fontWeight: '800', color: colors.gold, marginTop: 12, marginBottom: 4 },
  infoPuntosTexto: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  infoPuntosDestacado: { color: colors.text, fontWeight: '700' },
  infoPuntosTabla: { marginTop: 8, marginBottom: 8, borderRadius: radius.sm, overflow: 'hidden' },
  infoPuntosFilaTabla: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 6, paddingHorizontal: 12,
    backgroundColor: colors.bg, marginBottom: 2,
  },
  infoPuntosRitmo: { fontSize: 13, color: colors.muted },
  infoPuntosFactor: { fontSize: 13, color: colors.gold, fontWeight: '700' },
  infoPuntosEjemplo: {
    fontSize: 13, color: colors.muted, fontStyle: 'italic',
    marginTop: 8, marginBottom: 16,
  },
  infoPuntosCerrar: {
    backgroundColor: colors.gold, borderRadius: radius.md,
    padding: 14, alignItems: 'center',
  },
  infoPuntosCerrarTexto: { color: colors.bg, fontWeight: '900', fontSize: 15 },

  bannerPendiente: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(198,244,50,0.08)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(198,244,50,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  bannerPendienteTexto: {
    flex: 1,
    color: colors.subdued,
    fontSize: 12,
  },
  bannerPendienteBoton: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '700',
  },
});
