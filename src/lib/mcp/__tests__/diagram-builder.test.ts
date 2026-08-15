import { describe, it, expect } from "vitest";
import {
  emptyDiagram,
  addContainer,
  addNode,
  addEdge,
  removeNode,
  removeEdge,
  updateNode,
  updateEdge,
  validate,
  layout,
  relayout,
  reorderLanes,
  toGraphData,
  fromGraphData,
  slugify,
  bpmnFlowWarnings,
  traceabilityWarnings,
  recordAmbiguity,
  resolveAmbiguity,
  pendingAmbiguities,
  type DiagramModel,
} from "../diagram-builder";
import { processGraphData } from "../../graph-processor";
import { typesWithRole } from "../../notations";
import { DEFAULT_DENSITY } from "../layout-presets";
import { isContainerType } from "../catalog";

const base = { nombre_proyecto: "Ventas", notation: "ddd" as const };

describe("slugify", () => {
  it("normaliza acentos, mayúsculas y símbolos", () => {
    expect(slugify("Crear Pedido")).toBe("crear-pedido");
    expect(slugify("Política de Envío")).toBe("politica-de-envio");
    expect(slugify("   ")).toBe("nodo");
  });
});

describe("construcción", () => {
  it("autogenera ids únicos a partir del nombre", () => {
    let m = emptyDiagram(base);
    const a = addNode(m, { nombre: "Pago", tipo_elemento: "Comando" });
    m = a.model;
    const b = addNode(m, { nombre: "Pago", tipo_elemento: "Evento" });
    expect(a.id).toBe("pago");
    expect(b.id).toBe("pago-2");
  });

  it("rechaza usar un contenedor como nodo y viceversa", () => {
    const m = emptyDiagram(base);
    expect(() => addNode(m, { nombre: "X", tipo_elemento: "Agregado" })).toThrow();
    expect(() => addContainer(m, { nombre: "X", tipo_elemento: "Comando" })).toThrow();
  });

  it("rechaza un nodo en un contenedor inexistente", () => {
    const m = emptyDiagram(base);
    expect(() =>
      addNode(m, { nombre: "Cmd", tipo_elemento: "Comando", container: "NoExiste" })
    ).toThrow(/no existe/);
  });

  it("rechaza aristas con extremos inexistentes e ids duplicados", () => {
    let m = emptyDiagram(base);
    m = addNode(m, { id: "a", nombre: "A", tipo_elemento: "Comando" }).model;
    expect(() => addEdge(m, { fuente: "a", destino: "zzz" })).toThrow();
    expect(() => addNode(m, { id: "a", nombre: "otro", tipo_elemento: "Evento" })).toThrow(/id/);
  });

  it("removeNode borra un contenedor y libera a sus hijos y aristas", () => {
    let m = emptyDiagram(base);
    m = addContainer(m, { nombre: "Agg", tipo_elemento: "Agregado" }).model;
    const a = addNode(m, { id: "c", nombre: "C", tipo_elemento: "Comando", container: "Agg" });
    m = a.model;
    const b = addNode(m, { id: "e", nombre: "E", tipo_elemento: "Evento", container: "Agg" });
    m = b.model;
    m = addEdge(m, { fuente: "c", destino: "e" });
    m = removeNode(m, "c");
    expect(m.nodes.find((n) => n.id === "c")).toBeUndefined();
    expect(m.edges.length).toBe(0); // la arista que tocaba c desapareció
    m = removeNode(m, m.nodes.find((n) => n.nombre === "Agg")!.id);
    expect(m.nodes.find((n) => n.id === "e")!.container).toBe("");
  });
});

