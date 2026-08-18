# spec · 005 — El agente recupera el contexto por partes y consulta al humano

**Estado:** propuesta · **Creada:** 2026-08-18 · **Toca:** `src/lib/ai/` (`litert-agent.ts` y dos módulos
nuevos: `agent-retrieval.ts`, `agent-run.ts`), `src/lib/agent-types.ts`,
`src/context/AgentContext.tsx`, `src/components/ai-panel/AgentChatPanel.tsx`

## Problema

Un artefacto (drivers, riesgos, propuesta técnica, roadmap, ADR, diagrama) sólo es bueno si vio el
dominio completo. Hoy el agente no lo ve:

1. **El contexto se decide antes de saber qué hace falta.** `buildContext`
   (`src/lib/ai/litert-agent.ts:280`) recibe un paquete fijo: el modelo principal en TOON (recortado
   a 8 000 caracteres), el **listado** de vistas (nombre, tipo, notación — sin contenido) y sólo las
   vistas que el usuario pineó a mano. `AgentContext.tsx:435` manda `views.map(...)` con nombre y
   notación; el contenido llega únicamente por `injectedViews` (`AgentContext.tsx:401`).
2. **El techo del pineo es 10 y el del proyecto 50.** `MAX_INJECTED_VIEWS = 10`
   (`src/lib/views-types.ts:42`) contra `MAX_CUSTOM_VIEWS = 50`: con el dominio repartido, 40 vistas
   son invisibles y **el usuario no se entera de qué quedó afuera**. El artefacto sale confiado y
   parcial, que es peor que salir corto.
3. **Pinear todo tampoco sirve.** 10 vistas × 8 000 caracteres son ~80 000 caracteres de prefill
   para un modelo local: lento, y el modelo pierde el hilo. El presupuesto se gasta en vistas que no
   tenían nada que ver con lo que se pidió.
4. **El bucle es una caja negra de 5 turnos.** `MAX_TURNS = 5` (`litert-agent.ts:389`) alcanza para
   *pensar → generar → cerrar*, no para *explorar*. Y mientras corre, el usuario no puede corregir el
   rumbo: `runLitertAgent` es una llamada que empieza y termina, sin punto de decisión en medio.
   Cuando el agente supone mal —dos nodos de vistas distintas que quizá son el mismo concepto— la
   suposición viaja silenciosa hasta el artefacto.
5. **El artefacto no dice de dónde salió.** No hay forma de auditar una afirmación contra el modelo:
   quien revisa tiene que creerle.

El pedido: **la recuperación del contexto es trabajo del agente, no un paquete previo**; el humano
decide en dos puntos concretos; y el artefacto final cita sus fuentes.

## Usuarios y valor

- **Quien pide un artefacto** obtiene uno que barrió las vistas que importaban, sin pinear nada a
  mano, y ve en el chat qué leyó y qué decidió.
- **Quien revisa el artefacto** puede seguir cada afirmación hasta la vista o el nodo que la
  sostiene, y detectar lo que el agente inventó.
- **Quien conoce el dominio** corrige antes de que se genere: aprueba o ajusta el plan y resuelve las
  ambigüedades reales, en vez de descubrir el problema en el resultado.
- **Quien programa acá** tiene la recuperación y el ciclo de vida de la corrida en `src/lib/` (puro,
  con pruebas); el chat sólo pinta estado y devuelve respuestas.

## Decisión de diseño

### 1 · La corrida del agente es reanudable

Hoy `runLitertAgent` empieza y termina en una llamada. Para que el humano decida en medio, la corrida
pasa a tener **estado explícito** y tres salidas posibles por paso:

- `done` — hay respuesta (y quizá artefactos): el turno terminó.
- `awaiting` — el agente necesita al humano: trae un **plan** para aprobar o una **pregunta** con
  opciones. La corrida queda guardada en el mensaje del chat, esperando.
- `working` — hay progreso para mostrar (leyó una vista, buscó un término): se pinta y sigue.

Reanudar es pasar la respuesta del humano a la corrida guardada. El estado es **datos serializables**
(no una promesa a medias): si la app se recarga con una corrida esperando, se reconstruye del
transcript en vez de perderse — y si no se puede reconstruir, la corrida se marca cancelada con un
mensaje claro, nunca en silencio.

### 2 · Herramientas de LECTURA, no un paquete de contexto

El único contexto inyectado de entrada es el **modelo principal** (lo que ya se hace) y el
**inventario** de vistas. El resto lo pide el agente:

