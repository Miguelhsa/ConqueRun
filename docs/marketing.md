# Marketing de ConqueRun — estrategia, hoja de ruta y guiones

Creado el 25 nov 2026.

> **Ojo:** el marketing de ConqueRun ya vive en `~/Documents/ConqueRun-Marketing/` (runbook de sesiones, plan de Instagram con campañas de pago, posts publicados y en cola, capturas, sistema de diseño en Claude Design). Este documento se escribió sin conocer esa carpeta. Pendiente: fusionarlo allí y dejar aquí solo un enlace.
>
> **Aspecto del mapa:** el mapa real de la app es Google Maps claro con calles, con los barrios en líneas azules y rellenos rojo (rival) y verde lima (tuyo). Cualquier vídeo o imagen de mapa debe parecerse a eso. El detalle del presupuesto de Instagram y la biblioteca de prompts de Higgsfield siguen en [estrategia-instagram.md](estrategia-instagram.md).

---

## 1. La idea en una frase

**Reels de Instagram donde se ve la app de verdad, sobre todo el mapa, con una voz en off hecha con IA que cuenta lo que está pasando.** La IA pone la voz, los guiones, la música y los planos de ambiente. La app siempre se graba real.

### Por qué así

- **El mapa es lo único que no tiene ninguna otra app de running.** Strava, Nike Run Club y Garmin enseñan kilómetros y gráficas. Nosotros enseñamos un barrio que pasa a ser tuyo. Ese plano tiene que salir en todos los vídeos.
- **App real, no inventada.** Si la IA se inventa pantallas que la app no tiene, el anuncio es engañoso (Meta y Apple lo penalizan) y quien descarga y ve otra cosa la borra.
- **Voz en off con IA, mejor que un presentador con IA.** Una persona sintética que habla a cámara da menos confianza y Meta obliga a etiquetarla como "Información de IA". Una voz encima de la pantalla se acepta sin problema.

---

## 2. Mensaje

**No vendemos "otra app de running". Vendemos conquista y rivalidad de barrio.**

| Uso | Frase |
|---|---|
| Gancho principal | "Tu barrio ya tiene dueño. ¿Vas a permitirlo?" |
| Cierre fijo | "ConqueRun. Madrid se conquista corriendo." |
| Ligas | "No compites contra élites. Compites contra gente de tu ritmo." |
| Defensa | "Si no corres, tu barrio se debilita." |
| Grupos | "Conquistad Madrid con vuestra crew." |

**Lo que es verdad y podemos contar** (comprobado en el código):

- Cada carrera suma puntos según la distancia y el ritmo, y con ellos se conquistan barrios.
- Los barrios pierden un 10 % de fuerza cada lunes. Si bajan de 50 puntos, quedan libres. La app avisa con "⚠️ Territorio en peligro".
- Cuando alguien te quita un barrio llega "🏴 Territorio perdido: X ya no es tuyo".
- Seis ligas por ritmo: Explorador, Marcador, Retador, Conquistador, Señor del mapa y Leyenda. Compites contra gente de tu nivel.
- Grupos que conquistan juntos, ranking por ciudad, logros ("Primer territorio", "Rey del asfalto", "Mes de hierro") y rachas.
- Importar carreras desde Strava.

**Lo que no se dice:** beneficios de salud ("adelgaza", "mejora tu corazón"), número de usuarios que no tenemos, ni nada que la app no haga aún.

---

## 3. Hoja de ruta

| Fase | Cuándo | Qué | Gasto |
|---|---|---|---|
| **0. Preparar** | Ahora → mediados de dic | Grabar el material de la app, montar el kit de IA, producir los 4 primeros Reels, poner a punto el perfil de Instagram y la ficha de las tiendas | 0 € (más las suscripciones de IA) |
| **1. Orgánico** | Dic → ene | 3 Reels por semana, stories diarias, entrar en 3-5 crews de running de Madrid | 0 € |
| **2. Ráfagas de pago** | Cuando se cumplan las 3 condiciones de abajo | Promocionar solo el Reel que mejor funcione: 25-50 € en 5-7 días, Madrid + 15 km | 50-100 €/mes |
| **3. Escalar** | CPI < 3 € y retención D7 > 15 % | Mismas ráfagas con más presupuesto, más ciudades | 150-300 €/mes |

