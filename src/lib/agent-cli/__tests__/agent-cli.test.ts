import { describe, it, expect } from "vitest";
import { buildLaunch, claudeMcpConfig, DEFAULT_MAX_TURNS } from "../args";
import { parseLine, splitLines } from "../parse";
import { focusSystemPrompt } from "../prompt";
import { MCP_SERVER_NAME } from "../types";

const base = { prompt: "pulí esta caja", mcpUrl: "http://127.0.0.1:7331/mcp", systemPrompt: "SYS" };

describe("buildLaunch — Claude Code", () => {
  it("lanza headless con stream-json, el MCP de la app inline y sólo sus tools", () => {
    const l = buildLaunch({ cli: "claude", ...base });
    expect(l.command).toBe("claude");
    expect(l.args.slice(0, 2)).toEqual(["-p", "pulí esta caja"]);
    expect(l.args).toContain("stream-json");
    expect(l.args).toContain("--include-partial-messages");
    const i = l.args.indexOf("--mcp-config");
    expect(JSON.parse(l.args[i + 1])).toEqual({
      mcpServers: { [MCP_SERVER_NAME]: { type: "http", url: base.mcpUrl } },
    });
    expect(l.args).toContain("--strict-mcp-config");
    expect(l.args[l.args.indexOf("--allowedTools") + 1]).toBe(`mcp__${MCP_SERVER_NAME}__*`);
    expect(l.args[l.args.indexOf("--append-system-prompt") + 1]).toBe("SYS");
    expect(l.args[l.args.indexOf("--max-turns") + 1]).toBe(String(DEFAULT_MAX_TURNS));
    expect(l.args).not.toContain("--resume");
  });

  it("con sesión previa reanuda la conversación", () => {
    const l = buildLaunch({ cli: "claude", ...base, sessionId: "abc" });
    expect(l.args.slice(-2)).toEqual(["--resume", "abc"]);
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
