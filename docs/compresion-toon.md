# Compresión de contexto — de grafo a TOON

Cómo el modelo de dominio (`GraphData`) pasa de vivir en el lienzo a inyectarse al
LLM gastando el mínimo de tokens. La lógica es pura y testeable:
[`src/lib/ai/graph-toon.ts`](../src/lib/ai/graph-toon.ts).

El grafo se inyecta como contexto a la IA (agente ReAct, tareas de `tasks.ts`). En
JSON crudo gasta muchos tokens: repite las claves en cada nodo/arista y arrastra
**geometría del lienzo** (x/y, anchos, colores, anclas) e **internos de d3**
(`vx`/`vy`/`fx`/`fy`/`index`) que a la IA no le dicen nada.

El mecanismo son **dos pasos**:

```
GraphData (lienzo)  ──1) pruneNoise──▶  grafo semántico  ──2) encodeToon──▶  TOON
     JSON crudo                            JSON podado                       (al LLM)
```

1. **Podar** el ruido de presentación. Solo sobrevive lo semántico: `id`, `nombre`,
   `tipo_elemento`, `descripcion`, relaciones… (`pruneNoise`, recursivo, no muta).
2. **Codificar** en TOON: los arrays uniformes de objetos se vuelven una tabla
   `campo[N]{col1,col2}:` + filas CSV, en vez de repetir llaves y comillas en cada
   elemento (`encodeToon`).

El sitio que arma el prompt usa `safeGraphToToon`, que ante cualquier fallo degrada
a `JSON.stringify` para no romper el turno del agente.

---

## Ejemplo end-to-end

Grafo de un Event Storming de "Reservas de Hotel" (1 big picture, 1 agregado, 1 read
model). Las tres etapas de abajo son **salida real** de las funciones del módulo.

### 1) JSON crudo — lo que vive en el lienzo

Cada nodo arrastra `x`, `y`, `width`, `height`, `color`, `vx`, `vy`, `index`… Cada
arista arrastra además `source`/`target` (referencias circulares al nodo, duplican
`fuente`/`destino`), `routing`, `arrow`, `sourceAnchor`, `midpoints`…

```json
{
  "nombre_proyecto": "Reservas de Hotel",
  "version": "1.0",
  "fecha_analisis": "2026-07-16",
  "big_picture": {
    "descripcion": "Flujo de reserva desde búsqueda hasta pago",
    "hotspots": ["¿Overbooking?", "¿Política de cancelación?"],
    "nodos": [
      {
        "id": "n1",
        "nombre": "Buscar disponibilidad",
        "tipo_elemento": "comando",
        "estado_comparativo": "nuevo",
        "x": 120.4, "y": 340.9, "width": 160, "height": 80,
        "color": "#fca5a5", "vx": 0.01, "vy": -0.3, "index": 0
      },
      {
        "id": "n2",
        "nombre": "Habitación reservada",
        "tipo_elemento": "evento",
        "estado_comparativo": "nuevo",
        "x": 420.1, "y": 118.7, "width": 160, "height": 80,
        "color": "#fdba74", "vx": 0, "vy": 0, "index": 1
      }
    ],
    "aristas": [
      {
        "fuente": "n1", "destino": "n2",
        "descripcion": "reserva confirmada",
        "estado_comparativo": "nuevo",
        "source": "n1", "target": "n2",
        "routing": "orthogonal", "arrow": "end",
        "sourceAnchor": { "x": 1, "y": 0.5 },
        "targetAnchor": { "x": 0, "y": 0.5 },
        "midpoints": [{ "x": 300, "y": 200 }]
      }
    ]
  },
  "agregados": [
    {
      "nombre_agregado": "Reserva",
      "entidad_raiz": "Reserva",
      "descripcion": "Agregado que gobierna el ciclo de vida de una reserva",
      "x": 80, "y": 60, "width": 600, "height": 400,
      "color": "#eef2ff", "borderColor": "#6366f1",
      "nodos": [
        {
          "id": "r1", "nombre": "Confirmar reserva",
          "tipo_elemento": "comando", "estado_comparativo": "nuevo",
          "x": 100, "y": 120, "width": 160, "height": 80,
          "color": "#93c5fd", "vx": 0, "vy": 0, "fx": null, "fy": null, "index": 0
        },
        {
          "id": "r2", "nombre": "Reserva confirmada",
          "tipo_elemento": "evento", "estado_comparativo": "nuevo",
          "x": 360, "y": 120, "width": 160, "height": 80,
          "vx": 0, "vy": 0, "index": 1
        }
      ],
      "aristas": [
        {
          "fuente": "r1", "destino": "r2", "descripcion": "",
          "estado_comparativo": "nuevo",
          "source": "r1", "target": "r2",
          "dashed": false, "sourceAnchor": { "x": 1, "y": 0.5 }
        }
      ]
    }
  ],
  "read_models": [
    {
      "nombre": "Disponibilidad",
      "descripcion": "Vista de cuartos libres",
      "proyecta": ["Reserva confirmada"],
      "ui_policies": ["refrescar cada 30s"],
      "tecnologias": ["Redis"]
    }
  ],
  "responsables": ["equipo-reservas"],
  "notas": "Modelo inicial del taller",
  "transcript": "Facilitador: empecemos por la búsqueda… (transcripción larga del workshop)"
}
```

