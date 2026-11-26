# Pendientes — ConqueRun

Última actualización: **22 noviembre 2026**.
Documento de traspaso: lo que queda, por orden de lo que haría primero.

---

## ▶️ Próxima sesión: empezar por aquí

**Tablero de seguimiento:** el artefacto "Pasos de ConqueRun" (claude.ai, privado) tiene todas las tareas con casillas. Claude lo lee y lo actualiza en cada sesión.

### Dónde lo dejamos (25 nov)
- **Apple:** iOS 1.1.3 aprobada y publicada. Build 1.1.4 (43) subida a TestFlight; Miguel tiene que crear la versión 1.1.4 y mandarla a revisión. El aviso ITMS-90725 (SDK de iOS 27) no bloquea; plazo abril 2027.
- **Google:** Android 1.1.3 aprobada en Alpha. **Acceso a producción solicitado el 25 nov** con las respuestas de [play-acceso-produccion.md](play-acceso-produccion.md). Android 1.1.4 (versionCode 31) subida a Alpha automáticamente. Cuando aprueben producción: Alpha → Promocionar versión → Producción.
- **Marketing:** plan, guiones R1-R8 y kit de IA en [marketing.md](marketing.md). Vídeo del mapa sobre la app real hecho: `marketing/mapas/conquista-madrid-real.mp4` (fuera de git). Descubierta la carpeta `~/Documents/ConqueRun-Marketing` con el runbook, el plan de Instagram y los posts: hay que unificar todo allí.

### 1. Al empezar
- [x] **Google aprobó el acceso a producción el 26 nov.**
- [ ] **Terminar la versión de producción en Play Console** (borrador empezado el 26 nov con la 1.1.4 (31) añadida): pegar las notas de la versión entre `<es-ES>` y `</es-ES>`, Siguiente, revisar países (los 178 de Alpha) y despliegue al 100 %, enviar a revisión. Notas: "Primera versión pública de ConqueRun: conquista los barrios de tu ciudad corriendo, compite en el ranking y forma grupos con tus amigos. Ahora también puedes importar tus carreras de Strava."
- [ ] En cuanto esté publicada: formulario de Strava Extended Access (urgente: 6/10 atletas) y añadir Android a la bio de Instagram.
- [ ] ¿Ha mandado Miguel la iOS 1.1.4 a revisión? ¿Aprobada? ¿Y la Android 1.1.4 en Alpha?
- [ ] ¿Cambió la dirección del perfil de pagos de Google?

### 2. Siguiente trabajo con Claude
- [ ] **Unificar el marketing** en `~/Documents/ConqueRun-Marketing` (plan de hoy + runbook + plan de Instagram) y dejar aquí solo un enlace.
- [ ] **Strava Extended Access** en cuanto la 1.1.4 esté publicada (6/10 atletas). Claude prepara las respuestas en inglés.
- [ ] **Montar R1 y R2** cuando Miguel tenga los planos grabados y la voz de ElevenLabs.
- [ ] **Embudo en Analytics** (condición para pagar anuncios).

### 3. Cosas de Miguel
- [ ] Mandar la iOS 1.1.4 a revisión (novedades: "Ahora puedes conectar tu cuenta de Strava con el botón oficial. Mejoras de estabilidad.").
- [ ] Datos de contacto DSA en Apple → Lope de Haro 23 + conquerunapp@gmail.com.
- [ ] Tarjeta para renovar Apple Developer.
- [ ] Quitar China continental (antes del 31 ene 2027).
- [ ] Grabar los planos A1-A12 en 2-3 carreras, crear cuenta de ElevenLabs, bio de Instagram, decidir los 5 posts de `por-publicar/`.
- [ ] Probar en el móvil: carrera completa (para mergear `fix/bugs-performance`), ojo de la contraseña, aviso al salir en Android.

### 4. Plazos
- 15 ene 2027: clasificación por edades de Apple · 31 ene: China · feb 2027: estado de operador en Google · abr 2027: SDK de iOS 27 (hacerlo en ene-feb).

### 5. Sin fecha
- Hallazgo 6 de la auditoría · registro Art. 30 · probar el email de denuncias · 17 scripts sueltos en `scripts/`.