// Corregir sin destruir: acortar un nombre no debe costar las relaciones del
// elemento (era la razón por la que en la práctica no se corregía nada).
describe("updateNode / updateEdge", () => {
  const conCadena = (): DiagramModel => {
    let m = emptyDiagram(base);
    m = addContainer(m, { nombre: "Pagos", tipo_elemento: "Contexto Delimitado" }).model;
    m = addNode(m, { id: "cmd", nombre: "Registrar el medio de pago del titular", tipo_elemento: "Comando", container: "Pagos" }).model;
    m = addNode(m, { id: "evt", nombre: "Medio de pago registrado", tipo_elemento: "Evento", container: "Pagos" }).model;
    return addEdge(m, { fuente: "cmd", destino: "evt", descripcion: "registra tarjeta o cuenta y compensa [HTTPS/JSON]" });
  };

  it("acorta el nombre conservando id, relaciones y contenedor", () => {
    const m = updateNode(conCadena(), "cmd", {
      nombre: "Registrar medio pago",
      descripcion: "Nombre completo: Registrar el medio de pago del titular.",
    });
    const n = m.nodes.find((x) => x.id === "cmd")!;
    expect(n.nombre).toBe("Registrar medio pago");
    expect(n.container).toBe("Pagos");
    expect(n.descripcion).toContain("Nombre completo");
    expect(m.edges).toHaveLength(1);
    expect(m.edges[0]).toMatchObject({ fuente: "cmd", destino: "evt" });
  });

  it("renombrar un contenedor arrastra la referencia de sus hijos", () => {
    const m = updateNode(conCadena(), "pagos", { nombre: "Cobros" });
    expect(m.nodes.filter((n) => n.container === "Cobros")).toHaveLength(2);
    expect(m.nodes.filter((n) => n.container === "Pagos")).toHaveLength(0);
    expect(validate(m).errors).toEqual([]);
  });

  it("acorta la etiqueta de una relación y deja el detalle en su descripción", () => {
    const m = updateEdge(conCadena(), "cmd", "evt", { descripcion: "registra medio [HTTPS]" });
    expect(m.edges[0].descripcion).toBe("registra medio [HTTPS]");
    expect(m.nodes).toEqual(conCadena().nodes);
  });

  it("removeEdge quita el atajo sin llevarse los elementos", () => {
    const m = conCadena();
    const sin = removeEdge(m, "cmd", "evt");
    expect(sin.edges).toHaveLength(0);
    expect(sin.nodes).toEqual(m.nodes);
    expect(() => removeEdge(sin, "cmd", "evt")).toThrow(/No existe una relación/);
  });

  it("reclasifica dentro de la misma familia y rechaza cruzarla", () => {
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "bpmn" });
    m = addContainer(m, { nombre: "Cliente", tipo_elemento: typesWithRole("bpmn", "lane")[0] }).model;
    m = addNode(m, { id: "t", nombre: "Pedir", tipo_elemento: typesWithRole("bpmn", "task")[0], container: "Cliente" }).model;

    // Un carril que en realidad es un participante independiente pasa a Pool.
    const pool = typesWithRole("bpmn", "pool")[0];
    const reclasificado = updateNode(m, "cliente", { tipo_elemento: pool });
    expect(reclasificado.nodes.find((n) => n.id === "cliente")!.tipo_elemento).toBe(pool);
    expect(reclasificado.nodes.find((n) => n.id === "t")!.container).toBe("Cliente");

    // Pero un contenedor no se convierte en nodo suelto.
    expect(() => updateNode(m, "cliente", { tipo_elemento: typesWithRole("bpmn", "task")[0] })).toThrow(
      /misma familia/
    );
  });

  it("rechaza corregir lo que no existe y los nombres de contenedor duplicados", () => {
    const m = conCadena();
    expect(() => updateNode(m, "no-existe", { nombre: "X" })).toThrow(/No existe el elemento/);
    expect(() => updateEdge(m, "cmd", "no-existe", { descripcion: "x" })).toThrow(/No existe una relación/);
    const conDos = addContainer(m, { nombre: "Logística", tipo_elemento: "Contexto Delimitado" }).model;
    expect(() => updateNode(conDos, "logistica", { nombre: "Pagos" })).toThrow(/Ya hay un contenedor/);
  });
});

describe("validate", () => {
  it("avisa (warning) de nodos aislados que el lienzo descartaría", () => {
    let m = emptyDiagram(base);
    m = addNode(m, { nombre: "Suelto", tipo_elemento: "Comando" }).model;
    const r = validate(m);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes("Suelto"))).toBe(true);
  });

  it("avisa de tipos ajenos a la notación", () => {
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "ddd" });
    m = addNode(m, { id: "t", nombre: "Tarea BPMN", tipo_elemento: "Tarea" }).model;
    const r = validate(m);
    expect(r.warnings.some((w) => w.includes("Tarea"))).toBe(true);
  });
});

