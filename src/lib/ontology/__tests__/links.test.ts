import { describe, expect, it } from "vitest";
import { addNode, emptyDiagram, toGraphData } from "@/lib/mcp/diagram-builder";
import { typesWithRole, type ElementRole, type NotationId } from "@/lib/notations";
import { BOARD_FORMAT, parseBoardFile, sanitizeViews } from "@/lib/board-file";
import type { DesignView, VinculoVistas } from "@/lib/views-types";
import { preguntaCompetencia } from "../competency";
import { construirConocimiento } from "../conocimiento";
import { iriElemento, iriPredicado } from "../iri";
import { idVinculo, sugerirVinculos, validarVinculo } from "../links";
import { PROYECTO_PEDIDOS, VINCULOS_PEDIDOS, vistasPedidos } from "./fixtures/pedidos";

const iri = (vista: string, nodo: string) => iriElemento(PROYECTO_PEDIDOS, vista, nodo);
const proyecto = (vinculos?: VinculoVistas[], vistas = vistasPedidos()) =>
  construirConocimiento({ proyecto: PROYECTO_PEDIDOS, vistas, vinculos }, { tipo: "proyecto" });
const tipo = (n: NotationId, r: ElementRole) => typesWithRole(n, r)[0];

// T29 · FR-037, FR-038, FR-039, US6-AC1…AC4.
describe("sugerir vínculos entre vistas", () => {
  it("mismo nombre en vistas distintas: Cliente ≡ Cliente, Contexto ≡ Pool, y el Sistema REALIZA la zona (Q8)", () => {
    const s = sugerirVinculos(proyecto());
    const resumen = s.map((v) => `${v.tipo} ${v.a.vista}/${v.a.nodo} ${v.b.vista}/${v.b.nodo}`).sort();
    expect(resumen).toEqual(
      [
        "es_mismo_que v-es/cliente v-c4/cliente",
        "es_mismo_que v-es/agg-Pagos v-bpmn/agg-Pagos",
        "realiza v-c4/pagos v-es/agg-Pagos",
        "realiza v-c4/pagos v-bpmn/agg-Pagos",
      ].sort()
    );
    expect(s.every((v) => v.razon.length > 0)).toBe(true);
  });

  it("nada se vincula solo: sugerir no cambia el conocimiento (US6-AC1)", () => {
    const k = proyecto();
    sugerirVinculos(k);
    expect(k.store.match(undefined, iriPredicado("es_mismo_que"))).toEqual([]);
  });

  it("lo ya decidido —aceptado o rechazado— no vuelve a sugerirse", () => {
    const rechazado: VinculoVistas = {
      id: "x",
      tipo: "es_mismo_que",
      a: { vista: "v-c4", nodo: "cliente" },
      b: { vista: "v-es", nodo: "cliente" },
      estado: "rechazado",
    };
    const s = sugerirVinculos(proyecto(), [rechazado, ...VINCULOS_PEDIDOS]);
    expect(s.map((v) => v.id)).toEqual([idVinculo("realiza", { vista: "v-c4", nodo: "pagos" }, { vista: "v-bpmn", nodo: "agg-Pagos" })]);
  });

  it("dos cosas disjuntas que se llaman igual (un Evento y un Actor) no se sugieren", () => {
    let a = emptyDiagram({ nombre_proyecto: "P", notation: "ddd" });
    a = addNode(a, { id: "e", nombre: "Cliente", tipo_elemento: tipo("ddd", "event") }).model;
    let b = emptyDiagram({ nombre_proyecto: "P", notation: "c4" });
    b = addNode(b, { id: "p", nombre: "Cliente", tipo_elemento: tipo("c4", "actor") }).model;
    const vistas: DesignView[] = [
      { id: "va", name: "A", kind: "graph", notation: "ddd", graph: toGraphData(a), createdAt: "" },
      { id: "vb", name: "B", kind: "graph", notation: "c4", graph: toGraphData(b), createdAt: "" },
    ];
    expect(sugerirVinculos(proyecto(undefined, vistas))).toEqual([]);
  });

  it("el id de «es el mismo que» no depende del orden; el de «realiza» sí", () => {
    const x = { vista: "a", nodo: "1" };
    const y = { vista: "b", nodo: "2" };
    expect(idVinculo("es_mismo_que", x, y)).toBe(idVinculo("es_mismo_que", y, x));
    expect(idVinculo("realiza", x, y)).not.toBe(idVinculo("realiza", y, x));
  });
});

describe("validar un vínculo", () => {
  it("Q9: un Evento «es el mismo que» un Actor se rechaza con la regla incumplida (US6-AC4)", () => {
    const h = validarVinculo(proyecto(), { tipo: "es_mismo_que", a: { vista: "v-es", nodo: "pago-realizado" }, b: { vista: "v-c4", nodo: "cliente" } });
    expect(h).toMatchObject({ forma: "EQUIVALENCIA-DISJUNTA", severidad: "error" });
    expect(h!.mensaje).toMatch(/clases disjuntas/);
  });

  it("Sistema ≡ Contexto se rechaza y sugiere «realiza»; como «realiza» es válido", () => {
    const k = proyecto();
    const v = { a: { vista: "v-c4", nodo: "pagos" }, b: { vista: "v-es", nodo: "agg-Pagos" } };
    expect(validarVinculo(k, { tipo: "es_mismo_que", ...v })!.sugerencia).toMatch(/realiza/);
    expect(validarVinculo(k, { tipo: "realiza", ...v })).toBeNull();
  });

  it("extremos inexistentes o en la misma vista", () => {
    const k = proyecto();
    expect(validarVinculo(k, { tipo: "realiza", a: { vista: "v-c4", nodo: "nada" }, b: { vista: "v-es", nodo: "pagar" } })?.forma).toBe("VINCULO-ROTO");
    expect(validarVinculo(k, { tipo: "realiza", a: { vista: "v-es", nodo: "pagar" }, b: { vista: "v-es", nodo: "cancelar" } })?.forma).toBe(
      "VINCULO-MISMA-VISTA"
    );
  });
});

