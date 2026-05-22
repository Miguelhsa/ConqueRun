import { Platform, TurboModuleRegistry } from 'react-native';
import { GoogleAuthProvider, OAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../firebaseConfig';

const GOOGLE_WEB_CLIENT_ID = '743879769903-emv2olgja4o0nhu1b389ocdml6em79da.apps.googleusercontent.com';

let googleConfigurado = false;

function requireGoogleSignin() {
  // TurboModuleRegistry.get returns null (no crash) if the native module isn't registered.
  // getEnforcing throws a fatal error that bypasses try/catch, so we check first.
  if (!TurboModuleRegistry.get('RNGoogleSignin')) {
    throw new Error('MODULO_NATIVO_NO_DISPONIBLE');
  }
  return require('@react-native-google-signin/google-signin');
}

function asegurarGoogleConfigurado() {
  if (!googleConfigurado) {
    const { GoogleSignin } = requireGoogleSignin();
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    googleConfigurado = true;
  }
}

async function sha256(mensaje) {
  const buffer = new TextEncoder().encode(mensaje);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function iniciarSesionGoogle() {
  asegurarGoogleConfigurado();
  const { GoogleSignin, statusCodes } = requireGoogleSignin();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const respuesta = await GoogleSignin.signIn();

  if (respuesta?.type === 'cancelled' || respuesta?.code === statusCodes.SIGN_IN_CANCELLED) {
    return null;
  }

  const idToken = respuesta?.data?.idToken ?? respuesta?.idToken;
  if (!idToken) throw new Error('No se obtuvo token de Google.');

  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
}

export async function iniciarSesionApple() {
  const AppleAuth = await import('expo-apple-authentication');

  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const nonce = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashedNonce = await sha256(nonce);

  const appleCredential = await AppleAuth.signInAsync({
    requestedScopes: [
      AppleAuth.AppleAuthenticationScope.FULL_NAME,
      AppleAuth.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  const provider = new OAuthProvider('apple.com');
  const credential = provider.credential({
    idToken: appleCredential.identityToken,
    rawNonce: nonce,
  });
  return signInWithCredential(auth, credential);
}

export const appleDisponible = Platform.OS === 'ios';
