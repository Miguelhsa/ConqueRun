import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert } from 'react-native';
import { EstadoVacio, PantallaCargando } from '../components/ui';
import { collection, doc, getDocs, query, updateDoc, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { FOTO_ESTADOS } from '../utils/moderacion';
import { colors, radius } from '../utils/theme';

export default function ModeracionScreen() {
  const [pendientes, setPendientes] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargarPendientes();
  }, []);

  const cargarPendientes = async () => {
    setCargando(true);
    try {
      const [usuariosSnap, gruposSnap] = await Promise.all([
        getDocs(query(collection(db, 'usuarios'), where('fotoPerfilEstado', '==', FOTO_ESTADOS.PENDIENTE))),
        getDocs(query(collection(db, 'grupos'), where('fotoEstado', '==', FOTO_ESTADOS.PENDIENTE))),
      ]);

      const usuarios = usuariosSnap.docs
        .map(d => ({ id: d.id, tipo: 'usuario', nombre: d.data().nickname ?? 'Usuario', url: d.data().fotoPendiente }))
        .filter(item => item.url);

      const grupos = gruposSnap.docs
        .map(d => ({ id: d.id, tipo: 'grupo', nombre: d.data().nombre ?? 'Grupo', url: d.data().fotoPendiente }))
        .filter(item => item.url);

      setPendientes([...usuarios, ...grupos]);
    } catch (e) {
      Alert.alert('Error', 'No se pudieron cargar las fotos pendientes');
    } finally {
      setCargando(false);
    }
  };

  const aprobar = async (item) => {
    const ref = doc(db, item.tipo === 'usuario' ? 'usuarios' : 'grupos', item.id);
    const payload = item.tipo === 'usuario'
      ? {
          fotoPerfil: item.url,
          fotoPerfilEstado: FOTO_ESTADOS.APROBADA,
          fotoRevisadaEn: serverTimestamp(),
          fotoMotivoRechazo: null,
        }
      : {
          foto: item.url,
          fotoEstado: FOTO_ESTADOS.APROBADA,
          fotoRevisadaEn: serverTimestamp(),
          fotoMotivoRechazo: null,
        };

    await updateDoc(ref, payload);
    await cargarPendientes();
  };

  const rechazar = async (item) => {
    const ref = doc(db, item.tipo === 'usuario' ? 'usuarios' : 'grupos', item.id);
    const payload = item.tipo === 'usuario'
      ? {
          fotoPerfilEstado: FOTO_ESTADOS.RECHAZADA,
          fotoRevisadaEn: serverTimestamp(),
          fotoMotivoRechazo: 'contenido_no_permitido',
        }
      : {
          fotoEstado: FOTO_ESTADOS.RECHAZADA,
          fotoRevisadaEn: serverTimestamp(),
          fotoMotivoRechazo: 'contenido_no_permitido',
        };

    await updateDoc(ref, payload);
    await cargarPendientes();
  };

  if (cargando) return <PantallaCargando />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      {pendientes.length === 0 ? (
        <EstadoVacio titulo="No hay fotos pendientes" subtitulo="Todo está al día." />
      ) : (
        pendientes.map(item => (
          <View key={`${item.tipo}-${item.id}`} style={styles.card}>
            <Image source={{ uri: item.url }} style={styles.preview} />
            <View style={styles.info}>
              <Text style={styles.nombre}>{item.nombre}</Text>
              <Text style={styles.tipo}>{item.tipo}</Text>
              <View style={styles.acciones}>
                <TouchableOpacity style={styles.aprobar} onPress={() => aprobar(item)}>
                  <Text style={styles.accionTexto}>Aprobar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.rechazar} onPress={() => rechazar(item)}>
                  <Text style={styles.accionTexto}>Rechazar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  contenido: { padding: 16, paddingBottom: 40 },
  card: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, marginBottom: 12, gap: 12 },
  preview: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: colors.border },
  info: { flex: 1 },
  nombre: { color: colors.text, fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  tipo: { color: colors.muted, fontSize: 12, marginBottom: 12 },
  acciones: { flexDirection: 'row', gap: 8 },
  aprobar: { flex: 1, backgroundColor: '#2a9d8f', borderRadius: 8, padding: 10, alignItems: 'center' },
  rechazar: { flex: 1, backgroundColor: '#e63946', borderRadius: 8, padding: 10, alignItems: 'center' },
  accionTexto: { color: colors.text, fontSize: 13, fontWeight: 'bold' },
});
