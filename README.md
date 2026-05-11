# ConqueRun
> No solo corres, conquistas.

ConqueRun es una app móvil de running con capa social, competitiva y territorial. Las ciudades se dividen en territorios reconocibles y los corredores los conquistan corriendo.

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | React Native + Expo SDK 54 (New Architecture) |
| Navegación | React Navigation — bottom tabs |
| Base de datos | Firebase Firestore |
| Auth | Firebase Authentication |
| Almacenamiento | Firebase Storage |
| GPS | expo-location v19 |
| Notificaciones | Expo Push Notifications |
| Scripts de datos | Node.js ESM en `scripts/` |

**Firebase project ID:** `conquerrun-8d30e`

---

## Flujo de registro

```
Login → NicknameScreen → CiudadScreen → OnboardingScreen → App
```

1. **NicknameScreen** — elige nickname (mín. 3 chars, alfanumérico + acentos + guion bajo). Valida tanto client-side como en Firestore Rules.
2. **CiudadScreen** — selecciona ciudad de residencia. Se guarda `ciudadActualId`, `ciudadActualNombre` y `paisCodigo` en el perfil. Necesario para el ranking y los grupos.
3. **OnboardingScreen** — tutorial de 3 pasos explicando la mecánica del juego.

---

## Pantallas

| Pantalla | Descripción |
|----------|-------------|
| Mapa | Territorios con colores según dueño. Selector de ciudad con búsqueda. |
| Correr | Carrera en tiempo real: ruta, km, tiempo, ritmo. Tracking en segundo plano. |
| Ranking | Top 10 individual y de grupos por ciudad. |
| Grupos | Crear, explorar y unirse a grupos de tu ciudad. |
| Perfil | Estadísticas desnormalizadas, logros, barrios, grupos. |

---

## Mecánica de puntos

```
puntos = km × factor_ritmo × 1000
factor_ritmo = clamp(1 + (300 - ritmoMedio) / 300, 0.5, 2.0)
```

- Ritmo base: 5 min/km = factor 1.0
- Ritmo muy rápido (2:30 min/km): factor 2.0 máximo
- Caminar lento (>20 min/km): no puntúa (carrera inválida)

**Aportación a grupos:**
```
puntosGrupo = puntos × multiplicadorGrupo
multiplicadorGrupo = min(1.10, 1 + miembros × 0.01)
```
Los puntos de grupo son independientes del ranking individual.

---

## Territorios

- Cada ciudad se divide en zonas con nombres reconocibles (barrios, distritos).
- Radio fijo de 3 km por territorio, sin solapamiento (centros separados ≥ 6 km).
- Se conquista un territorio superando los puntos del dueño actual dentro de esa zona.
- Al perder un territorio se recibe notificación push.
- Colores en el mapa: naranja = tuyo · azul = otro corredor · blanco = libre.

---

## Logros

### Por kilómetros totales
| Logro | Requisito | Bonus pts |
|-------|-----------|-----------|
| Primeros pasos | 10 km | 100 |
| Medio centenar | 50 km | 500 |
| Centenario | 100 km | 1000 |
| Máquina | 500 km | 5000 |
| Leyenda | 1000 km | 10000 |

### Por barrios conquistados (acumulados)
| Logro | Requisito | Bonus pts |
|-------|-----------|-----------|
| Primer territorio | 1 barrio | 200 |
| Explorador | 5 barrios | 1000 |
| Dominador | 10 barrios | 2000 |
| Rey del asfalto | 20 barrios | 5000 |

### Por racha de días consecutivos
| Logro | Requisito | Bonus pts |
|-------|-----------|-----------|
| Constante | 3 días | 300 |
| Semana perfecta | 7 días | 700 |
| Mes de hierro | 30 días | 3000 |

Los bonus de logros van al territorio donde el usuario tiene más puntos acumulados.

---

## Grupos

- Cada grupo pertenece a **una ciudad**. Solo corredores de esa ciudad pueden unirse.
- Públicos (visibles en el explorador de su ciudad) o privados (código de 6 caracteres).
- Al crear: la ciudad se asigna automáticamente desde la ciudad del creador.
- Al unirse por código: se valida que el corredor sea de la misma ciudad.
- Cada carrera aporta puntos a todos los grupos del corredor.
- Los grupos compiten en un ranking por puntos totales dentro de su ciudad.
- Los grupos **no conquistan territorios** — solo acumulan puntos.

---

## Colecciones Firestore

### `usuarios/{uid}`
```
nickname, ciudadActualId, ciudadActualNombre, paisCodigo, pais,
puntosTotales, distanciaTotal, duracionTotal, carrerasTotal, barriosConquistadosTotal,
logros[], racha, pushToken,
fotoPendiente, fotoPerfilEstado, fotoMotivoRechazo,
onboardingPendiente, onboardingCompletado, esAdmin
```

