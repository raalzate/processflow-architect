import { describe, it, expect } from "vitest";
import {
  emptyDiagram,
  addContainer,
  addNode,
  addEdge,
  recordAmbiguity,
  resolveAmbiguity,
  type DiagramModel,
} from "../diagram-builder";
import { reviewPacket } from "../review";
import { suggestViews, formatViewPlan } from "../view-plan";
import { typesWithRole } from "../../notations";
import { MAX_NODES } from "../quality";

const t = (notation: string, role: Parameters<typeof typesWithRole>[1]) =>
  typesWithRole(notation, role)[0];

/** DDD mínimo y CORRECTO (comando → evento) con fuente en cada nodo. */
function dddSano(): DiagramModel {
  let m = emptyDiagram({ nombre_proyecto: "Ventas", notation: "ddd" as const });
  m = addContainer(m, { nombre: "Pagos", tipo_elemento: t("ddd", "context") }).model;
  m = addNode(m, {
    id: "cmd",
    nombre: "Pagar Pedido",
    tipo_elemento: t("ddd", "command"),
    container: "Pagos",
    source: "PRD §3.1",
  }).model;
  m = addNode(m, {
    id: "evt",
    nombre: "Pago Confirmado",
    tipo_elemento: t("ddd", "event"),
    container: "Pagos",
    source: "PRD §3.1",
  }).model;
  return addEdge(m, { fuente: "cmd", destino: "evt", descripcion: "dispara" });
}

describe("reviewPacket", () => {
  it("trae los 5 bloques en orden fijo", () => {
    const p = reviewPacket(dddSano(), "PRD Aurora v3");
    const orden = ["## 1 · La historia", "## 2 · Elemento ← fuente", "## 3 · Decisiones", "## 4 · Hallazgos", "## 5 · Veredicto"];
    let cursor = -1;
    for (const h of orden) {
      const i = p.markdown.indexOf(h);
      expect(i, `falta ${h}`).toBeGreaterThan(-1);
      expect(i).toBeGreaterThan(cursor);
      cursor = i;
    }
    expect(p.markdown).toContain("PRD Aurora v3");
    expect(p.markdown).toContain("```mermaid");
  });

  it("agrupa la tabla elemento←fuente por contenedor y cita la fuente", () => {
    const p = reviewPacket(dddSano());
    expect(p.markdown).toContain("### Pagos");
    expect(p.markdown).toContain("PRD §3.1");
    expect(p.untraced).toEqual([]);
    expect(p.ready).toBe(true);
  });

  it("lista los elementos sin fuente y los declara al revisor", () => {
    let m = dddSano();
    m = addNode(m, {
      id: "extra",
      nombre: "Notificar Cliente",
      tipo_elemento: t("ddd", "command"),
      container: "Pagos",
    }).model;
    m = addEdge(m, { fuente: "evt", destino: "extra", descripcion: "luego" });
    const p = reviewPacket(m);
    expect(p.untraced).toContain("Notificar Cliente");
    expect(p.markdown).toContain("sin fuente");
  });

  it("separa decisiones tomadas de lo pendiente en la fuente", () => {
    let m = dddSano();
    const a = recordAmbiguity(m, { pregunta: "¿Quién aprueba el reembolso?" });
    m = a.model;
    const b = recordAmbiguity(m, { pregunta: "¿El pago admite parciales?" });
    m = resolveAmbiguity(b.model, b.id, "No, la fuente lo descarta");
    const p = reviewPacket(m);
    expect(p.markdown).toContain("Decisiones tomadas");
    expect(p.markdown).toContain("No, la fuente lo descarta");
    expect(p.markdown).toContain("Pendiente en la fuente");
    expect(p.markdown).toContain("¿Quién aprueba el reembolso?");
  });

  it("bloquea el veredicto cuando hay hallazgos graves", () => {
    let m = emptyDiagram({ nombre_proyecto: "Proceso", notation: "bpmn" as const });
    m = addNode(m, { id: "a", nombre: "Revisar", tipo_elemento: t("bpmn", "task") }).model;
    m = addNode(m, { id: "b", nombre: "Aprobar", tipo_elemento: t("bpmn", "task") }).model;
    m = addEdge(m, { fuente: "a", destino: "b", descripcion: "sigue" });
    const p = reviewPacket(m);
    expect(p.ready).toBe(false);
    expect(p.markdown).toContain("No exportes todavía");
  });
});

