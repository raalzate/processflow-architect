"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { getNotation, swatchClass, type NotationId } from "@/lib/notations";

/**
 * Leyenda de la notación activa: qué significa cada color/forma del lienzo.
 * Sin ella, un stakeholder no descifra el código visual (Evento naranja,
 * Comando azul…). Colapsable para no robar espacio; arranca cerrada y recuerda
 * el estado en la sesión del componente. Se ancla abajo-izquierda del lienzo.
 */
export function NotationLegend({ notation }: { notation: NotationId }) {
  const [open, setOpen] = useState(false);
  const n = getNotation(notation);

  return (
    <div className="absolute bottom-4 left-4 z-20 max-w-[240px] overflow-hidden rounded-lg border bg-card/95 shadow-md backdrop-blur">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        title={open ? "Ocultar leyenda" : "Mostrar leyenda de la notación"}
      >
        <span className="flex items-center gap-1.5">
          <Palette className="h-3.5 w-3.5 text-primary" /> Leyenda · {n.label}
        </span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="max-h-[40vh] overflow-y-auto border-t px-3 py-2">
          {n.paletteGroups.map((g) => (
            <div key={g.label} className="mb-2 last:mb-0">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {g.label}
              </p>
              <ul className="space-y-1">
                {g.types.map((type) => {
                  const el = n.elements.find((e) => e.type === type);
                  if (!el) return null;
                  return (
                    <li key={type} className="flex items-center gap-2 text-xs">
                      <span
                        className={cn(
                          "h-3 w-3 shrink-0 rounded-sm border border-black/10",
                          swatchClass(el)
                        )}
                      />
                      <span className="truncate text-foreground/80" title={type}>
                        {type}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