describe("los vínculos aceptados entran al razonamiento", () => {
  it("«es el mismo que» propaga los hechos de uno al otro (US6-AC2)", () => {
    const k = proyecto(VINCULOS_PEDIDOS);
    // El Contexto Pagos (ES) recibe lo que el Pool Pagos (BPMN) contiene, por equivalencia.
    expect(k.store.has([iri("v-bpmn", "cobrar"), iriPredicado("pertenece_a"), iri("v-es", "agg-Pagos")])).toBe(true);
    expect(k.hallazgos.some((h) => h.forma === "EQUIVALENCIA-DISJUNTA")).toBe(false);
  });

  it("Q8: PC-07 sobre Pasarela llega al Contexto y al Pool Pagos a través de «realiza» y ≡", () => {
    const filas = preguntaCompetencia("PC-07")!.ejecutar(proyecto(VINCULOS_PEDIDOS), { sistema: "Pasarela" }).filas;
    expect(filas.map((f) => f.elemento).sort()).toEqual(
      [iri("v-c4", "pagos"), iri("v-c4", "cliente"), iri("v-es", "agg-Pagos"), iri("v-bpmn", "agg-Pagos")].sort()
    );
    expect(filas.find((f) => f.elemento === iri("v-es", "agg-Pagos"))?.via).toBe(iri("v-c4", "pagos"));
  });

  it("renombrar una caja no rompe el vínculo: la identidad es el id (US6-AC3)", () => {
    const vistas = vistasPedidos();
    const c4 = vistas[2].graph!;
    const renombrar = (o: unknown): unknown =>
      Array.isArray(o) ? o.map(renombrar) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === "nombre" && v === "Pagos" ? "Cobros" : renombrar(v)])) : o;
    vistas[2] = { ...vistas[2], graph: renombrar(c4) as typeof c4 };
    const k = proyecto(VINCULOS_PEDIDOS, vistas);
    expect(k.store.has([iri("v-c4", "pagos"), iriPredicado("realiza"), iri("v-es", "agg-Pagos")])).toBe(true);
  });

  it("un vínculo rechazado o roto no entra; alcance vista no lo ve", () => {
    const rechazado = VINCULOS_PEDIDOS.map((v) => ({ ...v, estado: "rechazado" as const }));
    expect(proyecto(rechazado).store.match(undefined, iriPredicado("realiza"))).toEqual([]);
    const roto: VinculoVistas[] = [{ ...VINCULOS_PEDIDOS[1], a: { vista: "v-c4", nodo: "borrado" } }];
    expect(proyecto(roto).store.match(undefined, iriPredicado("realiza"))).toEqual([]);
    const vista = construirConocimiento({ proyecto: PROYECTO_PEDIDOS, vistas: vistasPedidos(), vinculos: VINCULOS_PEDIDOS }, { tipo: "vista", vista: "v-es" });
    expect(vista.store.match(undefined, iriPredicado("es_mismo_que"))).toEqual([]);
  });
});

describe("persistencia de los vínculos en el tablero", () => {
  it("un archivo sin vínculos se lee y se vuelve a guardar sin la clave", () => {
    const v = sanitizeViews({ customViews: [], activeViewId: "design", injectedViewIds: [] });
    expect("vinculos" in v).toBe(false);
  });

  it("guarda los bien formados y descarta lo demás", () => {
    const v = sanitizeViews({
      customViews: [],
      activeViewId: "design",
      vinculos: [
        VINCULOS_PEDIDOS[0],
        { ...VINCULOS_PEDIDOS[1], procedencia: { por: "ia", fuente: "x", raro: 1 } },
        { id: "malo", tipo: "parecido", a: { vista: "a", nodo: "b" }, b: { vista: "c", nodo: "d" }, estado: "aceptado" },
        { id: "sugerido", tipo: "realiza", a: { vista: "a", nodo: "b" }, b: { vista: "c", nodo: "d" }, estado: "sugerido" },
        { id: "sin-extremo", tipo: "realiza", a: { vista: "a" }, b: { vista: "c", nodo: "d" }, estado: "aceptado" },
        "basura",
      ],
    });
    expect(v.vinculos).toEqual([VINCULOS_PEDIDOS[0], { ...VINCULOS_PEDIDOS[1], procedencia: { por: "ia", fuente: "x" } }]);
  });

  it("parseBoardFile tolera un tablero viejo sin vínculos", () => {
    const g = vistasPedidos()[0].graph!;
    const r = parseBoardFile(JSON.stringify({ formato: BOARD_FORMAT, proyecto: g, vistas: { customViews: [], activeViewId: "design" } }));
    expect(r.vistas.vinculos).toBeUndefined();
  });
});
