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
  engineHabilitado,
  engineLabel,
  esCli,
  fallbackNotice,
  nombreCarpeta,
  resolveChatEngine,
  type ChatEngine,
} from "@/lib/agent-cli/engine";
import { readMcpPrefs } from "@/lib/mcp-settings";
import { estadoCli, publicarEstadoCli } from "@/lib/agent-cli/capability";
import { aplicarEvento, sesionDeEvento, type ChatMsg, type ToolCall } from "@/lib/agent-cli/chat-state";
import { dentroDelTope, formatoUsd, gastoSesion, leerTope, mensajeTope, sumarGasto } from "@/lib/agent-cli/cost";
import { urlConAlcance } from "@/lib/mcp/focus-scope";
import { hostBridge } from "@/lib/host-bridge";

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

// El hilo y cómo lo cambia cada evento viven en `chat-state.ts` (puro, con test: #462).
type Msg = ChatMsg;

export interface AgentCliChatProps {
  /** Id de la caja: identifica la conversación (el nombre cambia al renombrar). */
  elementId: string;
  /** Nombre GUARDADO de la caja (no el borrador que se está tecleando). */
  elementName: string;
  /** Id de la vista: identifica la conversación (renombrar la vista no la reinicia, #462). */
  viewId: string;
  viewName: string;
  /** ¿El tab está visible? Con `forceMount` el chat vive oculto: al mostrarse, baja al final (#462). */
  activo?: boolean;
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

const api = hostBridge;

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
  // §P4 (#461): arranca con la IA de la APP, que respeta el modo de Ajustes
  // (local por defecto). Claude Code o Codex sólo si el humano lo elige.
  const [elegido, setElegido] = useState<ChatEngine>("app");
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
      /* sin localStorage: la IA de la app por defecto */
    }
    setDirs(leerCarpetas());
    // Qué CLI hay ya lo publicó la app al arrancar (`AppContent`): se reusa. Con
    // el chat siempre montado (#461), preguntarlo acá lanzaba `claude --version`
    // y `codex --version` en CADA ficha abierta. Sólo si todavía no se publicó se
    // pregunta, una vez, y se publica para las siguientes.
    const conocido = estadoCli();
    if (conocido) setStatus(conocido);
    else if (electron?.agentCliStatus)
      electron
        .agentCliStatus()
        .then((s) => {
          publicarEstadoCli(s);
          setStatus(s);
        })
        .catch(() => setStatus([]));
    // Sin Electron no hay CLI: se sabe ya, y el chat cae a la IA de la app.
    else setStatus([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { engine, fallback } = useMemo(() => resolveChatEngine(elegido, status), [elegido, status]);
  const version = useMemo(() => (esCli(engine) ? status?.find((s) => s.cli === engine)?.version : undefined), [engine, status]);

  /**
   * Generación de la conversación (#461). Cada «nueva conversación» —botón o
   * cambio de caja— la incrementa; un evento o una respuesta de una generación
   * vieja se descarta. Sin esto, la corrida de la caja A seguía escribiendo en el
   * hilo de la caja B y su `session_id` hacía que B retomara la sesión de A.
   */
  const convRef = useRef(0);
  const montadoRef = useRef(true);

  /** Empezar de cero: corta lo que esté corriendo, sin mensajes ni sesión del CLI. */
  const nuevaConversacion = useCallback(() => {
    const enCurso = runIdRef.current;
    if (enCurso) void electron?.agentCliCancel?.(enCurso);
    runIdRef.current = null;
    convRef.current += 1;
    sessionRef.current = undefined;
    setMessages([]);
    setBusy(false);
  }, [electron]);

  // Otra caja = otra conversación. Se identifica por el ID (#461): con el nombre,
  // renombrar la caja reiniciaba el chat en cada tecla.
  // La vista también por ID (#462): renombrarla reiniciaba la conversación.
  useEffect(() => nuevaConversacion(), [props.elementId, props.viewId, nuevaConversacion]);

  // Al final del hilo cuando llega algo y cuando el tab se vuelve visible: con
  // `forceMount` el chat vive oculto, y un scroll hecho oculto no cuenta (#462).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, props.activo]);

  const elegir = (e: ChatEngine) => {
    // Cambiar de motor corta lo que esté corriendo (#462): la respuesta del motor
    // anterior no tiene que aparecer en la conversación con el nuevo.
    if (busy) nuevaConversacion();
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
      // §P4 (#461): se enciende para esta sesión, pero NO se persiste el opt-in.
      // El auto-arranque del servidor lo decide el humano en Ajustes.
    }
    // #462: con el alcance de la caja abierta, el servidor sólo deja escribir ESA
    // spec. Antes «sólo esta caja» lo sostenía el prompt.
    return urlConAlcance(s.url, props.elementId);
  }, [electron, props.elementId]);

  /** Aplica un evento del agente: la sesión va aparte; el hilo lo decide `chat-state.ts`. */
  const aplicar = (e: ChatEvent) => {
    const sesion = sesionDeEvento(e);
    if (sesion) sessionRef.current = sesion;
    if (e.type === "result") sumarGasto(e.costUsd); // #462: tope de gasto de la sesión
    setMessages((prev) => aplicarEvento(prev, e));
  };

  /** Reemplaza el texto del mensaje en curso (la respuesta entera de la IA de la app). */
  const ponerTexto = (texto: string) =>
    setMessages((prev) =>
      prev.length ? [...prev.slice(0, -1), { ...prev[prev.length - 1], text: texto }] : prev
    );

  /** ¿Sigue vigente la conversación `gen`? (no se cambió de caja ni se cerró la ficha). */
  const vigente = (gen: number) => montadoRef.current && gen === convRef.current;

  /** Un mensaje con el CLI (Claude Code / Codex): streaming de eventos por IPC. */
  const enviarCli = async (texto: string, runId: string, gen: number) => {
    if (!electron?.agentCliSend || !esCli(engine)) return;
    const off = electron.onAgentCliEvent(({ runId: id, event }) => {
      if (id === runId && vigente(gen)) aplicar(event);
    });
    try {
      const url = await mcpUrl();
      // Mientras se encendía el MCP pudo cambiar la caja o cerrarse la ficha:
      // lanzar ahora sería una corrida sin dueño escribiendo en el lienzo.
      if (!vigente(gen)) return;
      await electron.agentCliSend(runId, {
        cli: engine,
        prompt: texto,
        mcpUrl: url,
        systemPrompt: focusSystemPrompt({
          elementName,
          elementId: props.elementId,
          viewName,
          projectName,
          hasSpec,
          dirs,
        }),
        sessionId: sessionRef.current,
        dirs,
      });
    } finally {
      off();
    }
  };

  /** Un mensaje con la IA de la app (#459): una respuesta, con la ficha como contexto. */
  const enviarApp = async (texto: string, previos: Msg[], gen: number) => {
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
    if (!vigente(gen)) return; // otra caja: la respuesta era de la anterior
    // `useAi` ya mostró el motivo en un toast; acá queda dicho en el hilo.
    if (respuesta === null) aplicar({ type: "error", message: "La IA de la app no respondió (mirá el aviso)." });
    else ponerTexto(respuesta);
  };

  const enviar = async () => {
    const texto = input.trim();
    if (!texto || busy || status === null) return;
    // #462: con el CLI, el tope de gasto se mira ANTES (una vez lanzada, la
    // corrida ya se cobra). La IA de la app pasa por el router, que lo mira solo.
    if (esCli(engine)) {
      const tope = leerTope(window.localStorage);
      if (!dentroDelTope(gastoSesion(), tope)) {
        setMessages((prev) => [
          ...prev,
          { id: `tope-${Date.now()}`, role: "assistant", text: "", tools: [], error: mensajeTope(gastoSesion(), tope as number) },
        ]);
        return;
      }
    }
    const previos = messages;
    const gen = convRef.current;
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
      if (esCli(engine)) await enviarCli(texto, runId, gen);
      else await enviarApp(texto, previos, gen);
    } catch (e: any) {
      if (vigente(gen)) aplicar({ type: "error", message: String(e?.message ?? e) });
    } finally {
      // Sólo la conversación vigente libera el estado: una vieja no pisa la nueva.
      if (vigente(gen)) {
        runIdRef.current = null;
        setBusy(false);
      }
    }
  };

  const detener = () => {
    const id = runIdRef.current;
    if (id) void electron?.agentCliCancel?.(id);
  };

  // Al desmontar (cerrar la ficha) con el agente trabajando: se cancela, y lo
  // que llegue después se descarta.
  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      detener();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
              // Codex se ve pero no se elige: sin barrera de herramientas verificada (#461).
              <SelectItem key={e} value={e} className="text-xs" disabled={!engineHabilitado(e)}>
                {engineLabel(e)}
                {!engineHabilitado(e)
                  ? " (pronto)"
                  : esCli(e) && status && !status.find((s) => s.cli === e)?.installed
                    ? " (no instalado)"
                    : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {!listo
            ? "Buscando CLI…"
            : esCli(engine)
              ? // #462: lo gastado en la sesión, a la vista; no sólo al final de cada respuesta.
                `${version ?? "instalado"} · ${formatoUsd(gastoSesion())} en esta sesión`
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

      {/* #462: «instalado» no implica sesión iniciada; sin ella cada mensaje fallaba
          con «Not logged in» como si fuera un error del agente. */}
      {esCli(engine) && status?.find((s) => s.cli === engine)?.loggedIn === false && (
        <div className="mx-4 mt-3 rounded-md border border-warning-border bg-warning-surface p-3 text-xs text-warning-foreground">
          {CLI_INFO[engine].label} está instalado pero sin sesión iniciada. Abrí una terminal, corré{" "}
          <code>{CLI_INFO[engine].command}</code> y entrá con tu cuenta; después volvé a abrir la ficha.
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
