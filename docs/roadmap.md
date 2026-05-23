# Hoja de Ruta de ConqueRun

Revision: 2026-05-17

Esta hoja de ruta refleja el estado real del repositorio tras revision exhaustiva de codigo: `App.js`, todas las `screens/`, todos los `utils/`, reglas de Firestore y documentos auxiliares. Las tareas ya implementadas se han retirado para que este documento sirva como guia operativa.

---

## Principio de Producto

ConqueRun debe ser una app donde correr tenga una recompensa territorial clara: conquistar zonas, competir con amigos y sentir progreso real. La prioridad no es tener muchas funciones, sino que el bucle principal sea adictivo, justo y facil de entender.

El bucle principal es:

1. El usuario entra y entiende la propuesta.
2. Sale a correr.
3. Gana puntos.
4. Conquista o defiende zonas.
5. Compara su progreso en ranking, perfil y grupo.
6. Vuelve porque tiene algo que recuperar, mejorar o mantener.

---

## Estado Actual Verificado

- App Expo con Firebase.
- Registro/login por email.
- Login con fondo visual de mapa y bandera.
- Splash inicial con logo.
- Flujo de registro: NicknameScreen → CiudadScreen → OnboardingScreen. La ciudad es obligatoria desde el alta.
- Onboarding inicial de 3 pasos, mostrado solo en alta nueva.
- Perfil con estadisticas desnormalizadas, logros, foto pendiente de revision, barrios conquistados y grupos.
- Grupos por ciudad: publicos/privados, creacion, union por codigo, validacion de ciudad al unirse, posicion en ranking de ciudad visible en cada tarjeta, foto pendiente de revision y reportes.
- Ranking global, ranking por ciudad y ranking de grupos filtrado por ciudad.
- Pantalla de correr con ruta, distancia, tiempo, ritmo, permisos explicados antes de pedir ubicacion y guardado de carrera.
- Mapa con territorios ConqueRun reconocibles, fallback de ciudad si no hay permiso de ubicacion y panel basico de territorio seleccionado.
- Historial basico de carreras con distancia, ritmo, puntos, estado puntuable/Strava y enlace externo si existe.
- Sistema basico de puntos con factor ritmo y multiplicador de logros.
- Sistema basico de conquistas desde cliente.
- Notificacion cuando pierdes un barrio.
- Moderacion inicial de fotos con pantalla admin.
- Reportes con ID deterministico para rate limiting sin Cloud Functions.
- Bloqueo basico de usuario registrado en Firestore.
- Reglas Firestore con validacion server-side: distancia, duracion, velocidad, nickname, nombre y descripcion de grupo.
- Modelo preparado para ciudades y barrios.
- Coleccion `territorios` como modelo preferente, con `barrios` como fallback compatible.
- Adaptador inicial de datos Strava, pendiente de backend OAuth/importacion.
- Tracking GPS foreground y background con TaskManager, filtros de precision y velocidad, pausa/reanudar con `segmentStart`.
- Persistencia de carrera en curso en AsyncStorage.
- Sistema de logros con 14 logros en 3 categorias (km, barrios, racha) y multiplicadores acumulativos.
- Biometria (Face ID / Touch ID) para desbloquear sesion guardada.
- Marcas territoriales en subcoleccion `usuarios/{uid}/marcasTerritoriales/{barrioId}` con ciudadId — sin limite de campos en el doc usuario.
- Deuda tecnica critica resuelta: doble lectura de usuario en CorrerScreen eliminada (perfilRef), lectura de todas las carreras acotada a limit(60) en comprobarLogros, batch chunking en grupos.

---

## Bugs y Deuda Tecnica Conocida

Problemas encontrados en la revision de codigo que deben resolverse independientemente de la fase en la que se trabaje.

### Criticos — afectan integridad de datos

- **Race condition al guardar carrera** (`CorrerScreen.js:319`): `setCorriendo(false)` se llama antes de que terminen las operaciones async de guardado. Si algo falla a mitad, el estado de UI y Firestore quedan desincronizados.
- ~~**Escrituras secuenciales sin atomicidad**: resuelto con `writeBatch` atomico.~~
- ~~**Demo data visible en produccion**: eliminado.~~

### Altos — afectan correctitud

