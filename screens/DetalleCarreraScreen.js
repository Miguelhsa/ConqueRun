import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { RouteLine, TerritoryMap } from '../components/map/MapAdapter';
import { colors, radius } from '../utils/theme';
import { formatTiempo, formatRitmo } from '../utils/formatters';
import { esCarreraPuntuable, esCarreraStravaVerificada, ESTADOS_VERIFICACION } from '../utils/carreras';

const computarRegion = (ruta) => {
  if (!ruta?.length) return null;
  const lats = ruta.map(p => p.latitude);
  const lngs = ruta.map(p => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const pad = 0.003;
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(maxLat - minLat + pad * 2, 0.008),
    longitudeDelta: Math.max(maxLng - minLng + pad * 2, 0.008),
  };
};

const etiquetaEstado = (carrera) => {
  if (esCarreraStravaVerificada(carrera)) return { texto: 'Verificada por Strava', color: colors.strava };
  const estado = carrera.verificationStatus;
  if (estado === ESTADOS_VERIFICACION.SUSPICIOUS) return { texto: 'Sospechosa', color: colors.conquest };
  if (estado === ESTADOS_VERIFICACION.REJECTED) return { texto: 'Rechazada', color: colors.conquest };
  if (esCarreraPuntuable(carrera)) return { texto: 'Válida', color: colors.success };
  return { texto: 'No puntuable', color: colors.subdued };
};

export default function DetalleCarreraScreen({ carrera, onClose }) {
  if (!carrera) return null;

  const ruta = carrera.ruta ?? [];
  const region = computarRegion(ruta);
  const estado = etiquetaEstado(carrera);
  const puntos = carrera.puntosPersonales ?? carrera.puntos ?? 0;
  const territorio = carrera.territorioCarrera ?? [];
  const conquistasCarrera = carrera.conquistasCarrera ?? [];

  const uid = carrera.uid ?? null;
  const puntosEfectivos = (b) => b.puntosAcumuladosUsuario ?? b.puntos;
  const keyTerritorio = (b) => b.territorioId ?? b.barrioId ?? b.id ?? b.nombre;
  const conquistadasInferidas = territorio.filter(b => b.dueno !== uid && puntosEfectivos(b) > (b.duenoPuntos ?? 0));
  const conquistadas = conquistasCarrera.length > 0 ? conquistasCarrera : conquistadasInferidas;
  const idsConquistadas = new Set(conquistadas.map(keyTerritorio));
  const defendidas = territorio.filter(b => b.dueno === uid && !idsConquistadas.has(keyTerritorio(b)));
  const rivales = territorio.filter(b =>
    b.dueno !== uid &&
    !idsConquistadas.has(keyTerritorio(b)) &&
    puntosEfectivos(b) <= (b.duenoPuntos ?? 0)
  );
  const totalConquistas = carrera.barriosConquistados ?? conquistadas.length;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {region && ruta.length > 1 ? (
          <TerritoryMap style={styles.mapa} initialRegion={region} scrollEnabled={false} zoomEnabled={false}>
            <RouteLine coordinates={ruta} strokeColor={colors.gold} strokeWidth={4} />
          </TerritoryMap>
        ) : (
          <View style={styles.mapaVacio}>
            <Text style={styles.mapaVacioTexto}>Sin ruta registrada</Text>
          </View>
        )}

        <TouchableOpacity style={styles.botonCerrar} onPress={onClose}>
          <Text style={styles.botonCerrarTexto}>✕</Text>
        </TouchableOpacity>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.contenido}>
          <View style={styles.cabecera}>
            <Text style={styles.titulo}>Detalle de carrera</Text>
            <View style={[styles.estadoBadge, { borderColor: estado.color }]}>
              <Text style={[styles.estadoTexto, { color: estado.color }]}>{estado.texto}</Text>
            </View>
          </View>

          <View style={styles.grid}>
            <Metrica label="Distancia" valor={`${(carrera.distancia / 1000).toFixed(2)} km`} />
            <Metrica label="Tiempo" valor={formatTiempo(carrera.duracion)} />
            <Metrica label="Ritmo medio" valor={`${formatRitmo(carrera.ritmoMedio)} /km`} />
            <Metrica label="Puntos" valor={puntos.toLocaleString()} destacado />
            <Metrica label="Conquistas" valor={totalConquistas.toLocaleString()} destacado={totalConquistas > 0} />
          </View>

          {territorio.length > 0 && (
            <View style={styles.seccion}>
              <Text style={styles.seccionTitulo}>Territorio</Text>
              <GrupoTerritorio titulo="Zonas conquistadas" items={conquistadas} variante="conquista" />
              <GrupoTerritorio titulo="Zonas defendidas" items={defendidas} variante="defensa" />
              <GrupoTerritorio titulo="Rivales pendientes" items={rivales} variante="rival" />
            </View>
          )}

          {carrera.aportacionesGrupo?.length > 0 && (
            <View style={styles.seccion}>
              <Text style={styles.seccionTitulo}>Grupos</Text>
              {carrera.aportacionesGrupo.map(a => (
                <View key={a.id ?? a.grupoId} style={styles.grupoFila}>
                  <Text style={styles.grupoNombre}>{a.grupoNombre}</Text>
                  <Text style={styles.grupoPuntos}>{a.puntosGrupo.toLocaleString()} pts</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Metrica({ label, valor, destacado }) {
  return (
    <View style={styles.metrica}>
      <Text style={[styles.metricaValor, destacado && styles.metricaDestacada]}>{valor}</Text>
      <Text style={styles.metricaLabel}>{label}</Text>
    </View>
  );
}

function GrupoTerritorio({ titulo, items, variante }) {
  if (!items.length) return null;
  return (
    <View style={styles.grupoTerritorio}>
      <Text style={styles.grupoTerritorioTitulo}>{titulo}</Text>
      {items.map(b => (
        <View key={b.barrioId ?? b.nombre} style={[styles.chip, styles[`chip_${variante}`]]}>
          <Text style={styles.chipTexto}>
            {b.nombreVisible ?? b.nombre}
            {b.distanciaMetros ? ` · ${(b.distanciaMetros / 1000).toFixed(2)} km` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  mapa: { height: 220 },
  mapaVacio: {
    height: 120,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapaVacioTexto: { color: colors.subdued, fontSize: 14 },
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
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  titulo: { color: colors.text, fontSize: 20, fontWeight: 'bold' },
  estadoBadge: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  estadoTexto: { fontSize: 12, fontWeight: 'bold' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  metrica: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
  },
  metricaValor: { color: colors.text, fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  metricaDestacada: { color: colors.gold },
  metricaLabel: { color: colors.muted, fontSize: 12 },
  seccion: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 12,
  },
  seccionTitulo: { color: colors.text, fontSize: 15, fontWeight: 'bold', marginBottom: 10 },
  grupoTerritorio: { marginTop: 10 },
  grupoTerritorioTitulo: {
    color: colors.subdued,
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  chip: {
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
    borderWidth: 1,
  },
  chip_conquista: { backgroundColor: '#e6394620', borderColor: colors.conquest },
  chip_defensa: { backgroundColor: '#C6F43220', borderColor: colors.gold },
  chip_rival: { backgroundColor: '#64748b20', borderColor: colors.subdued },
  chipTexto: { color: colors.text, fontSize: 13, fontWeight: '600' },
  grupoFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    padding: 10,
    marginBottom: 6,
    borderColor: colors.border,
    borderWidth: 1,
  },
  grupoNombre: { color: colors.text, fontSize: 14 },
  grupoPuntos: { color: colors.gold, fontSize: 14, fontWeight: 'bold' },
});
