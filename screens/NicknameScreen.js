import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Keyboard } from 'react-native';
import { auth } from '../firebaseConfig';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { contieneTextoProhibido } from '../utils/moderacion';
import { PAISES } from '../utils/paises';
import { colors, radius } from '../utils/theme';

const NICKNAME_REGEX = /^[a-zA-Z0-9_áéíóúÁÉÍÓÚñÑüÜ]+$/;

const normalizarFecha = (valor) => {
  const match = valor.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const anio = Number(match[3]);
  const fecha = new Date(anio, mes - 1, dia);
  const ahora = new Date();
  if (
    fecha.getFullYear() !== anio ||
    fecha.getMonth() !== mes - 1 ||
    fecha.getDate() !== dia ||
    fecha > ahora ||
    anio < 1900
  ) return null;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
};

const calcularEdad = (fechaISO) => {
  const hoy = new Date();
  const nac = new Date(fechaISO);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
};

const formatearFechaInput = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

export default function NicknameScreen({ onGuardado }) {
  const [nickname, setNickname] = useState('');
  const [nacionalidad, setNacionalidad] = useState(null);
  const [genero, setGenero] = useState(null);
  const [fechaInput, setFechaInput] = useState('');
  const [mostrarNacionalidades, setMostrarNacionalidades] = useState(false);
  const [busquedaPais, setBusquedaPais] = useState('');
  const [guardando, setGuardando] = useState(false);

  const listo = nickname.trim().length >= 3 && nacionalidad && genero && fechaInput.length === 10;

  const guardar = async () => {
    const nicknameLimpio = nickname.trim();
    const usuario = auth.currentUser;

    if (!usuario) {
      Alert.alert('Sesión no disponible', 'Vuelve a iniciar sesión para continuar.');
      return;
    }
    if (nicknameLimpio.length < 3) {
      Alert.alert('Nickname muy corto', 'Debe tener al menos 3 caracteres.');
      return;
    }
    if (!NICKNAME_REGEX.test(nicknameLimpio)) {
      Alert.alert('Nickname no válido', 'Usa solo letras, números y guion bajo. No incluyas espacios.');
      return;
    }
    if (contieneTextoProhibido(nicknameLimpio)) {
      Alert.alert('Nickname no permitido', 'Elige un nombre que respete a la comunidad.');
      return;
    }
    if (!nacionalidad) {
      Alert.alert('Selecciona tu nacionalidad', 'Es necesaria para mostrar tu bandera en el ranking.');
      return;
    }
    if (!genero) {
      Alert.alert('Selecciona tu género', 'Es necesario para las categorías del ranking.');
      return;
    }
    const fechaNacimiento = normalizarFecha(fechaInput);
    if (!fechaNacimiento) {
      Alert.alert('Fecha no válida', 'Comprueba que la fecha esté en formato DD/MM/AAAA y sea correcta.');
      return;
    }
    const edad = calcularEdad(fechaNacimiento);
    if (edad < 13) {
      Alert.alert('Edad mínima', 'Debes tener al menos 13 años para usar ConqueRun.');
      return;
    }
    setGuardando(true);
    try {
      const completarPerfilInicial = httpsCallable(getFunctions(), 'completarPerfilInicial');
      await completarPerfilInicial({
        nickname: nicknameLimpio,
        pais: nacionalidad,
        genero,
        fechaNacimiento,
      });
      onGuardado();
    } catch (e) {
      console.error('[NicknameScreen] guardar perfil inicial:', e);
      const mensaje = e.code === 'NICKNAME_TAKEN' || e.code === 'functions/already-exists'
        ? 'Ese nickname ya está en uso. Elige otro.'
        : e.code === 'functions/invalid-argument' || e.code === 'functions/failed-precondition'
          ? e.message ?? 'No se pudo guardar con esos datos.'
        : e.code === 'functions/unauthenticated'
          ? 'Sesión no disponible. Vuelve a iniciar sesión.'
        : e.code === 'permission-denied' || e.code === 'functions/permission-denied'
          ? 'No se pudo guardar por permisos de base de datos. Actualiza la app e inténtalo de nuevo.'
          : 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.';
      Alert.alert('Error', mensaje);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.titulo}>¿Cómo te llamamos?</Text>
      <Text style={styles.subtitulo}>
        Estos datos aparecerán en el ranking. Género, nacionalidad y fecha de nacimiento no se podrán cambiar después.
      </Text>

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

      <Text style={styles.label}>Género</Text>
      <View style={styles.generoRow}>
        <TouchableOpacity
          style={[styles.generoBoton, genero === 'hombre' && styles.generoActivo]}
          onPress={() => setGenero('hombre')}
        >
          <Text style={[styles.generoTexto, genero === 'hombre' && styles.generoTextoActivo]}>♂ Hombre</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.generoBoton, genero === 'mujer' && styles.generoActivo]}
          onPress={() => setGenero('mujer')}
        >
          <Text style={[styles.generoTexto, genero === 'mujer' && styles.generoTextoActivo]}>♀ Mujer</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Fecha de nacimiento</Text>
      <TextInput
        style={styles.input}
        placeholder="DD/MM/AAAA"
        placeholderTextColor={colors.subdued}
        value={fechaInput}
        onChangeText={raw => setFechaInput(formatearFechaInput(raw))}
        keyboardType="number-pad"
        maxLength={10}
      />

      <Text style={styles.label}>Nacionalidad</Text>
      <TouchableOpacity
        style={[styles.selectorBoton, nacionalidad && styles.selectorBotonActivo]}
        onPress={() => { Keyboard.dismiss(); setMostrarNacionalidades(v => !v); setBusquedaPais(''); }}
      >
        <Text style={[styles.selectorTexto, nacionalidad && styles.selectorTextoActivo]}>
          {nacionalidad ? `${nacionalidad.bandera}  ${nacionalidad.nombre}` : 'Selecciona tu nacionalidad'}
        </Text>
        <Text style={styles.chevron}>{mostrarNacionalidades ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {mostrarNacionalidades && (
        <View style={styles.lista}>
          <TextInput
            style={styles.buscador}
            placeholder="Buscar país..."
            placeholderTextColor={colors.subdued}
            value={busquedaPais}
            onChangeText={setBusquedaPais}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <ScrollView
            style={styles.listaPaises}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {PAISES.filter(p =>
              p.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
                .includes(busquedaPais.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
            ).map(p => (
              <TouchableOpacity
                key={p.nombre}
                style={[styles.opcion, nacionalidad?.nombre === p.nombre && styles.opcionActiva]}
                onPress={() => { setNacionalidad(p); setMostrarNacionalidades(false); setBusquedaPais(''); }}
              >
                <Text style={styles.opcionTexto}>{p.bandera}  {p.nombre}</Text>
                {nacionalidad?.nombre === p.nombre && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <TouchableOpacity
        style={[styles.boton, (!listo || guardando) && styles.botonDesactivado]}
        onPress={guardar}
        disabled={!listo || guardando}
      >
        <Text style={styles.botonTexto}>{guardando ? 'Guardando...' : 'Continuar'}</Text>
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
  subtitulo: { fontSize: 14, color: colors.muted, marginBottom: 36, lineHeight: 20 },
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
  generoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  generoBoton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 16,
    alignItems: 'center',
  },
  generoActivo: { borderColor: colors.gold, backgroundColor: '#C6F43218' },
  generoTexto: { fontSize: 16, color: colors.subdued, fontWeight: '600' },
  generoTextoActivo: { color: colors.gold },
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
  listaPaises: {
    maxHeight: 260,
  },
  buscador: {
    padding: 12,
    color: colors.text,
    fontSize: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  opcionActiva: { backgroundColor: '#C6F43218' },
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
