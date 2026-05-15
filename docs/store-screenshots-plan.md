# Store screenshots - ConqueRun

Plan recomendado para preparar los screenshots de lanzamiento en App Store y Google Play.

## Enfoque

La promesa que debe entenderse en 3 segundos:

**Corre por tu ciudad. Conquista zonas. Defiende tu territorio.**

No vender ConqueRun como una app de estadisticas. Strava ya ocupa ese espacio. Los screenshots deben vender el juego urbano: mapa, carrera, conquista, ranking justo por liga de ritmo y equipos.

## Requisitos tecnicos

### App Store

Fuente oficial: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications

- Formato: PNG o JPG.
- Cantidad: 1 a 10 screenshots por dispositivo/localizacion.
- iPhone recomendado: 6.9" en vertical.
- Tamaños aceptados 6.9":
  - `1260 x 2736`
  - `1290 x 2796`
  - `1320 x 2868`
- Como `ios.supportsTablet` esta en `true`, tambien preparar iPad.
- iPad 13" recomendado:
  - `2048 x 2732`
  - `2064 x 2752`

### Google Play

Fuente oficial: https://support.google.com/googleplay/android-developer/answer/9866151

- Formato: JPG o PNG 24-bit sin alpha.
- Minimo: 2 screenshots.
- Maximo: 8 screenshots por tipo de dispositivo.
- Minimo por lado: 320 px.
- Maximo por lado: 3840 px.
- La dimension larga no puede ser mas de 2x la dimension corta.
- Recomendado para buena presencia:
  - 4+ screenshots.
  - Vertical `1080 x 1920` o superior.
  - Taglines maximo 20% del area.
  - Evitar CTAs tipo "descarga ahora", "instala ya", "pruebalo".
- Feature graphic obligatorio:
  - `1024 x 500`
  - JPG o PNG 24-bit sin alpha.

## Set recomendado

Preparar 8 screenshots. El mismo concepto sirve para iOS y Android, cambiando solo el tamaño/captura.

| # | Pantalla | Mensaje principal | Submensaje | Objetivo |
|---|---|---|---|---|
| 01 | Mapa | Conquista tu ciudad corriendo | Cada zona puede cambiar de dueño | Presentar la fantasia central |
| 02 | Correr | Corre y suma puntos reales | Distancia, ritmo y GPS deciden tu avance | Mostrar accion principal |
| 03 | Resumen carrera | Gana barrios al terminar | Ve que zonas conquistas, defiendes o atacas | Mostrar recompensa inmediata |
| 04 | Ranking | Compite en tu liga de ritmo | Ranking justo por genero, edad y ritmo | Explicar competicion justa |
| 05 | Equipos | Conquista con tu equipo | Elige equipo al terminar cada carrera | Mostrar capa social |
| 06 | Strava | Importa conquistas de Strava | Solo carreras con GPS valido cuentan | Reducir friccion de entrada |
| 07 | Perfil | Sigue tu progreso | Barrios, puntos, logros y ritmo de conquista | Mostrar progresion |
| 08 | Logros/defensa | Defiende lo que ganaste | Recibe avisos y vuelve a recuperar zonas | Mostrar retencion |

## Orden final recomendado

### App Store

1. `01_mapa_conquista`
2. `02_correr_puntos`
3. `03_resumen_conquistas`
4. `04_ranking_liga`
5. `05_equipos`
6. `06_strava`
7. `07_perfil`
8. `08_logros_defensa`

Motivo: Apple suele mostrar los primeros 3 con mas fuerza. Deben explicar mapa, accion y recompensa.

### Google Play

1. `01_mapa_conquista`
2. `03_resumen_conquistas`
3. `02_correr_puntos`
4. `04_ranking_liga`
5. `05_equipos`
6. `06_strava`
7. `07_perfil`
8. `08_logros_defensa`

Motivo: en Google Play los dos primeros screenshots pesan mucho visualmente. Conviene abrir con mapa + resultado, no con metricas.

## Copy exacto recomendado

Mantener los textos cortos. No usar "gratis", "mejor", "#1", "nuevo", "descarga", "instala" ni promesas exageradas.

### 01 Mapa

Titulo:
`Conquista tu ciudad corriendo`

Subtitulo:
`Cada zona puede cambiar de dueño`

### 02 Correr

Titulo:
`Corre y suma puntos reales`

