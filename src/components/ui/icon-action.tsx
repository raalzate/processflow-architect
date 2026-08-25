"use client";

import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Botón de acción con el ICONO al frente: el rótulo vive en el tooltip y —del
 * MISMO string— en el nombre accesible. Un botón sólo-icono sin `aria-label` es
 * un botón mudo para el lector de pantalla, y mantener tooltip y aria-label a
 * mano es garantizar que se desincronicen; por eso acá hay un solo `label`.
 *
 * El texto visible se conserva sólo cuando hace falta (`showLabel`): acción
 * primaria de un diálogo, destructiva que confirma algo grave, o icono ambiguo.
 * Los ítems de menú (`DropdownMenu`) NO usan esto: ahí no hay tooltip que valga
 * y el texto visible es la única pista.
 *
 * El rótulo sale de `src/lib/action-labels.ts` (`accion("agregar", "vista")`):
 * el vocabulario se decide ahí, no en cada pantalla.
 */
export interface IconActionProps extends Omit<ButtonProps, "children" | "aria-label" | "title"> {
  /** Rótulo único: tooltip + `aria-label`. Ej. `accion("agregar", "vista")`. */
  label: string;
  /** El icono. Se dibuja siempre. */
  icon: React.ReactNode;
  /** true → además del icono se ve el rótulo (acción primaria o destructiva). */
  showLabel?: boolean;
  /** Lado del tooltip. */
  side?: React.ComponentProps<typeof TooltipContent>["side"];
}

export const IconAction = React.forwardRef<HTMLButtonElement, IconActionProps>(
  ({ label, icon, showLabel = false, side = "top", size, className, ...props }, ref) => {
    const boton = (
      <Button
        ref={ref}
        // Sólo-icono ⇒ caja cuadrada; con rótulo manda el tamaño que pidan.
        size={showLabel ? size ?? "sm" : size === "icon" || size === undefined ? "icon" : size}
        aria-label={label}
        className={cn(showLabel && "gap-1.5", className)}
        {...props}
      >
        {icon}
        {showLabel && <span>{label}</span>}
      </Button>
    );

    // Con el rótulo a la vista el tooltip sólo repetiría lo que ya se lee.
    if (showLabel) return boton;

    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>{boton}</TooltipTrigger>
          <TooltipContent side={side}>{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
);
IconAction.displayName = "IconAction";
