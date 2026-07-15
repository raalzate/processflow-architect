"use client";

/**
 * @fileOverview Guía in-app del servidor MCP.
 *
 * Documenta cómo conectar Claude Code / Codex al servidor MCP de la app para
 * DISEÑAR diagramas y traerlos al lienzo con «Importar diagrama», con un sidebar
 * de navegación (scroll-spy) y un playground para probar las herramientas a mano.
 */

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plug,
  Copy,
  CopyCheck,
  Wrench,
  ListChecks,
  Workflow,
  FileUp,
  Terminal,
  FlaskConical,
  Download,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { McpPlayground } from "@/components/mcp/McpPlayground";
import {
  SKILL_MD,
  SKILL_EXAMPLES_MD,
  SKILL_NAME,
  SKILL_EXAMPLES_PATH,
} from "@/lib/mcp-skill";
import { buildZip } from "@/lib/zip";

// Secciones de la guía: alimentan el sidebar de navegación y los anchors.
const SECTIONS = [
  { id: "que-es", label: "¿Qué es?", icon: Terminal },
  { id: "conexion", label: "Conexión", icon: Plug },
  { id: "flujo", label: "Flujo de trabajo", icon: Workflow },
  { id: "herramientas", label: "Herramientas", icon: Wrench },
  { id: "skill", label: "Skill descargable", icon: Sparkles },
  { id: "playground", label: "Playground", icon: FlaskConical },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/** Bloque de código con botón de copiar (usa el portapapeles de Electron si existe). */
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      const api = (typeof window !== "undefined" && (window as any).electronAPI) || null;
      if (api?.copyToClipboard) await api.copyToClipboard(code);
      else await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ variant: "destructive", title: "No se pudo copiar" });
    }
  };
  return (
    <div className="relative group">
      <pre className="rounded-lg border bg-zinc-900 text-zinc-100 text-xs p-4 overflow-x-auto">
        <code>{code}</code>
      </pre>
      <Button
        variant="outline"
        size="icon"
        className="absolute top-2 right-2 h-7 w-7 opacity-70 group-hover:opacity-100"
        onClick={copy}
        title="Copiar"
      >
        {copied ? <CopyCheck className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

const MCP_HTTP_JSON = `{
  "mcpServers": {
    "processflow-architect": {
      "type": "http",
      "url": "http://127.0.0.1:7331/mcp"
    }
  }
}`;

const MCP_STDIO_JSON = `{
  "mcpServers": {
    "processflow-architect": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "mcp-server/index.ts"]
    }
  }
}`;

const EXAMPLE_PROMPT = `Lee docs/requisitos.md y diseña un diagrama de Event Storming (DDD)
con el MCP processflow-architect: crea el diagrama, añade los agregados,
comandos y eventos que encuentres, conéctalos y expórtalo. Muéstrame el
Mermaid antes de exportar.`;

const TOOLS: { name: string; desc: string }[] = [
  { name: "list_notations", desc: "Ver las notaciones (DDD, BPMN, C4, UML) y su guía de diseño." },
  { name: "describe_notation", desc: "Tipos válidos de una notación (el valor exacto para «type»), si son contenedores y su forma." },
  { name: "create_diagram", desc: "Abrir un diagrama nuevo (nombre + notación). Devuelve un diagramId." },
  { name: "list_diagrams / get_diagram", desc: "Listar diagramas en curso · ver resumen + vista previa Mermaid." },
  { name: "add_container", desc: "Añadir contenedor: Agregado, Contexto Delimitado, Pool, Carril, Límite de Sistema, Paquete…" },
  { name: "add_node", desc: "Añadir nodo (Comando, Evento, Tarea, Clase…), opcionalmente dentro de un contenedor." },
  { name: "add_edge", desc: "Conectar dos elementos. La app ubica la arista sola (interna / política / big picture)." },
  { name: "remove_element", desc: "Borrar un nodo o contenedor y las aristas que lo tocan." },
  { name: "validate_diagram", desc: "Revisar tipos, ids duplicados, aristas colgantes y nodos aislados." },
  { name: "render_mermaid", desc: "Vista previa del diagrama en Mermaid." },
  { name: "export_to_app", desc: "Cargar el diagrama directo al lienzo (servidor de la app activo) o escribir un .json importable (modo stdio)." },
  { name: "import_diagram", desc: "Cargar un .json exportado como diagrama editable (retomar un diseño previo)." },
];

const STEPS: { icon: React.ElementType; title: string; body: string }[] = [
  { icon: Plug, title: "1 · Conectar", body: "Activa el servidor en Ajustes → Servidor MCP y añade el bloque HTTP en tu cliente (Claude Code / Codex). Alternativa dev: abrir el repo, que trae el modo stdio en .mcp.json." },
  { icon: Wrench, title: "2 · Aprender la notación", body: "Pídele que llame list_notations y describe_notation para conocer los tipos válidos antes de construir." },
  { icon: Workflow, title: "3 · Diseñar", body: "Con create_diagram + add_container/add_node/add_edge construye el diagrama mientras analiza tus documentos." },
  { icon: ListChecks, title: "4 · Revisar", body: "render_mermaid para verlo y validate_diagram para detectar nodos sueltos o tipos inválidos." },
  { icon: FileUp, title: "5 · Exportar", body: "export_to_app: con el servidor de la app activo, el diagrama llega DIRECTO al lienzo. En modo stdio genera un .json que importas con «Importar diagrama»." },
];

/**
 * Tarjeta del skill descargable «documento-a-processflow»: convierte un
 * documento de negocio en un portafolio de diagramas usando este MCP. La
 * descarga genera el SKILL.md desde la constante embebida (sin depender del
 * repo), listo para colocar en `.claude/skills/` del usuario.
 */
function SkillDownloadCard() {
  // Un solo .zip con la estructura estándar de skills de Claude Code:
  // <skill>/SKILL.md + <skill>/references/…  →  descomprimir en .claude/skills/.
  const downloadZip = () => {
    const zip = buildZip([
      { name: `${SKILL_NAME}/SKILL.md`, content: SKILL_MD },
      { name: `${SKILL_NAME}/${SKILL_EXAMPLES_PATH}`, content: SKILL_EXAMPLES_MD },
    ]);
    const blob = new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${SKILL_NAME}-skill.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" /> Skill descargable: <code>{SKILL_NAME}</code>
        </CardTitle>
        <CardDescription className="mt-1.5">
          Un skill de Claude Code que orquesta TODO el flujo de esta guía: lee un documento de
          negocio (PDF, PRD, presentación), te pregunta qué deseas obtener (portafolio completo,
          solo el dominio o un proceso concreto, y si lo entrega como un proyecto con vistas o
          proyectos separados) y construye los diagramas —DDD, BPMN, C4— con las herramientas
          MCP, validados y exportados al lienzo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={downloadZip}>
            <Download className="w-4 h-4 mr-2" /> Descargar skill (.zip)
          </Button>
          <span className="text-xs text-muted-foreground">
            Estructura estándar de Claude Code: <code>SKILL.md</code> +{" "}
            <code>{SKILL_EXAMPLES_PATH}</code>.
          </span>
        </div>
        <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
          <p className="font-medium">Instalación (en tu entorno):</p>
          <ol className="list-decimal ml-5 space-y-1 text-muted-foreground">
            <li>
              Descomprime el zip en <code>.claude/skills/</code> de tu proyecto (o en{" "}
              <code>~/.claude/skills/</code> para tenerlo global) — queda{" "}
              <code>.claude/skills/{SKILL_NAME}/SKILL.md</code>.
            </li>
            <li>
              Conecta el MCP como indica la sección <b>Conexión</b> (servidor de la app activo).
            </li>
            <li>
              En Claude Code escribe <code>/{SKILL_NAME}</code> o pide «analiza este documento y
              modélalo en Processflow».
            </li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}

export default function McpGuidePage() {
  const [activeSection, setActiveSection] = useState<SectionId>("que-es");
  const scrollRef = useRef<HTMLElement | null>(null);

  // Resalta en el sidebar la sección visible (scroll-spy sobre el contenedor).
  useEffect(() => {
    const rootEl = scrollRef.current;
    if (!rootEl) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveSection(visible.target.id as SectionId);
      },
      { root: rootEl, rootMargin: "-10% 0px -60% 0px" }
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: SectionId) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-50">
      <header className="bg-card border-b shadow-sm w-full p-4 z-10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-foreground font-headline flex items-center gap-2">
            <Plug className="w-5 h-5" /> Guía MCP · Diseñar con Claude Code
          </h1>
          <p className="text-sm text-muted-foreground">
            Conecta Claude Code / Codex al servidor MCP para diseñar diagramas desde tus documentos y traerlos al lienzo.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Analizador
          </Link>
        </Button>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar de navegación entre secciones (scroll-spy). */}
        <aside className="w-56 shrink-0 border-r bg-card p-4 hidden md:block">
          <nav className="space-y-1 sticky top-4">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-left transition-colors",
                  activeSection === s.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <s.icon className="w-4 h-4 shrink-0" />
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        <main ref={scrollRef} className="flex-1 overflow-y-auto p-8">
          <div className="w-full max-w-3xl mx-auto space-y-6">
            {/* Qué es */}
            <section id="que-es" className="scroll-mt-4">
              <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="w-5 h-5" /> ¿Qué es?
                </CardTitle>
                <CardDescription className="mt-1.5">
                  Un servidor <b>MCP (Model Context Protocol)</b> por stdio que expone herramientas para que
                  un agente (Claude Code, Codex…) <b>diseñe diagramas</b> — Event Storming DDD, BPMN, C4, UML —
                  analizando tus documentos, y los exporte al formato que esta app importa. Todo local, sin nube.
                </CardDescription>
              </CardHeader>
              </Card>
            </section>

            {/* Conexión: HTTP (app) como modo principal */}
            <section id="conexion" className="scroll-mt-4 space-y-6">
              <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plug className="w-5 h-5" /> Conexión (recomendada): servidor de la app
                </CardTitle>
                <CardDescription className="mt-1.5">
                  Activa el servidor en <Link href="/settings" className="underline text-primary">Ajustes → Servidor MCP</Link> y
                  añade este bloque en tu cliente (Claude Code / Codex). Los diagramas que el agente exporte
                  <b> llegan directo al lienzo</b>, sin importar archivos. Sólo escucha en tu equipo (127.0.0.1).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <CodeBlock code={MCP_HTTP_JSON} />
                <p className="text-xs text-muted-foreground">
                  El puerto (7331 por defecto) se cambia en Ajustes. La app debe estar abierta con el
                  servidor activo para que el cliente conecte.
                </p>
              </CardContent>
            </Card>

            {/* Conexión alternativa: stdio con el repo (desarrollo) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="w-5 h-5" /> Alternativa (desarrollo): stdio con el repo
                </CardTitle>
                <CardDescription className="mt-1.5">
                  Si tienes el repositorio clonado, Claude Code descubre el servidor por el <code>.mcp.json</code> del
                  repo (no necesita la app abierta). Los exports quedan como <code>.json</code> para importar a mano:
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <CodeBlock code={MCP_STDIO_JSON} />
                <p className="text-xs text-muted-foreground">
                  Corre con <code>npx tsx mcp-server/index.ts</code>; workspace configurable con{" "}
                  <code>PROCESSFLOW_WORKSPACE</code>.
                </p>
              </CardContent>
            </Card>

            {/* Prompt de ejemplo */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="w-5 h-5" /> Prompt de ejemplo
                </CardTitle>
                <CardDescription className="mt-1.5">
                  Pégalo en Claude Code apuntando a tus propios documentos. Si trabajas con el
                  repo, también existe el skill <code>/disenar-diagrama</code> (en{" "}
                  <code>.claude/skills/</code>) que guía todo el flujo automáticamente:
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CodeBlock code={EXAMPLE_PROMPT} />
              </CardContent>
              </Card>
            </section>

            {/* Flujo de trabajo + traer al lienzo */}
            <section id="flujo" className="scroll-mt-4 space-y-6">
              <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Workflow className="w-5 h-5" /> Flujo de trabajo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {STEPS.map((s) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.title} className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{s.title}</div>
                        <p className="text-sm text-muted-foreground">{s.body}</p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Importar */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileUp className="w-5 h-5" /> Traer el diseño al lienzo
                </CardTitle>
                <CardDescription className="mt-1.5">
                  Con el <b>servidor de la app activo</b>, <code>export_to_app</code> carga el diagrama
                  directo al lienzo como proyecto nuevo — verás la app traerse al frente con el diseño.
                  En modo stdio (repo), genera un <code>.json</code> que cargas con <b>«Importar diagrama»</b>{" "}
                  o arrastrándolo a la pantalla de bienvenida.
                </CardDescription>
              </CardHeader>
              </Card>
            </section>

            {/* Herramientas de referencia */}
            <section id="herramientas" className="scroll-mt-4">
              <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="w-5 h-5" /> Herramientas disponibles
              </CardTitle>
              <CardDescription className="mt-1.5">
                El agente las llama solo; esta lista es de referencia.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5">
                {TOOLS.map((t) => (
                  <div key={t.name} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 border-b pb-2">
                    <code className="text-xs bg-muted rounded px-1.5 py-0.5 shrink-0 sm:w-44">{t.name}</code>
                    <span className="text-sm text-muted-foreground">{t.desc}</span>
                  </div>
                ))}
              </div>
            </CardContent>
              </Card>
            </section>

            {/* Skill descargable: flujo completo documento → portafolio */}
            <section id="skill" className="scroll-mt-4">
              <SkillDownloadCard />
            </section>

            {/* Playground: probar las herramientas sin cliente externo */}
            <section id="playground" className="scroll-mt-4">
              <McpPlayground />
            </section>
          </div>
        </main>
      </div>
      <Toaster />
    </div>
  );
}
