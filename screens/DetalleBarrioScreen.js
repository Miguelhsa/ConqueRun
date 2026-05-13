import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking } from 'react-native';
import { TerritoryCircle, TerritoryMap, TerritoryMarker } from '../components/map/MapAdapter';
import { auth } from '../firebaseConfig';
import { getNombreTerritorio } from '../utils/mapaTerritorios';
import { colors, radius } from '../utils/theme';

const abrirNavegacion = (barrio) => {
  const lat = barrio.lat;
  const lng = barrio.lng;
  const nombre = encodeURIComponent(getNombreTerritorio(barrio));
  const urlApple = `maps://?daddr=${lat},${lng}&q=${nombre}`;
  const urlGoogle = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  Linking.canOpenURL(urlApple)
    .then(puede => Linking.openURL(puede ? urlApple : urlGoogle))
    .catch(() => Linking.openURL(urlGoogle));
};

export default function DetalleBarrioScreen({ barrio, duenoInfo, onClose }) {
  if (!barrio) return null;

  const uid = auth.currentUser?.uid;
  const esPropio = barrio.dueno === uid;
  const esLibre = !barrio.dueno;
  const esRival = barrio.dueno && !esPropio;

  const colorEstado = esLibre ? colors.subdued : esPropio ? colors.gold : colors.conquest;
  const textoEstado = esLibre ? 'Sin conquistar' : esPropio ? 'Tuyo' : 'Rival';

  const fechaConquista = barrio.conquistadoEn?.toDate
    ? barrio.conquistadoEn.toDate().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const regionMapa = {
    latitude: barrio.lat,
    longitude: barrio.lng,
    latitudeDelta: 0.018,
    longitudeDelta: 0.018,
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <TerritoryMap style={styles.mapa} initialRegion={regionMapa} scrollEnabled={false} zoomEnabled={false}>
          <TerritoryCircle
            center={{ latitude: barrio.lat, longitude: barrio.lng }}
            radius={barrio.radio}
            fillColor={`${colorEstado}44`}
            strokeColor={colorEstado}
            strokeWidth={3}
          />
          <TerritoryMarker
            coordinate={{ latitude: barrio.lat, longitude: barrio.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={[styles.etiquetaMapa, { borderColor: colorEstado }]}>
              <Text style={styles.etiquetaMapaTexto}>{getNombreTerritorio(barrio)}</Text>
            </View>
          </TerritoryMarker>
        </TerritoryMap>

        <TouchableOpacity style={styles.botonCerrar} onPress={onClose}>
          <Text style={styles.botonCerrarTexto}>✕</Text>
        </TouchableOpacity>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.contenido}>
          <View style={styles.cabecera}>
            <View style={[styles.estadoBadge, { borderColor: colorEstado }]}>
              <Text style={[styles.estadoTexto, { color: colorEstado }]}>{textoEstado}</Text>
            </View>
          </View>

          <Text style={styles.nombre}>{getNombreTerritorio(barrio)}</Text>
          {barrio.distrito && <Text style={styles.distrito}>{barrio.distrito}</Text>}

          {!esLibre && (
            <View style={styles.seccion}>
              <Text style={styles.seccionTitulo}>Dueño actual</Text>
              <View style={styles.duenoFila}>
                <View style={[styles.duenoAvatar, { backgroundColor: colorEstado + '33' }]}>
                  <Text style={[styles.duenoAvatarLetra, { color: colorEstado }]}>
                    {(duenoInfo?.nickname ?? '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.duenoInfo}>
                  <Text style={styles.duenoNickname}>
                    {duenoInfo?.nickname ?? 'Cargando...'}
                    {esPropio ? ' (tú)' : ''}
                  </Text>
                  {barrio.duenoPuntos > 0 && (
                    <Text style={styles.duenoPuntos}>{barrio.duenoPuntos.toLocaleString()} pts en esta zona</Text>
                  )}
                </View>
              </View>
              {fechaConquista && (
                <Text style={styles.fecha}>Conquistado el {fechaConquista}</Text>
              )}
            </View>
          )}

          <View style={styles.seccion}>
            <Text style={styles.seccionTitulo}>Cómo conquistarlo</Text>
            {esLibre && (
              <Text style={styles.infoTexto}>
                Esta zona está libre. Corre dentro del radio y acumula puntos para hacerte con ella.
              </Text>
            )}
            {esPropio && (
              <Text style={styles.infoTexto}>
                Es tuya. Para mantenerla, corre aquí con regularidad. Si otro corredor acumula más puntos que tú, te la quitará.
              </Text>
            )}
            {esRival && barrio.duenoPuntos > 0 && (
              <Text style={styles.infoTexto}>
                El dueño tiene {barrio.duenoPuntos.toLocaleString()} pts aquí. Necesitas superar esa marca con tus puntos acumulados en esta zona.
              </Text>
            )}
            <Text style={styles.infoRadio}>
              Radio de la zona: {barrio.radio >= 1000
                ? `${(barrio.radio / 1000).toFixed(1)} km`
                : `${barrio.radio} m`}
            </Text>
          </View>

          <TouchableOpacity style={styles.botonNavegar} onPress={() => abrirNavegacion(barrio)}>
            <Text style={styles.botonNavegarTexto}>Cómo llegar</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  mapa: { height: 220 },
  botonCerrar: {
    position: 'absolute',
    top: 48,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonCerrarTexto: { color: colors.text, fontSize: 16 },
  scroll: { flex: 1 },
  contenido: { padding: 20, paddingBottom: 40 },
  cabecera: { marginBottom: 8 },
  estadoBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  estadoTexto: { fontSize: 12, fontWeight: 'bold' },
  nombre: { color: colors.text, fontSize: 26, fontWeight: 'bold', marginBottom: 4 },
  distrito: { color: colors.subdued, fontSize: 14, marginBottom: 16 },
  seccion: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 12,
  },
  seccionTitulo: { color: colors.text, fontSize: 14, fontWeight: 'bold', marginBottom: 10 },
  duenoFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  duenoAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  duenoAvatarLetra: { fontSize: 20, fontWeight: 'bold' },
  duenoInfo: { flex: 1 },
  duenoNickname: { color: colors.text, fontSize: 16, fontWeight: 'bold' },
  duenoPuntos: { color: colors.muted, fontSize: 13, marginTop: 2 },
  fecha: { color: colors.subdued, fontSize: 12, marginTop: 10 },
  infoTexto: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 8 },
  infoRadio: { color: colors.subdued, fontSize: 13 },
  botonNavegar: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 16,
    alignItems: 'center',
  },
  botonNavegarTexto: { color: colors.text, fontSize: 15, fontWeight: '600' },
  etiquetaMapa: {
    backgroundColor: 'rgba(8,11,20,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  etiquetaMapaTexto: { color: colors.text, fontSize: 11, fontWeight: 'bold' },
});
