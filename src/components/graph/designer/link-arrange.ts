/**
 * @fileOverview Aplicar al lienzo los RECORRIDOS que calculó «Organizar» (PURO).
 *
 * Reorganizar no es sólo mover cajas: si las posiciones cambian y las líneas se
 * quedan con su trazo viejo, el diagrama queda igual de ilegible que antes
 * (feature 017). Aquí se casan los recorridos que devuelve `arrangeGraphData`
 * con los enlaces del lienzo, que se identifican con un id aleatorio: la clave
 * común es el par de extremos y, entre repetidas, su turno.
 *
 * La geometría que movió una persona no se toca (FR-010): se reconoce porque no
 * está marcada como automática.
 */

import { claveDeRelacion } from "@/lib/layout/modelo";
import type { ArrangedEdge } from "@/lib/mcp/arrange";
import type { DesignerLink } from "./serialize";

/**
 * Devuelve los enlaces con los recorridos nuevos aplicados. El enlace sin
 * recorrido calculado pierde el que le hubiera puesto una disposición anterior
 * (es automático y se recalcula); el que ajustó el humano se queda como está.
 */
export function aplicarRecorridos(
  links: Map<string, DesignerLink>,
  edges: Record<string, ArrangedEdge>
): Map<string, DesignerLink> {
  const turnos = new Map<string, number>();
  const out = new Map<string, DesignerLink>();

  for (const [id, l] of links) {
    const par = `${l.sourceId}|${l.targetId}`;
    const turno = turnos.get(par) ?? 0;
    turnos.set(par, turno + 1);

    const manual = Boolean(l.midpoints?.length && !l.geometriaAuto);
    if (manual) {
      out.set(id, l);
      continue;
    }
    const nueva = edges[claveDeRelacion(l.sourceId, l.targetId, turno)];
    if (nueva) {
      out.set(id, {
        ...l,
        midpoint: undefined,
        midpoints: nueva.midpoints,
        routing: nueva.routing,
        geometriaAuto: true,
      });
    } else if (l.geometriaAuto) {
      // Ya no necesita esquivar nada: vuelve al enrutado de su notación.
      const { midpoints, routing, geometriaAuto, ...resto } = l;
      void midpoints;
      void routing;
      void geometriaAuto;
      out.set(id, { ...resto, midpoint: undefined });
    } else {
      out.set(id, l);
    }
  }
  return out;
}
