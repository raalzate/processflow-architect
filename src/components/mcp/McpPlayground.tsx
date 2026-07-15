"use client";

/**
 * @fileOverview Playground MCP de la guía (/mcp).
 *
 * Permite probar las herramientas del servidor MCP a mano, sin Claude Code:
 * elige una herramienta, edita los argumentos (JSON prellenado desde el schema)
 * y ve la respuesta. Corre por IPC con transporte en memoria (main), así que
 * funciona aunque el servidor HTTP esté apagado, y comparte workspace con los
 * clientes externos (lo que crees aquí lo ve Claude Code y viceversa).
 */

import React, { useEffect, useMemo, useState } from "react";
import { Play, Loader2, FlaskConical, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PlaygroundTool, PlaygroundCallResult } from "@/types/electron";

const api = () => (typeof window !== "undefined" ? (window as any).electronAPI : undefined);

/** Esqueleto de argumentos a partir del JSON Schema de la herramienta. */
function schemaSkeleton(schema: unknown): string {
  const s = schema as { properties?: Record<string, any>; required?: string[] } | undefined;
  if (!s?.properties) return "{}";
  const out: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(s.properties)) {
    const t = prop?.type;
    out[key] =
      t === "number" || t === "integer" ? 0
      : t === "boolean" ? false
      : t === "array" ? []
      : t === "object" ? {}
      : prop?.enum?.[0] ?? "";
  }
  return JSON.stringify(out, null, 2);
}

/** Campos requeridos del schema (para la pista bajo el editor). */
function requiredFields(schema: unknown): string[] {
  return ((schema as { required?: string[] } | undefined)?.required ?? []).slice().sort();
}

export function McpPlayground() {
  const [tools, setTools] = useState<PlaygroundTool[]>([]);
  const [toolName, setToolName] = useState<string>("");
  const [argsText, setArgsText] = useState<string>("{}");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PlaygroundCallResult | null>(null);
  const [argsError, setArgsError] = useState<string | null>(null);
  // La disponibilidad de electronAPI sólo puede decidirse tras montar: en SSR no
  // existe window y ramificar en el render inicial rompería la hidratación.
  const [desktop, setDesktop] = useState<boolean | null>(null);

  const tool = useMemo(() => tools.find((t) => t.name === toolName), [tools, toolName]);

  useEffect(() => {
    setDesktop(Boolean(api()?.mcpPlaygroundCall));
    api()
      ?.mcpPlaygroundListTools?.()
      .then((list: PlaygroundTool[]) => {
        setTools(list);
        // Arranca en list_notations: no requiere argumentos y orienta el flujo.
        const first = list.find((t) => t.name === "list_notations") ?? list[0];
        if (first) {
          setToolName(first.name);
          setArgsText(schemaSkeleton(first.inputSchema));
        }
      })
      .catch(() => {});
  }, []);

  const selectTool = (name: string) => {
    setToolName(name);
    setResult(null);
    setArgsError(null);
    const t = tools.find((x) => x.name === name);
    setArgsText(schemaSkeleton(t?.inputSchema));
  };

  const run = async () => {
    let args: unknown;
    try {
      args = argsText.trim() ? JSON.parse(argsText) : {};
    } catch (e: any) {
      setArgsError(`JSON inválido: ${e?.message ?? e}`);
      return;
    }
    setArgsError(null);
    setRunning(true);
    setResult(null);
    try {
      const res = await api()?.mcpPlaygroundCall?.(toolName, args);
      setResult(res ?? { ok: false, blocks: ["Sin respuesta (¿app de escritorio?)"], isError: true });
    } finally {
      setRunning(false);
    }
  };

  // desktop === null → aún no montó (SSR y primer paint idénticos, sin mismatch).
  if (desktop !== true) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5" /> Playground
          </CardTitle>
          <CardDescription>
            {desktop === false ? "Disponible sólo en la app de escritorio." : "Cargando…"}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5" /> Playground
        </CardTitle>
        <CardDescription className="mt-1.5">
          Prueba las herramientas sin Claude Code: elige una, edita los argumentos y ejecútala. Usa el
          mismo workspace que los clientes externos — un diagrama creado aquí puede seguirse desde
          Claude Code (y <code>export_to_app</code> lo manda al lienzo).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {/* Selector + argumentos */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Herramienta</label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={toolName}
                onChange={(e) => selectTool(e.target.value)}
              >
                {tools.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
              {tool?.description && (
                <p className="text-xs text-muted-foreground mt-1.5">{tool.description}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">Argumentos (JSON)</label>
              <textarea
                className={cn(
                  "mt-1 w-full rounded-md border bg-zinc-900 text-zinc-100 font-mono text-xs p-3 min-h-40",
                  argsError && "border-red-500"
                )}
                spellCheck={false}
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
              />
              {argsError ? (
                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> {argsError}
                </p>
              ) : (
                requiredFields(tool?.inputSchema).length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Requeridos: {requiredFields(tool?.inputSchema).join(", ")}
                  </p>
                )
              )}
            </div>

            <Button onClick={run} disabled={running || !toolName}>
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              {running ? "Ejecutando…" : "Ejecutar"}
            </Button>
          </div>

          {/* Resultado */}
          <div>
            <label className="text-sm font-medium">Respuesta</label>
            <div
              className={cn(
                "mt-1 rounded-md border p-3 min-h-40 max-h-96 overflow-auto text-xs font-mono whitespace-pre-wrap",
                result?.isError ? "border-red-300 bg-red-50 text-red-900" : "bg-muted/40"
              )}
            >
              {result
                ? result.blocks.join("\n\n")
                : running
                  ? "…"
                  : "Ejecuta una herramienta para ver su respuesta."}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
