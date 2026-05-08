# ConqueRun: Documento de Producto

Revision: 2026-05-03

## Resumen

ConqueRun es una app movil de running competitiva y territorial. La idea principal es sencilla: no solo sales a correr, tambien conquistas zonas reales del mapa.

Cada ciudad se divide en territorios ConqueRun con nombres reconocibles: barrios, distritos, zonas populares o areas locales que la gente entiende. Cuando un usuario graba una carrera, la app calcula distancia, tiempo, ritmo medio y puntos. Cada metro suma al territorio donde se ha corrido.

La base tecnica debe poder cubrir el mundo entero con una malla global, pero la experiencia visible no debe mostrar numeros frios. El usuario debe ver nombres como Chamberi, Amara, Gros, Malasaña o Retiro cuando existan datos fiables.

El objetivo final es que ConqueRun pueda funcionar a escala mundial: corredores de distintas ciudades y paises compitiendo por territorios reales, rankings locales/globales, grupos y temporadas.

## Propuesta De Valor

ConqueRun convierte una carrera normal en una accion dentro de un mapa competitivo.

El usuario no corre solo para ver kilometros. Corre para:

- Ganar puntos.
- Conquistar zonas.
- Defender territorios.
- Competir con otros corredores.
- Subir en rankings.
- Jugar en grupo.
- Sentir progreso en su ciudad y, en el futuro, en cualquier ciudad del mundo.

## Bucle Principal

1. El usuario se registra.
2. Elige nickname y pais.
3. Ve el onboarding inicial.
4. Sale a correr desde la pantalla Correr.
5. La app graba ruta, distancia, tiempo y ritmo medio.
6. Al terminar, la carrera genera puntos.
7. Con esos puntos puede conquistar o defender zonas.
8. El usuario ve resumen, historial, perfil, mapa y rankings.
9. Vuelve para recuperar, defender o ampliar territorio.

## Pantallas Principales

### Login

Pantalla de acceso con identidad visual de mapa y bandera. Permite registro/login por email y password. La sesion puede mantenerse iniciada y la app puede usar Face ID para desbloquear una sesion guardada.

### Onboarding

Tutorial inicial de tres pasos. Se muestra solo tras una alta nueva, no cada vez que el usuario entra.

### Nickname

Pantalla donde el usuario define su nickname. El pais se usa como parte de identidad visual del usuario, especialmente con bandera junto al nickname.

### Perfil

Muestra foto de perfil si existe, nickname con bandera de pais, estadisticas, barrios conquistados, logros y grupos. La edad y pais no se muestran como datos de perfil publicos, aunque la fecha de nacimiento puede guardarse para usos futuros de caracteristicas particulares.

Orden de la pantalla:

- Cabecera de usuario.
- Mis estadisticas.
- Barrios conquistados, con banderita roja como señal visual.
- Logros.
- Mis grupos.
- Privacidad y seguridad.

Mis estadisticas debe centrarse en datos utiles hoy: carreras, kilometros, tiempo total y ritmo medio. Strava no debe mostrarse como estadistica hasta que exista integracion real de OAuth/importacion/verificacion.

### Correr

Pantalla para grabar carreras. Incluye:

- Ubicacion en mapa.
- Ruta de carrera.
- Distancia.
- Tiempo.
- Ritmo medio.
- Start ConqueR.
- Pausar/Reanudar.
- Terminar carrera.
- Tracking con pantalla apagada si el usuario concede permiso.
- Fallback con app abierta si no concede permiso de segundo plano.
- Recuperacion de carrera en curso si el usuario vuelve a la pantalla.
- Resumen post-carrera dentro de la propia pantalla.

### Mapa

Muestra territorios ConqueRun de la ciudad con nombres reconocibles. Los colores indican si una zona esta libre, es del usuario o pertenece a otro corredor. Al tocar un territorio, el usuario ve su nombre, estado, marca actual y una explicacion corta de que cada metro dentro de esa zona suma contra ese territorio.

El mapa debe actuar como tablero del juego. La separacion de territorios tiene que estar visible, pero con densidad controlada: a zoom lejano se pueden ocultar etiquetas, y a zoom cercano se muestran nombres reconocibles.

Regla de producto:

- El usuario ve lugares conocidos.
- La app calcula con territorios normalizados.
- Si existen barrios reales fiables, se usan como nombre/capa de identidad.
- Si no existen, se usan nombres humanos generados por zona, nunca IDs tecnicos visibles.

