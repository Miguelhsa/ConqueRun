import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { db, auth } from '../firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';
import { contieneTextoProhibido } from '../utils/moderacion';
import { PAISES } from '../utils/paises';
import { colors, radius } from '../utils/theme';

export default function NicknameScreen({ onGuardado }) {
  const [nickname, setNickname] = useState('');
  const [pais, setPais] = useState(null);
  const [mostrarPaises, setMostrarPaises] = useState(false);

  const guardar = async () => {
    if (nickname.trim().length < 3) {
      Alert.alert('Nickname muy corto', 'Debe tener al menos 3 caracteres.');
      return;
    }
    if (contieneTextoProhibido(nickname)) {
      Alert.alert('Nickname no permitido', 'Elige un nombre que respete a la comunidad.');
      return;
    }
    if (!pais) {
      Alert.alert('Selecciona tu país', 'Es necesario para el ranking.');
      return;
    }
    try {
      await setDoc(doc(db, 'usuarios', auth.currentUser.uid), {
        nickname,
        pais,
        onboardingPendiente: true,
        onboardingCompletado: false,
      }, { merge: true });
      onGuardado();
    } catch {
      Alert.alert('Error', 'No se pudo guardar. Inténtalo de nuevo.');
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.titulo}>¿Cómo te llamamos?</Text>
      <Text style={styles.subtitulo}>Estos datos aparecerán en el ranking.</Text>

      <Text style={styles.label}>Nickname</Text>
      <TextInput
        style={styles.input}
        placeholder="Tu nickname"
        placeholderTextColor={colors.subdued}
        value={nickname}
        onChangeText={setNickname}
        autoCapitalize="none"
        maxLength={20}
      />

      <Text style={styles.label}>País</Text>
      <TouchableOpacity
        style={[styles.selectorBoton, pais && styles.selectorBotonActivo]}
        onPress={() => setMostrarPaises(v => !v)}
      >
        <Text style={[styles.selectorTexto, pais && styles.selectorTextoActivo]}>
          {pais ? `${pais.bandera}  ${pais.nombre}` : 'Selecciona tu país'}
        </Text>
        <Text style={styles.chevron}>{mostrarPaises ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {mostrarPaises && (
        <View style={styles.lista}>
          {PAISES.map(p => (
            <TouchableOpacity
              key={p.nombre}
              style={[styles.opcion, pais?.nombre === p.nombre && styles.opcionActiva]}
              onPress={() => { setPais(p); setMostrarPaises(false); }}
            >
              <Text style={styles.opcionTexto}>{p.bandera}  {p.nombre}</Text>
              {pais?.nombre === p.nombre && <Text style={styles.check}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={[styles.boton, (!nickname.trim() || !pais) && styles.botonDesactivado]}
        onPress={guardar}
        disabled={!nickname.trim() || !pais}
      >
        <Text style={styles.botonTexto}>Entrar a conquistar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 72,
    paddingBottom: 48,
  },
  titulo: { fontSize: 32, fontWeight: '900', color: colors.text, marginBottom: 8 },
  subtitulo: { fontSize: 15, color: colors.muted, marginBottom: 36, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: 'bold', color: colors.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 16,
    color: colors.text,
    fontSize: 18,
    marginBottom: 24,
  },
  selectorBoton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  selectorBotonActivo: { borderColor: colors.gold },
  selectorTexto: { fontSize: 16, color: colors.subdued },
  selectorTextoActivo: { color: colors.text },
  chevron: { color: colors.muted, fontSize: 12 },
  lista: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    marginBottom: 24,
    overflow: 'hidden',
  },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  opcionActiva: { backgroundColor: '#d6aa4c18' },
  opcionTexto: { fontSize: 16, color: colors.text },
  check: { color: colors.gold, fontSize: 16, fontWeight: 'bold' },
  boton: {
    backgroundColor: colors.gold,
    padding: 18,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: 8,
  },
  botonDesactivado: { opacity: 0.45 },
  botonTexto: { color: colors.bg, fontSize: 16, fontWeight: '900' },
});
