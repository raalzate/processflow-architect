import { describe, it, expect } from "vitest";
import { buildGenerateLaunch, buildLaunch, claudeMcpConfig, DEFAULT_MAX_TURNS } from "../args";
import { parseLine, resultText, splitLines } from "../parse";
import { focusSystemPrompt } from "../prompt";
import { cliInstalado, estadoCli, publicarEstadoCli, resetEstadoCli } from "../capability";
import { MCP_SERVER_NAME } from "../types";

const base = { prompt: "pulí esta caja", mcpUrl: "http://127.0.0.1:7331/mcp", systemPrompt: "SYS" };

describe("buildLaunch — Claude Code", () => {
  it("lanza headless con stream-json, el MCP de la app inline y sólo sus tools", () => {
    const l = buildLaunch({ cli: "claude", ...base });
    expect(l.command).toBe("claude");
    // #462: el prompt va por STDIN; en los argumentos no aparece (ni tope ni flag).
    expect(l.args[l.args.length - 1]).toBe("-p");
    expect(l.stdin).toBe("pulí esta caja");
    expect(l.args).not.toContain("pulí esta caja");
    expect(l.args).toContain("stream-json");
    expect(l.args).toContain("--include-partial-messages");
    const i = l.args.indexOf("--mcp-config");
    expect(JSON.parse(l.args[i + 1])).toEqual({
      mcpServers: { [MCP_SERVER_NAME]: { type: "http", url: base.mcpUrl } },
    });
    expect(l.args).toContain("--strict-mcp-config");
    expect(l.args[l.args.indexOf("--setting-sources") + 1]).toBe("");
    // #461: allowlist explícita, nunca el comodín del servidor.
    const allowed = l.args.slice(l.args.indexOf("--allowedTools") + 1, l.args.indexOf("--disallowedTools"));
    expect(allowed).toEqual(chatMcpAllowlist());
    expect(l.args).not.toContain(`mcp__${MCP_SERVER_NAME}__*`);
    expect(l.args[l.args.indexOf("--append-system-prompt") + 1]).toBe("SYS");
    expect(l.args[l.args.indexOf("--max-turns") + 1]).toBe(String(DEFAULT_MAX_TURNS));
    expect(l.args).not.toContain("--resume");
  });

  it("con sesión previa reanuda la conversación", () => {
    const l = buildLaunch({ cli: "claude", ...base, sessionId: "abc" });
    expect(l.args[l.args.indexOf("--resume") + 1]).toBe("abc");
    expect(l.args.indexOf("--resume")).toBeLessThan(l.args.indexOf("-p"));
  });

  it("la config MCP es JSON válido con la URL dada", () => {
    expect(JSON.parse(claudeMcpConfig("http://127.0.0.1:9999/mcp")).mcpServers[MCP_SERVER_NAME].url).toBe(
      "http://127.0.0.1:9999/mcp"
    );
  });
});

describe("buildLaunch — Codex", () => {
  it("usa exec --json con el MCP como override de config", () => {
    const l = buildLaunch({ cli: "codex", ...base });
    expect(l.command).toBe("codex");
    expect(l.args[0]).toBe("exec");
    expect(l.args).toContain("--json");
    expect(l.args[l.args.indexOf("-c") + 1]).toBe(`mcp_servers.${MCP_SERVER_NAME}.url="${base.mcpUrl}"`);
    expect(l.args[l.args.length - 1]).toBe("pulí esta caja");
  });

  it("con sesión previa usa exec resume <id>", () => {
    const l = buildLaunch({ cli: "codex", ...base, sessionId: "t1" });
    expect(l.args.slice(0, 3)).toEqual(["exec", "resume", "t1"]);
  });
});

