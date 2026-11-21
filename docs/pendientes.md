# Pendientes — ConqueRun

Última actualización: **21 noviembre 2026**.
Documento de traspaso: lo que queda, por orden de lo que haría primero.

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

Las respuestas sugeridas por Testers Community afirman cambios que la app no tiene: botón de ver contraseña, confirmación al salir, ASO y capturas nuevas. No mandarlas tal cual.

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

- Borrar `solicitudesEliminacion` dentro de `eliminarCuenta`: hoy queda el email del usuario en Firestore tras el borrado "completo".
- Función programada de borrado por inactividad a 24 meses, que los documentos legales ya prometen.
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

El plan está en [estrategia-instagram.md](estrategia-instagram.md). Razones para no lanzar la campaña de pago aún, dos de ellas del propio plan:

- Android no es público: el plan dice iOS-only hasta entonces, y que el CPI de Android es ~50% más barato.
- 35-65 instalaciones al mes repartidas por Madrid no crean densidad, y sin rivalidad por barrio la mecánica no engancha.
- Sin embudo instrumentado, una campaña fallida no dice por qué falló.

Lo que sí hacer ya, gratis: **crews de running de Madrid** (una crew son 20-40 corredores del mismo barrio, y la mecánica de grupos ya existe), y **ASO** en la ficha de App Store, que no aparece en el plan.

Pendiente también del plan: el "informe de guerra semanal" necesita usuarios suficientes para que haya barrios cambiando de dueño; y publicar duelos con nombres de usuario en redes no está cubierto por los Términos ni por la política.

---

## Deuda técnica de producto

- **Factor ritmo** (`utils/grupos.js:48`, `ritmoBase = 300`): penaliza a corredores de 7-8 min/km con factores de 0.67-0.77. El roadmap lo lista como riesgo de retención y propone `ritmoBase = 400` o curva logarítmica. Es un cambio de una línea que toca directamente al North Star.
- **Fase 2 del roadmap**: mover a backend el cálculo de puntos, la conquista de barrios y el antitrampas. Con App Check desactivado, es lo que separa el ranking de ser falsificable con un script.
- **Política de retención de rutas GPS** (roadmap línea 370): es también el arreglo del principio de minimización del RGPD.
- **Fases R2-R5**: consistencia de datos. Lo más relevante, que cambiar de ciudad no arrastre los barrios antiguos.
- `docs/index.html` sigue siendo la plantilla por defecto de Firebase Hosting y es la raíz de GitHub Pages. Si se va a mandar tráfico, convertirlo en landing.
- `nicknameValido` en `firestore.rules` está definida y no se llama desde ninguna parte. Ya estaba así antes de esta sesión.
- Las functions están casi todas en `us-central1`, aunque `CLAUDE.md` documenta `europe-west1`. Solo `sincronizarRankingPerfil` y `enviarNotificacionTerritorios` están en Europa. Legalmente cubierto, pero es latencia innecesaria.
- 3 alertas abiertas en "Security and quality" del repositorio, sin revisar.