- ~~**Bug de timezone en calcularRacha**: resuelto con normalizacion UTC.~~
- **Post-lanzamiento critico: validar Strava OAuth en entorno real**. Probar el flujo completo fuera de Expo Go con builds instaladas de iOS y Android: boton "Importar conquistas de Strava" → login/autorizacion Strava → retorno automatico a ConqueRun → importacion de actividades → conquistas reflejadas en mapa, ranking, historial y perfil. Confirmar que el puente HTTPS de Firebase abre `conquerun://strava` en produccion y que no queda al usuario en Safari/Chrome.
- **Post-lanzamiento critico: monitorizar errores y abandono en Strava**. Revisar logs de `stravaOAuthCallback` e `importarConquistasStrava`, errores de `redirect_uri`, usuarios que conectan pero no importan, tokens caducados, limites de API y casos sin actividades recientes. Medir coste/lecturas/escrituras de cada importacion real.
- **Post-lanzamiento critico: validar reseñas nativas en entorno real**. Probar `expo-store-review` en builds reales de App Store/TestFlight y Google Play Internal Testing, configurar `ios.appStoreUrl` cuando exista App Store ID y confirmar que el boton manual abre la ficha correcta.
- **Post-lanzamiento critico: monitorizar primera semana real**. Revisar logs de Functions, errores de App Check, uso de mapas, coste Firestore/Maps/Strava, carreras fallidas, deep links rotos, usuarios que abandonan onboarding y frecuencia del recordatorio de reseña a 7 dias.
- **AsyncStorage leido cada segundo en dos sitios a la vez** (`App.js:98` y `CorrerScreen.js:150`): el banner de carrera activa y la pantalla de correr leen AsyncStorage en paralelo cada 1 segundo durante toda la carrera. Impacto en bateria y rendimiento.
- **Busqueda lineal O(n) de barrios** (`barrios.js:30`): `calcularBarrio` itera todos los territorios para cada punto de la ruta. Con 300 territorios y 1.000 puntos GPS son 300.000 comparaciones por carrera.
- ~~**`formatTiempo` duplicada**: resuelto en `utils/formatters.js`.~~
- **Codigo de grupo no criptografico** (`grupos.js:9`): `Math.random()` para generar codigos de invitacion de grupos privados. No es criptograficamente seguro.
- ~~**Migrar Firebase Functions fuera de Node.js 20**: resuelto. Runtime actualizado a Node.js 22 y desplegado en produccion.~~
- **Configurar credenciales reales de email admin en Functions**: `GMAIL_USER`, `GMAIL_PASS` y `ADMIN_EMAIL` estan en modo `disabled` para poder desplegar sin secretos locales. Hasta configurarlas con valores reales, `notificarReporte` registra el reporte pero no envia email al admin.

### Medios — afectan UX

- ~~**El usuario no sabe el minimo para guardar**: resuelto con barra de progreso.~~
- ~~**Errores de Firebase Auth en crudo**: resuelto con mapa de errores en espanol.~~
- ~~**Sin spinner en Login**: resuelto.~~
- ~~**Posicion propia no visible en Ranking**: resuelto.~~
- ~~**RankingScreen muestra puntos historicos tras cambio de segmento**: resuelto. Se detecta `sinEntradaEnSegmento` (usuario tiene segmentoCompetitivo pero no hay entrada en rankingsCiudad) y se muestran 0 barrios/puntos en lugar del historico acumulado.~~
- ~~**DetalleCarreraScreen clasificacion de conquistas incorrecta**: resuelto. Usa `puntosAcumuladosUsuario` (puntos acumulados totales del usuario en el barrio) y `carrera.uid` como referencia, en lugar de puntos de la carrera individual.~~
- ~~**CorrerScreen historial limitado a 3 carreras**: resuelto. Muestra carreras de los ultimos 30 dias ordenadas por fecha. Cada tarjeta navega a `DetalleCarreraScreen`.~~
- ~~**No hay notificacion cuando una carrera es invalidada por fraude**: resuelto. `validarCarrera` lee el pushToken de `privado/notificaciones` y notifica via Expo Push API tras revertir el batch.~~
- **Factor ritmo penaliza corredores lentos**: el ritmoBase de 5:00 min/km hace que corredores de 7:00-8:00 min/km obtengan factores de 0.67-0.77. Ver propuesta en Fase 2 para curva mas justa.

---

## Plan de Reparacion de Consistencia Antes de Tiendas

Objetivo: que perfil, mapa, ranking, carrera, historial y grupos muestren siempre la misma realidad. No avanzar a tiendas hasta que estas fases esten cerradas y verificadas con datos reales y datos ficticios.

### Fase R1 — Bloqueantes de guardado y permisos

- [x] Alinear formato de `fechaNacimiento` entre `NicknameScreen` y `firestore.rules`. Regex cambiado a `YYYY-MM-DD` en reglas y desplegado.
- [ ] Permitir una limpieza segura de `notificacionesPendientes` o mover el acuse de lectura a una callable. El cliente no debe intentar una escritura que las reglas bloquean.
- [ ] Crear prueba manual de alta completa: registro -> nickname -> genero -> fecha nacimiento -> nacionalidad -> ciudad -> onboarding -> perfil cargado.

### Fase R2 — Fuente unica de conquistas individuales

- [x] Definir fuente oficial: las conquistas actuales son los docs `territorios/barrios/{id}/segmentos/{segmentoCompetitivo}` donde `dueno == uid`.
- [x] Cambiar ranking individual para ordenar por `barrios desc` desde Firestore y usar puntos solo como desempate. Implementado en `utils/rankingsCiudad.js` con `orderBy('barrios', 'desc'), orderBy('puntos', 'desc')` + `limit(10)`.
- [ ] Revisar `rankingsCiudad.barrios`, `usuarios.barriosConquistadosTotal` y perfil para que todos se reparen desde la fuente oficial, no desde contadores historicos.
- [ ] Evitar que cambiar `ciudadActualId` mueva barrios antiguos a la nueva ciudad. Cambiar ciudad debe afectar a lo que se mira/compite a partir de ese momento, no trasladar conquistas de otra ciudad.
- [ ] Mejorar `repararConsistenciaUsuario` para que devuelva el conteo reparado y el cliente refresque perfil/ranking/mapa despues de ejecutarla.
- [ ] Crear script admin de reconciliacion: recalcular barrios por usuario/ciudad/segmento desde segmentos territoriales y reescribir `usuarios` + `rankingsCiudad`.

