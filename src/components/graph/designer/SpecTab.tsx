"use client";

/**
 * @fileOverview Tab «Spec» de la ficha de elemento: el contrato de la caja.
 *
 * La ficha decía qué es el elemento y dónde vive; acá se escribe **qué debe
 * hacer y cómo se sabe que quedó bien**: historias de usuario priorizadas con
 * escenarios Given/When/Then, casos límite, requisitos funcionales, entidades
 * clave y criterios de éxito.
 *
 * Vive en su propio archivo porque `ComponentDesigner.tsx` ya pasa las 3 800
 * líneas: meterlo ahí adentro sólo lo empeora. Este componente ORQUESTA; todo lo
 * que decide (qué cuenta como spec vacía, cómo se numeran los FR/SC visibles,
 * cómo se serializa a markdown) vive en `src/lib/element-spec.ts`.
 *
 * Dos cosas que no son obvias:
 *
 *  - El `onChange` entrega `undefined` cuando la spec quedó vacía. Así el
 *    elemento no guarda un objeto de spec por haber abierto el tab una vez, y
 *    los proyectos existentes no cambian de forma.
 *  - Los `FR-001`/`SC-001` que se ven salen de la POSICIÓN (`etiqueta`), no de un
 *    campo: borrar el del medio nunca deja un hueco y no hay nada que renumerar.
 */

import React, { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardCopy,
  Download,
  HelpCircle,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { IconAction } from "@/components/ui/icon-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { accion } from "@/lib/action-labels";
import {
  MAX_ESCENARIOS_POR_HISTORIA,
  MAX_HISTORIAS,
  MAX_ITEMS_LISTA,
  SPEC_STATUSES,
  emptySpec,
  etiqueta,
  isSpecEmpty,
  moveItem,
  nextPriority,
  nuevaEntidad,
  nuevaHistoria,
  nuevoCriterio,
  nuevoEscenario,
  nuevoRequisito,
  specFileName,
  specToMarkdown,
  specWithSeededDate,
  type ElementSpec,
  type SpecStory,
} from "@/lib/element-spec";
import { cn } from "@/lib/utils";

/** Fecha de hoy en ISO corto, que es lo que guarda `createdAt`. */
const hoyISO = (): string => new Date().toISOString().slice(0, 10);

/** Sección plegable con su contador. El plegado es de la sesión: no se guarda. */
const Seccion: React.FC<{
  titulo: string;
  ayuda?: string;
  cantidad: number;
  children: React.ReactNode;
  onAdd?: () => void;
  addLabel?: string;
  defaultOpen?: boolean;
}> = ({ titulo, ayuda, cantidad, children, onAdd, addLabel, defaultOpen = true }) => {
  const [abierta, setAbierta] = useState(defaultOpen);
  return (
    <section className="rounded-md border bg-muted/20">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setAbierta((a) => !a)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-medium"
          aria-expanded={abierta}
        >
          {abierta ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{titulo}</span>
          {cantidad > 0 && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 text-2xs text-muted-foreground">
              {cantidad}
            </span>
          )}
        </button>
        {onAdd && (
          <IconAction
            type="button"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            label={addLabel ?? accion("agregar")}
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setAbierta(true);
              onAdd();
            }}
          />
        )}
      </div>
      {abierta && (
        <div className="space-y-2 border-t px-2 py-2">
          {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
          {children}
        </div>
      )}
    </section>
  );
};

/** Botonera de fila: subir · bajar · quitar. El patrón es el de «Referencias». */
const FilaAcciones: React.FC<{
  indice: number;
  total: number;
  onMover: (desde: number, hasta: number) => void;
  onQuitar: () => void;
  quitarLabel: string;
}> = ({ indice, total, onMover, onQuitar, quitarLabel }) => (
  <div className="flex shrink-0 items-center gap-0.5">
    <button
      type="button"
      title="Subir"
      disabled={indice === 0}
      onClick={() => onMover(indice, indice - 1)}
      className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
    >
      <ChevronUp className="h-3.5 w-3.5" />
    </button>
    <button
      type="button"
      title="Bajar"
      disabled={indice === total - 1}
      onClick={() => onMover(indice, indice + 1)}
      className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
    >
      <ChevronDown className="h-3.5 w-3.5" />
    </button>
    <button
      type="button"
      title={quitarLabel}
      onClick={onQuitar}
      className="rounded p-1 text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  </div>
);

