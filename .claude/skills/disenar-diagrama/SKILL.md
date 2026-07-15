---
name: disenar-diagrama
description: Diseña un diagrama (Event Storming DDD, BPMN, C4 o UML) en Processflow Architect usando el MCP processflow-architect — analiza documentos o código, construye el diagrama con las herramientas MCP y lo exporta al lienzo de la app. Úsalo cuando el usuario pida "diseña un diagrama", "modela este dominio", "crea el event storming", "haz el BPMN de este proceso", "modela la arquitectura C4" o "lleva esto a Processflow".
---

# Diseñar un diagrama con el MCP de Processflow Architect

Eres un modelador de dominios. Tu trabajo: leer los documentos/código que indique
el usuario, extraer el modelo y construirlo como diagrama VÁLIDO en Processflow
Architect usando las herramientas del servidor MCP `processflow-architect`.

## 0 · Verificar conexión

Comprueba que las herramientas MCP `processflow-architect` estén disponibles
(p. ej. `list_notations`). Si no lo están, dile al usuario cómo conectar:

- **Modo app (recomendado):** abrir Processflow Architect → Ajustes → Servidor
  MCP → «Activar servidor», y añadir a su cliente:
  ```json
  { "mcpServers": { "processflow-architect": { "type": "http", "url": "http://127.0.0.1:7331/mcp" } } }
  ```
  El icono 🔌 del header de la app muestra punto VERDE cuando está activo.
- **Modo repo (dev):** abrir este repositorio con Claude Code (el `.mcp.json`
  registra el transporte stdio automáticamente).

No sigas sin conexión.

## 1 · Elegir notación

Llama `list_notations` y elige según el material:

| Material | Notación |
|---|---|
| Dominio de negocio, requisitos, historias de usuario | `ddd` (Event Storming) |
| Proceso paso a paso, flujo operativo, swimlanes | `bpmn` |
| Arquitectura de sistemas, servicios, despliegue | `c4` |
| Clases, estados de un objeto, casos de uso | `uml` |

Si dudas, pregunta al usuario UNA vez; por defecto `ddd`.

## 2 · Aprender los tipos válidos

SIEMPRE llama `describe_notation` antes de construir. El campo `type` de
`add_node`/`add_container` debe ser EXACTAMENTE uno de los tipos devueltos
(están en español: "Comando", "Evento", "Tarea", "Compuerta Exclusiva"…).
NUNCA inventes tipos.

## 3 · Analizar el material

Lee los documentos/código que el usuario indique ANTES de crear nodos. Extrae:

- **ddd**: actores, comandos (imperativo: "Crear Pedido"), eventos (pasado:
  "Pedido Creado"), agregados (contenedores), políticas, sistemas externos.
- **bpmn**: pools/carriles por responsable, eventos de inicio/fin, tareas,
  compuertas para CADA decisión (con aristas etiquetadas por condición).
- **c4**: personas, sistemas, contenedores dentro de "Límite de Sistema",
  relaciones etiquetadas con tecnología ("usa [HTTPS/JSON]").
- **uml**: clases/estados/casos de uso según el subtipo de diagrama.

## 4 · Construir

1. `create_diagram` → guarda el `diagramId`.
2. `add_container` PRIMERO (agregados, pools, límites, paquetes). El `name` del
   contenedor es la clave que usan sus hijos.
3. `add_node` con `container` para los internos; sin `container` para sueltos
   (van al Big Picture).
4. `add_edge` para TODAS las relaciones — regla dura: **ningún nodo sin
   aristas** (el lienzo descarta nodos aislados). Etiqueta las aristas
   ("dispara", "consulta", "usa [REST]").

Convenciones: nombres en español, descripciones cortas de una línea, ids
autogenerados (no los inventes salvo necesidad).

## 5 · Revisar y corregir

- `validate_diagram`: corrige TODOS los errores; resuelve avisos de nodos
  aislados conectándolos o eliminándolos.
- `render_mermaid`: muestra la vista previa al usuario en tu respuesta.

## 6 · Exportar

`export_to_app`:
- Con la app conectada (modo HTTP), el diagrama **aparece directo en el
  lienzo** — dilo al usuario.
- En modo stdio devuelve la ruta de un `.json`: indica al usuario importarlo
  con «Importar diagrama» o arrastrándolo a la pantalla de bienvenida.

## Reglas duras

- Tipos SOLO del `describe_notation` de la notación elegida.
- Contenedores antes que hijos; hijos referencian el `name` exacto del contenedor.
- Todo nodo conectado con al menos una arista.
- Un solo diagrama por petición salvo que el usuario pida varios.
- Si el usuario pide retomar un diseño previo, usa `list_diagrams`/`get_diagram`
  o `import_diagram` con su `.json` exportado.
