# ConqueRun — Contexto para Claude

## Qué es esto

App de running donde conquistar barrios corriendo. El usuario sale a correr, acumula puntos según distancia y ritmo, y conquista zonas geográficas. Hay rankings por ciudad, grupos y logros.

Stack: React Native + Expo SDK 54 · Firebase Auth + Firestore + Cloud Functions (gen2, europe-west1) · EAS Build + EAS Submit.

- Bundle ID: `com.conquerun.app` (iOS y Android)
- Firebase Project: `conquerrun-8d30e`
- Expo slug: `conqurun`

---

## Estado actual (noviembre 2026)

| Plataforma | Estado |
|---|---|
| iOS | ✅ Live en App Store |
| Android | ✅ Prueba cerrada (Alpha), versionCode 25. A la espera del OK de los testers (15 nov) para arrancar los 14 días |
| Strava | ✅ Activo desde la 1.1.0, funcionando con pocos usuarios. Sigue en Standard Tier (límite 10 atletas): vigilarlo |
| App Check | ⏳ `REQUIRE_APP_CHECK=false` — apps registradas, esperando >90% verificado en Firebase Console |
| Cumplimiento | 🟨 Auditoría RGPD/LSSI/DSA del 11 nov: código en git y desplegado, documentos legales publicados, datos públicos limpiados (15 nov). Quedan puntos abiertos |

**➡️ La lista viva de pendientes está en [`docs/pendientes.md`](docs/pendientes.md). Empezar por ahí.**

---

## Branches activas

- `main` — versión estable
- `fix/bugs-performance` — 1 commit pendiente de merge tras verificación en dispositivo real:
  - `App.js`: polling AsyncStorage 1s → 3s durante carrera activa
  - `CorrerScreen.js`: catch exterior en `pararCarrera` para errores inesperados
- Ya mergeadas en `main`, se pueden borrar: `docs/cumplimiento-legal`, `feature/decay-notifications` (desplegada), `feature/reactivar-strava`, `feature/resumen-carrera-bloqueo`, `fix/cumplimiento-auditoria`, `fix/modal-info-android`

**No mergear `fix/bugs-performance` sin verificar una carrera completa en dispositivo real.**

---

## Pendientes técnicos

### Inmediatos
1. **Merge `fix/bugs-performance` → `main`** — esperar verificación de carrera en dispositivo real
2. **Build nueva de la app** — para que llegue a usuarios la exportación GDPR por enlace (`screens/PerfilScreen.js`)
3. **Testers Alpha** — build 25 en Alpha con fix Google Sign-In (SHA-256). A la espera de que los 18 testers den el OK usando el link de Alpha

### Cuando las condiciones lo permitan
4. **App Check enforce** — cambiar `functions/.env.conquerrun-8d30e` a `REQUIRE_APP_CHECK=true` y `firebase deploy --only functions` cuando Firebase Console muestre >90% verificado
5. **Email admin de reportes** — configurar secrets y desplegar:
   ```
   firebase functions:secrets:set GMAIL_USER   # miguelhsa@gmail.com
   firebase functions:secrets:set GMAIL_PASS   # App Password 16 chars
   firebase functions:secrets:set ADMIN_EMAIL  # miguelhsa@gmail.com
   firebase deploy --only functions
   ```
6. **Android producción** — cuando 14 días cubiertos, ir a Play Console → Prueba cerrada → solicitar acceso a producción

### Strava (activo)
7. **Límite de 10 atletas** — antes de que se acerquen los usuarios conectados, pedir Extended Access en strava.com/settings/api. Al llegar a 10, los nuevos no podrán conectar
8. **Scope inconsistente** — `screens/CorrerScreen.js:1260` pide `read,activity:read`, mientras `utils/strava.js` declara `activity:read_all`. Con `activity:read` no se importan las actividades privadas. Corregir en la próxima build

---

## Comandos frecuentes

```bash
# Build Android producción (sube versionCode automáticamente)
eas build --platform android --profile production

# Build iOS producción
eas build --platform ios --profile production

# Deploy functions
firebase deploy --only functions

# Deploy Firestore rules
firebase deploy --only firestore:rules

# Merge fix branch (solo tras verificar en dispositivo)
git checkout main && git merge fix/bugs-performance
```

