/**
 * Pedido EXPLÍCITO de artefacto: el usuario elige del menú «+» del chat qué
 * quiere que el agente genere, en vez de depender de que la frase active el gate
 * de intención (`hasGenerationIntent`). Nació de un caso real: «Identifica
 * riesgos y restricciones» no tiene verbo de generación, así que el agente
 * conversaba y nunca ponía el artefacto en el lienzo.
 *
 * Puro y agnóstico del catálogo: la familia y la etiqueta salen del registro.
 */
import {
  diagramDefinitions,
  documentDefinitions,
  getDefinition,
  type ToolFamily,
} from "./registry";

export interface ArtifactRequest {
  kind: string;
  family: ToolFamily;
  label: string;
  /** Herramienta del protocolo que corresponde a la familia. */
  tool: "generate_document" | "generate_diagram";
}

/** Familia real del `kind` según el registro (un kind inventado es documento). */
function familyOf(kind: string): ToolFamily {
  if (diagramDefinitions().some((d) => d.kind === kind)) return "diagram";
  if (documentDefinitions().some((d) => d.kind === kind)) return "document";
  return "document";
}

/** Resuelve el pedido: familia, etiqueta y herramienta. `kind` vacío → null. */
export function resolveArtifactRequest(kind: string | undefined | null): ArtifactRequest | null {
  const k = (kind ?? "").trim();
  if (!k) return null;
  const family = familyOf(k);
  return {
    kind: k,
    family,
    label: getDefinition(k, family).label,
    tool: family === "diagram" ? "generate_diagram" : "generate_document",
  };
}

/**
 * Mensaje que ve el modelo cuando el pedido es explícito: la orden primero (con
 * el `kind` y la herramienta exactos, para que no los invente) y el texto del
 * usuario después, como instrucciones de contenido.
 */
export function artifactRequestDirective(req: ArtifactRequest, message: string): string {
  const texto = (message ?? "").trim();
  const pedido =
    `El usuario pidió el artefacto «${req.label}»: generalo con la acción ` +
    `"${req.tool}" y "kind":"${req.kind}". No cierres la corrida sin haberlo puesto en el lienzo.`;
  return texto ? `${pedido}\n\nInstrucciones del usuario: ${texto}` : pedido;
}
