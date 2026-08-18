"use client";

/**
 * @fileOverview Editor Mermaid GENÉRICO: código a la izquierda, vista previa en
 * vivo a la derecha. Sirve para cualquier diagrama Mermaid (secuencia, flujo,
 * clases, estados, ER, gantt). Reutiliza `MermaidDiagram` para el render (que ya
 * muestra el error de parseo si el código es inválido).
 */

import React, { useEffect, useState } from "react";
import { MermaidDiagram } from "@/components/canvas/MermaidDiagram";
import { MERMAID_TEMPLATES } from "@/lib/mermaid/templates";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LayoutTemplate, ChevronDown } from "lucide-react";

export function MermaidEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const [code, setCode] = useState<string>(value);
  // Re-sembrar al cambiar de vista (identidad del value desde fuera).
  useEffect(() => {
    setCode(value);
  }, [value]);

  const update = (c: string) => {
    setCode(c);
    onChange(c);
  };

  return (
    <div className="flex h-full w-full">
      {/* Panel de código */}
      <div className="flex w-[44%] min-w-[320px] max-w-[640px] flex-col border-r bg-card/40">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Código Mermaid
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                <LayoutTemplate className="mr-1 h-3.5 w-3.5" /> Plantilla
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {MERMAID_TEMPLATES.map((t) => (
                <DropdownMenuItem key={t.id} onClick={() => update(t.code)}>
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <textarea
          value={code}
          onChange={(e) => update(e.target.value)}
          spellCheck={false}
          className="flex-1 resize-none bg-background p-3 font-mono text-xs leading-relaxed outline-none"
          placeholder="Escribe código Mermaid… (usa el botón Plantilla para empezar)"
        />
        <p className="border-t px-3 py-1.5 text-2xs text-muted-foreground">
          Cualquier diagrama Mermaid. Los errores de sintaxis se muestran en la vista previa.
        </p>
      </div>

      {/* Vista previa en vivo */}
      <div className="flex-1 overflow-auto bg-background p-4">
        <MermaidDiagram code={code} />
      </div>
    </div>
  );
}
