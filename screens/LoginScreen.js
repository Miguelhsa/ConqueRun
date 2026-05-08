import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ImageBackground, Platform, ActivityIndicator } from 'react-native';
import { auth } from '../firebaseConfig';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { colors, radius } from '../utils/theme';

const MENSAJES_ERROR = {
  'auth/user-not-found': 'No existe una cuenta con ese email.',
  'auth/wrong-password': 'Contraseña incorrecta.',
  'auth/invalid-credential': 'Email o contraseña incorrectos.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
  'auth/network-request-failed': 'Sin conexión. Revisa tu internet.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese email.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/invalid-email': 'El formato del email no es válido.',
};

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [esRegistro, setEsRegistro] = useState(false);
  const [cargando, setCargando] = useState(false);

  const handleAuth = async () => {
    if (cargando) return;
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

  return (
    <ImageBackground
      source={require('../assets/login-map-flag-centered.jpg')}
      style={styles.container}
      imageStyle={styles.fondoImagen}
      resizeMode="cover"
    >
      <View style={styles.overlay} />

      <View style={styles.marca}>
        <Text style={styles.titulo}>ConqueRun</Text>
        <Text style={styles.subtitulo}>Conquista tu barrio</Text>
      </View>

      <View style={styles.formulario}>
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

        <TouchableOpacity onPress={() => setEsRegistro(!esRegistro)} disabled={cargando}>
          <Text style={styles.cambiar}>
            {esRegistro ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
          </Text>
        </TouchableOpacity>

        {!esRegistro && (
          <TouchableOpacity onPress={recuperarPassword} disabled={cargando}>
            <Text style={styles.olvido}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>
        )}
      </View>
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
  formulario: {
    width: '100%',
  },
  marca: {
    width: '100%',
    alignItems: 'center',
  },
  titulo: {
    fontFamily: Platform.select({
      ios: 'AvenirNext-Heavy',
      android: 'sans-serif-condensed',
      default: 'System',
    }),
    fontSize: 54,
    fontWeight: '900',
    color: '#f8fafc',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
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
});