### Condiciones antes de pagar anuncios

1. **Android en producción.** Pedido el 25 nov. Sin él perdemos más de la mitad del público y el CPI de Android es más barato.
2. **Límite de Strava ampliado.** Hay 6 atletas conectados de 10. Si llega una ola de usuarios, el 11.º no podrá conectar Strava.
3. **Embudo medido en Analytics** (registro, ciudad, GPS, primera carrera, primera conquista). Si una campaña falla, hay que saber en qué paso se cae la gente.

Mientras tanto, todo lo de la fase 1 es gratis y sirve para saber qué Reel merece dinero.

---

## 4. Kit de producción con IA

| Pieza | Herramienta | Para qué | Coste aprox. |
|---|---|---|---|
| Guiones y textos | Claude | Guiones, ganchos, descripciones, variantes A/B | Ya lo tienes |
| Voz en off | **ElevenLabs** (voz en castellano de España) | Narración de todos los Reels | ~5 €/mes (plan Starter, uso comercial) |
| Planos de ambiente | **Higgsfield** (ya en el plan) | Madrid, corredores, transiciones épicas. Nunca pantallas de la app | Plan actual |
| Montaje y subtítulos | **CapCut** | Cortar, subtítulos automáticos, plantillas 9:16 | Gratis / Pro opcional |
| Música | Biblioteca de Instagram (orgánico) o **Sound Collection de Meta** (anuncios) | Las canciones con derechos no valen en anuncios | Gratis |
| Grabación de la app | Grabación de pantalla del iPhone | Todos los planos de la app | Gratis |

### Flujo para cada Reel (unos 45-60 min cuando esté rodado)

1. **Guion:** tomarlo de la sección 6 o pedir a Claude una variante.
2. **Voz:** pegar el texto en ElevenLabs, siempre con la misma voz (que sea "la voz de ConqueRun"). Exportar en MP3.
3. **Pantalla:** sacar los clips del banco de grabaciones (sección 5).
4. **Ambiente:** generar en Higgsfield los planos que pida el guion, en 9:16.
5. **Montaje en CapCut:** voz primero, luego los clips encajados a la voz, subtítulos automáticos en grande (mucha gente ve sin sonido), música baja y logo final con las insignias oficiales de App Store y Google Play.
6. **Publicar:** marcar "Información de IA" si sale una persona o un sitio realista generado con IA. Si solo es la voz, no hace falta, pero no pasa nada por marcarlo.

---

## 5. Banco de grabaciones de la app

Grabar una vez y reutilizar en todos los Reels. Mejor en tu iPhone, después de una carrera real: el simulador usa la base de datos de producción con tu cuenta y no tiene GPS de verdad.

### Antes de grabar

- [ ] Modo No molestar o Concentración activado, para que no entren notificaciones de otras apps.
- [ ] Batería cargada y la hora del reloj limpia (o recortada en el montaje).
- [ ] Usar solo tu cuenta. **No enseñar nicknames de otros usuarios sin su permiso**: los Términos no cubren usar su nombre en publicidad. Desenfocarlos en CapCut.
- [ ] No enseñar tu email, tu fecha de nacimiento ni la pantalla de perfil privada.
- [ ] Mover el mapa despacio: los movimientos rápidos se ven mal en el vídeo.

### Planos que hay que tener

