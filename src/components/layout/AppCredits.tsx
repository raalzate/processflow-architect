"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { CREDIT_AUTHOR, CREDIT_LINE, CREDIT_LINKS, versionLabel } from "@/lib/credits";

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
      <span className="leading-tight">{CREDIT_LINE}</span>
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

/** Nombre del autor, para cabeceras donde no cabe el crédito completo. */
export function AuthorName({ className }: { className?: string }) {
  return (
    <span className={cn("truncate text-2xs text-muted-foreground", className)}>
      {CREDIT_AUTHOR}
    </span>
  );
}
