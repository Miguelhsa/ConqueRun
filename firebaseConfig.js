import { initializeApp } from 'firebase/app';
import { initializeAppCheck as initializeWebAppCheck, CustomProvider } from 'firebase/app-check';
import { getFirestore } from 'firebase/firestore';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyAKnMDOgPNDfH3Ai0RMBTKXAAHvh0LCDQ4",
  authDomain: "conquerrun-8d30e.firebaseapp.com",
  projectId: "conquerrun-8d30e",
  storageBucket: "conquerrun-8d30e.firebasestorage.app",
  messagingSenderId: "743879769903",
  appId: "1:743879769903:web:136b6f6224212ab89c6bda"
};

const app = initializeApp(firebaseConfig);

const APP_CHECK_TOKEN_TTL_MS = 55 * 60 * 1000;
let nativeAppCheckPromise = null;

function isDevelopmentBuild() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function getAppCheckDebugToken() {
  return process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN || '';
}

async function getNativeAppCheck(debugToken) {
  if (!nativeAppCheckPromise) {
    nativeAppCheckPromise = (async () => {
      const rnFirebaseApp = await import('@react-native-firebase/app');
      const rnFirebaseAppCheck = await import('@react-native-firebase/app-check');
      const nativeApp = rnFirebaseApp.getApp();
      const provider = new rnFirebaseAppCheck.ReactNativeFirebaseAppCheckProvider();

      provider.configure({
        android: debugToken
          ? { provider: 'debug', debugToken }
          : { provider: 'playIntegrity' },
        apple: debugToken
          ? { provider: 'debug', debugToken }
          : { provider: 'appAttestWithDeviceCheckFallback' },
      });

      const appCheck = await rnFirebaseAppCheck.initializeAppCheck(nativeApp, {
        provider,
        isTokenAutoRefreshEnabled: true,
      });

      return { appCheck, module: rnFirebaseAppCheck };
    })();
  }

  return nativeAppCheckPromise;
}

function initializeAppCheckSafely(firebaseApp) {
  const debugToken = getAppCheckDebugToken();

  if (isDevelopmentBuild() && !debugToken) {
    return null;
  }

  try {
    return initializeWebAppCheck(firebaseApp, {
      provider: new CustomProvider({
        getToken: async () => {
          const nativeAppCheck = await getNativeAppCheck(debugToken);
          const result = await nativeAppCheck.module.getToken(nativeAppCheck.appCheck, false);
          if (!result?.token) {
            throw new Error('No se pudo obtener token nativo de Firebase App Check.');
          }

          return {
            token: result.token,
            expireTimeMillis: Date.now() + APP_CHECK_TOKEN_TTL_MS,
          };
        },
      }),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    if (error?.code !== 'appCheck/already-initialized') {
      console.warn('[AppCheck] No se pudo inicializar App Check:', error?.message ?? error);
    }
    return null;
  }
}

export const appCheck = initializeAppCheckSafely(app);
export const db = getFirestore(app);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
export const storage = getStorage(app);
