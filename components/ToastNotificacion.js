import { useEffect, useRef } from 'react';
import { Animated, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../utils/theme';

const SAFE_TOP = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : 52;

const DURACION_MS = 4000;
const ANIMACION_MS = 320;

export default function ToastNotificacion({ toast, onOcultar }) {
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!toast) return;

    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: ANIMACION_MS, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -120, duration: ANIMACION_MS, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: ANIMACION_MS, useNativeDriver: true }),
      ]).start(() => onOcultar());
    }, DURACION_MS);

    return () => {
      clearTimeout(timer);
      translateY.setValue(-120);
      opacity.setValue(0);
    };
  }, [toast]);

  if (!toast) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { top: SAFE_TOP, transform: [{ translateY }], opacity },
      ]}
    >
      <View style={styles.card}>
        {toast.titulo && <Text style={styles.titulo}>{toast.titulo}</Text>}
        {toast.cuerpo && <Text style={styles.cuerpo}>{toast.cuerpo}</Text>}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gold,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  titulo: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  cuerpo: {
    color: colors.muted,
    fontSize: 13,
  },
});
