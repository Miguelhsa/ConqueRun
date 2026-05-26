import crashlytics from '@react-native-firebase/crashlytics';
import analytics from '@react-native-firebase/analytics';

export const registrarError = (error, contexto = '') => {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    if (contexto) crashlytics().log(contexto);
    crashlytics().recordError(err);
  } catch {}
};

export const registrarEvento = (nombre, params = {}) => {
  try {
    analytics().logEvent(nombre, params);
  } catch {}
};

export const identificarUsuario = (uid) => {
  try {
    crashlytics().setUserId(uid ?? '');
    analytics().setUserId(uid ?? null);
  } catch {}
};