describe("toGraphData", () => {
  it("clasifica aristas en internas / políticas / big picture", () => {
    let m = emptyDiagram(base);
    m = addContainer(m, { nombre: "A", tipo_elemento: "Agregado" }).model;
    m = addContainer(m, { nombre: "B", tipo_elemento: "Agregado" }).model;
    const c1 = addNode(m, { id: "a1", nombre: "A1", tipo_elemento: "Comando", container: "A" });
    m = c1.model;
    const e1 = addNode(m, { id: "a2", nombre: "A2", tipo_elemento: "Evento", container: "A" });
    m = e1.model;
    const c2 = addNode(m, { id: "b1", nombre: "B1", tipo_elemento: "Comando", container: "B" });
    m = c2.model;
    const free = addNode(m, { id: "f1", nombre: "F1", tipo_elemento: "Actor" });
    m = free.model;
    m = addEdge(m, { fuente: "a1", destino: "a2" }); // interna A
    m = addEdge(m, { fuente: "a2", destino: "b1" }); // política A→B
    m = addEdge(m, { fuente: "f1", destino: "a1" }); // big picture (extremo suelto)

    const g = toGraphData(m);
    const aggA = g.agregados.find((a) => a.nombre_agregado === "A")!;
    expect(aggA.aristas.length).toBe(1);
    expect(g.politicas_inter_agregados!.length).toBe(1);
    expect(g.big_picture.aristas.length).toBe(1);
    expect(aggA.tipo_contenedor).toBe("Agregado");
  });

  it("asigna geometría y produce un GraphData que el procesador del grafo acepta", () => {
    let m = emptyDiagram(base);
    m = addContainer(m, { nombre: "Pedidos", tipo_elemento: "Agregado" }).model;
    const a = addNode(m, { id: "cmd", nombre: "Crear", tipo_elemento: "Comando", container: "Pedidos" });
    m = a.model;
    const b = addNode(m, { id: "evt", nombre: "Creado", tipo_elemento: "Evento", container: "Pedidos" });
    m = b.model;
    m = addEdge(m, { fuente: "cmd", destino: "evt" });

    const g = toGraphData(m);
    const agg = g.agregados[0];
    expect(typeof agg.x).toBe("number");
    expect(agg.nodos.every((n) => typeof n.x === "number" && typeof n.y === "number")).toBe(true);

    // El procesador del grafo de la app debe cargar ambos nodos (conectados).
    const processed = processGraphData(g);
    expect(processed.nodes.map((n) => n.id).sort()).toEqual(["cmd", "evt"]);
  });

  it("layout respeta coordenadas ya presentes", () => {
    let m = emptyDiagram(base);
    m = addNode(m, { id: "x", nombre: "X", tipo_elemento: "Actor", x: 123, y: 456 }).model;
    const laid = layout(m);
    const n = laid.nodes.find((n) => n.id === "x")!;
    expect(n.x).toBe(123);
    expect(n.y).toBe(456);
  });

});

describe("fromGraphData (round-trip)", () => {
  it("reconstruye un modelo editable desde un GraphData exportado", () => {
    let m = emptyDiagram(base);
    m = addContainer(m, { nombre: "Pedidos", tipo_elemento: "Agregado" }).model;
    const a = addNode(m, { id: "cmd", nombre: "Crear", tipo_elemento: "Comando", container: "Pedidos" });
    m = a.model;
    const b = addNode(m, { id: "evt", nombre: "Creado", tipo_elemento: "Evento", container: "Pedidos" });
    m = b.model;
    m = addEdge(m, { fuente: "cmd", destino: "evt" });

    const g = toGraphData(m);
    const back = fromGraphData(g, "ddd");
    // El contenedor + 2 nodos vuelven; la arista interna se recupera.
    expect(back.nodes.filter((n) => n.tipo_elemento === "Comando").length).toBe(1);
    expect(back.edges.length).toBe(1);
    const cmd = back.nodes.find((n) => n.id === "cmd")!;
    expect(cmd.container).toBe("Pedidos");
  });

  it("preserva el estilo de arista (dashed/arrow) al re-importar por el builder", () => {
    let m = emptyDiagram(base);
    m = addContainer(m, { id: "A", nombre: "A", tipo_elemento: "Agregado" }).model;
    m = addContainer(m, { id: "B", nombre: "B", tipo_elemento: "Agregado" }).model;
    const a = addNode(m, { id: "a1", nombre: "A1", tipo_elemento: "Comando", container: "A" });
    m = a.model;
    const b = addNode(m, { id: "b1", nombre: "B1", tipo_elemento: "Evento", container: "B" });
    m = b.model;
    // Arista entre contenedores distintos → política inter-agregados, con estilo.
    m = addEdge(m, { fuente: "a1", destino: "b1", descripcion: "resp", dashed: true, arrow: "both" });

    const back = fromGraphData(toGraphData(m), "ddd");
    const arista = back.edges.find((e) => e.descripcion === "resp")!;
    expect(arista.dashed).toBe(true);
    expect(arista.arrow).toBe("both");
  });
});