### Fase R3 — Carrera, historial y Strava coherentes

- [ ] Guardar en cada carrera un resultado territorial ya resuelto por backend: `conquistadas`, `defendidas`, `rivalesPendientes`, usando `puntosAcumuladosUsuario`.
- [ ] Cambiar `CorrerScreen` y `DetalleCarreraScreen` para pintar el resultado devuelto por Functions, no una reclasificacion local con puntos de una sola carrera.
- [x] En `importarConquistasStrava`, guardar `barriosConquistados` en el doc `carreras/{id}` igual que en carreras ConqueRun. Tambien actualiza `maxBarriosSimultaneos`.
- [ ] Decidir si Strava tambien actualiza logros, racha y `maxBarriosSimultaneos`; si no, mostrarlo explicitamente como "importacion verificada sin racha".
- [ ] Mover el listener de deep link Strava a nivel global en `App.js`/`NavigationContainer` para que funcione aunque la app vuelva fria o en otro tab.

### Fase R4 — Segmentos y cambio de ciudad

- [x] No recalcular segmento de edad en cliente sin `usuarios/{uid}/privado/datos.fechaNacimiento`. `PerfilScreen` ahora lee en paralelo el doc usuario y `privado/datos` con `Promise.all` y combina `fechaNacimiento` antes de calcular el segmento.
- [ ] Documentar y aplicar la diferencia entre nacionalidad inmutable y `paisCodigo/ciudadActualId` como pais/ciudad a conquistar.
- [ ] Verificar que mapa, perfil y ranking usan siempre el mismo `segmentoCompetitivo` activo.
- [x] En cambio de segmento de ritmo, notificar al usuario distinguiendo subida vs bajada. `CorrerScreen` compara el indice en `SEGMENTOS_RITMO` antes y despues del cambio.

### Fase R5 — Grupos y mapa de equipos

- [ ] Mantener una sola regla de producto: una carrera solo aporta al equipo elegido al terminar.
- [ ] En mapa modo equipos, mostrar claramente zonas agrupadas por cada equipo del usuario y no mezclar detalle individual con detalle de equipo.
- [ ] Cambiar `DetalleBarrioScreen` o crear detalle especifico de equipo para que "Ver detalle" desde modo equipos no muestre dueño individual incorrecto.
- [ ] Validar que `grupos.barriosConquistados`, `grupoMarcas` y mapa de equipos se reparan desde la misma fuente.

### Fase R6 — Seguridad y aceptacion en tiendas

- [ ] Subir fotos de perfil pendientes a una ruta privada tipo `fotosPendientes/{uid}.jpg`; solo publicar/copiar a `fotos/{uid}.jpg` cuando admin apruebe.
- [ ] Mantener `REQUIRE_APP_CHECK=false` solo durante validacion; pasar a `true` cuando iOS/Android reales envien `request.app`.
- [ ] Revisar Data Safety / Privacy Nutrition Labels tras cerrar Strava, ubicacion, fotos, reseñas y notificaciones.

### Criterio de cierre

- [ ] Usuario A conquista 4 zonas: perfil muestra 4, ranking muestra 4, mapa pinta 4, detalle de carrera lista las mismas zonas.
- [ ] Usuario A cambia de ciudad: la nueva ciudad no hereda barrios de la anterior; ranking y mapa quedan a cero o con las conquistas reales de esa ciudad.
- [ ] Usuario A importa Strava: carrera aparece en historial, suma puntos, suma conquistas y se refleja igual en perfil/ranking/mapa.
- [ ] Usuario A pertenece a varios equipos: al terminar carrera elige uno y solo ese equipo recibe puntos/conquistas.
- [ ] Usuario no admin nunca ve tab Admin; usuario admin si lo ve.
- [ ] Alta nueva completa no genera errores de reglas Firestore.

---

## Sprint 0 — Limpieza Urgente

Objetivo: eliminar lo temporal y corregir lo critico antes de que lo vea nadie externo. Estimacion: 1 semana.

### Eliminar datos y botones temporales

- ~~Eliminar `ResumenTerritorio` demo con Malasana/Chamberi/Retiro de `CorrerScreen.js:718`. Sustituir por estado vacio limpio con texto motivacional: "Sigue sumando puntos para atacar zonas cercanas."~~
- ~~Eliminar boton "Cargar demo Madrid" de `HistorialScreen.js`.~~
- ~~Eliminar bloque `mostrarDemo` y prop relacionada de `ResumenTerritorio`.~~
- Eliminar logs de depuracion de GPS o sincronizacion que se hayan anadido durante pruebas.
- Revisar alertas provisionales que deban convertirse en pantallas o modales finales.

### Correcciones rapidas de UX

- ~~Crear `utils/formatters.js` y mover `formatTiempo` y `formatRitmo` ahi. Eliminadas las copias duplicadas en `App.js`, `CorrerScreen.js` e `HistorialScreen.js`.~~
- ~~Crear mapa de errores Firebase Auth en espanol en `LoginScreen.js`:~~
  - ~~`auth/user-not-found` → "No existe una cuenta con ese email."~~
  - ~~`auth/wrong-password` → "Contrasena incorrecta."~~
  - ~~`auth/too-many-requests` → "Demasiados intentos. Espera unos minutos."~~
  - ~~`auth/network-request-failed` → "Sin conexion. Revisa tu internet."~~
