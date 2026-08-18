# testify · 005 — Escenarios ejecutables

Escenarios **antes del código** (fase 04). En este repo no hay runner de Gherkin: el mecanismo real
es **vitest**, así que cada escenario declara el test que lo implementa. Escenario sin test es
escenario no cumplido — eso lo verifica [analyze.md](analyze.md).

Las aserciones de esta página son el contrato: si un test rojo refleja un cambio *intencional* se
actualiza acá y en el test, en un commit aparte con el motivo (CONSTITUTION §P2).

Archivos: `agent-retrieval.test.ts` (E1–E12), `agent-run.test.ts` (E13–E28) y
`litert-agent-run.test.ts` (E29–E32), todos bajo `src/lib/ai/__tests__/`.

---

## Feature: inventario de vistas

```gherkin
Escenario: E1 · El inventario trae conteos, no contenido
  Dado un catálogo con «Modelo» (14 nodos), «Pagos» (5) y «Vacía» (0)
  Cuando el agente lista las vistas
  Entonces recibe nombre, notación, nº de nodos y aristas de cada una
  Y ninguna entrada incluye el grafo
```
→ `listViews · devuelve conteos y notación, sin el grafo`

```gherkin
Escenario: E2 · Una vista sin nodos se marca vacía
  Dado un catálogo con una vista sin nodos ni aristas
  Cuando el agente lista
  Entonces esa entrada viene marcada como vacía
```
→ `listViews · marca las vistas vacías`

```gherkin
Escenario: E3 · Las pineadas vienen marcadas
  Dado un catálogo donde «Pagos» está pineada al chat
  Cuando el agente lista
  Entonces «Pagos» viene marcada como pineada
```
→ `listViews · marca las vistas ya inyectadas a mano`

## Feature: lectura de una vista

```gherkin
Escenario: E4 · Leer devuelve TOON y su nota
  Dado un catálogo con «Pagos» (3 nodos)
  Cuando el agente lee «Pagos» con presupuesto suficiente
  Entonces recibe el grafo en TOON
  Y una nota atribuida a la vista «Pagos» con sus nodos citables
  Y un costo mayor que cero
```
→ `readView · devuelve TOON, nota atribuida y costo`

```gherkin
Escenario: E5 · Sin presupuesto no se lee
  Dado un presupuesto de 0
  Cuando el agente lee una vista
  Entonces la lectura falla con un error que dice que no hay presupuesto
```
→ `readView · sin presupuesto devuelve error accionable`

```gherkin
Escenario: E6 · Presupuesto corto recorta y lo declara
  Dado un presupuesto menor que el tamaño de la vista
  Cuando el agente la lee
  Entonces el texto viene recortado
  Y el resultado declara que hubo recorte
```
→ `readView · recorta al presupuesto y lo declara`

```gherkin
Escenario: E7 · Una vista Mermaid se entrega como código
  Dado un catálogo con una vista Mermaid
  Cuando el agente la lee
  Entonces recibe el código Mermaid
  Y su nota no declara nodos citables
```
→ `readView · vista mermaid entrega el código y no promete nodos`

## Feature: resolución de nombres

```gherkin
Escenario: E8 · Acentos y mayúsculas no importan
  Dado un catálogo con «Cotización · Póliza»
  Cuando el agente pide «cotizacion · poliza»
  Entonces se resuelve a «Cotización · Póliza»
```
→ `resolveViewName · tolera acentos, mayúsculas y espacios`

```gherkin
Escenario: E9 · Nombre inexistente sugiere el más cercano
  Dado un catálogo con «Pagos» y «Pedidos»
  Cuando el agente pide «Pago»
  Entonces la resolución falla
  Y sugiere «Pagos» entre los nombres cercanos
```
→ `resolveViewName · sin coincidencia devuelve sugerencias`

## Feature: búsqueda en el modelo

```gherkin
Escenario: E10 · La búsqueda dice en qué vista vive cada hallazgo
  Dado «Cobrar prima» en «Pagos» y «Cobro confirmado» en «Contabilidad»
  Cuando el agente busca «cobro»
  Entonces cada resultado indica su vista
```
→ `searchModel · cada resultado trae la vista donde vive`

```gherkin
Escenario: E11 · El orden es determinista
  Dado varios nodos que coinciden por nombre exacto, prefijo y descripción
  Cuando el agente busca dos veces el mismo término
  Entonces el orden es el mismo y respeta exacto > prefijo > substring > descripción
```
→ `searchModel · orden determinista por tipo de coincidencia`

```gherkin
Escenario: E12 · Sin resultados no es un error
  Cuando el agente busca un término que no existe
  Entonces el resultado es exitoso y declara que no hubo coincidencias
```
→ `searchModel · sin coincidencias responde vacío, no error`

## Feature: presupuesto y relectura

```gherkin
Escenario: E13 · Releer no cuesta
  Dada una corrida que ya leyó «Pagos»
  Cuando el agente vuelve a pedir «Pagos»
  Entonces el presupuesto no baja
  Y la observación le avisa que ya la tiene
```
→ `applyToolCall · releer una vista cuesta 0 y avisa`

```gherkin
Escenario: E14 · El presupuesto baja con cada lectura nueva
  Dada una corrida con presupuesto 10 000
  Cuando lee dos vistas distintas
  Entonces el presupuesto restante es menor que el inicial en la suma de los costos
```
→ `applyToolCall · descuenta el costo de cada lectura nueva`

```gherkin
Escenario: E15 · Herramienta inexistente no rompe la corrida
  Cuando el agente invoca una herramienta que no existe
  Entonces la observación nombra las herramientas válidas
  Y la corrida sigue viva
```
→ `applyToolCall · herramienta desconocida devuelve observación accionable`

