# Pendientes — ConqueRun

Última actualización: **15 noviembre 2026**.
Documento de traspaso: lo que queda, por orden de lo que haría primero.

---

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
- **Scope inconsistente:** `screens/CorrerScreen.js:1260` pide `read,activity:read`; `utils/strava.js` declara `activity:read_all`. Con `activity:read` no se importan actividades privadas. Corregir en la próxima build.

---

## Pendiente inmediato

### 1. Build nueva de la app

El cambio de `screens/PerfilScreen.js` (exportación GDPR por enlace de descarga) no llega a los usuarios hasta la siguiente build. La parte de servidor ya está activa, y hay compatibilidad hacia atrás para la 1.1.1: las cuentas pequeñas siguen exportando como hasta ahora.

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
3. **Secretos del email admin de reportes.** `notificarReporte` registra el reporte y no avisa a ningún humano. Ahora además los Términos prometen por escrito revisión humana, así que ya no es solo deuda.

   ```bash
   firebase functions:secrets:set GMAIL_USER
   firebase functions:secrets:set GMAIL_PASS
   firebase functions:secrets:set ADMIN_EMAIL
   firebase deploy --only functions
   ```

4. **Testers de Alpha — a la espera de su OK** (15 nov). El contador de 14 días solo cuenta si usan el link de **Alpha**, no el de prueba interna.
5. **Android producción** cuando los 14 días estén cubiertos.

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
