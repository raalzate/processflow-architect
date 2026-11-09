/**
 * Proyecto de referencia «Pedidos» (spec 027, quickstart): el MISMO dominio
 * contado en tres notaciones —Event Storming, BPMN y C4— para que las preguntas
 * de competencia (PC-01…PC-10) tengan algo concreto que contestar.
 *
 * Se construye con el constructor del MCP (`diagram-builder`) y no a mano: así
 * el fixture tiene exactamente la forma que tiene un proyecto real en disco.
 */
import {
  addContainer,
  addEdge,
  addNode,
  emptyDiagram,
  toGraphData,
  type BuilderEdge,
  type DiagramModel,
} from "@/lib/mcp/diagram-builder";
import type { NotationId } from "@/lib/notations";
import type { DesignView, VinculoVistas } from "@/lib/views-types";

export const PROYECTO_PEDIDOS = "pedidos";

type Caja = { id: string; nombre: string; tipo: string; en?: string };

function modelo(
  notation: NotationId,
  contenedores: Caja[],
  cajas: Caja[],
  aristas: BuilderEdge[]
): DiagramModel {
  let m = emptyDiagram({ nombre_proyecto: "Pedidos", notation, fecha_analisis: "2026-11-09" });
  for (const c of contenedores) m = addContainer(m, { id: c.id, nombre: c.nombre, tipo_elemento: c.tipo }).model;
  for (const c of cajas) m = addNode(m, { id: c.id, nombre: c.nombre, tipo_elemento: c.tipo, container: c.en }).model;
  for (const a of aristas) m = addEdge(m, a);
  return m;
}

/** Event Storming (DDD): la cadena comando → evento → política → comando → evento. */
export const modeloES = (): DiagramModel =>
  modelo(
    "ddd",
    [{ id: "agg-Pagos", nombre: "Pagos", tipo: "Contexto Delimitado" }],
    [
      { id: "cliente", nombre: "Cliente", tipo: "Actor", en: "Pagos" },
      { id: "pagar", nombre: "Pagar", tipo: "Comando", en: "Pagos" },
      { id: "pago-realizado", nombre: "PagoRealizado", tipo: "Evento", en: "Pagos" },
      { id: "facturar", nombre: "Facturar", tipo: "Política", en: "Pagos" },
      { id: "facturar-pedido", nombre: "FacturarPedido", tipo: "Comando", en: "Pagos" },
      { id: "factura-emitida", nombre: "FacturaEmitida", tipo: "Evento", en: "Pagos" },
      // Sin evento a propósito: es el caso que la forma CADENA debe señalar.
      { id: "cancelar", nombre: "Cancelar", tipo: "Comando", en: "Pagos" },
    ],
    [
      { fuente: "cliente", destino: "pagar", descripcion: "invoca" },
      // «emite» y no «dispara»: el sinónimo es lo que el predicado debe reconocer (Q2).
      { fuente: "pagar", destino: "pago-realizado", descripcion: "emite" },
      { fuente: "facturar", destino: "pago-realizado", descripcion: "reacciona a" },
      { fuente: "facturar", destino: "facturar-pedido", descripcion: "emite" },
      { fuente: "facturar-pedido", destino: "factura-emitida", descripcion: "dispara" },
    ]
  );

/** BPMN: el cobro, con una compuerta de dos ramas. */
export const modeloBPMN = (): DiagramModel =>
  modelo(
    "bpmn",
    [{ id: "agg-Pagos", nombre: "Pagos", tipo: "Pool" }],
    [
      { id: "inicio", nombre: "Pedido recibido", tipo: "Evento de Inicio", en: "Pagos" },
      { id: "cobrar", nombre: "Cobrar", tipo: "Tarea", en: "Pagos" },
      { id: "aprobado", nombre: "¿Aprobado?", tipo: "Compuerta Exclusiva", en: "Pagos" },
      { id: "confirmar", nombre: "Confirmar pago", tipo: "Tarea", en: "Pagos" },
      { id: "rechazar", nombre: "Rechazar pago", tipo: "Tarea", en: "Pagos" },
      { id: "fin", nombre: "Pago procesado", tipo: "Evento de Fin", en: "Pagos" },
    ],
    [
      { fuente: "inicio", destino: "cobrar" },
      { fuente: "cobrar", destino: "aprobado" },
      { fuente: "aprobado", destino: "confirmar", descripcion: "Sí" },
      { fuente: "aprobado", destino: "rechazar", descripcion: "No" },
      { fuente: "confirmar", destino: "fin" },
      { fuente: "rechazar", destino: "fin" },
    ]
  );

/** C4: el paisaje de sistemas del mismo dominio. */
export const modeloC4 = (): DiagramModel =>
  modelo(
    "c4",
    [],
    [
      { id: "cliente", nombre: "Cliente", tipo: "Persona" },
      { id: "pagos", nombre: "Pagos", tipo: "Sistema" },
      { id: "pagos-db", nombre: "PagosDB", tipo: "Base de Datos" },
      { id: "pasarela", nombre: "Pasarela", tipo: "Sistema Externo" },
    ],
    [
      { fuente: "cliente", destino: "pagos", descripcion: "Usa" },
      { fuente: "pagos", destino: "pagos-db", descripcion: "Escribe en [SQL]" },
      { fuente: "pagos", destino: "pasarela", descripcion: "Usa [HTTPS]" },
    ]
  );

const vista = (id: string, name: string, notation: NotationId, m: DiagramModel): DesignView => ({
  id,
  name,
  kind: "graph",
  notation,
  graph: toGraphData(m),
  createdAt: "2026-11-09T00:00:00.000Z",
});

/** Las tres vistas del proyecto, como las guarda el archivo del tablero. */
export const vistasPedidos = (): DesignView[] => [
  vista("v-es", "Event Storming", "ddd", modeloES()),
  vista("v-bpmn", "Proceso de cobro", "bpmn", modeloBPMN()),
  vista("v-c4", "Paisaje", "c4", modeloC4()),
];

/**
 * «Pagos» en las tres vistas (vínculos de US6, decisión Q8): el Contexto del
 * Event Storming y el Pool del BPMN son la misma zona; el Sistema del C4 la
 * REALIZA —un Agente no puede ser una Frontera—.
 */
export const VINCULOS_PEDIDOS: VinculoVistas[] = [
  { id: "v1", tipo: "es_mismo_que", a: { vista: "v-es", nodo: "agg-Pagos" }, b: { vista: "v-bpmn", nodo: "agg-Pagos" }, estado: "aceptado" },
  { id: "v2", tipo: "realiza", a: { vista: "v-c4", nodo: "pagos" }, b: { vista: "v-es", nodo: "agg-Pagos" }, estado: "aceptado" },
];
