"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CREDIT_LINE,
  CREDIT_LINKS,
  CREDIT_LOGO,
  CREDIT_ORG,
  versionLabel,
} from "@/lib/credits";

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
 * Logo de Sofka Technologies. `<img>` plano y no `next/image`: el renderer se
 * exporta estático y se sirve por el scheme `app://`, donde el optimizador de
 * Next no aporta nada (ya está `unoptimized`) y sí añade un wrapper.
 */
export function SofkaLogo({ className }: { className?: string }) {
  return (
    <img
      src={CREDIT_LOGO}
      alt={CREDIT_ORG}
      className={cn("h-5 w-auto shrink-0 select-none", className)}
      draggable={false}
    />
  );
}

/**
 * Crédito de autoría con los enlaces de Sofka. `target="_blank"` sale al
 * navegador del sistema: el `setWindowOpenHandler` de `main/window.ts` intercepta
 * http(s) y lo delega a `shell.openExternal` (dentro de Electron no se abre otra
 * ventana de la app).
 */
export function SofkaCredits({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5 text-xs text-muted-foreground", className)}>
      <a
        href={CREDIT_LINKS[0].href}
        target="_blank"
        rel="noreferrer"
        title={CREDIT_LINKS[0].title}
        className="flex items-center gap-2 hover:text-foreground"
      >
        <SofkaLogo className="h-6" />
        <span className="leading-tight">{CREDIT_LINE}</span>
      </a>
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
