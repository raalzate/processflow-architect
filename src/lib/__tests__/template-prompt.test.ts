import { describe, it, expect } from "vitest";
import {
  promptSummarize,
  SYSTEM_PROMPT_COSMIC,
  SYSTEM_PROMPT_DESIGNER,
  promptDescribeNode,
  promptClassifyType,
  promptSuggestName,
  promptSuggestTags,
  promptSuggestNext,
  promptLinkLabel,
  promptBigPictureDescription,
} from "@/lib/template-prompt";
import type { GraphNode } from "@/lib/types";

// Realistic GraphNode fixture built from the actual exported type.
const makeNode = (overrides: Partial<GraphNode> = {}): GraphNode => ({
  id: "n1",
  nombre: "Registrar Reembolso",
  tipo_elemento: "Comando",
  descripcion: "El usuario solicita un reembolso",
  estado_comparativo: "nuevo",
  ...overrides,
});

describe("promptSummarize", () => {
  it("includes the node tipo_elemento, nombre and descripcion", () => {
    const node = makeNode();
    const out = promptSummarize(node);
    expect(out).toContain("- Tipo: Comando");
    expect(out).toContain("- Nombre: Registrar Reembolso");
    expect(out).toContain("- Descripción: El usuario solicita un reembolso");
  });

  it("includes the analyst framing and COSMIC instructions", () => {
    const out = promptSummarize(makeNode());
    expect(out).toContain("Actúa como un Analista Funcional");
    expect(out).toContain("medición COSMIC");
    expect(out).toContain("movimientos de datos");
  });

  it("uses a '(sin descripción)' fallback when descripcion is absent", () => {
    // descripcion es opcional en GraphNode; el prompt no debe filtrar "undefined".
    const node = makeNode({ descripcion: undefined });
    const out = promptSummarize(node);
    expect(out).toContain("- Descripción: (sin descripción)");
    expect(out).not.toContain("undefined");
  });

  it("returns a non-empty string", () => {
    expect(promptSummarize(makeNode()).length).toBeGreaterThan(0);
  });
});

describe("system prompt constants", () => {
  it("SYSTEM_PROMPT_COSMIC is a stable non-empty string", () => {
    expect(typeof SYSTEM_PROMPT_COSMIC).toBe("string");
    expect(SYSTEM_PROMPT_COSMIC).toContain("asistente técnico conciso");
  });

  it("SYSTEM_PROMPT_DESIGNER is a stable non-empty string", () => {
    expect(typeof SYSTEM_PROMPT_DESIGNER).toBe("string");
    expect(SYSTEM_PROMPT_DESIGNER).toContain("analista de software conciso");
  });
});

describe("promptDescribeNode", () => {
  it("uses the type-specific hint for a known tipo", () => {
    const out = promptDescribeNode("Comando", "Registrar Reembolso", "");
    // Hint for Comando
    expect(out).toContain("una acción o intención que alguien solicita ejecutar (imperativo)");
    expect(out).toContain('El elemento es de tipo "Comando"');
    expect(out).toContain("Nombre: Registrar Reembolso");
  });

  it("falls back to the generic hint for an unknown tipo", () => {
    const out = promptDescribeNode("TipoInexistente", "Algo");
    expect(out).toContain("un elemento del modelo de dominio");
    expect(out).toContain('tipo "TipoInexistente"');
  });

  it("uses the 'improve' task branch when descripcion is provided", () => {
    const out = promptDescribeNode("Evento", "Reembolso Aprobado", "ya fue aprobado");
    expect(out).toContain("Mejora y aclara esta descripción del usuario");
    expect(out).toContain('"ya fue aprobado"');
    expect(out).not.toContain("Escribe una descripción nueva.");
  });

  it("uses the 'new description' branch when descripcion is undefined", () => {
    const out = promptDescribeNode("Evento", "Reembolso Aprobado");
    expect(out).toContain("Escribe una descripción nueva.");
    expect(out).not.toContain("Mejora y aclara");
  });

  it("uses the 'new description' branch when descripcion is empty/whitespace", () => {
    const out = promptDescribeNode("Evento", "Reembolso Aprobado", "   ");
    expect(out).toContain("Escribe una descripción nueva.");
  });

  it("trims the user description before embedding it", () => {
    const out = promptDescribeNode("Actor", "Cliente", "  un cliente  ");
    expect(out).toContain('"un cliente"');
    expect(out).not.toContain('"  un cliente  "');
  });

  it("includes the strict formatting rules", () => {
    const out = promptDescribeNode("Actor", "Cliente");
    expect(out).toContain("UNA sola frase, máximo 22 palabras");
    expect(out).toContain("Sin comillas, sin preámbulos");
  });
});

describe("promptClassifyType", () => {
  const tipos = ["Comando", "Evento", "Actor"] as const;

  it("joins the candidate types with comma+space", () => {
    const out = promptClassifyType("Registrar Reembolso", "el usuario lo solicita", tipos);
    expect(out).toContain("Comando, Evento, Actor");
  });

  it("includes nombre and descripcion", () => {
    const out = promptClassifyType("Registrar Reembolso", "el usuario lo solicita", tipos);
    expect(out).toContain("Nombre: Registrar Reembolso");
    expect(out).toContain("Descripción: el usuario lo solicita");
  });

  it("uses the '(sin descripción)' placeholder for empty descripcion", () => {
    const out = promptClassifyType("Algo", "", tipos);
    expect(out).toContain("Descripción: (sin descripción)");
  });

  it("handles an empty tipos array (joins to empty)", () => {
    const out = promptClassifyType("Algo", "desc", []);
    expect(out).toContain("eligiendo UNO de estos tipos:\n");
    expect(out).toContain("Responde SOLO con el nombre EXACTO del tipo");
  });
});