| # | Plano | Cómo conseguirlo |
|---|---|---|
| A1 | Mapa de Madrid desde lejos, con barrios coloreados, acercándose a tu barrio | Pantalla Mapa, zoom lento |
| A2 | Pulsar "Correr" y la cuenta atrás | Al empezar una carrera real |
| A3 | Carrera en marcha: distancia, ritmo y ruta dibujándose | Grabar 10-15 s durante una carrera (con cuidado, parado en un semáforo) |
| A4 | La Live Activity en la pantalla de bloqueo durante la carrera | Bloquear el móvil con la carrera en marcha |
| A5 | Resumen de la carrera con los puntos y el barrio conquistado | Al terminar la carrera |
| A6 | El barrio cambiando a tu color en el mapa | Volver al mapa justo después de la conquista |
| A7 | Detalle del barrio: dueño, puntos | Tocar el barrio conquistado |
| A8 | Ranking de la ciudad, subiendo hasta tu puesto | Pantalla Ranking |
| A9 | Logro desbloqueado | Cuando salte uno. Si no, la lista de logros en el perfil |
| A10 | Notificación "⚠️ Territorio en peligro" o "🏴 Territorio perdido" | Captura cuando llegue de verdad (los lunes). No inventarla |
| A11 | Pantalla de grupos: crear grupo y código | Pantalla Grupos |
| A12 | Tu liga de ritmo | Perfil o ranking, donde salga la liga |
| A13 | Importar desde Strava (botón oficial) | Solo después de ampliar el límite de Strava |

---

## 6. Guiones

Formato común: vertical 9:16, 15-25 s, subtítulos siempre, voz en castellano cercano, tono de juego de estrategia pero sin exagerar. Los planos con ★ son de la app real (sección 5). Los planos con ✦ se generan con IA.

### R1 — "Tu barrio ya tiene dueño" (gancho principal)

**Objetivo:** el Reel principal de la marca. Se entiende sin explicar nada.
**Duración:** 15 s.

| Seg. | Imagen | Voz en off | Texto en pantalla |
|---|---|---|---|
| 0-2 | ✦ Dron sobre Madrid al atardecer, barrios brillando en colores | "Esta mañana, Chamberí tenía otro dueño." | TU BARRIO YA TIENE DUEÑO |
| 2-6 | ★ A3: carrera en marcha, ruta dibujándose | "Salí a correr cinco kilómetros." | 5,2 km |
| 6-10 | ★ A6: el barrio cambia a tu color | "Y ahora es mío." | CONQUISTADO |
| 10-13 | ★ A8: ranking subiendo | "A ver quién me lo quita." | |
| 13-15 | Logo + insignias (solo la de App Store hasta que Android esté en producción) | "ConqueRun. Madrid se conquista corriendo." | Descárgala gratis |

**Necesita:** A3, A6, A8 · 1 plano de Higgsfield (prompt V1 de estrategia-instagram.md) · voz · música épica suave.
**Nota:** cambiar "Chamberí" por el barrio que hayas conquistado de verdad.

### R2 — "ConqueRun en 20 segundos" (explicativo)

**Objetivo:** el Reel fijado en el perfil. Responde a "¿y esto qué es?".
**Duración:** 20 s.

| Seg. | Imagen | Voz en off |
|---|---|---|
| 0-3 | ★ A1: el mapa con barrios de colores | "Esto es Madrid dividido en barrios. Y cada uno tiene dueño." |
| 3-7 | ★ A2 + A3 | "Sales a correr con ConqueRun." |
| 7-11 | ★ A5: resumen con puntos | "Cuanto más lejos y más rápido, más puntos." |
| 11-15 | ★ A6 | "Con esos puntos conquistas los barrios por los que pasas." |
| 15-18 | ★ A10 o A7 | "Pero si dejas de correr, tu barrio se debilita y otro te lo quita." |
| 18-20 | Logo + insignias | "Conquista tu barrio. Es gratis." |

**Necesita:** A1, A2, A3, A5, A6, A7 · sin IA de imagen · voz.

### R3 — "Territorio en peligro" (miedo a perder)

**Objetivo:** contar el decay, el gancho que hace volver a correr.
**Duración:** 15 s.

