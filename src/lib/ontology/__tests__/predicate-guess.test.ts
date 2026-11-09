import { describe, expect, it } from "vitest";
import { fromGraphData } from "@/lib/mcp/diagram-builder";
import { normalizarEtiqueta, predicadosCompatibles, sugerirPredicado, validarPredicado } from "../predicate-guess";
import { admite, predicadoDe, tboxDe } from "../tbox";
import { vistasPedidos } from "./fixtures/pedidos";

const n = (tipo: string) => ({ tipo_elemento: tipo });

// T9 · US2: la flecha recibe un significado propuesto de forma determinista.
describe("sugerirPredicado", () => {
  it("Q2 · «emite» de Comando a Evento es «dispara», con confianza alta", () => {
    const s = sugerirPredicado({ descripcion: "emite" }, n("Comando"), n("Evento"), "ddd");
    expect(s.id).toBe("dispara");
    expect(s.confianza).toBe("alta");
  });

  it("los sinónimos se desambiguan por dominio y rango", () => {
    // «emite» también es sinónimo de emite (Política → Comando).
    expect(sugerirPredicado({ descripcion: "Emite" }, n("Política"), n("Comando"), "ddd").id).toBe("emite");
    expect(sugerirPredicado({ descripcion: "reacciona a" }, n("Política"), n("Evento"), "ddd").id).toBe("reacciona_a");
  });

  it("tolera mayúsculas, acentos, conjugación y la tecnología entre corchetes", () => {
    expect(normalizarEtiqueta("Escribe en [SQL/JDBC]")).toEqual(["escrib", "en"]);
    expect(sugerirPredicado({ descripcion: "Escribe en [SQL]" }, n("Sistema"), n("Base de Datos"), "c4").id).toBe("escribe_en");
    expect(sugerirPredicado({ descripcion: "Emiten" }, n("Comando"), n("Evento"), "ddd").id).toBe("dispara");
    expect(sugerirPredicado({ descripcion: "Usa [HTTPS]" }, n("Persona"), n("Sistema"), "c4").id).toBe("usa");
  });

  it("Q3 · Actor «dispara» Evento queda fuera de los compatibles", () => {
    const compatibles = predicadosCompatibles("Actor", "Evento", "ddd").map((p) => p.id);
    expect(compatibles).not.toContain("dispara");
    expect(compatibles).toContain("relacionado_con");
    const h = validarPredicado("dispara", "Actor", "Evento", "ddd");
    expect(h?.forma).toBe("DOMINIO-RANGO");
    expect(h?.mensaje).toMatch(/dispara/);
    expect(h?.sugerencia).toMatch(/relacionado_con/);
    expect(validarPredicado("dispara", "Comando", "Evento", "ddd")).toBeNull();
    expect(validarPredicado("inventado", "Comando", "Evento", "ddd")?.forma).toBe("PREDICADO-DESCONOCIDO");
  });

  it("US2-AC3 · etiqueta ambigua ⇒ «relacionado_con», genérica (no se inventa uno específico)", () => {
    const s = sugerirPredicado({ descripcion: "tiene que ver con" }, n("Comando"), n("Evento"), "ddd");
    expect(s.id).toBe("relacionado_con");
    expect(s.confianza).toBe("generica");
    expect(s.compatibles).toContain("dispara");
  });

  it("sin etiqueta y un único predicado específico por roles ⇒ media", () => {
    const s = sugerirPredicado({}, n("Tarea"), n("Compuerta Exclusiva"), "bpmn");
    expect(s).toMatchObject({ id: "flujo_a", confianza: "media" });
    // Sin roles (dibujo libre) no hay nada que afirmar.
    expect(sugerirPredicado({}, n("Rectángulo"), n("Elipse"), "general").confianza).toBe("generica");
  });

  it("FR-005 · la relación UML/MER manda y se lee 1:1", () => {
    expect(sugerirPredicado({ relation: "herencia" }, n("Clase"), n("Clase Abstracta"), "uml")).toMatchObject({
      id: "hereda_de",
      confianza: "alta",
    });
    expect(sugerirPredicado({ relation: "cardinalidad_1_n" }, n("Entidad Fuerte"), n("Entidad Débil"), "mer").id).toBe(
      "uno_a_muchos"
    );
  });

  it("un predicado confirmado por el humano se respeta", () => {
    const s = sugerirPredicado({ descripcion: "emite", predicado: "relacionado_con" }, n("Comando"), n("Evento"), "ddd");
    expect(s).toMatchObject({ id: "relacionado_con", confianza: "confirmado" });
  });
});

describe("SC-005 · sobre el proyecto de referencia", () => {
  const ESPERADO: Record<string, string> = {
    "cliente>pagar": "invoca",
    "pagar>pago-realizado": "dispara",
    "facturar>pago-realizado": "reacciona_a",
    "facturar>facturar-pedido": "emite",
    "facturar-pedido>factura-emitida": "dispara",
    "inicio>cobrar": "flujo_a",
    "cobrar>aprobado": "flujo_a",
    "aprobado>confirmar": "flujo_a",
    "aprobado>rechazar": "flujo_a",
    "confirmar>fin": "flujo_a",
    "rechazar>fin": "flujo_a",
    "cliente>pagos": "usa",
    "pagos>pagos-db": "escribe_en",
    "pagos>pasarela": "usa",
  };

  it("coincide con lo que elegiría un humano y nunca viola dominio/rango", () => {
    let aciertos = 0;
    let total = 0;
    for (const v of vistasPedidos()) {
      const m = fromGraphData(v.graph!, v.notation);
      const t = tboxDe(v.notation);
      const tipo = new Map(m.nodes.map((x) => [x.id, x.tipo_elemento]));
      for (const e of m.edges) {
        const s = sugerirPredicado(e, n(tipo.get(e.fuente)!), n(tipo.get(e.destino)!), v.notation);
        const p = predicadoDe(t, s.id)!;
        expect(admite(t, p, tipo.get(e.fuente)!, "dominio")).toBe(true);
        expect(admite(t, p, tipo.get(e.destino)!, "rango")).toBe(true);
        total++;
        if (ESPERADO[`${e.fuente}>${e.destino}`] === s.id) aciertos++;
      }
    }
    expect(aciertos / total).toBeGreaterThanOrEqual(0.8);
  });
});

describe("raíces de borde (revisión de F1)", () => {
  it("el infinitivo corto comparte raíz con el presente", () => {
    expect(normalizarEtiqueta("Usar")).toEqual(normalizarEtiqueta("usa"));
    expect(normalizarEtiqueta("Leer de")).toEqual(normalizarEtiqueta("lee de"));
    expect(sugerirPredicado({ descripcion: "Usar [API]" }, n("Persona"), n("Sistema"), "c4").id).toBe("usa");
  });

  it("los dos puntos sólo cuentan por dentro de la palabra", () => {
    expect(normalizarEtiqueta("emite:")).toEqual(normalizarEtiqueta("emite"));
    expect(normalizarEtiqueta("1:N")).toEqual(["1:n"]);
  });
});
