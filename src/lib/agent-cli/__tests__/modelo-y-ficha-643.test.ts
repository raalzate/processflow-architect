/**
 * #643: el chat de la ficha elige MODELO y puede pulir la caja entera
 * (tecnologías, icono, referencias), no sólo su spec.
 */
import { describe, expect, it } from "vitest";
import { buildLaunch, CHAT_MCP_TOOLS } from "../args";
import { focusSystemPrompt } from "../prompt";
import { CLI_MODELOS, esModeloDe } from "../types";
import { validarLaunch } from "../validate";

const base = { prompt: "pulí esta caja", mcpUrl: "http://127.0.0.1:7331/mcp", systemPrompt: "SYS" };

describe("modelo del chat", () => {
  it("con modelo elegido, Claude recibe --model antes de -p", () => {
    const l = buildLaunch({ cli: "claude", ...base, model: "opus" });
    const i = l.args.indexOf("--model");
    expect(l.args[i + 1]).toBe("opus");
    expect(i).toBeLessThan(l.args.indexOf("-p"));
  });

  it("sin modelo no se manda --model: decide la configuración del usuario", () => {
    expect(buildLaunch({ cli: "claude", ...base }).args).not.toContain("--model");
  });

  it("Codex recibe el modelo con -m, antes del prompt", () => {
    const l = buildLaunch({ cli: "codex", ...base, model: "gpt-x" });
    expect(l.args.indexOf("-m")).toBeLessThan(l.args.indexOf("--"));
  });

  it("la lista ofrece el predeterminado y los alias de Claude", () => {
    expect(CLI_MODELOS.claude.map((m) => m.id)).toEqual(["", "sonnet", "opus", "haiku"]);
    expect(esModeloDe("claude", "sonnet")).toBe(true);
    expect(esModeloDe("claude", "gpt-4o")).toBe(false);
  });

  it("validarLaunch sólo deja pasar modelos de la lista (nada de flags colados)", () => {
    const ok = { cli: "claude", ...base };
    expect(validarLaunch({ ...ok, model: "haiku" }).ok).toBe(true);
    expect(validarLaunch(ok).ok).toBe(true);
    expect(validarLaunch({ ...ok, model: "--dangerously-skip-permissions" }).ok).toBe(false);
    expect(validarLaunch({ ...ok, model: "" }).ok).toBe(false);
    expect(validarLaunch({ ...ok, model: 3 }).ok).toBe(false);
  });
});

describe("el chat pule la caja, no sólo la spec", () => {
  it("puede actualizar el elemento y buscar iconos, pero sigue sin borrar", () => {
    expect(CHAT_MCP_TOOLS).toContain("update_view_element");
    expect(CHAT_MCP_TOOLS).toContain("list_icons");
    expect(CHAT_MCP_TOOLS as readonly string[]).not.toContain("remove_view_element");
  });

  it("el prompt le dice qué propiedades pedir según el tipo y con qué id escribir", () => {
    const p = focusSystemPrompt({ elementName: "sre.db", elementId: "n-7", viewName: "C4", hasSpec: false });
    expect(p).toContain("update_view_element");
    expect(p).toMatch(/base de datos: puerto, motor, esquema/);
    expect(p).toMatch(/no tiene repo/);
    expect(p).toContain('name "n-7"');
  });
});