| Herramienta | Devuelve | Para qué |
|---|---|---|
| `list_views` | nombre · notación · nº de nodos y aristas · si está vacía | decidir qué vale la pena leer |
| `read_view(nombre)` | el grafo de esa vista en TOON | leer una vista completa |
| `search_model(término)` | nodos y aristas que coinciden, **con la vista donde viven** | encontrar el concepto sin leer 40 vistas |

Son de sólo lectura: ninguna modifica el modelo. La **resolución de nombres es tolerante** (sin
acentos, sin distinguir mayúsculas, y con la sugerencia más cercana cuando no hay coincidencia
exacta), porque el modelo local escribe los nombres de memoria y una vista "no encontrada" por un
acento arruina la corrida.

### 3 · Presupuesto explícito, no recortes por bloque

Hoy cada bloque tiene su propio tope (8 000 el grafo, 8 000 por vista, 3 000 por artefacto, 12 000
por documento) y nadie mira el total. La corrida pasa a tener **un presupuesto de contexto** que se
consume con cada lectura; cuando se agota, las herramientas de lectura responden que no hay
presupuesto y el agente debe **consolidar con lo que tiene**, declarando qué no alcanzó a leer. Un
artefacto que declara su cobertura es honesto; uno que calla, no.

### 4 · Notas con fuente → consolidación con citas

Cada lectura deja **notas cortas atribuidas** (`vista → hechos`). El turno final consolida esas notas
en el artefacto y cada afirmación arrastra su cita (vista y, cuando aplica, nodos). Las notas son
también lo que se le muestra al usuario como progreso: el mismo dato sirve para el artefacto y para
que el humano vea qué está pasando.

## Historias

### H1 · Un artefacto que barrió el dominio (P1)

Como arquitecto con el dominio repartido en 12 vistas, pido «generá los drivers» **sin pinear nada** y
el agente recorre las vistas relevantes antes de escribir.

**Prueba independiente:** con un proyecto de 12 vistas y un pedido de drivers, la corrida registra al
menos una lectura de cada vista relevante al pedido y el artefacto cita más de una vista.

- **Dado** un proyecto con 12 vistas y ninguna pineada, **cuando** pido un artefacto, **entonces** el
  agente lista las vistas, lee las que decide y el artefacto se apoya en el contenido de varias.
- **Dado** que una vista está vacía, **cuando** el agente lista, **entonces** la ve marcada como vacía
  y no gasta presupuesto en leerla.
- **Dado** que el agente pide una vista con un nombre aproximado («pagos» por «Pagos · Cobro»),
  **cuando** se resuelve, **entonces** obtiene la vista correcta.
- **Dado** que pide una vista inexistente, **cuando** falla, **entonces** recibe la lista de nombres
  cercanos y puede corregir sin gastar un turno en vano.

### H2 · Aprobar o ajustar el plan antes de generar (P1)

Antes de escribir, el agente propone el plan del artefacto (secciones y de qué fuente sale cada una)
y espera mi decisión.

**Prueba independiente:** un pedido de artefacto deja el turno en espera con un plan y ningún
artefacto en el lienzo hasta que se aprueba.

- **Dado** un plan propuesto, **cuando** apruebo, **entonces** el agente genera siguiendo ese plan.
- **Dado** un plan propuesto, **cuando** lo ajusto con una indicación en texto, **entonces** el agente
  replantea y vuelve a pedir aprobación (sin perder lo que ya leyó).
- **Dado** un plan propuesto, **cuando** cancelo, **entonces** no se crea ningún artefacto y el chat
  queda con la conversación intacta.
- **Dado** un turno que **no** pide generar (una pregunta), **cuando** respondo, **entonces** no hay
  plan ni interrupción: el agente conversa.

### H3 · Resolver ambigüedades en el momento (P2)

Cuando el agente encuentra una decisión que cambia el resultado, me pregunta con opciones en vez de
suponer.

**Prueba independiente:** con dos vistas que tienen nodos de nombre parecido, la corrida se detiene
con una pregunta de opciones y la respuesta cambia el artefacto.

- **Dado** «Cobro» en una vista y «Pago» en otra, **cuando** el agente duda, **entonces** pregunta con
  opciones y espera.
- **Dado** que respondo una opción, **cuando** el agente sigue, **entonces** la decisión queda
  registrada en la traza y citada en el artefacto.
- **Dado** que respondo «no sé», **entonces** el agente sigue con el supuesto por defecto y lo
  **declara** en el artefacto.
- **Dado** que el agente ya preguntó lo mismo en la corrida, **entonces** no vuelve a preguntarlo.

### H4 · Ver el progreso mientras trabaja (P2)

Mientras el agente explora, el chat muestra qué está haciendo y qué encontró, no un spinner.

