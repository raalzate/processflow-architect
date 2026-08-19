# Servidor MCP — Processflow Architect

Servidor **MCP (Model Context Protocol)** por **stdio** que deja a **Claude Code**,
**Codex** o cualquier cliente MCP **diseñar diagramas** (Event Storming DDD, BPMN,
C4, UML) y **exportarlos al formato que la app importa** (`GraphData`).

La idea: Claude Code es muy bueno analizando documentos. Este servidor le da
herramientas para convertir ese análisis en un diagrama válido y llevarlo a
Processflow Architect sin salir del chat.

## Arquitectura

```
Claude Code / Codex ──stdio──▶ mcp-server/index.ts ──▶ src/lib/mcp (lógica PURA, testeada)
                                       │
                                       ├─ .processflow/diagrams/<id>.json   (modelo en curso)
                                       └─ <workspace>/<id>.json             (export GraphData)
                                                                                   │
                                                          App: «Importar diagrama (JSON)» ◀┘
```

La lógica de construcción/validación/serialización vive en `src/lib/mcp` (pura, sin
Electron ni React, con pruebas en vitest). Este proceso sólo es el transporte stdio
más la persistencia en disco del diagrama en curso.

## Registro (ya incluido en `.mcp.json`)

```json
{
  "mcpServers": {
    "processflow-architect": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "mcp-server/index.ts"]
    }
  }
}
```

Claude Code lo descubre solo al abrir este repo. Para otro cliente/directorio, define
`PROCESSFLOW_WORKSPACE` con la carpeta donde guardar diagramas y exportaciones (por
defecto, el directorio de trabajo).

## Herramientas

30 en total. Las marcadas **app** existen sólo en el modo HTTP embebido (la app viva
puede cumplirlas); por stdio no se registran.

| Fase | Herramienta | Para qué |
|---|---|---|
| Contexto | `list_notations` | Notaciones soportadas y su guía de diseño. |
| | `describe_notation` | Tipos válidos de una notación (valor exacto de `type`), si son contenedores y su forma. |
| | `get_app_state` **app** | Qué proyecto está abierto, con qué notación, qué vistas hay y cuánto cupo queda. |
| | `list_views` **app** | Vistas (pestañas) de un proyecto: notación, origen y tamaño. Con `project`, de OTRO proyecto guardado. |
| | `get_view` **app** | Contenido de una vista (resumen + Mermaid); con `importAs`, la trae como diagrama editable para continuarla. |
| | `list_artifacts` **app** | Documentos que generó la IA local: drivers, riesgos, propuesta, roadmap, ADRs… |
| | `get_artifact` **app** | El Markdown de un artefacto, con su revisión y el histórico. |
| Ciclo de vida | `create_diagram` | Abrir un diagrama (nombre + notación) → `diagramId`. |
| | `list_diagrams` / `get_diagram` | Listar / ver resumen + vista previa Mermaid. |
| | `import_diagram` | Cargar un `.json` exportado como diagrama editable (retomar contexto). |
| Construcción | `add_container` | Contenedor (Agregado, Pool, Límite de Sistema, Paquete…). |
| | `add_node` | Nodo (Comando, Evento, Tarea, Clase…), opcionalmente dentro de un contenedor. |
| | `add_edge` | Conectar dos elementos (clasifica solo: interna / política / big picture). |
| | `update_element` / `update_edge` | Corregir sin borrar y recrear (conserva id, citas y geometría). |
| | `remove_element` / `remove_edge` | Borrar nodo/contenedor con sus aristas, o una relación. |
| | `relayout_diagram` | Rehacer la disposición (estrategia + densidad). |
| | `render_mermaid` | Vista previa Mermaid. |
| Revisión | `validate_diagram` | ¿La app puede importar esto? Tipos, ids duplicados, aristas colgantes, aislados + calidad. |
| | `review_diagram` | Paquete para el humano: historia, tabla «elemento ← fuente», decisiones y pendientes, hallazgos, veredicto. |
| | `suggest_views` | Cortes cuando el diagrama pasa el tamaño legible; complementos cuando el material los sostiene. |
| | `record_ambiguity` / `resolve_ambiguity` | Registrar lo que la fuente NO cierra y cerrarlo con la respuesta del humano. |
| Entrega | `export_to_app` | Escribe el `.json` (GraphData); en modo app además lo carga en el lienzo. |
| | `export_as_view` **app** | Suma una pestaña (vista con su notación) al proyecto activo. |
| | `export_mermaid_view` **app** | Suma una pestaña de vista Mermaid al proyecto activo. |
| Skills | `list_skills` / `install_skill` | Instalar los skills de Claude Code con la configuración de ESTE transporte inyectada. |

## Flujo típico

1. `get_app_state` (modo app) → qué hay abierto antes de tocar nada.
2. `list_views` / `list_artifacts` → qué ya existe. Si la vista está, `get_view` con
   `importAs` y se continúa; si el documento está, `get_artifact` y se cita.
3. `list_notations` → elegir notación según el documento; `describe_notation` → aprender los `type`.
4. `create_diagram` → `add_container` / `add_node` / `add_edge` mientras se leen los docs,
   **citando la fuente** en cada elemento.
5. `record_ambiguity` para lo que la fuente no cierra; preguntar todo junto, en una ronda.
6. `validate_diagram` (+ `suggest_views` si es grande, `relayout_diagram` para reordenar).
7. `review_diagram` → mostrarlo al usuario y **esperar aprobación**. Con veredicto ❌ se corrige, no se presenta.
8. `export_to_app` (proyecto nuevo) o `export_as_view` (pestaña del proyecto activo). Por stdio,
   abrir la app y usar **«Importar diagrama»** con el `.json` generado.

Por dentro (registro compartido, transportes, reglas de calidad, cómo agregar una
herramienta): `../docs/architecture/mcp.md`.