describe("parseLine — Claude Code", () => {
  it("init da la sesión, los deltas dan texto, assistant da tool_use, user da tool_result, result cierra", () => {
    const ev = (o: unknown) => parseLine("claude", JSON.stringify(o));
    expect(ev({ type: "system", subtype: "init", session_id: "s1" })).toEqual([{ type: "session", sessionId: "s1" }]);
    expect(ev({ type: "stream_event", event: { delta: { type: "text_delta", text: "Ho" } } })).toEqual([
      { type: "text", delta: "Ho" },
    ]);
    expect(
      ev({ type: "assistant", message: { content: [{ type: "text", text: "x" }, { type: "tool_use", name: "mcp__processflow__get_focused_element", input: {} }] } })
    ).toEqual([{ type: "tool_use", name: "mcp__processflow__get_focused_element", input: {} }]);
    expect(ev({ type: "user", message: { content: [{ type: "tool_result", content: [{ type: "text", text: "ficha" }] }] } })).toEqual([
      { type: "tool_result", text: "ficha" },
    ]);
    expect(ev({ type: "result", subtype: "success", result: "listo", num_turns: 3, total_cost_usd: 0.4, session_id: "s1" })).toEqual([
      { type: "result", ok: true, text: "listo", turns: 3, costUsd: 0.4, sessionId: "s1" },
    ]);
    expect(ev({ type: "result", subtype: "error_max_turns", is_error: true, result: "" })[0]).toMatchObject({ type: "result", ok: false });
  });

  it("ignora ruido y líneas que no son JSON sin lanzar", () => {
    expect(parseLine("claude", "no es json")).toEqual([]);
    expect(parseLine("claude", JSON.stringify({ type: "rate_limit_event" }))).toEqual([]);
    expect(parseLine("claude", "")).toEqual([]);
  });
});

describe("parseLine — Codex", () => {
  it("thread.started da la sesión, agent_message texto, mcp_tool_call tool_use+result, turn.* cierra", () => {
    const ev = (o: unknown) => parseLine("codex", JSON.stringify(o));
    expect(ev({ type: "thread.started", thread_id: "t1" })).toEqual([{ type: "session", sessionId: "t1" }]);
    expect(ev({ type: "item.completed", item: { type: "agent_message", text: "hola" } })).toEqual([{ type: "text", delta: "hola" }]);
    expect(
      ev({ type: "item.completed", item: { type: "mcp_tool_call", server: "processflow", tool: "get_focused_element", arguments: {}, result: { content: [{ type: "text", text: "ficha" }] } } })
    ).toEqual([
      { type: "tool_use", name: "processflow.get_focused_element", input: {} },
      { type: "tool_result", text: "ficha" },
    ]);
    expect(ev({ type: "turn.completed" })).toEqual([{ type: "result", ok: true, text: "" }]);
    expect(ev({ type: "turn.failed", error: { message: "boom" } })).toEqual([{ type: "result", ok: false, text: "boom" }]);
    expect(ev({ type: "error", message: "sin sesión" })).toEqual([{ type: "error", message: "sin sesión" }]);
  });
});

// Feature 021: el CLI como generador de texto para el router (razona el CLI, actúa la app).
describe("buildGenerateLaunch", () => {
  it("Claude: un turno, sin tools, sin MCP, sin persistir sesión, con prompt de sistema", () => {
    const l = buildGenerateLaunch({ cli: "claude", prompt: "P", system: "S" });
    expect(l.command).toBe("claude");
    expect(l.args[l.args.length - 1]).toBe("-p");
    expect(l.stdin).toBe("P");
    // #462: stream-json para medir inactividad y leer el costo del `result`.
    expect(l.args[l.args.indexOf("--output-format") + 1]).toBe("stream-json");
    expect(l.args).toContain("--verbose");
    expect(l.args[l.args.indexOf("--max-turns") + 1]).toBe("1");
    expect(l.args[l.args.indexOf("--tools") + 1]).toBe("");
    expect(JSON.parse(l.args[l.args.indexOf("--mcp-config") + 1])).toEqual({ mcpServers: {} });
    expect(l.args).toContain("--strict-mcp-config");
    expect(l.args).toContain("--no-session-persistence");
    // Sin hooks ni ajustes del repo del usuario: forzaban un 2º turno (error_max_turns).
    expect(l.args[l.args.indexOf("--setting-sources") + 1]).toBe("");
    expect(l.args[l.args.indexOf("--append-system-prompt") + 1]).toBe("S");
    expect(buildGenerateLaunch({ cli: "claude", prompt: "P" }).args).not.toContain("--append-system-prompt");
  });

  it("Codex: exec --json con el sistema dentro del mensaje", () => {
    const l = buildGenerateLaunch({ cli: "codex", prompt: "P", system: "S" });
    expect(l.command).toBe("codex");
    expect(l.args.slice(0, 2)).toEqual(["exec", "--json"]);
    expect(l.args[l.args.length - 1]).toContain("S");
    expect(l.args[l.args.length - 1]).toContain("P");
  });
});

