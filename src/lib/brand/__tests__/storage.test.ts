import { describe, it, expect } from "vitest";
import { borrarPerfil, guardarPerfil, leerPerfil, leerPerfiles, serializarPerfiles } from "../storage";

describe("storage de perfiles", () => {
  it("lee tolerante: normaliza colores, descarta basura y duplicados, nunca lanza", () => {
    const json = JSON.stringify([
      { id: "acme", orgId: "acme", nombre: "Acme", tokens: { accent: "#bf4520", ink: "no-color", rare: "#000" }, recibo: ["a", 3], fecha: "2026-10-12" },
      { id: "acme", orgId: "acme" },
      { sin: "id" },
      "texto",
      { id: "default", orgId: "", tokens: { paper: "rgb(255,255,255)" } },
    ]);
    const p = leerPerfiles(json);
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ id: "acme", orgId: "acme", nombre: "Acme", tokens: { accent: "14 71% 44%" }, recibo: ["a"] });
    expect(p[0].tokens).not.toHaveProperty("ink");
    expect(p[1]).toMatchObject({ id: "default", orgId: null, nombre: "default", tokens: { paper: "0 0% 100%" }, recibo: [], fecha: "" });
    expect(leerPerfiles("{no json")).toEqual([]);
    expect(leerPerfiles(null)).toEqual([]);
    expect(leerPerfil(42)).toBeNull();
  });

  it("guardar reemplaza por id y borrar quita; la serialización es JSON", () => {
    const a = leerPerfil({ id: "a", tokens: {} })!;
    const b = leerPerfil({ id: "b", tokens: {} })!;
    const lista = guardarPerfil([a], b);
    expect(lista.map((p) => p.id)).toEqual(["a", "b"]);
    expect(guardarPerfil(lista, { ...a, nombre: "A2" }).find((p) => p.id === "a")?.nombre).toBe("A2");
    expect(borrarPerfil(lista, "a").map((p) => p.id)).toEqual(["b"]);
    expect(leerPerfiles(serializarPerfiles(lista))).toEqual(lista);
  });
});