- ~~Anadir spinner y desactivar boton de Login mientras Firebase procesa.~~
- ~~Mostrar posicion propia al final del ranking aunque no este en el top 10, con separador visual.~~

### Fix timezone en racha

- ~~En `logros.js:32`, sustituir `toDateString()` por normalizacion UTC para que la racha no dependa del timezone del dispositivo.~~

---

## Fase 0 — Cierre de Base MVP

Objetivo: dejar la app estable para probarla con usuarios conocidos. Estimacion: 2-3 semanas.

### Correr — estabilidad y UX critica

- ~~Anadir barra de progreso "Minimo 200m · 60s para guardar" visible durante la carrera con estado en tiempo real (distancia actual / 200m).~~
- ~~Convertir el guardado de carrera en un `writeBatch` atomico: carrera + usuario + barrios + incrementos en una sola operacion. Si falla, falla todo junto y se informa al usuario.~~
- ~~Mostrar durante la carrera el contexto del barrio actual: "Atacando Malasana" si es de otro corredor, "Defendiendo Chamberi" si es tuyo, "Zona libre" si no tiene dueno.~~
- ~~Sustituir el `Alert.alert` de confirmacion de terminar carrera por un modal propio que muestre distancia y tiempo acumulados antes de confirmar.~~
- Probar en dispositivo real: iPhone fisico, Android fisico, pantalla apagada, pausa/reanudar, recuperacion de carrera en curso, sin conexion.
- Validar permisos reales de background location en dispositivo fisico.
- Validar filtro GPS con rutas reales (no simulador).
- Revisar que los fallos de red se comuniquen de forma clara al usuario.

### Mapa — jugabilidad visible

- ~~Pintar territorios con tres colores distintos segun estado:~~
  - ~~Sin dueno → gris (`colors.subdued`)~~
  - ~~Tuyo → dorado (`colors.gold`)~~
  - ~~De otro corredor → rojo (`colors.conquest`)~~
- ~~Panel de territorio al seleccionar: nombre, dueno actual, puntos del dueno, puntos necesarios para conquistarlo, fecha de ultima conquista.~~
- ~~Boton "Como llegar" que abra Apple Maps / Google Maps con el territorio como destino.~~
- Optimizar carga de barrios por ciudad/zona visible en el viewport.

### Pantallas vacias, errores y cargas

- Unificar estados vacios en toda la app: mismo componente, mismo tono de mensaje.
- Unificar indicadores de carga.
- Unificar mensajes de error de red.
- Revisar textos con acentos y tono final de producto en todas las pantallas.

### Estructura de codigo

- Separar `CorrerScreen.js` (1.093 lineas) en:
  - `CorrerScreen.js` — solo orquestacion y UI
  - `hooks/useCarreraTracking.js` — logica de estado GPS, timer, sincronizacion
  - `components/ResumenCarreraModal.js` — modal completo de resumen
- Terminar la unificacion visual en pantallas con estilos hardcodeados: `Correr`, `Mapa`, `Historial`, `Perfil`, `Grupos`, `Moderacion`, `Nickname`.
- Sustituir emojis que actuen como UI por iconos de `@expo/vector-icons` consistentes con el resto de la app.

### Pantalla de detalle de barrio

- ~~Crear pantalla navegable desde el mapa con: nombre del barrio, dueno actual con avatar y nickname, puntos necesarios para conquistarlo, ultimas conquistas (quien lo tuvo antes), barrios vecinos.~~

### Pantalla de detalle de carrera

- ~~Crear pantalla navegable desde el historial con: mapa de la ruta completa, distancia, duracion, ritmo, puntos, estado (valida / sospechosa / Strava verificada), territorios tocados con resultado (conquistado / defendido / rival pendiente).~~

### Probar flujo completo

- Probar flujo completo en simulador iOS: registro → login → onboarding → correr → historial → ranking.
- Probar flujo completo en simulador Android.
- Probar flujo completo en dispositivo fisico.

---

## Fase 1 — MVP Validable

Objetivo: probar si la gente entiende y disfruta la mecanica de conquistar barrios corriendo. Estimacion: 2-4 semanas.

### Primera experiencia guiada

- Mostrar zona cercana real en un mini-mapa durante el onboarding paso 2 si hay permiso de ubicacion. Hace la propuesta de valor inmediata y concreta.
- Anadir indicador de progreso visible en el onboarding (punto 1/3, 2/3, 3/3).
- Explicar cuantos puntos hacen falta para conquistar la zona mas cercana antes de la primera carrera.
- Celebrar la primera carrera guardada con pantalla dedicada, no con un `Alert`.
- Celebrar la primera conquista con animacion o pantalla especial.

### Perfil

- Mostrar proximo logro no desbloqueado con barra de progreso: `[██████░░░░] 45/50 km`.
- Resumen semanal: km esta semana vs semana pasada, numero de carreras, racha actual.
- Revisar y mejorar estados de foto pendiente/rechazada. Si esta rechazada, mostrar el motivo claramente.
- Edicion de perfil mas ordenada.
- Conectar Strava cuando exista backend OAuth.

### Historial

- Vista mejorada con tarjetas navegables (toca → abre detalle de carrera).
- Filtros basicos: esta semana / este mes / todas.

### Ranking