**Prueba independiente:** durante una corrida de varias lecturas, el chat va sumando pasos legibles
con la fuente de cada uno.

- **Dado** que el agente lee tres vistas, **cuando** avanza, **entonces** veo un paso por lectura con
  el nombre de la vista y lo que sacó de ella.
- **Dado** que la corrida termina, **cuando** miro el mensaje, **entonces** la traza queda plegada
  (como hoy «Razonamiento (N pasos)») y puedo abrirla.

### H5 · Trazabilidad del artefacto (P3)

Cada afirmación del artefacto dice de dónde salió.

**Prueba independiente:** un artefacto generado desde dos vistas y un documento adjunto contiene
citas a las tres fuentes y ninguna cita a algo que no se leyó.

- **Dado** un artefacto consolidado, **cuando** lo leo, **entonces** cada sección cita su vista o
  documento.
- **Dado** que no se pudo leer todo por presupuesto, **cuando** lo leo, **entonces** el artefacto
  declara qué quedó sin revisar.
- **Dado** que el mismo hecho aparece en dos vistas, **cuando** se consolida, **entonces** figura una
  vez con las dos fuentes.

### Casos borde

- **Un solo turno alcanza:** pedido trivial sobre un proyecto de una vista → el agente no debe
  inventar exploración; el plan puede ser de una sección.
- **Presupuesto agotado a mitad:** se consolida con lo leído y se declara la cobertura.
- **Techo de turnos:** al agotarse, se consolida en vez de terminar con «Listo.» y sin artefacto (hoy
  ése es el resultado, `litert-agent.ts:507`).
- **El usuario abandona una espera** (cierra el proyecto, cambia de vista, recarga): la corrida no
  queda colgada ni genera un artefacto por su cuenta.
- **El modelo pide una herramienta inexistente** o con argumentos mal formados: observación de error
  accionable y sigue (como hoy con las acciones inválidas).
- **Bucle de lecturas:** pedir la misma vista dos veces no consume presupuesto la segunda vez y el
  agente recibe un aviso de que ya la tiene.
- **Vistas pineadas + exploración:** lo pineado a mano sigue teniendo prioridad y no se vuelve a leer.
- **Modo remoto/híbrido:** la exploración funciona igual; sólo cambia quién ejecuta la generación.

## Requisitos funcionales

| Id | Requisito |
|---|---|
| **FR-001** | Un módulo nuevo `agent-retrieval.ts` bajo `src/lib/ai/` (**puro**, sin React ni Electron) es la única fuente de verdad de las herramientas de lectura: inventario de vistas, lectura de una vista y búsqueda en el modelo. El agente y la UI sólo lo consumen. |
| **FR-002** | `list_views` devuelve, por vista: nombre, notación, nº de nodos, nº de aristas y si está vacía. Incluye la vista «Modelo» y las custom, en el orden de la barra de vistas. |
| **FR-003** | `read_view(nombre)` devuelve el grafo de la vista en TOON (`src/lib/ai/graph-toon.ts`). La resolución del nombre es tolerante (sin acentos, sin distinguir mayúsculas/minúsculas, espacios colapsados); si no hay coincidencia, devuelve un error con los nombres más cercanos. |
| **FR-004** | `search_model(término)` devuelve los nodos y aristas que coinciden por nombre, descripción o tipo, **cada uno con la vista donde vive**, acotado a un máximo de resultados y ordenado por relevancia determinista. |
| **FR-005** | Las tres herramientas son de **sólo lectura**: ninguna muta el grafo, las vistas ni los artefactos. |
| **FR-006** | Un módulo nuevo `agent-run.ts` bajo `src/lib/ai/` (**puro**) modela la corrida reanudable: estado serializable, un paso que devuelve `done` \| `awaiting` \| `working`, y la reanudación a partir de la respuesta del humano. Ninguna decisión de continuidad vive en el componente. |
| **FR-007** | La corrida lleva un **presupuesto de contexto** explícito. Cada lectura lo consume; agotado, las herramientas responden «sin presupuesto» y el agente debe consolidar. Leer dos veces la misma vista no lo consume de nuevo. |
| **FR-008** | Antes de generar un artefacto, la corrida se detiene con un **plan**: secciones y la fuente de cada una. El humano puede **aprobar**, **ajustar** (texto libre → replanteo sin perder lo leído) o **cancelar** (sin artefactos). |
| **FR-009** | La corrida puede detenerse con una **pregunta de opciones** cuando una decisión cambia el resultado. Cada pregunta se hace **una sola vez** por corrida; «no sé» continúa con el supuesto por defecto y queda declarado en el artefacto. |
| **FR-010** | Cada lectura deja una **nota atribuida** a su fuente; las notas son a la vez el insumo de la consolidación y los pasos de progreso que ve el usuario (traza plegable del mensaje). |
| **FR-011** | El artefacto consolidado **cita sus fuentes** (vista y, cuando aplica, nodos; documento y su sección cuando viene de un adjunto) y declara la **cobertura**: qué se leyó y qué quedó afuera. |
| **FR-012** | Un hecho presente en varias fuentes aparece **una vez**, con todas sus fuentes. |
| **FR-013** | El techo de turnos sube y, al agotarse (o al agotarse el presupuesto), la corrida **consolida** con lo leído en vez de cerrar sin artefacto. |
| **FR-014** | El ciclo funciona en los tres modos del router (`local`, `hybrid`, `remote`). La política de ruteo no cambia: añadir estas capacidades **no** obliga a tocar `router.ts` ni `providers.ts` (P5). |
| **FR-015** | Nada de esto se activa cuando el turno **no** pide generar un artefacto: el gate de intención (`hasGenerationIntent`) sigue decidiendo, y una pregunta se responde conversando. |
| **FR-016** | Una corrida en espera **persiste** con el estado del chat (`agent_state_<fileId>`); al recargar se reconstruye o se marca cancelada con un motivo visible — nunca queda esperando en silencio ni genera artefactos sola. |
| **FR-017** | Las vistas pineadas a mano siguen inyectándose y tienen prioridad; el agente no gasta presupuesto releyéndolas. |
| **FR-018** | La traza del mensaje distingue los pasos nuevos (lectura, búsqueda, plan, pregunta, decisión del humano, consolidación) de los ya existentes (pensamiento, acción, observación). |

