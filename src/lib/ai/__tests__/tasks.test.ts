import { describe, it, expect } from "vitest";
import {
  describeNodeTask,
  classifyTypeTask,
  suggestNameTask,
  suggestTagsTask,
  suggestNextTask,
  linkLabelTask,
  bigPictureDescTask,
} from "@/lib/ai/tasks";
import { NODE_TYPES } from "@/lib/types";

describe("LIGHT task metadata", () => {
  const lightTasks = [
    describeNodeTask,
    classifyTypeTask,
    suggestNameTask,
    suggestTagsTask,
    suggestNextTask,
    linkLabelTask,
    bigPictureDescTask,
  ];

  it("all light tasks have tier 'light', a unique non-empty id, buildPrompt and parse, no structured/remoteFlow", () => {
    const ids = new Set<string>();
    for (const t of lightTasks) {
      expect(t.tier).toBe("light");
      expect(typeof t.id).toBe("string");
      expect(t.id.length).toBeGreaterThan(0);
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
      expect(typeof t.buildPrompt).toBe("function");
      expect(typeof t.parse).toBe("function");
      // Light tasks are local-only: not structured, no remoteFlow.
      expect(t.structured).toBeUndefined();
      expect(t.remoteFlow).toBeUndefined();
    }
  });

  it("all light tasks declare a positive maxLocalChars", () => {
    for (const t of lightTasks) {
      expect(typeof t.maxLocalChars).toBe("number");
      expect(t.maxLocalChars as number).toBeGreaterThan(0);
    }
  });
});

describe("describeNodeTask", () => {
  it("has expected id/tier", () => {
    expect(describeNodeTask.id).toBe("describe-node");
    expect(describeNodeTask.tier).toBe("light");
    expect(describeNodeTask.maxLocalChars).toBe(600);
  });

  it("buildPrompt interpolates tipo, nombre and a system prompt (with descripcion)", () => {
    const { prompt, system } = describeNodeTask.buildPrompt!({
      tipo: "Comando",
      nombre: "Registrar Pago",
      descripcion: "Registra un pago entrante.",
    });
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain("Registrar Pago");
    expect(prompt).toContain("Comando");
    expect(prompt).toContain("Registra un pago entrante.");
    expect(typeof system).toBe("string");
    expect((system as string).length).toBeGreaterThan(0);
  });

  it("buildPrompt works without descripcion (new-description branch)", () => {
    const { prompt } = describeNodeTask.buildPrompt!({
      tipo: "Evento",
      nombre: "Pago Registrado",
    });
    expect(prompt).toContain("Pago Registrado");
    expect(prompt).toContain("descripción nueva");
  });

  it("parse strips surrounding quotes (no leading/trailing whitespace)", () => {
    expect(describeNodeTask.parse!('"una frase descriptiva"')).toBe("una frase descriptiva");
    expect(describeNodeTask.parse!("`backtick`")).toBe("backtick");
    expect(describeNodeTask.parse!("sin comillas")).toBe("sin comillas");
  });

  it("strips quotes even when surrounded by whitespace", () => {
    // stripQuotes ahora hace trim ANTES de quitar comillas, así que las respuestas
    // de la IA con espacios alrededor (`  "texto"  `) quedan limpias.
    expect(describeNodeTask.parse!('  "una frase descriptiva"  ')).toBe("una frase descriptiva");
  });
});

describe("classifyTypeTask", () => {
  it("has expected id/tier", () => {
    expect(classifyTypeTask.id).toBe("classify-type");
    expect(classifyTypeTask.tier).toBe("light");
    expect(classifyTypeTask.maxLocalChars).toBe(800);
  });

  it("buildPrompt interpolates nombre and lists NODE_TYPES (with descripcion)", () => {
    const { prompt } = classifyTypeTask.buildPrompt!({
      nombre: "Pago Aprobado",
      descripcion: "Un hecho que ya ocurrió.",
    });
    expect(prompt).toContain("Pago Aprobado");
    expect(prompt).toContain("Un hecho que ya ocurrió.");
    // All node types are listed in the prompt.
    for (const t of NODE_TYPES) expect(prompt).toContain(t);
  });

  it("buildPrompt uses empty descripcion fallback when missing", () => {
    const { prompt } = classifyTypeTask.buildPrompt!({ nombre: "Pago Aprobado" });
    expect(prompt).toContain("Pago Aprobado");
    expect(prompt).toContain("(sin descripción)");
  });

  it("parse matches exact type (case-insensitive)", () => {
    expect(classifyTypeTask.parse!("comando")).toBe("Comando");
    expect(classifyTypeTask.parse!('"EVENTO"')).toBe("Evento");
  });

  it("parse matches via includes when not exact", () => {
    expect(classifyTypeTask.parse!("El tipo es: comando")).toBe("Comando");
  });

  it("parse returns empty string when no type matches", () => {
    expect(classifyTypeTask.parse!("xyz no existe")).toBe("");
  });
});

describe("suggestNameTask", () => {
  it("has expected id/tier", () => {
    expect(suggestNameTask.id).toBe("suggest-name");
    expect(suggestNameTask.tier).toBe("light");
    expect(suggestNameTask.maxLocalChars).toBe(800);
  });

  it("buildPrompt interpolates tipo (with descripcion)", () => {
    const { prompt } = suggestNameTask.buildPrompt!({
      tipo: "Comando",
      descripcion: "Acción de registrar reembolso.",
    });
    expect(prompt).toContain("Comando");
    expect(prompt).toContain("Acción de registrar reembolso.");
  });

  it("buildPrompt uses fallback when descripcion missing", () => {
    const { prompt } = suggestNameTask.buildPrompt!({ tipo: "Evento" });
    expect(prompt).toContain("(sin descripción)");
  });

  it("parse strips quotes and a trailing period", () => {
    expect(suggestNameTask.parse!('"Registrar Reembolso."')).toBe("Registrar Reembolso");
    expect(suggestNameTask.parse!("Reembolso Aprobado")).toBe("Reembolso Aprobado");
  });
});

