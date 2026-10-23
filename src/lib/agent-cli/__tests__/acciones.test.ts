import { describe, expect, it } from "vitest";
import { accionesDeEjemplo } from "../acciones";

const labels = (a: { label: string }[]) => a.map((x) => x.label);

describe("acciones de ejemplo del chat (#643)", () => {
  it("una base de datos sugiere sus propiedades, no repo", () => {
    const a = accionesDeEjemplo({ tipo: "Base de Datos", hasSpec: false, escribe: true });
    expect(labels(a)).toContain("Propiedades de la base");
    expect(labels(a)).not.toContain("Repo, puerto y endpoint");
  });

  it("un servicio sugiere repo, puerto y endpoint", () => {
    const a = accionesDeEjemplo({ tipo: "Contenedor", hasSpec: false, escribe: true });
    expect(labels(a)).toContain("Repo, puerto y endpoint");
  });

  it("con spec escrita propone completarla, sin ella escribirla", () => {
    expect(labels(accionesDeEjemplo({ hasSpec: true, escribe: true }))).toContain("Completar la spec");
    expect(labels(accionesDeEjemplo({ hasSpec: false, escribe: true }))).toContain("Escribir la spec");
  });

  it("la IA de la app no escribe: sólo propone preguntas", () => {
    const a = accionesDeEjemplo({ tipo: "Contenedor", hasSpec: false, escribe: false });
    expect(a.every((x) => !/Pulí|Completá|Escribí/.test(x.prompt))).toBe(true);
  });

  it("con carpetas adjuntas ofrece buscar en el código", () => {
    expect(labels(accionesDeEjemplo({ hasSpec: false, escribe: true, conCarpetas: true }))).toContain("Buscar en el código");
    expect(labels(accionesDeEjemplo({ hasSpec: false, escribe: true }))).not.toContain("Buscar en el código");
  });
});