#### Subcollección `usuarios/{uid}/marcasTerritoriales/{barrioId}`
Puntos acumulados del usuario en cada territorio, particionados por ciudad. Evita el límite de 20.000 campos/documento de Firestore al escalar a cientos de ciudades.
```
puntos, coleccion, ciudadId, actualizadoEn
```
Al leer, se filtra por `ciudadId == ciudadActualId` para mostrar solo la ciudad activa.

#### Subcollección `usuarios/{uid}/ciudadesHistorico/{ciudadId}`
Reservado para uso futuro. Actualmente sin escritura activa.

### `carreras/{id}`
ID determinístico: `{uid}_{timestamp}`
```
uid, ruta[], distancia, duracion, ritmoMedio, puntos, puntosPersonales,
ciudadId, ciudadNombre, paisCodigo, fecha,
source: 'conqurun' | 'strava',
verificationStatus: 'self_recorded' | 'strava_verified',
aportacionesGrupo[], gruposAportados[], territorioCarrera[],
externalProvider, externalActivityId, stravaActivityUrl
```

### `territorios/{id}`
Fuente de verdad para conquistas individuales.
```
nombre, nombreVisible, tipo, ciudadId, ciudadNombre, paisCodigo,
lat, lng, radio, dueno, duenoPuntos, conquistadoEn
```

### `ciudades/{id}`
```
nombre, paisCodigo, paisNombre, lat, lng, radioBusqueda, estadoCobertura
```

### `grupos/{id}`
```
nombre, descripcion, esPublico, codigo, creador,
ciudadId, ciudadNombre,
miembros[], nicknames: { [uid]: nickname },
puntosTotales, carrerasTotales, distanciaTotal,
foto, fotoPendiente, fotoEstado, fotoMotivoRechazo, fotoRevisadaEn,
creadoEn, actualizadoEn
```

### `aportacionesGrupo/{id}`
ID determinístico: `{carreraId}_{grupoId}`
```
carreraId, grupoId, grupoNombre, uid,
puntosBase, multiplicadorGrupo, puntosGrupo,
miembrosGrupoEnEseMomento, distancia, fecha
```

### `rankingsCiudad/{ciudadId}_{uid}`
Ranking desnormalizado. Se actualiza con `increment()` en cada carrera.
```
ciudadId, uid, puntos, carreras, totalKm,
nickname, fotoPerfil, fotoPerfilEstado, pais, topLogros[], barrios
```

### `reportes/{uid}_{recursoId}`
ID determinístico para rate limiting (máx. 1 reporte por usuario por recurso).
```
tipo: 'usuario'|'grupo'|'carrera',
motivo: 'contenido_inapropiado'|'trampa'|'spam',
recursoId, reportadoPor, estado: 'pendiente', creadoEn
```

### `solicitudesEliminacion/{id}`
```
uid, email, estado: 'pendiente', solicitadoEn
```

---

## Índices Firestore

| Colección | Campos |
|-----------|--------|
| `carreras` | uid ASC, fecha DESC |
| `rankingsCiudad` | ciudadId ASC, puntos DESC |
| `rankingsCiudad` | ciudadId ASC, puntos ASC |
| `rankingsCiudad` | ciudadId ASC, uid ASC |
| `territorios` | dueno ASC, ciudadId ASC |
| `grupos` | esPublico ASC, puntosTotales DESC |
| `grupos` | esPublico ASC, ciudadId ASC |
| `grupos` | ciudadId ASC, puntosTotales DESC |

---

## Decisiones de arquitectura

### Stats desnormalizados en usuario
`distanciaTotal`, `carrerasTotal`, `duracionTotal`, `puntosTotales`, `barriosConquistadosTotal` se actualizan con `increment()` en cada carrera. Evita leer todas las carreras para mostrar el perfil.

### rankingsCiudad — ranking sin agregación
Un doc por usuario por ciudad, actualizado incrementalmente. Coste ~$20/mes a 100k usuarios activos vs. $270k/mes si se leyeran todas las carreras.

### marcasTerritoriales en subcolección
Las marcas territoriales (puntos acumulados por barrio) viven en `usuarios/{uid}/marcasTerritoriales/{barrioId}` con campo `ciudadId`. Al leer se filtra por ciudad activa. Al escribir se usa `set({merge:true})` con `increment()`. Evita el límite de 20k campos/documento de Firestore al escalar a cientos de ciudades y elimina la necesidad de resetear manualmente al cambiar de ciudad.

### Batch chunking en grupos
`ejecutarOps(ops)` en `utils/grupos.js` divide en bloques de 450 ops para no superar el límite de 500 por batch de Firestore.