// -----------------------------------------------------------------------------
// Reglas de flujo BPMN: pools vs carriles (el error de modelado más común)
// -----------------------------------------------------------------------------
describe("bpmnFlowWarnings", () => {
  const bpmn = (): DiagramModel =>
    emptyDiagram({ nombre_proyecto: "P", notation: "bpmn" });

  const cont = (m: DiagramModel, nombre: string, tipo_elemento: string) =>
    addContainer(m, { nombre, tipo_elemento }).model;
  const nodo = (m: DiagramModel, id: string, nombre: string, container: string) =>
    addNode(m, { id, nombre, tipo_elemento: "Tarea", container }).model;

  const conDosPools = () => {
    let m = bpmn();
    m = cont(m, "Cliente", "Pool");
    m = cont(m, "Aseguradora", "Pool");
    m = nodo(m, "t1", "Enviar solicitud", "Cliente");
    m = nodo(m, "t2", "Evaluar solicitud", "Aseguradora");
    return m;
  };

  it("avisa si dos pools se conectan con flujo de secuencia", () => {
    const m = addEdge(conDosPools(), { fuente: "t1", destino: "t2" });
    const w = bpmnFlowWarnings(m).join(" | ");
    expect(w).toMatch(/mensaje/i);
    expect(w).toContain("Enviar solicitud");
  });

  it("acepta el flujo de mensaje (dashed) entre pools", () => {
    const m = addEdge(conDosPools(), { fuente: "t1", destino: "t2", dashed: true });
    expect(bpmnFlowWarnings(m)).toEqual([]);
  });

  it("avisa si dentro del mismo pool se usa flujo de mensaje", () => {
    let m = bpmn();
    m = cont(m, "Hospital", "Pool");
    m = nodo(m, "a", "Admitir", "Hospital");
    m = nodo(m, "b", "Triar", "Hospital");
    m = addEdge(m, { fuente: "a", destino: "b", dashed: true });
    expect(bpmnFlowWarnings(m).join(" ")).toMatch(/secuencia/i);
  });

  it("entre CARRILES el flujo de secuencia es correcto (no avisa)", () => {
    let m = bpmn();
    m = cont(m, "Hospital", "Pool");
    m = cont(m, "Recepción", "Carril");
    m = cont(m, "Enfermería", "Carril");
    m = nodo(m, "a", "Admitir", "Recepción");
    m = nodo(m, "b", "Triar", "Enfermería");
    m = addEdge(m, { fuente: "a", destino: "b" });
    expect(bpmnFlowWarnings(m)).toEqual([]);
  });

  it("avisa de un carril sin ningún pool en el diagrama", () => {
    let m = bpmn();
    m = cont(m, "Recepción", "Carril");
    expect(bpmnFlowWarnings(m).join(" ")).toMatch(/Pool/);
  });

  it("no aplica estas reglas fuera de BPMN (dashed es válido en UML)", () => {
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "uml" });
    m = cont(m, "Dominio", "Paquete");
    m = addNode(m, { id: "a", nombre: "Pedido", tipo_elemento: "Clase", container: "Dominio" }).model;
    m = addNode(m, { id: "b", nombre: "Repo", tipo_elemento: "Clase", container: "Dominio" }).model;
    m = addEdge(m, { fuente: "a", destino: "b", dashed: true });
    expect(bpmnFlowWarnings(m)).toEqual([]);
  });

  it("validate las incluye en warnings (no rompe la importación)", () => {
    const m = addEdge(conDosPools(), { fuente: "t1", destino: "t2" });
    const res = validate(m);
    expect(res.ok).toBe(true);
    expect(res.warnings.join(" ")).toMatch(/mensaje/i);
  });
});

