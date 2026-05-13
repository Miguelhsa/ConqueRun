import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

export function EstadoError({ mensaje, onReintentar }) {
  return (
    <View style={styles.vacio}>
      <Text style={styles.vacioTitulo}>Algo fue mal</Text>
      <Text style={styles.vacioSub}>{mensaje ?? 'Revisa tu conexión e inténtalo de nuevo.'}</Text>
      {onReintentar ? (
        <TouchableOpacity onPress={onReintentar} style={styles.reintentar}>
          <Text style={styles.reintentarTexto}>Reintentar</Text>
        </TouchableOpacity>
      ) : null}
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
  reintentar: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.gold,
  },
  reintentarTexto: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: 'bold',
  },
});