- Evitar calculos costosos desde cliente. Preparar para mover a agregados backend.
- Revisar empty state y estados de carga.

### Correr — siguiente bloque de mejoras

- Mapa de carrera mejorado: marcador de inicio, marcador de posicion actual, zoom automatico suave sin marear, ruta mas visible.
- Explorar pausa/reanudar: definir si el tiempo pausado cuenta o no, evitar que la pausa permita manipular ritmo o puntos.
- Preparar detalle de carrera para abrirlo desde el resumen post-carrera.

### Grupos

- ~~Mostrar posicion en el ranking de grupo en la lista de grupos: implementado, cada tarjeta muestra ciudad y puesto.~~
- Mostrar historial de carreras recientes de los miembros dentro del grupo (quien corrio hoy, que conquisto).

### UX general

- Sistema visual consistente en toda la app: fondo azul noche o negro carbon, dorado solo para marca/logros, rojo para conquista, teal para rutas.
- Riesgo UX conocido: durante la carrera no se muestra aun el progreso hacia "carrera valida". Algunos usuarios terminan antes y no entienden por que no se guarda. Resuelto en Fase 0 con la barra de progreso.
- Evitar que los `Alert` sean la experiencia principal para celebraciones importantes.
- Revisar textos con acentos y tono final de producto.

### Validacion con usuarios reales

Probar con 20-50 usuarios cercanos y medir:

- Registro completado.
- Nickname completado.
- Onboarding completado.
- Primera carrera guardada.
- Primera conquista.
- Usuarios que vuelven al dia siguiente.
- Usuarios que crean o se unen a grupos.
- Carreras rechazadas o sospechosas.

Decision al final de fase:

- Si la gente no entiende la conquista → mejorar onboarding y mapa.
- Si corre una vez y no vuelve → meter retos y temporadas.
- Si usa grupos → priorizar competicion social.
- Si hay trampas → pasar antes a backend competitivo.

---

## Fase 2 — Seguridad y Backend Competitivo

Objetivo: que la competicion no dependa de que el cliente sea honesto. Estimacion: 3-6 semanas.

### Backend obligatorio en Firebase Functions

Mover a Cloud Functions todo lo que decide resultados competitivos:

- Calculo final de puntos.
- Validacion de carrera (distancia, duracion, ritmo, saltos GPS imposibles).
- Deteccion antitrampas.
- Conquista de barrios individuales.
- Actualizacion de agregados de usuario.
- Actualizacion de rankings.
- Actualizacion de grupos y aportaciones.
- Desbloqueo de logros competitivos.
- Conquistas de grupo.

La app movil envia los datos brutos de la carrera. El backend decide todo lo demas.

### Antitrampas

- Detectar ritmo demasiado rapido con criterios de backend (mas estrictos que el cliente).
- Detectar velocidad maxima por tramo GPS.
- Detectar saltos GPS imposibles entre puntos consecutivos.
- Filtrar puntos GPS de mala precision antes de usar distancia para puntos.
- Validar con rutas reales el reparto de distancia por barrio.
- Limitar puntos maximos por carrera y por dia.
- Marcar carreras como sospechosas en vez de borrarlas automaticamente.
- Crear panel admin para revisar carreras sospechosas.
- Registrar auditoria de cambios importantes.
- Definir politica de retencion de ruta GPS completa: mantener `territorioCarrera` permanente y borrar/simplificar ruta completa en produccion.

### Fix factor ritmo

- Revisar `ritmoBase = 300` (5:00 min/km) en `grupos.js:48`. Actualmente penaliza a corredores casuales de 7:00-8:00 min/km con factores de 0.67-0.77. Considerar `ritmoBase = 400` (6:40 min/km) o una curva logaritmica para una distribucion mas justa.

### Fix AsyncStorage polling

- Reducir el impacto de leer AsyncStorage cada segundo en `App.js` y `CorrerScreen.js`. Opciones: emitir un evento cuando cambia el tracking en lugar de polling, o unificar en un solo punto de lectura compartido.

### Fix busqueda de barrios

- Mejorar `calcularBarrio` con pre-filtrado por bounding box antes de calcular distancia Haversine. Reduce comparaciones de O(n) a O(k) donde k son los barrios en el area visible.

### Grupos

- Mover creacion de aportaciones a Cloud Functions.
- Mover conquistas de grupo a backend.
- Evaluar limite de grupos activos por usuario si aparecen abusos.

### Colecciones a crear

- `usuariosStats/{uid}`
- `rankingsCiudad/{ciudadId}/usuarios/{uid}`
- `rankingsGlobal/{temporadaId}/usuarios/{uid}`
- `barrios/{barrioId}/historialConquistas/{eventoId}`
- `moderacionQueue/{id}`
- `auditLogs/{id}`

---

## Fase 3 — Strava

Objetivo: usar Strava como fuente externa de rutas GPS para conquistar territorios, no como sustituto de estadisticas deportivas. Estimacion: 2-5 semanas.

### Arquitectura