describe("suggestTagsTask", () => {
  it("has expected id/tier", () => {
    expect(suggestTagsTask.id).toBe("suggest-tags");
    expect(suggestTagsTask.tier).toBe("light");
    expect(suggestTagsTask.maxLocalChars).toBe(800);
  });

  it("buildPrompt interpolates tipo and nombre (with descripcion)", () => {
    const { prompt } = suggestTagsTask.buildPrompt!({
      tipo: "Repositorio",
      nombre: "Repositorio de Pedidos",
      descripcion: "Persiste pedidos.",
    });
    expect(prompt).toContain("Repositorio de Pedidos");
    expect(prompt).toContain("Repositorio");
    expect(prompt).toContain("Persiste pedidos.");
  });

  it("buildPrompt uses fallback when descripcion missing", () => {
    const { prompt } = suggestTagsTask.buildPrompt!({ tipo: "Vista", nombre: "Panel" });
    expect(prompt).toContain("(sin descripción)");
  });

  it("parse splits comma/newline/semicolon-separated values into a string[]", () => {
    const result = suggestTagsTask.parse!("Angular, PostgreSQL\nKafka; REST");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(["Angular", "PostgreSQL", "Kafka", "REST"]);
  });

  it("parse strips surrounding quotes, drops empties and long tags, caps at 6", () => {
    const raw = '"a, , b, ' + "x".repeat(40) + ', c, d, e, f, g, h"';
    const result = suggestTagsTask.parse!(raw);
    // Empty and the 40-char tag are filtered; result capped to 6.
    expect(result).not.toContain("");
    expect(result.every((t) => t.length < 30)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(6);
    expect(result).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
});

describe("suggestNextTask", () => {
  it("has expected id/tier", () => {
    expect(suggestNextTask.id).toBe("suggest-next");
    expect(suggestNextTask.tier).toBe("light");
    expect(suggestNextTask.maxLocalChars).toBe(900);
  });

  it("buildPrompt interpolates element and lists NODE_TYPES (with descripcion)", () => {
    const { prompt } = suggestNextTask.buildPrompt!({
      tipo: "Comando",
      nombre: "Registrar Pago",
      descripcion: "Se registra un pago.",
    });
    expect(prompt).toContain("Registrar Pago");
    expect(prompt).toContain("Comando");
    expect(prompt).toContain("Se registra un pago.");
    for (const t of NODE_TYPES) expect(prompt).toContain(t);
  });

  it("buildPrompt uses fallback when descripcion missing", () => {
    const { prompt } = suggestNextTask.buildPrompt!({ tipo: "Actor", nombre: "Cliente" });
    expect(prompt).toContain("(sin descripción)");
  });

  it("parse splits TIPO | NOMBRE | RELACION with exact type match", () => {
    const out = suggestNextTask.parse!("Evento | Pago Registrado | produce");
    expect(out).toEqual({ tipo: "Evento", nombre: "Pago Registrado", relacion: "produce" });
  });

  it("parse matches type via includes and lowercases relacion", () => {
    const out = suggestNextTask.parse!("tipo evento aqui | Algo | DISPARA");
    expect(out.tipo).toBe("Evento");
    expect(out.nombre).toBe("Algo");
    expect(out.relacion).toBe("dispara");
  });

  it("parse defaults tipo to 'Evento', nombre to '' and relacion to 'produce' when missing", () => {
    const out = suggestNextTask.parse!("zzz-unknown-type");
    expect(out.tipo).toBe("Evento");
    expect(out.nombre).toBe("");
    expect(out.relacion).toBe("produce");
  });
});

describe("linkLabelTask", () => {
  it("has expected id/tier", () => {
    expect(linkLabelTask.id).toBe("link-label");
    expect(linkLabelTask.tier).toBe("light");
    expect(linkLabelTask.maxLocalChars).toBe(600);
  });

  it("buildPrompt interpolates source and target", () => {
    const { prompt } = linkLabelTask.buildPrompt!({
      sourceName: "Comando A",
      sourceType: "Comando",
      targetName: "Evento B",
      targetType: "Evento",
    });
    expect(prompt).toContain("Comando A");
    expect(prompt).toContain("Evento B");
    expect(prompt).toContain("Comando");
    expect(prompt).toContain("Evento");
  });

  it("parse strips quotes, trailing period and lowercases", () => {
    expect(linkLabelTask.parse!('"Publica Evento."')).toBe("publica evento");
    expect(linkLabelTask.parse!("INVOCA")).toBe("invoca");
  });
});

describe("bigPictureDescTask", () => {
  it("has expected id/tier", () => {
    expect(bigPictureDescTask.id).toBe("bigpicture-description");
    expect(bigPictureDescTask.tier).toBe("light");
    expect(bigPictureDescTask.maxLocalChars).toBe(2000);
  });

  it("buildPrompt interpolates resumen", () => {
    const { prompt, system } = bigPictureDescTask.buildPrompt!({
      resumen: "Actor -> Comando -> Evento",
    });
    expect(prompt).toContain("Actor -> Comando -> Evento");
    expect((system as string).length).toBeGreaterThan(0);
  });

  it("parse strips surrounding quotes", () => {
    expect(bigPictureDescTask.parse!('"un resumen"')).toBe("un resumen");
  });
});
