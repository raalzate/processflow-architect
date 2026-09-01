"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Download, ExternalLink, FolderOpen, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { CREDIT_LINE, CREDIT_LINKS, versionLabel } from "@/lib/credits";
import { etiquetaBreve } from "@/lib/update-check";
import { useUpdateStatus } from "@/hooks/use-update-status";

/**
 * Badge de estado de la release. La app es beta: se dice en la UI, no sólo en el
 * changelog, para que nadie confunda un lienzo experimental con uno estable.
 */
export function BetaBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "px-1.5 py-0 text-2xs font-medium uppercase tracking-wide text-muted-foreground",
        className
      )}
      title={`Versión ${versionLabel()} — funcionalidad en evolución`}
    >
      beta
    </Badge>
  );
}

/**
 * Crédito de autoría. `target="_blank"` sale al programa del sistema: el
 * `setWindowOpenHandler` de `main/window.ts` intercepta http(s) y mailto y lo
 * delega a `shell.openExternal` (dentro de Electron no se abre otra ventana).
 */
export function AppCredits({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5 text-xs text-muted-foreground", className)}>
      <span className="leading-tight">
        {CREDIT_LINE}
        <UpdateHint />
      </span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-0.5">
        {CREDIT_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            title={link.title}
            className="inline-flex items-center gap-1 text-2xs text-primary hover:underline"
          >
            {link.label}
            <ExternalLink className="h-3 w-3" />
          </a>
        ))}
      </div>
    </div>
  );
}

/**
 * Aviso de versión nueva, al lado del número de versión en el pie del sidebar.
 *
 * Antes era un botón grande en la barra superior, compitiendo con las
 * herramientas justo donde se trabaja (#231). Acá el dato de versión ya vive: una
 * versión nueva es información de la misma familia, y quien no quiera atenderla
 * puede seguir trabajando sin que le ocupe la barra. Al día no se pinta nada.
 */
function UpdateHint() {
  const { estado, actuar } = useUpdateStatus();
  const texto = etiquetaBreve(estado);
  if (!texto) return null;

  const descargando = estado.tipo === "descargando";
  const Icono =
    estado.tipo === "lista"
      ? RotateCcw
      : estado.tipo === "descargada"
        ? FolderOpen
        : estado.tipo === "fallo"
          ? RefreshCw
          : Download;

  return (
    <>
      {" · "}
      <button
        type="button"
        onClick={actuar}
        disabled={descargando}
        title={
          estado.tipo === "descargada"
            ? `El instalador quedó en ${estado.ruta} — abrilo para instalar`
            : texto
        }
        className="inline-flex items-center gap-1 align-baseline text-primary hover:underline disabled:cursor-default disabled:no-underline disabled:opacity-70"
      >
        {descargando ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Icono className="h-3 w-3" />
        )}
        {texto}
      </button>
    </>
  );
}