- Hecho MVP: prueba real de Strava validada; `/activities/{id}/streams` devuelve `latlng` suficiente para calcular conquistas.
- Hecho MVP: OAuth de Strava en backend mediante callable Firebase. Guardar refresh tokens protegidos en backend, nunca en el cliente.
- Hecho MVP: callback HTTP de Firebase que devuelve al usuario a la app mediante deep link `conquerun://strava`.
- Hecho MVP: boton manual en Correr para importar conquistas Strava.
- Hecho MVP: importar solo actividades tipo running con `latlng` stream valido; si no hay ruta GPS suficiente, no se importa para ConqueRun.
- Hecho MVP: evitar duplicados por `externalActivityId`.
- Hecho MVP: al conectar Strava por primera vez, importar como maximo 10 carreras de los ultimos 30 dias.
- Hecho MVP: despues de la conexion inicial, importar solo actividades nuevas desde la ultima importacion.
- Pendiente produccion: sustituir el dominio tecnico de Cloud Functions por dominio propio/deep link universal.
- Pendiente produccion: cifrar tokens o moverlos a almacenamiento secreto dedicado.
- Pendiente produccion: importacion automatica mediante webhook o sincronizacion periodica con limites para no agotar la API.
- Permitir desconectar Strava.
- Borrar tokens si el usuario elimina la cuenta.

### Producto

- Boton "Importar conquistas de Strava" en Correr.
- Importar solo carreras recientes que puedan conquistar territorios.
- Mostrar badge "Verificada por Strava" en carreras importadas que hayan sido aceptadas para conquista.
- No publicar datos privados de Strava sin permiso claro.
- Usar Strava principalmente para validar ruta GPS, distancia, duracion y fecha.

### Reglas

- Solo backend puede crear carreras con `source = strava`.
- Solo backend puede asignar `verificationStatus = strava_verified`.
- El cliente nunca toca tokens de Strava.
- Las carreras Strava solo pueden conquistar si tienen `latlng`, no son manuales, no son indoor/virtual/trainer, no estan marcadas como sospechosas y pasan las mismas validaciones de ritmo/distancia que ConqueRun.
- No se importan carreras antiguas de mas de 30 dias para conquista.

---

## Fase 4 — Preparacion para App Store y Google Play

Objetivo: poder subir la app sin tropiezos de privacidad, moderacion o permisos. Estimacion: 2-4 semanas.

### Legal y privacidad

- Publicar politica de privacidad en URL publica.
- Publicar terminos de uso.
- Publicar normas de comunidad.
- Publicar URL externa de eliminacion de cuenta.
- Implementar borrado real de datos de usuario en Firestore y Storage.
- Documentar uso de Firebase, Storage, notificaciones, ubicacion y Strava.
- Preparar textos de App Privacy (iOS) y Google Data Safety (Android).

### Configuracion tecnica (ya iniciada en `app.json`)

- Completar `eas.json` con `appleId`, `ascAppId` y `appleTeamId`.
- Ejecutar `eas init` para vincular proyecto si no esta hecho.
- Registrar bundle identifier `com.conquerun.barriorun` en Apple Developer.
- Cambiar `bundleIdentifier` de `com.anonymous.conqurun` al definitivo antes del primer build de produccion.
- Revisar y eliminar permisos en `app.json` que no se usen en el codigo (Apple rechaza permisos declarados sin uso).
- Crear cuenta de servicio de Google y fichero JSON para publicacion automatica en Play Store.
- Revisar Privacy Manifest de iOS al anadir librerias nuevas.

### Cuenta y login

- Crear cuenta demo para Apple Review (sin datos reales).
- Evitar bloquear la exploracion basica antes de explicar el valor al usuario.
- Si se anade Google login en iOS, anadir tambien Sign in with Apple (Apple lo exige).

### Moderacion completa

- Moderacion automatica de imagenes antes de revision manual.
- Moderacion automatica de textos mas robusta.
- Reportar foto, carrera y texto especifico.
- Bloqueo efectivo: ocultar usuarios bloqueados en rankings, grupos e interacciones futuras.
- Panel admin para cerrar reportes.
- Auditoria de acciones admin.

### Permisos en dispositivo

- Verificar en dispositivo real que la ubicacion pide solo "mientras se usa" en el primer acceso.
- Revisar copia previa a permisos de fotos.
- Notificaciones opcionales y justificadas.
- No usar ubicacion para publicidad (declarar explicitamente en App Privacy).

---

## Fase 5 — Crecimiento

Objetivo: que ConqueRun pueda crecer por ciudades sin cargar datos manualmente. Estimacion: 4-8 semanas.

### Ciudades y barrios

- Seleccion manual de ciudad cuando no haya cobertura GPS.
- Ranking por pais.
- Optimizar ranking por ciudad con agregados backend, no escaneando carreras en cliente.
- Importacion de zonas desde fuentes abiertas (OSM).
- Herramienta admin para revisar ciudades y crear nuevas por demanda.
- Sistema para que usuarios sugieran su ciudad.
- Evolucionar de circulos MVP a poligonos, H3/S2 o tiles vectoriales.
- Cargar territorios por viewport/zoom para no saturar rendimiento.
- Preparar migracion futura a Google Maps manteniendo estilos y estado de territorios fuera del componente de mapa.

### Retencion

- Temporadas mensuales o trimestrales con ranking que se reinicia.
- Retos semanales.
- Defensa de barrios con objetivos claros.
- Resumen semanal automatico.
- Logros progresivos adicionales.
- Ligas o divisiones para que usuarios nuevos no compitan contra veteranos.

### Comunidad

- Vista detallada de grupo con miembros y estadisticas.
- Retos de grupo: semanales, por barrio, por distancia, por defensa de zonas.
- Invitaciones directas.
- Chat solo cuando la moderacion sea robusta.

