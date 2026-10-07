/**
 * @fileOverview Entrega de una caja a un agente externo (PURO). Feature 019.
 *
 * La app no puede abrir Claude Code ni empujarle un prompt: Claude Code sólo
 * LEE por MCP (no hay deep-link ni API de sesión). El máximo posible desde la
 * ficha es dejar todo listo en un clic: el servidor MCP encendido y, en el
 * portapapeles, un prompt que nombra la caja, la vista y el ciclo que el
 * agente tiene que seguir. Este módulo escribe ese prompt; el botón de la ficha
 * sólo lo copia.
 */

export interface HandoffInput {
  elementName: string;
  viewName: string;
  /** URL del servidor MCP de la app (para que el prompt diga a dónde conectarse). */
  url: string;
  /** true si la caja ya tiene spec: el agente debe completar, no reescribir. */
  hasSpec: boolean;
}

/**
 * El prompt que el humano pega en su agente. Dice qué caja, dónde, con qué
 * herramientas y en qué orden; y exige mostrar la propuesta antes de escribir,
 * que es la regla de todo el arnés (nada toca el lienzo sin revisión humana).
 */
export function handoffPrompt(input: HandoffInput): string {
  const { elementName, viewName, url, hasSpec } = input;
  return [
    `Pulí el elemento "${elementName}" de la vista "${viewName}" de Processflow Architect con el MCP processflow-architect (${url}).`,
    "Ciclo: 1) get_app_state y get_focused_element para leer la ficha entera (descripción, spec, metadatos, adjuntos, vecinos).",
    "2) Proponeme la especificación (pasos con escenarios Given/When/Then, requisitos, criterios medibles); lo que la fuente no decida, marcalo como needsClarification en vez de inventarlo.",
    `3) Cuando yo apruebe, escribila con set_view_element_spec (name: "${elementName}"${hasSpec ? ", merge: true para conservar lo que ya escribí" : ""}).`,
    "No toques otras cajas ni exportes nada.",
  ].join("\n");
}
