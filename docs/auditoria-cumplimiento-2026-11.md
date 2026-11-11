# Auditoría de cumplimiento legal y seguridad — ConqueRun

Fecha: 11 noviembre 2026
Alcance: `docs/privacidad.html`, `docs/terminos.html`, `firestore.rules`, `storage.rules`, `functions/index.js`, `app.json`, pantallas de alta y perfil, `docs/roadmap.md`.

> **Nota**: los "dos documentos" que ibas a pasar no llegaron al chat. He auditado los dos documentos legales que están en el repo y publicados en GitHub Pages (Política de Privacidad y Términos y Condiciones), que son los que exponen a denuncia y sanción. Si te referías a otros, pásalos y los reviso aparte.

---

## Resumen ejecutivo

La base está mucho mejor de lo habitual en una app de este tamaño: hay doble consentimiento separado en el alta, divulgación previa al permiso de ubicación en segundo plano, borrado real de cuenta desde la app, exportación de datos, reglas de Firestore restrictivas y manifiesto de privacidad de iOS completo. No veo nada que justifique una denuncia inmediata.

Pero hay **4 incumplimientos reales** que sí son sancionables y que son baratos de arreglar, y todos tienen el mismo origen: **los documentos legales prometen cosas que el código no hace** (o dicen cosas distintas entre sí). Eso es precisamente lo que la AEPD sanciona con más facilidad, porque se demuestra con una captura de pantalla.

| # | Hallazgo | Riesgo | Estado |
|---|---|---|---|
| 1 | Edad mínima: Términos dicen 13, Privacidad dice 14, código exige 14 | 🔴 Crítico | ✅ Corregido en los documentos (pendiente la validación en reglas) |
| 2 | Responsable del tratamiento sin identificar (sin nombre, NIF ni dirección) | 🔴 Crítico | ✅ Corregido (nombre, NIF y dirección en ambos documentos) |
| 3 | La política dice que puedes cambiar género y país; el código lo bloquea | 🟠 Alto | ✅ Corregido (opción b: inmutables + rectificación por email) |
| 4 | Promesas de retención no implementadas (3 años / 24 meses, contradictorias) | 🟠 Alto | ✅ Unificado en 24 meses y redactado como derecho reservado |
| 5 | "Año de nacimiento" declarado, fecha completa almacenada | 🟠 Alto | ✅ Corregido |
| 6 | Segmento de edad `13-17` y género visibles públicamente en el ranking | 🟠 Alto | ⬜ Pendiente (requiere código) |
| 7 | Normas de comunidad citadas pero nunca publicadas | 🟡 Medio | ✅ Publicadas en `docs/normas-comunidad.html` |
| 8 | Falta derecho de limitación (Art. 18) y plazo de respuesta | 🟡 Medio | ✅ Corregido (+ Art. 13.2.e y decisiones automatizadas) |
| 9 | Género declarado como categoría especial del Art. 9 (no lo es) | 🟡 Medio | ✅ Reclasificado a Art. 6.1.a |
| 10 | App Check desactivado: cualquiera puede escribir en Firestore con la API key | 🟠 Alto (técnico) | ⬜ Pendiente (ya planificado) |
| 11 | La exportación GDPR puede fallar en Android por tamaño del payload | 🟡 Medio | ⬜ Pendiente (requiere código) |
| 12 | DSA: falta acuse de recibo y motivación de decisiones de moderación | 🟡 Medio | 🟨 Documentado en los Términos; falta implementarlo |