### Simulador de iOS en el Mac
Xcode 27 sustituye la app Simulator por **Device Hub** (Xcode → Open Developer Tool → Device Hub), y `npx expo run:ios` falla porque busca la app antigua. La app de desarrollo ya está instalada en el iPhone 17 Pro (iOS 26.5): basta con arrancar el simulador en Device Hub, ejecutar `npx expo start --dev-client` y abrir ConqueRun. Si hay que recompilar: `npx expo prebuild -p ios --clean` y `xcodebuild` contra `ios/ConqueRun.xcworkspace`; luego `xcrun simctl install`. **Usa la base de datos de producción.**

---

## Hecho el 22 nov

- Functions desplegadas: `eliminarCuenta` borra también `solicitudesEliminacion`, y `notificarFotoGrupoRechazada` (nueva) avisa al creador cuando se retira la foto del grupo.
- Android 1.1.3 (versionCode 30) en Alpha; la 1.1.2 quedó aprobada el 21 nov.
- iOS 1.1.3 (build 42) en App Store Connect, probada en TestFlight y enviada a revisión. Para subirla hubo que firmar el acuerdo de apps gratuitas, que estaba caducado.
- 1.1.3: botón de ver contraseña y confirmación al salir con carrera activa.
- 1.1.4 preparada en `main`: botón oficial "Connect with Strava" y logo "Powered by Strava".
- Plugin de Expo: deployment target mínimo de los pods a 15.1, que Xcode 27 exige.

---

## Hecho el 21 nov

- Email de reportes activo: `GMAIL_PASS` (versión 2) en Secret Manager; `GMAIL_USER` y `ADMIN_EMAIL` en `functions/.env.conquerrun-8d30e`. `notificarReporte` redesplegada. Falta ver llegar un aviso real.
- 1.1.2 (versionCode 29) subida a Alpha y en revisión: scope de Strava `activity:read_all` y exportación GDPR por enlace. La privacidad ya no dice que Strava esté desactivado.
- Subida automática a Google Play: cuenta de servicio `eas-play-submit`, que solo puede publicar en canales de prueba. Se quitó a `firebase-adminsdk-fbsvc` de Play Console, que tenía permiso de producción en toda la cuenta.
- Play Console confirma los requisitos de producción: 12+ testers y 14 días.

## Hecho el 15 nov

- `d27c0c3` (cambios de la auditoría) pusheado a `origin/main`. Ya no hay nada desplegado sin estar en git.
- GitHub Pages publicado tras cancelar el build atascado `43096154272`: `normas-comunidad.html` da 200 y `terminos.html` dice 14 años.
- `scripts/limpiarCamposSensiblesPublicos.mjs` ejecutado: 45 docs limpiados en `usuariosPublicos` y 44 en `rankingsCiudad`; la simulación posterior da 0 pendientes. La segmentación no se ve afectada: vive en `usuarios/{uid}` (privado) y `segmentoCompetitivo` se mantiene en `rankingsCiudad`.
- `feature/decay-notifications` estaba ya mergeada en `main` (`aplicarDecayTerritorial`, `functions/index.js:3642`) y desplegada con las 23 functions del 11 nov.

### Ramas mergeadas en `main` que se pueden borrar

`docs/cumplimiento-legal`, `feature/decay-notifications`, `feature/reactivar-strava`, `feature/resumen-carrera-bloqueo`, `fix/cumplimiento-auditoria`, `fix/modal-info-android`.

Solo queda viva `fix/bugs-performance` (1 commit).

### Strava: activo

Reactivado en la 1.1.0 (`feature/reactivar-strava`) y funcionando con pocos usuarios. La documentación anterior lo daba aún como desactivado.

- Sigue en **Standard Tier, límite 10 atletas**. Pedir Extended Access en strava.com/settings/api antes de que se llene y, en cualquier caso, antes de cualquier campaña.

---

## Pendiente inmediato

### 1. Acceso a producción en Android

Cuando Google apruebe la 1.1.2 en Alpha: Play Console → Panel → Solicitar acceso a producción. Si lo aprueba, promocionar la versión de Alpha a Producción.

