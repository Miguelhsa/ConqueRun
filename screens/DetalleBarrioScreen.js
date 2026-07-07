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

export default function DetalleBarrioScreen({ barrio, duenoInfo, modoMapa, grupoInfo, grupoColor, misGruposIds, onClose }) {
  if (!barrio) return null;

  const uid = auth.currentUser?.uid;
  const esGrupos = modoMapa === 'grupos';

  const duenoCampo = esGrupos ? barrio.duenoGrupo : barrio.dueno;
  const puntosCampo = esGrupos ? (barrio.duenoGrupoPuntos ?? 0) : (barrio.duenoPuntos ?? 0);
  const fechaCampo = esGrupos ? barrio.actualizadoGrupoEn : barrio.conquistadoEn;

  const esLibre = !duenoCampo;
  const esMio = esGrupos
    ? (barrio.duenoGrupo && misGruposIds?.has(barrio.duenoGrupo))
    : barrio.dueno === uid;
  const esRival = !esLibre && !esMio;

  const colorEstado = esLibre ? colors.subdued : esMio ? colors.gold : colors.conquest;
  const textoEstado = esLibre
    ? 'Sin conquistar'
    : esMio
      ? (esGrupos ? 'Tu equipo' : 'Tuyo')
      : 'Rival';

  const fechaConquista = (!esGrupos && fechaCampo?.toDate)
    ? fechaCampo.toDate().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const nombreDueno = esGrupos
    ? (grupoInfo?.nombre ?? 'Equipo')
    : (duenoInfo?.nickname ?? 'Cargando...');

  const letraAvatar = nombreDueno[0]?.toUpperCase() ?? '?';
  const colorAvatar = esGrupos ? (grupoColor ?? colorEstado) : colorEstado;

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
              <Text style={styles.seccionTitulo}>{esGrupos ? 'Equipo dominante' : 'Dueño actual'}</Text>
              <View style={styles.duenoFila}>
                <View style={[styles.duenoAvatar, { backgroundColor: colorAvatar + '33' }]}>
                  <Text style={[styles.duenoAvatarLetra, { color: colorAvatar }]}>
                    {letraAvatar}
                  </Text>
                </View>
                <View style={styles.duenoInfo}>
                  <Text style={styles.duenoNickname}>
                    {nombreDueno}
                    {esMio ? (esGrupos ? ' (tu equipo)' : ' (tú)') : ''}
                  </Text>
                  {puntosCampo > 0 && (
                    <Text style={styles.duenoPuntos}>{puntosCampo.toLocaleString()} pts en esta zona</Text>
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
                {esGrupos
                  ? 'Ningún equipo controla esta zona. Corre aquí con tu equipo activo para reclamarla.'
                  : 'Esta zona está libre. Corre dentro del radio y acumula puntos para hacerte con ella.'}
              </Text>
            )}
            {esMio && (
              <Text style={styles.infoTexto}>
                {esGrupos
                  ? 'Tu equipo controla esta zona. Seguid corriendo aquí para mantener la ventaja.'
                  : 'Es tuya. Para mantenerla, corre aquí con regularidad. Si otro corredor acumula más puntos que tú, te la quitará.'}
              </Text>
            )}
            {esRival && puntosCampo > 0 && (
              <Text style={styles.infoTexto}>
                {esGrupos
                  ? `El equipo rival tiene ${puntosCampo.toLocaleString()} pts aquí. Tu equipo necesita superar esa marca.`
                  : `El dueño tiene ${puntosCampo.toLocaleString()} pts aquí. Necesitas superar esa marca con tus puntos acumulados en esta zona.`}
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
  fecha: { color: colors.subdued, fontSize: 12, marginTop: 8 },
  infoTexto: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  infoRadio: { color: colors.subdued, fontSize: 12, marginTop: 8 },
  etiquetaMapa: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
  },
  etiquetaMapaTexto: { color: colors.text, fontSize: 11, fontWeight: 'bold' },
  botonNavegar: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  botonNavegarTexto: { color: colors.bg, fontSize: 16, fontWeight: 'bold' },
});
