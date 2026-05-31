import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { obtenerCiudades } from '../utils/ciudades';
import { colors, radius } from '../utils/theme';

export default function CiudadScreen({ uid, onGuardado }) {
  const [ciudades, setCiudades] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [seleccionada, setSeleccionada] = useState(null);

  useEffect(() => {
    obtenerCiudades()
      .then(lista => setCiudades(lista.filter(c => c.estadoCobertura !== 'inactiva')))
      .catch(() => Alert.alert('Error', 'No se pudieron cargar las ciudades'))
      .finally(() => setCargando(false));
  }, []);

  const confirmar = async () => {
    if (!seleccionada) return;
    setGuardando(true);
    try {
      await setDoc(doc(db, 'usuarios', uid), {
        ciudadActualId: seleccionada.id,
        ciudadActualNombre: seleccionada.nombre,
        paisCodigo: seleccionada.paisCodigo ?? null,
      }, { merge: true });
      onGuardado();
    } catch {
      Alert.alert('Error', 'No se pudo guardar la ciudad. Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  // Agrupar por país
  const porPais = ciudades.reduce((acc, ciudad) => {
    const pais = ciudad.paisNombre ?? 'Otros';
    if (!acc[pais]) acc[pais] = [];
    acc[pais].push(ciudad);
    return acc;
  }, {});

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>¿En qué ciudad corres?</Text>
      <Text style={styles.subtitulo}>Compite con corredores de tu ciudad y únete a grupos locales.</Text>

      {cargando ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.lista} showsVerticalScrollIndicator={false}>
          {Object.entries(porPais).map(([pais, listaCiudades]) => (
            <View key={pais}>
              <Text style={styles.paisLabel}>{pais}</Text>
              {listaCiudades.map(ciudad => (
                <TouchableOpacity
                  key={ciudad.id}
                  style={[styles.ciudadRow, seleccionada?.id === ciudad.id && styles.ciudadRowActiva]}
                  onPress={() => setSeleccionada(ciudad)}
                >
                  <Text style={[styles.ciudadNombre, seleccionada?.id === ciudad.id && styles.ciudadNombreActivo]}>
                    {ciudad.nombre}
                  </Text>
                  {seleccionada?.id === ciudad.id && (
                    <Text style={styles.check}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      <TouchableOpacity
        style={[styles.boton, (!seleccionada || guardando) && styles.botonDesactivado]}
        onPress={confirmar}
        disabled={!seleccionada || guardando}
      >
        <Text style={styles.botonTexto}>
          {guardando ? 'Guardando...' : seleccionada ? `Empezar en ${seleccionada.nombre}` : 'Selecciona una ciudad'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 24,
    paddingTop: 60,
  },
  titulo: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.text,
    marginBottom: 10,
  },
  subtitulo: {
    fontSize: 16,
    color: colors.muted,
    lineHeight: 23,
    marginBottom: 28,
  },
  lista: {
    flex: 1,
  },
  paisLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.subdued,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  ciudadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ciudadRowActiva: {
    borderColor: colors.gold,
    backgroundColor: '#C6F43218',
  },
  ciudadNombre: {
    fontSize: 17,
    color: colors.text,
    fontWeight: '600',
  },
  ciudadNombreActivo: {
    color: colors.gold,
  },
  check: {
    color: colors.gold,
    fontSize: 18,
    fontWeight: 'bold',
  },
  boton: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  botonDesactivado: {
    opacity: 0.45,
  },
  botonTexto: {
    color: colors.bg,
    fontSize: 16,
    fontWeight: '900',
  },
});