La implementacion actual usa `react-native-maps`, pero la arquitectura debe permitir migrar a Google Maps con poligonos, celdas o tiles vectoriales. La logica de estado/color/nombre del territorio no debe depender del proveedor de mapa.

### Historial

Lista las carreras del usuario con distancia, ritmo, puntos y estado. Actualmente existe un boton temporal de demo para cargar carreras de Madrid y validar UI; debe retirarse antes de beta publica.

### Ranking

Muestra rankings globales, por ciudad y por grupos. Actualmente parte del calculo sigue en cliente y debe migrarse a backend para escala mundial.

### Grupos

Permite crear grupos publicos o privados, unirse por codigo, explorar grupos y competir socialmente. Los grupos no deben ser indispensables para competir: el usuario siempre conserva su carrera y sus puntos individuales, y ademas esa misma carrera aporta puntos a todos sus grupos.

### Moderacion

Pantalla admin inicial para revisar fotos y contenido reportado.

## Como Funciona Una Carrera

Una carrera empieza al pulsar Start ConqueR.

La app:

- Pide permiso de ubicacion en primer plano.
- Intenta pedir permiso de ubicacion en segundo plano.
- Si hay permiso de segundo plano, puede grabar con pantalla apagada.
- Si no hay permiso de segundo plano, permite correr igualmente con la app abierta.
- Muestra estado de grabacion:
  - Preparando GPS.
  - Grabando con pantalla apagada.
  - Grabando solo con la app abierta.
  - Carrera pausada.

Durante una carrera, el usuario puede:

- Pausar.
- Reanudar.
- Terminar.

Al pausar:

- No suma tiempo.
- No suma distancia.
- Se evita sumar el salto entre el punto anterior a la pausa y el primer punto tras reanudar.

Al terminar:

- Se confirma la accion.
- Si la carrera cumple condiciones, se guarda.
- Si no cumple condiciones, se descarta y se explica el motivo.
- Si no hay conexion o falla Firestore, no se guarda la carrera y se muestra error.

## Condiciones Para Que Una Carrera Sea Valida

Actualmente una carrera debe cumplir:

- Distancia minima: 200 metros.
- Duracion minima: 60 segundos.
- Ritmo minimo valido: 2:30 min/km.
- Ritmo maximo valido: 20:00 min/km.

Si no cumple estas condiciones, la carrera puede terminarse, pero no se guarda.

## Filtro Basico De GPS

Para evitar errores graves de ubicacion:

- No cuentan para distancia los puntos con precision peor de 50 metros.
- No cuentan saltos que implican velocidad superior a 7 m/s, aproximadamente 25 km/h.
- Tras pausar y reanudar, el primer punto del nuevo tramo no se une al tramo anterior.

La ruta puede seguir existiendo visualmente, pero la distancia y los puntos se calculan con distancia filtrada.

## Sistema De Puntuacion

Los puntos individuales se calculan con esta formula:

```text
puntos_personales = km * factor_ritmo * multiplicador_logros * 1000
```

Los grupos no multiplican el ranking individual. Esto protege al corredor que prefiere competir solo.

### Kilometros

Se usa la distancia filtrada de la carrera, convertida a kilometros.

### Factor De Ritmo

El ritmo base es 5:00 min/km.

```text
factor_ritmo = 1 + (ritmo_base - ritmo_medio) / 300
```

Despues se limita entre:

- minimo: 0.5
- maximo: 2.0

Esto significa:

- correr mas rapido que 5:00 min/km da mas puntos;
- correr mas lento da menos puntos;
- hay limites para evitar resultados extremos.

### Aportacion A Grupos

Cuando una carrera se guarda, sus puntos personales tambien se suman a todos los grupos del usuario mediante aportaciones separadas.

Cada aportacion de grupo se calcula asi:

```text
puntos_grupo = puntos_personales * multiplicador_grupo
```

Reglas del multiplicador:

- 1 miembro: x1.00.
- 2 miembros: x1.02.
- 5 miembros: x1.05.
- 10 miembros o mas: x1.10 maximo.

El multiplicador se calcula una vez por grupo y no se encadena entre grupos. Si un usuario pertenece a varios grupos, la carrera aporta a todos, pero siempre partiendo de los mismos puntos personales.