### 2) JSON podado — tras `pruneNoise`

Desaparece toda la geometría (`x`/`y`/`width`/`height`), los colores
(`color`/`borderColor`), los internos de d3 (`vx`/`vy`/`fx`/`fy`/`index`), las anclas
y quiebres de aristas (`sourceAnchor`/`targetAnchor`/`midpoints`), el enrutado
(`routing`/`arrow`) y las referencias circulares (`source`/`target`). Queda solo lo
semántico:

```json
{
  "nombre_proyecto": "Reservas de Hotel",
  "version": "1.0",
  "fecha_analisis": "2026-07-16",
  "big_picture": {
    "descripcion": "Flujo de reserva desde búsqueda hasta pago",
    "hotspots": ["¿Overbooking?", "¿Política de cancelación?"],
    "nodos": [
      { "id": "n1", "nombre": "Buscar disponibilidad", "tipo_elemento": "comando", "estado_comparativo": "nuevo" },
      { "id": "n2", "nombre": "Habitación reservada", "tipo_elemento": "evento", "estado_comparativo": "nuevo" }
    ],
    "aristas": [
      { "fuente": "n1", "destino": "n2", "descripcion": "reserva confirmada", "estado_comparativo": "nuevo" }
    ]
  },
  "agregados": [
    {
      "nombre_agregado": "Reserva",
      "entidad_raiz": "Reserva",
      "descripcion": "Agregado que gobierna el ciclo de vida de una reserva",
      "nodos": [
        { "id": "r1", "nombre": "Confirmar reserva", "tipo_elemento": "comando", "estado_comparativo": "nuevo" },
        { "id": "r2", "nombre": "Reserva confirmada", "tipo_elemento": "evento", "estado_comparativo": "nuevo" }
      ],
      "aristas": [
        { "fuente": "r1", "destino": "r2", "descripcion": "", "estado_comparativo": "nuevo", "dashed": false }
      ]
    }
  ],
  "read_models": [
    {
      "nombre": "Disponibilidad",
      "descripcion": "Vista de cuartos libres",
      "proyecta": ["Reserva confirmada"],
      "ui_policies": ["refrescar cada 30s"],
      "tecnologias": ["Redis"]
    }
  ],
  "responsables": ["equipo-reservas"],
  "notas": "Modelo inicial del taller",
  "transcript": "Facilitador: empecemos por la búsqueda… (transcripción larga del workshop)"
}
```

### 3) TOON — lo que se inyecta al LLM

Los arrays de nodos y aristas colapsan a una **tabla**: la cabecera
`nodos[2]{id,nombre,tipo_elemento,estado_comparativo}:` declara las columnas UNA vez,
y cada nodo es una fila CSV. Se acabaron las llaves, comillas y claves repetidas.

