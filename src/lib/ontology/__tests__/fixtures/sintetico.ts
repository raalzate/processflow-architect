/**
 * Proyecto SINTÉTICO de rendimiento (spec 027 · T17, SC-003): N vistas de 40
 * elementos. Cada vista es Event Storming en cadena (comando → evento →
 * política → comando…) dentro de un contexto: el peor caso razonable para el
 * razonador, porque `provoca` es transitiva a lo largo de toda la vista.
 *
 * Lo usan la prueba del mecanismo (gate) y `scripts/bench-ontology.ts`, que
 * mide los milisegundos fuera del gate.
 */
import { addContainer, addEdge, addNode, emptyDiagram, toGraphData, type DiagramModel } from "../../../mcp/diagram-builder";
import { typesWithRole, type ElementRole } from "../../../notations";
import type { GraphData } from "../../../types";
import type { DesignView } from "../../../views-types";

export const ELEMENTOS_POR_VISTA = 40;

const tipo = (rol: ElementRole) => typesWithRole("ddd", rol)[0];

export function vistaSintetica(i: number): DiagramModel {
  let m = emptyDiagram({ nombre_proyecto: "Sintético", notation: "ddd" });
  m = addContainer(m, { id: "ctx", nombre: `Contexto ${i}`, tipo_elemento: tipo("context") }).model;
  const ciclo: ElementRole[] = ["command", "event", "policy"];
  let previo: string | undefined;
  for (let k = 0; k < ELEMENTOS_POR_VISTA - 1; k++) {
    const rol = k % 13 === 12 ? "actor" : ciclo[k % 3];
    const id = `n${k}`;
    m = addNode(m, {
      id,
      nombre: `${rol} ${i}-${k}`,
      tipo_elemento: tipo(rol),
      container: `Contexto ${i}`,
      descripcion: "hace algo concreto que se puede leer bien",
    }).model;
    if (previo && rol !== "actor") m = addEdge(m, { fuente: previo, destino: id });
    if (rol !== "actor") previo = id;
  }
  return m;
}

// Armar 2000 cajas con el constructor inmutable cuesta más que razonarlas: cada
// grafo se arma una vez y se comparte entre proyectos (el nombre del proyecto
// cambia el IRI y el hash, así que el memo del conocimiento no se confunde).
const GRAFOS = new Map<number, GraphData>();
const grafo = (i: number) => GRAFOS.get(i) ?? GRAFOS.set(i, toGraphData(vistaSintetica(i))).get(i)!;

/**
 * Un BPMN LINEAL de `n` tareas (#742 · O2): el peor caso de `precede`, que es
 * transitiva. La clausura son exactamente n(n-1)/2 hechos `precede`, así que
 * sirve también para probar que optimizar el razonador no pierde ninguno.
 */
export function procesoLineal(n: number): DiagramModel {
  let m = emptyDiagram({ nombre_proyecto: "Lineal", notation: "bpmn" });
  const tarea = typesWithRole("bpmn", "task")[0];
  for (let i = 0; i < n; i++) {
    m = addNode(m, { id: `t${i}`, nombre: `Paso ${i}`, tipo_elemento: tarea }).model;
    if (i) m = addEdge(m, { fuente: `t${i - 1}`, destino: `t${i}` });
  }
  return m;
}

export function proyectoSintetico(nombre: string, vistas: number): { proyecto: string; vistas: DesignView[] } {
  return {
    proyecto: nombre,
    vistas: Array.from({ length: vistas }, (_, i) => ({
      id: `v${i}`,
      name: `Vista ${i}`,
      kind: "graph" as const,
      notation: "ddd" as const,
      graph: grafo(i),
      createdAt: "",
    })),
  };
}