describe("resultText", () => {
  it("Claude: toma `result` del JSON (aunque venga en varias líneas) y el error cuando no fue éxito", () => {
    expect(resultText("claude", '{\n  "type": "result",\n  "subtype": "success",\n  "result": " OK "\n}\n')).toEqual({ text: "OK" });
    expect(resultText("claude", JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true, result: "" }))).toEqual({
      error: "Claude Code terminó con error_max_turns.",
    });
    expect(resultText("claude", "")).toEqual({ error: "Claude Code no devolvió una respuesta." });
    expect(resultText("claude", "{no json")).toEqual({ error: "La respuesta de Claude Code no es JSON." });
  });

  it("Codex: junta los agent_message y reporta el error del turno", () => {
    const ok = [
      JSON.stringify({ type: "thread.started", thread_id: "t" }),
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Hola" } }),
      JSON.stringify({ type: "turn.completed" }),
    ].join("\n");
    expect(resultText("codex", ok)).toEqual({ text: "Hola" });
    expect(resultText("codex", JSON.stringify({ type: "turn.failed", error: { message: "boom" } }))).toEqual({ error: "boom" });
  });
});

describe("capability", () => {
  it("sin publicar no afirma nada; publicado dice qué CLI hay", () => {
    resetEstadoCli();
    expect(estadoCli()).toBeNull();
    expect(cliInstalado("claude")).toBe(false);
    publicarEstadoCli([{ cli: "claude", installed: true, version: "2" }, { cli: "codex", installed: false }]);
    expect(cliInstalado("claude")).toBe(true);
    expect(cliInstalado("codex")).toBe(false);
    resetEstadoCli();
  });
});

describe("splitLines", () => {
  it("devuelve las líneas completas y guarda el trozo cortado", () => {
    const a = splitLines("", '{"a":1}\n{"b":');
    expect(a.lines).toEqual(['{"a":1}']);
    expect(a.rest).toBe('{"b":');
    const b = splitLines(a.rest, '2}\n');
    expect(b.lines).toEqual(['{"b":2}']);
    expect(b.rest).toBe("");
  });
});

describe("focusSystemPrompt", () => {
  it("nombra la caja, la vista, las tools del MCP y exige proponer antes de escribir", () => {
    const p = focusSystemPrompt({ elementName: "RabbitMQ", viewName: "Modelo", projectName: "Demo", hasSpec: true });
    expect(p).toContain('"RabbitMQ"');
    expect(p).toContain('"Modelo"');
    expect(p).toContain('"Demo"');
    expect(p).toContain(`mcp__${MCP_SERVER_NAME}__get_focused_element`);
    expect(p).toContain(`mcp__${MCP_SERVER_NAME}__set_view_element_spec`);
    expect(p).toContain("merge: true");
    expect(p).toContain("needsClarification");
    expect(p.indexOf("propuesta")).toBeGreaterThan(-1);
    expect(p).toContain("no exportes");
  });

  it("sin spec previa no pide merge", () => {
    expect(focusSystemPrompt({ elementName: "A", viewName: "V", hasSpec: false })).not.toContain("merge: true");
  });
});

