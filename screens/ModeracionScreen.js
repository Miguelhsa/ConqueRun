import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { EstadoVacio, PantallaCargando } from '../components/ui';
import { collection, doc, getDoc, getDocs, query, updateDoc, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { FOTO_ESTADOS } from '../utils/moderacion';
import { colors, radius } from '../utils/theme';

export default function ModeracionScreen() {
  const [reportes, setReportes] = useState([]);
  const [cargando, setCargando] = useState(true);

  useFocusEffect(useCallback(() => {
    cargarReportes();
  }, []));

  const cargarReportes = async () => {
    setCargando(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'reportes'), where('estado', '==', 'pendiente'))
      );

      const items = await Promise.all(
        snap.docs.map(async (d) => {
          const reporte = { id: d.id, ...d.data() };
          const esUsuario = reporte.tipo === 'usuario';
          const coleccion = esUsuario ? 'usuarios' : 'grupos';
          const userSnap = await getDoc(doc(db, coleccion, reporte.recursoId));
          if (!userSnap.exists()) return null;
          const data = userSnap.data();
          return {
            reporteId: d.id,
            recursoId: reporte.recursoId,
            tipo: reporte.tipo,
            nombre: esUsuario ? (data.nickname ?? 'Usuario') : (data.nombre ?? 'Grupo'),
            fotoUrl: esUsuario ? data.fotoPerfil : data.foto,
            fotoEstadoCampo: esUsuario ? 'fotoPerfilEstado' : 'fotoEstado',
          };
        })
      );

      setReportes(items.filter(Boolean));
    } catch (e) {
      Alert.alert('Error', 'No se pudieron cargar los reportes');
    } finally {
      setCargando(false);
    }
  };

  const eliminarFoto = async (item) => {
    Alert.alert(
      'Eliminar foto',
      `¿Eliminar la foto de ${item.nombre}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const coleccion = item.tipo === 'usuario' ? 'usuarios' : 'grupos';
              await updateDoc(doc(db, coleccion, item.recursoId), {
                [item.fotoEstadoCampo]: FOTO_ESTADOS.RECHAZADA,
                fotoRevisadaEn: serverTimestamp(),
                fotoMotivoRechazo: 'contenido_no_permitido',
              });
              await updateDoc(doc(db, 'reportes', item.reporteId), {
                estado: 'resuelto',
                resolvedAt: serverTimestamp(),
              });
              cargarReportes();
            } catch {
              Alert.alert('Error', 'No se pudo eliminar la foto');
            }
          },
        },
      ]
    );
  };

  const ignorar = async (item) => {
    try {
      await updateDoc(doc(db, 'reportes', item.reporteId), {
        estado: 'ignorado',
        resolvedAt: serverTimestamp(),
      });
      cargarReportes();
    } catch {
      Alert.alert('Error', 'No se pudo ignorar el reporte');
    }
  };

  if (cargando) return <PantallaCargando />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      {reportes.length === 0 ? (
        <EstadoVacio titulo="Sin reportes pendientes" subtitulo="Todo está al día." />
      ) : (
        <>
          <Text style={styles.encabezado}>{reportes.length} reporte{reportes.length !== 1 ? 's' : ''} pendiente{reportes.length !== 1 ? 's' : ''}</Text>
          {reportes.map(item => (
            <View key={item.reporteId} style={styles.card}>
              {item.fotoUrl ? (
                <Image source={{ uri: item.fotoUrl }} style={styles.preview} />
              ) : (
                <View style={[styles.preview, styles.sinFoto]}>
                  <Text style={styles.sinFotoTexto}>Sin foto</Text>
                </View>
              )}
              <View style={styles.info}>
                <Text style={styles.nombre}>{item.nombre}</Text>
                <Text style={styles.tipo}>{item.tipo}</Text>
                <View style={styles.acciones}>
                  <TouchableOpacity style={styles.botonEliminar} onPress={() => eliminarFoto(item)}>
                    <Text style={styles.accionTexto}>Eliminar foto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.botonIgnorar} onPress={() => ignorar(item)}>
                    <Text style={styles.accionTexto}>Ignorar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  contenido: { padding: 16, paddingBottom: 40 },
  encabezado: { color: colors.muted, fontSize: 13, marginBottom: 16 },
  card: {
    flexDirection: 'row', backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: 12, marginBottom: 12, gap: 12,
  },
  preview: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: colors.border },
  sinFoto: { alignItems: 'center', justifyContent: 'center' },
  sinFotoTexto: { color: colors.muted, fontSize: 11 },
  info: { flex: 1 },
  nombre: { color: colors.text, fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  tipo: { color: colors.muted, fontSize: 12, marginBottom: 12 },
  acciones: { flexDirection: 'row', gap: 8 },
  botonEliminar: { flex: 1, backgroundColor: '#e63946', borderRadius: 8, padding: 10, alignItems: 'center' },
  botonIgnorar: { flex: 1, backgroundColor: colors.border, borderRadius: 8, padding: 10, alignItems: 'center' },
  accionTexto: { color: colors.text, fontSize: 13, fontWeight: 'bold' },
});
