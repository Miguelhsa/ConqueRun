import { Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_DIAS_ENTRE_PROMPTS_MS = 120 * 24 * 60 * 60 * 1000;
const MAX_PROMPTS_ANUALES = 2;

let storeReviewModulePromise = null;

const cargarStoreReview = async () => {
  try {
    if (!storeReviewModulePromise) {
      storeReviewModulePromise = import('expo-store-review');
    }
    return await storeReviewModulePromise;
  } catch (error) {
    storeReviewModulePromise = null;
    console.warn('[reviews] expo-store-review no disponible en este build:', error?.message ?? error);
    return null;
  }
};

const versionApp = () => Constants.expoConfig?.version ?? 'dev';

const toMillis = (valor) => {
  if (typeof valor === 'number') return valor;
  if (valor?.toMillis) return valor.toMillis();
  return null;
};

const claveEstado = (uid) => `conquerun:reviewPrompt:${uid}`;

const cargarEstado = async (uid) => {
  try {
    const raw = await AsyncStorage.getItem(claveEstado(uid));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const guardarEstado = async (uid, estado) => {
  await AsyncStorage.setItem(claveEstado(uid), JSON.stringify(estado));
};

const programarRecordatorioResena = async (disponibleDesdeMs) => {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return null;

  const fecha = new Date(Math.max(disponibleDesdeMs, Date.now() + 60 * 1000));

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Tu ciudad te espera',
      body: 'Vuelve a ver cómo va tu territorio en ConqueRun.',
      sound: true,
      data: { tipo: 'review_reengagement' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fecha,
    },
  });
};

const asegurarEstadoSolicitud = async (uid) => {
  const ahora = Date.now();
  const estado = await cargarEstado(uid);
  const primerUsoMs = toMillis(estado.reviewPrimerUsoMs);
  const disponibleDesdeMs = toMillis(estado.reviewDisponibleDesdeMs) ?? (
    primerUsoMs ? primerUsoMs + SIETE_DIAS_MS : ahora + SIETE_DIAS_MS
  );

  const siguiente = { ...estado };
  let cambiado = false;

  if (!primerUsoMs) {
    siguiente.reviewPrimerUsoMs = ahora;
    siguiente.reviewDisponibleDesdeMs = disponibleDesdeMs;
    cambiado = true;
  } else if (!toMillis(estado.reviewDisponibleDesdeMs)) {
    siguiente.reviewDisponibleDesdeMs = disponibleDesdeMs;
    cambiado = true;
  }

  if (!toMillis(estado.reviewRecordatorioProgramadoMs) && disponibleDesdeMs > ahora) {
    try {
      const notificationId = await programarRecordatorioResena(disponibleDesdeMs);
      if (notificationId) {
        siguiente.reviewRecordatorioId = notificationId;
        siguiente.reviewRecordatorioProgramadoMs = ahora;
        cambiado = true;
      }
    } catch {
      // No bloquea la experiencia si el dispositivo no permite programar la notificación.
    }
  }

  if (cambiado) await guardarEstado(uid, siguiente);
  return siguiente;
};

export const prepararSolicitudResena = async (uid) => {
  if (!uid) return false;
  await asegurarEstadoSolicitud(uid);

  return true;
};

export const pedirResenaSiProcede = async (uid, motivo, opciones = {}) => {
  if (!uid) return false;

  const estado = await asegurarEstadoSolicitud(uid);
  const ahora = Date.now();
  const disponibleDesdeMs = toMillis(estado.reviewDisponibleDesdeMs);
  const ultimoPromptMs = toMillis(estado.reviewUltimoPromptMs);
  const anioActual = new Date().getFullYear();
  const promptsEsteAnio = estado.reviewPromptAnio === anioActual
    ? estado.reviewPromptCountAnio ?? 0
    : 0;

  const usoReal = Boolean(
    opciones.accionPositiva ||
    toMillis(estado.reviewUsoRealMs)
  );

  if (!usoReal) return false;

  if (opciones.accionPositiva && !toMillis(estado.reviewUsoRealMs)) {
    await guardarEstado(uid, {
      ...estado,
      reviewUsoRealMs: ahora,
    });
  }

  if (ahora < disponibleDesdeMs) return false;
  if (estado.reviewUltimaVersion === versionApp()) return false;
  if (promptsEsteAnio >= MAX_PROMPTS_ANUALES) return false;
  if (ultimoPromptMs && ahora - ultimoPromptMs < MIN_DIAS_ENTRE_PROMPTS_MS) return false;

  const StoreReview = await cargarStoreReview();
  if (!StoreReview) return false;
  if (!(await StoreReview.hasAction())) return false;

  try {
    await StoreReview.requestReview();
    await guardarEstado(uid, {
      ...estado,
      ...(opciones.accionPositiva && !toMillis(estado.reviewUsoRealMs)
        ? { reviewUsoRealMs: ahora }
        : {}),
      reviewUltimoPromptMs: ahora,
      reviewUltimoMotivo: motivo,
      reviewUltimaVersion: versionApp(),
      reviewPromptAnio: anioActual,
      reviewPromptCountAnio: promptsEsteAnio + 1,
    });
    return true;
  } catch {
    return false;
  }
};

export const abrirResenaManual = async () => {
  const StoreReview = await cargarStoreReview();
  const storeUrl = StoreReview?.storeUrl?.();
  if (storeUrl && await Linking.canOpenURL(storeUrl)) {
    await Linking.openURL(storeUrl);
    return true;
  }

  if (StoreReview && await StoreReview.hasAction()) {
    await StoreReview.requestReview();
    return true;
  }

  Alert.alert(
    'Valorar ConqueRun',
    'La valoración estará disponible cuando la app esté publicada en App Store y Google Play.'
  );
  return false;
};
