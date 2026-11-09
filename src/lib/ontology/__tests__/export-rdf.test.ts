import { describe, expect, it } from "vitest";
import { Parser, Store, type Quad } from "n3";
import { construirConocimiento } from "../conocimiento";
import { PREFIJOS, expandir, iriPredicado } from "../iri";
import { exportarConocimiento } from "../exportar";
import { CONTEXTO_JSONLD, aJsonLd } from "../jsonld";
import { consultar } from "../query";
import { ALINEACION_PUBLICA, tripletasExport } from "../rdf";
import { aTurtle } from "../turtle";
import { PROYECTO_PEDIDOS, VINCULOS_PEDIDOS, vistasPedidos } from "./fixtures/pedidos";

const proyecto = () =>
  construirConocimiento({ proyecto: PROYECTO_PEDIDOS, vistas: vistasPedidos(), vinculos: VINCULOS_PEDIDOS }, { tipo: "proyecto" });

/** Una tripleta como texto comparable: IRIs completas y literales en JSON. */
const deN3 = (q: Quad) =>
  [q.subject.value, q.predicate.value, q.object.termType === "Literal" ? JSON.stringify(q.object.value) : q.object.value].join(" ");

/**
 * Expansor JSON-LD mínimo (R-08): el export usa sólo nodos con `@id`, `@type`,
 * propiedades con `{"@id"}` o texto, y un grafo nombrado. Sin red, como la app.
 */
function deJsonLd(doc: { "@context": Record<string, string>; "@graph": Record<string, unknown>[] }) {
  const ctx = doc["@context"];
  const iri = (t: string) => {
    const i = t.indexOf(":");
    return i > 0 && ctx[t.slice(0, i)] ? ctx[t.slice(0, i)] + t.slice(i + 1) : t;
  };
  const RDF_TYPE = PREFIJOS.rdf + "type";
  const out = { defecto: new Set<string>(), nombrados: new Map<string, Set<string>>() };
  const leer = (nodos: Record<string, unknown>[], destino: Set<string>) => {
    for (const n of nodos) {
      if (n["@graph"]) {
        const g = new Set<string>();
        out.nombrados.set(iri(n["@id"] as string), g);
        leer(n["@graph"] as Record<string, unknown>[], g);
        continue;
      }
      const s = iri(n["@id"] as string);
      for (const [k, v] of Object.entries(n)) {
        if (k === "@id") continue;
        if (k === "@type") for (const t of v as string[]) destino.add(`${s} ${RDF_TYPE} ${iri(t)}`);
        else
          for (const x of v as ({ "@id": string } | string)[])
            destino.add(`${s} ${iri(k)} ${typeof x === "string" ? JSON.stringify(x) : iri(x["@id"])}`);
      }
    }
  };
  leer(doc["@graph"], out.defecto);
  return out;
}

