/**
 * @fileOverview Registry escalable de tipos de artefacto.
 *
 * AÑADIR UN ARTEFACTO NUEVO = añadir una entrada aquí (+ opcionalmente un prompt).
 * No requiere tocar la UI del lienzo ni el motor del agente:
 *  - La UI renderiza según `render` (markdown | mermaid | drivers | ...).
 *  - El agente expone herramientas genéricas (`generate_document`, `generate_diagram`)
 *    que aceptan cualquier `kind`; las entradas estructuradas (drivers/constraints/...)
 *    se mapean a flujos Genkit dedicados.
 *
 * Compartido entre proceso principal (ai/flows/react-agent.ts) y renderer (UI).
 */

import type { ArtifactRender } from "../agent-types";

/** Familia de herramienta que produce el artefacto. */
export type ToolFamily = "document" | "diagram";

export interface ArtifactDefinition {
  /** Clave única. Estable: se persiste en los artefactos guardados. */
  kind: string;
  /** Etiqueta legible para la UI. */
  label: string;
  /** Nombre de icono lucide-react (resuelto en la UI). */
  icon: string;
  /** Clase de color tailwind para el acento del card. */
  accent: string;
  /** Forma de render universal. */
  render: ArtifactRender;
  /** Cómo lo genera el agente. */
  family: ToolFamily;
  /** Descripción para que el LLM decida cuándo usar la herramienta. */
  description: string;
  /** Guía de contenido para generadores `document` / `diagram`. */
  promptHint?: string;
  /** Para diagramas: tipo de diagrama Mermaid sugerido. */
  mermaidKind?: string;
}

/**
 * Catálogo de artefactos conocidos. Las entradas `document` y `diagram` son
 * presets; el agente puede crear `kind` arbitrarios vía las herramientas genéricas
 * y caerán al fallback (`getDefinition`) con render markdown/mermaid.
 */
