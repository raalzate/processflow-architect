/**
 * Corpus de la prueba de PARIDAD (spec 027 · T20, SC-004): diagramas sobre los
 * que las reglas semánticas de calidad y las formas deben decir exactamente lo
 * mismo. Junta los seis diagramas reales (anonimizados) de la feature 017, el
 * proyecto «Pedidos» y modelos chicos que pisan cada rama de cada regla —los
 * mismos casos que ejercita `mcp/__tests__/quality.test.ts` y los bordes que
 * esa suite no pisa (dos arranques en un Pool, cita pegada, documento sin
 * adjuntar, flecha a un elemento que no existe…).
 *
 * Los tipos se piden por ROL al registro: el corpus sobrevive a un renombre.
 */
import {
  addContainer,
  addEdge,
  addNode,
  emptyDiagram,
  type DiagramModel,
} from "@/lib/mcp/diagram-builder";
import { FIXTURES } from "@/lib/layout/__tests__/fixtures";
import { typesWithRole, type ElementRole, type NotationId } from "@/lib/notations";
import { modeloBPMN, modeloC4, modeloES } from "./pedidos";

const tipo = (n: NotationId, rol: ElementRole) => {
  const t = typesWithRole(n, rol)[0];
  if (!t) throw new Error(`${n} no declara ${rol}`);
  return t;
};

type Caja = [id: string, nombre: string, rol: ElementRole, en?: string, extra?: { descripcion?: string; source?: string }];
type Flecha = [fuente: string, destino: string, etiqueta?: string];

function armar(n: NotationId, contenedores: [string, ElementRole][], cajas: Caja[], flechas: Flecha[]): DiagramModel {
  let m = emptyDiagram({ nombre_proyecto: "Corpus", notation: n });
  for (const [nombre, rol] of contenedores) m = addContainer(m, { nombre, tipo_elemento: tipo(n, rol) }).model;
  for (const [id, nombre, rol, en, extra] of cajas)
    m = addNode(m, { id, nombre, tipo_elemento: tipo(n, rol), container: en, ...extra }).model;
  for (const [fuente, destino, descripcion] of flechas) m = addEdge(m, { fuente, destino, descripcion });
  return m;
}

const DESC = "Registra el pago del cliente y deja constancia para conciliación";

