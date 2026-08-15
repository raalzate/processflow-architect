import { describe, it, expect } from "vitest";
import {
  emptyDiagram,
  addContainer,
  addNode,
  addEdge,
  type DiagramModel,
} from "../diagram-builder";
import { qualityFindings, formatFindings, MAX_NODES, MAX_NAME_CHARS } from "../quality";
import { typesWithRole } from "../../notations";

// Los tipos NUNCA se cablean en el test: se piden por rol al registro, igual que
// lo hacen las reglas. Así el test sobrevive a un renombre de la notación.
const tipo = (notation: string, role: Parameters<typeof typesWithRole>[1]) => {
  const t = typesWithRole(notation, role)[0];
  if (!t) throw new Error(`la notación ${notation} no declara el rol ${role}`);
  return t;
};

const rules = (m: DiagramModel) => qualityFindings(m).map((f) => f.rule);
const msgs = (m: DiagramModel) => qualityFindings(m).map((f) => f.message).join(" | ");

const nodo = (m: DiagramModel, id: string, nombre: string, role: any, notation = "bpmn", container?: string) =>
  addNode(m, { id, nombre, tipo_elemento: tipo(notation, role), container }).model;

describe("reglas de flujo (BPMN / UML)", () => {
  const bpmn = () => emptyDiagram({ nombre_proyecto: "Proceso", notation: "bpmn" as const });

  const conDecision = (): DiagramModel => {
    let m = bpmn();
    m = nodo(m, "ini", "Pedido recibido", "start");
    m = nodo(m, "t1", "Revisar pedido", "task");
    m = nodo(m, "gw", "¿Hay stock?", "gateway");
    m = nodo(m, "t2", "Preparar envío", "task");
    m = nodo(m, "fin", "Fin", "end");
    m = addEdge(m, { fuente: "ini", destino: "t1", descripcion: "inicia" });
    m = addEdge(m, { fuente: "t1", destino: "gw", descripcion: "evalúa" });
    return m;
  };

  it("exige condición en TODAS las ramas de una decisión", () => {
    let m = conDecision();
    m = addEdge(m, { fuente: "gw", destino: "t2", descripcion: "Sí" });
    m = addEdge(m, { fuente: "gw", destino: "fin" }); // sin condición
    m = addEdge(m, { fuente: "t2", destino: "fin", descripcion: "listo" });
    const f = qualityFindings(m).find((x) => x.rule === "RAMAS" && x.level === "grave");
    expect(f?.message).toContain("¿Hay stock?");
  });

  it("no se queja cuando todas las ramas dicen su caso", () => {
    let m = conDecision();
    m = addEdge(m, { fuente: "gw", destino: "t2", descripcion: "Sí" });
    m = addEdge(m, { fuente: "gw", destino: "fin", descripcion: "No" });
    m = addEdge(m, { fuente: "t2", destino: "fin", descripcion: "listo" });
    expect(rules(m)).not.toContain("RAMAS");
  });

  it("avisa de la decisión que no está nombrada como pregunta", () => {
    let m = bpmn();
    m = nodo(m, "ini", "Inicio", "start");
    m = nodo(m, "t1", "Revisar", "task");
    m = nodo(m, "gw", "Validación stock", "gateway");
    m = nodo(m, "fin", "Fin", "end");
    m = addEdge(m, { fuente: "ini", destino: "t1", descripcion: "x" });
    m = addEdge(m, { fuente: "t1", destino: "gw", descripcion: "x" });
    m = addEdge(m, { fuente: "gw", destino: "fin", descripcion: "Sí" });
    m = addEdge(m, { fuente: "gw", destino: "t1", descripcion: "No" });
    expect(rules(m)).toContain("DECISION-PREGUNTA");
  });

  it("reclama arranque y cierre cuando el proceso tiene tareas y no los tiene", () => {
    let m = bpmn();
    m = nodo(m, "a", "Revisar", "task");
    m = nodo(m, "b", "Aprobar", "task");
    m = addEdge(m, { fuente: "a", destino: "b", descripcion: "sigue" });
    const r = rules(m);
    expect(r).toContain("FLUJO-INICIO");
    expect(r).toContain("FLUJO-FIN");
    expect(qualityFindings(m).filter((f) => f.level === "grave").length).toBeGreaterThan(0);
  });

  it("avisa de dos arranques en el mismo Pool", () => {
    let m = bpmn();
    m = addContainer(m, { nombre: "Cliente", tipo_elemento: tipo("bpmn", "pool") }).model;
    m = nodo(m, "i1", "Solicitud recibida", "start", "bpmn", "Cliente");
    m = nodo(m, "i2", "Cliente llama", "start", "bpmn", "Cliente");
    m = nodo(m, "t1", "Atender", "task", "bpmn", "Cliente");
    m = nodo(m, "fin", "Fin", "end", "bpmn", "Cliente");
    m = addEdge(m, { fuente: "i1", destino: "t1", descripcion: "x" });
    m = addEdge(m, { fuente: "i2", destino: "t1", descripcion: "x" });
    m = addEdge(m, { fuente: "t1", destino: "fin", descripcion: "x" });
    expect(msgs(m)).toContain("arranques");
  });

  it("las reglas de flujo también aplican a UML (mismos roles, otra notación)", () => {
    let m = emptyDiagram({ nombre_proyecto: "Ciclo", notation: "uml" as const });
    m = nodo(m, "a", "Registrar pago", "task", "uml");
    m = nodo(m, "b", "Cerrar caso", "task", "uml");
    m = addEdge(m, { fuente: "a", destino: "b", descripcion: "sigue" });
    expect(rules(m)).toContain("FLUJO-INICIO");
  });
});