```
nombre_proyecto: Reservas de Hotel
version: 1.0
fecha_analisis: 2026-07-16
big_picture:
  descripcion: Flujo de reserva desde búsqueda hasta pago
  hotspots[2]: ¿Overbooking?,¿Política de cancelación?
  nodos[2]{id,nombre,tipo_elemento,estado_comparativo}:
    n1,Buscar disponibilidad,comando,nuevo
    n2,Habitación reservada,evento,nuevo
  aristas[1]{fuente,destino,descripcion,estado_comparativo}:
    n1,n2,reserva confirmada,nuevo
agregados[1]:
  -
    nombre_agregado: Reserva
    entidad_raiz: Reserva
    descripcion: Agregado que gobierna el ciclo de vida de una reserva
    nodos[2]{id,nombre,tipo_elemento,estado_comparativo}:
      r1,Confirmar reserva,comando,nuevo
      r2,Reserva confirmada,evento,nuevo
    aristas[1]{fuente,destino,descripcion,estado_comparativo,dashed}:
      r1,r2,"",nuevo,false
read_models[1]:
  -
    nombre: Disponibilidad
    descripcion: Vista de cuartos libres
    proyecta[1]: Reserva confirmada
    ui_policies[1]: refrescar cada 30s
    tecnologias[1]: Redis
responsables[1]: equipo-reservas
notas: Modelo inicial del taller
transcript: "Facilitador: empecemos por la búsqueda… (transcripción larga del workshop)"
```

### Métricas del ejemplo

| Etapa | Tamaño | Reducción vs crudo |
|-------|-------:|-------------------:|
| JSON crudo (lienzo) | 1960 chars | — |
| JSON podado (`pruneNoise`) | 1317 chars | −32,8 % |
| **TOON (al LLM)** | **1161 chars** | **−40,8 %** |

El ahorro crece con el tamaño del grafo: cuantos más nodos/aristas comparten
columnas, más se amortiza la cabecera de la tabla y más pesa no repetir claves. En
grafos reales de decenas de nodos la reducción supera con holgura ese 40 %.

---

## Las tres formas de un array en TOON

`encodeArrayEntry` elige según el contenido:

| Caso | Forma | Ejemplo del módulo |
|------|-------|--------------------|
| Escalares | En línea | `hotspots[2]: ¿Overbooking?,¿Política de cancelación?` |
| Objetos planos con **mismas claves** y valores escalares | Tabla CSV | `nodos[2]{id,nombre,…}:` + filas |
| Mixto / anidado (p. ej. `agregados`, que llevan sub-arrays) | Lista con marcador `-` y bloque indentado | `agregados[1]:` → `-` → bloque |

Reglas de entrecomillado (`scalarToToon`): un valor se entrecomilla solo si está
vacío, tiene coma/dos-puntos/comilla/salto de línea, o espacios al borde — por eso
`descripcion: ""` sale como `"",` en la fila de la arista.

## Detalles que evitan que el contexto se degrade

- **Tope del `transcript`** (`TRANSCRIPT_BUDGET = 1500`): la transcripción del taller
  es prosa cruda de baja densidad; sin tope, un transcript largo ahogaría los
  nodos/aristas dentro del recorte global del contexto. Se trunca con `…`.
- **`TOON_LEGEND`**: una línea que se inyecta UNA vez en el contexto para que el
  modelo (incluido el LiteRT local, pequeño) sepa leer el formato tabular.
- **`safeGraphToToon`** nunca lanza: ante un grafo mal formado degrada a JSON
  compacto, para no tumbar el turno del agente.

## Reproducir estos números

Las tres salidas de arriba son output literal de `pruneNoise` y `graphToToon`. Para
regenerarlas con otro grafo, importá las funciones del módulo y pasá tu `GraphData`;
la cobertura del formato vive en
[`src/lib/ai/__tests__/graph-toon.test.ts`](../src/lib/ai/__tests__/graph-toon.test.ts).
