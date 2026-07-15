"use client";

/**
 * @fileOverview Ajustes → Servidor MCP embebido (HTTP).
 *
 * Botón de activación del servidor MCP que corre DENTRO de la app (proceso
 * main, sólo 127.0.0.1). Al encenderlo, Claude Code / Codex pueden conectarse
 * y diseñar diagramas que llegan directo al lienzo. Apagado por defecto;
 * la preferencia persiste en localStorage y se re-aplica al arrancar
 * (ver McpImportBridge).
 */

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plug, Power, PowerOff, Copy, CopyCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  MCP_ENABLED_KEY,
  MCP_PORT_KEY,
  MCP_DEFAULT_PORT,
  clientConfigJson,
} from "@/lib/mcp-settings";

const api = () => (typeof window !== "undefined" ? window.electronAPI : undefined);

export function McpServerConfig() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [url, setUrl] = useState("");
  const [port, setPort] = useState<number>(MCP_DEFAULT_PORT);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Estado inicial: puerto guardado + estado real del server (puede haber
  // quedado encendido por el auto-arranque del bridge).
  useEffect(() => {
    try {
      const savedPort = parseInt(localStorage.getItem(MCP_PORT_KEY) || "", 10);
      if (Number.isFinite(savedPort) && savedPort > 0) setPort(savedPort);
    } catch {
      /* ignore */
    }
    api()
      ?.mcpServerStatus?.()
      .then((s) => {
        setRunning(s.running);
        setUrl(s.url);
        if (s.running && s.port) setPort(s.port);
      })
      .catch(() => {
        /* web-only: sin Electron no hay server */
      });
  }, []);

  const persist = (enabled: boolean, p: number) => {
    try {
      localStorage.setItem(MCP_ENABLED_KEY, enabled ? "1" : "0");
      localStorage.setItem(MCP_PORT_KEY, String(p));
    } catch {
      /* ignore quota */
    }
  };

  const toggle = useCallback(async () => {
    const electron = api();
    if (!electron?.mcpServerStart) {
      toast({
        variant: "destructive",
        title: "Sólo en la app de escritorio",
        description: "El servidor MCP corre dentro de la app Electron.",
      });
      return;
    }
    setBusy(true);
    try {
      if (running) {
        const s = await electron.mcpServerStop();
        setRunning(s.running);
        setUrl(s.url);
        persist(false, port);
        toast({ title: "Servidor MCP detenido" });
      } else {
        const s = await electron.mcpServerStart(port);
        if (s.error || !s.running) {
          toast({ variant: "destructive", title: "No se pudo iniciar", description: s.error });
        } else {
          setRunning(true);
          setUrl(s.url);
          persist(true, s.port);
          toast({
            title: "Servidor MCP activo",
            description: `Claude Code ya puede conectarse en ${s.url}`,
          });
        }
      }
    } finally {
      setBusy(false);
    }
  }, [running, port, toast]);

  const copyConfig = async () => {
    const cfg = clientConfigJson(port);
    try {
      if (api()?.copyToClipboard) await api()!.copyToClipboard(cfg);
      else await navigator.clipboard.writeText(cfg);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ variant: "destructive", title: "No se pudo copiar" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Plug className="w-6 h-6" /> Servidor MCP
              <span
                className={cn(
                  "ml-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                  running ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    running ? "bg-green-500" : "bg-zinc-400"
                  )}
                />
                {running ? "Activo" : "Apagado"}
              </span>
            </CardTitle>
            <CardDescription className="mt-1.5">
              Permite que <b>Claude Code / Codex</b> se conecten a esta app para diseñar
              diagramas que llegan directo al lienzo. Sólo escucha en tu equipo
              (127.0.0.1). Ver la <Link href="/mcp" className="underline text-primary">guía MCP</Link>.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-3">
          <div>
            <Label htmlFor="mcp-port">Puerto</Label>
            <Input
              id="mcp-port"
              type="number"
              min={1024}
              max={65535}
              value={port}
              disabled={running}
              onChange={(e) => setPort(parseInt(e.target.value || "0", 10) || MCP_DEFAULT_PORT)}
              className="mt-1 w-28"
            />
          </div>
          <Button onClick={toggle} disabled={busy} variant={running ? "outline" : "default"}>
            {busy ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : running ? (
              <PowerOff className="w-4 h-4 mr-2" />
            ) : (
              <Power className="w-4 h-4 mr-2" />
            )}
            {running ? "Detener" : "Activar servidor"}
          </Button>
        </div>

        {running && (
          <p className="text-xs text-muted-foreground">
            Escuchando en <code className="bg-muted rounded px-1">{url}</code>
          </p>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Configuración para el cliente (Claude Code · <code>.mcp.json</code>):
          </Label>
          <div className="relative group">
            <pre className="rounded-lg border bg-zinc-900 text-zinc-100 text-xs p-3 overflow-x-auto">
              <code>{clientConfigJson(port)}</code>
            </pre>
            <Button
              variant="outline"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7 opacity-70 group-hover:opacity-100"
              onClick={copyConfig}
              title="Copiar"
            >
              {copied ? (
                <CopyCheck className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
