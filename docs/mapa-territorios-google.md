# Mapa De Territorios Y Futuro Google Maps

Fecha: 2026-05-03.

## Decision

El mapa es el tablero principal de ConqueRun. Debe mostrar la separacion territorial completa:

- Territorios libres.
- Territorios del usuario.
- Territorios de otros corredores.
- Nombres reconocibles.
- Detalle al tocar una zona.

Esto no es demasiado para el producto; es el centro del juego. Lo importante es controlar densidad visual.

## Implementacion Actual

La app usa `react-native-maps` y pinta territorios con:

- `Circle` para area jugable.
- `Marker` para etiqueta.
- Panel inferior al seleccionar.
- Leyenda con conteo de libres, propios y rivales.

Las etiquetas se ocultan al alejar el mapa para evitar ruido visual. Al acercar, vuelven a aparecer.

## Abstraccion Preparada

La logica visual de territorios vive en `utils/mapaTerritorios.js`:

- Estado de territorio: libre, propio, rival.
- Color/fill/stroke.
- Nombre visible.
- Conteo por estado.
- Regla de visibilidad de etiquetas por zoom.

Esto permite migrar el render del mapa sin cambiar las reglas de producto.

## Futuro Con Google Maps

Cuando se pase a Google Maps o una capa avanzada, la estructura deberia ser:

- Datos: `territorios`.
- Estilo: `mapaTerritorios`.
- Render actual: `Circle`/`Marker`.
- Render futuro: Google Maps polygons, data layer, vector tiles o tile overlays.

Para MVP se aceptan circulos porque validan juego y producto. Para produccion mundial, lo recomendable es:

1. Usar poligonos o celdas H3/S2, no circulos.
2. Renderizar por viewport/zoom, no cargar toda una ciudad grande de golpe.
3. Usar clusters o tiles vectoriales si hay miles de territorios.
4. Mostrar nombres solo a zoom suficiente.
5. Mantener el panel de detalle como UI propia de la app, no dependiente del proveedor de mapas.

## Regla De Producto

El usuario debe ver nombres humanos:

- Chamberi.
- Amara.
- Gros.
- Retiro.
- Malasaña.

Nunca debe ver IDs tecnicos como `h3_89390...` salvo en herramientas internas.
