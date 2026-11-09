"use client";

/**
 * Selector «Significado» de la ficha de relación (spec 027 · US2).
 *
 * La etiqueta de la flecha sigue siendo libre; acá se ve —y se confirma— qué
 * SIGNIFICA para la ontología. Mientras nadie confirma, el predicado es una
 * propuesta en memoria (FR-013): elegirlo o cambiarlo es lo único que lo
 * escribe en el proyecto. La lógica vive en `src/lib/ontology/predicate-guess.ts`.
 *
 * «Sugerir con IA» (T27) es para la etiqueta ambigua: la IA elige de los
 * compatibles y su elección queda como PROPUESTA con su razón; se guarda sólo
 * si el humano la acepta.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, Sparkles, X } from "lucide-react";
import { useAi } from "@/hooks/useAi";
import { suggestPredicateTask } from "@/lib/ai/tasks";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { NotationId } from "@/lib/notations";
import { predicadoDe, predicadosCompatibles, sugerirPredicado, tboxDe, validarPredicado, type Confianza } from "@/lib/ontology";
import type { DesignerLink, DesignerNode } from "./serialize";

const CONFIANZA: Record<Confianza, string> = {
  confirmado: "confirmado",
  alta: "propuesto · confianza alta",
  media: "propuesto · confianza media",
  generica: "propuesto · genérico (no hay lectura segura)",
};

export const PredicateSelect: React.FC<{
  link: DesignerLink;
  source?: DesignerNode;
  target?: DesignerNode;
  notation: NotationId;
  /** `undefined` = quitar: vuelve a ser una propuesta en memoria. */
  onChange: (predicado: string | undefined) => void;
}> = ({ link, source, target, notation, onChange }) => {
  const t = tboxDe(notation);
  const { run, busy } = useAi();
  const [propuestaIA, setPropuestaIA] = useState<{ predicado: string; razon: string } | null>(null);
  // Otra relación (o la misma confirmada): la propuesta anterior ya no aplica.
  useEffect(() => setPropuestaIA(null), [link.id, link.predicado]);
  const linkActual = useRef(link.id);
  linkActual.current = link.id;
  const sugerencia = useMemo(
    () => (source && target ? sugerirPredicado(link, source, target, notation) : null),
    [link, source, target, notation]
  );
  const compatibles = useMemo(
    () => (source && target ? predicadosCompatibles(source.tipo_elemento, target.tipo_elemento, notation) : []),
    [source, target, notation]
  );
  if (!source || !target || !sugerencia) return null;

  const sugerirConIA = async () => {
    const pedidaPara = link.id;
    const r = await run(suggestPredicateTask, {
      etiqueta: link.descripcion,
      origen: { nombre: source.nombre, tipo: source.tipo_elemento },
      destino: { nombre: target.nombre, tipo: target.tipo_elemento },
      compatibles: compatibles.map((p) => ({ id: p.id, etiqueta: p.etiqueta, descripcion: p.descripcion })),
      notation,
    });
    // Una respuesta que llega tarde (ya se abrió otra relación) o fuera de los
    // compatibles no se ofrece: «Aceptar» la escribiría donde no corresponde.
    if (pedidaPara !== linkActual.current || (r && !compatibles.some((p) => p.id === r.predicado))) return;
    setPropuestaIA(r);
  };
  const etiquetaDe = (id: string) => t.predicados.find((p) => p.id === id)?.etiqueta ?? id;

  const actual = sugerencia.id;
  // Un predicado guardado que la notación ya no conoce (se cambió la notación de
  // la vista) no puede quedar invisible: sigue en el proyecto y se tiene que poder quitar.
  const huerfano = !!link.predicado && !predicadoDe(t, link.predicado);
  const confirmado = sugerencia.confianza === "confirmado" || huerfano;
  // Un predicado confirmado que ya no corresponde (cambió el tipo de un extremo)
  // se avisa con los compatibles: no se corrige solo (US2-AC2).
  const hallazgo = huerfano
    ? validarPredicado(link.predicado!, source.tipo_elemento, target.tipo_elemento, notation)
    : confirmado
      ? validarPredicado(actual, source.tipo_elemento, target.tipo_elemento, notation)
      : null;
  // El confirmado aparece aunque no sea compatible, para que se vea qué hay.
  const opciones = compatibles.some((p) => p.id === actual)
    ? compatibles
    : [...(t.predicados.filter((p) => p.id === actual)), ...compatibles];

  return (
    <div className="mt-4 space-y-1.5">
      <Label htmlFor="link-predicate">Significado</Label>
      <div className="flex items-center gap-2">
        <Select value={actual} onValueChange={(v) => onChange(v)}>
          <SelectTrigger id="link-predicate" className="flex-1" title={t.predicados.find((p) => p.id === actual)?.descripcion}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {opciones.map((p) => (
              <SelectItem key={p.id} value={p.id} title={p.descripcion}>
                {p.etiqueta} <span className="font-mono text-muted-foreground">({p.id})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {confirmado ? (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            title="Quitar: el significado vuelve a proponerse desde la etiqueta"
            className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Quitar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onChange(actual)}
            title="Confirmar la propuesta: queda guardada en el proyecto"
            className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Check className="h-3.5 w-3.5" /> Confirmar
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{CONFIANZA[sugerencia.confianza]}. La etiqueta visible no cambia.</p>
        {compatibles.length > 1 && (
          <button
            type="button"
            onClick={sugerirConIA}
            disabled={busy}
            title="La IA elige entre los significados compatibles; vos decidís si se guarda"
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Sugerir con IA
          </button>
        )}
      </div>
      {propuestaIA && propuestaIA.predicado !== link.predicado && (
        <div className="flex items-start justify-between gap-2 rounded-md border bg-muted/50 px-2 py-1.5 text-xs">
          <span>
            La IA propone <strong>{etiquetaDe(propuestaIA.predicado)}</strong>
            {propuestaIA.razon ? `: ${propuestaIA.razon}` : "."}
          </span>
          <span className="flex shrink-0 gap-1">
            <button type="button" onClick={() => onChange(propuestaIA.predicado)} className="inline-flex items-center gap-1 hover:text-foreground">
              <Check className="h-3.5 w-3.5" /> Aceptar
            </button>
            <button type="button" onClick={() => setPropuestaIA(null)} title="Descartar la propuesta" className="hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      )}
      {hallazgo && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {hallazgo.mensaje} {hallazgo.sugerencia}
          </span>
        </p>
      )}
    </div>
  );
};
