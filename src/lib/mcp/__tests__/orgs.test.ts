/**
 * Organizaciones: el slug entra a un `path.join`, así que lo que se prueba primero es
 * que no se pueda salir del workspace. Después, que la resolución no "adivine": un
 * aislamiento que cae solo a otra org es peor que no tener aislamiento, porque el
 * agente cree estar en un cliente y escribe en otro.
 */

import { describe, it, expect } from "vitest";
import {
  orgSlug,
  isValidOrgSlug,
  diagramsDirRel,
  orgDirRel,
  resolveOrg,
  formatOrgList,
  SIN_ORG,
} from "../orgs";

describe("orgSlug", () => {
  it("normaliza acentos, espacios y mayúsculas", () => {
    expect(orgSlug("Acme Salud")).toBe("acme-salud");
    expect(orgSlug("Clínica Ñandú")).toBe("clinica-nandu");
    expect(orgSlug("  ACME  ")).toBe("acme");
  });

  it("devuelve vacío cuando no queda nada usable (no inventa una org fantasma)", () => {
    expect(orgSlug("")).toBe("");
    expect(orgSlug("   ")).toBe("");
    expect(orgSlug("///")).toBe("");
  });

  it("recorta a un largo de directorio y no deja guion final", () => {
    const slug = orgSlug("a".repeat(80));
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("isValidOrgSlug", () => {
  it("acepta lo que es un nombre de carpeta razonable", () => {
    for (const s of ["acme", "acme-salud", "a1", "cliente-2026"]) {
      expect(isValidOrgSlug(s), s).toBe(true);
    }
  });

  it("rechaza todo lo que podría salir del workspace o romper la ruta", () => {
    for (const s of ["..", ".", "../otro", "a/b", "a\\b", "", " ", "-acme", "acme-", "ACME", "acme salud", "acme..salud", "a".repeat(49)]) {
      expect(isValidOrgSlug(s), s).toBe(false);
    }
  });

  it("rechaza lo que no es string", () => {
    expect(isValidOrgSlug(null)).toBe(false);
    expect(isValidOrgSlug(undefined)).toBe(false);
  });
});

describe("diagramsDirRel", () => {
  it("sin org devuelve la carpeta plana heredada", () => {
    expect(diagramsDirRel()).toBe("diagrams");
    expect(diagramsDirRel(null)).toBe("diagrams");
    expect(diagramsDirRel("")).toBe("diagrams");
  });

  it("con org devuelve su carpeta aislada", () => {
    expect(diagramsDirRel("acme")).toBe("orgs/acme/diagrams");
    expect(orgDirRel("acme")).toBe("orgs/acme");
  });

  it("un slug inválido no llega a componer una ruta", () => {
    expect(() => diagramsDirRel("../otro")).toThrow(/slug de organización válido/);
    expect(() => orgDirRel("..")).toThrow(/slug de organización válido/);
  });
});

describe("resolveOrg", () => {
  const disponibles = ["acme", "contoso"];

  it("el parámetro explícito gana", () => {
    expect(resolveOrg({ explicit: "contoso", pinned: "acme", disponibles })).toEqual({
      slug: "contoso",
      origen: "parametro",
    });
  });

  it("`null` explícito pide la carpeta plana, y eso es una decisión válida", () => {
    expect(resolveOrg({ explicit: null, pinned: "acme", disponibles })).toEqual({
      slug: null,
      origen: "parametro",
    });
  });

  it("una org explícita que no existe NO cae a la fijada", () => {
    expect(() => resolveOrg({ explicit: "otra", pinned: "acme", disponibles })).toThrow(
      /No existe la organización "otra"/
    );
    // El mensaje tiene que decir qué hay: el error sin la lista obliga a otra llamada.
    expect(() => resolveOrg({ explicit: "otra", disponibles })).toThrow(/"acme", "contoso"/);
  });

  it("sin parámetro usa la fijada, y después la de la configuración", () => {
    expect(resolveOrg({ pinned: "acme", disponibles }).origen).toBe("fijada");
    expect(resolveOrg({ configured: "contoso", disponibles })).toEqual({
      slug: "contoso",
      origen: "configuracion",
    });
    // La fijada le gana a la de la configuración: es la decisión más reciente.
    expect(resolveOrg({ pinned: "acme", configured: "contoso", disponibles }).slug).toBe("acme");
  });

  it("sin nada cae a «sin organización» (comportamiento de un workspace de hoy)", () => {
    expect(resolveOrg({ disponibles })).toEqual({ slug: null, origen: "ninguna" });
    expect(resolveOrg({ disponibles: [] })).toEqual({ slug: null, origen: "ninguna" });
  });

  it("una fijada que ya no existe es error, no silencio", () => {
    // Si cayera a la carpeta plana, el agente creería estar aislado y estaría
    // escribiendo en los diagramas de todos.
    expect(() => resolveOrg({ pinned: "vieja", disponibles })).toThrow(/ya no está en el workspace/);
    expect(() => resolveOrg({ configured: "vieja", disponibles })).toThrow(/ya no está en el workspace/);
  });

  it("NO adivina cuando hay una sola org", () => {
    expect(resolveOrg({ disponibles: ["acme"] })).toEqual({ slug: null, origen: "ninguna" });
  });
});

describe("formatOrgList", () => {
  const orgs = [
    { slug: "acme", nombre: "Acme Salud", diagramas: 3 },
    { slug: "contoso", nombre: "Contoso", diagramas: 0 },
  ];

  it("marca la activa y dice cuántos diagramas tiene cada una", () => {
    const salida = formatOrgList(orgs, "acme");
    expect(salida).toMatch(/acme ← activa/);
    expect(salida).toMatch(/3 diagrama\(s\)/);
    expect(salida).not.toMatch(/contoso ← activa/);
  });

  it("con la carpeta plana activa lo dice explícitamente", () => {
    expect(formatOrgList(orgs, null)).toContain(`${SIN_ORG} ← activa`);
  });

  it("sin organizaciones explica cómo crear una", () => {
    expect(formatOrgList([], null)).toMatch(/create_org/);
  });
});