describe("reglas de dominio (DDD)", () => {
  const ddd = () => emptyDiagram({ nombre_proyecto: "Ventas", notation: "ddd" as const });

  it("exige la cadena Comando → Evento", () => {
    let m = ddd();
    m = nodo(m, "cmd", "Pagar Pedido", "command", "ddd");
    m = nodo(m, "act", "Cliente", "actor", "ddd");
    m = addEdge(m, { fuente: "act", destino: "cmd", descripcion: "ejecuta" });
    expect(msgs(m)).toContain("no produce ningún hecho");
  });

  it("acepta comando con su evento y política completa", () => {
    let m = ddd();
    m = nodo(m, "cmd", "Pagar Pedido", "command", "ddd");
    m = nodo(m, "evt", "Pago Confirmado", "event", "ddd");
    m = nodo(m, "pol", "Preparar envío", "policy", "ddd");
    m = nodo(m, "cmd2", "Preparar Envío", "command", "ddd");
    m = nodo(m, "evt2", "Envío Preparado", "event", "ddd");
    m = addEdge(m, { fuente: "cmd", destino: "evt", descripcion: "dispara" });
    m = addEdge(m, { fuente: "evt", destino: "pol", descripcion: "activa" });
    m = addEdge(m, { fuente: "pol", destino: "cmd2", descripcion: "dispara" });
    m = addEdge(m, { fuente: "cmd2", destino: "evt2", descripcion: "dispara" });
    expect(rules(m)).not.toContain("CADENA");
    expect(rules(m)).not.toContain("POLITICA");
  });

  it("avisa de la política que no cierra «cuando evento entonces comando»", () => {
    let m = ddd();
    m = nodo(m, "evt", "Pago Confirmado", "event", "ddd");
    m = nodo(m, "pol", "Cancelar sin pago", "policy", "ddd");
    m = addEdge(m, { fuente: "evt", destino: "pol", descripcion: "activa" });
    expect(rules(m)).toContain("POLITICA");
  });

  it("no aplica reglas de flujo BPMN a un DDD (no declara inicio/fin)", () => {
    let m = ddd();
    m = nodo(m, "cmd", "Pagar", "command", "ddd");
    m = nodo(m, "evt", "Pagado", "event", "ddd");
    m = addEdge(m, { fuente: "cmd", destino: "evt", descripcion: "dispara" });
    expect(rules(m)).not.toContain("FLUJO-INICIO");
    expect(rules(m)).not.toContain("FLUJO-FIN");
  });
});

describe("reglas de arquitectura (C4)", () => {
  it("exige etiqueta en toda relación", () => {
    let m = emptyDiagram({ nombre_proyecto: "Paisaje", notation: "c4" as const });
    m = nodo(m, "api", "API de Pedidos", "system", "c4");
    m = nodo(m, "pas", "Pasarela de Pagos", "external", "c4");
    m = addEdge(m, { fuente: "api", destino: "pas" });
    const f = qualityFindings(m).find((x) => x.rule === "RELACION-SIN-ETIQUETA");
    expect(f?.level).toBe("grave");
    expect(f?.message).toContain("API de Pedidos");
  });

  it("no se queja si la relación declara verbo y tecnología", () => {
    let m = emptyDiagram({ nombre_proyecto: "Paisaje", notation: "c4" as const });
    m = nodo(m, "api", "API de Pedidos", "system", "c4");
    m = nodo(m, "pas", "Pasarela de Pagos", "external", "c4");
    m = addEdge(m, { fuente: "api", destino: "pas", descripcion: "cobra el pedido [HTTPS/JSON]" });
    expect(rules(m)).not.toContain("RELACION-SIN-ETIQUETA");
  });
});

