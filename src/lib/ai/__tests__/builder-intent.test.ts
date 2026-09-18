import { describe, it, expect } from "vitest";
import { classifyIntent } from "../builder-intent";
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
