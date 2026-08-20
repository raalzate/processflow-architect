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
