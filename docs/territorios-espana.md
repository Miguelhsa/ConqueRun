# Territorios España

Fecha: 2026-05-03.

## Objetivo

Empezar cobertura nacional sin depender de escribir a mano todos los barrios de España.

La app ya puede leer territorios desde tres capas, en este orden:

1. `territorios` en Firestore.
2. `barrios` en Firestore como fallback legacy.
3. `data/generated/territorios-espana.json` como seed local.

Esto permite que el mapa tenga territorios en España aunque una ciudad aun no este cargada en Firebase.

## Cobertura Inicial

El generador actual crea:

- 52 ciudades: capitales provinciales, Ceuta y Melilla.
- 275 territorios iniciales.
- Ciudades clave con zonas curadas: Donostia, Barcelona, Valencia, Bilbao, Sevilla y Malaga.
- Resto de ciudades con cobertura base: Centro, Norte, Sur, Este y Oeste.

La cobertura base no pretende ser definitiva. Sirve para que todo el tablero funcione mientras se sustituyen zonas genericas por nombres reales procedentes de datos abiertos o revision manual.

## Comando

```bash
npm run territorios:espana
```

Genera:

```text
data/generated/territorios-espana.json
```

## Futuro

Para España completa real:

- Importar barrios/distritos desde OpenStreetMap, datos municipales abiertos o fuentes oficiales.
- Revisar nombres visibles para que sean reconocibles localmente.
- Guardar geometria real o celdas H3/S2, no solo centro/radio.
- Subir a Firestore mediante herramienta admin o Cloud Function, no desde el cliente.

## Regla De Producto

El fallback puede decir Centro/Norte/Sur/Este/Oeste, pero el objetivo final es que las ciudades importantes muestren nombres que la gente reconozca: Chamberi, Amara, Gros, Gracia, Ruzafa, Triana, Indautxu, etc.