### Rate limiting de reportes
El ID del documento es `{uid}_{recursoId}`. Si el doc ya existe, la escritura falla por la regla `noReporteRepetido()`. Sin coste de Cloud Functions.

### Capa de mapa desacoplada
Las pantallas no deben importar directamente `react-native-maps`. Deben usar `components/map/MapAdapter.js` (`TerritoryMap`, `TerritoryPolygon`, `TerritoryMarker`, `RouteLine`, `TerritoryCircle`). La lógica de territorios, segmentos, puntos y conquistas vive fuera del proveedor de mapa para poder migrar a MapLibre + tiles de bajo coste sin tocar la lógica competitiva.

### Google Maps en iOS
El adaptador fuerza Google Maps como proveedor en iOS. Para compilar la app iOS hay que habilitar **Maps SDK for iOS** en Google Cloud, crear una API key restringida al bundle `com.conquerun.app` y sustituir `REPLACE_WITH_GOOGLE_MAPS_IOS_API_KEY` en `ios/ConqueRun/Info.plist`. Despues hay que ejecutar `pod install` dentro de `ios/` o regenerar el build nativo.

### Google Maps en Android
Android usa Google Maps mediante `react-native-maps`. La key vive en `app.json` (`android.config.googleMaps.apiKey`) y en el `AndroidManifest.xml` nativo. En Google Cloud debe estar restringida a **Maps SDK for Android**, package `com.conquerun.app` y el SHA-1 del keystore de producción.

---

## Scripts de datos

Requieren `scripts/serviceAccount.json` (Firebase Console → Cuentas de servicio). **No subir al repo.**

### Generar territorios de España
```bash
node scripts/generarTerritoriosEspana.mjs
```
Genera `data/generated/territorios-espana.json` con 52 ciudades.

### Enriquecer con nombres reales (OpenStreetMap)
```bash
CIUDAD_ID=es-madrid node scripts/enriquecerConOverpass.mjs   # una ciudad
node scripts/enriquecerConOverpass.mjs                        # todas
```
Usa Overpass API. `admin_level=9` primero, fallback a `place=suburb/neighbourhood`. Sin solapamiento: centros ≥ 6 km.

### Subir territorios a Firestore
```bash
node scripts/subirTerritoriosFirestore.mjs                    # primera vez
FORZAR=1 node scripts/subirTerritoriosFirestore.mjs           # sobrescribir
CIUDAD_ID=es-madrid node scripts/subirTerritoriosFirestore.mjs # solo una ciudad
```

### Migración de deuda técnica (ya ejecutado)
```bash
node scripts/migrarDeudaTecnicaCritica.mjs   # añade marcasCiudadActualId y totalBarrios a docs existentes
node scripts/migrarRankingsCiudad.mjs        # puebla rankingsCiudad desde carreras existentes
```

### Datos ficticios para desarrollo
```bash
MI_UID=<tu_uid> node scripts/generarDatosFicticios.mjs   # crear
node scripts/borrarDatosFicticios.mjs                     # borrar y restaurar territorios
```

---

## Despliegue de reglas e índices

```bash
npx firebase use conquerrun-8d30e
npx firebase deploy --only firestore:rules
npx firebase deploy --only firestore:indexes
```

---

## Desarrollo local

```bash
npx expo start    # servidor de desarrollo
# Pulsa 'i' para iOS simulator o escanea QR con Expo Go
```

---

## Roadmap

- [ ] CRÍTICO: evaluar migración del adaptador de mapa a MapLibre + tiles de bajo coste para reducir dependencia de Google Maps, controlar costes en Android y mantener intacta la lógica de territorios/conquistas.
- [ ] Publicación en App Store y Google Play
- [ ] Historial de carreras con mapa de ruta
- [ ] Grupos: chat interno y salidas organizadas
- [ ] Selector de país en ranking (filtro por país)
- [x] Integración MVP con Strava orientada a conquistas: botón en Correr, OAuth backend, callback automático a la app, importar máximo 10 carreras de los últimos 30 días al conectar y después solo actividades nuevas con `latlng` válido.
- [ ] Expansión territorial: resto de España y ciudades internacionales
- [ ] Conquista de ciudades completas ("Conquistador forastero")
- [ ] Mapa de equipos: cambiar el listado de zonas para mostrar solo las conquistas agrupadas por cada grupo del usuario, sin incluir equipos rivales.
- [x] Revisar naming de los segmentos de ritmo para que sean mas motivadores y menos jerarquicos que `Elite`, `Oro`, `Plata`, etc. Naming elegido: Explorador, Marcador, Retador, Conquistador, Señor del mapa y Leyenda.

---

*ConqueRun — No solo corres, conquistas.*
