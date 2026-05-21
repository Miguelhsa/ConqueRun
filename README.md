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
puntos = round(km × factorRitmo)

Si ritmoMedio ≤ 300 s/km (≤ 5:00 min/km):
  factorRitmo = clamp(5 - 4 × ((ritmoMedio - 170) / 130)², 1.0, 5.0)

Si ritmoMedio > 300 s/km (> 5:00 min/km):
  factorRitmo = clamp(1 - 0.5 × (ritmoMedio - 300) / 300, 0.5, 1.0)
```

- Ritmo base: 5:00 min/km = factor 1.0
- Ritmo de élite (≤ 2:50 min/km ≈ 170 s/km): factor 5.0 máximo
- Caminar lento (> 12:00 min/km): factor 0.5 mínimo
- **Mínimo válido: 3:00 min/km (180 s/km)**. Ritmos más rápidos son rechazados por el servidor como imposibles a pie (antitrampas motos/bicicletas).

**Aportación a grupos:**
```
puntosGrupo = puntos × multiplicadorGrupo
multiplicadorGrupo = min(1.10, 1 + miembros × 0.01)
```
Los puntos de grupo son independientes del ranking individual.

---

## Sistema de ligas (segmentos competitivos)

Cada usuario compite dentro de su propio segmento, calculado como `{ritmo}_{genero}_{edad}` (ej: `plata_hombre_adulto`). Esto evita que corredores de élite dominen a los usuarios casuales.

### Segmentos de ritmo

| ID | Etiqueta | Ritmo (s/km) |
|----|----------|-------------|
| `elite` | Leyenda | < 255 (< 4:15 min/km) |
| `oro` | Señor del mapa | 255–299 |
| `plata` | Conquistador | 300–344 |
| `bronce` | Retador | 345–389 |
| `popular` | Marcador | 390–479 |
| `iniciacion` | Explorador | 480–720 (≥ 8:00 min/km) |

El ritmo se calcula sobre las carreras de los **últimos 30 días**. Si no hay carreras recientes, el usuario queda en `iniciacion` hasta acumular datos.

### Segmentos de género y edad

- Género: `hombre`, `mujer`, `sin_genero`
- Edad: `junior` (< 18), `adulto` (18–39), `master` (40–59), `senior` (60+), `sin_edad`

El `segmentoCompetitivo` activo se guarda en `usuarios/{uid}` y `rankingsCiudad`. Al cambiar de segmento, el usuario recibe una notificación push indicando si subió o bajó de liga.

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
barriosConquistadosHistorico, maxBarriosSimultaneos,
logros[], racha,
segmentoCompetitivo, segmentoRitmo, segmentoGenero, segmentoEdad, segmentoEtiqueta,
fotoPendiente, fotoPerfilEstado, fotoMotivoRechazo,
onboardingPendiente, onboardingCompletado, esAdmin
```

> `pushToken` **no** vive aquí — vive en `usuarios/{uid}/privado/notificaciones` para no exponerlo en reglas de lectura pública.

#### Subcollección `usuarios/{uid}/privado/datos`
Datos personales sensibles no accesibles por otros usuarios.
```
fechaNacimiento (YYYY-MM-DD), genero ('hombre'|'mujer'|'otro')
```
Usado para calcular `segmentoGenero` y `segmentoEdad`. Solo readable por el propio usuario.

#### Subcollección `usuarios/{uid}/privado/notificaciones`
```
pushToken (ExponentPushToken[...])
```
Leída por Cloud Functions para enviar notificaciones push (conquistas, cambio de liga, carrera inválida).

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

### `territorios/{id}/segmentos/{segmentoCompetitivo}`
Conquista por segmento competitivo. La fuente de verdad para saber quién domina cada barrio dentro de cada liga.
```
dueno, duenoPuntos, conquistadoEn,
top10Uids[], top10: { [uid]: { puntos, nickname } }
```

### `rankingsCiudad/{ciudadId}_{uid}`
Ranking desnormalizado por ciudad y segmento. Se actualiza con `increment()` en cada carrera.
```
ciudadId, uid, puntos, carreras, totalKm, barrios,
nickname, fotoPerfil, fotoPerfilEstado, pais, topLogros[],
segmentoCompetitivo, segmentoRitmo, segmentoGenero, segmentoEdad, segmentoEtiqueta
```
El ranking agrupa por `segmentoCompetitivo` — solo compiten entre sí usuarios del mismo segmento.

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

