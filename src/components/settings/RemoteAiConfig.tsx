"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Cloud, KeyRound, Check, Loader2, Trash2, ExternalLink, Cpu, Shuffle, PlugZap, Terminal } from "lucide-react";
import { publicarEstadoCli } from "@/lib/agent-cli/capability";
import { DEFAULT_COST_CAP_USD, formatoUsd, gastoSesion, guardarTope, leerTope, sumarGasto } from "@/lib/agent-cli/cost";
import { CLI_INFO, type CliStatus } from "@/lib/agent-cli/types";
import { DEFAULT_CLI } from "@/lib/ai/providers";
import { Button } from "@/components/ui/button";
import { IconAction } from "@/components/ui/icon-action";
import { accion } from "@/lib/action-labels";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  REMOTE_PROVIDERS,
  providerInfo,
  modelFor,
  loadAiSettings,
  saveAiSettings,
  type AiRemoteSettings,
  type RemoteProvider,
  type KeyStatus,
} from "@/lib/ai/remote-settings";
import {
  diagnosticarFalloDeLlave,
  veredictoLlaveOk,
  PROMPT_DE_PRUEBA,
} from "@/lib/ai/key-check";
import { hostBridge } from "@/lib/host-bridge";

const api = hostBridge;

/**
 * Configuración de IA remota (opcional). Por defecto el sistema es 100% local;
 * aquí el usuario puede activar un proveedor de nube y guardar su llave (cifrada
 * en el proceso main con safeStorage — nunca se guarda en texto plano).
 */
