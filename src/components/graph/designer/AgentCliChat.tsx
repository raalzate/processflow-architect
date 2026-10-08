"use client";

/**
 * @fileOverview Tab «Agente» de la ficha: chat sobre la caja abierta (feature 020, #444 · #459).
 *
 * Tres motores:
 *  - Claude Code / Codex: agente EXTERNO. El CLI corre en el proceso main
 *    (`main/services/agent-cli.ts`) con la sesión del usuario, conectado al MCP
 *    de la app y restringido a sus tools: lee la caja con `get_focused_element`
 *    y escribe con `set_view_element_spec`, así que lo que escribe aparece en el
 *    tab Spec sin cerrar nada.
 *  - IA de la app (#459): el motor de Ajustes vía `elementChatTask`. No tiene
 *    tools: razona sobre la ficha que le pasa la app y contesta; lo que propone
 *    lo aplica el humano. Es la caída automática cuando el CLI elegido no está.
 *
 * Tiene su propio chat chico a propósito: el panel del agente local está atado a
 * su contexto y a su motor.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Folder, FolderPlus, Loader2, Send, Square, Trash2, Wrench, X } from "lucide-react";
import { IconAction } from "@/components/ui/icon-action";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/ai-panel/Markdown";
import { AiProvenanceBadge } from "@/components/ai-panel/AiProvenanceBadge";
import { useAi } from "@/hooks/useAi";
import { elementChatTask } from "@/lib/ai/tasks";
import { focusSystemPrompt } from "@/lib/agent-cli/prompt";
import { CLI_INFO, type ChatEvent, type CliStatus } from "@/lib/agent-cli/types";
import {
  CHAT_ENGINES,
  engineLabel,
  esCli,
  fallbackNotice,
  nombreCarpeta,
  resolveChatEngine,
  type ChatEngine,
} from "@/lib/agent-cli/engine";
import { MCP_ENABLED_KEY, readMcpPrefs } from "@/lib/mcp-settings";

const CLI_CHOICE_KEY = "agent_cli_choice";
/** Carpetas de contexto adjuntas (#460): se recuerdan entre fichas y sesiones. */
const CLI_DIRS_KEY = "agent_cli_dirs";