### `carreras`
| Campos |
|--------|
| uid ASC, fecha DESC |
| uid ASC, fecha ASC |

### `rankingsCiudad`
| Campos |
|--------|
| ciudadId ASC, puntos DESC |
| ciudadId ASC, puntos ASC |
| ciudadId ASC, uid ASC |
| ciudadId ASC, barrios DESC |
| ciudadId ASC, barrios ASC |
| ciudadId ASC, barrios DESC, puntos DESC |
| ciudadId ASC, barrios ASC, puntos ASC |
| ciudadId ASC, segmentoCompetitivo ASC, uid ASC |
| ciudadId ASC, segmentoCompetitivo ASC, puntos DESC |
| ciudadId ASC, segmentoCompetitivo ASC, puntos ASC |
| ciudadId ASC, segmentoCompetitivo ASC, barrios DESC |
| ciudadId ASC, segmentoCompetitivo ASC, barrios ASC |
| ciudadId ASC, segmentoCompetitivo ASC, barrios DESC, puntos DESC |
| ciudadId ASC, segmentoCompetitivo ASC, barrios ASC, puntos ASC |

### `territorios`
| Campos |
|--------|
| dueno ASC, ciudadId ASC |

### `segmentos` (collection group)
| Campos |
|--------|
| segmentoCompetitivo ASC, territorioId ASC |
| ciudadId ASC, segmentoCompetitivo ASC, dueno ASC |

### `grupos`
| Campos |
|--------|
| esPublico ASC, puntosTotales DESC |
| esPublico ASC, ciudadId ASC |
| ciudadId ASC, puntosTotales DESC |
| ciudadId ASC, esPublico ASC, puntosTotales DESC |

---

## Cloud Functions

| Función | Trigger | Descripción |
|---------|---------|-------------|
| `registrarCarreraConqurun` | HTTPS callable | Guarda carrera, calcula conquistas en servidor, actualiza ranking y grupos |
| `validarCarrera` | Firestore onWrite `carreras/{id}` | Validación asíncrona post-guardado: recomputa puntos, verifica GPS, detecta trampas. Si falla, revierte batch y envía push al usuario |
| `sincronizarRankingPerfil` | Firestore onWrite `usuarios/{uid}` | Sincroniza cambios de segmento competitivo en `rankingsCiudad` |
| `descontarTerritorioSegmentadoPerdido` | Firestore onWrite `territorios/.../segmentos/{seg}` | Ajusta `barriosConquistadosTotal` cuando otro usuario conquista un territorio |
| `descontarBarrioSegmentadoPerdido` | Firestore onWrite `barrios/.../segmentos/{seg}` | Mismo para la colección `barrios` (compatibilidad) |
| `enviarNotificacionTerritorios` | Firestore onWrite territorios | Notifica push al exdueño cuando pierde un barrio |
| `importarConquistasStrava` | HTTPS callable | Importa actividades Strava, calcula conquistas equivalentes |
| `stravaOAuthCallback` | HTTPS endpoint | Callback OAuth Strava, guarda tokens y hace deep link a la app |
| `unirseAGrupoConCodigo` | HTTPS callable | Valida código y ciudad, añade al grupo |
| `repararConsistenciaUsuario` | HTTPS callable | Recalcula barrios conquistados del usuario desde fuente de verdad |
| `marcarNotificacionesPendientesLeidas` | HTTPS callable | Marca notificaciones como leídas |
| `notificarReporte` | Firestore onWrite `reportes/{id}` | Envía email al admin cuando llega un reporte (requiere GMAIL_USER/PASS configurados) |
| `eliminarCuenta` | HTTPS callable | Borra todos los datos del usuario: carreras, ranking, territorios, grupos, reportes |

### Antitrampas en `validarCarrera`

- Pace mínimo: **180 s/km (3:00 min/km)**. Por debajo → carrera rechazada (bloquea motos y bicis)
- Recalcula puntos en servidor; si difieren > umbral → rechaza
- Verifica distancia GPS vs distancia declarada (± 20%)
- Verifica que los territorios tocados están en el trayecto GPS real
- Si la carrera no pasa: revierte todos los cambios con batch y envía notificación push al usuario

