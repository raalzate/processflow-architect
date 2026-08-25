import { describe, it, expect } from "vitest";
import { processGraphData } from "@/lib/graph-processor";
import { looseGroupLabel } from "@/lib/notations";
import { toGraphData, emptyDiagram, addContainer, addNode, addEdge } from "@/lib/mcp/diagram-builder";
import { graphDataToCanvas } from "@/components/graph/designer/serialize";
import type { GraphData } from "@/lib/types";

/**
 * Issue #142 — el panel lateral leía `big_picture.nodos` como FALLBACK de
 * emergencia y el lienzo como lo que son: los nodos SIN CONTENEDOR. Con
 * cualquier banda poblada (siempre, en un C4) los sueltos desaparecían del panel
 * aunque el lienzo los dibujara. Dos lectores del mismo `GraphData` con reglas
 * distintas: acá se fija el contrato entre los dos.
 */

const n = (id: string, tipo = "Comando") => ({
  id,
  nombre: id,
  tipo_elemento: tipo,
  estado_comparativo: "nuevo" as const,
});

/** Un C4 con banda poblada Y actores sueltos: el caso que la suite no podía construir. */
function conBandasYSueltos(): GraphData {
  return {
    nombre_proyecto: "Enrollment",
    version: "1",
    fecha_analisis: "2026-08-25",
    notation: "c4",
    big_picture: {
      descripcion: "Contexto",
      hotspots: [],
      nodos: [n("prospecto", "Persona"), n("agente", "Persona")],
      aristas: [
        { fuente: "prospecto", destino: "bff", descripcion: "usa" },
        { fuente: "agente", destino: "bff", descripcion: "usa" },
      ],
    },
    agregados: [
      {
        nombre_agregado: "Canal digital",
        entidad_raiz: "",
        descripcion: "",
        nodos: [n("bff", "Contenedor"), n("portal", "Contenedor")],
        aristas: [{ fuente: "portal", destino: "bff", descripcion: "llama" }],
      },
    ],
    read_models: [],
    politicas_inter_agregados: [],
    responsables: [],
    notas: "",
    transcript: "",
  } as unknown as GraphData;
}

describe("processGraphData · nodos sin contenedor (#142)", () => {
  it("con bandas pobladas Y big_picture.nodos, no pierde ninguno", () => {
    const out = processGraphData(conBandasYSueltos());
    expect(out.nodes.map((x) => x.id).sort()).toEqual(["agente", "bff", "portal", "prospecto"]);
  });

  it("los sueltos van a un grupo propio, con el rótulo del registro de notaciones", () => {
    const out = processGraphData(conBandasYSueltos());
    const grupo = out.aggregates.find((a) => a.startsWith(looseGroupLabel("c4")));
    expect(grupo, `grupos: ${out.aggregates.join(" · ")}`).toBeTruthy();
    expect(Object.keys(out.nodeTree[grupo!].tipos)).toEqual(["Persona"]);
  });

  it("las aristas del big_picture también llegan (antes se perdían con bandas pobladas)", () => {
    const out = processGraphData(conBandasYSueltos());
    expect(out.links.some((l) => l.fuente === "prospecto" && l.destino === "bff")).toBe(true);
  });

  it("conservación: entran tantos nodos como salen + los descartados", () => {
    const data = conBandasYSueltos();
    // Un nodo sin ninguna relación: se descarta, pero DEJA RASTRO.
    (data.agregados[0].nodos as any[]).push(n("huerfano", "Contenedor"));
    const out = processGraphData(data);
    const entrada =
      (data.big_picture.nodos?.length ?? 0) +
      data.agregados.reduce((t, a) => t + (a.nodos?.length ?? 0), 0);
    expect(out.nodes.length + out.descartados.length).toBe(entrada);
    expect(out.descartados.map((d) => d.id)).toEqual(["huerfano"]);
  });

  it("contrato con el lienzo: los dos lectores ven los mismos elementos", () => {
    // El mismo GraphData que produce el MCP, leído por el panel y por el lienzo.
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "c4" });
    m = addContainer(m, { nombre: "Canal", tipo_elemento: "Límite de Sistema" }).model;
    m = addNode(m, { nombre: "BFF", tipo_elemento: "Contenedor", container: "Canal", id: "bff" }).model;
    m = addNode(m, { nombre: "Prospecto", tipo_elemento: "Persona", id: "prospecto" }).model;
    m = addEdge(m, { fuente: "prospecto", destino: "bff" });
    const graph = toGraphData(m);

    const panel = processGraphData(graph).nodes.map((x) => x.id).sort();
    const lienzo = [...graphDataToCanvas(graph).nodes.values()]
      .filter((x) => x.tipo_elemento !== "Límite de Sistema")
      .map((x) => x.id)
      .sort();
    expect(panel).toEqual(lienzo);
  });
});