Cada aportacion guarda snapshot de:

- Carrera.
- Usuario.
- Grupo.
- Puntos personales usados como base.
- Multiplicador del grupo.
- Puntos aportados al grupo.
- Numero de miembros del grupo en ese momento.

Esto permite historico estable: si el grupo cambia de tamano despues, las carreras antiguas no se recalculan.

### Multiplicador De Logros

Los logros desbloquean multiplicadores permanentes. El multiplicador final se calcula combinando los logros del usuario.

Regla actual: una carrera usa los logros que el usuario ya tenia desbloqueados antes de guardar esa carrera. Si esa carrera desbloquea nuevos logros, esos multiplicadores empiezan a afectar en futuras carreras, no recalculan retroactivamente la carrera que acaba de terminar.

Ejemplos de logros:

- Kilometros acumulados.
- Barrios conquistados.
- Rachas.

## Conquista De Zonas

Cada zona o barrio tiene:

- Nombre.
- Tipo visible: barrio, distrito, zona, parque, ribera, campus u otro nombre local.
- Ciudad.
- Pais.
- Coordenadas.
- Radio.
- Dueño actual.
- Puntos del dueño.

Una zona se conquista por distancia/puntos recorridos dentro de esa zona, no solo por tocarla.

La app divide la ruta en tramos entre puntos GPS. Cada tramo se asigna al barrio donde cae el punto medio del tramo, con fallback al punto final o inicial si hace falta. Despues se acumulan metros por barrio.

Los puntos de barrio se calculan proporcionalmente:

```text
puntos_barrio = puntos_personales * (distancia_en_barrio / distancia_total_carrera)
```

Ejemplo: si una carrera vale 1.000 puntos y el 40% de la distancia ocurre dentro de Malasaña, esa carrera ataca Malasaña con 400 puntos.

Casos:

- Zona libre: puede pasar a ser del corredor.
- Zona propia: se considera defendida.
- Zona de otro corredor: se conquista si los puntos generados dentro de esa zona superan los puntos del dueño.
- Zona rival con mas puntos: queda como rival pendiente.

Cuando un usuario pierde una zona, puede recibir una notificacion push.

Persistencia recomendada:

- MVP: se conserva la ruta GPS completa para depuracion, mapa e historial.
- Produccion: conservar permanentemente `territorioCarrera` y borrar o simplificar la ruta GPS completa tras una ventana limitada.
- `territorioCarrera` guarda barrio, metros, proporcion y puntos generados en cada barrio.

## Resumen Post-Carrera

Tras una carrera valida, ConqueRun muestra un resumen dentro de Correr.

El resumen incluye:

- Distancia.
- Tiempo.
- Ritmo medio.
- Puntos.
- Aportacion a grupos.
- Zonas conquistadas.
- Zonas defendidas.
- Rivales pendientes.
- Logros desbloqueados si los hay.

Actualmente existe un bloque temporal "Formato territorial demo" para validar el diseño cuando no hay datos reales suficientes. Debe eliminarse antes de beta publica.

## Rankings

La app contempla:

- Ranking global.
- Ranking por ciudad.
- Ranking de grupos.

Actualmente algunos rankings dependen de lecturas y calculos desde cliente. Para escala mundial, los rankings deben pasar a agregados backend.

## Grupos

Los grupos permiten competir de forma social.

Tipos:

- Publicos: visibles para otros usuarios.
- Privados: acceso por codigo.

Funciones actuales:

- Crear grupo.
- Unirse por codigo.
- Explorar grupos publicos.
- Foto de grupo pendiente de moderacion.
- Ranking de grupos.
- Sumar aportaciones de carrera a todos los grupos del usuario.
- Ranking de grupos por puntos acumulados totales.

Regla de competicion:

- Competicion individual: puntos personales y conquistas del usuario.
- Competicion de grupo: aportaciones acumuladas y conquistas propias del grupo.

Riesgo futuro:

- Si un usuario pertenece a demasiados grupos, una sola carrera puede tener demasiada presencia en rankings de grupo. Por ahora se acepta porque el producto quiere aportar a todos los grupos, pero puede requerir limite de grupos activos, temporadas o ventanas semanales.

## Logros

Los logros refuerzan el progreso a largo plazo.

Ejemplos:

- Primeros kilometros.
- Alcanzar 50, 100, 500 o 1000 km.
- Conquistar varias zonas.
- Mantener rachas.

