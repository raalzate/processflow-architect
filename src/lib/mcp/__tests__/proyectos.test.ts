import { describe, it, expect } from "vitest";
import {
  avisoOrganizacion,
  formatProjectList,
  mensajeEliminado,
  mensajeEntrega,
  mensajeMovido,
  planProjectAction,
  ubicacion,
  type ProyectoGuardado,
} from "../proyectos";

const archivos: ProyectoGuardado[] = [
  { id: "1", name: "EMMA · Conversación.json", orgId: "proyecto-integrador", content: { nombre_proyecto: "EMMA · Conversación" } },
  { id: "2", name: "EMMA · Onboarding.json", content: { nombre_proyecto: "EMMA · Onboarding" } },
  { id: "3", name: "Seguros.json", orgId: "bupa", content: { nombre_proyecto: "Seguros" } },
];
const orgs = ["bupa", "proyecto-integrador"];

describe("planProjectAction · mover, renombrar y borrar proyectos (#534)", () => {
  it("move-project: a una organización que existe, con el nombre escrito de memoria", () => {
    const r = planProjectAction({ kind: "move-project", project: "emma onboarding", org: "proyecto-integrador" }, archivos, orgs);
    expect(r).toMatchObject({ ok: true, id: "2", org: "proyecto-integrador" });
  });

  it("move-project a una organización que no existe: error con las que hay", () => {
    const r = planProjectAction({ kind: "move-project", project: "Seguros", org: "otra" }, archivos, orgs);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/"bupa"/);
  });

  it("move-project con org vacía lo deja sin organización", () => {
    const r = planProjectAction({ kind: "move-project", project: "Seguros", org: null }, archivos, orgs);
    expect(r).toMatchObject({ ok: true, id: "3", org: null });
  });

  it("move-project a donde ya está no hace nada y lo dice", () => {
    const r = planProjectAction({ kind: "move-project", project: "Seguros", org: "bupa" }, archivos, orgs);
    expect(!r.ok && r.error).toMatch(/ya está/);
  });

  it("rename-project: guarda con .json y no choca con otro proyecto", () => {
    const ok = planProjectAction({ kind: "rename-project", project: "Seguros", newName: "Seguros Bupa" }, archivos, orgs);
    expect(ok).toMatchObject({ ok: true, id: "3", newName: "Seguros Bupa" });
    const choque = planProjectAction({ kind: "rename-project", project: "Seguros", newName: "emma onboarding.json" }, archivos, orgs);
    expect(!choque.ok && choque.error).toMatch(/Ya hay un proyecto/);
    const vacio = planProjectAction({ kind: "rename-project", project: "Seguros", newName: "  " }, archivos, orgs);
    expect(vacio.ok).toBe(false);
  });

  it("delete-project exige el nombre EXACTO: un nombre aproximado no borra nada", () => {
    expect(planProjectAction({ kind: "delete-project", project: "EMMA · Onboarding" }, archivos, orgs)).toMatchObject({ ok: true, id: "2" });
    expect(planProjectAction({ kind: "delete-project", project: "EMMA · Onboarding.json" }, archivos, orgs)).toMatchObject({ ok: true, id: "2" });
    const aprox = planProjectAction({ kind: "delete-project", project: "emma onboarding" }, archivos, orgs);
    expect(aprox.ok).toBe(false);
    expect(!aprox.ok && aprox.error).toMatch(/exacto/);
  });

  it("un proyecto que no existe: error con los que hay", () => {
    const r = planProjectAction({ kind: "rename-project", project: "Fantasma", newName: "X" }, archivos, orgs);
    expect(!r.ok && r.error).toMatch(/EMMA · Conversación/);
  });
});

describe("dónde quedó cada cosa (#534)", () => {
  it("ubicacion nombra la organización o dice que no tiene", () => {
    expect(ubicacion("bupa")).toBe('la organización "bupa"');
    expect(ubicacion(null)).toBe("sin organización");
  });

  it("avisa cuando el humano está mirando otra organización en la app", () => {
    expect(avisoOrganizacion("proyecto-integrador", "bupa")).toMatch(/no lo va a ver/);
    // Sin filtro (todas) o en la misma: sin aviso.
    expect(avisoOrganizacion("bupa", undefined)).toBe("");
    expect(avisoOrganizacion("bupa", "bupa")).toBe("");
  });

  it("mensajeMovido y mensajeEliminado se leen bien también sin organización", () => {
    expect(mensajeMovido("Seguros.json", "bupa", undefined)).toBe('Proyecto "Seguros" movido a la organización "bupa".');
    expect(mensajeMovido("Seguros.json", null, undefined)).toBe('Proyecto "Seguros" quitado de su organización: ahora está sin organización.');
    expect(mensajeMovido("Seguros.json", "bupa", "otra")).toMatch(/⚠️/);
    expect(mensajeEliminado("Seguros.json", "bupa")).toBe('Proyecto "Seguros" eliminado (estaba en la organización "bupa").');
    expect(mensajeEliminado("Seguros.json", null)).toBe('Proyecto "Seguros" eliminado (no tenía organización).');
  });

  it("mensajeEntrega dice proyecto, acción y organización", () => {
    const m = mensajeEntrega({ accion: "creado", proyecto: "EMMA · Arquitectura.json", org: "proyecto-integrador", orgApp: "proyecto-integrador" });
    expect(m).toContain('Proyecto "EMMA · Arquitectura" creado');
    expect(m).toContain('la organización "proyecto-integrador"');
    expect(m).not.toContain("⚠️");
  });
});

describe("formatProjectList · list_projects (#534)", () => {
  const briefs = [
    { name: "EMMA · Conversación.json", org: "proyecto-integrador", notation: "bpmn", views: 3, fecha: "2026-10-01", activo: true },
    { name: "EMMA · Onboarding.json", org: null, notation: "bpmn", views: 1, activo: false },
    { name: "Seguros.json", org: "bupa", notation: "ddd", views: 0, activo: false },
  ];

  it("agrupa por organización y marca el activo", () => {
    const t = formatProjectList(briefs);
    expect(t).toMatch(/Organización "bupa" \(1\)/);
    expect(t).toMatch(/Organización "proyecto-integrador" \(1\)/);
    expect(t).toMatch(/Sin organización \(1\)/);
    expect(t).toMatch(/"EMMA · Conversación" · bpmn · 3 vistas · 2026-10-01 · ACTIVO/);
  });

  it("con filtro de organización sólo lista esa, y lo dice", () => {
    const t = formatProjectList(briefs, { org: "bupa" });
    expect(t).toContain("Seguros");
    expect(t).not.toContain("EMMA");
    expect(t).toMatch(/filtrado/);
  });
});
