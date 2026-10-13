/**
 * @fileOverview Ledger de fidelidad de un import (PURO, #540).
 *
 * Importar es REDIBUJAR, no convertir: la fuente aporta contenido (qué hay y
 * cómo se conecta) y la geometría, el estilo y el tema se descartan. Lo que un
 * import no puede callar es lo que NO llegó al dibujo: una nota que no tiene
 * caja, una activación que el lienzo no dibuja, una línea que el parser no
 * entendió. El usuario conoce la fuente y notaría la ausencia; el ledger se la
 * dice antes de que la busque. Adaptado del «fidelity ledger» de diagram-design
 * (ADR 0006).
 */

export interface ImportLedger {
  /** Lo que la fuente declara: elementos (cajas o participantes) y relaciones. */
  fuente: { elementos: number; relaciones: number };
  /** Lo que quedó dibujado. */
  dibujados: { elementos: number; relaciones: number };
  /** Lo que se quedó en el camino, una línea por cosa, con su motivo. */
  omitidos: string[];
}

export const ledgerVacio = (): ImportLedger => ({
  fuente: { elementos: 0, relaciones: 0 },
  dibujados: { elementos: 0, relaciones: 0 },
  omitidos: [],
});

/** El ledger en texto, para la respuesta de la herramienta y el toast de la UI. */
export function formatLedger(l: ImportLedger): string {
  const lineas = [
    `Fidelidad: ${l.fuente.elementos} elemento(s) → ${l.dibujados.elementos} dibujado(s) · ` +
      `${l.fuente.relaciones} relación(es) → ${l.dibujados.relaciones} dibujada(s).`,
  ];
  if (l.omitidos.length) {
    lineas.push("Omitido:");
    lineas.push(...l.omitidos.map((o) => `- ${o}`));
  } else {
    lineas.push("Nada se omitió: todo lo que la fuente declara está en el dibujo.");
  }
  return lineas.join("\n");
}
