import { describe, it, expect } from "vitest";
import {
  MAX_RESUMEN,
  abrirAlTerminar,
  artefactoPrincipal,
  porQueDeLaPregunta,
  resumenDelPlan,
  revisionQueReemplaza,
  textoDelModelo,
} from "../pause-summary";
import { lineageKey } from "../../artifacts/versioning";
import type { AgentPause, Artifact } from "../../agent-types";

type Plan = Extract<AgentPause, { kind: "plan" }>;

const plan = (extra: Partial<Plan> = {}): Plan => ({
  kind: "plan",
  title: "Arquitectura de pagos",
  artifactKind: "architecture_doc",
  sections: [
    { title: "Contexto", sources: ["DDD · Pagos"] },
    { title: "Contenedores", sources: ["C4 · Contenedores", "DDD · Pagos"] },
  ],
  ...extra,
});

const art = (id: string, kind: string, extra: Partial<Artifact> = {}): Artifact => ({
  id,
  versionId: "v1",
  kind,
  render: "markdown",
  title: id,
  payload: "",
  createdAt: "2026-10-22T00:00:00Z",
  ...extra,
});

describe("resumenDelPlan (#613)", () => {
  it("sin resumen del modelo, arma uno con título, tipo, secciones y fuentes sin repetir", () => {
    const r = resumenDelPlan(plan(), { tipo: "Documento de arquitectura" });
    expect(r.que).toBe(
      "Va a generar «Arquitectura de pagos» (Documento de arquitectura) en 2 secciones, a partir de DDD · Pagos y C4 · Contenedores."
    );
  });

  it("si el modelo da resumen, manda el suyo", () => {
    const r = resumenDelPlan(plan({ summary: "  Un documento   para el comité  " }));
    expect(r.que).toBe("Un documento para el comité");
  });

  it("el efecto es determinista: nuevo, o revisión N+1 si ya existe", () => {
    expect(resumenDelPlan(plan()).efecto).toMatch(/artefacto nuevo/);
    const r = resumenDelPlan(plan({ summary: "dice que es nuevo" }), {
      existente: { title: "Arquitectura de pagos", revision: 2 },
    });
    expect(r.efecto).toMatch(/revisión 3/);
    expect(r.efecto).toMatch(/historial/);
  });

  it("sin tipo legible usa el kind; sin secciones no inventa", () => {
    expect(resumenDelPlan(plan({ sections: [] })).que).toBe("Va a generar «Arquitectura de pagos» (architecture_doc).");
  });
});

describe("revisionQueReemplaza", () => {
  it("encuentra la vigente del mismo linaje y versión; otra versión no cuenta", () => {
    const p = plan();
    const key = lineageKey(p.artifactKind, p.title);
    const estado = {
      lineages: [
        { id: "L1", key, kind: p.artifactKind, versionId: "v1", createdAt: "" },
        { id: "L2", key, kind: p.artifactKind, versionId: "v2", createdAt: "" },
      ],
      artifacts: [
        art("a1", p.artifactKind, { lineageId: "L1", revision: 1, supersededBy: "a2" }),
        art("a2", p.artifactKind, { lineageId: "L1", revision: 2 }),
      ],
    };
    expect(revisionQueReemplaza(p, estado, "v1")?.id).toBe("a2");
    expect(revisionQueReemplaza(p, estado, "v3")).toBeUndefined();
  });
});

describe("porQueDeLaPregunta", () => {
  const q = { kind: "question" as const, id: "q", text: "¿Incluyo costos?", options: ["Sí", "No"] };

  it("usa el porqué del modelo y dice qué pasa con «No sé»", () => {
    expect(porQueDeLaPregunta({ ...q, why: "Cambia el alcance." })).toBe(
      "Cambia el alcance. Si no sabés, sigue con «Sí» y lo declara como supuesto."
    );
  });

  it("sin porqué, da uno genérico y honesto", () => {
    expect(porQueDeLaPregunta(q)).toMatch(/cada opción lleva a un resultado distinto/);
  });
});

describe("textoDelModelo", () => {
  it("descarta lo que no es texto o está vacío, y recorta lo largo", () => {
    expect(textoDelModelo(42)).toBeUndefined();
    expect(textoDelModelo("   ")).toBeUndefined();
    const largo = textoDelModelo("x".repeat(MAX_RESUMEN * 2))!;
    expect(largo.length).toBe(MAX_RESUMEN);
    expect(largo.endsWith("…")).toBe(true);
  });
});

describe("abrir el artefacto al terminar", () => {
  it("abre el del tipo del plan; si no hay, el último creado", () => {
    const creados = [art("a", "architecture_doc"), art("b", "diagram"), art("c", "architecture_doc"), art("d", "diagram")];
    expect(artefactoPrincipal(creados, "architecture_doc")?.id).toBe("c");
    expect(artefactoPrincipal(creados, "otro")?.id).toBe("d");
    expect(artefactoPrincipal(creados)?.id).toBe("d");
    expect(artefactoPrincipal([])).toBeUndefined();
  });

  it("no roba el foco: sólo con la ventana activa, sin escribir y sin otro diálogo", () => {
    expect(abrirAlTerminar({ ventanaActiva: true, escribiendo: false, otroDialogoAbierto: false })).toBe(true);
    expect(abrirAlTerminar({ ventanaActiva: false, escribiendo: false, otroDialogoAbierto: false })).toBe(false);
    expect(abrirAlTerminar({ ventanaActiva: true, escribiendo: true, otroDialogoAbierto: false })).toBe(false);
    expect(abrirAlTerminar({ ventanaActiva: true, escribiendo: false, otroDialogoAbierto: true })).toBe(false);
  });
});
