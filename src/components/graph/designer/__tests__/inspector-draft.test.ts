import { describe, expect, it } from "vitest";
import { changedKeys, draftPatch, hasDraftChanges, parseTagList } from "../inspector-draft";

describe("inspector-draft", () => {
  const abierto = { id: "a", nombre: "Pago", descripcion: "", x: 100, y: 100, tags: ["java"] };

  it("sin cambios no hay nada que guardar", () => {
    expect(hasDraftChanges(abierto, { ...abierto })).toBe(false);
    expect(changedKeys(abierto, { ...abierto })).toEqual([]);
  });

  it("detecta el campo editado, también dentro de un array", () => {
    expect(changedKeys(abierto, { ...abierto, nombre: "Pago aprobado" })).toEqual(["nombre"]);
    expect(changedKeys(abierto, { ...abierto, tags: ["java", "spring"] })).toEqual(["tags"]);
  });

  it("guarda el DIFF: la geometría que movió el lienzo no viaja en el parche", () => {
    // El nodo se arrastró mientras la ficha estaba abierta y en la ficha se
    // cambió el nombre. Un parche con x/y lo devolvería a donde estaba al abrir.
    const draft = { ...abierto, nombre: "Pago aprobado" };
    const patch = draftPatch(abierto, draft);
    expect(patch).toEqual({ nombre: "Pago aprobado" });
    expect(Object.keys(patch)).not.toContain("x");
    // Así lo aplica el lienzo, sobre el nodo VIVO (ya movido).
    const vivo = { ...abierto, x: 640, y: 320 };
    expect({ ...vivo, ...patch }).toEqual({ ...vivo, nombre: "Pago aprobado" });
  });

  it("un campo vaciado en la ficha viaja vacío", () => {
    const conTexto = { ...abierto, descripcion: "algo" };
    expect(draftPatch(conTexto, { ...conTexto, descripcion: "" })).toEqual({ descripcion: "" });
  });

  it("sin cambios el parche está vacío", () => {
    expect(draftPatch(abierto, { ...abierto })).toEqual({});
  });

  describe("parseTagList", () => {
    it("separa por coma y recorta", () => {
      expect(parseTagList("Angular, PostgreSQL ,Kafka")).toEqual(["Angular", "PostgreSQL", "Kafka"]);
    });

    it("no toca el contenido de cada etiqueta", () => {
      // `.netcore` empieza con punto y `Node 20` lleva espacio: normalizarlos
      // convertiría la lista del usuario en otra cosa.
      expect(parseTagList(".netcore, C#, Node 20")).toEqual([".netcore", "C#", "Node 20"]);
    });

    it("descarta vacíos y repetidos", () => {
      expect(parseTagList("java, , java,,spring,")).toEqual(["java", "spring"]);
    });

    it("un texto sin etiquetas da lista vacía", () => {
      expect(parseTagList("  ,, ")).toEqual([]);
    });
  });
});

describe("metadatos en el parche del borrador", () => {
  it("editar sólo las referencias manda sólo `metadata` (la geometría del lienzo queda)", () => {
    const original = {
      id: "cmd",
      nombre: "Pagar",
      x: 10,
      y: 20,
      metadata: [{ clave: "repo", valor: "acme/pagos-svc" }],
    };
    const draft = {
      ...original,
      metadata: [
        { clave: "repo", valor: "acme/pagos-svc" },
        { clave: "wiki", valor: "Dominio Pagos", url: "https://wiki/pagos" },
      ],
    };
    expect(hasDraftChanges(original, draft)).toBe(true);
    expect(draftPatch(original, draft)).toEqual({ metadata: draft.metadata });
  });

  it("quitar la última referencia viaja como `undefined`, no como lista vacía", () => {
    // El campo es OPCIONAL en el elemento (como en `DesignerNode`): el borrador
    // sin referencias no manda `[]`, manda que ya no hay.
    type Ficha = { id: string; metadata?: { clave: string; valor: string }[] };
    const original: Ficha = { id: "cmd", metadata: [{ clave: "repo", valor: "a" }] };
    const draft: Ficha = { id: "cmd", metadata: undefined };
    expect(draftPatch(original, draft)).toEqual({ metadata: undefined });
  });

  it("reordenar cuenta como cambio: el orden es del usuario", () => {
    const a = { metadata: [{ clave: "repo", valor: "r" }, { clave: "wiki", valor: "w" }] };
    const b = { metadata: [{ clave: "wiki", valor: "w" }, { clave: "repo", valor: "r" }] };
    expect(hasDraftChanges(a, b)).toBe(true);
  });
});
