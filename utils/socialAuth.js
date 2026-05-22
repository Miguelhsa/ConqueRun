import { Platform, TurboModuleRegistry } from 'react-native';
import { GoogleAuthProvider, OAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../firebaseConfig';

const GOOGLE_WEB_CLIENT_ID = '743879769903-emv2olgja4o0nhu1b389ocdml6em79da.apps.googleusercontent.com';

let googleConfigurado = false;

function requireGoogleSignin() {
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

// Pure JS SHA-256 — crypto.subtle is not available in Hermes/React Native
function sha256(str) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const cp = str.charCodeAt(i);
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  const len = bytes.length;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const bitLen = len * 8;
  bytes.push(0, 0, 0, 0, (bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff);
  const h = [...H];
  for (let i = 0; i < bytes.length; i += 64) {
    const w = new Array(64);
    for (let j = 0; j < 16; j++) w[j] = ((bytes[i+j*4]<<24)|(bytes[i+j*4+1]<<16)|(bytes[i+j*4+2]<<8)|bytes[i+j*4+3])>>>0;
    for (let j = 16; j < 64; j++) {
      const s0 = (((w[j-15]>>>7)|(w[j-15]<<25))^((w[j-15]>>>18)|(w[j-15]<<14))^(w[j-15]>>>3))>>>0;
      const s1 = (((w[j-2]>>>17)|(w[j-2]<<15))^((w[j-2]>>>19)|(w[j-2]<<13))^(w[j-2]>>>10))>>>0;
      w[j] = (w[j-16]+s0+w[j-7]+s1)>>>0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let j = 0; j < 64; j++) {
      const S1 = (((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7)))>>>0;
      const ch = ((e&f)^(~e&g))>>>0;
      const t1 = (hh+S1+ch+K[j]+w[j])>>>0;
      const S0 = (((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10)))>>>0;
      const maj = ((a&b)^(a&c)^(b&c))>>>0;
      const t2 = (S0+maj)>>>0;
      hh=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    h[0]=(h[0]+a)>>>0; h[1]=(h[1]+b)>>>0; h[2]=(h[2]+c)>>>0; h[3]=(h[3]+d)>>>0;
    h[4]=(h[4]+e)>>>0; h[5]=(h[5]+f)>>>0; h[6]=(h[6]+g)>>>0; h[7]=(h[7]+hh)>>>0;
  }
  return h.map(v => v.toString(16).padStart(8, '0')).join('');
}

function randomNonce() {
  const cryptoObj = global.crypto ?? globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const arr = new Uint8Array(16);
    cryptoObj.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
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

  const nonce = randomNonce();
  const hashedNonce = sha256(nonce);

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