---

## Archivos clave

| Archivo | Qué hace |
|---|---|
| `screens/CorrerScreen.js` | Pantalla principal de carrera (~1100 líneas). `pararCarrera` en línea ~836, `arrancarSincronizacion` en ~495 |
| `App.js` | Polling AsyncStorage para badge de carrera activa. Línea ~234: intervalo 3s durante carrera |
| `utils/barrios.js` | `buildIndiceEspacial` (O(k)) y `calcularBarrio`. Índice espacial ya implementado |
| `utils/grupos.js` | `generarCodigo` usa `crypto.getRandomValues`, no `Math.random` |
| `utils/socialAuth.js` | Google Sign-In. `GOOGLE_WEB_CLIENT_ID = '743879769903-emv2olgja4o0nhu1b389ocdml6em79da'` |
| `functions/.env.conquerrun-8d30e` | `REQUIRE_APP_CHECK=false` — no cambiar hasta >90% verificado |
| `firebase-native/google-services.json` | Config Android. package: `com.conquerun.app` |
| `docs/roadmap.md` | Hoja de ruta completa con fases R1-R6 y E1-E4 |

---

## Decisiones de arquitectura importantes

- **App Check desactivado en producción intencionalmente** — hay muy pocos usuarios activos aún, activarlo ahora bloquearía a todos. No activar hasta >90% verificado.
- **Conquistas calculadas en cliente** — decisión temporal hasta Fase 2 (backend competitivo). Riesgo conocido de trampas, aceptado hasta que haya masa crítica de usuarios.
- **Strava activo en Standard Tier** — reactivado en la 1.1.0 aceptando el límite de 10 atletas mientras haya pocos usuarios. Ampliar el tier antes de que se llene.
- **`fix/bugs-performance` sin mergear** — los cambios son seguros pero Miguel necesita verificar en dispositivo real antes de mergear.
- **Polling 3s en App.js, 1s en CorrerScreen** — el tab bar no necesita refresh de 1s; la UI en vivo de la carrera sí.
- **Índices compuestos evitados** — preferencia explícita: queries de igualdad simples, ordenar/filtrar en cliente. No añadir índices compuestos sin consultarlo.

---

## Google Play — camino a producción

Nueva app: Google exige **12+ testers activos durante 14+ días en Prueba cerrada (Alpha)** antes de poder solicitar acceso a producción.

- Alpha creada: 4 jul 2026 (versionCode 22)
- Build actual en Alpha: 24 (subida 26 jul 2026)
- Base instalada Alpha: 0% — **los testers deben usar el link de Alpha, no el de Prueba interna**
- Prueba interna (versionCode 23): 70% instalado — estos no cuentan para los 14 días

---

## URLs legales (ya publicadas)

- Privacidad: en GitHub Pages
- Términos: en GitHub Pages
- Normas de Comunidad: `normas-comunidad.html`, nueva el 11 nov — enlazada desde privacidad y términos
- Eliminación de cuenta: formulario externo

Versión corregida publicada y verificada el 15 nov (normas-comunidad 200, términos con edad mínima 14).

Ver memoria `project_legal_urls.md` para URLs exactas.

---

## Lo que NO hacer

- No activar `REQUIRE_APP_CHECK=true` hasta >90% verificado en Firebase Console
- No mergear `fix/bugs-performance` sin verificar carrera en dispositivo real
- No añadir índices compuestos en Firestore sin necesidad (preferencia del propietario: simplicidad)
- No hacer campañas ni abrir a volumen sin ampliar antes el tier de Strava (límite 10 atletas)
- No usar `Math.random()` para códigos de grupo (ya usa `crypto.getRandomValues`)
- No volver a escribir `genero`, `grupoEdad`, `segmentoGenero`, `segmentoEdad` ni `segmentoEtiqueta` en `usuariosPublicos` ni en `rankingsCiudad`: son colecciones que lee cualquier usuario autenticado e identificaban a los menores
- No bajar de 14 años la edad mínima en ningún documento ni en las reglas (LOPDGDD Art. 7)