| Seg. | Imagen | Voz en off |
|---|---|---|
| 0-2 | ★ A10: llega la notificación "⚠️ Territorio en peligro" | "Lunes, siete de la mañana." |
| 2-5 | ✦ Alguien en la cama mira el móvil, luz azul de la pantalla | "Tu barrio está perdiendo fuerza." |
| 5-9 | ✦ Zapatillas atándose rápido, puerta abriéndose | "O sales a defenderlo..." |
| 9-12 | ★ A3 → A6 | "...o mañana es de otro." |
| 12-15 | Logo | "ConqueRun. Tu barrio no se defiende solo." |

**Necesita:** A10 real (esperar a que llegue un lunes), A3, A6 · 2 planos de Higgsfield.
**Prompts:**
- *Person lying in bed at dawn checking smartphone, blue screen light on face, dark bedroom in a Madrid apartment, cinematic, vertical 9:16, photorealistic*
- *Close-up of hands quickly tying running shoes by a front door, early morning light, then the door opens to a Madrid street, cinematic, vertical 9:16*

**Nota:** sale una persona realista generada con IA, así que hay que marcar "Información de IA".

### R4 — "No compites contra élites" (ligas)

**Objetivo:** quitar el miedo de "yo corro lento, no voy a ganar nada".
**Duración:** 20 s.

| Seg. | Imagen | Voz en off |
|---|---|---|
| 0-3 | ✦ Corredor de élite adelantando a toda velocidad a uno normal | "¿Corres a seis y medio el kilómetro? Perfecto." |
| 3-8 | ★ A12: tu liga | "En ConqueRun compites contra gente de tu ritmo." |
| 8-13 | Texto animado con las 6 ligas, de Explorador a Leyenda | "De Explorador a Leyenda. Seis ligas." |
| 13-17 | ★ A8 | "Tu ranking es contra los tuyos." |
| 17-20 | Logo | "Corre a tu ritmo. Conquista igual." |

**Necesita:** A8, A12 · 1 plano de Higgsfield · las ligas en texto (CapCut).

### R5 — "Conquistad Madrid con vuestra crew" (grupos)

**Objetivo:** atraer a crews de running enteras, que es lo que crea densidad en un barrio.
**Duración:** 20 s.

| Seg. | Imagen | Voz en off |
|---|---|---|
| 0-3 | ✦ Grupo de corredores saliendo juntos al amanecer en Madrid Río | "¿Corres con tu crew?" |
| 3-8 | ★ A11: crear grupo y código | "Cread vuestro grupo en ConqueRun." |
| 8-14 | ★ A1: mapa con los barrios del grupo | "Cada carrera de cualquiera suma para el equipo." |
| 14-17 | ★ A8 | "Y competís contra las otras crews de la ciudad." |
| 17-20 | Logo | "Madrid es grande. Repartíosla." |

**Necesita:** A1, A8, A11 · 1 plano de Higgsfield.
**Mejor aún:** grabar a una crew real que lo use. Ese vídeo vale más que cualquier plano de IA.

### R6 — "Mi primera semana conquistando Madrid" (serie personal)

**Objetivo:** contenido auténtico y fácil de sostener. Eres tú usando la app, sin enseñar la cara si no quieres.
**Formato:** serie de 5 Reels cortos (10-15 s), uno por carrera.

- **Día 1:** "Primera carrera. Cero barrios." → A5 + logro "Primer territorio".
- **Día 2:** "Dos barrios. Ya le tengo cariño a Arganzuela." → A6.
- **Día 3:** "Racha de 3 días. Logro desbloqueado." → A9.
- **Día 4:** "Alguien me ha quitado un barrio." → A10 real si llega. Si no, saltar este día.
- **Día 7:** "Semana perfecta. Así está mi mapa." → A1.

**Necesita:** solo la app y la voz. Es lo más barato de producir.

### R7 — "¿Ya usas Strava?" ⛔ No publicar todavía

**Objetivo:** captar a los que ya registran sus carreras en Strava.
**Bloqueado hasta:** que Strava amplíe el límite. Ahora quedan 4 plazas.

