import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Modal, FlatList, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { PantallaCargando } from '../components/ui';
import { TerritoryMap, TerritoryMarker, TerritoryPolygon } from '../components/map/MapAdapter';
import * as Location from 'expo-location';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { obtenerBarriosSegmentados, invalidarCacheTerritorios } from '../utils/barrios';
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

const COLORES_EQUIPOS_PROPIOS = [
  colors.gold,
  colors.route,
  colors.sport,
  '#a3e635',
  '#f472b6',
  '#fb923c',
];

const aplicarAlpha = (color, alpha) => (
  color?.startsWith('#') && color.length === 7 ? `${color}${alpha}` : color
);

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
  const [gruposInfo, setGruposInfo] = useState({});
  const [listadoEquiposVisible, setListadoEquiposVisible] = useState(false);
  const [segmentoCompetitivo, setSegmentoCompetitivo] = useState(null);
  const [segmentoEtiqueta, setSegmentoEtiqueta] = useState(null);
  const ultimaCargaRef = useRef(0);

  useFocusEffect(useCallback(() => {
    if (Date.now() - ultimaCargaRef.current > 5 * 60 * 1000) {
      cargarDatos();
    }
  }, []));

  useEffect(() => {
    if (!barrioSeleccionado?.dueno) {
      setDuenoInfo(null);
      return;
    }
    setDuenoInfo(null);
    getDoc(doc(db, 'usuariosPublicos', barrioSeleccionado.dueno))
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

  useEffect(() => {
    const grupoId = barrioSeleccionado?.duenoGrupo;
    if (modoMapa !== 'grupos' || !grupoId || gruposInfo[grupoId]) return undefined;

    let activo = true;
    getDoc(doc(db, 'grupos', grupoId))
      .then(snap => {
        if (!activo) return;
        const grupo = snap.exists() ? { id: grupoId, ...snap.data() } : { id: grupoId, nombre: 'Equipo' };
        setGruposInfo(prev => (prev[grupoId] ? prev : { ...prev, [grupoId]: grupo }));
      })
      .catch(() => {
        if (activo) {
          setGruposInfo(prev => (prev[grupoId] ? prev : { ...prev, [grupoId]: { id: grupoId, nombre: 'Equipo' } }));
        }
      });

    return () => {
      activo = false;
    };
  }, [barrioSeleccionado?.duenoGrupo, gruposInfo, modoMapa]);

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
      await invalidarCacheTerritorios(nuevaCiudad.id);
      const misGrupos = await obtenerMisGrupos().catch(() => []);
      setMisGruposIds(new Set(misGrupos.map(g => g.id)));
      const data = await obtenerBarriosSegmentados(nuevaCiudad.id, segmentoCompetitivo);
      setBarrios(data);
      await cargarInfoGruposTerritoriales(data, misGrupos);
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

  const cargarInfoGruposTerritoriales = async (barriosData, gruposPropios = []) => {
    const gruposPropiosPorId = Object.fromEntries(gruposPropios.map(grupo => [grupo.id, grupo]));
    const ids = [...new Set(barriosData
      .map(barrio => barrio.duenoGrupo)
      .filter(grupoId => grupoId && gruposPropiosPorId[grupoId]))];

    if (ids.length === 0 && gruposPropios.length === 0) {
      setGruposInfo({});
      return;
    }

    const entries = ids.length > 0
      ? ids.map(grupoId => [grupoId, gruposPropiosPorId[grupoId]])
      : gruposPropios.map(grupo => [grupo.id, grupo]);

    setGruposInfo(Object.fromEntries(entries));
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
      const uid = auth.currentUser?.uid;
      const [ciudadCercana, misGrupos, userSnap, ciudades] = await Promise.all([
        obtenerCiudadCercana(puntoActual),
        obtenerMisGrupos().catch(() => []),
        uid ? getDoc(doc(db, 'usuarios', uid)) : Promise.resolve(null),
        obtenerCiudades().catch(() => []),
      ]);
      const userData = userSnap?.exists?.() ? userSnap.data() : {};
      const segmento = userData.segmentoCompetitivo ?? null;
      const ciudadPerfil = userData.ciudadActualId
        ? ciudades.find(c => c.id === userData.ciudadActualId)
        : null;
      const ciudadObjetivo = ciudadPerfil ?? ciudadCercana;
      setSegmentoCompetitivo(segmento);
      setSegmentoEtiqueta(userData.segmentoEtiqueta ?? null);
      setCiudad(ciudadObjetivo);
      setMisGruposIds(new Set(misGrupos.map(g => g.id)));
      setUbicacion({
        latitude: ciudadObjetivo.lat,
        longitude: ciudadObjetivo.lng,
        latitudeDelta: 0.18,
        longitudeDelta: 0.18,
      });
      setRegionActual({
        latitude: ciudadObjetivo.lat,
        longitude: ciudadObjetivo.lng,
        latitudeDelta: 0.18,
        longitudeDelta: 0.18,
      });
      const data = await obtenerBarriosSegmentados(ciudadObjetivo.id, segmento);
      setBarrios(data);
      await cargarInfoGruposTerritoriales(data, misGrupos);
      ultimaCargaRef.current = Date.now();
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

  const coloresEquipos = useMemo(() => {
    const idsOrdenados = [...misGruposIds].sort((a, b) => {
      const nombreA = gruposInfo[a]?.nombre ?? a;
      const nombreB = gruposInfo[b]?.nombre ?? b;
      return nombreA.localeCompare(nombreB);
    });

    return Object.fromEntries(idsOrdenados.map((grupoId, index) => {
      const base = COLORES_EQUIPOS_PROPIOS[index % COLORES_EQUIPOS_PROPIOS.length];
      return [grupoId, {
        base,
        fill: aplicarAlpha(base, '42'),
        fillSelected: aplicarAlpha(base, '70'),
      }];
    }));
  }, [gruposInfo, misGruposIds]);

  const resumenEquipos = useMemo(() => {
    const gruposConZonas = new Set();
    const total = barrios.reduce((acc, barrio) => {
      if (barrio.duenoGrupo && misGruposIds.has(barrio.duenoGrupo)) {
        gruposConZonas.add(barrio.duenoGrupo);
        return acc + 1;
      }
      return acc;
    }, 0);

    return { propios: total, equipos: gruposConZonas.size };
  }, [barrios, misGruposIds]);

  const zonasPorEquipo = useMemo(() => {
    const porEquipo = barrios.reduce((acc, barrio) => {
      if (!barrio.duenoGrupo || !misGruposIds.has(barrio.duenoGrupo)) return acc;
      const grupo = gruposInfo[barrio.duenoGrupo] ?? {};
      if (!acc[barrio.duenoGrupo]) {
        acc[barrio.duenoGrupo] = {
          id: barrio.duenoGrupo,
          nombre: grupo.nombre ?? 'Equipo',
          color: coloresEquipos[barrio.duenoGrupo]?.base ?? colors.gold,
          zonas: [],
          puntos: 0,
        };
      }
      acc[barrio.duenoGrupo].zonas.push(barrio);
      acc[barrio.duenoGrupo].puntos += barrio.duenoGrupoPuntos ?? 0;
      return acc;
    }, {});

    return Object.values(porEquipo)
      .map(equipo => ({
        ...equipo,
        zonas: [...equipo.zonas].sort((a, b) => getNombreTerritorio(a).localeCompare(getNombreTerritorio(b))),
      }))
      .sort((a, b) => b.zonas.length - a.zonas.length || a.nombre.localeCompare(b.nombre));
  }, [barrios, coloresEquipos, gruposInfo, misGruposIds]);

  const obtenerEstiloEquipo = useCallback((barrio, seleccionado) => {
    const estilo = getEstiloTerritorioGrupo(barrio, misGruposIds, seleccionado);
    const entrada = barrio.duenoGrupo ? coloresEquipos[barrio.duenoGrupo] : null;
    if (!entrada) return estilo;

    return {
      ...estilo,
      color: entrada.base,
      fillColor: seleccionado ? entrada.fillSelected : entrada.fill,
      strokeColor: entrada.base,
    };
  }, [coloresEquipos, misGruposIds]);

  if (cargando) return <PantallaCargando />;

  return (
    <View style={styles.container}>
      <TerritoryMap
        key={`${ciudad.id}_${segmentoCompetitivo ?? 'general'}_${regionMapa.latitude}_${regionMapa.longitude}`}
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
            ? obtenerEstiloEquipo(barrio, seleccionado)
            : getEstiloTerritorio(barrio, seleccionado);
          const grupoNombre = modoMapa === 'grupos' && barrio.duenoGrupo
            ? gruposInfo[barrio.duenoGrupo]?.nombre
            : null;
          const grupoColor = barrio.duenoGrupo && misGruposIds.has(barrio.duenoGrupo)
            ? coloresEquipos[barrio.duenoGrupo]?.base
            : null;

          return (
            <React.Fragment key={barrio.id}>
              <TerritoryPolygon
                coordinates={polygon}
                fillColor={estilo.fillColor}
                strokeColor={estilo.strokeColor}
                strokeWidth={seleccionado ? 2.5 : 1}
                tappable
                onPress={() => setBarrioSeleccionado(barrio)}
              />
              {(mostrarEtiquetas || seleccionado) && (
                <TerritoryMarker
                  coordinate={{ latitude: barrio.lat, longitude: barrio.lng }}
                  onPress={() => setBarrioSeleccionado(barrio)}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View style={[styles.etiqueta, seleccionado && styles.etiquetaSeleccionada]}>
                    <Text style={[styles.etiquetaTexto, { color: estilo.color }]}>{getNombreTerritorio(barrio)}</Text>
                    {mostrarEtiquetas && modoMapa === 'individual' && barrio.dueno && barrio.duenoNombre && (
                      <Text style={[styles.etiquetaDuenoTexto, { color: estilo.color }]}>{barrio.duenoNombre}</Text>
                    )}
                    {seleccionado && grupoNombre && (
                      <Text style={[styles.etiquetaEquipoTexto, grupoColor && { color: grupoColor }]}>{grupoNombre}</Text>
                    )}
                  </View>
                </TerritoryMarker>
              )}
            </React.Fragment>
          );
        })}
      </TerritoryMap>

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
          modoMapa={modoMapa}
          misGruposIds={misGruposIds}
          grupoInfo={barrioSeleccionado.duenoGrupo ? gruposInfo[barrioSeleccionado.duenoGrupo] : null}
          grupoColor={barrioSeleccionado.duenoGrupo ? coloresEquipos[barrioSeleccionado.duenoGrupo]?.base : null}
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
        {modoMapa === 'individual' && segmentoEtiqueta && (
          <Text style={styles.segmentoTexto}>{segmentoEtiqueta}</Text>
        )}
        {modoMapa === 'grupos' && (
          <View style={styles.resumenEquipos}>
            <Text style={styles.resumenEquiposTexto}>
              Tus equipos: {resumenEquipos.propios} zonas
              {resumenEquipos.equipos > 0 ? ` en ${resumenEquipos.equipos} ${resumenEquipos.equipos === 1 ? 'equipo' : 'equipos'}` : ''}
            </Text>
            <TouchableOpacity
              style={styles.resumenEquiposBoton}
              onPress={() => setListadoEquiposVisible(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.resumenEquiposBotonTexto}>Ver zonas</Text>
            </TouchableOpacity>
          </View>
        )}
        {modoMapa === 'grupos' ? (
          <>
            {zonasPorEquipo.slice(0, 4).map(equipo => (
              <View key={equipo.id} style={styles.leyendaItem}>
                <View style={[styles.leyendaColor, { backgroundColor: equipo.color }]} />
                <Text style={styles.leyendaTexto} numberOfLines={1}>{equipo.nombre}</Text>
              </View>
            ))}
            {zonasPorEquipo.length > 4 && (
              <Text style={styles.leyendaNota}>+{zonasPorEquipo.length - 4} equipos en Ver zonas</Text>
            )}
            <View style={styles.leyendaItem}>
              <View style={[styles.leyendaColor, { backgroundColor: colors.conquest }]} />
              <Text style={styles.leyendaTexto}>Otros</Text>
            </View>
            <View style={styles.leyendaItem}>
              <View style={[styles.leyendaColor, { backgroundColor: colors.subdued }]} />
              <Text style={styles.leyendaTexto}>Libre</Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.leyendaItem}>
              <View style={[styles.leyendaColor, { backgroundColor: colors.gold }]} />
              <Text style={styles.leyendaTexto}>Tuyo</Text>
            </View>
            <View style={styles.leyendaItem}>
              <View style={[styles.leyendaColor, { backgroundColor: colors.conquest }]} />
              <Text style={styles.leyendaTexto}>Otro corredor</Text>
            </View>
            <View style={styles.leyendaItem}>
              <View style={[styles.leyendaColor, { backgroundColor: colors.subdued }]} />
              <Text style={styles.leyendaTexto}>Libre</Text>
            </View>
          </>
        )}
      </View>

      <SelectorCiudad
        visible={selectorVisible}
        ciudades={todasCiudades}
        onSeleccionar={seleccionarCiudad}
        onCerrar={() => setSelectorVisible(false)}
      />
      <ListadoZonasEquipo
        visible={listadoEquiposVisible}
        equipos={zonasPorEquipo}
        onCerrar={() => setListadoEquiposVisible(false)}
      />
    </View>
  );
}

