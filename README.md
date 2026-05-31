# ConqueRun
> No solo corres, conquistas.

ConqueRun es una app móvil de running con capa social, competitiva y territorial. Las ciudades se dividen en territorios reconocibles y los corredores los conquistan corriendo.

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | React Native + Expo SDK 54 |
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
| Correr | Carrera en tiempo real: ruta, km, tiempo, ritmo. Tracking en segundo plano. Importación y desconexión de Strava. |
| Ranking | Top individual y de grupos por ciudad, filtrado por segmento competitivo. |
| Grupos | Crear, explorar y unirse a grupos de tu ciudad (públicos o con código). |
| Perfil | Estadísticas, logros, barrios conquistados, posición en ranking. |

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
- **Máximo válido: 12:00 min/km (720 s/km)**. Por encima se considera caminata, no carrera.

**Límites de carrera válida:**
- Distancia: mín. 200 m · máx. 100 km
- Duración: mín. 60 s · máx. 24 h

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
| Primeros pasos | 10 km | 10 |
| Medio centenar | 50 km | 50 |
| Centenario | 100 km | 100 |
| Máquina | 500 km | 500 |
| Leyenda | 1000 km | 1000 |

### Por barrios conquistados (acumulados)
| Logro | Requisito | Bonus pts |
|-------|-----------|-----------|
| Primer territorio | 1 barrio | 5 |
| Explorador | 5 barrios | 25 |
| Dominador | 10 barrios | 50 |
| Rey del asfalto | 20 barrios | 100 |

### Por racha de días consecutivos
| Logro | Requisito | Bonus pts |
|-------|-----------|-----------|
| Constante | 3 días | 10 |
| Semana perfecta | 7 días | 30 |
| Mes de hierro | 30 días | 150 |

Los bonus de logros van al territorio donde el usuario tiene más puntos acumulados.

---

## Grupos

- Cada grupo pertenece a **una ciudad**. Solo corredores de esa ciudad pueden unirse.
- Públicos (visibles en el explorador de su ciudad) o privados (código de 6 caracteres).
- Al crear: la ciudad se asigna automáticamente desde la ciudad del creador.
- Al unirse por código: se valida que el corredor sea de la misma ciudad.
- Cada carrera aporta puntos a todos los grupos del corredor.
- Los grupos compiten en un ranking por puntos totales dentro de su ciudad.
- Los grupos tienen sus propias marcas territoriales (`grupoMarcas`) y acumulan dominancia de barrios independientemente del ranking individual.

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

#### Subcollección `usuarios/{uid}/privado/strava`
```
accessToken, refreshToken, athleteId, expiresAt
```
Tokens OAuth de Strava. Solo readable por el propio usuario. Se elimina al desconectar Strava.

#### Subcollección `usuarios/{uid}/marcasTerritoriales/{barrioId}_{segmento}`
Puntos acumulados del usuario en cada territorio por segmento competitivo.
```
puntos, carreras, coleccion, ciudadId, segmentoCompetitivo, carrerasAplicadas[], actualizadoEn
```

### `carreras/{id}`
ID determinístico: `{uid}_{timestamp}`
```
uid, ruta[], distancia, duracion, ritmoMedio, puntos, puntosPersonales, bonusLogros,
ciudadId, ciudadNombre, paisCodigo, fecha, secondaryStatus: 'pending'|'complete',
source: 'conqurun' | 'strava',
aportacionesGrupo[], gruposAportados[], territorioCarrera[],
fraudulenta, motivosFraude[], verificado, verificadoEn
```

### `territorios/{id}` y `barrios/{id}`
Fuente de verdad para conquistas individuales.
```
nombre, nombreVisible, tipo, ciudadId, ciudadNombre, paisCodigo,
lat, lng, radio, dueno, duenoPuntos, conquistadoEn
```

#### Subcollección `{coleccion}/{id}/segmentos/{segmentoCompetitivo}`
Conquista por segmento competitivo.
```
dueno, duenoNombre, duenoPuntos, conquistadoEn, duenoGrupo,
top10Uids[], top10: [{ uid, puntos }],
territorioId, ciudadId, segmentoCompetitivo, segmentoRitmo, segmentoGenero, segmentoEdad
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
puntosTotales, carrerasTotales, distanciaTotal, duracionTotal,
carrerasAplicadas[],
foto, fotoPendiente, fotoEstado, fotoMotivoRechazo, fotoRevisadaEn,
creadoEn, actualizadoEn
```