| Seg. | Imagen | Voz en off |
|---|---|---|
| 0-3 | Texto: "Llevas 200 carreras en Strava" | "¿Ya registras tus carreras?" |
| 3-10 | ★ A13: botón oficial e importación | "Conecta tu cuenta e importa tus carreras." |
| 10-15 | ★ A6 | "Y descubre qué barrios habrías conquistado." |
| 15-18 | Logo | "ConqueRun. Compatible con Strava." |

**Normas de marca de Strava:** usar solo el botón oficial y "Powered by Strava", no poner su logo como si fuera nuestro y no insinuar que Strava nos patrocina.

### R8 — "¿De quién es tu barrio?" ⛔ Cuando haya actividad

**Objetivo:** que la gente comente su barrio y se lo pase a sus amigos.
**Bloqueado hasta:** que el mapa de Madrid tenga bastantes barrios con dueño. Con el mapa vacío, este vídeo juega en contra.
**Idea:** ★ A1 recorriendo varios barrios + "Comenta tu barrio y te digo quién manda ahí". Respuestas en stories.

---

## 7. Stories y carruseles

**Stories (diarias, 10 s, sin producción):**
- Encuesta: "¿Retiro o Casa de Campo?" · "¿Corres por la mañana o por la noche?"
- Tu carrera del día: A5 en una story.
- Repostear a quien comparta su conquista.

**Carruseles (1 por semana como mucho):**
- "Cómo funciona ConqueRun en 5 pasos" (mapa → correr → puntos → conquistar → defender).
- "Las 6 ligas de ConqueRun: ¿en cuál estás?"
- Más adelante: "Informe de guerra semanal" con los barrios que cambiaron de dueño. Solo con actividad real, y sin nicknames de usuarios sin su permiso.

---

## 8. Calendario de las primeras 4 semanas

| Semana | Lunes | Miércoles | Viernes |
|---|---|---|---|
| 1 | R2 (fijar en el perfil) | R1 | R6 día 1 |
| 2 | R3 | R6 día 2-3 | R4 |
| 3 | R5 | R6 día 4-7 | R1 variante B (otro barrio, otro gancho) |
| 4 | Repetir el que mejor fue, con otro gancho | Carrusel "Cómo funciona" | Reel de una crew si ya hay alguna |

**Antes de la semana 1:**
- [ ] Grabar el banco de planos de la sección 5 (2-3 carreras).
- [ ] Crear la cuenta de ElevenLabs y elegir la voz.
- [ ] Bio de Instagram: "Conquista tu barrio corriendo 🏴 Madrid · Gratis en iPhone", con el enlace a la web. Añadir Android cuando esté en producción.
- [ ] Revisar la ficha de las tiendas: título, subtítulo, capturas con el mapa como primera imagen.

---

## 9. Qué medir y cuándo cambiar

| Métrica | Dónde | Señal |
|---|---|---|
| % de reproducción completa | Insights de Instagram | < 30 %: el gancho de los 2 primeros segundos no funciona. Cambiarlo |
| Guardados y compartidos | Insights | El Reel con más es el candidato a promocionar |
| Tasa de interacción | Insights | < 10 %: no ponerle dinero |
| Primeras descargas | App Store Connect → Análisis, Play Console | Comparar las semanas con y sin Reel |
| Retención D1/D7 | Firebase | D7 < 15 %: el problema no es el marketing, es la app. Parar los anuncios |
| CPI de las ráfagas | Meta Ads | > 4 €: cambiar el creativo, no subir el presupuesto |

---

## 10. Reglas

- La app siempre real. Nada de pantallas o funciones inventadas por la IA.
- Marcar "Información de IA" cuando salgan personas o sitios realistas generados con IA.
- No usar nicknames ni carreras de otros usuarios sin su permiso por escrito.
- Música con licencia para anuncios (Sound Collection de Meta), no canciones comerciales.
- Insignias oficiales de App Store y Google Play, sin modificar.
- Strava: solo sus recursos oficiales y sin insinuar patrocinio.
- Segmentar los anuncios a mayores de 18, aunque la app permite desde 14.
- Nada de promesas de salud ni de cifras de usuarios que no tenemos.
- No pagar anuncios hasta cumplir las 3 condiciones de la sección 3.
