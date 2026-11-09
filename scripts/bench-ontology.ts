/**
 * Banco de RENDIMIENTO de la ontología (spec 027 · T17, SC-003) — FUERA del gate.
 *
 *   npx tsx scripts/bench-ontology.ts
 *
 * Mide construir + razonar + validar sobre el proyecto sintético de 50 vistas ×
 * 40 elementos y sobre una sola vista, contra los topes de SC-003 (500 ms y
 * 50 ms en el equipo de referencia). No va al gate porque un tope de tiempo mide
 * la máquina del día (regla RELOJ, #376); el gate prueba el mecanismo en
 * `src/lib/ontology/__tests__/performance.test.ts`. Sale con 1 si no llega:
 * es la señal para decidir el Web Worker (R-09b) con datos.
 */
import { conocimientoDeModelo, construirConocimiento } from "../src/lib/ontology/conocimiento";
import { validar } from "../src/lib/ontology/validate";
import { procesoLineal, proyectoSintetico } from "../src/lib/ontology/__tests__/fixtures/sintetico";

const LARGO_LINEAL = 250;
const TOPE_PROYECTO = 500;
const TOPE_VISTA = 50;
const REPETICIONES = 7;

function mediana(xs: number[]): number {
  const o = [...xs].sort((a, b) => a - b);
  return o[Math.floor(o.length / 2)];
}

/** Cada corrida usa un proyecto con otro nombre: el memo no puede ayudar. */
function medir(etiqueta: string, vistas: number, alcance: Parameters<typeof construirConocimiento>[1]): number {
  const tiempos: number[] = [];
  for (let i = 0; i < REPETICIONES; i++) {
    const p = proyectoSintetico(`${etiqueta}-${i}`, vistas);
    const t0 = performance.now();
    validar(construirConocimiento(p, alcance));
    tiempos.push(performance.now() - t0);
  }
  return mediana(tiempos);
}

medir("calentar", 5, { tipo: "proyecto" });
const proyecto = medir("proyecto", 50, { tipo: "proyecto" });
const vista = medir("vista", 1, { tipo: "vista", vista: "v0" });

// #742 · O2: un proceso BPMN lineal largo es el peor caso de `precede` (transitiva).
// Antes de extender la clausura sólo con aristas base tardaba ~1,6 s. Se mide
// con las flechas BARAJADAS: dibujadas en orden, una cadena engaña al bench.
const lineal = mediana(
  Array.from({ length: 3 }, () => {
    const m = procesoLineal(LARGO_LINEAL, "barajado");
    const t0 = performance.now();
    validar(conocimientoDeModelo(m));
    return performance.now() - t0;
  })
);

const k = construirConocimiento(proyectoSintetico("conteo", 50), { tipo: "proyecto" });
console.log(`hechos: ${k.store.size} (${k.deducidos} deducidos en ${k.rondas} rondas)`);
console.log(`proyecto 50×40: ${proyecto.toFixed(1)} ms (tope ${TOPE_PROYECTO})`);
console.log(`una vista:      ${vista.toFixed(1)} ms (tope ${TOPE_VISTA})`);
console.log(`BPMN lineal ${LARGO_LINEAL} (barajado): ${lineal.toFixed(1)} ms (tope ${TOPE_PROYECTO})`);

const ok = proyecto < TOPE_PROYECTO && vista < TOPE_VISTA && lineal < TOPE_PROYECTO;
console.log(ok ? "SC-003: cumple" : "SC-003: NO cumple — evaluar Web Worker (R-09b)");
process.exit(ok ? 0 : 1);