describe("suggestViews", () => {
  it("no propone nada si el modelo se sostiene en una vista", () => {
    const views = suggestViews(dddSano());
    expect(views).toEqual([]);
    expect(formatViewPlan(views)).toContain("una sola vista");
  });

  it("corta por contenedor cuando el diagrama pasa el tamaño legible", () => {
    let m = emptyDiagram({ nombre_proyecto: "Grande", notation: "ddd" as const });
    m = addContainer(m, { nombre: "Pagos", tipo_elemento: t("ddd", "context") }).model;
    m = addContainer(m, { nombre: "Logística", tipo_elemento: t("ddd", "context") }).model;
    for (let i = 0; i < MAX_NODES + 4; i++) {
      m = addNode(m, {
        id: `n${i}`,
        nombre: `Cmd ${i}`,
        tipo_elemento: t("ddd", "command"),
        container: i % 2 ? "Pagos" : "Logística",
      }).model;
    }
    const splits = suggestViews(m).filter((v) => v.kind === "split");
    expect(splits.map((v) => v.name).sort()).toEqual(["Logística", "Pagos"]);
    expect(formatViewPlan(splits)).toContain("Cortes");
  });

  it("propone el paisaje C4 cuando el modelo nombra varios sistemas", () => {
    let m = dddSano();
    for (const [i, nombre] of ["Pasarela", "ERP", "Courier"].entries()) {
      m = addNode(m, {
        id: `sys${i}`,
        nombre,
        tipo_elemento: t("ddd", "external"),
        source: "PRD §5",
      }).model;
      m = addEdge(m, { fuente: "evt", destino: `sys${i}`, descripcion: "notifica" });
    }
    const c4 = suggestViews(m).find((v) => v.notation === "c4");
    expect(c4?.kind).toBe("complement");
    expect(c4?.rationale).toContain("3");
  });

  it("propone el BPMN del contenedor con más pasos", () => {
    let m = dddSano();
    for (let i = 0; i < 4; i++) {
      m = addNode(m, {
        id: `c${i}`,
        nombre: `Paso ${i}`,
        tipo_elemento: t("ddd", "command"),
        container: "Pagos",
        source: "PRD §4",
      }).model;
      m = addEdge(m, { fuente: "evt", destino: `c${i}`, descripcion: "luego" });
    }
    const bpmn = suggestViews(m).find((v) => v.notation === "bpmn");
    expect(bpmn?.name).toContain("Pagos");
    expect(bpmn?.covers).toEqual(["Pagos"]);
  });

  it("propone la visión de dominio a un proceso con muchos pasos", () => {
    let m = emptyDiagram({ nombre_proyecto: "Proceso", notation: "bpmn" as const });
    m = addNode(m, { id: "ini", nombre: "Inicio", tipo_elemento: t("bpmn", "start") }).model;
    m = addNode(m, { id: "fin", nombre: "Fin", tipo_elemento: t("bpmn", "end") }).model;
    let prev = "ini";
    for (let i = 0; i < 7; i++) {
      m = addNode(m, { id: `t${i}`, nombre: `Tarea ${i}`, tipo_elemento: t("bpmn", "task") }).model;
      m = addEdge(m, { fuente: prev, destino: `t${i}`, descripcion: "sigue" });
      prev = `t${i}`;
    }
    m = addEdge(m, { fuente: prev, destino: "fin", descripcion: "cierra" });
    const ddd = suggestViews(m).find((v) => v.notation === "ddd");
    expect(ddd?.name).toBe("Visión de dominio");
  });
});
