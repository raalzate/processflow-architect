import { describe, expect, it } from "vitest";
import { qualityFindings } from "@/lib/mcp/quality";
import { conocimientoDeModelo } from "../conocimiento";
import { validar } from "../validate";
import type { Hallazgo } from "../types";
import { CORPUS } from "./fixtures/corpus-calidad";
import golden from "./fixtures/quality-golden.json";

/** Las reglas que migraron a formas (FR-023). Las visuales siguen en quality.ts. */
const SEMANTICAS = new Set([
  "FLUJO-INICIO",
  "FLUJO-FIN",
  "RAMAS",
  "DECISION-PREGUNTA",
  "CADENA",
  "POLITICA",
  "RELACION-SIN-ETIQUETA",
  "CONTENEDOR-VACIO",
  "DESCRIPCION-POBRE",
  "FUENTE-SIN-ADJUNTAR",
]);

const comoFinding = (h: Hallazgo) => ({
  level: h.severidad === "error" ? "grave" : "aviso",
  rule: h.forma,
  message: h.mensaje,
  ...(h.nodo !== undefined ? { nodeId: h.nodo } : {}),
});

const gravesPrimero = <T extends { level: string }>(xs: T[]) => [
  ...xs.filter((x) => x.level === "grave"),
  ...xs.filter((x) => x.level !== "grave"),
];

/**
 * El ORÁCULO: lo que decían las reglas de calidad escritas como código, sobre
 * el corpus, generado con esa implementación ANTES de que delegara en las
 * formas. Congelado a propósito: después de la delegación, comparar
 * `qualityFindings` con `validar` sería compararlo consigo mismo. Si una regla
 * semántica cambia de comportamiento A PROPÓSITO, se regenera en un commit
 * aparte que lo justifique (§P2).
 */
const ANTES = golden as Record<string, unknown[]>;

// T20 · Q7, SC-004: mismas reglas, mismo mensaje, mismo nodo, mismo orden.
describe("paridad: reglas de calidad ≡ formas", () => {
  it.each(CORPUS.map((c) => [c.nombre, c.modelo] as const))("formas · %s", (nombre, modelo) => {
    const formas = gravesPrimero(validar(conocimientoDeModelo(modelo())).map(comoFinding));
    expect(formas).toEqual(ANTES[nombre]);
  });

  // T21: la revisión (quality → review → validate_diagram) dice lo mismo que antes.
  it.each(CORPUS.map((c) => [c.nombre, c.modelo] as const))("qualityFindings · %s", (nombre, modelo) => {
    expect(qualityFindings(modelo()).filter((f) => SEMANTICAS.has(f.rule))).toEqual(ANTES[nombre]);
  });

  it("el oráculo cubre todo el corpus y pisa las diez reglas", () => {
    expect(Object.keys(ANTES).sort()).toEqual(CORPUS.map((c) => c.nombre).sort());
    const vistas = new Set(Object.values(ANTES).flatMap((fs) => fs.map((f) => (f as { rule: string }).rule)));
    for (const r of SEMANTICAS) expect(vistas, r).toContain(r);
  });
});