describe("reglas de presentación", () => {
  it("avisa del nombre que el lienzo recortaría", () => {
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "ddd" as const });
    m = nodo(m, "cmd", "Registrar la solicitud completa del cliente nuevo", "command", "ddd");
    m = nodo(m, "evt", "Solicitud Registrada", "event", "ddd");
    m = addEdge(m, { fuente: "cmd", destino: "evt", descripcion: "dispara" });
    expect(rules(m)).toContain("NOMBRE-LARGO");
  });

  it("avisa del contenedor vacío (el lienzo no anida contenedores)", () => {
    let m = emptyDiagram({ nombre_proyecto: "Proceso", notation: "bpmn" as const });
    m = addContainer(m, { nombre: "Aurora", tipo_elemento: tipo("bpmn", "pool") }).model;
    m = addContainer(m, { nombre: "Atención", tipo_elemento: tipo("bpmn", "lane") }).model;
    m = nodo(m, "ini", "Reclamo recibido", "start", "bpmn", "Atención");
    m = nodo(m, "t", "Validar", "task", "bpmn", "Atención");
    m = nodo(m, "fin", "Fin", "end", "bpmn", "Atención");
    m = addEdge(m, { fuente: "ini", destino: "t", descripcion: "inicia" });
    m = addEdge(m, { fuente: "t", destino: "fin", descripcion: "cierra" });

    const f = qualityFindings(m).find((x) => x.rule === "CONTENEDOR-VACIO");
    expect(f?.message).toContain("Aurora");
    expect(f?.message).toContain("no se anidan");
    // El carril que SÍ tiene elementos no se reporta.
    expect(qualityFindings(m).filter((x) => x.rule === "CONTENEDOR-VACIO")).toHaveLength(1);
  });

  it("avisa de la etiqueta de relación que no cabe sobre la línea", () => {
    let m = emptyDiagram({ nombre_proyecto: "Paisaje", notation: "c4" as const });
    m = nodo(m, "api", "API de Pedidos", "system", "c4");
    m = nodo(m, "pas", "Pasarela", "external", "c4");
    m = addEdge(m, {
      fuente: "api",
      destino: "pas",
      descripcion: "cotiza y diligencia su solicitud [navegador web]",
    });
    const f = qualityFindings(m).find((x) => x.rule === "ETIQUETA-LARGA");
    expect(f?.message).toContain("API de Pedidos");
    expect(f?.message).toContain("descripción");

    // Una etiqueta corta con su tecnología no molesta.
    let corto = emptyDiagram({ nombre_proyecto: "Paisaje", notation: "c4" as const });
    corto = nodo(corto, "api", "API de Pedidos", "system", "c4");
    corto = nodo(corto, "pas", "Pasarela", "external", "c4");
    corto = addEdge(corto, { fuente: "api", destino: "pas", descripcion: "cobra [HTTPS]" });
    expect(rules(corto)).not.toContain("ETIQUETA-LARGA");
  });

  it("el umbral de nombre sale de la geometría real del lienzo", () => {
    // 21 caracteres es lo que cabe en una caja de 160 px con padding y text-xs.
    expect(MAX_NAME_CHARS).toBeGreaterThanOrEqual(18);
    expect(MAX_NAME_CHARS).toBeLessThanOrEqual(24);
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "ddd" as const });
    m = nodo(m, "a", "Registro Civil de Ecuador", "command", "ddd"); // 25 car.
    m = nodo(m, "b", "Pago Confirmado", "event", "ddd"); // 15 car.
    m = addEdge(m, { fuente: "a", destino: "b", descripcion: "dispara" });
    const largos = qualityFindings(m).filter((f) => f.rule === "NOMBRE-LARGO");
    expect(largos).toHaveLength(1);
    expect(largos[0].message).toContain("Registro Civil de Ecuador");
  });

  it("avisa de un diagrama que pasa el tamaño legible", () => {
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "ddd" as const });
    for (let i = 0; i < MAX_NODES + 1; i++) {
      m = addNode(m, {
        id: `n${i}`,
        nombre: `Cmd ${i}`,
        tipo_elemento: typesWithRole("ddd", "command")[0],
      }).model;
    }
    expect(rules(m)).toContain("TAMANO");
  });
});

describe("formatFindings", () => {
  it("resume una regla que se repite muchas veces en vez de listar 30 líneas", () => {
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "ddd" as const });
    for (let i = 0; i < 8; i++) {
      m = addNode(m, {
        id: `n${i}`,
        nombre: `Nombre larguísimo que no cabe ${i}`,
        tipo_elemento: typesWithRole("ddd", "command")[0],
      }).model;
    }
    m = addEdge(m, { fuente: "n0", destino: "n1", descripcion: "dispara" });
    const out = formatFindings(qualityFindings(m));
    expect(out).toContain("[NOMBRE-LARGO] 8 casos");
    expect(out).toContain("+5 más");
    // El detalle completo sigue disponible en la lista estructurada.
    expect(qualityFindings(m).filter((f) => f.rule === "NOMBRE-LARGO")).toHaveLength(8);
  });

  it("ordena los graves primero y marca el nivel", () => {
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "bpmn" as const });
    m = nodo(m, "t", "Tarea muy larga que no cabe de ninguna manera", "task");
    m = nodo(m, "t2", "Otra", "task");
    m = addEdge(m, { fuente: "t", destino: "t2", descripcion: "sigue" });
    const out = formatFindings(qualityFindings(m));
    expect(out.indexOf("❌")).toBeLessThan(out.indexOf("⚠️"));
    expect(formatFindings([])).toContain("Sin hallazgos");
  });
});