## Feature: plan aprobable

```gherkin
Escenario: E16 · Generar exige plan primero
  Dada una corrida sin plan aprobado
  Cuando el agente quiere generar un artefacto
  Entonces la corrida se detiene esperando aprobación del plan
  Y no hay artefactos
```
→ `needsPlan · sin plan aprobado la generación se detiene`

```gherkin
Escenario: E17 · Un plan que cita una vista inexistente se rechaza
  Dado un plan cuya sección cita «Ventas» y el catálogo no la tiene
  Cuando se registra el plan
  Entonces se rechaza con la lista de fuentes válidas
  Y el humano no es interrumpido
```
→ `registerPlan · rechaza fuentes que no están en el catálogo`

```gherkin
Escenario: E18 · Aprobar habilita la generación
  Dada una corrida detenida con un plan
  Cuando el humano aprueba
  Entonces la corrida deja de estar en espera y el plan queda aprobado
```
→ `approvePlan · quita la pausa y marca el plan aprobado`

```gherkin
Escenario: E19 · Ajustar no pierde lo leído
  Dada una corrida detenida con un plan, con dos vistas leídas
  Cuando el humano ajusta con una indicación
  Entonces las notas y el presupuesto se conservan
  Y la indicación queda como observación para el modelo
```
→ `adjustPlan · conserva notas y presupuesto, devuelve el feedback`

```gherkin
Escenario: E20 · Cancelar no genera nada
  Dada una corrida detenida con un plan
  Cuando el humano cancela
  Entonces la corrida termina sin artefactos y con motivo registrado
```
→ `cancelRun · termina sin artefactos y con motivo`

## Feature: preguntas al humano

```gherkin
Escenario: E21 · La pregunta detiene la corrida
  Cuando el agente formula una pregunta con opciones
  Entonces la corrida queda en espera con el texto y las opciones
```
→ `registerQuestion · deja la corrida esperando con opciones`

```gherkin
Escenario: E22 · La misma pregunta no se repite
  Dada una corrida que ya respondió la pregunta «dup-cobro»
  Cuando el agente la vuelve a formular
  Entonces la corrida NO se detiene
  Y el agente recibe la decisión anterior como observación
```
→ `registerQuestion · una pregunta por id y por corrida`

```gherkin
Escenario: E23 · «No sé» avanza con el supuesto por defecto
  Dada una pregunta con opciones ["Mismo concepto", "Distintos"]
  Cuando el humano responde que no sabe
  Entonces la decisión registrada es la primera opción
  Y queda marcada como supuesto
```
→ `answerQuestion · «no sé» toma la primera opción y la marca como supuesto`

## Feature: consolidación y citas

```gherkin
Escenario: E24 · La consolidación agrupa por fuente
  Dada una corrida con notas de «Pagos», «Pedidos» y un documento
  Cuando se arma el prompt de consolidación
  Entonces incluye el objetivo, las notas agrupadas por fuente y las decisiones
  Y no incluye el TOON crudo
```
→ `consolidationPrompt · agrupa notas por fuente y omite el TOON`

```gherkin
Escenario: E25 · Una cita a algo leído es válida
  Dada una nota de «Pagos» con el nodo «Cobrar prima»
  Cuando el artefacto cita «Pagos › Cobrar prima»
  Entonces la validación pasa
```
→ `validateCitations · acepta citas respaldadas por una nota`

```gherkin
Escenario: E26 · Una cita inventada se detecta
  Cuando el artefacto cita «Ventas › Facturar»
  Y no hay nota de «Ventas»
  Entonces la validación falla y nombra la cita inválida
```
→ `validateCitations · detecta citas sin nota que las respalde`

```gherkin
Escenario: E27 · La cobertura declara lo que quedó afuera
  Dada una corrida que leyó 2 de 5 vistas por presupuesto
  Cuando se arma la cobertura
  Entonces lista las leídas y las omitidas con el motivo
```
→ `coverageOf · declara vistas leídas, omitidas y el motivo`

```gherkin
Escenario: E28 · Estado ida y vuelta
  Dada una corrida con notas, decisiones y pausa
  Cuando se serializa a JSON y se vuelve a leer
  Entonces el estado es equivalente
```
→ `AgentRunState · sobrevive el ida y vuelta a JSON`

## Feature: el bucle completo (convo guionada)

```gherkin
Escenario: E29 · Explorar, planificar, consolidar
  Dado un modelo que lista, lee dos vistas, propone plan y genera
  Cuando corre el agente con el plan aprobado automáticamente en la reanudación
  Entonces el artefacto existe y su markdown cita las dos vistas
```
→ `runLitertAgent · explora dos vistas, planifica y consolida citando`

```gherkin
Escenario: E30 · Se detiene con plan
  Cuando el modelo propone un plan
  Entonces el resultado viene con la corrida en espera y sin artefactos
```
→ `runLitertAgent · devuelve la corrida en espera cuando propone plan`

```gherkin
Escenario: E31 · Se detiene con pregunta y se reanuda
  Cuando el modelo formula una pregunta y luego se reanuda con una respuesta
  Entonces la decisión aparece en la traza y la corrida termina con artefacto
```
→ `resumeLitertAgent · reanuda con la respuesta del humano`

```gherkin
Escenario: E32 · Agotar turnos consolida
  Dado un modelo que sólo pide lecturas hasta agotar los turnos
  Cuando la corrida termina
  Entonces hay artefacto (consolidado con lo leído) y la cobertura lo declara
```
→ `runLitertAgent · al agotar turnos consolida en vez de cerrar vacío`
