import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '../utils/theme';

export function PantallaCargando() {
  return (
    <View style={styles.pantalla}>
      <ActivityIndicator color={colors.gold} size="large" />
    </View>
  );
}

export function EstadoVacio({ titulo, subtitulo }) {
  return (
    <View style={styles.vacio}>
      <Text style={styles.vacioTitulo}>{titulo}</Text>
      {subtitulo ? <Text style={styles.vacioSub}>{subtitulo}</Text> : null}
    </View>
  );
}

export function EstadoError({ mensaje }) {
  return (
    <View style={styles.vacio}>
      <Text style={styles.vacioTitulo}>Algo fue mal</Text>
      <Text style={styles.vacioSub}>{mensaje ?? 'Revisa tu conexión e inténtalo de nuevo.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vacio: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  vacioTitulo: {
    color: colors.text,
    fontSize: 17,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  vacioSub: {
    color: colors.subdued,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
