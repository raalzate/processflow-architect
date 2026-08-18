"use client";

/**
 * @fileOverview Bloque de código con botón de copiar.
 *
 * Existía tres veces —guía MCP, configuración del servidor y playground— con
 * radios distintos y el color cableado a mano, así que el mismo JSON se
 * veía de tres maneras según la pantalla. Acá vive una sola vez y sobre el token
 * `code` del tema (spec 003, FR-004).
 */

import React, { useState } from "react";
import { Copy, CopyCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function CodeBlock({
  code,
  className,
  /** Aire interior: `sm` dentro de una tarjeta, `md` en el cuerpo de una página. */
  size = "md",
}: {
  code: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      // En la app de escritorio el portapapeles va por el proceso main; en el
      // navegador, por la API estándar.
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
    <div className={cn("relative group", className)}>
      <pre
        className={cn(
          "rounded-md border bg-code text-code-foreground font-code text-xs overflow-x-auto",
          size === "sm" ? "p-3" : "p-4",
        )}
      >
        <code>{code}</code>
      </pre>
      <Button
        variant="outline"
        size="icon"
        className="absolute top-2 right-2 h-7 w-7 opacity-70 group-hover:opacity-100"
        onClick={copy}
        title="Copiar"
      >
        {copied ? (
          <CopyCheck className="h-3.5 w-3.5 text-success" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
