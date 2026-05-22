import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Image, ImageBackground, Platform, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { auth } from '../firebaseConfig';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { iniciarSesionGoogle, iniciarSesionApple, appleDisponible } from '../utils/socialAuth';
import { colors, radius } from '../utils/theme';

const URL_TERMINOS = 'https://conquerrun-8d30e.web.app/terminos';
const URL_PRIVACIDAD = 'https://conquerrun-8d30e.web.app/privacidad';

const MENSAJES_ERROR = {
  'auth/user-not-found': 'No existe una cuenta con ese email.',
  'auth/wrong-password': 'Contraseña incorrecta.',
  'auth/invalid-credential': 'Email o contraseña incorrectos.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
  'auth/network-request-failed': 'Sin conexión. Revisa tu internet.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese email.',
  'auth/weak-password': 'La contraseña debe tener al menos 8 caracteres.',
  'auth/invalid-email': 'El formato del email no es válido.',
};

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [esRegistro, setEsRegistro] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [cargandoSocial, setCargandoSocial] = useState(null);
  const [anioNacimiento, setAnioNacimiento] = useState('');
  const [aceptaTerminos, setAceptaTerminos] = useState(false);

  const cambiarModo = (nuevoModo) => {
    setEsRegistro(nuevoModo);
    setAnioNacimiento('');
    setAceptaTerminos(false);
  };

  const handleAuth = async () => {
    if (cargando) return;

    if (esRegistro) {
      const anio = parseInt(anioNacimiento, 10);
      const anioActual = new Date().getFullYear();

      if (!anio || anio < 1900 || anio > anioActual) {
        Alert.alert('Año no válido', 'Introduce tu año de nacimiento con 4 dígitos (por ejemplo: 1995).');
        return;
      }
      if (anioActual - anio < 13) {
        Alert.alert(
          'Edad mínima requerida',
          'ConqueRun es una aplicación para mayores de 13 años. No podemos crear tu cuenta.'
        );
        return;
      }
      if (password.length < 8) {
        Alert.alert('Contraseña débil', 'La contraseña debe tener al menos 8 caracteres.');
        return;
      }
      if (!aceptaTerminos) {
        Alert.alert('Términos requeridos', 'Debes aceptar los Términos de Uso y la Política de Privacidad para crear tu cuenta.');
        return;
      }
    }

    setCargando(true);
    try {
      if (esRegistro) {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      onLogin();
    } catch (error) {
      const mensaje = MENSAJES_ERROR[error.code] ?? 'Algo ha ido mal. Inténtalo de nuevo.';
      Alert.alert('Error', mensaje);
    } finally {
      setCargando(false);
    }
  };

  const recuperarPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Email necesario', 'Escribe tu email para enviarte el enlace de recuperación.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert('Revisa tu correo', 'Te hemos enviado un enlace para cambiar la contraseña.');
    } catch (error) {
      const mensaje = MENSAJES_ERROR[error.code] ?? 'No se pudo enviar el email. Inténtalo de nuevo.';
      Alert.alert('Error', mensaje);
    }
  };

  const handleGoogle = async () => {
    if (cargando || cargandoSocial) return;
    setCargandoSocial('google');
    try {
      const result = await iniciarSesionGoogle();
      if (result) onLogin();
    } catch (error) {
      if (error.message === 'MODULO_NATIVO_NO_DISPONIBLE') {
        Alert.alert('No disponible en desarrollo', 'Google Sign-In requiere la app compilada (build de producción). Usa email/contraseña mientras desarrollas.');
      } else {
        Alert.alert('Error con Google', 'No se pudo iniciar sesión con Google. Inténtalo de nuevo.');
      }
    } finally {
      setCargandoSocial(null);
    }
  };

  const handleApple = async () => {
    if (cargando || cargandoSocial) return;
    setCargandoSocial('apple');
    try {
      const result = await iniciarSesionApple();
      if (result) onLogin();
    } catch (error) {
      if (error.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Error con Apple', `${error.code ?? ''}\n${error.message ?? 'sin mensaje'}`);
      }
    } finally {
      setCargandoSocial(null);
    }
  };

  return (
    <ImageBackground
      source={require('../assets/login-map-flag-centered.jpg')}
      style={styles.container}
      imageStyle={styles.fondoImagen}
      resizeMode="cover"
    >
      <View style={styles.overlay} />

      <View style={styles.marca}>
        <Image
          source={require('../assets/splash-icon.png')}
          style={styles.logoMarca}
          resizeMode="contain"
        />
        <Text style={styles.subtitulo}>Conquista tu barrio</Text>
      </View>

      <ScrollView
        style={styles.formularioScroll}
        contentContainerStyle={styles.formulario}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#7f8796"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!cargando}
        />
        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor="#7f8796"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!cargando}
        />

        {esRegistro && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Año de nacimiento (ej: 1995)"
              placeholderTextColor="#7f8796"
              value={anioNacimiento}
              onChangeText={v => setAnioNacimiento(v.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              editable={!cargando}
            />

            <TouchableOpacity
              style={styles.checkboxFila}
              onPress={() => setAceptaTerminos(v => !v)}
              activeOpacity={0.7}
              disabled={cargando}
            >
              <View style={[styles.checkbox, aceptaTerminos && styles.checkboxMarcado]}>
                {aceptaTerminos && <Text style={styles.checkboxTick}>✓</Text>}
              </View>
              <Text style={styles.checkboxTexto}>
                He leído y acepto los{' '}
                <Text
                  style={styles.enlace}
                  onPress={() => Linking.openURL(URL_TERMINOS)}
                >
                  Términos de Uso
                </Text>
                {' '}y la{' '}
                <Text
                  style={styles.enlace}
                  onPress={() => Linking.openURL(URL_PRIVACIDAD)}
                >
                  Política de Privacidad
                </Text>
              </Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={[styles.boton, cargando && styles.botonDesactivado]}
          onPress={handleAuth}
          disabled={cargando}
        >
          {cargando
            ? <ActivityIndicator color="#05070c" size="small" />
            : <Text style={styles.botonTexto}>{esRegistro ? 'Crear cuenta' : 'Entrar'}</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity onPress={() => cambiarModo(!esRegistro)} disabled={cargando}>
          <Text style={styles.cambiar}>
            {esRegistro ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
          </Text>
        </TouchableOpacity>

        {!esRegistro && (
          <TouchableOpacity onPress={recuperarPassword} disabled={cargando}>
            <Text style={styles.olvido}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>
        )}

        <View style={styles.separador}>
          <View style={styles.separadorLinea} />
          <Text style={styles.separadorTexto}>o continúa con</Text>
          <View style={styles.separadorLinea} />
        </View>

        <TouchableOpacity
          style={[styles.botonSocial, (cargando || cargandoSocial) && styles.botonDesactivado]}
          onPress={handleGoogle}
          disabled={Boolean(cargando || cargandoSocial)}
        >
          {cargandoSocial === 'google'
            ? <ActivityIndicator color="#05070c" size="small" />
            : (
              <>
                <MaterialCommunityIcons name="google" size={20} color="#05070c" />
                <Text style={styles.botonSocialTexto}>Continuar con Google</Text>
              </>
            )
          }
        </TouchableOpacity>

        {appleDisponible && (
          <TouchableOpacity
            style={[styles.botonSocial, styles.botonApple, (cargando || cargandoSocial) && styles.botonDesactivado]}
            onPress={handleApple}
            disabled={Boolean(cargando || cargandoSocial)}
          >
            {cargandoSocial === 'apple'
              ? <ActivityIndicator color="#f8fafc" size="small" />
              : (
                <>
                  <MaterialCommunityIcons name="apple" size={20} color="#f8fafc" />
                  <Text style={[styles.botonSocialTexto, styles.botonAppleTexto]}>Continuar con Apple</Text>
                </>
              )
            }
          </TouchableOpacity>
        )}

        <Text style={styles.legalTexto}>
          Al continuar aceptas los{' '}
          <Text style={styles.enlace} onPress={() => Linking.openURL(URL_TERMINOS)}>
            Términos de Uso
          </Text>
          {' '}y la{' '}
          <Text style={styles.enlace} onPress={() => Linking.openURL(URL_PRIVACIDAD)}>
            Política de Privacidad
          </Text>
        </Text>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    paddingTop: 86,
    paddingBottom: 46,
  },
  fondoImagen: {
    opacity: 0.95,
    transform: [{ translateY: -118 }, { scale: 1.12 }],
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 7, 18, 0.48)',
  },
  formularioScroll: {
    width: '100%',
  },
  formulario: {
    paddingBottom: 8,
  },
  marca: {
    width: '100%',
    alignItems: 'center',
  },
  logoMarca: {
    width: '80%',
    height: 72,
    marginBottom: 8,
  },
  subtitulo: {
    fontFamily: Platform.select({
      ios: 'AvenirNext-DemiBold',
      android: 'sans-serif-medium',
      default: 'System',
    }),
    fontSize: 16,
    fontWeight: '800',
    color: '#d8dee9',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  input: {
    width: '100%',
    backgroundColor: 'rgba(3, 7, 18, 0.84)',
    borderColor: 'rgba(248, 250, 252, 0.28)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 16,
    color: colors.text,
    fontSize: 16,
    marginBottom: 12,
  },
  checkboxFila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(248,250,252,0.4)',
    backgroundColor: 'rgba(3,7,18,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxMarcado: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  checkboxTick: {
    color: '#05070c',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 15,
  },
  checkboxTexto: {
    flex: 1,
    color: '#d8dee9',
    fontSize: 13,
    lineHeight: 19,
  },
  enlace: {
    color: colors.gold,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  boton: {
    width: '100%',
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
    minHeight: 52,
  },
  botonDesactivado: {
    opacity: 0.6,
  },
  botonTexto: {
    fontFamily: Platform.select({
      ios: 'AvenirNext-Heavy',
      android: 'sans-serif-condensed',
      default: 'System',
    }),
    color: '#05070c',
    fontSize: 16,
    fontWeight: '900',
  },
  cambiar: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  olvido: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 16,
    textAlign: 'center',
  },
  legalTexto: {
    color: 'rgba(248,250,252,0.45)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 16,
  },
  separador: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 10,
  },
  separadorLinea: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(248,250,252,0.15)',
  },
  separadorTexto: {
    color: 'rgba(248,250,252,0.4)',
    fontSize: 12,
    fontWeight: '600',
  },
  botonSocial: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    backgroundColor: '#f8fafc',
    padding: 15,
    borderRadius: radius.md,
    marginBottom: 12,
    minHeight: 52,
  },
  botonApple: {
    backgroundColor: '#000000',
  },
  botonSocialTexto: {
    color: '#05070c',
    fontSize: 15,
    fontWeight: '700',
  },
  botonAppleTexto: {
    color: '#f8fafc',
  },
});
