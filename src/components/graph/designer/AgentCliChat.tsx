"use client";

/**
 * @fileOverview Tab «Agente» de la ficha: chat con Claude Code o Codex (feature 020, #444).
 *
 * El humano habla con un agente EXTERNO sin salir de la ficha. El CLI corre en
 * el proceso main (`main/services/agent-cli.ts`) con la sesión que el usuario ya
 * tiene en su máquina, conectado al servidor MCP de la app, y restringido a sus
 * tools: lee la caja con `get_focused_element` y escribe con
 * `set_view_element_spec`, así que lo que escribe aparece en el tab Spec sin
 * cerrar nada. Tiene su propio chat chico a propósito: el panel del agente local
 * está atado a su contexto y a su motor.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Send, Square, Wrench } from "lucide-react";
import { IconAction } from "@/components/ui/icon-action";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { focusSystemPrompt } from "@/lib/agent-cli/prompt";
import { CLI_IDS, CLI_INFO, type ChatEvent, type CliId, type CliStatus } from "@/lib/agent-cli/types";
import { MCP_ENABLED_KEY, readMcpPrefs } from "@/lib/mcp-settings";

const CLI_CHOICE_KEY = "agent_cli_choice";

interface ToolCall {
  name: string;
  input: unknown;
  result?: string;
}

interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: ToolCall[];
  error?: string;
  /** Turnos y costo que reporta el CLI al cerrar (H4). */
  meta?: { turns?: number; costUsd?: number };
}

export interface AgentCliChatProps {
  elementName: string;
  viewName: string;
  projectName?: string;
  hasSpec: boolean;
}

const api = () => (typeof window !== "undefined" ? window.electronAPI : undefined);

/** Nombre corto de una tool MCP (`mcp__processflow__get_x` → `get_x`). */
const toolShort = (name: string) => name.replace(/^mcp__[^_]+__/, "").replace(/^[^.]+\./, "");

function ToolLine({ t }: { t: ToolCall }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border bg-muted/40 text-xs">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />
        <code className="truncate">{toolShort(t.name)}</code>
        {t.result === undefined && <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />}
        <ChevronDown className={cn("ml-auto h-3 w-3 transition-transform", open && "rotate-180", t.result === undefined && "ml-1")} />
      </button>
      {open && (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t px-2 py-1 text-2xs text-muted-foreground">
          {JSON.stringify(t.input ?? {}, null, 1)}
          {t.result !== undefined ? `\n→ ${t.result.slice(0, 2000)}` : ""}
        </pre>
      )}
    </div>
  );
}