describe("promptSuggestName", () => {
  it("uses the type hint for a known tipo and embeds descripcion", () => {
    const out = promptSuggestName("Evento", "el reembolso quedó aprobado");
    expect(out).toContain("Tipo: Evento");
    expect(out).toContain("un hecho de negocio relevante que YA ocurrió (tiempo pasado)");
    expect(out).toContain("Descripción: el reembolso quedó aprobado");
  });

  it("falls back to generic hint for unknown tipo", () => {
    const out = promptSuggestName("Desconocido", "algo");
    expect(out).toContain("un elemento del modelo de dominio");
  });

  it("uses placeholder when descripcion is empty", () => {
    const out = promptSuggestName("Comando", "");
    expect(out).toContain("Descripción: (sin descripción)");
  });

  it("includes the ubiquitous-language naming rules", () => {
    const out = promptSuggestName("Comando", "desc");
    expect(out).toContain("Lenguaje Ubicuo");
    expect(out).toContain("Comando en imperativo");
    expect(out).toContain("Evento en pasado");
  });
});

describe("promptSuggestTags", () => {
  it("embeds tipo, nombre and descripcion", () => {
    const out = promptSuggestTags("Repositorio", "ReembolsoRepo", "persiste reembolsos");
    expect(out).toContain("Tipo: Repositorio");
    expect(out).toContain("Nombre: ReembolsoRepo");
    expect(out).toContain("Descripción: persiste reembolsos");
  });

  it("uses placeholder when descripcion is empty", () => {
    const out = promptSuggestTags("Repositorio", "ReembolsoRepo", "");
    expect(out).toContain("Descripción: (sin descripción)");
  });

  it("asks for comma-separated tags only", () => {
    const out = promptSuggestTags("Repositorio", "X", "y");
    expect(out).toContain("separadas por comas");
    expect(out).toContain("2 a 5 tecnologías");
  });
});

describe("promptSuggestNext", () => {
  const tipos = ["Comando", "Evento", "Política", "Read Model"] as const;

  it("embeds the current element fields", () => {
    const out = promptSuggestNext("Comando", "Registrar Reembolso", "solicitud", tipos);
    expect(out).toContain("- Tipo: Comando");
    expect(out).toContain("- Nombre: Registrar Reembolso");
    expect(out).toContain("- Descripción: solicitud");
  });

  it("uses placeholder when descripcion is empty", () => {
    const out = promptSuggestNext("Comando", "X", "", tipos);
    expect(out).toContain("- Descripción: (sin descripción)");
  });

  it("lists the allowed types joined with comma+space", () => {
    const out = promptSuggestNext("Comando", "X", "y", tipos);
    expect(out).toContain("Comando, Evento, Política, Read Model");
  });

  it("specifies the strict output format", () => {
    const out = promptSuggestNext("Comando", "X", "y", tipos);
    expect(out).toContain("TIPO | NOMBRE | RELACION");
    expect(out).toContain("Event Storming");
  });
});

describe("promptLinkLabel", () => {
  it("embeds source and target with their types", () => {
    const out = promptLinkLabel("Cliente", "Actor", "Registrar Reembolso", "Comando");
    expect(out).toContain("Origen: Cliente (Actor)");
    expect(out).toContain("Destino: Registrar Reembolso (Comando)");
  });

  it("asks for a 1-3 word lowercase label", () => {
    const out = promptLinkLabel("A", "Comando", "B", "Evento");
    expect(out).toContain("1 a 3 palabras");
    expect(out).toContain("en minúsculas");
  });

  it("handles empty strings without throwing", () => {
    const out = promptLinkLabel("", "", "", "");
    expect(out).toContain("Origen:  ()");
    expect(out).toContain("Destino:  ()");
  });
});

describe("promptBigPictureDescription", () => {
  it("embeds the provided summary", () => {
    const resumen = "Actor Cliente -> Comando Registrar Reembolso -> Evento Reembolso Aprobado";
    const out = promptBigPictureDescription(resumen);
    expect(out).toContain(resumen);
    expect(out).toContain("Resume en 2 o 3 frases");
    expect(out).toContain("Responde solo el resumen.");
  });

  it("handles an empty summary", () => {
    const out = promptBigPictureDescription("");
    expect(out).toContain("Elementos del diseño:\n");
    expect(out).toContain("Resume en 2 o 3 frases");
  });
});

describe("cross-cutting guarantees", () => {
  it("all builder functions return strings", () => {
    expect(typeof promptSummarize(makeNode())).toBe("string");
    expect(typeof promptDescribeNode("Comando", "x")).toBe("string");
    expect(typeof promptClassifyType("x", "y", ["Comando"])).toBe("string");
    expect(typeof promptSuggestName("Comando", "y")).toBe("string");
    expect(typeof promptSuggestTags("Comando", "x", "y")).toBe("string");
    expect(typeof promptSuggestNext("Comando", "x", "y", ["Comando"])).toBe("string");
    expect(typeof promptLinkLabel("a", "b", "c", "d")).toBe("string");
    expect(typeof promptBigPictureDescription("z")).toBe("string");
  });
});
