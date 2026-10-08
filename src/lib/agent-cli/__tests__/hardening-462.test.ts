/**
 * #462: endurecimiento del chat del agente por CLI (riesgos de seguimiento).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_COST_CAP_USD,
  dentroDelTope,
  formatoUsd,
  gastoSesion,
  guardarTope,
  leerTope,
  mensajeTope,
  resetGasto,
  sumarGasto,
} from "../cost";
import { parseAuthStatus, rutaDesdeShell } from "../status";
import { aplicarEvento, sesionDeEvento, type ChatMsg } from "../chat-state";
import { validarLaunch } from "../validate";
import { hostPermitido } from "../../mcp/host-guard";
import { alcanceDeUrl, errorDeAlcance, urlConAlcance } from "../../mcp/focus-scope";

const memoria = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("tope de gasto del CLI", () => {
  beforeEach(() => resetGasto());

  it("acumula sólo costos válidos", () => {
    sumarGasto(0.1);
    sumarGasto(0.25);
    for (const basura of [-1, NaN, Infinity, "0.3", undefined, 0]) sumarGasto(basura);
    expect(gastoSesion()).toBeCloseTo(0.35);
  });

  it("el tope por defecto existe, se puede cambiar o desactivar, y uno ilegible vuelve al defecto", () => {
    const s = memoria();
    expect(leerTope(s)).toBe(DEFAULT_COST_CAP_USD);
    guardarTope(s, 1.5);
    expect(leerTope(s)).toBe(1.5);
    guardarTope(s, null);
    expect(leerTope(s)).toBeNull();
    s.setItem("agent_cli_cost_cap", "abc");
    expect(leerTope(s)).toBe(DEFAULT_COST_CAP_USD);
    expect(leerTope(undefined)).toBe(DEFAULT_COST_CAP_USD);
  });

  it("frena al llegar al tope, nunca sin tope, y lo explica", () => {
    expect(dentroDelTope(4.99, 5)).toBe(true);
    expect(dentroDelTope(5, 5)).toBe(false);
    expect(dentroDelTope(999, null)).toBe(true);
    expect(mensajeTope(5.02, 5)).toMatch(/US\$ 5\.02 de US\$ 5\.00.*Ajustes/);
    expect(formatoUsd(0.1)).toBe("US$ 0.10");
  });
});

describe("estado del CLI", () => {
  it("lee loggedIn de `claude auth status`", () => {
    expect(parseAuthStatus('{"loggedIn": true, "authMethod": "claude.ai"}')).toBe(true);
    expect(parseAuthStatus('aviso\n{"loggedIn": false}')).toBe(false);
    expect(parseAuthStatus("no es json")).toBeUndefined();
    expect(parseAuthStatus('{"otro": 1}')).toBeUndefined();
  });

  it("toma la ruta de la shell de login aunque haya ruido antes", () => {
    expect(rutaDesdeShell("Now using node v20\n/Users/u/.nvm/versions/node/v20/bin/claude\n", "claude")).toBe(
      "/Users/u/.nvm/versions/node/v20/bin/claude"
    );
    expect(rutaDesdeShell("claude: aliased to foo", "claude")).toBeNull();
    expect(rutaDesdeShell("/usr/bin/claudette", "claude")).toBeNull();
    expect(rutaDesdeShell("", "claude")).toBeNull();
  });
});

describe("hilo del chat (antes vivía sin test dentro del componente)", () => {
  const hilo = (): ChatMsg[] => [
    { id: "u", role: "user", text: "hola", tools: [] },
    { id: "a", role: "assistant", text: "", tools: [] },
  ];

  it("texto, tools en orden con su resultado, cierre con costo y error acumulado", () => {
    let m = hilo();
    m = aplicarEvento(m, { type: "text", delta: "Ho" });
    m = aplicarEvento(m, { type: "text", delta: "la" });
    m = aplicarEvento(m, { type: "tool_use", name: "a", input: {} });
    m = aplicarEvento(m, { type: "tool_use", name: "b", input: {} });
    m = aplicarEvento(m, { type: "tool_result", text: "ra" });
    m = aplicarEvento(m, { type: "result", ok: true, text: "", turns: 2, costUsd: 0.1 });
    const a = m[1];
    expect(a.text).toBe("Hola");
    expect(a.tools.map((t) => t.result)).toEqual(["ra", undefined]);
    expect(a.meta).toEqual({ turns: 2, costUsd: 0.1 });
    m = aplicarEvento(m, { type: "error", message: "x" });
    m = aplicarEvento(m, { type: "error", message: "y" });
    expect(m[1].error).toBe("x\ny");
    expect(m[0]).toEqual(hilo()[0]);
  });

  it("un result de Codex trae el texto entero; uno fallido deja el error", () => {
    const ok = aplicarEvento(hilo(), { type: "result", ok: true, text: "todo" });
    expect(ok[1].text).toBe("todo");
    const mal = aplicarEvento(hilo(), { type: "result", ok: false, text: "" });
    expect(mal[1].error).toMatch(/error/);
  });

  it("sin mensajes o con un evento de sesión, el hilo no cambia; la sesión se lee aparte", () => {
    expect(aplicarEvento([], { type: "text", delta: "x" })).toEqual([]);
    const h = hilo();
    expect(aplicarEvento(h, { type: "session", sessionId: "s" })).toBe(h);
    expect(sesionDeEvento({ type: "session", sessionId: "s" })).toBe("s");
    expect(sesionDeEvento({ type: "result", ok: true, text: "", sessionId: "r" })).toBe("r");
    expect(sesionDeEvento({ type: "text", delta: "" })).toBeUndefined();
  });
});

describe("validación más estricta del IPC", () => {
  const ok = { cli: "claude", prompt: "p", mcpUrl: "http://127.0.0.1:7331/mcp", systemPrompt: "S" };

  it("maxTurns tiene que ser entero", () => {
    expect(validarLaunch({ ...ok, maxTurns: 2.5 }).ok).toBe(false);
    expect(validarLaunch({ ...ok, maxTurns: 3 }).ok).toBe(true);
  });

  it("la URL admite el alcance de la caja, pero sólo con caracteres seguros", () => {
    expect(validarLaunch({ ...ok, mcpUrl: "http://127.0.0.1:7331/mcp?focus=agg-Pedidos%20v2" }).ok).toBe(true);
    expect(validarLaunch({ ...ok, mcpUrl: 'http://127.0.0.1:7331/mcp?focus=a"b' }).ok).toBe(false);
    expect(validarLaunch({ ...ok, mcpUrl: "http://127.0.0.1:7331/mcp?otro=1" }).ok).toBe(false);
  });

  it("con registro, sólo pasan las carpetas que emitió el selector nativo", () => {
    const permitidas = new Set(["/Users/u/repo"]);
    expect(validarLaunch({ ...ok, dirs: ["/Users/u/repo"] }, permitidas).ok).toBe(true);
    const r = validarLaunch({ ...ok, dirs: ["/Users/u/repo", "/"] }, permitidas);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/«\/».*Adjuntar carpeta/);
  });
});

describe("servidor MCP contra DNS rebinding", () => {
  it("sólo acepta el Host del servidor local en su puerto", () => {
    for (const h of ["127.0.0.1:7331", "localhost:7331", "LOCALHOST:7331", "[::1]:7331"]) expect(hostPermitido(h, 7331)).toBe(true);
    for (const h of ["evil.com", "evil.com:7331", "127.0.0.1:8080", "127.0.0.1", undefined, ""]) {
      expect(hostPermitido(h as string | undefined, 7331)).toBe(false);
    }
  });
});

describe("alcance del chat a la caja abierta", () => {
  it("la URL lleva el id codificado y se lee de vuelta", () => {
    const u = urlConAlcance("http://127.0.0.1:7331/mcp", "agg-Pedidos v2");
    expect(u).toBe("http://127.0.0.1:7331/mcp?focus=agg-Pedidos+v2");
    expect(alcanceDeUrl(new URL(u))).toBe("agg-Pedidos v2");
    expect(alcanceDeUrl(new URL("http://127.0.0.1:7331/mcp"))).toBeNull();
  });

  it("con alcance, sólo la caja abierta y en la vista abierta; sin alcance, todo como antes", () => {
    expect(errorDeAlcance("mq", "mq", undefined)).toBeNull();
    expect(errorDeAlcance("mq", "API de Pagos", undefined)).toMatch(/sólo puede escribir la spec de la caja abierta/);
    expect(errorDeAlcance("mq", "mq", "Otra vista")).toMatch(/no pases `view`/);
    expect(errorDeAlcance(null, "cualquiera", "cualquiera")).toBeNull();
  });
});