#### Subcollección `grupoMarcas/{grupoId}/marcasTerritoriales/{barrioId}`
```
puntos, carreras, ciudadId, carrerasAplicadas[], actualizadoEn
```

### `aportacionesGrupo/{id}`
ID determinístico: `{carreraId}_{grupoId}`
```
carreraId, grupoId, grupoNombre, uid,
puntosBase, multiplicadorGrupo, puntosGrupo,
miembrosGrupoEnEseMomento, distancia, fecha
```

### `rankingsCiudad/{ciudadId}_{uid}`
Ranking desnormalizado por ciudad y segmento. Se actualiza con `increment()` en cada carrera.
```
ciudadId, uid, puntos, carreras, totalMetros, barrios,
nickname, fotoPerfil, fotoPerfilEstado, pais, topLogros[],
segmentoCompetitivo, segmentoRitmo, segmentoGenero, segmentoEdad, segmentoEtiqueta
```

### `config/app`
Configuración runtime leída por la app antes del login.
```
versionMinima (string)  — fuerza actualización si la versión instalada es inferior
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

### `territorios` / `barrios`
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
| `registrarCarreraConqurun` | HTTPS callable | Guarda carrera en dos fases: Fase 1 (transacción atómica: carrera + usuario + ranking) y Fase 2 (batch: marcas territoriales, grupos, conquistas). Idempotente por `carrerasAplicadas` ledger. |
| `validarCarrera` | Firestore onWrite `carreras/{id}` | Validación asíncrona post-guardado: recomputa puntos, verifica GPS (tolerancia ±35%), detecta trampas. Si falla, revierte completamente: usuario, ranking, marcasTerritoriales, aportacionesGrupo, grupos y grupoMarcas. |
| `desconectarStrava` | HTTPS callable | Revoca el token OAuth en Strava (best-effort) y elimina `privado/strava` del usuario. |
| `importarConquistasStrava` | HTTPS callable | Importa actividades Strava, calcula conquistas equivalentes. |
| `stravaOAuthCallback` | HTTPS endpoint | Callback OAuth Strava con nonce servidor firmado (uso único, TTL 10 min). Guarda tokens y hace deep link a la app. |
| `sincronizarRankingPerfil` | Firestore onWrite `usuarios/{uid}` | Sincroniza cambios de nickname, foto y segmento competitivo en `rankingsCiudad` y grupos. |
| `descontarTerritorioSegmentadoPerdido` | Firestore onWrite `territorios/.../segmentos/{seg}` | Ajusta `barriosConquistadosTotal` cuando otro usuario conquista un territorio. |
| `descontarBarrioSegmentadoPerdido` | Firestore onWrite `barrios/.../segmentos/{seg}` | Mismo para la colección `barrios`. |
| `enviarNotificacionTerritorios` | Firestore onWrite territorios | Notifica push al exdueño cuando pierde un barrio. |
| `aplicarDecayTerritorial` | Scheduled (diario) | Aplica decaimiento de puntos en territorios inactivos. Paginado con cursor (500 docs/página) para evitar timeouts. |
| `unirseAGrupoConCodigo` | HTTPS callable | Valida código y ciudad, añade al grupo. |
| `unirseAGrupoPublico` | HTTPS callable | Valida ciudad y límite de 50 miembros, añade al grupo público. |
| `repararConsistenciaUsuario` | HTTPS callable | Recalcula barrios conquistados del usuario desde fuente de verdad. |
| `marcarNotificacionesPendientesLeidas` | HTTPS callable | Marca notificaciones como leídas. |
| `notificarReporte` | Firestore onWrite `reportes/{id}` | Envía email al admin cuando llega un reporte (requiere GMAIL_USER/PASS). |
| `eliminarCuenta` | HTTPS callable | Borra todos los datos del usuario: carreras, ranking, territorios, grupos, reportes, fotos. |

### Antitrampas en `validarCarrera`

- Ritmo mínimo: **180 s/km (3:00 min/km)**. Por debajo → rechaza (bloquea motos y bicis)
- Ritmo máximo: **720 s/km (12:00 min/km)**. Por encima → rechaza
- Recalcula puntos en servidor; si difieren > 1 punto → rechaza
- Verifica distancia GPS vs distancia declarada (tolerancia ±35%)
- Verifica que los territorios declarados están en el trayecto GPS real
- **Reversión completa en fraude**: deshace usuario, ranking, marcasTerritoriales, aportacionesGrupo, grupos y grupoMarcas. Usa `commitEnChunks` (bloques de 450 ops).
- Fraude global (ritmo/puntos/GPS): revierte TODOS los territorios del run
- Fraude parcial (solo territorios_no_alcanzados): revierte únicamente los territorios que no coinciden con GPS

---

## Decisiones de arquitectura

### Stats desnormalizados en usuario
`distanciaTotal`, `carrerasTotal`, `duracionTotal`, `puntosTotales`, `barriosConquistadosTotal`, `barriosConquistadosHistorico` y `maxBarriosSimultaneos` se mantienen desde Cloud Functions. El perfil no necesita leer todas las carreras para calcular agregados.

- `barriosConquistadosTotal`: barrios que el usuario posee ahora en su ciudad y segmento activos. Puede bajar si pierde territorio o cambia de ciudad/segmento.
- `barriosConquistadosHistorico`: total acumulado de conquistas. No baja al perder barrios.

### Idempotencia de carreras (Fase 2)
Cada operación de Fase 2 usa `carrerasAplicadas: arrayUnion(carreraId)` como ledger. Si el cliente reintenta la carrera, las ops ya aplicadas se saltan. `secondaryStatus: 'complete'` solo se escribe cuando todas las ops de Fase 2 han completado con éxito.

### rankingsCiudad — ranking sin agregación
Un doc por usuario por ciudad, actualizado incrementalmente. Coste ~$20/mes a 100k usuarios activos vs. $270k/mes si se leyeran todas las carreras.

### marcasTerritoriales en subcolección
Las marcas territoriales viven en `usuarios/{uid}/marcasTerritoriales/{barrioId}_{segmento}`. Evita el límite de 20k campos/documento de Firestore al escalar a cientos de ciudades.

### Batch chunking
`commitEnChunks(ops)` divide en bloques de 450 ops para no superar el límite de 500 por batch de Firestore. Usado en Fase 2, reversión de fraude y decay territorial.

### Rate limiting de reportes
El ID del documento es `{uid}_{recursoId}`. Si el doc ya existe, la escritura falla por la regla `noReporteRepetido()`. Sin coste de Cloud Functions.

### Capa de mapa desacoplada
Las pantallas no importan directamente `react-native-maps`. Usan `components/map/MapAdapter.js` (`TerritoryMap`, `TerritoryPolygon`, `TerritoryMarker`, `RouteLine`, `TerritoryCircle`). La lógica de territorios, segmentos, puntos y conquistas vive fuera del proveedor de mapa para poder migrar a MapLibre + tiles sin tocar la lógica competitiva.

### Google Maps
La key de Maps vive en **EAS Secrets** (`GOOGLE_MAPS_IOS_KEY`, `GOOGLE_MAPS_ANDROID_KEY`) e `app.config.js` la inyecta en build time. No está en el repositorio. Las keys están restringidas en Google Cloud Console: iOS por bundle ID `com.conquerun.app`, Android por package name + SHA-1 del keystore de producción.

### Firebase App Check
El cliente usa `@react-native-firebase/app-check` con un `CustomProvider` que puente al SDK nativo: Play Integrity en Android, App Attest en iOS. Las Cloud Functions leen el parámetro `REQUIRE_APP_CHECK` del entorno:
- `false` (actual): registra llamadas sin bloquear — modo monitoring
- `true`: rechaza peticiones sin token válido — modo enforce

**Estado actual (mayo 2026):**
- ✅ Providers registrados en Firebase Console (Play Integrity + App Attest)
- ✅ Token TTL: 7 días
- ⏳ `REQUIRE_APP_CHECK=false` — pendiente verificar métricas de tokens en consola antes de activar enforce

### Versión mínima forzada
`App.js` lee `config/app.versionMinima` de Firestore antes del login. Si la versión instalada es inferior, muestra pantalla de bloqueo con enlace a la tienda. Falla-open (si hay error de red, deja pasar). La regla de Firestore permite lectura pública del doc `config/app`.

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

### Datos ficticios para desarrollo
```bash
MI_UID=<tu_uid> node scripts/generarDatosFicticios.mjs   # crear
node scripts/borrarDatosFicticios.mjs                     # borrar y restaurar territorios
```

---

## Despliegue

```bash
firebase deploy --only functions
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

