"use client";

/**
 * Reglamento de una notación (spec 027 · FR-007): jerarquía de clases y
 * catálogo de predicados, tal como los ve el razonador y el agente. Todo sale
 * de `src/lib/ontology/` —acá sólo se dibuja—, así que una notación nueva
 * aparece sola.
 */

import React, { useMemo } from "react";
import { Network } from "lucide-react";
import type { NotationId } from "@/lib/notations";
import { arbolDeClases, describirTerminos, propiedadesDe, tboxDe, type NodoArbol } from "@/lib/ontology/tbox";

function Rama({ nodo, raiz = false }: { nodo: NodoArbol; raiz?: boolean }) {
  // Bajo la raíz, los tipos sin rol se listan aparte: no participan de las reglas.
  const hijos = raiz ? nodo.hijos.filter((h) => h.nivel !== "tipo") : nodo.hijos;
  return (
    <li>
      <span
        className={
          nodo.nivel === "tipo"
            ? "text-foreground"
            : nodo.nivel === "rol"
              ? "font-medium text-foreground"
              : "font-semibold text-foreground"
        }
      >
        {nodo.etiqueta}
      </span>
      {nodo.nivel === "rol" && <span className="ml-1 text-2xs text-muted-foreground">(rol)</span>}
      {hijos.length > 0 && (
        <ul className="ml-4 border-l pl-3">
          {hijos.map((h) => (
            <Rama key={h.id} nodo={h} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function OntologyReference({ notation }: { notation: NotationId }) {
  const t = useMemo(() => tboxDe(notation), [notation]);
  const arbol = useMemo(() => arbolDeClases(t), [t]);
  const sueltos = arbol.hijos.filter((h) => h.nivel === "tipo").map((h) => h.etiqueta);

  return (
    <details className="rounded-md border p-3 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-semibold">
        <Network className="h-4 w-4" /> Ontología: clases y significado de las flechas
      </summary>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Jerarquía de clases
          </h4>
          <ul className="text-xs">
            <Rama nodo={arbol} raiz />
          </ul>
          {sueltos.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Sin rol (sólo reglas universales): {sueltos.join(", ")}.
            </p>
          )}
        </div>
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Predicados</h4>
          <ul className="space-y-1.5 text-xs">
            {t.predicados.map((p) => {
              const props = propiedadesDe(p);
              return (
                <li key={p.id} title={p.descripcion}>
                  <span className="font-mono font-semibold">{p.id}</span>{" "}
                  <span className="text-muted-foreground">
                    {describirTerminos(t, p.dominio)} → {describirTerminos(t, p.rango)}
                  </span>
                  {props.length > 0 && <span className="block text-2xs text-muted-foreground">{props.join(" · ")}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </details>
  );
}
