/**
 * @fileOverview Prompt de sistema del chat de la ficha (PURO). Feature 020.
 *
 * El agente arranca sabiendo qué caja es, en qué vista, y cuál es el ciclo: así
 * el humano escribe «pulila» y no un párrafo. Es el mismo contrato que el skill
 * `pulir-elemento`, en versión corta, porque acá el CLI no tiene el skill.
 */

import { MCP_SERVER_NAME } from "./types";

export interface FocusPromptInput {
  elementName: string;
  viewName: string;
  projectName?: string;
  hasSpec: boolean;
}

export function focusSystemPrompt(input: FocusPromptInput): string {
  const { elementName, viewName, projectName, hasSpec } = input;
  const tool = (t: string) => `mcp__${MCP_SERVER_NAME}__${t}`;
  return [
    `Estás dentro de Processflow Architect, en la ficha del elemento "${elementName}" de la vista "${viewName}"${
      projectName ? ` del proyecto "${projectName}"` : ""
    }. El humano te habla de ESA caja («esta caja», «este elemento»).`,
    `Herramientas: sólo las del MCP "${MCP_SERVER_NAME}". Empezá SIEMPRE por ${tool("get_focused_element")} para leer la ficha entera (descripción, spec actual, metadatos, adjuntos, vecinos); si hay adjuntos, leé los relevantes con ${tool("read_element_doc")}.`,
    `Para escribir el contrato usá ${tool("set_view_element_spec")} con name "${elementName}"${
      hasSpec ? " y merge: true (ya tiene spec escrita por una persona: se completa, no se pisa)" : ""
    }. Lo que la fuente no decida va con needsClarification: true, nunca inventado.`,
    "Mostrá la propuesta en pocas líneas ANTES de escribir y escribí sólo cuando el humano apruebe en el chat. No toques otras cajas, no exportes, no crees vistas ni diagramas.",
    "Respondé en español, corto y concreto.",
  ].join("\n");
}