Subtitulo:
`Tu ritmo y distancia deciden el ataque`

### 03 Resumen

Titulo:
`Gana barrios al terminar`

Subtitulo:
`Conquista, defiende o prepara el siguiente intento`

### 04 Ranking

Titulo:
`Compite en tu liga`

Subtitulo:
`Ritmo, edad y genero crean rankings mas justos`

### 05 Equipos

Titulo:
`Conquista con tu equipo`

Subtitulo:
`Asigna cada carrera al grupo que quieras`

### 06 Strava

Titulo:
`Importa carreras de Strava`

Subtitulo:
`Solo rutas GPS validas se convierten en conquistas`

### 07 Perfil

Titulo:
`Mide tu dominio`

Subtitulo:
`Barrios, puntos, logros y ritmo de conquista`

### 08 Retencion

Titulo:
`Defiende tus zonas`

Subtitulo:
`Vuelve cuando alguien te arrebate territorio`

## Datos de demo para capturar

Usar una cuenta de prueba limpia, no la cuenta personal.

Perfil:
- Nickname: `NereaRun`
- Ciudad: Madrid
- Liga visible: una liga intermedia, no la mas rapida
- Ritmo 30 dias: cercano a `5:10/km`
- 4-8 barrios conquistados
- 1-2 grupos
- 2-3 logros desbloqueados

Mapa:
- Mostrar Madrid con varias zonas libres, propias y rivales.
- En equipos, mostrar al menos 2 equipos propios con colores distintos si se captura esa vista.
- Evitar que aparezca el tab `Admin`.

Ranking:
- Mostrar top 10 poblado.
- Que el usuario aparezca como `tu`.
- Evitar nombres ofensivos o datos reales.
- Fotos aprobadas o avatares limpios.

Correr:
- Usar una carrera demo terminada con:
  - 5-7 km
  - ritmo 5:00-5:30/km
  - 1-3 zonas conquistadas
  - 1 zona defendida

Strava:
- Mostrar el boton y/o modal de conexion.
- No mostrar errores OAuth, URLs, codigos ni navegador.

## Criterios visuales

- Paleta: fondo oscuro ConqueRun + dorado + rojo conquista + azul mapa.
- Usar el mapa y UI real como protagonista.
- No meter demasiado texto: maximo 2 lineas de titulo y 1 linea de subtitulo.
- No usar mockups con telefonos obsoletos.
- No mostrar notificaciones reales, emails, codigos secretos, token, URL OAuth ni datos personales.
- En Google Play, limpiar status bar: sin notificaciones, bateria llena, WiFi/cobertura normales.
- Mantener el idioma en español para el primer lanzamiento en España.

## Estructura de carpetas sugerida

```text
store-assets/
  ios/
    iphone-6_9/
      01_mapa_conquista_1290x2796.png
      02_correr_puntos_1290x2796.png
      03_resumen_conquistas_1290x2796.png
      04_ranking_liga_1290x2796.png
      05_equipos_1290x2796.png
      06_strava_1290x2796.png
      07_perfil_1290x2796.png
      08_logros_defensa_1290x2796.png
    ipad-13/
      01_mapa_conquista_2048x2732.png
      ...
  google-play/
    phone/
      01_mapa_conquista_1080x1920.png
      ...
    tablet/
      01_mapa_conquista_1600x2560.png
      ...
    feature-graphic_1024x500.png
```

## Feature graphic Google Play

Concepto:

`ConqueRun` como titulo pequeno, mapa oscuro de ciudad de fondo, zonas marcadas en dorado/rojo/azul, y una frase corta:

`Corre. Conquista. Defiende.`

No poner telefono gigante ni texto pequeno. Google recomienda evitar graficas sobrecargadas y mantener el foco en el centro.

## Checklist antes de exportar

- [ ] No aparece `Admin`.
- [ ] No aparecen emails ni datos reales.
- [ ] No aparece codigo Strava ni URL OAuth.
- [ ] No aparecen permisos del sistema en screenshots.
- [ ] No aparecen errores, alerts ni estados vacios.
- [ ] Mapa con territorios visibles y entendibles.
- [ ] Ranking poblado.
- [ ] Perfil con logros/barrios/puntos.
- [ ] Grupos con nombres limpios.
- [ ] Status bar limpia.
- [ ] Capturas en PNG/JPG sin transparencia.
- [ ] Textos revisados en iOS y Android.

