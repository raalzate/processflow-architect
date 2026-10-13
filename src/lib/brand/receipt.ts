/**
 * @fileOverview Recibo de fidelidad de una propuesta de marca (PURO, spec 023).
 *
 * Lo que diagram-design llama «fidelity receipt»: de qué URL salió, qué se
 * detectó y de dónde, qué se ajustó por contraste (original → ajustado →
 * relación), qué se descartó y qué quedó en respaldo. Es texto para leer antes
 * de aplicar; se guarda con el perfil para saber, meses después, por qué ese
 * acento es ese.
 */

import type { Extraccion } from "./extract";
import type { MedidaDeToken, TokenDeMarca, Triplete } from "./profile";

export interface DatosDeRecibo {
  url: string;
  urlFinal?: string;
  fecha: string;
  extraccion: Extraccion;
  /** Tokens finales (tras IA y ajustes), para listar los que vinieron de relleno. */
  tokens: Partial<Record<TokenDeMarca, Triplete>>;
  medidas: MedidaDeToken[];
  conIa: boolean;
  motivoIa?: string;
}

const f2 = (n: number | null) => (n === null ? "?" : n.toFixed(2));

export function reciboDe(d: DatosDeRecibo): string[] {
  const lineas: string[] = [];
  lineas.push(`Leído: ${d.url}${d.urlFinal && d.urlFinal !== d.url ? ` → ${d.urlFinal} (una redirección)` : ""} · ${d.fecha}`);
  lineas.push(d.conIa ? "Mapeo: heurísticas + IA (salida estructurada validada contra los colores de la página)" : `Mapeo: heurísticas sin IA${d.motivoIa ? ` (${d.motivoIa})` : ""}`);
  for (const e of d.extraccion.evidencia) lineas.push(e);
  for (const m of d.medidas) {
    if (m.ok) lineas.push(`${m.token} ${m.valor} · ${f2(m.ratio)}:1 ≥ ${m.umbral}:1 ✓`);
    else if (m.propuesta) lineas.push(`${m.token} ${m.valor} · ${f2(m.ratio)}:1 < ${m.umbral}:1 → ajustado a ${m.propuesta} · ${f2(m.ratioPropuesta)}:1`);
    else lineas.push(`${m.token} ${m.valor} · ${f2(m.ratio)}:1 < ${m.umbral}:1 → sin ajuste posible, revisá a mano`);
  }
  const faltantes = (Object.keys(d.tokens) as TokenDeMarca[]).filter((t) => !d.extraccion.tokens[t]);
  if (faltantes.length) lineas.push(`Rellenados con la skin o derivados: ${faltantes.join(", ")}`);
  const descartados = d.extraccion.candidatos
    .filter((c) => !Object.values(d.extraccion.tokens).includes(c.color))
    .slice(0, 5);
  if (descartados.length) lineas.push(`Descartados: ${descartados.map((c) => `${c.color} (${c.veces})`).join(", ")}`);
  lineas.push(d.extraccion.fuente ? `Fuente: ${d.extraccion.fuente} (se usa si está instalada; si no, la pila de respaldo)` : "Fuente: no detectada; pila de respaldo del sistema");
  return lineas;
}