function leerCarpetas(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(CLI_DIRS_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

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
  /** Turnos y costo que reporta el CLI al cerrar. */
  meta?: { turns?: number; costUsd?: number };
}

export interface AgentCliChatProps {
  elementName: string;
  viewName: string;
  projectName?: string;
  hasSpec: boolean;
  /** Ficha de la caja para la IA de la app, que no tiene tools para leerla (#459). */
  elementType?: string;
  description?: string;
  specMarkdown?: string;
  incoming?: string[];
  outgoing?: string[];
  notation?: string;
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

export function AgentCliChat(props: AgentCliChatProps) {
  const { elementName, viewName, projectName, hasSpec } = props;
  const electron = api();
  const { run: runAi } = useAi();
  const [status, setStatus] = useState<CliStatus[] | null>(null);
  const [elegido, setElegido] = useState<ChatEngine>("claude");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirs, setDirs] = useState<string[]>([]);
  const runIdRef = useRef<string | null>(null);
  const sessionRef = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Qué CLI hay en la máquina, y qué motor eligió el humano la última vez.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CLI_CHOICE_KEY) as ChatEngine | null;
      if (saved && CHAT_ENGINES.includes(saved)) setElegido(saved);
    } catch {
      /* sin localStorage: Claude Code por defecto */
    }
    setDirs(leerCarpetas());
    if (electron?.agentCliStatus) electron.agentCliStatus().then(setStatus).catch(() => setStatus([]));
    // Sin Electron no hay CLI: se sabe ya, y el chat cae a la IA de la app.
    else setStatus([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { engine, fallback } = useMemo(() => resolveChatEngine(elegido, status), [elegido, status]);
  const version = useMemo(() => (esCli(engine) ? status?.find((s) => s.cli === engine)?.version : undefined), [engine, status]);

  /** Empezar de cero: sin mensajes ni sesión del CLI (el agente olvida lo hablado). */
  const nuevaConversacion = useCallback(() => {
    sessionRef.current = undefined;
    setMessages([]);
  }, []);

  // Otra caja = otra conversación: el contexto del prompt de sistema cambió.
  useEffect(() => nuevaConversacion(), [elementName, viewName, nuevaConversacion]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const elegir = (e: ChatEngine) => {
    setElegido(e);
    sessionRef.current = undefined;
    try {
      window.localStorage.setItem(CLI_CHOICE_KEY, e);
    } catch {
      /* ignore */
    }
  };

  const guardarCarpetas = (siguiente: string[]) => {
    setDirs(siguiente);
    try {
      window.localStorage.setItem(CLI_DIRS_KEY, JSON.stringify(siguiente));
    } catch {
      /* sin localStorage valen para esta sesión */
    }
  };

  /** Selector nativo de carpetas (#460): nunca se escribe una ruta a mano. */
  const adjuntarCarpeta = async () => {
    const ruta = await electron?.agentCliPickDir?.();
    if (ruta && !dirs.includes(ruta)) guardarCarpetas([...dirs, ruta]);
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

  /** Un mensaje con el CLI (Claude Code / Codex): streaming de eventos por IPC. */
  const enviarCli = async (texto: string, runId: string) => {
    if (!electron?.agentCliSend || !esCli(engine)) return;
    const off = electron.onAgentCliEvent(({ runId: id, event }) => {
      if (id === runId) aplicar(event);
    });
    try {
      const url = await mcpUrl();
      await electron.agentCliSend(runId, {
        cli: engine,
        prompt: texto,
        mcpUrl: url,
        systemPrompt: focusSystemPrompt({ elementName, viewName, projectName, hasSpec, dirs }),
        sessionId: sessionRef.current,
        dirs,
      });
    } finally {
      off();
    }
  };

  /** Un mensaje con la IA de la app (#459): una respuesta, con la ficha como contexto. */
  const enviarApp = async (texto: string, previos: Msg[]) => {
    const respuesta = await runAi(elementChatTask, {
      nombre: elementName,
      tipo: props.elementType ?? "",
      vista: viewName,
      notation: props.notation,
      descripcion: props.description,
      spec: props.specMarkdown,
      entrantes: props.incoming,
      salientes: props.outgoing,
      historial: previos.filter((m) => m.text).map((m) => ({ role: m.role, text: m.text })),
      mensaje: texto,
    });
    // `useAi` ya mostró el motivo en un toast; acá queda dicho en el hilo.
    if (respuesta === null) aplicar({ type: "error", message: "La IA de la app no respondió (mirá el aviso)." });
    else patchLast((m) => ({ ...m, text: respuesta }));
  };

  const enviar = async () => {
    const texto = input.trim();
    if (!texto || busy || status === null) return;
    const previos = messages;
    setInput("");
    setBusy(true);
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    runIdRef.current = esCli(engine) ? runId : null;
    setMessages((prev) => [
      ...prev,
      { id: `${runId}-u`, role: "user", text: texto, tools: [] },
      { id: `${runId}-a`, role: "assistant", text: "", tools: [] },
    ]);
    try {
      if (esCli(engine)) await enviarCli(texto, runId);
      else await enviarApp(texto, previos);
    } catch (e: any) {
      aplicar({ type: "error", message: String(e?.message ?? e) });
    } finally {
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

  const listo = status !== null;
  const motor = engineLabel(engine);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Select value={elegido} onValueChange={(v) => elegir(v as ChatEngine)}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHAT_ENGINES.map((e) => (
              <SelectItem key={e} value={e} className="text-xs">
                {engineLabel(e)}
                {esCli(e) && status && !status.find((s) => s.cli === e)?.installed ? " (no instalado)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {!listo
            ? "Buscando CLI…"
            : esCli(engine)
              ? `${version ?? "instalado"} · habla de «${elementName}»`
              : `habla de «${elementName}»`}
        </span>
        {/* Qué motor contesta cuando es la IA de la app (local, nube o Claude Code como motor). */}
        {listo && !esCli(engine) && <AiProvenanceBadge />}
        <IconAction
          type="button"
          variant="ghost"
          className="h-7 w-7"
          onClick={nuevaConversacion}
          disabled={busy || messages.length === 0}
          label="Nueva conversación (borra el chat)"
          icon={<Trash2 className="h-4 w-4" />}
        />
      </div>

      {fallback && (
        <div className="mx-4 mt-3 rounded-md border bg-muted/40 p-3 text-xs">
          <p>{fallbackNotice(elegido)}</p>
          {esCli(elegido) && (
            <p className="mt-1 text-muted-foreground">
              Para usar {CLI_INFO[elegido].label}, instalalo desde{" "}
              <a className="text-primary underline" href={CLI_INFO[elegido].installUrl} target="_blank" rel="noreferrer">
                {CLI_INFO[elegido].installUrl}
              </a>{" "}
              y volvé a abrir la ficha.
            </p>
          )}
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && listo && (
          <p className="text-sm text-muted-foreground">
            {esCli(engine) ? (
              <>
                {motor} ya sabe que estás en «{elementName}» ({viewName}). Probá: <em>pulí esta caja</em> o{" "}
                <em>completá la spec con criterios medibles</em>. Te muestra la propuesta antes de escribir.
              </>
            ) : (
              <>
                La IA de la app conoce la ficha de «{elementName}». Probá: <em>¿qué le falta a la spec?</em> o{" "}
                <em>proponé criterios medibles</em>. No escribe en el lienzo: aplicá lo que te sirva desde el tab Spec.
              </>
            )}
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
              {/* El agente escribe Markdown (negritas, listas, código): se dibuja con el
                  mismo renderizador del chat del agente local. Lo del humano va tal cual. */}
              {m.text &&
                (m.role === "assistant" ? (
                  <Markdown content={m.text} className="break-words text-sm leading-relaxed" />
                ) : (
                  <p className="whitespace-pre-wrap">{m.text}</p>
                ))}
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

      {/* Carpetas de contexto adjuntas (#460): nombre visible, ruta en el tooltip. */}
      {dirs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t px-3 pt-2">
          {dirs.map((d) => (
            <span
              key={d}
              title={d}
              className="inline-flex max-w-[14rem] items-center gap-1 rounded-full border bg-muted/50 py-0.5 pl-2 pr-0.5 text-xs"
            >
              <Folder className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{nombreCarpeta(d)}</span>
              <IconAction
                type="button"
                variant="ghost"
                className="h-5 w-5"
                onClick={() => guardarCarpetas(dirs.filter((x) => x !== d))}
                disabled={busy}
                label={`Quitar la carpeta ${nombreCarpeta(d)}`}
                icon={<X className="h-3 w-3" />}
              />
            </span>
          ))}
          {!esCli(engine) && (
            <span className="text-xs text-muted-foreground">
              La IA de la app no lee carpetas: elegí Claude Code para usarlas.
            </span>
          )}
        </div>
      )}

      <div className={cn("flex items-end gap-2 p-3", dirs.length === 0 && "border-t")}>
        {electron?.agentCliPickDir && (
          <IconAction
            type="button"
            variant="ghost"
            onClick={() => void adjuntarCarpeta()}
            disabled={busy}
            label="Adjuntar carpeta como contexto (sólo lectura)"
            icon={<FolderPlus className="h-4 w-4" />}
          />
        )}
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          placeholder={listo ? `Decile a ${motor} qué hacer con «${elementName}»…` : "Buscando CLI…"}
          disabled={!listo || busy}
          className="min-h-[40px] max-h-32 resize-none text-sm"
          rows={1}
        />
        {busy && esCli(engine) ? (
          <IconAction type="button" variant="outline" onClick={detener} label="Detener al agente" icon={<Square className="h-4 w-4" />} />
        ) : (
          <IconAction
            type="button"
            onClick={() => void enviar()}
            disabled={!input.trim() || !listo || busy}
            label="Enviar (Enter)"
            icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          />
        )}
      </div>
    </div>
  );
}