---

## Fase 6 — Monetizacion

Objetivo: monetizar sin convertir la competicion en pay-to-win.

No monetizar antes de validar retencion. Primero hay que demostrar que la gente vuelve.

### Lo que NO se debe vender nunca

- Mas puntos.
- Ventaja para conquistar barrios.
- Multiplicadores competitivos.
- Puestos en ranking.
- Carreras verificadas artificialmente.

### Premium individual (3,99–5,99 EUR/mes · 29,99–49,99 EUR/año)

- Estadisticas avanzadas y comparativas mensuales.
- Mapas historicos de conquistas.
- Heatmap personal de rutas.
- Exportacion de datos.
- Objetivos personalizados.
- Historico ampliado de conquistas.
- Analisis de rendimiento por barrio.

### Premium social

- Retos y ligas privadas entre amigos.
- Temporadas de grupo.
- Escudos y colores personalizados de grupo.
- Estadisticas avanzadas de grupo y ranking interno.

### Clubes y empresas (B2B)

- Retos corporativos con ranking interno de empleados.
- Panel web e informes de participacion.
- Eventos por ciudad.

Este modelo puede ser mas rentable que la suscripcion individual si la app consigue traccion local.

### Patrocinios locales

- Retos patrocinados por tiendas de running locales.
- Descuentos por completar retos.
- Colaboraciones con gimnasios.
- Eventos de barrio.

---

## Orden de Sprints

| Sprint | Foco | Estimacion |
|---|---|---|
| **0** | Eliminar datos demo, fix errores Login, fix timezone racha, posicion propia en ranking, extraer `formatTiempo` | 1 semana |
| **1** | Barra progreso en Correr, colores territorios en Mapa, panel detalle territorio, atomicidad al guardar carrera, detalle de barrio, detalle de carrera | 2-3 semanas |
| **2** | Separar CorrerScreen, hook de tracking, unificacion visual, onboarding con mapa real, logros con barra de progreso en perfil | 2 semanas |
| **3** | Firebase Functions para carreras, backend calcula puntos y conquista barrios, Firestore mas estricto, agregados para rankings | 3-4 semanas |
| **4** | Strava OAuth backend, importacion de actividades, carreras Strava verificadas, desconexion | 2-3 semanas |
| **5** | Moderacion completa, borrado real de cuenta, politica de privacidad publica, preparacion App Store / Google Play | 2-3 semanas |
| **6** | Temporadas, retos semanales, retos de grupo, primeras pruebas de premium no competitivo | 4 semanas |

---

## Riesgos Principales

- Trampas si el calculo competitivo sigue en cliente (riesgo activo hasta Sprint 3).
- Inconsistencia de datos si el guardado de carrera falla a mitad sin atomicidad (riesgo activo hasta Sprint 1).
- Coste de Firebase si se escanean colecciones grandes desde cliente (riesgo activo en rankings y grupos).
- Rechazo en stores si privacidad, borrado o moderacion estan incompletos.
- Confusion si el usuario no entiende como se conquista un barrio (riesgo de retencion).
- Ranking global injusto si no se separa por temporada.
- Ranking por ciudad costoso si sigue calculandose desde carreras en cliente.
- Factor ritmo que penaliza a corredores casuales y desincentiva el uso de la app.
- Pay-to-win si se monetiza mal en Fase 6.
- Marca visual demasiado cercana a referencias reconocibles.

---

## North Star Metric

Usuarios que completan al menos una carrera puntuable y vuelven a intentar conquistar o defender una zona en los siguientes 7 dias.

Metricas secundarias:

- Primera carrera completada.
- Primera conquista.
- Usuarios con grupo activo.
- Retencion D1, D7 y D30.
- Carreras por usuario por semana.
- Porcentaje de carreras sospechosas.
- Porcentaje de usuarios con Strava conectado.

---

## Conclusion

La proxima gran meta no es anadir muchas pantallas. Es hacer que la experiencia principal sea clara, justa y repetible. El Sprint 0 elimina la deuda visible. Los Sprints 1 y 2 cierran el core para que sea testeable con usuarios reales. El Sprint 3 mueve la logica competitiva al backend para que la competicion sea honesta. Solo entonces tiene sentido abrir a mas usuarios, integrar Strava y preparar las tiendas.

La monetizacion debe llegar cuando haya retencion real y siempre evitando ventajas competitivas de pago.

---

## Escalado Global

Principio: no expandir antes de validar retencion en el mercado actual. Expandir sin retencion es quemar dinero y tiempo.

**Trigger para cada fase: 500-1000 usuarios activos mensuales en la fase anterior.**

---

### Fase E1 — Espana completa (estado actual)

- 52 ciudades espanolas configuradas con territorios reales via Overpass API.
- Objetivo: validar el producto con usuarios reales en Espana.
- Metricas a vigilar antes de pasar a E2: retencion D7 > 20%, al menos una carrera por semana por usuario activo.

---

### Fase E2 — Latinoamerica (sin cambios de idioma)

**Por que antes que el ingles:** mismo idioma, coste cero de traduccion, mercado de 400M de hispanohablantes.

**Ciudades objetivo:**
- Mexico: Ciudad de Mexico, Monterrey, Guadalajara
- Argentina: Buenos Aires, Cordoba, Rosario
- Colombia: Bogota, Medellin, Cali
- Chile: Santiago, Valparaiso
- Peru: Lima
- Uruguay: Montevideo

