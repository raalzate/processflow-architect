/**
 * @fileOverview Plantillas de arranque para el editor Mermaid GENÉRICO.
 *
 * El editor Mermaid es una vista de código libre + vista previa en vivo: sirve
 * para CUALQUIER diagrama que Mermaid soporte (secuencia, flujo, clases, estados,
 * entidad-relación, gantt). Estas plantillas dan un punto de partida válido para
 * cada tipo, evitando el lienzo en blanco. DATOS PUROS (sin React ni Electron).
 */

export interface MermaidTemplate {
  id: string;
  label: string;
  code: string;
}

export const MERMAID_TEMPLATES: MermaidTemplate[] = [
  {
    id: "sequence",
    label: "Secuencia",
    code: `sequenceDiagram
  actor U as Usuario
  participant S as Sistema
  U->>+S: solicitud()
  S-->>-U: respuesta`,
  },
  {
    id: "flowchart",
    label: "Flujo",
    code: `flowchart TD
  A[Inicio] --> B{¿Condición?}
  B -->|Sí| C[Acción]
  B -->|No| D[Otra acción]
  C --> E[Fin]
  D --> E`,
  },
  {
    id: "class",
    label: "Clases",
    code: `classDiagram
  class Usuario {
    +String nombre
    +login()
  }
  class Cuenta {
    +double saldo
    +depositar(monto)
  }
  Usuario "1" --> "*" Cuenta : posee`,
  },
  {
    id: "state",
    label: "Estados",
    code: `stateDiagram-v2
  [*] --> Inactivo
  Inactivo --> Activo : activar
  Activo --> Inactivo : desactivar
  Activo --> [*]`,
  },
  {
    id: "er",
    label: "Entidad-Relación",
    code: `erDiagram
  CLIENTE ||--o{ PEDIDO : realiza
  PEDIDO ||--|{ LINEA : contiene
  CLIENTE {
    string nombre
    string email
  }`,
  },
  {
    id: "gantt",
    label: "Gantt",
    code: `gantt
  title Cronograma
  dateFormat YYYY-MM-DD
  section Fase 1
  Análisis :a1, 2026-01-01, 7d
  Diseño   :after a1, 5d`,
  },
];

/** Código por defecto al crear una vista Mermaid (plantilla de secuencia). */
export const DEFAULT_MERMAID_CODE = MERMAID_TEMPLATES[0].code;

/** Busca una plantilla por id (o undefined). */
export function getMermaidTemplate(id: string): MermaidTemplate | undefined {
  return MERMAID_TEMPLATES.find((t) => t.id === id);
}
