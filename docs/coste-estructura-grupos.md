# Estudio De Coste: Carreras, Grupos Y Aportaciones

Fecha: 2026-05-03.

Este documento estima el coste de la estructura de grupos propuesta para ConqueRun. Los precios cambian por region y por contrato, asi que estos numeros son orientativos y deben revisarse antes de produccion.

Fuentes oficiales revisadas:

- Firebase Pricing: https://firebase.google.com/pricing
- Firestore Pricing: https://cloud.google.com/firestore/pricing
- Firestore Billing: https://firebase.google.com/docs/firestore/pricing
- Cloud Functions Pricing: https://cloud.google.com/functions/pricing-1stgen

## Modelo Implementado

Una carrera se guarda como fuente individual:

- `carreras/{carreraId}`
- `usuarios/{uid}` con agregados personales.
- `barrios/{barrioId}` si hay conquista individual.
- `territorioCarrera` dentro de la carrera, con metros y puntos generados por barrio.

Despues, si el usuario pertenece a grupos:

- Se crea una aportacion por grupo en `aportacionesGrupo`.
- Se incrementan agregados del grupo en `grupos`.
- Se actualiza `conquistasGrupo` si el grupo supera la marca existente de una zona.
- La conquista de grupo usa puntos de esa zona, no los puntos completos de la carrera.

La carrera no multiplica puntos individuales. El multiplicador de grupo solo afecta a `puntosGrupo`.

## Coste Unitario Por Carrera

Variables:

- `G`: numero de grupos del usuario.
- `B`: barrios o zonas tocadas por la carrera.

Coste especifico de grupos:

```text
lecturas_grupo ~= G + B
escrituras_grupo ~= G aportaciones + G agregados_grupo + B conquistas_grupo
escrituras_grupo ~= 2G + B
```

Notas:

- En cliente, las reglas de seguridad pueden anadir lecturas internas con `get()` para validar pertenencia al grupo.
- En backend con Admin SDK esas lecturas de reglas desaparecen, y la validacion se hace dentro de la funcion.
- Si una carrera no toca barrios, `B` puede ser 0 para conquistas de grupo.

## Precios Base Usados

Firestore Standard, region economica tipo `us-central1`, segun tabla oficial:

- Lecturas: alrededor de 0.03 USD por 100.000 documentos.
- Escrituras: alrededor de 0.09 USD por 100.000 documentos.
- Almacenamiento: alrededor de 0.15 USD por GB/mes.

Cuota gratuita habitual:

- 50.000 lecturas/dia.
- 20.000 escrituras/dia.
- 1 GB almacenado.

Cloud Functions/Firebase:

- 2M invocaciones/mes sin coste.
- Despues, 0.40 USD por millon de invocaciones.
- Tambien cuentan GB-seconds y CPU-seconds, con cuotas gratuitas relevantes.

## Escenarios De Ejemplo

Suposicion media:

- `G = 2` grupos por usuario.
- `B = 3` barrios tocados por carrera.

Entonces:

```text
lecturas_grupo ~= 5 por carrera
escrituras_grupo ~= 7 por carrera
```

### 10.000 carreras/mes

```text
lecturas_grupo ~= 50.000
escrituras_grupo ~= 70.000
```

Coste aproximado fuera de cuota gratuita:

- Lecturas: 0.02 USD.
- Escrituras: 0.06 USD.
- Funciones: probablemente dentro de cuota gratuita.

Conclusion: coste despreciable.

### 100.000 carreras/mes

```text
lecturas_grupo ~= 500.000
escrituras_grupo ~= 700.000
```

Coste aproximado:

- Lecturas: 0.15 USD.
- Escrituras: 0.63 USD.
- Funciones: dentro de cuota gratuita si hay una funcion por carrera.
- Almacenamiento: bajo, salvo que las rutas GPS sean muy pesadas.

Conclusion: muy barato. El coste principal no sera grupos, sino almacenamiento de rutas, lecturas de rankings y mapas.

### 1.000.000 carreras/mes

```text
lecturas_grupo ~= 5.000.000
escrituras_grupo ~= 7.000.000
```

Coste aproximado:

- Lecturas: 1.50 USD.
- Escrituras: 6.30 USD.
- Funciones: dentro de las 2M invocaciones gratuitas si hay una funcion por carrera.
- Almacenamiento de aportaciones: bajo-medio. Si cada aportacion indexada pesa 1-3 KB y hay 2M aportaciones, puede moverse en pocos GB.

Conclusion: la estructura de aportaciones escala bien.

### 10.000.000 carreras/mes

```text
lecturas_grupo ~= 50.000.000
escrituras_grupo ~= 70.000.000
```

Coste aproximado:

- Lecturas: 15 USD.
- Escrituras: 63 USD.
- Funciones: 8M invocaciones facturables si hay 10M invocaciones y 2M son gratuitas: unos 3.20 USD solo en invocaciones, mas computo.
- Almacenamiento: puede empezar a ser visible por rutas GPS, aportaciones e indices.

Conclusion: incluso a escala alta, el coste directo de grupos sigue siendo razonable. La arquitectura debe vigilar rutas GPS, listeners en tiempo real, indices y consultas de ranking.

## Donde Puede Subir El Coste

- Guardar rutas GPS completas con demasiados puntos.
- Guardar rutas GPS completas permanentemente. A escala mundial conviene guardar permanente el resumen `territorioCarrera` y aplicar retencion/simplificacion a la ruta completa.
- Escuchar rankings en tiempo real con muchos usuarios conectados.
- Consultar historial sin paginacion.
- Recalcular rankings leyendo carreras en vez de usar agregados.
- Reglas de seguridad con muchos `get()` por escritura desde cliente.
- Indices automaticos sobre campos que no se consultan.

## Recomendacion Tecnica

MVP actual:

- Cliente crea carrera.
- Cliente crea aportaciones.
- Cliente actualiza agregados.

Produccion mundial:

- Cliente envia carrera.
- Cloud Function valida y calcula.
- Cloud Function crea aportaciones.
- Cloud Function actualiza agregados.
- Rankings leen documentos agregados.

Esto reduce fraude, reduce escrituras fallidas a medias, simplifica reglas y hace el coste mas predecible.

## Decision De Producto Relacionada

La estructura es compatible con:

- Competicion individual sin depender de grupos.
- Competicion de grupo por puntos acumulados.
- Aportacion a todos los grupos del usuario.
- Multiplicador de grupo limitado a x1.10.
- Futuras temporadas sin romper el historico: bastaria con anadir `temporadaId` a carreras y aportaciones.
