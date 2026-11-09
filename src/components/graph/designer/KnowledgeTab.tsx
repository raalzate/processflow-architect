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
 *
 * «Vínculos» (US6): la misma caja en otras vistas. Se SUGIEREN por nombre
 * (`links.ts`) y sólo cuentan si el humano los acepta; descartar uno lo guarda
 * como rechazado para no volver a ofrecerlo.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Link2, Loader2, Sparkles, X } from "lucide-react";
import { useAi } from "@/hooks/useAi";
import { MAX_CANDIDATOS_VINCULO, suggestEquivalencesTask } from "@/lib/ai/tasks";
import type { NotationId } from "@/lib/notations";
import {
  PROYECTO_SUELTO,
  construirConocimiento,
  deducidosDe,
  explicacionLegible,
  idVinculo,
  iriElemento,
  sugerirVinculos,
  validarVinculo,
  type Conocimiento,
  type Tripleta,
  type VinculoSugerido,
} from "@/lib/ontology";
import type { DesignView, ExtremoVinculo, VinculoVistas } from "@/lib/views-types";
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
  /** Vínculos decididos del proyecto; `onVinculos` los reemplaza (aceptar, descartar, quitar). */
  vinculos?: VinculoVistas[];
  onVinculos?: (next: VinculoVistas[]) => void;
}> = ({ elementId, nodes, links, notation, vistas, vistaActivaId, activo, vinculos = [], onVinculos }) => {
  const [k, setK] = useState<Conocimiento | null>(null);
  const { run, busy } = useAi();
  const [deIA, setDeIA] = useState<VinculoSugerido[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  // Otra caja: lo que propuso la IA era para la anterior.
  useEffect(() => {
    setDeIA([]);
    setAviso(null);
  }, [elementId, vistaActivaId]);
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
      setK(construirConocimiento({ proyecto: PROYECTO_SUELTO, vistas: [...otras, lienzo], vinculos }, { tipo: "proyecto" }));
    }, DEBOUNCE_CONOCIMIENTO_MS);
    return () => clearTimeout(t);
  }, [activo, nodes, links, notation, vistas, vistaId, vinculos]);

  const iri = iriElemento(PROYECTO_SUELTO, vistaId, elementId);
  const filas = useMemo(() => (k ? deducidosDe(k, iri) : []), [k, iri]);

  if (!k) return <p className="text-sm text-muted-foreground">Razonando…</p>;

  const esEste = (e: ExtremoVinculo) => e.vista === vistaId && e.nodo === elementId;
  const porNombre = onVinculos ? sugerirVinculos(k, vinculos).filter((v) => esEste(v.a) || esEste(v.b)) : [];
  const decididos = new Set(vinculos.map((v) => v.id));
  const sugeridos = [...porNombre, ...deIA.filter((v) => !decididos.has(v.id) && !porNombre.some((p) => p.id === v.id))];
  const aceptados = vinculos.filter((v) => v.estado === "aceptado" && (esEste(v.a) || esEste(v.b)));
  const nombreDeVista = (id: string) => vistas.find((v) => v.id === id)?.name ?? id;
  const otro = (v: { a: ExtremoVinculo; b: ExtremoVinculo }) => {
    const e = esEste(v.a) ? v.b : v.a;
    const el = k.elementos.find((x) => x.iri === iriElemento(PROYECTO_SUELTO, e.vista, e.nodo));
    return `«${el?.nombre ?? e.nodo}» en ${nombreDeVista(e.vista)}`;
  };
  const lectura = (v: { tipo: string; a: ExtremoVinculo }) =>
    v.tipo === "es_mismo_que" ? "es el mismo que" : esEste(v.a) ? "realiza" : "es realizado por";
  const decidir = (v: VinculoSugerido, estado: VinculoVistas["estado"]) => {
    const h = estado === "aceptado" ? validarVinculo(k, v, PROYECTO_SUELTO) : null;
    if (h) {
      setAviso(`${h.mensaje}${h.sugerencia ? ` ${h.sugerencia}` : ""}`);
      return;
    }
    setAviso(null);
    onVinculos?.([
      ...vinculos,
      { id: v.id, tipo: v.tipo, a: v.a, b: v.b, estado, procedencia: { por: v.razon.startsWith("IA: ") ? "ia" : "humano", fecha: new Date().toISOString() } },
    ]);
  };
  const propio = k.elementos.find((e) => e.iri === iriElemento(PROYECTO_SUELTO, vistaId, elementId));
  const buscarConIA = async () => {
    if (!propio) return;
    const candidatos = k.elementos
      .filter((e) => e.vista !== vistaId)
      .slice(0, MAX_CANDIDATOS_VINCULO)
      .map((e) => ({ id: `${e.vista}/${e.id}`, nombre: e.nombre, tipo: e.tipo, vista: nombreDeVista(e.vista), extremo: { vista: e.vista, nodo: e.id } }));
    const pedidaPara = elementId;
    const pares = await run(suggestEquivalencesTask, {
      elemento: { id: `${vistaId}/${elementId}`, nombre: propio.nombre, tipo: propio.tipo, vista: nombreDeVista(vistaId) },
      candidatos,
      notation,
    });
    if (!pares || pedidaPara !== elementId) return;
    const a = { vista: vistaId, nodo: elementId };
    setDeIA(
      pares.flatMap((p) => {
        const c = candidatos.find((x) => x.id === p.candidato);
        return c ? [{ id: idVinculo(p.tipo, a, c.extremo), tipo: p.tipo, a, b: c.extremo, razon: `IA: ${p.razon || "concepto relacionado"}` }] : [];
      })
    );
  };

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
      {onVinculos && (
        <div className="space-y-1.5 border-t pt-3">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden />
            <h3 className="text-sm font-medium">En otras vistas</h3>
            {k.vistas.length > 1 && (
              <button
                type="button"
                onClick={buscarConIA}
                disabled={busy}
                title="La IA busca en las otras vistas lo que podría ser este mismo concepto; vos decidís"
                className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Buscar con IA
              </button>
            )}
          </div>
          {aceptados.length === 0 && sugeridos.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin vínculos con otras vistas.</p>
          )}
          {aviso && <p className="text-xs text-destructive">{aviso}</p>}
          <ul className="space-y-1">
            {aceptados.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm">
                <span>
                  {lectura(v)} {otro(v)}
                </span>
                <button
                  type="button"
                  onClick={() => onVinculos(vinculos.filter((x) => x.id !== v.id))}
                  title="Quitar el vínculo"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {sugeridos.map((v) => (
              <li key={v.id} className="rounded-md border border-dashed px-2 py-1.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <span className="text-muted-foreground">¿</span>
                    {lectura(v)} {otro(v)}
                    <span className="text-muted-foreground">?</span>
                  </span>
                  <span className="flex shrink-0 gap-2 text-xs">
                    <button type="button" onClick={() => decidir(v, "aceptado")} className="inline-flex items-center gap-1 hover:text-foreground">
                      <Check className="h-3.5 w-3.5" /> Vincular
                    </button>
                    <button
                      type="button"
                      onClick={() => decidir(v, "rechazado")}
                      title="Descartar: no se vuelve a sugerir"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Descartar
                    </button>
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{v.razon}</p>
              </li>
            ))}
          </ul>
        </div>
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