function ListadoZonasEquipo({ visible, equipos, onCerrar }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCerrar}>
      <View style={styles.listadoOverlay}>
        <View style={styles.listadoPanel}>
          <View style={styles.listadoCabecera}>
            <Text style={styles.listadoTitulo}>Zonas de tus equipos</Text>
            <TouchableOpacity onPress={onCerrar}>
              <Text style={styles.selectorCerrar}>✕</Text>
            </TouchableOpacity>
          </View>

          {equipos.length === 0 ? (
            <View style={styles.listadoVacio}>
              <Text style={styles.listadoVacioTitulo}>Sin conquistas de equipo</Text>
              <Text style={styles.listadoVacioTexto}>Elige un equipo al terminar una carrera para empezar a conquistar zonas con él.</Text>
            </View>
          ) : (
            <FlatList
              data={equipos}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listadoContenido}
              renderItem={({ item }) => (
                <View style={styles.equipoBloque}>
                  <View style={styles.equipoCabecera}>
                    <View style={styles.equipoNombreFila}>
                      <View style={[styles.equipoColor, { backgroundColor: item.color }]} />
                      <Text style={styles.equipoNombre}>{item.nombre}</Text>
                    </View>
                    <Text style={[styles.equipoTipo, styles.equipoTipoPropio]}>Tu equipo</Text>
                  </View>
                  <Text style={styles.equipoMeta}>{item.zonas.length} zonas · {item.puntos.toLocaleString()} pts</Text>
                  {item.zonas.map(zona => (
                    <View key={zona.id} style={styles.zonaFila}>
                      <Text style={styles.zonaNombre}>{getNombreTerritorio(zona)}</Text>
                      <Text style={styles.zonaPuntos}>{(zona.duenoGrupoPuntos ?? 0).toLocaleString()} pts</Text>
                    </View>
                  ))}
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function SelectorCiudad({ visible, ciudades, onSeleccionar, onCerrar }) {
  const [paso, setPaso] = useState('pais'); // 'pais' | 'ciudad'
  const [paisElegido, setPaisElegido] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const paises = useMemo(() =>
    [...new Map(ciudades.map(c => [c.paisCodigo, c.paisNombre])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1])),
  [ciudades]);

  const ciudadesFiltradas = useMemo(() =>
    ciudades
      .filter(c => c.paisCodigo === paisElegido?.codigo &&
        (!busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase())))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  [ciudades, paisElegido, busqueda]);

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

function PanelTerritorio({ barrio, duenoInfo, uid, modoMapa, misGruposIds, grupoInfo, grupoColor, onNavegar, onCerrar, onDetalle }) {
  const esModoGrupos = modoMapa === 'grupos';
  const esPropio = esModoGrupos
    ? Boolean(barrio.duenoGrupo && misGruposIds.has(barrio.duenoGrupo))
    : barrio.dueno === uid;
  const esLibre = esModoGrupos ? !barrio.duenoGrupo : !barrio.dueno;
  const esRival = esModoGrupos ? Boolean(barrio.duenoGrupo && !esPropio) : Boolean(barrio.dueno && !esPropio);
  const puntosActuales = esModoGrupos ? (barrio.duenoGrupoPuntos ?? 0) : (barrio.duenoPuntos ?? 0);

  const fechaBase = esModoGrupos ? barrio.actualizadoGrupoEn : barrio.conquistadoEn;
  const fechaConquista = fechaBase?.toDate
    ? fechaBase.toDate().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <View style={styles.infoPanel}>
      <TouchableOpacity style={styles.infoCerrar} onPress={onCerrar}>
        <Text style={styles.infoCerrarTexto}>✕</Text>
      </TouchableOpacity>

      <Text style={styles.infoEyebrow}>{esModoGrupos ? 'Territorio de equipo' : 'Territorio ConqueRun'}</Text>
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
          {esLibre ? 'Sin conquistar' : esPropio ? (esModoGrupos ? 'Tu equipo' : 'Tuyo') : (esModoGrupos ? 'Otro equipo' : 'Rival')}
        </Text>
        {!esModoGrupos && duenoInfo && (
          <Text style={styles.infoDuenoNickname}>@{duenoInfo.nickname}</Text>
        )}
      </View>

      {esModoGrupos && !esLibre && (
        <View style={styles.infoGrupoFila}>
          {esPropio && <View style={[styles.infoGrupoColor, { backgroundColor: grupoColor ?? colors.gold }]} />}
          <Text style={styles.infoGrupoNombre}>
            Equipo propietario: {grupoInfo?.nombre ?? 'Equipo'}
            {esPropio ? ' · tu equipo' : ''}
          </Text>
        </View>
      )}

      {puntosActuales > 0 && (
        <Text style={styles.infoPuntos}>
          Marca actual: {puntosActuales.toLocaleString()} pts
          {esRival && (esModoGrupos ? ' — superadla para conquistarlo' : ' — supérala para conquistarlo')}
        </Text>
      )}

      {fechaConquista && (
        <Text style={styles.infoFecha}>{esModoGrupos ? 'Actualizado el' : 'Conquistado el'} {fechaConquista}</Text>
      )}

      {esLibre && (
        <Text style={styles.infoAyuda}>
          {esModoGrupos ? 'Zona libre para equipos. Corre aquí con un equipo para conquistarla.' : 'Zona libre. Corre aquí para conquistarla.'}
        </Text>
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
  etiquetaDuenoTexto: { color: colors.muted, fontSize: 9, fontWeight: '600', marginTop: 1 },
  etiquetaEquipoTexto: { color: colors.gold, fontSize: 9, fontWeight: '800', marginTop: 1 },
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
  infoGrupoFila: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  infoGrupoColor: { width: 10, height: 10, borderRadius: 5 },
  infoGrupoNombre: { color: colors.text, fontSize: 13, fontWeight: '700', flex: 1 },
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
  segmentoTexto: { color: colors.subdued, fontSize: 11, fontWeight: '700', marginBottom: 6 },
  resumenEquipos: { borderTopColor: 'rgba(255,255,255,0.12)', borderTopWidth: 1, paddingTop: 6, marginBottom: 2, gap: 2 },
  resumenEquiposTexto: { color: colors.subdued, fontSize: 11, fontWeight: '700' },
  resumenEquiposBoton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.gold,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 4,
  },
  resumenEquiposBotonTexto: { color: colors.bg, fontSize: 11, fontWeight: '900' },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leyendaColor: { width: 12, height: 12, borderRadius: 6 },
  leyendaTexto: { color: colors.text, fontSize: 12, flexShrink: 1 },
  leyendaNota: { color: colors.subdued, fontSize: 10, fontWeight: '700' },
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
  listadoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  listadoPanel: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '78%',
    paddingBottom: 16,
  },
  listadoCabecera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  listadoTitulo: { color: colors.text, fontSize: 16, fontWeight: '900' },
  listadoContenido: { padding: 12, gap: 10 },
  listadoVacio: { padding: 18 },
  listadoVacioTitulo: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 4 },
  listadoVacioTexto: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  equipoBloque: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    gap: 7,
  },
  equipoCabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  equipoNombreFila: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  equipoColor: { width: 12, height: 12, borderRadius: 6 },
  equipoNombre: { color: colors.text, fontSize: 15, fontWeight: '900', flex: 1 },
  equipoTipo: { fontSize: 11, fontWeight: '900' },
  equipoTipoPropio: { color: colors.gold },
  equipoTipoRival: { color: colors.conquest },
  equipoMeta: { color: colors.muted, fontSize: 12 },
  zonaFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopColor: 'rgba(255,255,255,0.08)',
    borderTopWidth: 1,
    paddingTop: 7,
    gap: 10,
  },
  zonaNombre: { color: colors.text, fontSize: 13, fontWeight: '700', flex: 1 },
  zonaPuntos: { color: colors.subdued, fontSize: 12, fontWeight: '700' },
});
