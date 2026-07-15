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

| Herramienta | Para qué |
|-------------|----------|
| `list_notations` | Ver las notaciones y su guía de diseño. |
| `describe_notation` | Tipos válidos de una notación (valor exacto para `type`), si son contenedores y su forma. |
| `create_diagram` | Abrir un diagrama nuevo (nombre + notación) → devuelve `diagramId`. |
| `list_diagrams` / `get_diagram` | Listar / ver resumen + vista previa Mermaid. |
| `add_container` | Añadir contenedor (Agregado, Pool, Límite de Sistema, Paquete…). |
| `add_node` | Añadir nodo (Comando, Evento, Tarea, Clase…), opcionalmente dentro de un contenedor. |
| `add_edge` | Conectar dos elementos (clasifica solo: interna / política / big picture). |
| `remove_element` | Borrar nodo/contenedor y sus aristas. |
| `validate_diagram` | Tipos, ids duplicados, aristas colgantes, nodos aislados. |
| `render_mermaid` | Vista previa Mermaid. |
| `export_to_app` | Escribe un `.json` (GraphData) para importar en la app. |
| `import_diagram` | Carga un `.json` exportado como diagrama editable (retomar contexto). |

## Flujo típico

1. `list_notations` → elegir notación según el documento.
2. `describe_notation` → aprender los `type` válidos.
3. `create_diagram` → `add_container` / `add_node` / `add_edge` mientras se leen los docs.
4. `render_mermaid` + `validate_diagram` → revisar.
5. `export_to_app` → abrir la app y usar **«Importar diagrama»** con el `.json` generado.