---

## Desarrollo local

```bash
npx expo start    # servidor de desarrollo
# Pulsa 'i' para iOS simulator o escanea QR con Expo Go
```

---

## Publicación en tiendas

### Estado (mayo 2026)

| | Qué |
|---|---|
| ✅ | Android .aab listo en EAS |
| ✅ | Apple Developer account creada |
| ✅ | Google Play Developer account creada |
| ✅ | EAS CLI logueado como miguelhsa |
| ✅ | App Check — providers registrados (Play Integrity + App Attest), monitoring activo |
| ✅ | Firestore — PITR activado, delete protection, backups diarios y semanales |
| ✅ | Google Maps API keys restringidas por bundle ID / package + SHA-1 |
| ✅ | Política de privacidad, términos y página de eliminación de cuenta publicadas en GitHub Pages |
| ✅ | Versión mínima forzada — `config/app.versionMinima = "1.0.0"` activo |
| ✅ | Textos de ficha en español e inglés (nombre, subtítulo, descripción, keywords) |
| ✅ | Notas para revisores Apple/Google (UGC, background location, cuenta demo) |
| ✅ | Data Safety form para Google Play |
| ✅ | App Privacy para App Store Connect |
| ✅ | Borrado de cuenta implementado y completo |
| ✅ | Background location — dialog prominente antes de pedir el permiso |
| ✅ | Age gate — verificación de 13+ años en el registro |
| ✅ | Content moderation — reporte de contenido funcional |
| ⏳ | iOS .ipa — pendiente build de producción |
| ⏳ | App Check enforce — activar `REQUIRE_APP_CHECK=true` tras verificar métricas |
| ⏳ | Capturas de pantalla para las fichas de tienda |
| ⏳ | Feature graphic Android (1024 × 500 px) |

