/**
 * @fileOverview Menú contextual del lienzo (clic derecho).
 *
 * No usa el menú de Radix a propósito: acá el disparador no es un elemento del
 * DOM sino un PUNTO del lienzo (un nodo SVG, un enlace o el vacío), y el menú
 * tiene que abrirse donde cayó el cursor. Es una capa `fixed` sobre coordenadas
 * de pantalla —el mismo truco que la ficha flotante del nodo— así no hay que
 * traducir viewBox/zoom/scroll.
 *
 * Se cierra con Escape, con un clic afuera, al hacer scroll y al perder el foco
 * la ventana: un menú que queda pegado tapando el diagrama es peor que no tenerlo.
 */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface CanvasMenuItem {
  id: string;
  label: string;
  /** Atajo que se muestra a la derecha (sólo informativo). */
  shortcut?: string;
  icon?: React.ElementType;
  onSelect: () => void;
  disabled?: boolean;
  /** Acción destructiva: se pinta con el token `destructive`. */
  danger?: boolean;
  /** Dibuja un separador ANTES de esta entrada. */
  separatorBefore?: boolean;
}

const MENU_W = 232; // ancho fijo: alcanza para "Duplicar" + su atajo

export const CanvasContextMenu: React.FC<{
  /** Coordenadas de PANTALLA del clic (clientX/clientY). */
  x: number;
  y: number;
  items: CanvasMenuItem[];
  onClose: () => void;
}> = ({ x, y, items, onClose }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  // Índice enfocado por teclado; -1 = nada enfocado (se navega con ↑/↓).
  const [activo, setActivo] = useState(-1);

  useEffect(() => {
    const cerrarFuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!items.some((it) => !it.disabled)) return;
        const paso = e.key === "ArrowDown" ? 1 : -1;
        const orden = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);
        setActivo((prev) => {
          const pos = orden.indexOf(prev);
          if (pos === -1) return paso > 0 ? orden[0] : orden[orden.length - 1];
          return orden[(pos + paso + orden.length) % orden.length];
        });
        return;
      }
      if (e.key === "Enter" && activo >= 0) {
        e.preventDefault();
        const item = items[activo];
        if (item && !item.disabled) {
          onClose();
          item.onSelect();
        }
      }
    };
    window.addEventListener("mousedown", cerrarFuera, true);
    window.addEventListener("keydown", tecla, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", cerrarFuera, true);
      window.removeEventListener("keydown", tecla, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose, items, activo]);

  // Alto estimado para voltear contra el borde inferior sin medir el DOM
  // (32 px por entrada + 9 por separador + padding).
  const alto = items.length * 32 + items.filter((i) => i.separatorBefore).length * 9 + 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = Math.max(4, Math.min(x, vw - MENU_W - 8));
  const top = Math.max(4, Math.min(y, vh - alto - 8));

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 overflow-hidden rounded-md border bg-popover py-1 text-popover-foreground shadow-lg"
      style={{ left, top, width: MENU_W }}
      // El clic derecho DENTRO del menú no debe abrir otro menú encima.
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <React.Fragment key={item.id}>
            {item.separatorBefore && <div className="my-1 h-px bg-border" />}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onMouseEnter={() => setActivo(i)}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                item.disabled
                  ? "cursor-not-allowed text-muted-foreground/50"
                  : item.danger
                    ? "text-destructive hover:bg-destructive/10"
                    : "hover:bg-muted",
                !item.disabled && activo === i && (item.danger ? "bg-destructive/10" : "bg-muted")
              )}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" />}
              <span className="flex-1 truncate">{item.label}</span>
              {item.shortcut && (
                <kbd className="shrink-0 font-mono text-2xs text-muted-foreground">{item.shortcut}</kbd>
              )}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};
