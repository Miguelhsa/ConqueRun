# Pendientes — ConqueRun

Última actualización: **11 noviembre 2026**, final de la sesión de cumplimiento legal.
Documento de traspaso: lo que queda, por orden de lo que haría primero.

---

## Lo primero mañana

1. **Comprobar si GitHub Pages publicó los documentos legales.** Ayer GitHub tenía Actions en caída mayor y el build quedó encolado sin arrancar.

   ```bash
   gh run view 43096154272 --json status,conclusion && curl -s -o /dev/null -w '%{http_code}\n' https://miguelhsa.github.io/ConqueRun/normas-comunidad.html
   ```

   - `200` en normas-comunidad.html → publicado, verificar también que `terminos.html` ya no dice "13 años".
   - `404` → relanzar con `gh run rerun 43096154272` y volver a comprobar.

2. **Commitear los cambios de la auditoría.** Están desplegados en Firebase pero no en git, que es el peor sitio donde pueden estar: un deploy desde otra máquina los revertiría.

3. **Ejecutar el script de limpieza de datos antiguos** (ver más abajo).

---

## Estado al cerrar el 11 nov

### Desplegado y vivo en producción

- `firestore.rules` y `storage.rules` — desplegadas y confirmadas.
- Las 23 Cloud Functions — actualizadas sin fallos.

### Commiteado y en `main`

- `5c6f0ba` — correcciones legales en privacidad, términos y normas de comunidad.
- Pushed a `origin/main`. **Pero GitHub Pages no llegó a publicarlo** por la caída de Actions.

### Cambiado, desplegado, pero SIN commitear

```
M docs/auditoria-cumplimiento-2026-11.md
M firestore.rules
M functions/index.js
M screens/PerfilScreen.js
M storage.rules
?? scripts/limpiarCamposSensiblesPublicos.mjs
```

La rama `docs/cumplimiento-legal` ya está mergeada en `main` y se puede borrar.

---

## Pendiente inmediato

### 1. Commitear lo de arriba

Sugerencia de mensaje: `fix(cumplimiento): edad en reglas, datos de menores fuera de colecciones publicas, exportacion GDPR y avisos DSA`.

### 2. Ejecutar el script de limpieza

Las functions ya no escriben los campos sensibles y los borran de cada documento que tocan, pero un usuario que no vuelva a correr conserva los valores antiguos.

```bash
node scripts/limpiarCamposSensiblesPublicos.mjs --dry
```

Si el recuento tiene sentido, repetir sin `--dry`.

### 3. Build nueva de la app

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
3. **Merge `feature/decay-notifications` → main** + `firebase deploy --only functions`. Las notificaciones de barrio en peligro son retención pura y están paradas sin desplegar.
4. **Secretos del email admin de reportes.** `notificarReporte` registra el reporte y no avisa a ningún humano. Ahora además los Términos prometen por escrito revisión humana, así que ya no es solo deuda.

   ```bash
   firebase functions:secrets:set GMAIL_USER
   firebase functions:secrets:set GMAIL_PASS
   firebase functions:secrets:set ADMIN_EMAIL
   firebase deploy --only functions
   ```

5. **Testers de Alpha.** Reenviar el link de **Alpha** (no el de prueba interna) a los 18 testers. El contador de 14 días no arranca hasta que usen ese link.
6. **Android producción** cuando los 14 días estén cubiertos.

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
