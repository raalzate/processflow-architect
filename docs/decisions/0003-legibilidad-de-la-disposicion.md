# ADR 0003 — La legibilidad de un diagrama es un número, no una opinión

Issue: #376 (feature 017)

- **Fecha:** 2026-09-22
- **Estado:** aceptado
- **Contexto previo:** [ADR 0001](0001-arnes-del-agente.md) · [arquitectura MCP](../architecture/mcp.md)

## Estado y mecanismo

Aceptado el 2026-09-22. Lo que hace cumplir la decisión no es esta prosa:

- `src/lib/layout/metrics.ts` convierte "quedó feo" en números: cruces · relaciones encimadas ·
  relaciones que atraviesan una caja ajena · relaciones sin recorrido.
- `src/lib/layout/__tests__/linea-base.test.ts` corre esos números sobre la topología de los **seis
  diagramas reales** en cada `npm run gate`: si el conjunto se pasa del objetivo, si **un solo**
  diagrama empeora en **cualquiera** de las dos métricas, o si retrocede respecto de lo ya logrado,
  el gate se pone rojo.
- La regla `LEGIBILIDAD` de `src/lib/mcp/quality.ts` lo reporta como hallazgo de `review_diagram`.

## Contexto

Un diagrama generado por MCP llegaba al lienzo con las líneas cruzadas y pasando por encima de las
cajas, y reacomodarlo a mano costaba entre 1 y 3 horas: justo la ventaja que el agente venía a dar.

Dos hallazgos del prototipo fijaron el alcance:

1. **El dolor no son los cruces: es el paso por encima de las cajas.** Mover elementos baja mucho
   los cruces y casi no toca el paso sobre cajas, porque permutar ranuras no sabe de obstáculos.
2. **Rutear cada relación por su cuenta es peor que no rutear.** Con ruteo egoísta el paso sobre
   cajas cae a casi cero pero los cruces se disparan: cada línea esquiva una caja metiéndose en el
   corredor de otra.

## Decisión

Tres módulos puros bajo `src/lib/layout/`, encadenados en un solo sitio (`layoutConMedida`, en
`diagram-builder.ts`), que es el mismo camino del botón «Organizar» y de `relayout_diagram`:

| Módulo | Qué decide |
|---|---|
| `metrics.ts` | cuánto se lee: cruces, relaciones encimadas, paso sobre caja, relaciones sin recorrido |
| `order.ts` | qué elemento ocupa cada ranura de su capa (baricentro + pulido) |
| `routing.ts` | por dónde pasa la relación que en recta pisaría una caja o cruzaría a otra |
| `legible.ts` | los encadena, marca la geometría que genera y compara antes/después |

Reglas que no se negocian, y por qué:

- **Ordenar sólo permuta ranuras.** Las coordenadas del preset no se tocan, así que ningún elemento
  sale de su banda y el aire del diagrama se conserva.
- **Ninguna fase puede empeorar ninguna de las métricas.** El coste combinado por sí solo aceptaba
  cambiar un cruce por dos pasos sobre caja: el número bajaba y el diagrama se leía peor.
- **Lo que no se mide, el optimizador lo explota.** La medida contaba la X real y descartaba el
  solape colineal. Correcto para no inflar los cruces, pero al no contarlo *como nada*, meter una
  relación en un corredor ya ocupado le salía gratis al ruteo: lo prefería. Los seis diagramas daban
  0 cruces con dos líneas encimadas 632 px. El solape es hoy una dimensión propia (#392), y entre
  relaciones que comparten un extremo no cuenta: separarlas es repartir las puntas por el borde del
  nodo (puertos), declarado fuera de alcance.
- **Se rutea la relación que pisaría una caja y la que se cruzaría con otra**, en dos pasadas de
  rip-up & reroute. Con una sola pasada, la que se decidió temprano no se entera de que otra
  terminó pasándole por encima. Lo que no cambia es la garantía: si ninguna candidata baja el
  coste, la relación conserva el enrutado que declara su notación (P6 · FR-014).
- **La geometría del humano es intocable.** La que calcula la disposición se marca (`geometriaAuto`);
  la que no está marcada es de una persona —incluida toda la anterior a esta feature— y sobrevive a
  cualquier reorganización. Arrastrar un quiebre calculado lo vuelve manual.
- **Cero dependencias nuevas.** El algoritmo propio resuelve los seis diagramas en menos de 20 ms;
  `elkjs` habría sumado 1,5 MB a un bundle que ya carga Electron, Puppeteer y Mermaid.

## Números

Sobre los seis diagramas de referencia (108 relaciones), medidos con `metrics.ts`:

| | Cruces | Encimadas | Sobre caja ajena |
|---|---|---|---|
| Disposición de partida (la estrategia sola) | 9 | 8 | 17 |
| Con orden y ruteo | **3** | **0** | **0** |

Ningún diagrama empeora en ninguna de las tres métricas. El objetivo del spec era ≤6 cruces y ≤2
sobre caja; el solape no estaba en el spec porque nadie lo había medido (ver abajo).

Esos números son un **trinquete**: cada fixture registra lo que se logró (`logrado`) y el gate lo
exige, porque cumplir el objetivo del spec dejaría pasar un retroceso de 0 a 5 cruces sin una sola
prueba en rojo.

La línea base del spec (16 / 22) venía del prototipo, que contaba también el solape colineal como
cruce y medía desde el centro de la caja en vez del borde. La métrica que se entrega cuenta sólo la
X real y mide el trazo que se dibuja; por eso los números de partida son otros y quedan registrados
en `src/lib/layout/__tests__/fixtures/index.ts`, que es donde el gate los compara.

## Consecuencias

- Los diagramas ya guardados **no se migran**: cambian cuando alguien los reorganiza. Es el
  comportamiento de siempre de `relayout_diagram`.
- La estrategia por defecto de DDD pasa de `radial` a **`flujo`** (#387). Medido con la feature
  entera sobre los diagramas de dominio: `flujo` 0 cruces / 0 sobre caja, `radial` 1/2, `capas` 2/4.
  Las relaciones de DDD tienen dirección (Actor → Comando → Evento → Política) y el avance por flujo
  la aprovecha; el radial repartía en anillos y las relaciones se cortaban en el centro. La decisión
  dejó de ser una opinión: el test `TS-023` compara la del registro contra todas las demás y se
  pondrá rojo el día que otra sea mejor. El MER sigue siendo radial: ahí la entidad con sus
  atributos alrededor es la lectura correcta.
- Quedan **fuera de alcance**, declarados: separar relaciones paralelas o bidireccionales que
  comparten trazo, repartir extremos por el borde (puertos), y los mensajes de un diagrama de
  secuencia, donde manda el tiempo y no la geometría.
