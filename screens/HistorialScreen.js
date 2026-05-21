import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { esCarreraPuntuable, esCarreraStravaVerificada, normalizarCarrera } from '../utils/carreras';
import { formatRitmo } from '../utils/formatters';
import { colors, radius } from '../utils/theme';
import { EstadoVacio, PantallaCargando } from '../components/ui';
import DetalleCarreraScreen from './DetalleCarreraScreen';

export default function HistorialScreen() {
  const [carreras, setCarreras] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [carreraDetalle, setCarreraDetalle] = useState(null);

  useEffect(() => {
    cargarCarreras();
  }, []);

  const cargarCarreras = async () => {
    try {
      const uid = auth.currentUser.uid;
      const snap = await getDocs(query(
        collection(db, 'carreras'),
        where('uid', '==', uid),
        orderBy('fecha', 'desc'),
        limit(200)
      ));
      const data = snap.docs
        .map(d => ({ id: d.id, ...normalizarCarrera(d.data()) }))
        .sort((a, b) => getFechaMs(b.fecha) - getFechaMs(a.fecha));
      setCarreras(data);
    } finally {
      setCargando(false);
    }
  };

  const getFechaMs = (fecha) => {
    if (!fecha) return 0;
    if (fecha.toDate) return fecha.toDate().getTime();
    return new Date(fecha).getTime() || 0;
  };

  const formatFecha = (fecha) => {
    const ms = getFechaMs(fecha);
    if (!ms) return 'Sin fecha';
    return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (cargando) return <PantallaCargando />;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
        {carreras.length === 0 && (
          <EstadoVacio titulo="Aún no hay carreras" subtitulo="Sal a correr y conquista tu primer barrio." />
        )}
        {carreras.map(carrera => {
          const puntuable = esCarreraPuntuable(carrera);
          const strava = esCarreraStravaVerificada(carrera);
          return (
            <TouchableOpacity
              key={carrera.id}
              style={[styles.card, !puntuable && styles.cardNoPuntuable]}
              onPress={() => setCarreraDetalle(carrera)}
              activeOpacity={0.75}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.fecha}>{formatFecha(carrera.fecha)}</Text>
                <Text style={[styles.estado, strava && styles.estadoStrava]}>
                  {strava ? 'Strava verificada' : puntuable ? 'ConqueRun' : 'No puntuable'}
                </Text>
              </View>
              <View style={styles.metricas}>
                <Text style={styles.metrica}>{(carrera.distancia / 1000).toFixed(2)} km</Text>
                <Text style={styles.metrica}>{formatRitmo(carrera.ritmoMedio)} min/km</Text>
                <Text style={styles.metrica}>{(carrera.puntosPersonales ?? carrera.puntos ?? 0).toLocaleString()} pts</Text>
                <Text style={styles.metrica}>🚩 {carrera.barriosConquistados ?? 0}</Text>
              </View>
              {carrera.aportacionesGrupo.length > 0 && (
                <View style={styles.aportacionesBox}>
                  <Text style={styles.aportacionesTitulo}>Aportación a grupos</Text>
                  {carrera.aportacionesGrupo.map(aportacion => (
                    <Text key={aportacion.id ?? aportacion.grupoId} style={styles.aportacionTexto}>
                      {aportacion.grupoNombre}: {aportacion.puntosGrupo.toLocaleString()} pts · x{aportacion.multiplicadorGrupo.toFixed(2)}
                    </Text>
                  ))}
                </View>
              )}
              {carrera.stravaActivityUrl && (
                <TouchableOpacity onPress={() => Linking.openURL(carrera.stravaActivityUrl)}>
                  <Text style={styles.stravaLink}>Ver en Strava</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.verDetalle}>Ver detalle →</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <DetalleCarreraScreen
        carrera={carreraDetalle}
        onClose={() => setCarreraDetalle(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  contenido: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, marginBottom: 10 },
  cardNoPuntuable: { opacity: 0.55 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  fecha: { color: colors.text, fontSize: 15, fontWeight: 'bold' },
  estado: { color: colors.muted, fontSize: 12 },
  estadoStrava: { color: colors.strava },
  metricas: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  metrica: { color: colors.muted, fontSize: 13 },
  aportacionesBox: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 10,
    marginTop: 10,
  },
  aportacionesTitulo: { color: colors.text, fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  aportacionTexto: { color: colors.muted, fontSize: 12, marginTop: 2 },
  stravaLink: { color: colors.strava, fontSize: 13, fontWeight: 'bold', marginTop: 10 },
  verDetalle: { color: colors.subdued, fontSize: 12, marginTop: 10, textAlign: 'right' },
});