// #459: sin Claude Code ni Codex, el chat cae a la IA de la app.
import { CHAT_ENGINES, engineLabel, fallbackNotice, resolveChatEngine } from "../engine";

describe("resolveChatEngine", () => {
  const claudeSi = [{ cli: "claude" as const, installed: true }, { cli: "codex" as const, installed: false }];
  const ninguno = [{ cli: "claude" as const, installed: false }, { cli: "codex" as const, installed: false }];

  it("respeta el CLI instalado y la elección de la IA de la app", () => {
    expect(resolveChatEngine("claude", claudeSi)).toEqual({ engine: "claude", fallback: false });
    expect(resolveChatEngine("app", ninguno)).toEqual({ engine: "app", fallback: false });
  });

  it("un CLI que no está cae a la IA de la app y lo declara", () => {
    expect(resolveChatEngine("codex", claudeSi)).toEqual({ engine: "app", fallback: true });
    expect(resolveChatEngine("claude", ninguno)).toEqual({ engine: "app", fallback: true });
    expect(fallbackNotice("claude")).toMatch(/Claude Code no está instalado.*IA de la app/);
  });

  it("sin saber qué hay todavía, no cae (el selector no parpadea al abrir)", () => {
    expect(resolveChatEngine("claude", null)).toEqual({ engine: "claude", fallback: false });
  });

  it("ofrece los dos CLI y la IA de la app con su nombre", () => {
    expect(CHAT_ENGINES).toEqual(["claude", "codex", "app"]);
    expect(CHAT_ENGINES.map(engineLabel)).toEqual(["Claude Code", "Codex", "IA de la app"]);
  });
});

// #460: carpetas adjuntas como contexto, sólo lectura.
import { carpetasValidas, DENIED_TOOLS, READ_ONLY_TOOLS } from "../args";

describe("carpetas adjuntas", () => {
  const conCarpeta = { ...base, dirs: ["/Users/u/repo", "/Users/u/docs"] };

  it("Claude: cada carpeta con su --add-dir y herramientas de lectura; escribir y ejecutar denegados", () => {
    const l = buildLaunch({ cli: "claude", ...conCarpeta });
    const i = l.args.indexOf("--add-dir");
    expect(l.args.slice(i, i + 4)).toEqual(["--add-dir", "/Users/u/repo", "--add-dir", "/Users/u/docs"]);
    const allowed = l.args.slice(l.args.indexOf("--allowedTools") + 1, l.args.indexOf("--disallowedTools"));
    expect(allowed).toEqual([...chatMcpAllowlist(), ...READ_ONLY_TOOLS]);
    const denied = l.args.slice(l.args.indexOf("--disallowedTools") + 1, l.args.indexOf("--append-system-prompt"));
    expect(denied).toEqual([...DENIED_TOOLS]);
  });

  it("sin carpetas no hay --add-dir ni herramientas de lectura, pero escribir sigue denegado", () => {
    const l = buildLaunch({ cli: "claude", ...base });
    expect(l.args).not.toContain("--add-dir");
    expect(l.args).not.toContain("Read");
    expect(l.args).toContain("--disallowedTools");
  });

  it("Codex: la primera carpeta es su directorio, en sandbox de sólo lectura", () => {
    const l = buildLaunch({ cli: "codex", ...conCarpeta });
    expect(l.args[l.args.indexOf("-C") + 1]).toBe("/Users/u/repo");
    expect(l.args[l.args.indexOf("--sandbox") + 1]).toBe("read-only");
  });

  it("descarta rutas relativas, las que parecen flags y las repetidas", () => {
    expect(carpetasValidas(["docs", "-rf", " /a ", "/a", "C:\\proy"])).toEqual(["/a", "C:\\proy"]);
    expect(carpetasValidas(undefined)).toEqual([]);
  });

  it("el prompt nombra las carpetas, pide citar el archivo y prohíbe escribir", () => {
    const p = focusSystemPrompt({ elementName: "A", viewName: "V", hasSpec: false, dirs: ["/Users/u/repo"] });
    expect(p).toContain('"/Users/u/repo"');
    expect(p).toMatch(/sólo lectura/);
    expect(p).toMatch(/citá el archivo/);
    expect(focusSystemPrompt({ elementName: "A", viewName: "V", hasSpec: false })).not.toMatch(/carpetas adjuntas/);
  });
});

