import { describe, it, expect } from "vitest";
import { classifyIntent, destinoDe, nombreLibre } from "../builder-intent";
import { notationTypes } from "../../notations";

const vacia = { elementos: 0, tipos: notationTypes("c4", { includeContainers: true }) };
const conContenido = { ...vacia, elementos: 6 };

describe("classifyIntent · la tabla de pedidos reales", () => {
  const tabla: [string, "creativo" | "editor" | "ambiguo"][] = [
    ["crear un ejemplo MVC de un producto en Spring Boot", "creativo"],
    ["hacéme un diagrama C4 de la tienda", "creativo"],
    ["modelá el proceso de alta", "creativo"],
    ["completá esto con la capa de persistencia", "creativo"],
    ["agregá un elemento Persona llamado Cliente", "editor"],
    ["añadí una caja llamada Repositorio", "editor"],
    ["invertí la flecha entre Controlador y Servicio", "editor"],
    ["borrá el Servicio de Pagos", "editor"],
    ["renombrá Web a Portal", "editor"],
    ["conectá Web con la API", "editor"],
    ["hola", "ambiguo"],
    ["¿qué tiene esta vista?", "ambiguo"],
  ];

  for (const [pedido, modo] of tabla) {
    it(`«${pedido}» → ${modo}`, () => {
      expect(classifyIntent(pedido, conContenido).modo).toBe(modo);
    });
  }
});

describe("classifyIntent · lo que extrae del pedido", () => {
  it("saca el tipo de la notación y el nombre que el humano dictó", () => {
    const i = classifyIntent("agregá un elemento Persona llamado Cliente", vacia);
    expect(i).toMatchObject({ modo: "editor", accion: "crear" });
    expect(i.objetivo).toMatchObject({ tipo: "Persona", nombre: "Cliente" });
  });

  it("saca los dos extremos de una relación", () => {
    const i = classifyIntent("invertí la flecha entre Controlador y Servicio", conContenido);
    expect(i).toMatchObject({ modo: "editor", accion: "modificar" });
    expect(i.objetivo).toMatchObject({ desde: "Controlador", hasta: "Servicio" });
  });

  it("prefiere el tipo más largo cuando uno contiene al otro", () => {
    const i = classifyIntent('agregá un Sistema Externo llamado "Pasarela"', vacia);
    expect(i.objetivo).toMatchObject({ tipo: "Sistema Externo", nombre: "Pasarela" });
  });

  it("el nombre entre comillas gana sobre el resto del texto", () => {
    const i = classifyIntent('borrá "Base de Datos"', conContenido);
    expect(i).toMatchObject({ modo: "editor", accion: "eliminar" });
    expect(i.objetivo?.nombre).toBe("Base de Datos");
  });

  it("el motivo del modo queda escrito (va a la traza, FR-001)", () => {
    expect(classifyIntent("hacé un diagrama del checkout", conContenido).motivo).toContain("ya hay");
    expect(classifyIntent("hacé un diagrama del checkout", vacia).motivo).toContain("vacía");
  });

  it("un pedido vacío no se adivina", () => {
    expect(classifyIntent("   ", vacia).modo).toBe("ambiguo");
  });
});

/**
 * El DESTINO del pedido (#431): «una nueva vista» es una pestaña nueva; el modo
 * creativo publicaba siempre sobre la activa y pedía confirmación para pisar
 * «Modelo» cuando el humano había dicho «nueva».
 */
describe("destinoDe", () => {
  it("«nueva vista» → pestaña nueva, con el nombre sacado del pedido", () => {
    expect(destinoDe("crear una nueva vista que hable sobre arquitectura hexagonal, usando spring boot y rabbitmq")).toEqual({
      kind: "nueva",
      nombre: "Arquitectura hexagonal, usando spring bo",
    });
    expect(destinoDe("hacé otra pestaña con el flujo de alta")).toEqual({ kind: "nueva", nombre: "El flujo de alta" });
    expect(destinoDe("creá una vista nueva")).toEqual({ kind: "nueva", nombre: "Propuesta" });
    expect(destinoDe("Una vista aparte de logística")).toEqual({ kind: "nueva", nombre: "Logística" });
  });

  it("«en la vista Pagos» → esa vista, con sus tildes; «en la vista actual» → la activa", () => {
    expect(destinoDe("agregá la capa de persistencia en la vista Pagos")).toEqual({ kind: "vista", nombre: "Pagos" });
    expect(destinoDe("completá en la vista Logística, por favor")).toEqual({ kind: "vista", nombre: "Logística" });
    expect(destinoDe("agrega un nuevo elemento en la vista actual, elemento persona")).toEqual({ kind: "activa" });
  });

  it("sin pista, la activa", () => {
    expect(destinoDe("crear un ejemplo MVC de Spring Boot")).toEqual({ kind: "activa" });
  });

  it("un texto en NFD da el mismo nombre que en NFC", () => {
    const nfd = "completá en la vista Logística".normalize("NFD");
    expect(destinoDe(nfd)).toEqual({ kind: "vista", nombre: "Logística" });
  });
});

describe("nombreLibre", () => {
  it("deja el nombre si está libre y numera si choca (sin mirar mayúsculas ni tildes)", () => {
    expect(nombreLibre("Pagos", ["Modelo"])).toBe("Pagos");
    expect(nombreLibre("Pagos", ["pagos"])).toBe("Pagos (2)");
    expect(nombreLibre("Logística", ["Logistica", "Logística (2)"])).toBe("Logística (3)");
  });
});
