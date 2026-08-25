"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAgent } from "@/context/AgentContext";
import { useViews } from "@/context/ViewsContext";
import { Button } from "@/components/ui/button";
import { IconAction } from "@/components/ui/icon-action";
import { accion } from "@/lib/action-labels";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import {
  Send,
  Loader2,
  Brain,
  Wrench,
  Eye,
  User,
  Bot,
  X,
  Sparkles,
  Trash2,
  Paperclip,
  FileText,
  Pin,
  AtSign,
  BookOpen,
  Search,
  ListChecks,
  HelpCircle,
  CheckCheck,
  Layers,
  Plus,
} from "lucide-react";
import { documentDefinitions, getDefinition } from "@/lib/artifacts/registry";
import { resolveContextRevisions } from "@/lib/artifacts/versioning";
import { iconForArtifact, iconForArtifactKind } from "./artifact-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Markdown } from "./Markdown";
import { formatElapsed } from "@/lib/duration";
import type { AgentStep, AgentDocument, Artifact, ChatMessage } from "@/lib/agent-types";

/**
 * Tipos aceptados. PDF funciona en todos los proveedores: nativo con Gemini, vía
 * extracción de texto (unpdf) con el resto.
 */
const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.csv,application/pdf,image/*,text/plain,text/markdown";


function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const SUGGESTIONS = [
  "Extrae los drivers de arquitectura",
  "Identifica riesgos y restricciones",
  "Genera una propuesta técnica completa",
  "Crea un diagrama C4 de contenedores",
  "Redacta un ADR para la persistencia",
];

function StepIcon({ type }: { type: AgentStep["type"] }) {
  // Sin `switch` exhaustivo a propósito: agregar un paso al esquema no debe
  // romper el build de la UI; lo desconocido cae en el ícono neutro.
  if (type === "thought") return <Brain className="h-3.5 w-3.5 text-primary" />;
  if (type === "action") return <Wrench className="h-3.5 w-3.5 text-info" />;
  if (type === "read") return <BookOpen className="h-3.5 w-3.5 text-info" />;
  if (type === "search") return <Search className="h-3.5 w-3.5 text-info" />;
  if (type === "plan") return <ListChecks className="h-3.5 w-3.5 text-primary" />;
  if (type === "question") return <HelpCircle className="h-3.5 w-3.5 text-warning" />;
  if (type === "decision") return <CheckCheck className="h-3.5 w-3.5 text-primary" />;
  if (type === "consolidate") return <Layers className="h-3.5 w-3.5 text-success" />;
  return <Eye className="h-3.5 w-3.5 text-success" />;
}

/**
 * Tarjeta de decisión del humano: el plan por aprobar o la pregunta por
 * responder. Es el punto donde la corrida está detenida — mientras esté acá, no
 * se generó nada (spec 005 · H2, H3).
 */