import { nombreCarpeta } from "../engine";

describe("nombreCarpeta", () => {
  it("muestra la última parte de la ruta, en macOS/Linux y en Windows", () => {
    expect(nombreCarpeta("/Users/u/proyectos/pagos-svc")).toBe("pagos-svc");
    expect(nombreCarpeta("/Users/u/docs/")).toBe("docs");
    expect(nombreCarpeta("C:\\proy\\api")).toBe("api");
    expect(nombreCarpeta("/")).toBe("/");
  });
});

// #461: bloqueantes de la validación previa a la entrega.
import { chatMcpAllowlist, CHAT_MCP_TOOLS } from "../args";
import { validarGenerate, validarLaunch } from "../validate";

describe("#461/#462 — un prompt que empieza con «-» nunca es un flag", () => {
  for (const prompt of ["- agregá un criterio", "--permission-mode=bypassPermissions", "--add-dir=/"]) {
    it(`«${prompt}»: Claude lo recibe por stdin y Codex detrás de \`--\``, () => {
      for (const l of [buildLaunch({ cli: "claude", ...base, prompt }), buildGenerateLaunch({ cli: "claude", prompt })]) {
        expect(l.stdin).toBe(prompt);
        expect(l.args).not.toContain(prompt);
      }
      for (const l of [
        buildLaunch({ cli: "codex", ...base, prompt }),
        buildLaunch({ cli: "codex", ...base, prompt, sessionId: "s1" }),
      ]) {
        const fin = l.args.indexOf("--");
        expect(fin).toBeGreaterThan(-1);
        expect(l.args.slice(fin + 1)).toEqual([prompt]);
        expect(l.args.slice(0, fin)).not.toContain(prompt);
      }
    });
  }

  it("un prompt enorme no viaja por argv (tope de Linux/Windows)", () => {
    const enorme = "x".repeat(300_000);
    const l = buildGenerateLaunch({ cli: "claude", prompt: enorme, system: "S" });
    expect(Math.max(...l.args.map((a) => a.length))).toBeLessThan(32_000);
    expect(l.stdin?.length).toBe(300_000);
  });
});

describe("#461 — el chat sólo puede usar tools no destructivas del MCP", () => {
  it("la allowlist no incluye nada que borre o reemplace", () => {
    for (const t of ["delete_view", "set_view_graph", "remove_view_element", "remove_view_edge", "delete_org", "install_skill", "export_to_app", "rename_view"]) {
      expect(CHAT_MCP_TOOLS as readonly string[]).not.toContain(t);
    }
    expect(CHAT_MCP_TOOLS).toContain("set_view_element_spec");
    expect(chatMcpAllowlist().every((t) => t.startsWith(`mcp__${MCP_SERVER_NAME}__`) && !t.endsWith("*"))).toBe(true);
  });
});