### URLs legales (GitHub Pages)

- Privacidad: `https://miguelhsa.github.io/ConqueRun/privacidad.html`
- Términos: `https://miguelhsa.github.io/ConqueRun/terminos.html`
- Eliminar cuenta: `https://miguelhsa.github.io/ConqueRun/eliminar-cuenta.html`
- Contacto: `conquerunapp@gmail.com`

### Assets necesarios para el listing

| Qué | iOS | Android |
|---|---|---|
| Screenshots | Mín. 3 × iPhone 6.7" | Mín. 2 × teléfono Android |
| Feature graphic | — | 1024 × 500 px |
| Descripción corta | 30 chars | 80 chars |
| Descripción larga | hasta 4.000 chars | hasta 4.000 chars |

### Tiempos de revisión estimados
- **Apple:** 1–3 días hábiles (primera vez puede tardar más)
- **Google Play:** 14 días de closed testing antes de solicitar producción

---

## Roadmap

- [ ] Activar `REQUIRE_APP_CHECK=true` tras verificar en Firebase Console que los tokens llegan correctamente desde las builds de tienda
- [ ] Build iOS .ipa de producción: `eas build --platform ios --profile production`
- [ ] Capturas de pantalla y feature graphic para las fichas de tienda
- [ ] Smoke test completo en build nativa (alta, carrera, conquista, grupo, Strava, push, borrado)
- [ ] Evaluar migración del adaptador de mapa a MapLibre + tiles para reducir costes en ciudades grandes
- [ ] Historial de carreras con mapa de ruta
- [ ] Reversión completa de duenoGrupo en fraude (coste alto, pospuesto post-MVP)
- [ ] Optimizar ranking de grupos con `orderBy` + índice compuesto cuando haya > 200 grupos por ciudad
- [ ] Grupos: chat interno y salidas organizadas
- [ ] Selector de país en ranking (filtro por país)
- [ ] Expansión territorial: resto de España y ciudades internacionales
- [ ] Conquista de ciudades completas ("Conquistador forastero")

---

*ConqueRun — No solo corres, conquistas.*