---

## Decisiones de arquitectura

### Stats desnormalizados en usuario
`distanciaTotal`, `carrerasTotal`, `duracionTotal`, `puntosTotales`, `barriosConquistadosTotal`, `barriosConquistadosHistorico` y `maxBarriosSimultaneos` se mantienen desde Cloud Functions. Perfil no debe leer todas las carreras para calcular agregados.

- `barriosConquistadosTotal`: barrios que el usuario posee ahora en su ciudad y segmento activos. Puede bajar si pierde territorio o cambia de ciudad/segmento.
- `barriosConquistadosHistorico`: total acumulado de conquistas conseguidas. No baja al perder barrios.
- `carreras/{id}.barriosConquistados`: numero de conquistas logradas solo en esa carrera.
- `carreras/{id}.conquistasCarrera`: listado resumido de las zonas conquistadas en esa carrera; es la fuente principal del detalle de carrera.

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
El adaptador fuerza Google Maps como proveedor en iOS. Para compilar la app iOS hay que habilitar **Maps SDK for iOS** en Google Cloud y crear una API key restringida al bundle `com.conquerun.app`. La key vive en `app.json` (`ios.config.googleMapsApiKey`) para que EAS la inyecte al regenerar el build nativo.

### Google Maps en Android
Android usa Google Maps mediante `react-native-maps`. La key vive en `app.json` (`android.config.googleMaps.apiKey`) y en el `AndroidManifest.xml` nativo. En Google Cloud debe estar restringida a **Maps SDK for Android**, package `com.conquerun.app` y el SHA-1 del keystore de producción.

### Firebase App Check
El cliente tiene un puente preparado para usar App Check nativo con `@react-native-firebase/app-check`: Play Integrity en Android y App Attest con fallback a DeviceCheck en iOS. Las Cloud Functions callable tienen el parametro `REQUIRE_APP_CHECK`; con `false` solo registran llamadas sin token, con `true` rechazan peticiones no verificadas.

Configuracion local ya preparada:
- `ios.googleServicesFile` apunta a `./firebase-native/GoogleService-Info.plist`.
- `android.googleServicesFile` apunta a `./firebase-native/google-services.json`.
- `@react-native-firebase/app`, `@react-native-firebase/app-check` y `expo-build-properties` estan en `plugins`.
- iOS declara `com.apple.developer.devicecheck.appattest-environment=production`.

Para activarlo en produccion faltan pasos de consola/build:
- Hacer un EAS Build real de iOS/Android.
- Comprobar en logs que las llamadas callable llegan con `request.app`.
- Poner `REQUIRE_APP_CHECK=true` y redesplegar Functions.
- Activar enforcement en Firebase Console para Firestore y Cloud Functions cuando las builds de tienda ya esten verificadas.

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

## Publicación en tiendas

### Estado actual
La app esta cerca de estar lista para tiendas, pero antes hay que validar un build EAS real con las credenciales nativas de Firebase y App Check activado.

### Estado de builds (mayo 2026)

- ✅ Android .aab (versionCode 4) — listo en EAS
- ⏳ iOS .ipa — build iniciado, pendiente de completar con Apple ID interactivo

### Cuentas developer

- ✅ Apple Developer account creada
- ✅ Google Play Developer account creada
- ✅ EAS CLI logueado como miguelhsa

### Pendiente para subir a tiendas

**Google Play:**
- [ ] Subir .aab a Play Console
- [ ] Rellenar Data Safety section
- [ ] Rellenar declaración background location: *Policy → App content → Sensitive permissions*
- [ ] Crear cuenta demo `review@conquerun.app` con barrios, carreras y ranking reales

**App Store:**
- [ ] Completar build iOS .ipa
- [ ] Subir .ipa a App Store Connect
- [ ] Rellenar App Privacy (datos recolectados, vinculación)
- [ ] Crear cuenta demo para revisores de Apple

