import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { db } from '../firebaseConfig';
import { doc, setDoc, collection } from 'firebase/firestore';

const refPrivado = (uid) => doc(db, 'usuarios', uid, 'privado', 'notificaciones');

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const registrarNotificaciones = async (uid) => {
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  const token = (await Notifications.getExpoPushTokenAsync()).data;

  // Guardar en subcollección privada — otros usuarios no pueden leer el pushToken
  await setDoc(refPrivado(uid), { pushToken: token }, { merge: true });

  return token;
};

export const enviarNotificacion = async (tokenDestino, titulo, mensaje) => {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: tokenDestino,
      title: titulo,
      body: mensaje,
      sound: 'default',
    }),
  });
};

export const notificarConquista = async (nombres = []) => {
  if (nombres.length === 0) return;
  const titulo = '¡Territorio conquistado! 🏁';
  const cuerpo = nombres.length === 1
    ? `Ahora eres dueño de ${nombres[0]}`
    : `Has conquistado ${nombres.length} barrios`;
  await Notifications.scheduleNotificationAsync({
    content: { title: titulo, body: cuerpo, sound: true },
    trigger: null,
  });
};

export const notificarLogro = async (logro) => {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${logro.emoji} ¡Nuevo logro desbloqueado!`,
      body: `${logro.nombre} — ${logro.desc}`,
      sound: true,
    },
    trigger: null,
  });
};

export const notificarSegmento = async (titulo, mensaje) => {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: titulo,
      body: mensaje,
      sound: true,
    },
    trigger: null,
  });
};

export const obtenerEstadoPermiso = async () => {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
};