// T31 · FR-040, FR-041, FR-042, US7-AC1…AC3, SC-006 (Q10).
describe("export RDF validado con un parser independiente (n3)", () => {
  it("Q10: el Turtle parsea sin errores y trae tantas tripletas como afirma el proyecto", () => {
    const k = proyecto();
    const x = tripletasExport(k, { deducidos: false });
    const quads = new Parser({ format: "Turtle" }).parse(aTurtle(k));
    expect(quads).toHaveLength(x.afirmadas.length);
    expect(new Set(quads.map(deN3)).size).toBe(x.afirmadas.length);
  });

  it("Q10: con deducidos, explícitos + deducidos; en Turtle, en un bloque declarado", () => {
    const k = proyecto();
    const x = tripletasExport(k, { deducidos: true });
    const ttl = aTurtle(k, { deducidos: true });
    expect(x.deducidas.length).toBeGreaterThan(0);
    expect(new Parser({ format: "Turtle" }).parse(ttl)).toHaveLength(x.afirmadas.length + x.deducidas.length);
    const [antes, despues] = ttl.split("# ── Deducidos por el razonador");
    expect(despues).toBeDefined();
    // Una deducción típica sólo aparece después del encabezado.
    const provoca = `<${expandir(iriPredicado("provoca"))}>`;
    expect(antes).not.toContain(provoca + " <");
    expect(despues).toContain(provoca);
  });

  it("una consulta por patrón con n3 devuelve lo mismo que consultar en la app", () => {
    const k = proyecto();
    const store = new Store(new Parser({ format: "Turtle" }).parse(aTurtle(k, { deducidos: true })));
    const dispara = expandir(iriPredicado("dispara"));
    const n3 = store.getQuads(null, dispara, null, null).map((q) => `${q.subject.value} ${q.object.value}`).sort();
    const app = consultar(k, { patrones: [["?s", iriPredicado("dispara"), "?o"]] }).map((f) => `${expandir(f.s)} ${expandir(f.o)}`).sort();
    expect(n3).toEqual(app);
    expect(app.length).toBeGreaterThan(0);
  });

  it("JSON-LD: las mismas tripletas que el Turtle; lo deducido en un grafo nombrado (US7-AC2)", () => {
    const k = proyecto();
    const doc = JSON.parse(aJsonLd(k, { deducidos: true }));
    expect(doc["@context"]).toEqual(CONTEXTO_JSONLD);
    const ld = deJsonLd(doc);
    const x = tripletasExport(k, { deducidos: true });
    const ttl = new Parser({ format: "Turtle" }).parse(aTurtle(k, { deducidos: true })).map(deN3);
    const nombrado = ld.nombrados.get(expandir(x.grafoDeducidos))!;
    expect(nombrado.size).toBe(x.deducidas.length);
    expect(new Set([...ld.defecto, ...nombrado])).toEqual(new Set(ttl));
    expect(ld.defecto.size).toBe(x.afirmadas.length);
  });

  it("sin la opción no hay deducidos en ningún formato", () => {
    const k = proyecto();
    expect(aTurtle(k)).not.toContain("Deducidos por el razonador");
    expect(JSON.parse(aJsonLd(k))["@graph"].some((n: Record<string, unknown>) => n["@graph"])).toBe(false);
  });

  it("identificadores estables, clases, relaciones y atributos (US7-AC1)", () => {
    const k = proyecto();
    const quads = new Parser({ format: "Turtle" }).parse(aTurtle(k)).map(deN3);
    const pagar = expandir("kb:pedidos/v-es/pagar");
    expect(quads).toContain(`${pagar} ${PREFIJOS.rdfs}label "Pagar"`);
    expect(quads).toContain(`${pagar} ${expandir(iriPredicado("dispara"))} ${expandir("kb:pedidos/v-es/pago-realizado")}`);
    expect(quads.some((q) => q.startsWith(`${pagar} ${PREFIJOS.rdf}type ${PREFIJOS.pf}ddd/`))).toBe(true);
    // El reglamento viaja: subPropertyOf y transitividad.
    expect(quads).toContain(`${expandir(iriPredicado("dispara"))} ${PREFIJOS.rdfs}subPropertyOf ${expandir(iriPredicado("provoca"))}`);
    expect(quads).toContain(`${expandir(iriPredicado("provoca"))} ${PREFIJOS.rdf}type ${PREFIJOS.owl}TransitiveProperty`);
    // Los vínculos aceptados son hechos afirmados.
    expect(quads).toContain(`${expandir("kb:pedidos/v-c4/pagos")} ${expandir(iriPredicado("realiza"))} ${expandir("kb:pedidos/v-es/agg-Pagos")}`);
  });

  it("alineación con schema.org sólo donde aplica (US7-AC3, FR-041)", () => {
    const quads = new Parser({ format: "Turtle" }).parse(aTurtle(proyecto())).map(deN3);
    const eq = `${PREFIJOS.owl}equivalentClass`;
    expect(quads).toContain(`${PREFIJOS.pf}rol/actor ${eq} ${PREFIJOS.schema}Person`);
    expect(quads).toContain(`${PREFIJOS.pf}rol/system ${eq} ${PREFIJOS.schema}SoftwareApplication`);
    expect(quads).toContain(`${PREFIJOS.pf}rol/datastore ${eq} ${PREFIJOS.schema}Dataset`);
    expect(quads.some((q) => q.startsWith(`${PREFIJOS.pf}rol/context ${eq}`))).toBe(false);
    expect(Object.keys(ALINEACION_PUBLICA)).not.toContain("context");
  });

  it("los documentos fuente se exportan como schema:DigitalDocument", () => {
    const vistas = vistasPedidos();
    vistas[0] = { ...vistas[0], graph: { ...vistas[0].graph!, source_docs: [{ nombre: "docs/pagos v2.md", texto: "x" }] } as never };
    const k = construirConocimiento({ proyecto: "p-docs", vistas }, { tipo: "proyecto" });
    const quads = new Parser({ format: "Turtle" }).parse(aTurtle(k)).map(deN3);
    expect(quads.some((q) => q.endsWith(`${PREFIJOS.rdf}type ${PREFIJOS.schema}DigitalDocument`))).toBe(true);
  });
});

describe("exportarConocimiento (T32)", () => {
  it("nombre, extensión y MIME por formato; el sufijo dice si trae deducidos", () => {
    const k = proyecto();
    expect(exportarConocimiento(k, "turtle", { deducidos: false, base: "Mi proyecto" })).toMatchObject({
      nombre: "Mi_proyecto.ttl",
      mime: "text/turtle;charset=utf-8",
    });
    const ld = exportarConocimiento(k, "jsonld", { deducidos: true });
    expect(ld.nombre).toBe("conocimiento-con-deducidos.jsonld");
    expect(ld.contenido).toBe(aJsonLd(k, { deducidos: true }));
  });
});