function RunPauseCard({
  message,
  busy,
  viewNames,
  onDecide,
  onCancel,
}: {
  message: ChatMessage;
  busy: boolean;
  /** Vistas del proyecto: para contrastar contra lo que el agente leyó. */
  viewNames: string[];
  onDecide: (d: { kind: "approve" } | { kind: "adjust"; feedback: string } | { kind: "answer"; answer: string }) => void;
  onCancel: () => void;
}) {
  const [feedback, setFeedback] = useState("");
  const [ajustando, setAjustando] = useState(false);
  const pause = message.run?.pause;
  const leidas = message.run?.read ?? [];
  const norm = (t: string) => t.trim().toLowerCase();
  const pendientes = viewNames.filter((v) => !leidas.some((r) => norm(r) === norm(v)));
  const citadasSinAbrir =
    pause?.kind === "plan"
      ? Array.from(new Set(pause.sections.flatMap((sec) => sec.sources))).filter(
          (f) =>
            viewNames.some((v) => norm(v) === norm(f)) &&
            !leidas.some((r) => norm(r) === norm(f))
        )
      : [];
  if (!pause) return null;

  if (pause.kind === "plan") {
    return (
      <div className="mt-2 rounded-md border border-primary/40 bg-background/60 p-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <ListChecks className="h-3.5 w-3.5 text-primary" /> Plan de «{pause.title}»
        </div>
        <ul className="mt-1.5 space-y-1">
          {pause.sections.map((sec, i) => (
            <li key={i} className="text-xs">
              <span className="font-medium">{sec.title}</span>
              {sec.sources.length ? (
                <span className="text-muted-foreground"> ← {sec.sources.join(", ")}</span>
              ) : null}
            </li>
          ))}
        </ul>
        {/* La cobertura, ANTES de aprobar: un plan monofuente sobre un proyecto de
            ocho vistas se ve acá, no cuando el artefacto ya está en el lienzo. */}
        <div className="mt-1.5 space-y-1 text-2xs text-muted-foreground">
          <p>
            <span className="text-foreground/80">Vistas que abrió:</span>{" "}
            {leidas.length ? leidas.join(", ") : "ninguna todavía"}.
          </p>
          {pendientes.length > 0 && (
            <p>
              <span className="text-foreground/80">Sin abrir:</span> {pendientes.join(", ")}. Si el
              artefacto las necesita, pedíselas con «Ajustar…».
            </p>
          )}
          {/* Contradicción posible: el plan promete una fuente que nunca abrió.
              El agente ya lo tiene prohibido, pero si insiste se dice acá. */}
          {citadasSinAbrir.length > 0 && (
            <p className="text-destructive">
              Ojo: el plan cita {citadasSinAbrir.join(", ")} y no las leyó — esas secciones saldrían
              de memoria, no del modelo.
            </p>
          )}
        </div>
        {ajustando ? (
          <div className="mt-2 space-y-1.5">
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Qué cambiar del plan (no vuelve a leer lo que ya leyó)"
              className="min-h-[56px] text-xs"
            />
            <div className="flex gap-1.5">
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={busy || !feedback.trim()}
                onClick={() => onDecide({ kind: "adjust", feedback })}
              >
                Enviar ajuste
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAjustando(false)}>
                Volver
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => onDecide({ kind: "approve" })}>
              Aprobar y generar
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => setAjustando(true)}>
              Ajustar…
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-warning/40 bg-background/60 p-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <HelpCircle className="h-3.5 w-3.5 text-warning" /> Decidí para seguir
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{pause.text}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {pause.options.map((op) => (
          <Button
            key={op}
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={busy}
            onClick={() => onDecide({ kind: "answer", answer: op })}
          >
            {op}
          </Button>
        ))}
        {/* «No sé» no traba el flujo: toma la primera opción y la declara como supuesto. */}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          disabled={busy}
          onClick={() => onDecide({ kind: "answer", answer: "__no-se__" })}
        >
          No sé, seguí
        </Button>
      </div>
    </div>
  );
}