export function AgentCliChat({ elementName, viewName, projectName, hasSpec }: AgentCliChatProps) {
  const electron = api();
  const [status, setStatus] = useState<CliStatus[] | null>(null);
  const [cli, setCli] = useState<CliId>("claude");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const runIdRef = useRef<string | null>(null);
  const sessionRef = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Qué CLI hay en la máquina, y cuál eligió el humano la última vez.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CLI_CHOICE_KEY) as CliId | null;
      if (saved && CLI_IDS.includes(saved)) setCli(saved);
    } catch {
      /* sin localStorage: Claude Code por defecto */
    }
    electron?.agentCliStatus?.().then(setStatus).catch(() => setStatus([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Otra caja = otra conversación: el contexto del prompt de sistema cambió.
  useEffect(() => {
    sessionRef.current = undefined;
    setMessages([]);
  }, [elementName, viewName]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const instalado = useMemo(() => status?.find((s) => s.cli === cli), [status, cli]);

  const elegir = (c: CliId) => {
    setCli(c);
    sessionRef.current = undefined;
    try {
      window.localStorage.setItem(CLI_CHOICE_KEY, c);
    } catch {
      /* ignore */
    }
  };

  /** Servidor MCP activo (lo enciende si hace falta) y su URL. */
  const mcpUrl = useCallback(async (): Promise<string> => {
    if (!electron?.mcpServerStatus) throw new Error("Sólo disponible en la app de escritorio.");
    let s: { running: boolean; url: string; error?: string } = await electron.mcpServerStatus();
    if (!s.running) {
      const { port } = readMcpPrefs(window.localStorage);
      s = await electron.mcpServerStart(port);
      if (!s.running) throw new Error(s.error || "No se pudo encender el servidor MCP.");
      try {
        window.localStorage.setItem(MCP_ENABLED_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    return s.url;
  }, [electron]);

  const patchLast = (fn: (m: Msg) => Msg) =>
    setMessages((prev) => {
      if (!prev.length) return prev;
      const copia = [...prev];
      copia[copia.length - 1] = fn(copia[copia.length - 1]);
      return copia;
    });

  const aplicar = (e: ChatEvent) => {
    switch (e.type) {
      case "session":
        sessionRef.current = e.sessionId;
        return;
      case "text":
        patchLast((m) => ({ ...m, text: m.text + e.delta }));
        return;
      case "tool_use":
        patchLast((m) => ({ ...m, tools: [...m.tools, { name: e.name, input: e.input }] }));
        return;
      case "tool_result":
        patchLast((m) => {
          const i = m.tools.findIndex((t) => t.result === undefined);
          if (i === -1) return m;
          const tools = [...m.tools];
          tools[i] = { ...tools[i], result: e.text };
          return { ...m, tools };
        });
        return;
      case "result":
        if (e.sessionId) sessionRef.current = e.sessionId;
        patchLast((m) => ({
          ...m,
          // Codex manda el texto completo en `result`; Claude ya lo mandó por deltas.
          text: m.text || e.text,
          meta: { turns: e.turns, costUsd: e.costUsd },
          ...(e.ok ? {} : { error: e.text || "El agente terminó con error." }),
        }));
        return;
      case "error":
        patchLast((m) => ({ ...m, error: [m.error, e.message].filter(Boolean).join("\n") }));
        return;
    }
  };

  const enviar = async () => {
    const texto = input.trim();
    if (!texto || busy || !electron?.agentCliSend) return;
    setInput("");
    setBusy(true);
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    runIdRef.current = runId;
    setMessages((prev) => [
      ...prev,
      { id: `${runId}-u`, role: "user", text: texto, tools: [] },
      { id: `${runId}-a`, role: "assistant", text: "", tools: [] },
    ]);
    const off = electron.onAgentCliEvent(({ runId: id, event }) => {
      if (id === runId) aplicar(event);
    });
    try {
      const url = await mcpUrl();
      await electron.agentCliSend(runId, {
        cli,
        prompt: texto,
        mcpUrl: url,
        systemPrompt: focusSystemPrompt({ elementName, viewName, projectName, hasSpec }),
        sessionId: sessionRef.current,
      });
    } catch (e: any) {
      aplicar({ type: "error", message: String(e?.message ?? e) });
    } finally {
      off();
      runIdRef.current = null;
      setBusy(false);
    }
  };

  const detener = () => {
    const id = runIdRef.current;
    if (id) void electron?.agentCliCancel?.(id);
  };

  // Al desmontar (cerrar la ficha) con el agente trabajando: se cancela.
  useEffect(() => () => detener(), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!electron) {
    return <p className="p-4 text-sm text-muted-foreground">El chat con un agente externo sólo está disponible en la app de escritorio.</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Select value={cli} onValueChange={(v) => elegir(v as CliId)}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CLI_IDS.map((c) => (
              <SelectItem key={c} value={c} className="text-xs">
                {CLI_INFO[c].label}
                {status && !status.find((s) => s.cli === c)?.installed ? " (no instalado)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="truncate text-xs text-muted-foreground">
          {status === null
            ? "Buscando CLI…"
            : instalado?.installed
              ? `${instalado.version ?? "instalado"} · habla de «${elementName}»`
              : `${CLI_INFO[cli].label} no está instalado.`}
        </span>
      </div>

      {status && !instalado?.installed && (
        <div className="m-4 rounded-md border bg-muted/40 p-3 text-sm">
          <p>
            No encontré <code>{CLI_INFO[cli].command}</code> en esta máquina. Instalalo y volvé a abrir la ficha:
          </p>
          <a className="text-primary underline" href={CLI_INFO[cli].installUrl} target="_blank" rel="noreferrer">
            {CLI_INFO[cli].installUrl}
          </a>
          <p className="mt-2 text-xs text-muted-foreground">
            Si ya lo usás en la terminal pero acá no aparece, está fuera de las rutas que la app mira
            (~/.local/bin, /opt/homebrew/bin, /usr/local/bin).
          </p>
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && instalado?.installed && (
          <p className="text-sm text-muted-foreground">
            El agente ya sabe que estás en «{elementName}» ({viewName}). Probá: <em>pulí esta caja</em> o{" "}
            <em>completá la spec con criterios medibles</em>. Te muestra la propuesta antes de escribir.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[92%] space-y-1.5 rounded-lg px-3 py-2 text-sm",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
            >
              {m.tools.map((t, i) => (
                <ToolLine key={i} t={t} />
              ))}
              {m.text && <p className="whitespace-pre-wrap">{m.text}</p>}
              {m.role === "assistant" && !m.text && !m.error && busy && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {m.error && <p className="whitespace-pre-wrap text-xs text-destructive">{m.error}</p>}
              {m.meta && (m.meta.turns !== undefined || m.meta.costUsd !== undefined) && (
                <p className="text-2xs text-muted-foreground">
                  {m.meta.turns !== undefined ? `${m.meta.turns} turno(s)` : ""}
                  {m.meta.costUsd !== undefined ? ` · US$ ${m.meta.costUsd.toFixed(3)}` : ""}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-end gap-2 border-t p-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          placeholder={instalado?.installed ? `Decile a ${CLI_INFO[cli].label} qué hacer con «${elementName}»…` : "Instalá el CLI para chatear"}
          disabled={!instalado?.installed || busy}
          className="min-h-[40px] max-h-32 resize-none text-sm"
          rows={1}
        />
        {busy ? (
          <IconAction type="button" variant="outline" onClick={detener} label="Detener al agente" icon={<Square className="h-4 w-4" />} />
        ) : (
          <IconAction
            type="button"
            onClick={() => void enviar()}
            disabled={!input.trim() || !instalado?.installed}
            label="Enviar (Enter)"
            icon={<Send className="h-4 w-4" />}
          />
        )}
      </div>
    </div>
  );
}
