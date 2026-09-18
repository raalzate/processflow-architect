/**
 * Oferta de AMPLIAR la ventana del modelo tras una corrida que no llegó a nada.
 *
 * El default de «Máx. tokens» (4 096) deja al bucle del agente sin aire: el
 * system ronda los 2 200 tokens y la exploración muere a mitad de camino. El
 * usuario no tiene por qué saber que ese slider existe, así que el chat le
 * ofrece el cambio hecho —y el reintento— en un botón (#358).
 *
 * Puro: decide QUÉ ofrecer; aplicarlo (persistir + recrear el engine + reenviar
 * el pedido) es del contexto del agente.
 */
import { nextWindow } from "@/lib/ai-config";
import type { AgentHint } from "@/lib/agent-types";

export interface WindowOffer {
  /** Ventana que se aplicaría al aceptar. */
  next: number;
  /** Texto del botón. */
  label: string;
}

/** Oferta para el mensaje, o `null` si no hay nada que ofrecer. */
export function offerWiderWindow(
  hint: AgentHint | undefined,
  actual: number | undefined
): WindowOffer | null {
  if (hint !== "ventana-corta") return null;
  const next = nextWindow(actual);
  // Ya está al tope: ofrecer un botón que no cambia nada es peor que no ofrecerlo.
  if (!next) return null;
  return { next, label: `Ampliar a ${next} tokens y reintentar` };
}