function StepsTrace({ steps }: { steps: AgentStep[] }) {
  if (!steps?.length) return null;
  return (
    <Accordion type="single" collapsible className="mt-2">
      <AccordionItem value="trace" className="border-none">
        <AccordionTrigger className="py-1 text-xs text-muted-foreground hover:no-underline">
          Razonamiento ({steps.length} pasos)
        </AccordionTrigger>
        <AccordionContent>
          <ol className="space-y-1.5 border-l pl-3">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5">
                  <StepIcon type={s.type} />
                </span>
                <span className="text-muted-foreground">
                  {s.tool ? <span className="font-mono text-foreground">{s.tool}</span> : null}
                  {s.tool ? " · " : null}
                  {s.source ? <span className="font-medium text-foreground">{s.source}: </span> : null}
                  {s.content}
                </span>
              </li>
            ))}
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function AgentChatPanel() {
  const {
    messages,
    busy,
    sendMessage,
    resumeRun,
    cancelRun,
    artifacts,
    contextArtifactIds,
    toggleContextArtifact,
    clearContextArtifacts,
    clearChat,
    attachments,
    addAttachments,
    removeAttachment,
  } = useAgent();
  const { views, injectedViews, injectedViewIds, toggleInject } = useViews();

  // Cronómetro de la corrida: arranca cuando el agente se pone a trabajar y se
  // reinicia en cada turno nuevo.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const desde = Date.now();
    setElapsed(0);
    const t = setInterval(() => setElapsed(Date.now() - desde), 1000);
    return () => clearInterval(t);
  }, [busy]);
  const [input, setInput] = useState("");
  // Artefacto pedido con el menú «+». Sin esto el agente dependía de que la frase
  // tuviera un verbo de generación: «Identifica riesgos y restricciones» sólo
  // conversaba y nunca ponía nada en el lienzo.
  const [requestedKind, setRequestedKind] = useState<string | null>(null);
  // Menú de mención "@" para incluir vistas como contexto.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const MENTION_RE = /(^|\s)@([\p{L}\d_-]*)$/u;
  const injectableViews = views.filter((v) => v.kind === "graph");
  const mentionMatches =
    mentionQuery === null
      ? []
      : injectableViews.filter((v) => v.name.toLowerCase().includes(mentionQuery.toLowerCase()));

  const onInputChange = (value: string) => {
    setInput(value);
    const m = value.match(MENTION_RE);
    setMentionQuery(m ? m[2] : null);
  };

  const applyMention = (viewId: string) => {
    if (!injectedViewIds.includes(viewId)) toggleInject(viewId);
    setInput((prev) => prev.replace(MENTION_RE, "$1"));
    setMentionQuery(null);
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = useState(false);

  const ingestFiles = async (files: File[]) => {
    const docs: AgentDocument[] = [];
    for (const f of files) {
      try {
        docs.push({
          name: f.name,
          contentType: f.type || "application/octet-stream",
          url: await fileToDataUrl(f),
        });
      } catch {
        /* ignora archivos ilegibles */
      }
    }
    if (docs.length) addAttachments(docs);
  };

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite re-seleccionar el mismo archivo
    await ingestFiles(files);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) await ingestFiles(files);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (busy) return;
    // Sólo reacciona si arrastran archivos.
    if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) {
      e.preventDefault();
      setDragOver(true);
    }
  };

  const onDragLeave = (e: React.DragEvent) => {
    // Evita parpadeo al pasar sobre hijos: sólo limpia si sale del contenedor.
    if (e.currentTarget === e.target) setDragOver(false);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const canSend = !busy && (!!input.trim() || attachments.length > 0 || !!requestedKind);

  const submit = async () => {
    if (!canSend) return;
    // Con el artefacto elegido, el texto es opcional (son instrucciones extra).
    // Si solo hay adjuntos sin texto, da una instrucción por defecto.
    const text =
      input.trim() ||
      (requestedKind
        ? ""
        : "Analiza los documentos adjuntos y genera el artefacto correspondiente.");
    const kind = requestedKind ?? undefined;
    setInput("");
    setRequestedKind(null);
    await sendMessage(text, kind);
  };

  // Los chips muestran lo que de verdad se va a inyectar: la revisión vigente
  // de cada linaje marcado, sin repetir (FR-010 de 004-artefactos-versionados).
  const contextArtifacts = resolveContextRevisions(artifacts, contextArtifactIds);

  /** Quitar un chip desmarca todas las revisiones de ese linaje. */
  const quitarContexto = (a: Artifact) => {
    const linaje = a.lineageId ?? a.id;
    const marcados = contextArtifactIds.filter((id) => {
      const art = artifacts.find((x) => x.id === id);
      return art && (art.lineageId ?? art.id) === linaje;
    });
    (marcados.length ? marcados : [a.id]).forEach(toggleContextArtifact);
  };

  return (
    <div
      className={cn(
        // Sin conversación el chat no necesita 60vh: reservaba media pantalla en
        // blanco y empujaba «Modelo de Dominio» y «Elementos» fuera de la vista,
        // obligando a scrollear el panel entero para llegar a ellos.
        "relative flex w-full min-w-0 flex-col rounded-md transition-colors",
        messages.length ? "h-[60vh]" : "h-[38vh]",
        dragOver && "ring-2 ring-primary ring-offset-1"
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Overlay al arrastrar documentos */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-primary bg-background/90 text-sm text-primary">
          <Paperclip className="h-6 w-6" />
          Suelta los documentos para adjuntarlos
        </div>
      )}

      {/* Mensajes */}
      <div ref={scrollRef} className="min-w-0 flex-1 space-y-3 overflow-y-auto px-1 py-2">
        {messages.length === 0 && (
          <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
              <Sparkles className="h-4 w-4 text-primary" /> Agente de Arquitectura
            </div>
            Pídeme que diseñe o analice tu sistema. Generaré artefactos (drivers, riesgos,
            propuesta, roadmap, ADRs, diagramas...) en el lienzo principal.
            <div className="mt-2 flex flex-wrap gap-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="rounded-full border px-2 py-1 text-2xs hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={cn("flex gap-2", m.role === "user" && "flex-row-reverse")}>
            <div
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
            >
              {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            </div>
            <div
              // `min-w-0`: el ítem flex arranca con `min-width:auto` = ancho de su
              // contenido más terco (una línea larga dentro de un <pre>), y eso GANA
              // sobre `max-w`. La burbuja se salía del panel y el texto quedaba
              // cortado a la derecha; con min-w-0 el <pre> scrollea solo.
              className={cn(
                "min-w-0 max-w-[85%] overflow-hidden rounded-lg px-3 py-2 text-sm",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : m.error
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted"
              )}
            >
              {m.role === "assistant" && !m.error ? (
                <Markdown content={m.content} className="break-words text-sm leading-relaxed" />
              ) : (
                <p className="whitespace-pre-wrap break-words leading-relaxed">{m.content}</p>
              )}
              {m.role === "user" && !!m.attachments?.length && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {m.attachments.map((a) => (
                    <span
                      key={a.name}
                      className="flex max-w-[160px] items-center gap-1 rounded-md bg-primary-foreground/15 px-1.5 py-0.5 text-2xs"
                    >
                      <FileText className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">{a.name}</span>
                    </span>
                  ))}
                </div>
              )}
              {m.role === "assistant" && m.run?.pause && (
                <RunPauseCard
                  message={m}
                  busy={busy}
                  viewNames={views.map((v) => v.name)}
                  onDecide={(d) => resumeRun(m.id, d)}
                  onCancel={() => cancelRun(m.id)}
                />
              )}
              {m.role === "assistant" && m.steps && <StepsTrace steps={m.steps} />}
              {m.role === "assistant" && !!m.producedArtifactIds?.length && (
                <div className="mt-2 text-xs text-muted-foreground">
                  ✓ {m.producedArtifactIds.length} artefacto(s) en el lienzo
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            El agente está razonando…
            {/* El cronómetro es la diferencia entre «va lento» y «se colgó»: con el
                modelo local una corrida de varias lecturas pasa del minuto. */}
            <span className="font-mono tabular-nums text-foreground/70">{formatElapsed(elapsed)}</span>
          </div>
        )}
      </div>

      {/* Chips de contexto inyectado */}
      {contextArtifacts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-t px-1 py-2">
          <span className="text-2xs text-muted-foreground">Contexto:</span>
          {contextArtifacts.map((a) => {
            const def = getDefinition(a.kind);
            const Icon = iconForArtifact(a);
            return (
              <Badge key={a.id} variant="outline" className="gap-1 text-2xs">
                <Icon className="h-3 w-3 text-primary" />
                {def.label}
                {a.revision && a.revision > 1 && (
                  <span className="font-semibold text-primary">v{a.revision}</span>
                )}
                <button onClick={() => quitarContexto(a)} title="Quitar">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
          <button
            onClick={clearContextArtifacts}
            className="ml-1 text-2xs text-muted-foreground hover:text-foreground"
          >
            limpiar
          </button>
        </div>
      )}

      {/* Vistas inyectadas como contexto */}
      {injectedViews.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-t px-1 py-2">
          <span className="flex items-center gap-1 text-2xs text-muted-foreground">
            <Pin className="h-3 w-3 fill-primary text-primary" /> Vistas:
          </span>
          {injectedViews.map((v) => (
            <Badge key={v.id} variant="outline" className="gap-1 text-2xs">
              {v.name}
              <button onClick={() => toggleInject(v.id)} title="Quitar del contexto">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Documentos adjuntos */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-t px-1 py-2">
          <span className="text-2xs text-muted-foreground">Adjuntos:</span>
          {attachments.map((d) => (
            <Badge key={d.name} variant="secondary" className="max-w-[180px] gap-1 text-2xs">
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate">{d.name}</span>
              <button onClick={() => removeAttachment(d.name)} title="Quitar">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="px-1 pt-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={onPickFiles}
        />
        <div className="relative rounded-2xl border border-input bg-background shadow-sm transition-shadow focus-within:border-primary focus-within:ring-1 focus-within:ring-primary focus-within:ring-offset-0">
          {/* Menú de mención "@" → incluir vistas como contexto */}
          {mentionQuery !== null && (
            <div className="absolute bottom-full left-2 z-30 mb-1 max-h-56 w-64 overflow-auto rounded-lg border bg-popover p-1 shadow-lg">
              <div className="px-2 py-1 text-2xs text-muted-foreground">Incluir vista en el contexto</div>
              {mentionMatches.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">Sin vistas que coincidan.</div>
              ) : (
                mentionMatches.map((v) => {
                  const already = injectedViewIds.includes(v.id);
                  return (
                    <button
                      key={v.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyMention(v.id);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <AtSign className="h-3 w-3 text-primary" />
                        {v.name}
                        <span className="text-2xs text-muted-foreground">· {v.kind}</span>
                      </span>
                      {already && <span className="text-2xs text-primary">incluida</span>}
                    </button>
                  );
                })
              )}
            </div>
          )}
          {/* Pedido explícito: el chip dice qué va a generar y se saca con la X. */}
          {requestedKind && (
            <div className="flex flex-wrap items-center gap-1 px-2 pt-2">
              <Badge
                variant="outline"
                className="gap-1 border-primary/50 bg-primary/10 text-2xs text-primary"
              >
                {React.createElement(iconForArtifactKind(requestedKind), {
                  className: "h-3 w-3",
                })}
                Generar: {getDefinition(requestedKind).label}
                <button
                  onClick={() => setRequestedKind(null)}
                  className="ml-1 opacity-70 hover:opacity-100"
                  title="Cancelar el pedido"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
              <span className="text-2xs text-muted-foreground">
                el texto es opcional: son instrucciones extra
              </span>
            </div>
          )}
          <Textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (mentionQuery !== null && mentionMatches.length && (e.key === "Enter" || e.key === "Tab")) {
                e.preventDefault();
                applyMention(mentionMatches[0].id);
                return;
              }
              if (mentionQuery !== null && e.key === "Escape") {
                setMentionQuery(null);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Pregunta, conversa o pide que diseñe/analice…  (@ para incluir una vista · + para pedir un artefacto)"
            className="min-h-[52px] max-h-36 w-full resize-none border-0 bg-transparent px-3 py-2.5 text-sm shadow-none outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            disabled={busy}
          />

          {/* Barra inferior: pedir artefacto · adjuntar · enviar */}
          <div className="flex items-center gap-1 px-2 pb-2">
            {/* «+»: elegir el artefacto en vez de esperar que la frase lo delate. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconAction
                  variant="ghost"
                  className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                  disabled={busy}
                  label="Pedir un artefacto (documento o diagrama)"
                  icon={<Plus className="h-4 w-4" />}
                />
              </DropdownMenuTrigger>
              {/* Sólo documentos: los diagramas se diseñan en el lienzo o llegan
                  por MCP, no hacía falta pedirlos desde acá. */}
              <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
                <DropdownMenuLabel className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" /> Documentos
                </DropdownMenuLabel>
                {documentDefinitions().map((d) => {
                  const Icon = iconForArtifactKind(d.kind, d.family);
                  return (
                    <DropdownMenuItem
                      key={d.kind}
                      onClick={() => setRequestedKind(d.kind)}
                      title={d.description}
                      className="gap-2"
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {d.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <IconAction
              variant="ghost"
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              label="Adjuntar documento (PDF, imagen, texto)"
              icon={<Paperclip className="h-4 w-4" />}
            />

            <IconAction
              className="ml-auto h-8 w-8 rounded-full"
              onClick={submit}
              disabled={!canSend}
              label="Enviar (Enter)"
              icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            />
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between px-1">
          <span className="text-2xs text-muted-foreground">Enter para enviar · Shift+Enter salto de línea</span>
          {messages.length > 0 && (
            <IconAction
              variant="ghost"
              onClick={clearChat}
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              label={accion("limpiar", "la conversación")}
              icon={<Trash2 className="h-3 w-3" />}
            />
          )}
        </div>
      </div>
    </div>
  );
}