export const CORPUS: { nombre: string; modelo: () => DiagramModel }[] = [
  ...FIXTURES.map((f) => ({ nombre: `real:${f.id}`, modelo: f.modelo })),
  { nombre: "pedidos:es", modelo: modeloES },
  { nombre: "pedidos:bpmn", modelo: modeloBPMN },
  { nombre: "pedidos:c4", modelo: modeloC4 },
  {
    nombre: "bpmn:decision-sin-condicion",
    modelo: () =>
      armar(
        "bpmn",
        [],
        [
          ["ini", "Pedido recibido", "start"],
          ["t1", "Revisar pedido", "task"],
          ["gw", "¿Hay stock?", "gateway"],
          ["t2", "Preparar envío", "task"],
          ["fin", "Fin", "end"],
        ],
        [["ini", "t1", "inicia"], ["t1", "gw", "evalúa"], ["gw", "t2", "Sí"], ["gw", "fin"], ["t2", "fin", "listo"]]
      ),
  },
  {
    nombre: "bpmn:decisiones-varias",
    modelo: () =>
      armar(
        "bpmn",
        [],
        [
          ["ini", "Inicio", "start"],
          ["t1", "Revisar", "task"],
          ["gw", "Validación stock", "gateway"],
          ["gw2", "Suelta", "gateway"],
          ["gw3", "¿Colgada?", "gateway"],
          ["fin", "Fin", "end"],
        ],
        [["ini", "t1", "x"], ["t1", "gw", "x"], ["gw", "fin", "Sí"], ["gw", "t1", "No"], ["gw2", "fin"], ["t1", "gw3"]]
      ),
  },
  {
    nombre: "bpmn:sin-arranque-ni-cierre",
    modelo: () => armar("bpmn", [], [["a", "Revisar", "task"], ["b", "Aprobar", "task"]], [["a", "b", "sigue"]]),
  },
  {
    nombre: "bpmn:dos-arranques-en-pool",
    modelo: () =>
      armar(
        "bpmn",
        [["Cliente", "pool"], ["Vacío", "pool"]],
        [
          ["i1", "Solicitud recibida", "start", "Cliente"],
          ["i2", "Cliente llama", "start", "Cliente"],
          ["t1", "Atender", "task", "Cliente"],
          ["fin", "Fin", "end", "Cliente"],
        ],
        [["i1", "t1", "x"], ["i2", "t1", "x"], ["t1", "fin", "x"]]
      ),
  },
  {
    // Contenedores anidados (un import de Mermaid con subgraphs): el Pool queda
    // VACÍO en el lienzo aunque sus carriles tengan arranques.
    nombre: "bpmn:contenedores-anidados",
    modelo: () => {
      let m = armar(
        "bpmn",
        [["Ventas", "pool"], ["Mostrador", "lane"]],
        [
          ["i1", "Llega cliente", "start", "Mostrador"],
          ["i2", "Llama cliente", "start", "Mostrador"],
          ["t1", "Atender", "task", "Mostrador"],
          ["fin", "Atendido", "end", "Mostrador"],
        ],
        [["i1", "t1", "x"], ["i2", "t1", "x"], ["t1", "fin", "x"]]
      );
      m = { ...m, nodes: m.nodes.map((n) => (n.nombre === "Mostrador" ? { ...n, container: "Ventas" } : n)) };
      return m;
    },
  },
  {
    nombre: "uml:sin-arranque",
    modelo: () => armar("uml", [], [["a", "Registrar pago", "task"], ["b", "Cerrar caso", "task"]], [["a", "b", "sigue"]]),
  },
  {
    nombre: "ddd:comando-sin-evento",
    modelo: () => armar("ddd", [], [["cmd", "Pagar Pedido", "command"], ["act", "Cliente", "actor"]], [["act", "cmd", "ejecuta"]]),
  },
  {
    nombre: "ddd:cadena-completa",
    modelo: () =>
      armar(
        "ddd",
        [],
        [
          ["cmd", "Pagar Pedido", "command"],
          ["evt", "Pago Confirmado", "event"],
          ["pol", "Preparar envío", "policy"],
          ["cmd2", "Preparar Envío", "command"],
          ["evt2", "Envío Preparado", "event"],
        ],
        [["cmd", "evt", "dispara"], ["evt", "pol", "activa"], ["pol", "cmd2", "dispara"], ["cmd2", "evt2", "dispara"]]
      ),
  },
  {
    nombre: "ddd:politicas-incompletas",
    modelo: () =>
      armar(
        "ddd",
        [],
        [
          ["evt", "Pago Confirmado", "event"],
          ["pol", "Cancelar sin pago", "policy"],
          ["pol2", "Sorda", "policy"],
          ["pol3", "Muda", "policy"],
          ["cmd", "Reintentar", "command"],
          ["huerf", "Evento huérfano", "event"],
        ],
        // pol3 dibuja la flecha AL evento (reacciona a), no desde él.
        [["evt", "pol", "activa"], ["pol2", "cmd", "emite"], ["pol3", "evt", "reacciona a"], ["cmd", "evt", "dispara"]]
      ),
  },
  {
    nombre: "c4:relaciones",
    modelo: () => {
      const m = armar(
        "c4",
        [["Plataforma", "boundary"]],
        [
          ["u", "Cliente", "actor"],
          ["s", "Pagos", "system", "Plataforma"],
          ["db", "PagosDB", "datastore", "Plataforma"],
        ],
        [["u", "s"], ["s", "db", "escribe [SQL]"]]
      );
      // Una flecha a un elemento que no existe (un import a mano): el constructor
      // la rechaza, pero un archivo roto la trae igual y la regla la nombra por su id.
      return { ...m, edges: [...m.edges, { fuente: "s", destino: "fantasma" }] };
    },
  },
  {
    nombre: "ddd:descripciones-y-fuentes",
    modelo: () => {
      const m = armar(
        "ddd",
        [["Cobros", "context"], ["Vacío", "context"]],
        [
          ["a", "Pagar", "command", "Cobros", { descripcion: DESC, source: "docs/pagos.md:12" }],
          ["b", "Pago hecho", "event", "Cobros", { descripcion: "Pago hecho" }],
          ["c", "Cobrar", "command", "Cobros", { descripcion: "Cobra. Fuente: docs/cobros.md:3" }],
          ["d", "Sin", "command", "Cobros", { source: "docs/otro.md" }],
          ["e", "Otro", "command", "Cobros", { source: "docs/otro.md:4" }],
          ["f", "Más", "command", "Cobros", { source: "docs/otro.md:5" }],
          ["g", "Y más", "command", "Cobros", { source: "docs/otro.md:6", descripcion: "dos palabras" }],
        ],
        [["a", "b", "dispara"]]
      );
      return { ...m, sources: [{ nombre: "docs/pagos.md", texto: "linea\n".repeat(20) }] };
    },
  },
];