**Ambas tiendas:**
- [ ] Capturas de pantalla (≥ 3 iPhone 6.7" + ≥ 2 Android)
- [ ] Feature graphic Android (1024 × 500 px)
- [ ] Cuestionario IARC de clasificación de contenido

**Verificar:**
- [ ] Confirmar que `conquerun.app` (GitHub Pages) está live con política de privacidad y términos accesibles

**App Check / Firebase nativo:**
- [x] Descargar `GoogleService-Info.plist` y `google-services.json` desde Firebase Console para las apps `com.conquerun.app`
- [x] Añadir esos archivos al flujo de build EAS y configurar `ios.googleServicesFile`, `android.googleServicesFile` y plugins RNFirebase
- [ ] Probar login, carrera, Strava, ranking, mapa y borrado con `REQUIRE_APP_CHECK=false` revisando que `request.app` llega informado
- [ ] Activar `REQUIRE_APP_CHECK=true` y enforcement de App Check en Firebase Console antes de abrir produccion

### Assets necesarios para el listing

| Qué | iOS | Android |
|---|---|---|
| Screenshots | Mín. 3 × iPhone 6.7" | Mín. 2 × teléfono Android |
| Feature graphic | — | 1024 × 500 px |
| Descripción corta | 30 chars | 80 chars |
| Descripción larga | hasta 4.000 chars | hasta 4.000 chars |

### Formularios en las consolas

- [ ] **App Store Connect** → Privacy Nutrition Label (datos recolectados, vinculación, seguimiento)
- [ ] **Play Console** → Data Safety section (categorías de datos, cifrado, borrado)
- [ ] **Ambas tiendas** → Cuestionario IARC de clasificación de contenido

### Lo que YA está listo

| | Qué |
|---|---|
| ✅ | `PrivacyInfo.xcprivacy` — declarado en `app.json` con `ios.privacyManifests` para builds limpias |
| ✅ | Sign in with Apple — NO requerido (la app solo usa email/contraseña) |
| ✅ | iOS deployment target — iOS 15.1 (cubre >97% de dispositivos) |
| ✅ | Política de privacidad y términos — publicados en `https://conquerrun-8d30e.web.app` |
| ✅ | Borrado de cuenta — implementado y limpio (carreras, ranking, territorios, reportes) |
| ✅ | Background location disclosure — dialog prominente antes de pedir el permiso |
| ✅ | Age gate — verificación de 13+ años en el registro |
| ✅ | Content moderation — reporte de contenido funcional |
| ✅ | expo-doctor — 17/17 checks OK |
| ✅ | Textos de ficha en español e inglés (nombre, subtítulo, descripción, keywords) |
| ✅ | Notas para revisores Apple/Google (UGC, background location, cuenta demo) |
| ✅ | Data Safety form para Google Play (completo) |
| ✅ | App Privacy para App Store Connect (completo) |
| ✅ | Notificación push cuando carrera es invalidada por antitrampas |
| ✅ | Notificación push diferenciada subida/bajada de liga |

### Tiempos de revisión estimados
- **Apple:** 1–3 días hábiles (primera vez puede tardar más)
- **Google Play:** 1–7 días (cuentas nuevas pueden tener revisión manual adicional)

---

## Roadmap

- [ ] CRÍTICO: evaluar migración del adaptador de mapa a MapLibre + tiles de bajo coste para reducir dependencia de Google Maps, controlar costes en Android y mantener intacta la lógica de territorios/conquistas.
- [ ] CRÍTICO ANTES DE TIENDAS: ejecutar el plan de reparacion de consistencia en `docs/roadmap.md` para que perfil, mapa, ranking, carrera, historial y equipos beban de la misma fuente de verdad.
- [ ] POST-LANZAMIENTO REAL: validar en builds de tienda iOS/Android el prompt nativo de reseñas, el boton "Valorar ConqueRun" y configurar `ios.appStoreUrl` cuando exista el App Store ID.
- [ ] POST-LANZAMIENTO REAL: revisar metricas de la notificacion/recordatorio de reseña a los 7 dias para asegurar que no molesta ni incumple politicas de Apple/Google.
- [ ] POST-LANZAMIENTO REAL: validar de extremo a extremo Strava OAuth fuera de Expo Go: autorizacion, retorno a la app, importacion, conquistas y reflejo en perfil, ranking, mapa e historial.
- [ ] POST-LANZAMIENTO REAL: monitorizar logs de Functions, errores de App Check, costes Firestore/Maps/Strava y ratio de carreras fallidas durante la primera semana.
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