/** Una historia de usuario con sus escenarios. */
const HistoriaCard: React.FC<{
  historia: SpecStory;
  indice: number;
  total: number;
  onChange: (h: SpecStory) => void;
  onMover: (desde: number, hasta: number) => void;
  onQuitar: () => void;
}> = ({ historia, indice, total, onChange, onMover, onQuitar }) => {
  const [abierta, setAbierta] = useState(true);
  const set = (parche: Partial<SpecStory>) => onChange({ ...historia, ...parche });
  const escenarios = historia.escenarios;

  return (
    <div className="rounded-md border bg-background p-2">
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={() => setAbierta((a) => !a)}
          className="mt-1.5 shrink-0 text-muted-foreground hover:text-foreground"
          aria-expanded={abierta}
          title={abierta ? "Colapsar historia" : "Expandir historia"}
        >
          {abierta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <Input
          value={historia.titulo}
          onChange={(e) => set({ titulo: e.target.value })}
          placeholder={`Historia ${indice + 1} — título breve`}
          className="h-8"
        />
        <Input
          value={historia.prioridad}
          onChange={(e) => set({ prioridad: e.target.value })}
          title="Prioridad (P1 es la más crítica)"
          className="h-8 w-16 shrink-0 text-center"
        />
        <FilaAcciones
          indice={indice}
          total={total}
          onMover={onMover}
          onQuitar={onQuitar}
          quitarLabel={accion("eliminar", "historia de usuario")}
        />
      </div>

      {abierta && (
        <div className="mt-2 space-y-2 pl-5">
          <Textarea
            value={historia.porQue}
            onChange={(e) => set({ porQue: e.target.value })}
            placeholder="Por qué esta prioridad: qué valor entrega y por qué va antes que las otras"
            className="min-h-[56px] text-sm"
          />
          <Textarea
            value={historia.pruebaIndependiente}
            onChange={(e) => set({ pruebaIndependiente: e.target.value })}
            placeholder="Prueba independiente: cómo se verifica esta historia sola, sin las demás"
            className="min-h-[56px] text-sm"
          />

          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Escenarios de aceptación
            </Label>
            <IconAction
              type="button"
              variant="ghost"
              className="h-7 w-7"
              disabled={escenarios.length >= MAX_ESCENARIOS_POR_HISTORIA}
              label={accion("agregar", "escenario Given/When/Then")}
              icon={<Plus className="h-4 w-4" />}
              onClick={() => set({ escenarios: [...escenarios, nuevoEscenario()] })}
            />
          </div>

          {escenarios.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Sin escenarios la historia no se puede verificar: agregá al menos uno.
            </p>
          )}

          {escenarios.map((e, j) => (
            <div key={e.id} className="rounded-md border bg-muted/30 p-2">
              <div className="flex items-center justify-between">
                <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                  Escenario {j + 1}
                </span>
                <FilaAcciones
                  indice={j}
                  total={escenarios.length}
                  onMover={(desde, hasta) => set({ escenarios: moveItem(escenarios, desde, hasta) })}
                  onQuitar={() => set({ escenarios: escenarios.filter((x) => x.id !== e.id) })}
                  quitarLabel={accion("eliminar", "escenario")}
                />
              </div>
              <div className="mt-1 space-y-1">
                {(
                  [
                    ["given", "Dado", "el estado inicial"],
                    ["when", "Cuando", "la acción"],
                    ["then", "Entonces", "el resultado esperado"],
                  ] as const
                ).map(([campo, rotulo, pista]) => (
                  <div key={campo} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-2xs font-semibold uppercase text-muted-foreground">
                      {rotulo}
                    </span>
                    <Input
                      value={e[campo]}
                      onChange={(ev) =>
                        set({
                          escenarios: escenarios.map((x) =>
                            x.id === e.id ? { ...x, [campo]: ev.target.value } : x
                          ),
                        })
                      }
                      placeholder={pista}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export interface SpecTabProps {
  /** Especificación del elemento (o `undefined` si todavía no tiene). */
  value?: ElementSpec;
  /** Autoguardado: llega `undefined` cuando la spec quedó vacía. */
  onChange: (spec: ElementSpec | undefined) => void;
  /** Nombre del elemento: es el respaldo del título y del nombre de archivo. */
  elementName: string;
  /** Pide un borrador a la IA. Ausente → no se dibuja el botón. */
  onSuggest?: () => Promise<ElementSpec | undefined>;
  /** Botón «Sugerir» del tab (lo dibuja el llamador para reusar su estilo). */
  suggestButton?: React.ReactNode;
  /** Borrador propuesto por la IA en espera de «Aplicar»/«Descartar». */
  propuesta?: ElementSpec | null;
  onAplicarPropuesta?: () => void;
  onDescartarPropuesta?: () => void;
  /** Aviso de copiado/exportado (lo muestra el llamador con su toast). */
  onCopiar?: (markdown: string) => void;
  onExportar?: (markdown: string, filename: string) => void;
}

export const SpecTab: React.FC<SpecTabProps> = ({
  value,
  onChange,
  elementName,
  suggestButton,
  propuesta,
  onAplicarPropuesta,
  onDescartarPropuesta,
  onCopiar,
  onExportar,
}) => {
  const spec = value ?? emptySpec();

  /**
   * Un cambio del usuario: siembra la fecha si es el primer dato y devuelve
   * `undefined` cuando la spec quedó vacía (así no se persiste un objeto por
   * haber tecleado y borrado).
   */
  const set = (parche: Partial<ElementSpec>) => {
    const siguiente = specWithSeededDate({ ...spec, ...parche }, hoyISO());
    onChange(isSpecEmpty(siguiente) ? undefined : siguiente);
  };

  const markdown = useMemo(() => specToMarkdown(spec, elementName), [spec, elementName]);
  const vacia = isSpecEmpty(spec);

  return (
    <div className="space-y-3">
      {/* Encabezado: de qué feature habla esta caja. */}
      <div className="space-y-2 rounded-md border bg-muted/20 p-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="spec-feature" className="text-xs uppercase tracking-wide text-muted-foreground">
            Nombre de la feature
          </Label>
          {suggestButton}
        </div>
        <Input
          id="spec-feature"
          value={spec.featureName}
          onChange={(e) => set({ featureName: e.target.value })}
          placeholder={elementName.trim() || "Cobro recurrente"}
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="spec-fecha" className="text-2xs uppercase tracking-wide text-muted-foreground">
              Creado
            </Label>
            <Input
              id="spec-fecha"
              value={spec.createdAt ?? ""}
              onChange={(e) => set({ createdAt: e.target.value.trim() || undefined })}
              placeholder="YYYY-MM-DD"
              className="h-8"
            />
          </div>
          <div>
            <Label className="text-2xs uppercase tracking-wide text-muted-foreground">Estado</Label>
            <Select value={spec.status} onValueChange={(v) => set({ status: v as ElementSpec["status"] })}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPEC_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="spec-input" className="text-2xs uppercase tracking-wide text-muted-foreground">
            Entrada del usuario
          </Label>
          <Textarea
            id="spec-input"
            value={spec.input}
            onChange={(e) => set({ input: e.target.value })}
            placeholder="Lo que se pidió, con las palabras con las que se pidió."
            className="min-h-[64px] text-sm"
          />
        </div>
      </div>

      {/* Propuesta de la IA: nunca pisa lo escrito sin que el usuario acepte. */}
      {propuesta && (
        <div className="space-y-2 rounded-md border border-ai-border bg-ai-surface p-2">
          <p className="text-xs text-ai">
            La IA propone un borrador con {propuesta.stories.length} historia(s) y{" "}
            {propuesta.requirements.length} requisito(s). Aplicarlo REEMPLAZA lo que hay escrito.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={onAplicarPropuesta}>
              Aplicar
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onDescartarPropuesta}>
              Descartar
            </Button>
          </div>
        </div>
      )}

      <Seccion
        titulo="Historias de usuario"
        ayuda="Cada historia es una tajada entregable por sí sola. P1 es la más crítica."
        cantidad={spec.stories.length}
        addLabel={accion("agregar", "historia de usuario")}
        onAdd={() =>
          spec.stories.length < MAX_HISTORIAS &&
          set({ stories: [...spec.stories, nuevaHistoria(nextPriority(spec.stories))] })
        }
      >
        {spec.stories.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Sin historias no hay especificación: agregá la primera (P1).
          </p>
        )}
        {spec.stories.map((h, i) => (
          <HistoriaCard
            key={h.id}
            historia={h}
            indice={i}
            total={spec.stories.length}
            onChange={(nueva) => set({ stories: spec.stories.map((x) => (x.id === h.id ? nueva : x)) })}
            onMover={(desde, hasta) => set({ stories: moveItem(spec.stories, desde, hasta) })}
            onQuitar={() => set({ stories: spec.stories.filter((x) => x.id !== h.id) })}
          />
        ))}
      </Seccion>

      <Seccion
        titulo="Casos límite"
        ayuda="Qué pasa en el borde: sin datos, con el doble, cuando falla lo de al lado."
        cantidad={spec.edgeCases.length}
        defaultOpen={false}
        addLabel={accion("agregar", "caso límite")}
        onAdd={() =>
          spec.edgeCases.length < MAX_ITEMS_LISTA && set({ edgeCases: [...spec.edgeCases, ""] })
        }
      >
        {spec.edgeCases.map((c, i) => (
          <div key={`edge-${i}`} className="flex items-start gap-1">
            <Textarea
              value={c}
              onChange={(e) =>
                set({ edgeCases: spec.edgeCases.map((x, j) => (j === i ? e.target.value : x)) })
              }
              placeholder="¿Qué pasa cuando…?"
              className="min-h-[40px] text-sm"
            />
            <FilaAcciones
              indice={i}
              total={spec.edgeCases.length}
              onMover={(desde, hasta) => set({ edgeCases: moveItem(spec.edgeCases, desde, hasta) })}
              onQuitar={() => set({ edgeCases: spec.edgeCases.filter((_, j) => j !== i) })}
              quitarLabel={accion("eliminar", "caso límite")}
            />
          </div>
        ))}
      </Seccion>

      <Seccion
        titulo="Requisitos funcionales"
        ayuda="Verificables y sin tecnología: «El sistema MUST …», «El usuario MUST poder …»."
        cantidad={spec.requirements.length}
        defaultOpen={false}
        addLabel={accion("agregar", "requisito funcional")}
        onAdd={() =>
          spec.requirements.length < MAX_ITEMS_LISTA &&
          set({ requirements: [...spec.requirements, nuevoRequisito()] })
        }
      >
        {spec.requirements.map((r, i) => (
          <div key={r.id} className="flex items-start gap-1">
            <span className="mt-2 w-14 shrink-0 text-2xs font-semibold tabular-nums text-muted-foreground">
              {etiqueta("FR", i)}
            </span>
            <Textarea
              value={r.texto}
              onChange={(e) =>
                set({
                  requirements: spec.requirements.map((x) =>
                    x.id === r.id ? { ...x, texto: e.target.value } : x
                  ),
                })
              }
              placeholder="El sistema MUST …"
              className="min-h-[40px] text-sm"
            />
            <button
              type="button"
              title={
                r.needsClarification
                  ? "Quitar la marca «necesita aclaración»"
                  : "Marcar «necesita aclaración»: está escrito pero falta decidir algo"
              }
              aria-pressed={!!r.needsClarification}
              onClick={() =>
                set({
                  requirements: spec.requirements.map((x) =>
                    x.id === r.id
                      ? { ...x, needsClarification: x.needsClarification ? undefined : true }
                      : x
                  ),
                })
              }
              className={cn(
                "mt-1 shrink-0 rounded p-1 text-muted-foreground hover:text-foreground",
                r.needsClarification && "text-warning hover:text-warning"
              )}
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
            <FilaAcciones
              indice={i}
              total={spec.requirements.length}
              onMover={(desde, hasta) => set({ requirements: moveItem(spec.requirements, desde, hasta) })}
              onQuitar={() => set({ requirements: spec.requirements.filter((x) => x.id !== r.id) })}
              quitarLabel={accion("eliminar", "requisito")}
            />
          </div>
        ))}
      </Seccion>

      <Seccion
        titulo="Entidades clave"
        ayuda="Qué representa cada cosa del dominio, sin decir cómo se implementa."
        cantidad={spec.entities.length}
        defaultOpen={false}
        addLabel={accion("agregar", "entidad clave")}
        onAdd={() =>
          spec.entities.length < MAX_ITEMS_LISTA && set({ entities: [...spec.entities, nuevaEntidad()] })
        }
      >
        {spec.entities.map((en, i) => (
          <div key={en.id} className="flex items-start gap-1">
            <div className="min-w-0 flex-1 space-y-1">
              <Input
                value={en.nombre}
                onChange={(e) =>
                  set({
                    entities: spec.entities.map((x) => (x.id === en.id ? { ...x, nombre: e.target.value } : x)),
                  })
                }
                placeholder="Nombre de la entidad"
                className="h-8"
              />
              <Textarea
                value={en.descripcion}
                onChange={(e) =>
                  set({
                    entities: spec.entities.map((x) =>
                      x.id === en.id ? { ...x, descripcion: e.target.value } : x
                    ),
                  })
                }
                placeholder="Qué representa y con qué se relaciona"
                className="min-h-[40px] text-sm"
              />
            </div>
            <FilaAcciones
              indice={i}
              total={spec.entities.length}
              onMover={(desde, hasta) => set({ entities: moveItem(spec.entities, desde, hasta) })}
              onQuitar={() => set({ entities: spec.entities.filter((x) => x.id !== en.id) })}
              quitarLabel={accion("eliminar", "entidad")}
            />
          </div>
        ))}
      </Seccion>

      <Seccion
        titulo="Criterios de éxito"
        ayuda="Medibles y sin tecnología: cuánto, en cuánto tiempo, con qué porcentaje."
        cantidad={spec.criteria.length}
        defaultOpen={false}
        addLabel={accion("agregar", "criterio de éxito")}
        onAdd={() =>
          spec.criteria.length < MAX_ITEMS_LISTA && set({ criteria: [...spec.criteria, nuevoCriterio()] })
        }
      >
        {spec.criteria.map((c, i) => (
          <div key={c.id} className="flex items-start gap-1">
            <span className="mt-2 w-14 shrink-0 text-2xs font-semibold tabular-nums text-muted-foreground">
              {etiqueta("SC", i)}
            </span>
            <Textarea
              value={c.texto}
              onChange={(e) =>
                set({
                  criteria: spec.criteria.map((x) => (x.id === c.id ? { ...x, texto: e.target.value } : x)),
                })
              }
              placeholder="El 90 % de los usuarios completa … en menos de …"
              className="min-h-[40px] text-sm"
            />
            <FilaAcciones
              indice={i}
              total={spec.criteria.length}
              onMover={(desde, hasta) => set({ criteria: moveItem(spec.criteria, desde, hasta) })}
              onQuitar={() => set({ criteria: spec.criteria.filter((x) => x.id !== c.id) })}
              quitarLabel={accion("eliminar", "criterio de éxito")}
            />
          </div>
        ))}
      </Seccion>

      {/* Salida: el contrato sirve cuando sale de la app (issue, PR, documento). */}
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={vacia}
          onClick={() => onCopiar?.(markdown)}
        >
          <ClipboardCopy className="h-4 w-4" /> Copiar markdown
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={vacia}
          onClick={() => onExportar?.(markdown, specFileName(spec, elementName))}
        >
          <Download className="h-4 w-4" /> Exportar .md
        </Button>
      </div>
    </div>
  );
};
