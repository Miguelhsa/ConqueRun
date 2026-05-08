import { useState, useRef } from 'react';
import {
  Alert, View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Dimensions,
} from 'react-native';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { colors, radius } from '../utils/theme';

const { width } = Dimensions.get('window');

const PASOS = [
  {
    emoji: '🗺️',
    etiqueta: 'LA IDEA',
    titulo: 'Tu ciudad\nes el campo\nde juego',
    texto: 'ConqueRun convierte cada kilómetro en territorio. Corre por tus barrios y ponlos bajo tu control.',
    color: colors.gold,
  },
  {
    emoji: '🚩',
    etiqueta: 'CONQUISTA',
    titulo: 'Toma barrios.\nDefiéndelos.\nRecupéralos.',
    texto: 'Cada barrio tiene un dueño. Si superas sus puntos corriendo por ahí, pasa a ser tuyo. Pero ojo: mañana alguien puede quitártelo.',
    color: colors.conquest,
  },
  {
    emoji: '⭐',
    etiqueta: 'PUNTOS',
    titulo: 'Cada carrera\nsuma puntos\nreales',
    texto: 'Cuanto más corras y mejor sea tu ritmo, más puntos. Sin trucos. Solo kilómetros y esfuerzo.',
    color: colors.sport,
  },
  {
    emoji: '🏆',
    etiqueta: 'RANKING',
    titulo: 'Escala en el\nranking de\ntu ciudad',
    texto: 'Compite con todos los corredores de tu ciudad. El ranking es en tiempo real y cambia con cada carrera.',
    color: colors.route,
  },
  {
    emoji: '👥',
    etiqueta: 'GRUPOS',
    titulo: 'Corre en\nequipo y\ndomina más',
    texto: 'Crea o únete a grupos de corredores. Vuestros puntos se multiplican juntos y podéis arrasar el ranking de ciudad.',
    color: colors.gold,
  },
  {
    emoji: '⚡',
    etiqueta: 'LISTO',
    titulo: '¿A qué\nestás\nesperando?',
    texto: 'Ponte las zapas, sal a correr.',
    color: colors.gold,
    esUltimo: true,
  },
];

export default function OnboardingScreen({ onCompletado }) {
  const [paso, setPaso] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const scrollRef = useRef(null);
  const actual = PASOS[paso];

  const irAPaso = (nuevo) => {
    setPaso(nuevo);
    scrollRef.current?.scrollTo({ x: nuevo * width, animated: true });
  };

  const avanzar = async () => {
    if (paso < PASOS.length - 1) {
      irAPaso(paso + 1);
      return;
    }
    setGuardando(true);
    try {
      await setDoc(doc(db, 'usuarios', auth.currentUser.uid), {
        onboardingCompletado: true,
        onboardingPendiente: false,
        onboardingCompletadoEn: serverTimestamp(),
      }, { merge: true });
      onCompletado();
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <View style={styles.container}>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {PASOS.map((p, i) => (
          <View key={i} style={styles.slide}>
            <View style={[styles.emojiCirculo, { borderColor: p.color }]}>
              <Text style={styles.emoji}>{p.emoji}</Text>
            </View>
            <Text style={[styles.etiqueta, { color: p.color }]}>{p.etiqueta}</Text>
            <Text style={styles.titulo}>{p.titulo}</Text>
            <Text style={styles.texto}>{p.texto}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Progreso */}
      <View style={styles.progressRow}>
        {PASOS.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === paso && styles.dotActivo,
              i < paso && { backgroundColor: colors.gold, opacity: 0.4 },
            ]}
          />
        ))}
      </View>

      {/* Botones */}
      <View style={styles.botonesRow}>
        {paso > 0 && (
          <TouchableOpacity style={styles.botonAtras} onPress={() => irAPaso(paso - 1)}>
            <Text style={styles.botonAtrasTexto}>← Atrás</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.boton,
            { backgroundColor: actual.color },
            guardando && { opacity: 0.6 },
            paso === 0 && { flex: 1 },
          ]}
          onPress={avanzar}
          disabled={guardando}
        >
          <Text style={styles.botonTexto}>
            {actual.esUltimo ? '¡Empezar a conquistar! →' : 'Siguiente →'}
          </Text>
        </TouchableOpacity>
      </View>

      {!actual.esUltimo && (
        <TouchableOpacity onPress={() => irAPaso(PASOS.length - 1)} style={styles.saltarWrapper}>
          <Text style={styles.saltar}>Saltar intro</Text>
        </TouchableOpacity>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingBottom: 40,
  },
  slide: {
    width,
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 80,
    justifyContent: 'flex-start',
  },
  emojiCirculo: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  emoji: {
    fontSize: 44,
  },
  etiqueta: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 12,
  },
  titulo: {
    fontSize: 42,
    fontWeight: '900',
    color: colors.text,
    lineHeight: 48,
    marginBottom: 20,
  },
  texto: {
    fontSize: 17,
    color: colors.muted,
    lineHeight: 26,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 28,
    marginBottom: 20,
  },
  dot: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  dotActivo: {
    backgroundColor: colors.gold,
  },
  botonesRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 28,
    marginBottom: 8,
  },
  botonAtras: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonAtrasTexto: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
  },
  boton: {
    flex: 1,
    borderRadius: radius.md,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonTexto: {
    color: colors.bg,
    fontSize: 16,
    fontWeight: '900',
  },
  saltarWrapper: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  saltar: {
    color: colors.subdued,
    fontSize: 13,
    fontWeight: '600',
  },
});
