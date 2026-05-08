import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Modal, FlatList, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { PantallaCargando } from '../components/ui';
import MapView, { Polygon, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { obtenerBarrios } from '../utils/barrios';
import { obtenerCiudadCercana, obtenerCiudades, CIUDAD_FALLBACK } from '../utils/ciudades';
import {
  getEstiloTerritorio,
  getEstiloTerritorioGrupo,
  getNombreTerritorio,
  shouldMostrarEtiquetas,
} from '../utils/mapaTerritorios';
import { obtenerMisGrupos } from '../utils/grupos';
import { calcularVoronoi } from '../utils/voronoi';
import { colors, radius } from '../utils/theme';
import DetalleBarrioScreen from './DetalleBarrioScreen';

export default function MapaScreen() {
  const [ubicacion, setUbicacion] = useState(null);
  const [barrios, setBarrios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [barrioSeleccionado, setBarrioSeleccionado] = useState(null);
  const [duenoInfo, setDuenoInfo] = useState(null);
  const [barrioDetalle, setBarrioDetalle] = useState(null);
  const [ciudad, setCiudad] = useState(CIUDAD_FALLBACK);
  const [permisoUbicacion, setPermisoUbicacion] = useState(null);
  const [regionActual, setRegionActual] = useState(null);
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [todasCiudades, setTodasCiudades] = useState([]);
  const [modoMapa, setModoMapa] = useState('individual');
  const [misGruposIds, setMisGruposIds] = useState(new Set());

  useEffect(() => {
    cargarDatos();
  }, []);

  useEffect(() => {
    if (!barrioSeleccionado?.dueno) {
      setDuenoInfo(null);
      return;
    }
    setDuenoInfo(null);
    getDoc(doc(db, 'usuarios', barrioSeleccionado.dueno))
      .then(snap => {
        if (snap.exists()) {
          setDuenoInfo({
            nickname: snap.data().nickname ?? 'Corredor anónimo',
            fotoPerfil: snap.data().fotoPerfil ?? null,
          });
        }
      })
      .catch(() => {});
  }, [barrioSeleccionado?.id]);

  const abrirSelector = async () => {
    if (todasCiudades.length === 0) {
      const ciudades = await obtenerCiudades();
      setTodasCiudades([...ciudades].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    }
    setSelectorVisible(true);
  };

  const seleccionarCiudad = async (nuevaCiudad) => {
    setSelectorVisible(false);
    setCiudad(nuevaCiudad);
    setCargando(true);
    try {
      const data = await obtenerBarrios(nuevaCiudad.id);
      setBarrios(data);
      setUbicacion({
        latitude: nuevaCiudad.lat,
        longitude: nuevaCiudad.lng,
        latitudeDelta: 0.18,
        longitudeDelta: 0.18,
      });
    } finally {
      setCargando(false);
    }
  };

  const cargarDatos = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermisoUbicacion(status);
      let puntoActual = null;
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        puntoActual = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        const regionInicial = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        };
        setUbicacion(regionInicial);
        setRegionActual(regionInicial);
      }
      const [ciudadCercana, misGrupos] = await Promise.all([
        obtenerCiudadCercana(puntoActual),
        obtenerMisGrupos().catch(() => []),
      ]);
      setCiudad(ciudadCercana);
      setMisGruposIds(new Set(misGrupos.map(g => g.id)));
      const data = await obtenerBarrios(ciudadCercana.id);
      setBarrios(data);
    } catch (e) {
      console.error(e);
    } finally {
      setCargando(false);
    }
  };

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

  const regionMapa = {
    latitude: ubicacion?.latitude ?? ciudad.lat,
    longitude: ubicacion?.longitude ?? ciudad.lng,
    latitudeDelta: ubicacion ? 0.15 : 0.22,
    longitudeDelta: ubicacion ? 0.15 : 0.22,
  };
  const voronoi = useMemo(() => calcularVoronoi(barrios), [barrios]);
  const mostrarEtiquetas = shouldMostrarEtiquetas(regionActual ?? regionMapa);
  const uid = auth.currentUser?.uid;

  if (cargando) return <PantallaCargando />;

  return (
    <View style={styles.container}>
      <MapView
        style={styles.mapa}
        initialRegion={regionMapa}
        onRegionChangeComplete={setRegionActual}
        showsUserLocation={permisoUbicacion === 'granted'}
        showsCompass={false}
        onPress={() => setBarrioSeleccionado(null)}
      >
        {voronoi.map(({ barrio, polygon }) => {
          const seleccionado = barrioSeleccionado?.id === barrio.id;
          const estilo = modoMapa === 'grupos'
            ? getEstiloTerritorioGrupo(barrio, misGruposIds, seleccionado)
            : getEstiloTerritorio(barrio, seleccionado);

          return (
            <React.Fragment key={barrio.id}>
              <Polygon
                coordinates={polygon}
                fillColor={estilo.fillColor}
                strokeColor={estilo.strokeColor}
                strokeWidth={seleccionado ? 2.5 : 1}
                tappable
                onPress={() => setBarrioSeleccionado(barrio)}
              />
              {(mostrarEtiquetas || seleccionado) && (
                <Marker
                  coordinate={{ latitude: barrio.lat, longitude: barrio.lng }}
                  onPress={() => setBarrioSeleccionado(barrio)}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View style={[styles.etiqueta, seleccionado && styles.etiquetaSeleccionada]}>
                    <Text style={styles.etiquetaTexto}>{getNombreTerritorio(barrio)}</Text>
                  </View>
                </Marker>
              )}
            </React.Fragment>
          );
        })}
      </MapView>

      {permisoUbicacion && permisoUbicacion !== 'granted' && (
        <View style={styles.permisoPanel}>
          <Text style={styles.permisoTexto}>Ubicación desactivada. Mostrando ciudad por defecto.</Text>
        </View>
      )}

      {barrios.length === 0 && (
        <View style={styles.vacioPanel}>
          <Text style={styles.vacioTitulo}>No hay territorios cargados</Text>
          <Text style={styles.vacioTexto}>Carga los territorios de la ciudad para ver el tablero.</Text>
        </View>
      )}

      {barrioSeleccionado && (
        <PanelTerritorio
          barrio={barrioSeleccionado}
          duenoInfo={duenoInfo}
          uid={uid}
          onNavegar={() => abrirNavegacion(barrioSeleccionado)}
          onCerrar={() => setBarrioSeleccionado(null)}
          onDetalle={() => setBarrioDetalle(barrioSeleccionado)}
        />
      )}

      <DetalleBarrioScreen
        barrio={barrioDetalle}
        duenoInfo={duenoInfo}
        onClose={() => setBarrioDetalle(null)}
      />

      <TouchableOpacity style={styles.botonOtrasCiudades} onPress={abrirSelector} activeOpacity={0.85}>
        <Text style={{ fontSize: 16 }}>🚩</Text>
        <Text style={styles.botonOtrasCiudadesTexto}>Terreno a conquistar</Text>
      </TouchableOpacity>

      <View style={styles.leyenda}>
        <View style={styles.modoTabs}>
          <TouchableOpacity
            style={[styles.modoTab, modoMapa === 'individual' && styles.modoTabActivo]}
            onPress={() => setModoMapa('individual')}
          >
            <Text style={[styles.modoTabTexto, modoMapa === 'individual' && styles.modoTabTextoActivo]}>Individual</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modoTab, modoMapa === 'grupos' && styles.modoTabActivo]}
            onPress={() => setModoMapa('grupos')}
          >
            <Text style={[styles.modoTabTexto, modoMapa === 'grupos' && styles.modoTabTextoActivo]}>Equipos</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.ciudadTexto}>{ciudad.nombre} · {barrios.length}</Text>
        <View style={styles.leyendaItem}>
          <View style={[styles.leyendaColor, { backgroundColor: colors.gold }]} />
          <Text style={styles.leyendaTexto}>{modoMapa === 'grupos' ? 'Tu equipo' : 'Tuyo'}</Text>
        </View>
        <View style={styles.leyendaItem}>
          <View style={[styles.leyendaColor, { backgroundColor: colors.conquest }]} />
          <Text style={styles.leyendaTexto}>{modoMapa === 'grupos' ? 'Otro equipo' : 'Otro corredor'}</Text>
        </View>
        <View style={styles.leyendaItem}>
          <View style={[styles.leyendaColor, { backgroundColor: colors.subdued }]} />
          <Text style={styles.leyendaTexto}>Libre</Text>
        </View>
      </View>

      <SelectorCiudad
        visible={selectorVisible}
        ciudades={todasCiudades}
        onSeleccionar={seleccionarCiudad}
        onCerrar={() => setSelectorVisible(false)}
      />
    </View>
  );
}