> **Actualización 11 nov 2026**: aplicados los 9 arreglos documentales, datos del titular incluidos. Quedan los 4
> que requieren código (#6, #10, #11, #12). Los cambios de código descritos en este informe **no** se han aplicado:
> `firestore.rules`, `functions/index.js` y las pantallas siguen como estaban.

---

## 1. Las 7 normas que tiene que cumplir la app

Entiendo que te refieres a los **7 principios del Art. 5 del RGPD**, que son la vara de medir de la AEPD en cualquier inspección y la base del cálculo de las multas. Si te referías a otra lista de 7 (por ejemplo las secciones de política de Google Play), dímelo y la reviso contra esa.

| # | Principio (Art. 5 RGPD) | Estado | Comentario |
|---|---|---|---|
| 1 | **Licitud, lealtad y transparencia** (5.1.a) | 🟠 Parcial | Hay base legal declarada para cada tratamiento, bien hecha. Falla la transparencia: responsable sin identificar (#2), contradicciones de edad (#1) y de datos recogidos (#5). |
| 2 | **Limitación de la finalidad** (5.1.b) | 🟢 Correcto | Las finalidades están acotadas y no hay publicidad ni cesión comercial. La ubicación solo se usa para la carrera y eso se cumple en el código (`CorrerScreen.js:649`). |
| 3 | **Minimización de datos** (5.1.c) | 🟠 Parcial | Se guarda la fecha de nacimiento completa cuando basta el año (#5), y la ruta GPS completa se conserva indefinidamente sin política de retención (el propio roadmap lo tiene pendiente, línea 370). |
| 4 | **Exactitud** (5.1.d) | 🔴 Incumplido | El usuario no puede rectificar género ni país: las reglas de Firestore lo impiden (`firestore.rules:153-162`) y el perfil no ofrece editor. La política dice lo contrario (#3). Esto es directamente el Art. 16. |
| 5 | **Limitación del plazo de conservación** (5.1.e) | 🔴 Incumplido | La política promete borrado por inactividad a 3 años con aviso por email; los términos dicen 24 meses; no existe ninguna función programada que lo haga (solo `aplicarDecayTerritorial`). Se conserva todo indefinidamente (#4). |
| 6 | **Integridad y confidencialidad** (5.1.f) | 🟠 Parcial | Reglas de Firestore y Storage sólidas, rutas GPS privadas, tokens de Strava inaccesibles al cliente. Pero App Check está desactivado (#10) y el segmento `13-17` es público (#6). |
| 7 | **Responsabilidad proactiva** (5.2) | 🟠 Parcial | No hay registro de actividades de tratamiento (Art. 30), ni evaluación de impacto. Con geolocalización continua + menores de 14-17 años + perfilado competitivo, una **EIPD (DPIA) es razonablemente exigible**. No es lo primero que mirarían, pero es lo que convierte una multa pequeña en grande. |

**Veredicto**: ninguno de los dos incumplimientos rojos es de los que generan multas de seis cifras, pero los dos son demostrables en 30 segundos por cualquier usuario que presente una reclamación. Y los dos se arreglan en una tarde.

---

## 2. Política de Privacidad — revisión en profundidad

### Lo que está bien hecho

- Tabla de bases legales por tratamiento, separada y específica. Esto lo hace mal el 90% de las apps.
- Transferencias internacionales con mención al Data Privacy Framework y a las SCC.
- Apartado específico de ubicación en segundo plano con la finalidad única, que es exactamente lo que exige Google Play.
- CCPA para California y mención expresa a la AEPD como autoridad de control.
- Derechos de acceso, portabilidad y supresión no solo enunciados, sino **implementados de verdad**: `exportarDatosUsuario` (functions/index.js:2271) y `eliminarCuenta` (functions/index.js:473), ambos accesibles desde Perfil → Privacidad y seguridad.
- El borrado es exhaustivo y correcto: libera territorios, limpia segmentos, reasigna o borra grupos, borra carreras, rankings, aportaciones, marcas, histórico, subcolección privada, reportes, foto de Storage y, por último, el usuario de Auth.

### 🔴 #2 — Responsable del tratamiento sin identificar

> Sección 1: "ConqueRun — Contacto: conquerunapp@gmail.com"

Esto no cumple el **Art. 13.1.a RGPD**, que exige "la identidad y los datos de contacto del responsable". "ConqueRun" es una marca, no una persona física ni jurídica. Falta:

- Nombre y apellidos (o razón social si constituyes sociedad).
- NIF/CIF.
- Dirección postal.

Además, al distribuir la app comercialmente en España aplica el **Art. 10 de la LSSI**, que exige los mismos datos identificativos accesibles de forma permanente y gratuita. Las sanciones por el Art. 10 LSSI son leves (hasta 30.000 €) pero son las más fáciles de imponer porque no requieren ni analizar el tratamiento: se ve o no se ve.

Si te preocupa publicar tu dirección personal, la solución habitual para autónomos es un domicilio de notificaciones o un apartado de correo, pero el nombre y el NIF tienen que estar.

### 🔴 #1 — Contradicción de edad mínima entre documentos

| Fuente | Dice |
|---|---|
| `privacidad.html` §11 | 14 años (correcto, LOPDGDD Art. 7) |
| `terminos.html` §2 | **13 años** |
| `NicknameScreen.js:90` | Rechaza si `edad < 14` ✅ |
| `firestore.rules:50-53` | Solo valida el **formato** `YYYY-MM-DD`, no la edad ❌ |

Dos problemas:

1. **Los términos dicen 13.** En España el consentimiento del menor es válido a partir de los 14 (LOPDGDD Art. 7). Publicar que admites usuarios de 13 años sin consentimiento parental verificable es, literalmente, declarar por escrito que tratas datos de menores sin base legal. Es el tipo de frase que la AEPD cita en sus resoluciones.
2. **La validación de edad es solo de cliente.** Las reglas de Firestore aceptan cualquier fecha con formato válido, así que con App Check desactivado un script puede crear una cuenta con fecha de nacimiento de 2020. La política afirma "Verificamos la edad durante el registro", y técnicamente la verificación es eludible.

Arreglo: poner 14 en los términos, y añadir a `fechaNacimientoValida()` una comprobación de que la fecha es anterior a `request.time - 14 años`. Las reglas de Firestore permiten aritmética con `duration.value()`, así que es viable sin backend.

### 🟠 #3 — El derecho de rectificación está bloqueado por código

> Sección 3: "El género se recoge en el momento del registro y se usa exclusivamente para las categorías de ranking. **Puedes modificarlo desde tu perfil en cualquier momento.**"
> Sección 10: "Rectificación: corregir datos inexactos desde tu perfil."

Es falso en los dos casos. `firestore.rules:153-162` impide explícitamente cambiar `pais` y `genero` una vez establecidos:

```
(!changedKeys().hasAny(['genero']) || !('genero' in resource.data) ||
  request.resource.data.genero == resource.data.genero)
```

Y `PerfilScreen.js` solo lee el género (`setGenero(data.genero)`), no ofrece editor. Entiendo la razón de producto — evitar que la gente salte de categoría de ranking para farmear posiciones — pero entonces **la política no puede decir que se puede cambiar**.

Tienes dos salidas legítimas:

- **(a) Cumplir la política**: permitir el cambio desde el perfil, con límite de frecuencia (por ejemplo una vez cada 90 días) y recálculo de segmento. Es lo correcto desde el RGPD y defendible desde producto.
- **(b) Cambiar la política**: decir que género y nacionalidad son inmutables tras el registro por integridad competitiva, y que para rectificarlos hay que escribir a `conquerunapp@gmail.com`, donde se atenderá en el plazo de un mes. El Art. 16 no exige autoservicio, exige que se pueda ejercer.

La opción (b) es 10 minutos. Pero si eliges (b), tienes que atender esas peticiones de verdad.

### 🟠 #4 — Promesas de retención no implementadas y contradictorias

| Fuente | Dice |
|---|---|
| `privacidad.html` §7 | Inactividad de **3 años** → aviso por email → borrado en 30 días |
| `terminos.html` §12 | Podemos eliminar la cuenta si está inactiva más de **24 meses** |
| Código | **No existe**. El único `onSchedule` es `aplicarDecayTerritorial` (functions/index.js:3541) |

Esto incumple el principio de limitación del plazo de conservación (5.1.e) y, lo que es peor de cara a una reclamación, incumple **tu propia política**, que es la prueba documental que el reclamante aporta.

Arreglo correcto: unificar el plazo en los dos documentos (recomiendo 24 meses, es lo estándar en apps de fitness y es más defendible que 3 años) y añadir una función programada mensual que marque cuentas sin actividad, envíe el aviso y borre a los 30 días reutilizando la lógica de `eliminarCuenta`. Es un día de trabajo bien aprovechado porque además te reduce el coste de Firestore.

Arreglo rápido si no quieres implementarlo ahora: reescribir la sección 7 para decir que conservas los datos mientras la cuenta esté activa y que el usuario puede borrarla en cualquier momento desde la app, sin prometer borrado automático. Es menos garantista pero es cierto, y la verdad es lo que importa.

### 🟠 #5 — "Año de nacimiento" vs. fecha completa

La política dice en la sección 2: "Año de nacimiento (para verificar la edad mínima y calcular el grupo de edad en el ranking)". El código guarda la **fecha completa** en `usuarios/{uid}/privado/datos.fechaNacimiento` con formato `YYYY-MM-DD` (`NicknameScreen.js:101`, `firestore.rules:50`), y la exportación la devuelve tal cual.

Es doble fallo: transparencia (declaras menos de lo que recoges) y minimización (recoges más de lo que necesitas; para una verificación de ≥14 y un tramo de edad, el año basta).

Lo más limpio es cambiar la política a "fecha de nacimiento" — 10 minutos y cero riesgo. Guardar solo el año implicaría migración de datos y no merece la pena ahora.

### 🟡 #9 — Género no es una categoría especial del Art. 9

> "Género (categoría especial, Art. 9 RGPD) — Consentimiento explícito del usuario (Art. 9.2.a)"

El Art. 9 enumera de forma cerrada: origen racial o étnico, opiniones políticas, convicciones religiosas o filosóficas, afiliación sindical, datos genéticos, biométricos, de salud, y datos relativos a la **vida sexual u orientación sexual**. El género/sexo no está en la lista.

Esto no es sancionable por sí mismo —sobreproteger no es infracción— pero te mete en un problema práctico: al declarar Art. 9.2.a te obligas a un consentimiento explícito, granular y **revocable**, y resulta que el código no permite revocarlo ni modificarlo (#3). Te has creado tú mismo la obligación que incumples.

Recomiendo reclasificarlo como Art. 6.1.a (consentimiento) o 6.1.b (ejecución del contrato, al ser necesario para las categorías de ranking que el usuario elige usar).

Dato relacionado: los **datos de actividad física** (ritmo, distancia, rutas) sí entran en una zona gris más seria. La AEPD y el CEPD han considerado en varias ocasiones que los datos de fitness continuos pueden ser datos de salud del Art. 9 cuando permiten inferir el estado físico. Vosotros ya declaráis `NSPrivacyCollectedDataTypeSensitiveInfo` en el manifiesto de iOS, lo cual es coherente. No haría nada más por ahora, pero es el argumento que convertiría una EIPD en obligatoria.

### 🟡 #8 — Derechos incompletos

Falta en la sección 10:

- **Derecho de limitación del tratamiento (Art. 18)**, que el Art. 13.2.b obliga a informar. Está ausente; aparecen acceso, rectificación, supresión, portabilidad, oposición y retirada del consentimiento, pero no limitación.
- **Plazo de respuesta**: un mes, prorrogable a tres (Art. 12.3).
- **Si hay decisiones automatizadas (Art. 13.2.f)**. Y aquí sí hay algo: `validarCarrera` (functions/index.js:3007) marca carreras como fraudulentas automáticamente, revierte puntos y notifica al usuario, sin revisión humana previa. Eso es una decisión automatizada con efecto sobre el usuario. No llega a Art. 22 (no es un "efecto jurídico" ni "significativamente similar" en una app gratuita de running), pero conviene declararlo y ofrecer un canal de revisión humana. El roadmap ya prevé "marcar carreras como sospechosas en vez de borrarlas" y un panel admin de revisión (líneas 367-368): eso resolvería el fondo.
- **Si facilitar los datos es obligatorio y qué pasa si no se facilitan (Art. 13.2.e)**.

### 🟡 Otros puntos menores de la política

- **Fecha "mayo de 2026"**, con la versión actual en 1.1.1 de noviembre. Entremedias se han añadido widget de carrera, Live Activities, notificaciones de decay y la integración de Strava. Una política visiblemente desactualizada es un agravante en cualquier reclamación.
- **Strava no aparece en la sección 5 (terceros)** pero sí en la 7 (retención de tokens). Incoherencia. Ahora mismo está desactivado en UI, pero el backend existe y la sección 7 lo delata.
- **"Al usar la aplicación ConqueRun aceptas las condiciones descritas en este documento"**: una política de privacidad es informativa, no contractual; no se "acepta". La AEPD ha criticado expresamente esta mezcla porque confunde información con consentimiento. En la app lo tenéis bien hecho (dos checkboxes separados en `LoginScreen.js:183-209`), así que es solo cambiar esa frase por "Esta política te informa de...".
- **Normas de comunidad citadas y nunca publicadas** (#7): la sección 9 dice "si infringe nuestras normas de comunidad" y no existe tal documento. En `docs/` no hay ningún `normas-comunidad.html`, y el roadmap lo tiene pendiente en la línea 455. Lo más rápido es enlazar a la sección 5 de los Términos, que ya contiene las normas de uso aceptable, o extraerla a su propio documento.

---

## 3. Términos y Condiciones — revisión en profundidad

### Lo que está bien hecho

- **Sección 14, EULA de Apple**: completa y correcta, con las cláusulas de tercero beneficiario, garantía, reclamaciones y cumplimiento de exportación. Esto lo olvida casi todo el mundo y es causa de rechazo en revisión.
- **Sección 3, advertencia de salud**: bien redactada y necesaria para una app de deporte.
- **Sección 4, precisión del GPS**: muy buena idea, te cubre ante reclamaciones por conquistas perdidas.
- **Sección 7**: atribución correcta de OpenStreetMap con licencia ODbL. Obligatorio y cumplido.
- **Sección 13**: ley española con salvaguarda expresa de los derechos del consumidor en su país de residencia, que es la fórmula correcta para no caer en cláusula abusiva.

### 🔴 Edad mínima 13 años

Ya tratado en #1. Es el cambio más urgente de todo el informe porque es una sola palabra.

### 🟠 Falta el derecho de desistimiento

Al ser un servicio digital gratuito no hay desistimiento aplicable hoy, pero la sección 1 dice "Podemos introducir funciones de pago en el futuro". **En el momento en que haya una suscripción**, el Real Decreto Legislativo 1/2007 (Art. 102 y ss.) obliga a informar del derecho de desistimiento de 14 días y de su excepción para contenido digital, con consentimiento expreso a la pérdida del derecho. Si activas premium sin esto, es sanción de consumo prácticamente automática.

No hay que hacer nada ahora. Anótalo como bloqueante de la Fase 6 de monetización, porque es fácil que se olvide con la prisa de lanzar la suscripción.

### 🟡 Falta identificación del titular

Mismo problema que la política: los Términos tampoco identifican quién es "ConqueRun". En un contrato de adhesión, no saber con quién contratas es un defecto más grave que en un documento informativo.

### 🟡 Falta información de moderación exigida por el DSA (#12)

El Reglamento (UE) 2022/2065 (DSA) te aplica: alojas contenido de usuario (fotos de perfil y de grupo, nicknames, nombres de grupo). Como microempresa estás exento de las obligaciones de la Sección 3 (Art. 19), pero **no** de las de la Sección 2, que incluyen:

- **Art. 16 — mecanismo de notificación y acción**: ✅ lo tienes. La colección `reportes` con tipos, motivos y límite de un reporte por usuario y recurso (`firestore.rules:471-492`) está bien construida.
- **Art. 16.4 — acuse de recibo** de la notificación al reportante: ❌ no existe. `notificarReporte` manda email al admin, no acusa recibo al usuario.
- **Art. 17 — declaración de motivos** al usuario afectado cuando retiras su contenido o restringes su cuenta: ❌ no existe.
- **Art. 14 — condiciones generales**: hay que informar en los términos de las políticas, procedimientos y herramientas de moderación, incluida la revisión humana. La sección 6 dice "nos reservamos el derecho de eliminar cualquier contenido... **sin necesidad de justificación previa**", que es casi lo contrario de lo que pide el Art. 17.
- **Art. 12 — punto de contacto único**: el email sirve, pero conviene designarlo expresamente como tal en los términos.

Prioridad media, no crítica para una app con pocos usuarios, pero es normativa reciente con régimen sancionador fuerte (hasta el 6% del volumen de negocio) y los reguladores están activos en ello. El arreglo de fondo encaja con el "Panel admin para cerrar reportes" que ya tienes en el roadmap (línea 483).

### 🟡 Inactividad: 24 meses vs. 3 años

Ver #4. Hay que unificarlo.

---

## 4. Seguridad técnica

### Lo que está bien

- **Ningún secreto en el repositorio.** Verificado: los keystores `.jks` nunca se han commiteado (`git log --all --diff-filter=A` vacío), `.gitignore` cubre `*.jks`, `*.p8`, `*.p12`, `*.key`, `serviceAccount.json` y `functions/.env`. El único `.env` versionado contiene solo `REQUIRE_APP_CHECK=false`. Limpio.
- **Las rutas GPS son privadas.** `carreras` solo se lee si `resource.data.uid == request.auth.uid` (`firestore.rules:397`). Esto es importante: es el fallo por el que Strava tuvo el escándalo de las bases militares y por el que se puede inferir el domicilio de alguien. Aquí está bien cerrado.
- **Tokens de Strava inaccesibles al cliente**: `privado/strava` está excluido explícitamente de la lectura del propio usuario (`firestore.rules:378`). Correcto.
- **Escrituras competitivas solo desde Admin SDK**: `carreras`, `barrios`, `territorios`, `segmentos`, `rankingsCiudad` y `aportacionesGrupo` son de solo lectura para el cliente. La integridad del juego depende del backend, no del cliente, en todo lo que ya está migrado.
- **Validación exhaustiva por campo** con `hasOnly()` en creación y actualización de usuario y grupo, incluida la protección de `esAdmin` y `nickname` frente a escalada de privilegios. Muy bien hecho.
- **Divulgación previa al permiso de ubicación en segundo plano** (`CorrerScreen.js:651-668`), con consentimiento persistido y timestamp. Esto es exactamente lo que exige la política de Play y lo que más rechazos provoca.
- **Manifiesto de privacidad de iOS completo**, con los `NSPrivacyAccessedAPITypes` y los tipos de datos recogidos declarados uno a uno, y `NSPrivacyTracking: false`.
- **Rate limit en la exportación** (una cada 24 h) y en los reportes (uno por recurso). Buen criterio.

### 🟠 #10 — App Check desactivado es el agujero real

Con `REQUIRE_APP_CHECK=false`, `verificarAppCheckCallable` solo registra un warning y deja pasar la llamada (functions/index.js:24-33). La API key de Firebase está en el bundle de la app y se extrae en minutos. Consecuencias concretas:

- Cualquiera puede registrar cuentas y llamar a `registrarCarreraConqurun` desde un script, con carreras sintéticas. Las validaciones de `validarCarrera` son la única defensa.
- Se puede saltar la verificación de edad de cliente (#1).
- Riesgo de coste: lecturas y escrituras de Firestore sin límite de origen.

Ya lo tienes identificado y la decisión de esperar a >90% verificado es la correcta —activarlo ahora bloquearía a los usuarios reales—, así que no es una crítica. Pero es el riesgo técnico vivo número uno y conviene no dejarlo indefinidamente: con App Store ya en producción y Alpha en Android, el porcentaje debería estar subiendo. Merece una revisión semanal en Firebase Console.

### 🟠 #6 — El segmento `13-17` es público

`rankingsCiudad` y `usuariosPublicos` son legibles por **cualquier usuario autenticado** (`firestore.rules:392` y `452`) y contienen `genero`, `segmentoEdad`, `pais`, `ciudadActualNombre`, `nickname` y `fotoPerfil`. `utils/segmentos.js:24` asigna `'13-17'` a los menores de 18.

Resultado: un usuario cualquiera puede enumerar los menores de edad de una ciudad concreta, con su foto, su nickname, su género y el barrio donde corren habitualmente (el mapa de conquistas). Esa combinación es un problema de protección del menor antes que de RGPD, y es el tipo de hallazgo que a Google Play le hace revisar la clasificación de contenido y las obligaciones de la política de Familias.

Tres opciones, de menos a más trabajo:

1. No incluir `segmentoEdad` ni `genero` en `usuariosPublicos`; dejarlos solo en el documento privado y usarlos en backend para el filtrado de rankings. El ranking seguiría funcionando porque el segmento ya está precalculado en `segmentoCompetitivo`.
2. Fusionar `13-17` con `18-30` a efectos de etiqueta visible, manteniendo la separación interna para el emparejamiento competitivo.
3. Subir la edad mínima a 16 o 18. Es la opción que elimina el problema de raíz, a costa de mercado.

Yo haría la 1: es un cambio en `perfilPublico()` (functions/index.js:193-208) y en el payload de `rankingsCiudad`, más un script de limpieza de los documentos existentes.

### 🟡 #11 — La exportación GDPR puede fallar en Android

`exportarDatosUsuario` devuelve hasta **500 carreras completas** (functions/index.js:2292), cada una con su ruta GPS, y `PerfilScreen.js:405-406` las serializa a JSON y las pasa por `Share.share({ message: json })`.

En Android, el intent de compartir va por una transacción Binder con un límite práctico del orden de cientos de KB. Un usuario con 200-300 carreras y rutas de varios cientos de puntos genera megabytes de JSON y se come un `TransactionTooLargeException` o un fallo silencioso. Es decir: **el derecho de portabilidad falla precisamente para los usuarios más activos**, que son los que más probablemente lo ejerzan.

Arreglo: escribir el JSON a un fichero con `expo-file-system` y compartirlo con `Share.share({ url })` o `expo-sharing`, en lugar de pasarlo como `message`. De paso, el límite de 500 carreras debería documentarse o eliminarse: la portabilidad del Art. 20 cubre todos los datos facilitados por el interesado, no los últimos 500.

### 🟡 Datos residuales tras el borrado de cuenta

`eliminarCuenta` no borra los documentos de `solicitudesEliminacion`, que contienen `uid` y **`email`** (`firestore.rules:498-509`). Tras ejecutar el borrado "completo" queda el email del usuario en Firestore indefinidamente. Es una línea más en `ops`. Lo mismo aplica a `stravaOAuthNonces` si quedó alguno a medias, aunque ahí no hay dato personal relevante.

### 🟢 Puntos menores sin acción necesaria

- `config/app` es legible sin autenticación (`firestore.rules:432`). Correcto para configuración remota mientras no contenga nada sensible; `allow list: if false` evita la enumeración. Bien pensado.
- `storage.rules` permite leer `fotos/{fileName}` a cualquier autenticado, pero el nombre es el uid, así que no hay enumeración práctica. Aceptable para un perfil social.
- Las fotos se autopublican (el cliente fija `fotoPerfilEstado == 'aprobada'`, `firestore.rules:93`) con moderación reactiva por reportes. Es coherente con lo que declara la política ("se publican de forma inmediata"), y es un modelo legalmente válido. El roadmap ya prevé moverlo a `fotosPendientes/{uid}.jpg` con aprobación previa (línea 168), que sería mejor pero no es exigible.

---

## 5. Roadmap: las mejoras pendientes

El roadmap (42 KB, revisión de agosto) está muy bien construido y en buena medida ya ejecutado: casi todo Sprint 0, Fase 0 y Fase 1 está tachado. Lo que queda vivo, ordenado por lo que yo haría primero:

### Bloque A — Integridad competitiva (Fase 2, el pendiente grande)

Es el riesgo que el propio roadmap señala como activo y la decisión arquitectónica que CLAUDE.md documenta como temporal: **las conquistas se calculan en cliente**. Pendiente de mover a Functions: cálculo final de puntos, conquista de barrios, agregados de usuario, rankings, grupos y logros competitivos. Antitrampas pendiente: velocidad máxima por tramo, saltos GPS imposibles, filtrado de puntos de mala precisión, tope de puntos por carrera y por día, y panel admin de carreras sospechosas.

Con App Check desactivado, este bloque es lo que separa tu ranking de ser falsificable con un script. No urge con 18 testers; urge el día que haya competencia real por un barrio.

**Nota de cumplimiento**: la línea 370 ("definir política de retención de ruta GPS completa: mantener `territorioCarrera` permanente y borrar/simplificar ruta completa en producción") es exactamente el arreglo del principio de minimización del §1.3 de este informe. Está ya en tu roadmap; súbela de prioridad porque mata dos pájaros.

### Bloque B — Consistencia de datos (Fases R2-R5, parcialmente abiertas)

Lo más relevante que queda:

- **R2**: evitar que cambiar de ciudad arrastre los barrios antiguos a la nueva; script admin de reconciliación de contadores desde la fuente oficial.
- **R3**: guardar en la carrera el resultado territorial resuelto por backend (`conquistadas` / `defendidas` / `rivalesPendientes`) y pintar eso, en vez de reclasificar en cliente; mover el listener de deep link de Strava a `App.js`.
- **R4**: documentar la diferencia entre nacionalidad inmutable y país/ciudad a conquistar. **Esto conecta directamente con el hallazgo #3**: si la nacionalidad es inmutable por diseño, hay que decirlo en la política.
- **R5**: una carrera aporta solo al equipo elegido al terminar; detalle de barrio específico para modo equipos.
- **R1**: la limpieza de `notificacionesPendientes` que las reglas bloquean (el cliente intenta una escritura imposible).

### Bloque C — Lo que desbloquea producción

Ya está todo en CLAUDE.md, lo repito solo por el orden:

1. Verificar una carrera completa en dispositivo real → mergear `fix/bugs-performance`.
2. Mergear `feature/decay-notifications` + `firebase deploy --only functions`.
3. Reenviar el link de Alpha a los 18 testers (el contador de 14 días no empieza hasta que usen el link de Alpha, no el de Prueba interna).
4. Configurar los secretos de email admin: hasta entonces `notificarReporte` registra el reporte pero **no avisa a nadie**. Con el DSA en la mano, un mecanismo de reporte cuyo aviso no llega a ningún humano es un problema. Esto lo subiría de prioridad.
5. App Check a `true` cuando Firebase Console pase del 90%.

### Bloque D — Mejoras de producto pendientes

- **Factor ritmo** (`grupos.js:48`, `ritmoBase = 300`): penaliza a corredores de 7-8 min/km con factores de 0.67-0.77. El roadmap lo lista como riesgo de retención y propone `ritmoBase = 400` o curva logarítmica. Es un cambio de una línea con impacto directo en el North Star. Yo lo haría ya.
- **Moderación**: moderación automática de imágenes y textos, bloqueo efectivo de usuarios bloqueados en rankings y grupos (hoy `usuariosBloqueados` se guarda pero habría que confirmar que filtra en todas las vistas), panel admin para cerrar reportes y auditoría de acciones admin.
- **Strava**: bloqueado por el tier de 10 atletas. Al reactivar, pendientes el scope `activity:read_all`, la coincidencia exacta del `redirect_uri`, el auto-redirect de iOS Safari y la página de callback que dice "conectado ✓" incluso cuando falla el intercambio de tokens.
- **Fase 5-6**: expansión por ciudades, temporadas, retos, y monetización. Para la Fase 6, recuerda el derecho de desistimiento del §3.

---

## 6. Plan de acción recomendado

### Hoy, 1-2 horas, cierra los dos hallazgos rojos

1. `terminos.html` §2: 13 años → **14 años**, coherente con la política y con el código.
2. Identificar al responsable en **ambos** documentos: nombre, NIF y dirección de notificaciones.
3. Decidir sobre género/país: o lo haces editable, o cambias la política para decir que son inmutables y se rectifican por email. Lo segundo son 10 minutos.
4. Unificar inactividad en 24 meses en los dos documentos, y reescribir la sección 7 para no prometer un borrado automático que no existe (o implementarlo, ver abajo).
5. "Año de nacimiento" → "fecha de nacimiento".
6. Añadir el derecho de limitación (Art. 18) y el plazo de respuesta de un mes.
7. Reclasificar género fuera del Art. 9.
8. Actualizar la fecha de ambos documentos a noviembre de 2026 y añadir Strava a la lista de terceros.
9. Publicar las normas de comunidad, o enlazar la sección 5 de los Términos desde la política.

### Esta semana

10. Validación de edad ≥14 en `firestore.rules`, no solo en cliente.
11. Secretos de email admin de reportes (`GMAIL_USER`, `GMAIL_PASS`, `ADMIN_EMAIL`) + deploy.
12. Borrar `solicitudesEliminacion` dentro de `eliminarCuenta`.
13. Quitar `segmentoEdad` y `genero` de `usuariosPublicos` y `rankingsCiudad`.

### Este mes

14. Exportación GDPR a fichero en lugar de `Share.share({ message })`.
15. Función programada de borrado por inactividad, si eliges cumplir la promesa.
16. DSA: acuse de recibo al reportante y notificación motivada al usuario afectado.
17. Registro de actividades de tratamiento (Art. 30). Es un documento interno de una página, no hace falta publicarlo, pero si te lo piden y no existe, es infracción por sí mismo.

### Cuando toque

18. Fase 2 completa: cálculo competitivo en backend y antitrampas.
19. Política de retención de rutas GPS (roadmap línea 370).
20. EIPD/DPIA antes de abrir a volumen alto, por la combinación geolocalización continua + menores + perfilado.
21. Derecho de desistimiento antes de activar cualquier suscripción.

---

## Lo que no es un problema

Para que quede constancia, porque es fácil preocuparse por lo que no toca:

- No vendes ni cedes datos, no hay publicidad, no hay tracking entre apps, `NSPrivacyTracking: false`. Esto te quita de encima el 80% de los problemas típicos de privacidad en móvil.
- No necesitas DPO: no haces tratamiento a gran escala de categorías especiales ni observación sistemática a gran escala en el sentido del Art. 37.
- No necesitas banner de cookies: no hay web con cookies de terceros, solo GitHub Pages estático.
- El borrado de cuenta desde la app cumple la guideline 5.1.1(v) de Apple, que es causa frecuente de rechazo.
- Los permisos declarados en `app.json` se usan todos, lo que evita el rechazo de Apple por permisos declarados sin uso.
