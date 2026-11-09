"use client";

/**
 * Pestaña «Conocimiento» de la ficha del elemento (spec 027 · US3, T18).
 *
 * Muestra lo que el razonador DEDUJO de esta caja —sus clases heredadas y las
 * relaciones que se siguen del diagrama y del reglamento— y, a pedido, por qué.
 * Lo deducido no se dibuja en el lienzo ni se guarda (FR-017): se recalcula con
 * un debounce de 300 ms después de cada edición, sobre el proyecto entero con
 * la vista abierta tal como está en el lienzo. La lectura legible vive en
 * `src/lib/ontology/ficha.ts`; acá sólo se pinta.
 */

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import type { NotationId } from "@/lib/notations";
import {
  PROYECTO_SUELTO,
  construirConocimiento,
  deducidosDe,
  explicacionLegible,
  iriElemento,
  type Conocimiento,
  type Tripleta,
} from "@/lib/ontology";
import type { DesignView } from "@/lib/views-types";
import { canvasToGraphData, type DesignerLink, type DesignerNode } from "./serialize";

/** Recalcular en cada tecla trabaría la ficha: se espera a que el humano pare. */
export const DEBOUNCE_CONOCIMIENTO_MS = 300;

/** Id con que entra la vista abierta cuando no es una vista guardada (el modelo del proyecto). */
const VISTA_LIENZO = "lienzo";

const REGLA: Record<string, string> = {
  subclase: "clase heredada",
  dominio: "dominio del predicado",
  rango: "rango del predicado",
  inversa: "inversa",
  transitiva: "cadena transitiva",
  simetrica: "simetría",
  subpropiedad: "predicado más general",
  equivalencia: "es el mismo que",
};

export const KnowledgeTab: React.FC<{
  elementId: string;
  nodes: Map<string, DesignerNode>;
  links: Map<string, DesignerLink>;
  notation: NotationId;
  /** Vistas del proyecto: el conocimiento se arma con todas (FR-014, alcance proyecto). */
  vistas: DesignView[];
  vistaActivaId: string | null;
  activo: boolean;
}> = ({ elementId, nodes, links, notation, vistas, vistaActivaId, activo }) => {
  const [k, setK] = useState<Conocimiento | null>(null);
  const vistaId = vistaActivaId ?? VISTA_LIENZO;

  useEffect(() => {
    if (!activo) return;
    const t = setTimeout(() => {
      // La vista abierta entra como está en el LIENZO, no como se guardó.
      const lienzo: DesignView = {
        id: vistaId,
        name: "Lienzo",
        kind: "graph",
        notation,
        graph: canvasToGraphData(nodes, links, { nombre_proyecto: PROYECTO_SUELTO, fecha_analisis: "", notation }),
        createdAt: "",
      };
      const otras = vistas.filter((v) => v.id !== vistaId);
      setK(construirConocimiento({ proyecto: PROYECTO_SUELTO, vistas: [...otras, lienzo] }, { tipo: "proyecto" }));
    }, DEBOUNCE_CONOCIMIENTO_MS);
    return () => clearTimeout(t);
  }, [activo, nodes, links, notation, vistas, vistaId]);

  const iri = iriElemento(PROYECTO_SUELTO, vistaId, elementId);
  const filas = useMemo(() => (k ? deducidosDe(k, iri) : []), [k, iri]);

  if (!k) return <p className="text-sm text-muted-foreground">Razonando…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-medium">Deducido</h3>
        <span className="text-xs text-muted-foreground">
          {filas.length} hecho(s) · no se dibujan ni se guardan
        </span>
      </div>
      {k.topeAlcanzado && (
        <p className="text-xs text-destructive">El razonador llegó a su tope: lo deducido está incompleto.</p>
      )}
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nada se deduce de este elemento con lo que hay dibujado. Confirmar el significado de sus relaciones ayuda.
        </p>
      ) : (
        <ul className="space-y-1">
          {filas.map((f) => (
            <FilaConPorque key={f.tripleta.join(" ")} k={k} tripleta={f.tripleta} texto={f.texto} />
          ))}
        </ul>
      )}
    </div>
  );
};

const FilaConPorque: React.FC<{ k: Conocimiento; tripleta: Tripleta; texto: string }> = ({ k, tripleta, texto }) => {
  const [abierta, setAbierta] = useState(false);
  const lineas = useMemo(() => (abierta ? explicacionLegible(k, tripleta) : undefined), [abierta, k, tripleta]);
  return (
    <li className="rounded-md border px-2 py-1.5 text-sm">
      <div className="flex items-start justify-between gap-2">
        <span>{texto}</span>
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {abierta ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          ¿Por qué?
        </button>
      </div>
      {lineas && (
        <ul className="mt-1.5 space-y-0.5 border-l pl-2">
          {lineas.slice(1).map((l, i) => (
            <li key={i} className="text-xs" style={{ paddingLeft: `${(l.nivel - 1) * 0.75}rem` }}>
              <span className={l.dibujado ? "text-foreground" : "text-muted-foreground"}>{l.texto}</span>
              {l.dibujado ? (
                <span className="ml-1.5 text-muted-foreground">· dibujado</span>
              ) : (
                l.regla && (
                  <span className="ml-1.5 text-muted-foreground" title={l.axioma}>
                    · {REGLA[l.regla] ?? l.regla}
                  </span>
                )
              )}
            </li>
          ))}
          {lineas[0].regla && (
            <li className="text-xs text-muted-foreground" title={lineas[0].axioma}>
              ⇒ por {REGLA[lineas[0].regla] ?? lineas[0].regla}
            </li>
          )}
        </ul>
      )}
    </li>
  );
};