## Criterios de éxito

| Id | Medida | Objetivo |
|---|---|---|
| **SC-001** | Vistas cuyo contenido puede alcanzar un artefacto sin pinear nada | todas las del proyecto (hoy: 0) |
| **SC-002** | Artefactos generados sin declarar cobertura ni fuentes | 0 |
| **SC-003** | Corridas que generan un artefacto sin aprobación del plan | 0 |
| **SC-004** | Preguntas repetidas al humano dentro de una misma corrida | 0 |
| **SC-005** | Lecturas repetidas de la misma vista que consumen presupuesto | 0 |
| **SC-006** | Corridas en espera que quedan colgadas tras recargar | 0 (se reconstruyen o se cancelan con motivo) |
| **SC-007** | Cobertura de los módulos nuevos (FR-001, FR-006) | ≥ 95 % stmts |
| **SC-008** | Nombres de vista resueltos con acentos/mayúsculas distintas | 100 % de los casos probados |
| **SC-009** | Cambios en `router.ts` / `providers.ts` | 0 (P5) |
| **SC-010** | `npm run gate` | verde |

## Fuera de alcance

- **Embeddings o búsqueda semántica.** `search_model` es determinista (coincidencia por texto y
  tipo). Un índice vectorial es otra feature.
- **Editar el modelo desde el chat.** Las herramientas nuevas son de lectura; crear o mover nodos
  sigue siendo del lienzo y del MCP.
- **Resumir vistas con IA para ahorrar contexto.** El presupuesto se administra recortando y
  eligiendo, no generando resúmenes (otra pasada de modelo por vista es caro y no verificable).
- **Cambiar el versionado de artefactos** (004): la consolidación produce una revisión como
  cualquier otra.
- **Multi-agente o paralelismo.** Una corrida, un agente, pasos secuenciales.
- **Subir `MAX_INJECTED_VIEWS`.** El pineo sigue igual; lo que cambia es que ya no es la única puerta.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El modelo local no sostiene un bucle de exploración largo (se olvida del objetivo) | Notas atribuidas como memoria externa (FR-010): el objetivo y lo leído se re-inyectan condensados en cada turno, no el TOON completo. |
| Más turnos = corridas lentas en máquinas modestas | Presupuesto explícito (FR-007) + `list_views` con conteos para decidir sin leer + progreso visible (H4) para que la espera sea legible. |
| Las interrupciones vuelven tedioso el flujo | El plan es un solo punto de control y las preguntas exigen que la decisión **cambie el resultado** (FR-009); «no sé» siempre avanza. |
| El agente cita fuentes que no leyó | Las citas se validan contra las notas de la corrida antes de guardar el artefacto (FR-011): una cita sin nota registrada no se emite. |
| El estado de corrida infla el `localStorage` del proyecto | Sólo se persiste lo necesario para reanudar (notas y decisiones, no el TOON leído). |