export function RemoteAiConfig() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AiRemoteSettings>(loadAiSettings);
  const [keyStatus, setKeyStatus] = useState<KeyStatus>({});
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [probando, setProbando] = useState(false);

  const isDesktop = !!api();
  const provider = settings.provider;
  const info = providerInfo(provider);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api()?.getAiKeyStatus?.();
      if (s) setKeyStatus(s);
    } catch {
      /* solo escritorio */
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Estado del CLI para el modo «Claude Code» (feature 021). Se pregunta al
  // main en cada apertura: el usuario pudo instalarlo con la app abierta.
  const [cli, setCli] = useState<CliStatus | null | undefined>(undefined);
  const [probandoCli, setProbandoCli] = useState(false);
  // Tope de gasto del CLI (#462): se lee al montar y se guarda al cambiarlo.
  const [topeCli, setTopeCli] = useState<number | null>(() =>
    leerTope(typeof window === "undefined" ? undefined : window.localStorage)
  );
  const [gastoCli, setGastoCli] = useState(0);
  useEffect(() => setGastoCli(gastoSesion()), [probandoCli]);
  const cambiarTope = (t: number | null) => {
    setTopeCli(t);
    guardarTope(typeof window === "undefined" ? undefined : window.localStorage, t);
  };
  useEffect(() => {
    api()
      ?.agentCliStatus?.()
      .then((s) => {
        publicarEstadoCli(s);
        setCli(s.find((x) => x.cli === DEFAULT_CLI) ?? null);
      })
      .catch(() => setCli(null));
  }, []);

  // Probar = una generación mínima por el CLI: descubre «sin sesión» antes de
  // que falle una sugerencia real.
  const probarCli = async () => {
    setProbandoCli(true);
    try {
      const r = await api()?.agentCliGenerate?.({ cli: DEFAULT_CLI, prompt: "Respondé exactamente: OK" });
      sumarGasto(r?.costUsd); // la prueba también se cobra (#462)
      if (r?.ok) toast({ title: "Claude Code responde", description: `Contestó «${r.text.slice(0, 40)}».` });
      else toast({ variant: "destructive", title: "Claude Code no respondió", description: r?.error ?? "Sin respuesta." });
    } finally {
      setProbandoCli(false);
    }
  };

  const update = (patch: Partial<AiRemoteSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveAiSettings(next);
  };

  const saveKey = async () => {
    if (!keyInput.trim()) return;
    setSaving(true);
    try {
      const res = await api()?.setAiKey?.(provider, keyInput.trim());
      if (res?.ok) {
        toast({ title: "Llave guardada", description: `${info.label} configurado (cifrado).` });
        setKeyInput("");
        await refreshStatus();
      } else {
        toast({ variant: "destructive", title: "No se guardó", description: res?.error || "Error." });
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteKey = async () => {
    await api()?.deleteAiKey?.(provider);
    toast({ title: "Llave eliminada", description: `${info.label}.` });
    await refreshStatus();
  };

  // Probar = una generación mínima por el canal que ya existe. `getAiKeyStatus`
  // sólo sabe si hay bytes guardados; una llave revocada o un modelo mal escrito
  // se descubrían recién al fallar una sugerencia real (#374).
  const probarLlave = async () => {
    const modelo = modelFor(settings, provider);
    setProbando(true);
    try {
      await api()?.remoteGenerate?.({ provider, model: modelo, prompt: PROMPT_DE_PRUEBA });
      const v = veredictoLlaveOk(provider, modelo);
      toast({ title: v.titulo, description: v.detalle });
    } catch (e) {
      const v = diagnosticarFalloDeLlave(provider, e, modelo);
      toast({ variant: "destructive", title: v.titulo, description: v.detalle });
    } finally {
      setProbando(false);
    }
  };

  const configured = !!keyStatus[provider];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-primary" /> Motor de IA
        </CardTitle>
        <CardDescription>
          ¿Dónde se procesan las peticiones de IA (sugerencias, análisis)? Por defecto,
          en tu equipo. Puedes usar un proveedor de nube; su configuración aparece al
          elegir Híbrido o Remoto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Modo: local / híbrido / remoto — selector principal, ancho completo */}
        <div className="space-y-2">
          {/* 1 columna en pantallas muy chicas; 2 en sm; 4 desde lg (responsive). */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {([
              ["local", "Local", Cpu, "En tu equipo · privado · sin internet"],
              ["hybrid", "Híbrido", Shuffle, "Ligero local · lo pesado a la nube"],
              ["remote", "Remoto", Cloud, "Todo a la nube · más potente"],
              ["cli", "Claude Code", Terminal, "Razona tu CLI · actúa la app · sin llave"],
            ] as const).map(([val, lbl, Icon, sub]) => (
              <button
                key={val}
                type="button"
                onClick={() => update({ mode: val })}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors",
                  settings.mode === val
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className={cn("h-5 w-5", settings.mode === val && "text-primary")} />
                <span className="text-sm font-medium">{lbl}</span>
                <span className="text-2xs leading-tight">{sub}</span>
              </button>
            ))}
          </div>
          {(settings.mode === "remote" || settings.mode === "hybrid") && !configured && (
            <p className="text-xs text-destructive">
              Elegiste usar la nube: configura una llave para {info.label} abajo.
            </p>
          )}
        </div>

        {/* Modo «Claude Code» (feature 021): estado del CLI y prueba. Sin llave:
            el CLI usa la sesión que el usuario ya tiene en su máquina. */}
        {settings.mode === "cli" && (
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4 text-sm">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-primary" />
              <span className="font-semibold">Claude Code como motor</span>
              {cli?.installed ? (
                <Badge variant="secondary">{cli.version ?? "instalado"}</Badge>
              ) : cli === undefined ? null : (
                <Badge variant="destructive">no instalado</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Las sugerencias, las tareas de IA y el Constructor razonan con tu Claude Code; lo que se
              escribe en el lienzo lo hace la app con sus propias herramientas y confirmaciones. Sin llave
              en la app: usa tu sesión. Cada llamada tarda unos segundos y la factura tu cuenta de Claude.
              El Analista del panel sigue en el motor local.
            </p>
            {!isDesktop && (
              <p className="rounded-md border border-warning-border bg-warning-surface px-3 py-2 text-warning-foreground">
                Sólo disponible en la app de escritorio.
              </p>
            )}
            {cli === null && (
              <p className="text-xs text-destructive">
                No encontré <code>claude</code>. Instalalo desde{" "}
                <a className="underline" href={CLI_INFO.claude.installUrl} target="_blank" rel="noreferrer">
                  {CLI_INFO.claude.installUrl}
                </a>
                ; mientras tanto se usa la IA local como respaldo.
              </p>
            )}
            {/* #462: instalado no implica sesión iniciada. */}
            {cli?.installed && cli.loggedIn === false && (
              <p className="rounded-md border border-warning-border bg-warning-surface px-3 py-2 text-xs text-warning-foreground">
                Claude Code está instalado pero sin sesión iniciada: abrí una terminal, corré <code>claude</code> y
                entrá con tu cuenta.
              </p>
            )}
            {cli?.installed && (
              <Button type="button" variant="outline" size="sm" onClick={() => void probarCli()} disabled={probandoCli}>
                {probandoCli ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
                Probar Claude Code
              </Button>
            )}
            {/* #462: tope de gasto por sesión, para el router y el chat de la ficha. */}
            <div className="space-y-1.5 border-t pt-3">
              <Label htmlFor="cli-cost-cap" className="text-xs">
                Tope de gasto por sesión de la app
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="cli-cost-cap"
                  type="number"
                  min={0.1}
                  step={0.5}
                  value={topeCli ?? ""}
                  placeholder="sin tope"
                  disabled={topeCli === null}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n > 0) cambiarTope(n);
                  }}
                  className="h-8 w-28"
                />
                <span className="text-xs text-muted-foreground">US$</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => cambiarTope(topeCli === null ? DEFAULT_COST_CAP_USD : null)}
                >
                  {topeCli === null ? "Poner tope" : "Sin tope"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Gastado en esta sesión: {formatoUsd(gastoCli)}
                {topeCli !== null ? ` de ${formatoUsd(topeCli)}` : ""}. Al llegar al tope, la app deja de llamar a
                Claude Code hasta que lo subas o reinicies la app.
              </p>
            </div>
          </div>
        )}

        {/* Configuración de nube: SOLO cuando el modo la usa (híbrido/remoto). */}
        {(settings.mode === "hybrid" || settings.mode === "remote") && (
          <div className="space-y-5 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Proveedor de nube</span>
            </div>

            {!isDesktop && (
              <p className="rounded-md border border-warning-border bg-warning-surface px-3 py-2 text-sm text-warning-foreground">
                La IA remota sólo está disponible en la app de escritorio.
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              Las llaves se guardan cifradas por el sistema (safeStorage) y nunca salen
              del proceso principal.
            </p>

            {/* Proveedor */}
            <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Proveedor</Label>
            <Select value={provider} onValueChange={(v) => update({ provider: v as RemoteProvider })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REMOTE_PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                    {keyStatus[p.id] ? " ✓" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Modelo</Label>
            <Input
              value={settings.models[provider] ?? ""}
              placeholder={info.defaultModel}
              onChange={(e) => update({ models: { ...settings.models, [provider]: e.target.value } })}
            />
          </div>
        </div>

        {/* Llave de API del proveedor seleccionado */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5">
              <KeyRound className="h-4 w-4" /> Llave de API — {info.label}
            </Label>
            {configured ? (
              <Badge variant="secondary" className="gap-1">
                <Check className="h-3 w-3 text-success" /> Configurada
              </Badge>
            ) : (
              <Badge variant="outline">No configurada</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="password"
              value={keyInput}
              placeholder={configured ? "•••••••• (reemplazar)" : "Pega tu API key"}
              onChange={(e) => setKeyInput(e.target.value)}
              disabled={!isDesktop}
            />
            <Button onClick={saveKey} disabled={!isDesktop || saving || !keyInput.trim()} className="shrink-0">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
            {configured && (
              <>
                <IconAction
                  variant="ghost"
                  onClick={probarLlave}
                  disabled={!isDesktop || probando}
                  label={accion("probar", "la llave")}
                  icon={
                    probando ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PlugZap className="h-4 w-4" />
                    )
                  }
                  className="shrink-0"
                />
                <IconAction
                  variant="ghost"
                  onClick={deleteKey}
                  disabled={!isDesktop}
                  label={accion("eliminar", "la llave")}
                  icon={<Trash2 className="h-4 w-4" />}
                  className="shrink-0 text-destructive"
                />
              </>
            )}
          </div>
          <a
            href={info.keysUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Obtener una llave de {info.label} <ExternalLink className="h-3 w-3" />
          </a>
        </div>

            <p className="text-2xs text-muted-foreground">
              Modelo efectivo: <code>{modelFor(settings, provider)}</code>. Usar la nube
              envía tus prompts (y el contexto de referencia) al proveedor elegido.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
