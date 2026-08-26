/**
 * Agrupar y filtrar proyectos por organización. Lo que se cuida acá es que el filtro
 * NUNCA deje al humano sin salida (el equivalente en el header de «el lienzo nunca
 * queda en blanco») y que un proyecto sin `orgId` —todos los de antes de esta
 * feature— siga siendo visible en alguna parte.
 */

import { describe, it, expect } from "vitest";
import type { SavedFile } from "../types";
import {
  ORG_TODAS,
  SIN_ORG_LABEL,
  orgOf,
  groupByOrg,
  filterByOrg,
  orgChipLabel,
  emptyOrgHint,
  orgOptions,
  visibleSelection,
} from "../project-orgs";

const file = (id: string, orgId?: string): SavedFile =>
  ({ id, name: id, orgId, content: {} as SavedFile["content"] }) as SavedFile;

const acme = file("enrollment", "acme");
const acme2 = file("payments", "acme");
const contoso = file("onboarding", "contoso");
const suelto = file("borrador");

describe("orgOf", () => {
  it("un proyecto de antes de las organizaciones cuenta como «sin organización»", () => {
    expect(orgOf(suelto)).toBeNull();
    expect(orgOf({ orgId: "   " })).toBeNull();
    expect(orgOf({ orgId: undefined })).toBeNull();
  });

  it("recorta el slug guardado", () => {
    expect(orgOf({ orgId: " acme " })).toBe("acme");
  });
});

describe("groupByOrg", () => {
  it("agrupa alfabéticamente y deja «sin organización» al final", () => {
    const grupos = groupByOrg([suelto, contoso, acme, acme2]);
    expect(grupos.map((g) => g.slug)).toEqual(["acme", "contoso", null]);
    expect(grupos[0].files).toHaveLength(2);
    expect(grupos[2].label).toBe(SIN_ORG_LABEL);
  });

  it("usa el nombre legible cuando se conoce, y el slug cuando no", () => {
    const grupos = groupByOrg([acme, contoso], { acme: "Acme Salud" });
    expect(grupos[0].label).toBe("Acme Salud");
    expect(grupos[1].label).toBe("contoso");
  });

  it("sin proyectos sueltos NO inventa el grupo «sin organización»", () => {
    expect(groupByOrg([acme]).map((g) => g.slug)).toEqual(["acme"]);
  });
});

describe("filterByOrg", () => {
  const todos = [acme, acme2, contoso, suelto];

  it("«todas» no filtra", () => {
    expect(filterByOrg(todos, ORG_TODAS)).toHaveLength(4);
  });

  it("una organización deja sólo los suyos", () => {
    expect(filterByOrg(todos, "acme").map((f) => f.id)).toEqual(["enrollment", "payments"]);
  });

  it("`null` deja sólo los que no fueron agrupados", () => {
    expect(filterByOrg(todos, null).map((f) => f.id)).toEqual(["borrador"]);
  });
});

describe("emptyOrgHint · el filtro nunca deja al humano sin salida", () => {
  it("con proyectos visibles no dice nada", () => {
    expect(emptyOrgHint(3, "acme")).toBeNull();
  });

  it("el vacío nombra la organización que lo causó", () => {
    expect(emptyOrgHint(0, "acme", { acme: "Acme Salud" })).toBe("Sin proyectos en Acme Salud");
    expect(emptyOrgHint(0, null)).toBe(`Sin proyectos en ${SIN_ORG_LABEL}`);
  });

  it("sin filtro, el vacío es del repositorio y no de la organización", () => {
    expect(emptyOrgHint(0, ORG_TODAS)).toBe("Sin proyectos guardados");
  });
});

describe("orgChipLabel", () => {
  it("traduce el filtro a lo que se lee en el chip", () => {
    expect(orgChipLabel(ORG_TODAS)).toBe("Todas");
    expect(orgChipLabel(null)).toBe(SIN_ORG_LABEL);
    expect(orgChipLabel("acme", { acme: "Acme Salud" })).toBe("Acme Salud");
    expect(orgChipLabel("acme")).toBe("acme");
  });
});

describe("orgOptions", () => {
  it("ofrece las que tienen proyectos y también las creadas por el agente", () => {
    expect(orgOptions([acme, suelto], ["contoso"])).toEqual(["acme", "contoso", null]);
  });

  it("no ofrece «sin organización» si no hay nada suelto: sería un filtro vacío garantizado", () => {
    expect(orgOptions([acme], [])).toEqual(["acme"]);
  });

  it("sin proyectos ni organizaciones no ofrece nada", () => {
    expect(orgOptions([], [])).toEqual([]);
  });
});

describe("visibleSelection · el selector no queda mudo", () => {
  const visibles = [acme, acme2];

  it("mantiene la selección cuando el proyecto activo está a la vista", () => {
    expect(visibleSelection("enrollment", visibles)).toBe("enrollment");
  });

  it("suelta la selección cuando el filtro sacó al proyecto activo de la lista", () => {
    // Éste es el defecto de #166: con el id puesto, el selector no toma el
    // placeholder y tampoco encuentra el item → se renderiza en blanco, sin decir
    // que la culpa fue del filtro ni cómo volver.
    expect(visibleSelection("onboarding", visibles)).toBe("");
    expect(visibleSelection("enrollment", [])).toBe("");
  });

  it("sin proyecto activo no hay selección", () => {
    expect(visibleSelection(null, visibles)).toBe("");
  });
});