**Tecnico:**
- El script `scripts/cargarCiudadesMundo.js` ya esta preparado. Solo hay que ejecutarlo por ciudad.
- Los IDs ya siguen el patron `{paisCodigo}-{slug}` (ej: `mx-ciudad-de-mexico`).
- Overpass API busca `admin_level` correcto por pais con fallback a `place=neighbourhood`.
- Tiempo estimado para cargar 15 ciudades: 1-2 horas de ejecucion de scripts.

**Producto:**
- Anadir ciudades LATAM al selector de ciudad en `CiudadScreen`.
- Ranking por pais (nuevo segmento junto al ranking por ciudad).
- Adaptar referencias culturales del onboarding si es necesario (los "barrios" en LATAM pueden llamarse "colonias" en Mexico o "comunas" en Chile — considerar mostrar el nombre local).

---

### Fase E3 — Europa e ingles

**Internacionalizacion tecnica (i18n):**

La app tiene aproximadamente 250-300 strings hardcodeados en espanol distribuidos por todas las pantallas. Internacionalizar es un sprint completo de 2-3 semanas.

Pasos tecnicos:
1. Instalar `react-i18next` + `i18next`.
2. Extraer todos los strings a ficheros de traduccion `locales/es.json` y `locales/en.json`.
3. Configurar deteccion automatica de idioma segun `Localization.locale` del dispositivo.
4. Traducir textos al ingles (puede hacerse con ayuda de IA + revision nativa).
5. Gestionar pluralizacion: espanol e ingles tienen reglas distintas (`1 barrio` / `2 barrios` vs `1 territory` / `2 territories`).
6. Traducir fichas de App Store y Google Play al ingles.
7. Traducir documentos legales (terminos y privacidad).

**Lo que NO cambia:**
- La logica de puntos, conquistas y rankings es idioma-agnostica.
- Firestore almacena datos en espanol solo donde el usuario los introduce (nickname, nombre de grupo). El resto es estructural.
- Los nombres de ciudades y barrios vienen de OpenStreetMap en el idioma local — correcto por defecto.

**Ciudades europeas objetivo:**
- UK: Londres, Manchester, Birmingham
- Francia: Paris, Lyon, Marsella
- Alemania: Berlin, Munich, Hamburg
- Italia: Roma, Milan
- Portugal: Lisboa, Oporto
- Paises Bajos: Amsterdam

**Tecnico adicional:**
- Revisar que los nombres de territorios OSM en cada pais sean legibles (pueden estar en otro alfabeto).
- Anadir soporte RTL si se contempla arabe o hebreo en el futuro (cambio de arquitectura de UI importante, mejor planificarlo desde el principio si hay intencion).

---

### Fase E4 — Expansion mundial

**Mercados objetivo:**
- EEUU: Nueva York, Los Angeles, Chicago, Miami (competencia alta pero mercado enorme)
- Brasil: Sao Paulo, Rio de Janeiro (requiere portugues — tercer idioma)
- Asia: Tokio, Singapur, Seoul (mercados de running muy activos)
- Oriente Medio: Dubai (running popular, poder adquisitivo alto)
- Australia: Sydney, Melbourne

**Idiomas adicionales:** portugues (Brasil), japones, coreano, arabe (RTL).

**Infraestructura:**
- Evaluar Firestore multi-region si hay latencia notable desde Asia.
- CDN para assets y mapas.
- Soporte de monedas locales para monetizacion.
- App Store localizada en cada mercado.

---

### Consideraciones tecnicas transversales para escalado

**Rendimiento con muchos territorios:**
- El sistema actual carga todos los territorios de la ciudad activa. Con ciudades grandes (Londres, NYC) puede haber 500-800 territorios.
- Implementar carga por viewport/zoom antes de lanzar ciudades grandes (ya en Fase 5 del roadmap principal).
- Indexar territorios por geohash para queries eficientes.

**Costes Firestore a escala:**
- 1.000 usuarios activos x 3 carreras/semana x 10 lecturas/carrera = 30.000 lecturas/dia. Asumible.
- 10.000 usuarios: 300.000 lecturas/dia (~9M/mes) = ~$2-5/mes. Todavia barato.
- 100.000 usuarios: mover rankings y agregados a Cloud Functions con escrituras batch para evitar hotspots.

**Ciudades por demanda:**
- Crear sistema para que usuarios sugieran su ciudad (formulario simple → notificacion al admin).
- Herramienta admin para cargar una ciudad nueva desde el panel sin tocar codigo.
- Priorizar ciudades con mayor demanda medida (lista de espera).

---

### Orden recomendado

| Cuando | Fase | Trigger |
|---|---|---|
| Ahora | E1 — Espana | App en tiendas, primeros usuarios |
| ~500 usuarios activos | E2 — LATAM | Retencion D7 validada |
| ~2.000 usuarios activos | E3 — Europa + ingles | Traccion fuera de Espana |
| ~10.000 usuarios activos | E4 — Mundial | Modelo de negocio probado |

**Regla de oro:** cada expansion geografica debe ir acompanada de un plan de adquisicion local (running clubs, influencers de running, redes sociales locales). Sin distribucion local, los territorios nuevos quedan vacios y la experiencia pierde sentido.