Los logros son permanentes y pueden aumentar el multiplicador de puntos.

En Perfil deben explicarse brevemente para que el usuario entienda que sirven para progresion permanente y para mejorar el multiplicador de conquista. La tipografia debe mantenerse legible tambien en logros bloqueados; el estado bloqueado se comunica con icono/caja, no apagando el texto hasta hacerlo ilegible.

## Moderacion Y Seguridad

La app incluye:

- Moderacion inicial de fotos.
- Reportes de usuarios y grupos.
- Bloqueo basico de usuarios.
- Reglas de Firestore y Storage.

Pendiente importante:

- Moderacion automatica.
- Auditoria admin.
- Backend competitivo.
- Validacion antitrampas fuerte.

## Privacidad Y Permisos

Permisos usados:

- Ubicacion: para grabar carreras, medir distancia y conquistar zonas.
- Ubicacion en segundo plano: opcional para grabar con pantalla apagada.
- Fotos: para foto de perfil o grupo.
- Notificaciones: para avisos como perdida de zonas.
- Face ID: para desbloquear sesion guardada.

La ubicacion no debe usarse para publicidad.

## Estado Tecnico Actual

Stack:

- Expo.
- React Native.
- Firebase Auth.
- Firestore.
- Firebase Storage.
- Expo Notifications.
- React Navigation.
- React Native Maps.

Colecciones principales:

- `usuarios`
- `carreras`
- `ciudades`
- `territorios`
- `barrios`
- `grupos`
- `aportacionesGrupo`
- `conquistasGrupo`
- `reportes`

`territorios` es la coleccion preferente para el juego territorial. `barrios` queda como compatibilidad/fallback mientras se migra el modelo. Un territorio tiene nombre visible humano, tipo, ciudad, pais, centro/radio o futura geometria, dueño y puntos del dueño.

## Limitaciones Actuales

Estas limitaciones son importantes para entender el estado real de la app:

- El cliente aun calcula puntos.
- El cliente aun aplica conquistas.
- El cliente aun actualiza estadisticas de usuario.
- El cliente aun crea aportaciones de grupo y actualiza totales de grupo.
- Las conquistas de grupo estan preparadas, pero la limpieza perfecta del grupo anterior debe moverse a backend para evitar escrituras de cliente sobre grupos donde el usuario no pertenece.
- Si falla la conexion al guardar, la carrera no se guarda.
- El filtro GPS es basico y debe probarse en dispositivo real.
- El tracking con pantalla apagada requiere build nativa y permisos reales.
- Hay elementos temporales de demo que deben retirarse.
- Strava esta preparado a nivel de modelo, pero falta OAuth/backend. Hasta que exista integracion real no debe aparecer como metrica destacada en Perfil.

## Vision Mundial

Para que ConqueRun sea mundial, debe evolucionar hacia:

- Backend que valide todas las carreras.
- Rankings agregados por ciudad, pais y global.
- Soporte de muchas ciudades y territorios reconocibles cargados desde fuentes abiertas.
- Sistema antifraude robusto.
- Privacidad y permisos impecables para App Store y Google Play.
- Retos, temporadas y grupos con reglas justas.
- Strava como fuente de verificacion adicional.

## Arquitectura Recomendada Para Backend

El modelo preparado para escala mundial separa tres conceptos:

- `carreras`: fuente individual de verdad.
- `aportacionesGrupo`: historico de cuanto aporta una carrera a cada grupo.
- `grupos`: agregado rapido para ranking por `puntosTotales`.

Flujo ideal con Cloud Functions:

1. El cliente guarda una carrera o solicita guardarla.
2. Backend valida distancia, duracion, ritmo, GPS y usuario.
3. Backend calcula `puntos_personales`.
4. Backend lee los grupos actuales del usuario.
5. Backend crea una aportacion por grupo.
6. Backend incrementa `grupos.puntosTotales`, `carrerasTotales` y `distanciaTotal`.
7. Backend actualiza conquistas individuales y conquistas de grupo.

Ventaja: abrir ranking de grupos solo requiere ordenar `grupos` por `puntosTotales`, sin recalcular miles o millones de carreras.

La vision final es que cualquier corredor pueda abrir ConqueRun en su ciudad, correr, ganar puntos y competir por territorio real con reglas comprensibles y justas.
