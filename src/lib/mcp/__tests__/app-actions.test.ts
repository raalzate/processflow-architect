import { describe, it, expect } from "vitest";
import { planAppAction, describeAccion } from "../app-actions";

const vistas = [
  { id: "design", name: "Modelo", builtin: true },
  { id: "v1", name: "Sandbox · estado real 25-ago" },
  { id: "v2", name: "Proceso de alta" },
];

describe("planAppAction · borrar una vista (#150)", () => {
  it("resuelve por nombre exacto y devuelve el id a borrar", () => {
    expect(planAppAction({ kind: "delete-view", name: "Proceso de alta" }, vistas)).toEqual({
      ok: true,
      id: "v2",
      name: "Proceso de alta",
    });
  });

  it("tolera la caja del nombre, pero NO la coincidencia parcial", () => {
    expect(planAppAction({ kind: "delete-view", name: "proceso de alta" }, vistas)).toMatchObject({ ok: true });
    expect(planAppAction({ kind: "delete-view", name: "Proceso" }, vistas)).toMatchObject({ ok: false });
  });

  it("una vista del sistema no se borra", () => {
    const r = planAppAction({ kind: "delete-view", name: "Modelo" }, vistas);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain("Proceso de alta");
  });

  it("un nombre que no existe no borra nada y lista las opciones", () => {
    const r = planAppAction({ kind: "delete-view", name: "Fantasma" }, vistas);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain("Sandbox · estado real 25-ago");
  });
});

describe("planAppAction · renombrar (#150)", () => {
  it("acepta un nombre nuevo libre", () => {
    expect(
      planAppAction({ kind: "rename-view", name: "Proceso de alta", newName: "Alta v2" }, vistas)
    ).toMatchObject({ ok: true, id: "v2" });
  });

  it("no crea el duplicado que estamos arreglando", () => {
    const r = planAppAction(
      { kind: "rename-view", name: "Proceso de alta", newName: "sandbox · ESTADO REAL 25-ago" },
      vistas
    );
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/Ya hay una vista/);
  });

  it("rechaza el nombre vacío y el que no cambia nada", () => {
    expect(
      planAppAction({ kind: "rename-view", name: "Proceso de alta", newName: "   " }, vistas)
    ).toMatchObject({ ok: false });
    expect(
      planAppAction({ kind: "rename-view", name: "Proceso de alta", newName: "Proceso de alta" }, vistas)
    ).toMatchObject({ ok: false });
  });
});

describe("describeAccion", () => {
  it("dice qué pasó y cuánto cupo queda", () => {
    expect(describeAccion({ kind: "delete-view", name: "X" }, "X", 2, 50)).toBe(
      'Vista "X" eliminada del proyecto activo. Vistas propias: 2 de 50.'
    );
    expect(describeAccion({ kind: "rename-view", name: "X", newName: " Y " }, "X", 3, 50)).toContain(
      'renombrada a "Y"'
    );
  });
});
