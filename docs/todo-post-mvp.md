# TODO Post MVP

Ideas buenas para implementar cuando ConqueRun pase revisión de App Store / Google Play y el MVP esté validado con usuarios reales.

## Antes de Publicar en Stores

- Publicar una política de privacidad real en una URL pública, no PDF.
- Publicar una URL externa para solicitar eliminación de cuenta y datos.
- Completar los textos legales de privacidad, términos y contacto de soporte.
- Crear una cuenta demo para revisión de Apple con datos de prueba.
- Activar Sign in with Apple si se añade Google login en iOS.
- Revisar que los permisos de ubicación sean solo "while in use".
- Desplegar `firestore.rules` y `storage.rules` en Firebase antes de pruebas cerradas.
- Crear reglas de Storage más estrictas para fotos de grupo cuando exista backend.
- Preparar ficha de Data Safety en Google Play con ubicación, fotos, email, actividad deportiva y notificaciones.
- Preparar App Privacy en App Store Connect con ubicación, identificadores, contenido de usuario y actividad fitness.

## Backend y Seguridad

- Mover cálculo final de puntos a Firebase Functions.
- Mover conquista de barrios a backend para evitar manipulación desde cliente.
- Mover validación anti-trampas a backend.
- Crear job definitivo para eliminar cuenta y todos los datos asociados.
- Crear cola de moderación automática de imágenes antes de la revisión manual.
- Crear moderación automática de textos para nicknames, grupos y descripciones.
- Añadir auditoría de acciones admin: aprobar fotos, rechazar fotos, cerrar reportes.
- Añadir índices de Firestore para rankings, historial y búsquedas de grupos.
- Añadir rate limiting para reportes, creación de grupos y cambios de perfil.

## Strava

- Hecho MVP: prueba real con GPS validada; Strava devuelve `latlng` en `/activities/{id}/streams`.
- Hecho MVP: OAuth de Strava en backend, nunca en la app móvil.
- Hecho MVP: refresh token automático.
- Hecho MVP: importacion manual desde pantalla Correr.
- Hecho MVP: callback de Firebase + deep link para que el usuario vuelva automaticamente a ConqueRun sin copiar codigos.
- Hecho MVP: importar solo actividades tipo running con `latlng` stream valido para conquista.
- Hecho MVP: al conectar Strava por primera vez, importar maximo 10 carreras de los ultimos 30 dias.
- Hecho MVP: despues de conectar, importar solo actividades nuevas desde la ultima importacion.
- Hecho MVP: no importar carreras Strava solo para estadisticas; si no pueden conquistar, se ignoran.
- Hecho MVP: evitar duplicados por `externalActivityId`.
- Hecho MVP: marcar actividades importadas como `strava_verified`.
- Sustituir el dominio tecnico de callback OAuth de Strava por dominio propio/deep link universal antes de producción.
- Guardar tokens de Strava cifrados o protegidos en almacenamiento dedicado antes de producción.
- Añadir importacion automatica mediante webhook o sincronizacion programada con limites.
- Mostrar "View on Strava" solo cuando esté permitido.
- Revisar cumplimiento de Strava API Agreement antes de mostrar datos de actividad a otros usuarios.
- Añadir desconexión de Strava y eliminación de tokens.

## Antitrampas

- Detectar velocidades máximas por tramo GPS.
- Detectar saltos imposibles de ubicación.
- Usar precisión GPS para descartar puntos malos.
- Exigir distancia mínima y duración mínima para puntuar.
- Marcar carreras sospechosas en vez de borrarlas automáticamente.
- Crear revisión admin para carreras sospechosas.
- Penalizar o limitar cuentas con muchas carreras sospechosas.
- Comparar carreras de ConqueRun con Strava cuando el usuario tenga Strava conectado.

## Producto

- Cargar nuevas ciudades por país con el modelo `ciudades` + `barrios`.
- Crear pantalla para seleccionar ciudad cuando el usuario esté fuera de cobertura.
- Añadir ranking por ciudad y ranking global.
- Añadir ranking por país.
- Importar zonas desde fuentes geográficas abiertas en backend, no mantenerlas a mano.
- Historial detallado de carrera con mapa de ruta.
- Página de detalle de barrio con dueño, puntuación y últimas conquistas.
- Vista de grupo con miembros, estadísticas y barrios conquistados.
- Retos semanales y mensuales.
- Eventos y salidas organizadas.
- Chat de grupo, solo después de tener moderación y bloqueo robustos.
- Notificaciones cuando pierdes un barrio.
- Notificaciones de logros desbloqueados.
- Ranking por ciudad, país y global.
- Temporadas para reiniciar rankings sin perder histórico.
- Sistema de ligas o divisiones para usuarios nuevos.

## Comunidad y Moderación

- Bloqueo completo: ocultar usuario bloqueado en rankings, grupos y futuras interacciones.
- Reportar carrera sospechosa.
- Reportar grupo, usuario, foto y texto específico.
- Panel admin para cerrar reportes.
- Motivos de rechazo visibles para el usuario cuando una foto no se aprueba.
- Apelación simple para fotos o carreras rechazadas.
- Normas de comunidad dentro de la app.

## Monetización Futura

- No monetizar antes de validar retención.
- Explorar suscripción premium solo para funciones no competitivas.
- Evitar pay-to-win en puntos, barrios o rankings.
- Posibles extras premium: estadísticas avanzadas, histórico ampliado, exportaciones, personalización visual.

## Analítica

- Medir activación: registro, nickname, primera carrera, primer barrio.
- Medir retención D1, D7, D30.
- Medir porcentaje de carreras rechazadas o sospechosas.
- Medir uso de grupos.
- Medir conversión de usuarios con Strava conectado.
- Añadir crash reporting antes de beta cerrada.
- Post-lanzamiento real: monitorizar errores de App Check, deep links de Strava, coste de Maps/Firestore/Functions, carreras no guardadas y discrepancias entre perfil, ranking y mapa.
- Post-lanzamiento real: validar que el prompt nativo de reseñas respeta cadencia, no aparece demasiado pronto y que el boton manual abre la ficha correcta en App Store y Google Play.