describe("#461 — validación de lo que llega por IPC", () => {
  const ok = { cli: "claude", prompt: "hola", mcpUrl: "http://127.0.0.1:7331/mcp", systemPrompt: "S" };

  it("acepta la entrada de la app", () => {
    expect(validarLaunch(ok).ok).toBe(true);
    expect(validarLaunch({ ...ok, sessionId: "1a5a06c0-a512-4351", dirs: ["/a"], maxTurns: 25 }).ok).toBe(true);
    expect(validarGenerate({ cli: "codex", prompt: "p", system: "s" }).ok).toBe(true);
  });

  it("rechaza agente desconocido, URL ajena o inyectable, sesión rara y carpetas mal formadas", () => {
    const casos: [Record<string, unknown>, RegExp][] = [
      [{ ...ok, cli: "bash" }, /desconocido/],
      [{ ...ok, prompt: "  " }, /vacío/],
      [{ ...ok, mcpUrl: "http://evil.com/mcp" }, /no es la de la app/],
      [{ ...ok, mcpUrl: 'http://127.0.0.1:7331/mcp" -c x="y' }, /no es la de la app/],
      [{ ...ok, mcpUrl: "http://127.0.0.1:80/mcp" }, /fuera de rango/],
      [{ ...ok, sessionId: "a b" }, /sesión/],
      [{ ...ok, sessionId: "--fork-session" }, /sesión/],
      [{ ...ok, dirs: "/a" }, /carpetas/],
      [{ ...ok, maxTurns: 999 }, /turnos/],
    ];
    for (const [entrada, error] of casos) {
      const r = validarLaunch(entrada);
      expect(r.ok, JSON.stringify(entrada)).toBe(false);
      if (!r.ok) expect(r.error).toMatch(error);
    }
    expect(validarGenerate({ cli: "x", prompt: "p" }).ok).toBe(false);
    expect(validarGenerate(null).ok).toBe(false);
  });
});

describe("#461 — el agente escribe la spec por id, no por nombre", () => {
  it("con id, set_view_element_spec usa el id; sin id, cae al nombre", () => {
    const conId = focusSystemPrompt({ elementName: "RabbitMQ", elementId: "mq", viewName: "V", hasSpec: false });
    expect(conId).toContain('set_view_element_spec con name "mq"');
    expect(conId).toContain('"RabbitMQ"');
    expect(focusSystemPrompt({ elementName: "RabbitMQ", viewName: "V", hasSpec: false })).toContain('name "RabbitMQ"');
  });
});

// #461 (segunda revisión): Codex no tiene barrera de herramientas verificada.
import { engineHabilitado, CHAT_CLIS_HABILITADOS } from "../engine";

describe("#461 — Codex deshabilitado en el chat hasta verificar su barrera", () => {
  it("aunque esté instalado, cae a la IA de la app y lo explica", () => {
    const ambos = [{ cli: "claude" as const, installed: true }, { cli: "codex" as const, installed: true }];
    expect(CHAT_CLIS_HABILITADOS).toEqual(["claude"]);
    expect(engineHabilitado("codex")).toBe(false);
    expect(engineHabilitado("claude")).toBe(true);
    expect(engineHabilitado("app")).toBe(true);
    expect(resolveChatEngine("codex", ambos)).toEqual({ engine: "app", fallback: true });
    expect(resolveChatEngine("codex", null)).toEqual({ engine: "app", fallback: true });
    expect(fallbackNotice("codex")).toMatch(/Codex todavía no está habilitado/);
    expect(fallbackNotice("claude")).toMatch(/no está instalado/);
  });
});

// #462: el modo texto puro usa stream-json — varios eventos y el `result` al final, con costo.
describe("resultText con stream-json", () => {
  it("toma el ÚLTIMO result de un stream de eventos, con su costo", () => {
    const stream = [
      JSON.stringify({ type: "system", subtype: "init", session_id: "s" }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "ho" }] } }),
      JSON.stringify({ type: "result", subtype: "success", result: " Hola ", total_cost_usd: 0.11 }),
      "",
    ].join("\n");
    expect(resultText("claude", stream)).toEqual({ text: "Hola", costUsd: 0.11 });
  });

  it("un result de error trae el motivo y el costo gastado igual", () => {
    const s = JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true, result: "", total_cost_usd: 0.2 });
    expect(resultText("claude", s)).toEqual({ error: "Claude Code terminó con error_max_turns.", costUsd: 0.2 });
  });
});