// -----------------------------------------------------------------------------
// Geometría legible (specs/001-layout-legible). El modelo puede ser correcto y
// aun así llegar ilegible al lienzo: estas pruebas fijan las invariantes de
// layout que hacían falta (bandas de 5520 px, eventos de fin en mitad del
// carril, mensajes entre pools estirando el diagrama).
// -----------------------------------------------------------------------------
describe("layout · legibilidad", () => {
  const t = (notation: string, role: any) => typesWithRole(notation, role)[0];

  /** Proceso BPMN con dos pools y N tareas encadenadas en cada uno. */
  const dosPools = (nA: number, nB: number, mensaje = true): DiagramModel => {
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "bpmn" });
    m = addContainer(m, { nombre: "A", tipo_elemento: t("bpmn", "pool") }).model;
    m = addContainer(m, { nombre: "B", tipo_elemento: t("bpmn", "pool") }).model;
    const cadena = (pool: string, n: number) => {
      m = addNode(m, { id: `${pool}-ini`, nombre: "Inicio", tipo_elemento: t("bpmn", "start"), container: pool }).model;
      let prev = `${pool}-ini`;
      for (let i = 0; i < n; i++) {
        const id = `${pool}-t${i}`;
        m = addNode(m, { id, nombre: `Paso ${i}`, tipo_elemento: t("bpmn", "task"), container: pool }).model;
        m = addEdge(m, { fuente: prev, destino: id, descripcion: "sigue" });
        prev = id;
      }
      m = addNode(m, { id: `${pool}-fin`, nombre: "Fin", tipo_elemento: t("bpmn", "end"), container: pool }).model;
      m = addEdge(m, { fuente: prev, destino: `${pool}-fin`, descripcion: "cierra" });
    };
    cadena("A", nA);
    cadena("B", nB);
    // Flujo de MENSAJE entre participantes (BPMN): no es secuencia.
    if (mensaje) m = addEdge(m, { fuente: "A-t0", destino: "B-t0", descripcion: "avisa", dashed: true });
    return m;
  };

  const nodosDe = (m: DiagramModel, pool: string) =>
    layout(m).nodes.filter((n) => n.container === pool);

  it("un mensaje entre pools NO desplaza las columnas del pool vecino", () => {
    const conMensaje = layout(dosPools(3, 3, true));
    const sinMensaje = layout(dosPools(3, 3, false));
    const xs = (m: DiagramModel, pool: string) =>
      m.nodes.filter((n) => n.container === pool).map((n) => n.x);
    expect(xs(conMensaje, "B")).toEqual(xs(sinMensaje, "B"));
    expect(xs(conMensaje, "A")).toEqual(xs(sinMensaje, "A"));
  });

  it("cada pool arranca en su propia primera columna", () => {
    const m = dosPools(2, 5);
    const xA = Math.min(...nodosDe(m, "A").map((n) => n.x!));
    const xB = Math.min(...nodosDe(m, "B").map((n) => n.x!));
    expect(xA).toBe(xB);
  });

  it("las bandas comparten ancho (el de la más ancha), sin arrastrar el rango global", () => {
    const out = layout(dosPools(2, 8));
    const bandaA = out.nodes.find((n) => n.nombre === "A")!;
    const bandaB = out.nodes.find((n) => n.nombre === "B")!;
    // Uniformes entre sí: escalonadas se leen peor que alineadas.
    expect(bandaA.width).toBe(bandaB.width);
    // Y el ancho lo fija la banda MÁS LARGA de este diagrama, no la suma de los
    // rangos de todas (que era el bug: 5520 px con 34 columnas encadenadas).
    const dentroB = out.nodes.filter((n) => n.container === "B");
    const usadoB = Math.max(...dentroB.map((n) => n.x! + (n.width ?? 160))) - bandaB.x!;
    expect(bandaB.width! - usadoB).toBeLessThanOrEqual(240);
  });

  it("el evento de inicio abre y el de fin cierra su propio pool", () => {
    const out = layout(dosPools(4, 4));
    for (const pool of ["A", "B"]) {
      const dentro = out.nodes.filter((n) => n.container === pool);
      const xs = dentro.map((n) => n.x!);
      expect(dentro.find((n) => n.id === `${pool}-ini`)!.x).toBe(Math.min(...xs));
      expect(dentro.find((n) => n.id === `${pool}-fin`)!.x).toBe(Math.max(...xs));
    }
  });

  it("una notación SIN flujo (C4) se ordena por rol, no por longest-path", () => {
    let m = emptyDiagram({ nombre_proyecto: "Paisaje", notation: "c4" });
    m = addContainer(m, { nombre: "Bupa", tipo_elemento: typesWithRole("c4", "boundary")[0] }).model;
    const add = (id: string, role: any, container?: string) =>
      (m = addNode(m, {
        id,
        nombre: id,
        tipo_elemento: typesWithRole("c4", role)[0],
        container,
      }).model);
    add("persona-1", "actor");
    add("persona-2", "actor");
    add("sistema-1", "system", "Bupa");
    add("sistema-2", "system", "Bupa");
    add("sistema-3", "system", "Bupa");
    add("externo-1", "external");
    add("externo-2", "external");
    m = addEdge(m, { fuente: "persona-1", destino: "sistema-1", descripcion: "usa [web]" });
    m = addEdge(m, { fuente: "sistema-1", destino: "externo-1", descripcion: "cobra [API]" });

    const out = layout(m);
    const y = (id: string) => out.nodes.find((n) => n.id === id)!.y!;
    // Actores arriba, sistemas propios después, externos abajo.
    expect(y("persona-1")).toBe(y("persona-2"));
    expect(y("persona-1")).toBeLessThan(y("sistema-1"));
    expect(y("sistema-1")).toBeLessThan(y("externo-1"));
    expect(y("externo-1")).toBe(y("externo-2"));
    // Y sin filas de un solo elemento cuando el rol tiene varios.
    const libres = out.nodes.filter((n) => !["Bupa"].includes(n.nombre));
    const filas = new Map<number, number>();
    for (const n of libres) filas.set(n.y!, (filas.get(n.y!) ?? 0) + 1);
    expect([...filas.values()].filter((c) => c === 1).length).toBe(0);
  });

  it("las aristas entre contenedores distintos salen con ruteo ortogonal", () => {
    const g = toGraphData(dosPools(2, 2));
    const mensaje = g.politicas_inter_agregados!.find((a) => a.fuente === "A-t0")!;
    expect(mensaje.routing).toBe("orthogonal");
    // Las internas conservan su ruteo por defecto (no se fuerza).
    const interna = g.agregados.find((a) => a.nombre_agregado === "A")!.aristas[0];
    expect(interna.routing).toBeUndefined();
  });

  it("relayout rehace la geometría vieja de un diagrama ya posicionado", () => {
    // Un modelo guardado antes de mejorar el layout: todo posicionado a mano.
    const viejo = layout(dosPools(2, 8));
    const pisado: DiagramModel = {
      ...viejo,
      nodes: viejo.nodes.map((n) => ({ ...n, x: 9999, y: 9999, width: 999 })),
    };
    // layout() lo respeta (por eso re-exportar no arreglaba nada)…
    expect(layout(pisado).nodes.every((n) => n.x === 9999)).toBe(true);
    // …y relayout() lo recalcula.
    const nuevo = relayout(pisado);
    expect(nuevo.nodes.every((n) => n.x !== 9999)).toBe(true);
    const bandaB = nuevo.nodes.find((n) => n.nombre === "B")!;
    expect(bandaB.width).not.toBe(999);
    // Sin tocar la semántica.
    const ids = (m: DiagramModel) => m.nodes.map((n) => n.id).sort();
    expect(ids(nuevo)).toEqual(ids(pisado));
    expect(nuevo.edges).toEqual(pisado.edges);
  });

  it("el layout no altera la semántica del modelo (sólo geometría)", () => {
    const antes = dosPools(3, 3);
    const despues = layout(antes);
    const desnudo = (m: DiagramModel) =>
      m.nodes
        .map(({ x, y, width, height, ...n }) => n)
        .sort((a, b) => a.id.localeCompare(b.id));
    expect(desnudo(despues)).toEqual(desnudo(antes));
    expect(despues.edges).toEqual(antes.edges);
    // `meta.layout` SÍ cambia: es el registro de con qué disposición se dibujó
    // (spec 002, FR-005). Lo demás del meta —proyecto, notación, versión— no.
    const { layout: _, ...metaDespues } = despues.meta;
    expect(metaDespues).toEqual(antes.meta);
  });
});