export const ARTIFACT_REGISTRY: ArtifactDefinition[] = [
  /* ---- Análisis de arquitectura (documentos markdown) ---- */
  {
    kind: "drivers",
    label: "Drivers de Arquitectura",
    icon: "Target",
    accent: "text-sky-600",
    render: "markdown",
    family: "document",
    description:
      "Extrae los drivers de arquitectura (requisitos funcionales clave, atributos de calidad y restricciones) a partir del modelo de dominio y el contexto.",
    promptHint:
      "Secciones '## Requisitos funcionales clave', '## Atributos de calidad', '## Restricciones'. Cada driver: nombre, descripción y elementos del dominio relacionados (usa nombres reales del modelo).",
  },
  {
    kind: "constraints",
    label: "Riesgos y Restricciones",
    icon: "ShieldAlert",
    accent: "text-amber-600",
    render: "markdown",
    family: "document",
    description:
      "Identifica restricciones y riesgos técnicos y de negocio del sistema, con su impacto y mitigación.",
    promptHint:
      "Tabla: | Tipo (Riesgo/Restricción) | Descripción | Impacto | Mitigación |. Prioriza por severidad.",
  },
  {
    kind: "proposal",
    label: "Propuesta Técnica",
    icon: "Layers",
    accent: "text-violet-600",
    render: "markdown",
    family: "document",
    description:
      "Propuesta de arquitectura técnica: backend, base de datos, infraestructura y herramientas, justificada en drivers y restricciones.",
    promptHint:
      "Secciones '## Backend', '## Base de datos', '## Infraestructura', '## Herramientas', '## Consideraciones'. Justifica cada elección.",
  },
  {
    kind: "roadmap",
    label: "Roadmap",
    icon: "Milestone",
    accent: "text-emerald-600",
    render: "markdown",
    family: "document",
    description:
      "Roadmap de implementación por fases con épicas, roles requeridos y dependencias.",
    promptHint:
      "Por fase: '### Fase N — Nombre (duración)', '**Épicas:**' (lista), '**Roles:**', '**Depende de:**'. Ordena por dependencias.",
  },

  /* ---- Documentos de arquitectura (markdown genérico) ---- */
  {
    kind: "adr",
    label: "ADR (Decisión de Arquitectura)",
    icon: "FileText",
    accent: "text-indigo-600",
    render: "markdown",
    family: "document",
    description:
      "Registra una Decisión de Arquitectura (Architecture Decision Record): contexto, decisión, alternativas y consecuencias.",
    promptHint:
      "Formato ADR: secciones '## Contexto', '## Decisión', '## Alternativas consideradas', '## Consecuencias'. Conciso y trazable.",
  },
  {
    kind: "tech-stack",
    label: "Stack Tecnológico",
    icon: "Boxes",
    accent: "text-cyan-600",
    render: "markdown",
    family: "document",
    description:
      "Detalla el stack tecnológico recomendado por capa (frontend, backend, datos, infra, observabilidad) con justificación.",
    promptHint:
      "Tabla por capa: | Capa | Tecnología | Justificación |. Alinea con drivers/restricciones del contexto.",
  },
  {
    kind: "nfr",
    label: "Atributos de Calidad (NFR)",
    icon: "Gauge",
    accent: "text-rose-600",
    render: "markdown",
    family: "document",
    description:
      "Define requisitos no funcionales / atributos de calidad (rendimiento, seguridad, disponibilidad, escalabilidad) con métricas objetivo.",
    promptHint:
      "Tabla: | Atributo | Escenario | Métrica objetivo | Táctica arquitectónica |.",
  },
  {
    kind: "capacity-plan",
    label: "Plan de Capacidad",
    icon: "Activity",
    accent: "text-orange-600",
    render: "markdown",
    family: "document",
    description:
      "Estima capacidad y dimensionamiento: carga esperada, recursos por componente, supuestos de escalado.",
  },
  {
    kind: "ubiquitous-language",
    label: "Lenguaje Ubicuo (Glosario)",
    icon: "BookMarked",
    accent: "text-purple-600",
    render: "markdown",
    family: "document",
    description:
      "Glosario del Lenguaje Ubicuo (DDD): términos del dominio compartidos entre negocio y desarrollo, con su significado por Bounded Context.",
    promptHint:
      "Tabla: | Término | Bounded Context | Significado en el negocio | Cómo se nombra en el código |. Usa los nombres reales del modelo (agregados, comandos, eventos).",
  },
  {
    kind: "user-stories",
    label: "Historias de Usuario",
    icon: "ClipboardList",
    accent: "text-green-600",
    render: "markdown",
    family: "document",
    description:
      "Deriva historias de usuario con criterios de aceptación a partir de los comandos/casos de uso del dominio.",
    promptHint:
      "Por historia: 'Como <rol>, quiero <objetivo>, para <beneficio>' + '**Criterios (Given/When/Then):**'. Agrupa por Bounded Context/actor.",
  },
  {
    kind: "api-spec",
    label: "Contrato de API",
    icon: "Webhook",
    accent: "text-teal-700",
    render: "markdown",
    family: "document",
    description:
      "Esboza el contrato de API (endpoints REST/gRPC) de un Bounded Context: rutas, métodos, payloads y códigos de respuesta.",
    promptHint:
      "Tabla: | Método | Ruta | Descripción | Request | Response |. Deriva los recursos de los agregados/comandos. Alinea con Open Host Service si aplica.",
  },
  {
    kind: "threat-model",
    label: "Modelo de Amenazas (STRIDE)",
    icon: "ShieldAlert",
    accent: "text-red-600",
    render: "markdown",
    family: "document",
    description:
      "Análisis de seguridad STRIDE: identifica amenazas (Spoofing, Tampering, Repudiation, Information disclosure, DoS, Elevation) y contramedidas.",
    promptHint:
      "Tabla: | Categoría STRIDE | Amenaza | Componente/Flujo afectado | Contramedida |. Foco en límites de confianza entre contextos y sistemas externos.",
  },
  {
    kind: "test-strategy",
    label: "Estrategia de Pruebas",
    icon: "FlaskConical",
    accent: "text-cyan-700",
    render: "markdown",
    family: "document",
    description:
      "Define la estrategia de pruebas (pirámide): unitarias, de integración, de contrato y e2e, mapeadas a los componentes del sistema.",
    promptHint:
      "Secciones por nivel (unitarias/integración/contrato/e2e) con qué cubrir y dónde. Tabla: | Nivel | Qué prueba | Componentes | Herramienta sugerida |.",
  },

  /* ---- Diagramas (mermaid genérico) ---- */
  {
    kind: "context-map",
    label: "Mapa de Contexto (DDD)",
    icon: "Map",
    accent: "text-violet-700",
    render: "mermaid",
    family: "diagram",
    mermaidKind: "flowchart",
    description:
      "Mapa de Contexto de DDD: los Bounded Contexts del sistema y sus patrones de integración (ACL, Open Host, Published Language, Customer/Supplier, Conformist, Shared Kernel).",
    promptHint:
      "Usa 'flowchart LR'. Un subgraph por Bounded Context, etiquetado con su subdominio (Core/Supporting/Generic). Aristas etiquetadas con el patrón de relación o el Evento de Dominio que las dispara.",
  },
  {
    kind: "aggregate-model",
    label: "Modelo de Agregados (DDD)",
    icon: "Boxes",
    accent: "text-indigo-700",
    render: "mermaid",
    family: "diagram",
    mermaidKind: "classDiagram",
    description:
      "Modelo táctico de DDD: Agregados con su Raíz, Entidades, Objetos de Valor, Eventos de Dominio y sus relaciones dentro de un Bounded Context.",
    promptHint:
      "Usa 'classDiagram'. Marca con estereotipos <<Aggregate Root>>, <<Entity>>, <<Value Object>>, <<Domain Event>>. Muestra la Raíz como puerta de entrada al agregado.",
  },
  {
    kind: "c4-context",
    label: "C4 · Contexto",
    icon: "Network",
    accent: "text-blue-600",
    render: "mermaid",
    family: "diagram",
    mermaidKind: "flowchart",
    description:
      "Diagrama C4 nivel 1 (Contexto del sistema): el sistema, actores y sistemas externos.",
    promptHint:
      "Usa 'flowchart TB'. Nodos = sistema central, actores, sistemas externos. Aristas etiquetadas con la interacción.",
  },
  {
    kind: "c4-container",
    label: "C4 · Contenedores",
    icon: "Container",
    accent: "text-blue-700",
    render: "mermaid",
    family: "diagram",
    mermaidKind: "flowchart",
    description:
      "Diagrama C4 nivel 2 (Contenedores): aplicaciones, servicios, bases de datos y su comunicación.",
    promptHint:
      "Usa 'flowchart TB' con subgraphs por límite. Incluye protocolos en las aristas (HTTPS, gRPC, etc.).",
  },
  {
    kind: "component-diagram",
    label: "Diagrama de Componentes",
    icon: "Component",
    accent: "text-teal-600",
    render: "mermaid",
    family: "diagram",
    mermaidKind: "flowchart",
    description: "Descompone un contenedor en componentes internos y sus dependencias.",
  },
  {
    kind: "sequence-diagram",
    label: "Diagrama de Secuencia",
    icon: "ArrowLeftRight",
    accent: "text-fuchsia-600",
    render: "mermaid",
    family: "diagram",
    mermaidKind: "sequenceDiagram",
    description: "Modela la interacción temporal entre participantes para un caso de uso.",
    promptHint: "Usa 'sequenceDiagram'. Define participantes y mensajes en orden.",
  },
  {
    kind: "deployment-diagram",
    label: "Diagrama de Despliegue",
    icon: "Server",
    accent: "text-lime-600",
    render: "mermaid",
    family: "diagram",
    mermaidKind: "flowchart",
    description: "Muestra nodos de despliegue (entornos, clústeres, zonas) y dónde corre cada componente.",
    promptHint: "Usa 'flowchart TB' con subgraphs por entorno/zona.",
  },
  {
    kind: "data-model",
    label: "Modelo de Datos (ER)",
    icon: "Database",
    accent: "text-stone-600",
    render: "mermaid",
    family: "diagram",
    mermaidKind: "erDiagram",
    description: "Modelo entidad-relación de las entidades de datos clave.",
    promptHint: "Usa 'erDiagram' con entidades, atributos y cardinalidades.",
  },
  {
    kind: "state-diagram",
    label: "Diagrama de Estados",
    icon: "Workflow",
    accent: "text-amber-700",
    render: "mermaid",
    family: "diagram",
    mermaidKind: "stateDiagram-v2",
    description:
      "Modela el ciclo de vida (máquina de estados) de un Agregado: estados y transiciones disparadas por comandos/eventos.",
    promptHint:
      "Usa 'stateDiagram-v2'. Estados = situaciones del agregado; transiciones etiquetadas con el comando/evento que las dispara.",
  },
];

const BY_KIND = new Map(ARTIFACT_REGISTRY.map((d) => [d.kind, d]));

/** Render por defecto según familia, para `kind` no registrados. */
function fallbackRender(family: ToolFamily): ArtifactRender {
  if (family === "diagram") return "mermaid";
  return "markdown";
}

/**
 * Resuelve la definición de un `kind`. Si no existe (el agente inventó uno),
 * devuelve una definición sintética coherente — esto es lo que hace el sistema
 * escalable a artefactos no previstos.
 */
export function getDefinition(kind: string, family: ToolFamily = "document"): ArtifactDefinition {
  const found = BY_KIND.get(kind);
  if (found) return found;
  return {
    kind,
    label: kind
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    icon: family === "diagram" ? "Workflow" : "FileText",
    accent: "text-slate-600",
    render: fallbackRender(family),
    family,
    description: `Artefacto generado dinámicamente: ${kind}`,
  };
}

export function documentDefinitions(): ArtifactDefinition[] {
  return ARTIFACT_REGISTRY.filter((d) => d.family === "document");
}

export function diagramDefinitions(): ArtifactDefinition[] {
  return ARTIFACT_REGISTRY.filter((d) => d.family === "diagram");
}
