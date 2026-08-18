"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Cloud, KeyRound, Check, Loader2, Trash2, ExternalLink, Cpu, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const api = () => (typeof window !== "undefined" ? window.electronAPI : undefined);

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
          {/* 1 columna en pantallas muy chicas; 3 a partir de sm (responsive). */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              ["local", "Local", Cpu, "En tu equipo · privado · sin internet"],
              ["hybrid", "Híbrido", Shuffle, "Ligero local · lo pesado a la nube"],
              ["remote", "Remoto", Cloud, "Todo a la nube · más potente"],
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

        {/* Configuración de nube: SOLO cuando el modo la usa (híbrido/remoto). */}
        {settings.mode !== "local" && (
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
              <Button
                variant="ghost"
                size="icon"
                onClick={deleteKey}
                disabled={!isDesktop}
                title="Eliminar llave"
                className="shrink-0 text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
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
