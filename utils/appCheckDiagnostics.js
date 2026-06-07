import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { registrarError, registrarEvento } from './monitoring';

const KEY_ULTIMO_DIAGNOSTICO = 'conqurun:appcheck:ultimo_diagnostico';
const INTERVALO_DIAGNOSTICO_MS = 12 * 60 * 60 * 1000;

let diagnosticoEnCurso = null;

export const diagnosticarAppCheck = async ({ force = false } = {}) => {
  if (diagnosticoEnCurso) return diagnosticoEnCurso;

  diagnosticoEnCurso = (async () => {
    try {
      const ultimoRaw = await AsyncStorage.getItem(KEY_ULTIMO_DIAGNOSTICO);
      const ultimo = Number(ultimoRaw ?? 0);
      if (!force && Number.isFinite(ultimo) && Date.now() - ultimo < INTERVALO_DIAGNOSTICO_MS) {
        return null;
      }

      const fn = httpsCallable(getFunctions(), 'diagnosticarAppCheck');
      const { data } = await fn({});
      const hasAppCheck = Boolean(data?.hasAppCheck);
      const enforce = Boolean(data?.enforce);

      await AsyncStorage.setItem(KEY_ULTIMO_DIAGNOSTICO, String(Date.now()));
      registrarEvento('app_check_diagnostic', {
        has_app_check: hasAppCheck,
        enforce,
      });

      if (!hasAppCheck) {
        registrarError(new Error('La app no envió token de App Check.'), 'app_check_diagnostic');
      }

      return data;
    } catch (error) {
      registrarError(error, 'app_check_diagnostic_failed');
      return null;
    } finally {
      diagnosticoEnCurso = null;
    }
  })();

  return diagnosticoEnCurso;
};