// -----------------------------------------------------------------------------
// Presets de layout (specs/002): la densidad y la estrategia son elegibles, y lo
// que elige el botón del lienzo es lo mismo que elige el agente por MCP.
// -----------------------------------------------------------------------------
describe("layout · presets", () => {
  const t = (notation: string, role: any) => typesWithRole(notation, role)[0];

  /** C4 chico: 2 personas, 3 sistemas dentro del límite, 2 externos. */
  const paisaje = (): DiagramModel => {
    let m = emptyDiagram({ nombre_proyecto: "Paisaje", notation: "c4" });
    m = addContainer(m, { nombre: "Bupa", tipo_elemento: t("c4", "boundary") }).model;
    const add = (id: string, role: any, container?: string) =>
      (m = addNode(m, { id, nombre: id, tipo_elemento: t("c4", role), container }).model);
    add("persona-1", "actor");
    add("persona-2", "actor");
    add("sistema-1", "system", "Bupa");
    add("sistema-2", "system", "Bupa");
    add("sistema-3", "system", "Bupa");
    add("externo-1", "external");
    add("externo-2", "external");
    m = addEdge(m, { fuente: "persona-1", destino: "sistema-1", descripcion: "usa [web]" });
    return addEdge(m, { fuente: "sistema-1", destino: "externo-1", descripcion: "cobra [API]" });
  };

  const anchoDe = (m: DiagramModel) =>
    Math.max(...m.nodes.map((n) => (n.x ?? 0) + (n.width ?? 160)));

  it("la densidad se nota: expandido ocupa bastante más que compacto", () => {
    const compacto = anchoDe(relayout(paisaje(), { density: "compacto" }));
    const comodo = anchoDe(relayout(paisaje(), { density: "comodo" }));
    const expandido = anchoDe(relayout(paisaje(), { density: "expandido" }));
    expect(comodo).toBeGreaterThan(compacto);
    expect(expandido).toBeGreaterThan(comodo);
    expect(expandido / compacto).toBeGreaterThanOrEqual(1.6);
  });

  it("el default de generación es cómodo, no la densidad mínima", () => {
    const porDefecto = anchoDe(layout(paisaje()));
    const compacto = anchoDe(relayout(paisaje(), { density: "compacto" }));
    expect(porDefecto).toBeGreaterThan(compacto);
    expect(porDefecto).toBe(anchoDe(relayout(paisaje(), { density: DEFAULT_DENSITY })));
  });

  it("se puede forzar una estrategia que no es la natural de la notación", () => {
    const capas = relayout(paisaje(), { strategy: "capas" });
    const flujo = relayout(paisaje(), { strategy: "flujo" });
    // Por capas, los dos actores comparten fila; por flujo se ordenan por relación.
    const y = (m: DiagramModel, id: string) => m.nodes.find((n) => n.id === id)!.y!;
    expect(y(capas, "persona-1")).toBe(y(capas, "persona-2"));
    expect(y(flujo, "persona-1")).not.toBe(y(capas, "sistema-1"));
    expect(capas.meta.layout).toEqual({ density: DEFAULT_DENSITY, strategy: "capas" });
    expect(flujo.meta.layout?.strategy).toBe("flujo");
  });

  it("el modelo recuerda con qué se dibujó (para marcar el actual en el menú)", () => {
    const m = relayout(paisaje(), { density: "expandido", strategy: "capas" });
    expect(m.meta.layout).toEqual({ density: "expandido", strategy: "capas" });
  });

  it("reordena las bandas con la propuesta y sobrevive a una respuesta rara", () => {
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "c4" });
    for (const nombre of ["Alfa", "Beta", "Gamma"]) {
      m = addContainer(m, { nombre, tipo_elemento: t("c4", "boundary") }).model;
      m = addNode(m, { id: `n-${nombre}`, nombre, tipo_elemento: t("c4", "system"), container: nombre }).model;
    }
    const yDe = (out: DiagramModel, nombre: string) => out.nodes.find((n) => n.nombre === nombre && isContainerType(n.tipo_elemento))!.y!;

    const ordenado = reorderLanes(m, ["Gamma", "Alfa", "Beta"]);
    expect(yDe(ordenado, "Gamma")).toBeLessThan(yDe(ordenado, "Alfa"));
    expect(yDe(ordenado, "Alfa")).toBeLessThan(yDe(ordenado, "Beta"));

    // Nombres inventados y omisiones: nada se pierde ni se duplica.
    const raro = reorderLanes(m, ["Inventado", "Beta", "Beta"]);
    const bandas = raro.nodes.filter((n) => isContainerType(n.tipo_elemento)).map((n) => n.nombre);
    expect(bandas).toEqual(["Beta", "Alfa", "Gamma"]);
    expect(raro.nodes).toHaveLength(m.nodes.length);
  });

  it("cambiar de preset no toca la semántica", () => {
    const base = paisaje();
    const desnudo = (m: DiagramModel) =>
      m.nodes.map(({ x, y, width, height, ...n }) => n).sort((a, b) => a.id.localeCompare(b.id));
    for (const density of ["compacto", "comodo", "expandido"] as const) {
      const out = relayout(base, { density });
      expect(desnudo(out)).toEqual(desnudo(base));
      expect(out.edges).toEqual(base.edges);
    }
  });
});