Respuestas preparadas en [play-acceso-produccion.md](play-acceso-produccion.md). Las de Testers Community afirmaban cambios que no existían; no usarlas.

### 2. iOS 1.1.2

Build y envío a App Store para que la exportación GDPR por enlace y el nuevo scope de Strava lleguen a iOS.

### 3. Estado de operador en Play Console (antes de febrero 2027)

La dirección del perfil de pagos de Google no coincidía con la de los textos legales. Se ha pedido cambiarla a la de los textos legales. Cuando aparezca, declarar como operador con `conquerunapp@gmail.com`. No declarar antes: Google publicaría la dirección del perfil de pagos.

---

## Pendiente de la auditoría

Informe completo en [auditoria-cumplimiento-2026-11.md](auditoria-cumplimiento-2026-11.md).

### Hallazgo 6 — cerrado solo a medias

Se retiraron `genero`, `grupoEdad`, `segmentoGenero`, `segmentoEdad` y `segmentoEtiqueta` de `usuariosPublicos` y de las cuatro escrituras a `rankingsCiudad`.

**Lo que sigue abierto:** `segmentoCompetitivo` es una cadena del tipo `ritmo_hombre_13-17`. Es imprescindible para las consultas del ranking y es además el **id** de los documentos `territorios/{id}/segmentos/{segmentoCompetitivo}`, donde viven las conquistas. Quien inspeccione el segmento de un usuario sigue deduciendo su género y su tramo de edad.

Opciones, todas con migración de datos porque cambia el id de documentos que guardan conquistas:

- Fusionar el tramo `13-17` con el siguiente, de modo que no exista un tramo que identifique menores.
- Hacer opaco el identificador de segmento (no sirve un hash: con ~75 combinaciones es enumerable en segundos).
- Subir la edad mínima a 16 o 18, que elimina el problema de raíz a costa de mercado.

**Es una decisión de producto, no técnica.**

### Hallazgo 10 — App Check

`REQUIRE_APP_CHECK=false`. Es decisión de calendario, no de código: revisar en Firebase Console → App Check → APIs y activar cuando supere el 90% de solicitudes verificadas. Con iOS en producción y Android en Alpha el porcentaje debería estar subiendo.

### Hallazgo 12 — DSA, parte restante

Hecho: acuse de recibo al reportante (Art. 16.4) y aviso motivado al retirar una foto de perfil (Art. 17).
Falta: el mismo aviso motivado cuando se rechaza la **foto de grupo**, que vive en `grupos/{id}` y necesita su propio trigger.

### Registro de actividades de tratamiento (Art. 30)

Documento interno de una página. No se publica, pero si lo piden y no existe es infracción por sí misma.

### Otros de la auditoría aún abiertos

- Función programada de borrado por inactividad a 24 meses. Los textos legales lo plantean como facultad ("nos reservamos el derecho"), con aviso por email 30 días antes. Ninguna cuenta puede llegar a 24 meses inactiva antes de 2028: **construirlo a finales de 2027**, usando la última actividad de Firebase Auth (`metadata.lastRefreshTime`).
- ~~Borrar `solicitudesEliminacion` dentro de `eliminarCuenta`~~ y ~~aviso motivado al rechazar foto de grupo~~: hechos y desplegados el 22 nov.
- EIPD/DPIA antes de abrir a volumen alto, por geolocalización continua + menores + perfilado.
- Derecho de desistimiento en los Términos **antes** de activar cualquier suscripción.

---

## Pendiente de lanzamiento

1. **Verificar una carrera completa en dispositivo real.** Bloquea el merge de `fix/bugs-performance`. Es el cuello de botella de dos cosas a la vez.
2. **Merge `fix/bugs-performance` → main** una vez verificado.
3. **Probar el email de reportes** con un reporte real o de prueba.

---

## Analítica y marketing

### Instrumentar el embudo — lo más barato con más impacto

Firebase Analytics está instalado y `utils/monitoring.js` expone `registrarEvento`, pero las 8 llamadas existentes son todas diagnósticos de GPS en `CorrerScreen`. No hay un solo evento de activación.

Faltan, como mínimo: registro completado, nickname guardado, ciudad elegida, permiso de ubicación concedido, primera carrera guardada, primera conquista, grupo creado o unido.

