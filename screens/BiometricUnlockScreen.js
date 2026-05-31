import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { signOut } from 'firebase/auth';

import { auth } from '../firebaseConfig';
import { colors, radius } from '../utils/theme';

export default function BiometricUnlockScreen({ onUnlocked }) {
  const [autenticando, setAutenticando] = useState(false);

  useEffect(() => {
    desbloquear();
  }, []);

  const desbloquear = async () => {
    setAutenticando(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloquear ConqueRun',
        fallbackLabel: 'Usar código',
        cancelLabel: 'Cancelar',
        disableDeviceFallback: false,
      });

      if (result.success) {
        onUnlocked();
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo verificar tu identidad');
    } finally {
      setAutenticando(false);
    }
  };

  const cambiarCuenta = async () => {
    await signOut(auth);
  };

  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        <Text style={styles.marca}>ConqueRun</Text>
        <Text style={styles.titulo}>Sesión guardada</Text>
        <Text style={styles.texto}>Desbloquea con Face ID, Touch ID o el código del dispositivo.</Text>

        <TouchableOpacity
          style={[styles.boton, autenticando && styles.botonDesactivado]}
          onPress={desbloquear}
          disabled={autenticando}
        >
          {autenticando ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.botonTexto}>Desbloquear</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={cambiarCuenta}>
          <Text style={styles.cambiarCuenta}>Usar otra cuenta</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 22,
  },
  marca: {
    color: colors.gold,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 18,
  },
  titulo: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 8,
  },
  texto: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 22,
  },
  boton: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    padding: 15,
    alignItems: 'center',
    marginBottom: 16,
  },
  botonDesactivado: {
    opacity: 0.7,
  },
  botonTexto: {
    color: colors.bg,
    fontSize: 16,
    fontWeight: '900',
  },
  cambiarCuenta: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