function SelectorCiudad({ visible, ciudades, onSeleccionar, onCerrar }) {
  const [paso, setPaso] = useState('pais'); // 'pais' | 'ciudad'
  const [paisElegido, setPaisElegido] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const paises = [...new Map(ciudades.map(c => [c.paisCodigo, c.paisNombre])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));

  const ciudadesFiltradas = ciudades
    .filter(c => c.paisCodigo === paisElegido?.codigo &&
      (!busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase())))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const elegirPais = (codigo, nombre) => {
    setPaisElegido({ codigo, nombre });
    setBusqueda('');
    setPaso('ciudad');
  };

  const volver = () => {
    setPaso('pais');
    setBusqueda('');
  };

  const cerrar = () => {
    setPaso('pais');
    setBusqueda('');
    setPaisElegido(null);
    onCerrar();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={cerrar}>
      <KeyboardAvoidingView
        style={styles.selectorOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.selectorPanel}>

          <View style={styles.selectorCabecera}>
            {paso === 'ciudad' ? (
              <TouchableOpacity onPress={volver} style={styles.selectorVolver}>
                <Text style={styles.selectorVolverTexto}>← {paisElegido?.nombre}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.selectorTitulo}>Elige un país</Text>
            )}
            <TouchableOpacity onPress={cerrar}>
              <Text style={styles.selectorCerrar}>✕</Text>
            </TouchableOpacity>
          </View>

          {paso === 'ciudad' && (
            <TextInput
              style={styles.selectorBusqueda}
              placeholder="Buscar ciudad..."
              placeholderTextColor={colors.subdued}
              value={busqueda}
              onChangeText={setBusqueda}
              autoFocus
            />
          )}

          {paso === 'pais' ? (
            <FlatList
              data={paises}
              keyExtractor={([codigo]) => codigo}
              renderItem={({ item: [codigo, nombre] }) => (
                <TouchableOpacity style={styles.ciudadFila} onPress={() => elegirPais(codigo, nombre)}>
                  <Text style={styles.ciudadFilaNombre}>{nombre}</Text>
                  <Text style={styles.selectorFlecha}>›</Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separador} />}
            />
          ) : (
            <FlatList
              data={ciudadesFiltradas}
              keyExtractor={c => c.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.ciudadFila} onPress={() => { cerrar(); onSeleccionar(item); }}>
                  <Text style={styles.ciudadFilaNombre}>{item.nombre}</Text>
                  <Text style={styles.ciudadFilaZonas}>{item.totalZonas ?? '—'} zonas</Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separador} />}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PanelTerritorio({ barrio, duenoInfo, uid, onNavegar, onCerrar, onDetalle }) {
  const esPropio = barrio.dueno === uid;
  const esLibre = !barrio.dueno;
  const esRival = barrio.dueno && !esPropio;

  const fechaConquista = barrio.conquistadoEn?.toDate
    ? barrio.conquistadoEn.toDate().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <View style={styles.infoPanel}>
      <TouchableOpacity style={styles.infoCerrar} onPress={onCerrar}>
        <Text style={styles.infoCerrarTexto}>✕</Text>
      </TouchableOpacity>

      <Text style={styles.infoEyebrow}>Territorio ConqueRun</Text>
      <Text style={styles.infoNombre}>{getNombreTerritorio(barrio)}</Text>
      {barrio.distrito && (
        <Text style={styles.infoZona}>{barrio.distrito}</Text>
      )}

      <View style={styles.infoEstadoFila}>
        <Text style={[
          styles.infoEstado,
          esLibre && styles.infoDuenoLibre,
          esPropio && styles.infoDuenoPropio,
          esRival && styles.infoDuenoRival,
        ]}>
          {esLibre ? 'Sin conquistar' : esPropio ? 'Tuyo' : 'Rival'}
        </Text>
        {duenoInfo && (
          <Text style={styles.infoDuenoNickname}>@{duenoInfo.nickname}</Text>
        )}
      </View>

      {barrio.duenoPuntos > 0 && (
        <Text style={styles.infoPuntos}>
          Marca actual: {barrio.duenoPuntos.toLocaleString()} pts
          {esRival && ' — supérala para conquistarlo'}
        </Text>
      )}

      {fechaConquista && (
        <Text style={styles.infoFecha}>Conquistado el {fechaConquista}</Text>
      )}

      {esLibre && (
        <Text style={styles.infoAyuda}>Zona libre. Corre aquí para conquistarla.</Text>
      )}

      <View style={styles.infoBotones}>
        <TouchableOpacity style={[styles.infoBoton, styles.infoBotonDetalle]} onPress={onDetalle}>
          <Text style={styles.infoBotonDetalleTexto}>Ver detalle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.infoBoton, styles.infoBotonNavegar]} onPress={onNavegar}>
          <Text style={styles.infoBotonNavegarTexto}>Cómo llegar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  mapa: { flex: 1 },
  etiqueta: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  etiquetaSeleccionada: {
    backgroundColor: 'rgba(8,11,20,0.9)',
    borderColor: colors.gold,
    borderWidth: 1,
  },
  etiquetaTexto: { color: colors.text, fontSize: 10, fontWeight: 'bold' },
  infoPanel: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    borderColor: colors.border,
    borderWidth: 1,
  },
  infoCerrar: {
    position: 'absolute',
    top: 12,
    right: 14,
    padding: 4,
  },
  infoCerrarTexto: { color: colors.subdued, fontSize: 16 },
  infoEyebrow: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  infoNombre: { fontSize: 18, fontWeight: 'bold', color: colors.text, marginBottom: 2, paddingRight: 24 },
  infoZona: { fontSize: 13, color: colors.subdued, marginBottom: 8 },
  infoEstadoFila: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  infoEstado: { fontSize: 14, fontWeight: '700' },
  infoDuenoLibre: { color: colors.subdued },
  infoDuenoPropio: { color: colors.gold },
  infoDuenoRival: { color: colors.conquest },
  infoDuenoNickname: { color: colors.muted, fontSize: 13 },
  infoPuntos: { fontSize: 13, color: colors.muted, marginBottom: 2 },
  infoFecha: { fontSize: 12, color: colors.subdued, marginBottom: 6 },
  infoAyuda: { fontSize: 12, color: colors.subdued, lineHeight: 17, marginBottom: 6 },
  infoBotones: { flexDirection: 'row', gap: 8, marginTop: 10 },
  infoBoton: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  infoBotonDetalle: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  infoBotonDetalleTexto: { color: colors.bg, fontSize: 14, fontWeight: 'bold' },
  infoBotonNavegar: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  infoBotonNavegarTexto: { color: colors.text, fontSize: 14, fontWeight: '600' },
  permisoPanel: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(15,15,15,0.85)',
    borderRadius: 10,
    padding: 10,
  },
  permisoTexto: { color: colors.text, fontSize: 12, textAlign: 'center' },
  vacioPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 92,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
  },
  vacioTitulo: { color: colors.text, fontSize: 15, fontWeight: 'bold', marginBottom: 4 },
  vacioTexto: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  leyenda: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 160,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: radius.lg,
    padding: 10,
    gap: 6,
  },
  modoTabs: { flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 8, marginBottom: 8, padding: 2 },
  modoTab: { flex: 1, paddingVertical: 4, borderRadius: 6, alignItems: 'center' },
  modoTabActivo: { backgroundColor: colors.gold },
  modoTabTexto: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  modoTabTextoActivo: { color: '#080b14' },
  leyendaTitulo: { color: colors.text, fontSize: 13, fontWeight: 'bold' },
  ciudadTexto: { color: colors.gold, fontSize: 12, fontWeight: 'bold', marginBottom: 6 },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leyendaColor: { width: 12, height: 12, borderRadius: 6 },
  leyendaTexto: { color: colors.text, fontSize: 12 },
  botonOtrasCiudades: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  botonOtrasCiudadesTexto: { color: colors.text, fontSize: 14, fontWeight: 'bold' },
  selectorOverlay: { flex: 1, justifyContent: 'flex-end' },
  selectorPanel: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 16,
  },
  selectorCabecera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  selectorTitulo: { color: colors.text, fontSize: 16, fontWeight: 'bold' },
  selectorCerrar: { color: colors.subdued, fontSize: 18, padding: 4 },
  selectorBusqueda: {
    margin: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.text,
    fontSize: 14,
  },
  selectorPaises: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, marginBottom: 8 },
  paisChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  paisChipActivo: { backgroundColor: colors.gold, borderColor: colors.gold },
  paisChipTexto: { color: colors.muted, fontSize: 13 },
  paisChipTextoActivo: { color: colors.bg, fontWeight: 'bold' },
  ciudadFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  ciudadFilaNombre: { color: colors.text, fontSize: 15 },
  ciudadFilaZonas: { color: colors.subdued, fontSize: 12 },
  separador: { height: 1, backgroundColor: colors.border, marginHorizontal: 16 },
  selectorVolver: { flexDirection: 'row', alignItems: 'center' },
  selectorVolverTexto: { color: colors.gold, fontSize: 15, fontWeight: 'bold' },
  selectorFlecha: { color: colors.subdued, fontSize: 20 },
});