La retención D1/D7 sí la da Firebase automáticamente. Lo que falta es **dónde se cae la gente**, que es justo lo que el plan de marketing exige saber antes de gastar.

### Marketing — no gastar todavía

El plan completo (hoja de ruta, kit de IA y guiones) está en [marketing.md](marketing.md); el presupuesto y los prompts, en [estrategia-instagram.md](estrategia-instagram.md). Razones para no lanzar la campaña de pago aún, dos de ellas del propio plan:

- Android no es público: el plan dice iOS-only hasta entonces, y que el CPI de Android es ~50% más barato.
- 35-65 instalaciones al mes repartidas por Madrid no crean densidad, y sin rivalidad por barrio la mecánica no engancha.
- Sin embudo instrumentado, una campaña fallida no dice por qué falló.

Lo que sí hacer ya, gratis: **crews de running de Madrid** (una crew son 20-40 corredores del mismo barrio, y la mecánica de grupos ya existe), y **ASO** en la ficha de App Store, que no aparece en el plan.

Pendiente también del plan: el "informe de guerra semanal" necesita usuarios suficientes para que haya barrios cambiando de dueño; y publicar duelos con nombres de usuario en redes no está cubierto por los Términos ni por la política.

---

## Apple (App Store Connect)

- **iOS 1.1.3 (build 42) enviada a revisión el 22 nov.**
- **Clasificación por edades:** contestar las preguntas nuevas sobre compartir ubicación y citas **antes del 15 ene 2027**.
- **China continental:** quitarla de la disponibilidad (Precios y disponibilidad) **antes del 31 ene 2027**, o presentar la evaluación de seguridad y la declaración AIGC.
- **Datos de contacto DSA (comerciante):** la App Store muestra en la UE los datos personales del titular. Cambiarlos a la dirección de los textos legales y a `conquerunapp@gmail.com`.
- **Membresía de Apple Developer:** no hay tarjeta para la renovación automática. Si caduca, Apple retira la app.

## Deuda técnica de producto

- **iOS: compilar con el SDK de iOS 27 antes de abril de 2027.** Apple avisó (ITMS-90725) con la build 42: desde abril no admitirá builds con el SDK de iOS 26. Hay que subir Expo a una versión compatible con Xcode 27 y usar una imagen de EAS Build con Xcode 27. Hacerlo con margen, en enero-febrero.
- **Strava Extended Access:** la petición de junio por email no se tramitó; Strava solo acepta su formulario. Hay 6 atletas conectados de 10 (22 nov). La 1.1.4 trae el botón oficial "Connect with Strava" y el logo "Powered by Strava"; pedir el acceso cuando esté publicada, con `https://miguelhsa.github.io/ConqueRun/` como web (`conquerun.app` no existe).

- **Factor ritmo** (`utils/grupos.js:48`, `ritmoBase = 300`): penaliza a corredores de 7-8 min/km con factores de 0.67-0.77. El roadmap lo lista como riesgo de retención y propone `ritmoBase = 400` o curva logarítmica. Es un cambio de una línea que toca directamente al North Star.
- **Fase 2 del roadmap**: mover a backend el cálculo de puntos, la conquista de barrios y el antitrampas. Con App Check desactivado, es lo que separa el ranking de ser falsificable con un script.
- **Política de retención de rutas GPS** (roadmap línea 370): es también el arreglo del principio de minimización del RGPD.
- **Fases R2-R5**: consistencia de datos. Lo más relevante, que cambiar de ciudad no arrastre los barrios antiguos.
- `docs/index.html` sigue siendo la plantilla por defecto de Firebase Hosting y es la raíz de GitHub Pages. Si se va a mandar tráfico, convertirlo en landing.
- `nicknameValido` en `firestore.rules` está definida y no se llama desde ninguna parte. Ya estaba así antes de esta sesión.
- Las functions están casi todas en `us-central1`, aunque `CLAUDE.md` documenta `europe-west1`. Solo `sincronizarRankingPerfil` y `enviarNotificacionTerritorios` están en Europa. Legalmente cubierto, pero es latencia innecesaria.
- 3 alertas abiertas en "Security and quality" del repositorio, sin revisar.