// -----------------------------------------------------------------------------
// Trazabilidad: cada elemento debe poder defenderse contra la fuente. Es lo que
// baja la carga cognitiva del humano que revisa (lee "elemento ← cita").
// -----------------------------------------------------------------------------
describe("trazabilidad (source)", () => {
  it("lleva la cita de la fuente a la descripción del nodo serializado", () => {
    let m = emptyDiagram(base);
    m = addNode(m, {
      nombre: "Pagar Pedido",
      tipo_elemento: "Comando",
      descripcion: "El cliente paga.",
      source: "PRD §3.2 (p. 7)",
    }).model;
    m = addNode(m, { nombre: "Pago Confirmado", tipo_elemento: "Evento" }).model;
    m = addEdge(m, { fuente: "pagar-pedido", destino: "pago-confirmado" });

    const g = toGraphData(m);
    const nodo = g.big_picture.nodos.find((n) => n.id === "pagar-pedido")!;
    expect(nodo.descripcion).toContain("El cliente paga.");
    expect(nodo.descripcion).toContain("Fuente: PRD §3.2 (p. 7)");
  });

  it("avisa de los nodos sin fuente cuando el diagrama YA usa fuentes", () => {
    let m = emptyDiagram(base);
    m = addNode(m, { nombre: "Con Fuente", tipo_elemento: "Comando", source: "Acta §1" }).model;
    m = addNode(m, { nombre: "Sin Fuente", tipo_elemento: "Evento" }).model;
    m = addEdge(m, { fuente: "con-fuente", destino: "sin-fuente" });
    expect(traceabilityWarnings(m).join(" ")).toContain("Sin Fuente");
  });

  it("no avisa si NINGÚN nodo declara fuente (el diagrama no se está trazando)", () => {
    let m = emptyDiagram(base);
    m = addNode(m, { nombre: "A", tipo_elemento: "Comando" }).model;
    m = addNode(m, { nombre: "B", tipo_elemento: "Evento" }).model;
    m = addEdge(m, { fuente: "a", destino: "b" });
    expect(traceabilityWarnings(m)).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// Ambigüedades: las decisiones de diseño que el documento no cierra quedan en el
// modelo (no diluidas en la conversación) y llegan al humano en las notas.
// -----------------------------------------------------------------------------
describe("ambigüedades", () => {
  it("registra, resuelve y lista las pendientes", () => {
    let m = emptyDiagram(base);
    const r = recordAmbiguity(m, {
      pregunta: "¿Quién aprueba el pago?",
      opciones: ["Tesorería", "Gerencia"],
      afecta: "Quién ejecuta la tarea de aprobación",
    });
    m = r.model;
    expect(pendingAmbiguities(m)).toHaveLength(1);

    m = resolveAmbiguity(m, r.id, "Tesorería (confirmado por el usuario)");
    expect(pendingAmbiguities(m)).toEqual([]);
    expect(m.ambiguities![0].resolucion).toContain("Tesorería");
    expect(() => resolveAmbiguity(m, "no-existe", "x")).toThrow();
  });

  it("las ambigüedades (pendientes y resueltas) viajan a las notas del GraphData", () => {
    let m = emptyDiagram(base);
    m = addNode(m, { nombre: "A", tipo_elemento: "Comando" }).model;
    m = addNode(m, { nombre: "B", tipo_elemento: "Evento" }).model;
    m = addEdge(m, { fuente: "a", destino: "b" });
    m = recordAmbiguity(m, { pregunta: "¿Quién aprueba?" }).model;
    const segunda = recordAmbiguity(m, { pregunta: "¿Hay reintento?" });
    m = resolveAmbiguity(segunda.model, segunda.id, "No, el documento lo descarta");

    const g = toGraphData(m);
    expect(g.notas).toContain("¿Quién aprueba?");
    expect(g.notas).toContain("¿Hay reintento?");
    expect(g.notas).toContain("No, el documento lo descarta");
  });
});
