"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ExternalLink, FileText, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { nodeTypeColor } from "@/lib/graph-constants";
import {
  buscarElementos,
  contarPorEstado,
  fichaDeElemento,
  type EntradaDeElemento,
} from "@/lib/element-browser";
import type { GraphNode } from "@/lib/types";

type Estado = GraphNode["estado_comparativo"];

const ESTADOS: Array<{ id: Estado; label: string; dot: string }> = [
  { id: "nuevo", label: "Nuevos", dot: "bg-success" },
  { id: "modificado", label: "Modificados", dot: "bg-warning" },
  { id: "existente", label: "Existentes", dot: "bg-muted-foreground" },
  { id: "sin_cambios", label: "Sin cambios", dot: "bg-muted-foreground/50" },
  { id: "eliminado", label: "Eliminados", dot: "bg-destructive" },
];
const ESTADO_LABEL = Object.fromEntries(ESTADOS.map((e) => [e.id, e.label.replace(/s$/, "").toLowerCase()]));

const claveDe = (e: EntradaDeElemento) => `${e.viewId}:${e.node.id}`;

/**
 * Modal de consulta de los elementos de una vista o de una lista de cambios.
 * A la izquierda, la lista buscable y filtrable por estado; a la derecha, la
 * ficha de lectura del elegido (`fichaDeElemento`). «Ir al lienzo» es la única
 * acción: la modal es para LEER sin perder el sitio en el lienzo.
 */
export const ElementsBrowserDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  subtitulo?: string;
  entradas: EntradaDeElemento[];
  /** Mostrar la vista de cada elemento (cuando la lista mezcla varias). */
  mostrarVista?: boolean;
  onIrAlLienzo: (entrada: EntradaDeElemento) => void;
}> = ({ open, onOpenChange, titulo, subtitulo, entradas, mostrarVista = false, onIrAlLienzo }) => {
  const [consulta, setConsulta] = useState("");
  const [estado, setEstado] = useState<Estado | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);

  // Cada apertura arranca limpia: la búsqueda de otra lista no tiene sentido acá.
  useEffect(() => {
    if (open) {
      setConsulta("");
      setEstado(null);
      setElegido(null);
    }
  }, [open]);

  const conteo = useMemo(() => contarPorEstado(entradas), [entradas]);
  const visibles = useMemo(
    () => buscarElementos(entradas, consulta).filter((e) => !estado || e.node.estado_comparativo === estado),
    [entradas, consulta, estado]
  );
  const actual = visibles.find((e) => claveDe(e) === elegido) ?? visibles[0];
  const ficha = actual ? fichaDeElemento(actual) : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(85vh,720px)] max-w-5xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            {subtitulo ?? `${entradas.length} elemento${entradas.length === 1 ? "" : "s"}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* Lista */}
          <div className="flex min-h-0 flex-col border-b md:w-80 md:border-b-0 md:border-r">
            <div className="space-y-2 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  value={consulta}
                  onChange={(ev) => setConsulta(ev.target.value)}
                  placeholder="Buscar por nombre, tipo, tecnología…"
                  className="h-9 pl-8"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {ESTADOS.filter((e) => conteo[e.id]).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setEstado(estado === e.id ? null : e.id)}
                    aria-pressed={estado === e.id}
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs transition-colors",
                      estado === e.id ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", e.dot)} />
                    {e.label} {conteo[e.id]}
                  </button>
                ))}
              </div>
            </div>
            <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-2 pb-2 max-md:max-h-56">
              {visibles.length === 0 && (
                <li className="px-2 py-6 text-center text-xs text-muted-foreground">Nada coincide con la búsqueda.</li>
              )}
              {visibles.map((e) => {
                const activo = actual && claveDe(e) === claveDe(actual);
                return (
                  <li key={claveDe(e)}>
                    <button
                      type="button"
                      onClick={() => setElegido(claveDe(e))}
                      onDoubleClick={() => onIrAlLienzo(e)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                        activo ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      )}
                    >
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", nodeTypeColor(e.node.tipo_elemento))} />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate",
                            e.node.estado_comparativo === "eliminado" && "line-through text-muted-foreground"
                          )}
                        >
                          {e.node.nombre}
                        </span>
                        <span className="block truncate text-2xs text-muted-foreground">
                          {e.node.tipo_elemento}
                          {mostrarVista ? ` · ${e.viewName}` : e.node.agregado ? ` · ${e.node.agregado}` : ""}
                        </span>
                      </span>
                      <span
                        title={ESTADO_LABEL[e.node.estado_comparativo]}
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          ESTADOS.find((x) => x.id === e.node.estado_comparativo)?.dot
                        )}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Ficha */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {!ficha || !actual ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Elegí un elemento para ver su ficha.</p>
            ) : (
              <article className="space-y-5">
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <h3 className="break-words text-lg font-semibold leading-tight">{ficha.nombre}</h3>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge variant="outline" className="gap-1">
                        <span className={cn("h-2 w-2 rounded-full", nodeTypeColor(ficha.tipo))} />
                        {ficha.tipo}
                      </Badge>
                      <Badge variant="secondary">{ESTADO_LABEL[ficha.estado]}</Badge>
                      {ficha.grupo && <Badge variant="outline">{ficha.grupo}</Badge>}
                      <span className="text-muted-foreground">en «{ficha.vista}»</span>
                    </div>
                  </div>
                  <Button size="sm" className="gap-1.5" onClick={() => onIrAlLienzo(actual)}>
                    Ir al lienzo <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </header>

                <Seccion titulo="Descripción">
                  {ficha.descripcion ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{ficha.descripcion}</p>
                  ) : (
                    <p className="text-sm italic text-muted-foreground">Sin descripción.</p>
                  )}
                </Seccion>

                {ficha.tecnologias.length > 0 && (
                  <Seccion titulo="Tecnologías">
                    <div className="flex flex-wrap gap-1">
                      {ficha.tecnologias.map((t) => (
                        <Badge key={t} variant="secondary">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </Seccion>
                )}

                {(ficha.entrantes.length > 0 || ficha.salientes.length > 0) && (
                  <Seccion titulo="Relaciones">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ListaDeRelaciones titulo="Recibe de" flecha="←" items={ficha.entrantes} />
                      <ListaDeRelaciones titulo="Envía a" flecha="→" items={ficha.salientes} />
                    </div>
                  </Seccion>
                )}

                {ficha.referencias.length > 0 && (
                  <Seccion titulo="Referencias">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                      {ficha.referencias.map((r) => (
                        <React.Fragment key={r.clave}>
                          <dt className="text-muted-foreground">{r.clave}</dt>
                          <dd className="min-w-0 break-all">
                            {r.enlace ? (
                              <a
                                href={r.enlace}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                {r.valor} <ExternalLink className="h-3 w-3 shrink-0" />
                              </a>
                            ) : (
                              r.valor
                            )}
                          </dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  </Seccion>
                )}

                {ficha.spec && (
                  <Seccion titulo="Especificación">
                    <p className="text-sm">
                      <span className="font-medium">{ficha.spec.titulo || "Sin título"}</span>{" "}
                      <span className="text-muted-foreground">
                        · {ficha.spec.estado} · {ficha.spec.pasos} pasos · {ficha.spec.requisitos} requisitos ·{" "}
                        {ficha.spec.criterios} criterios
                      </span>
                    </p>
                  </Seccion>
                )}

                {ficha.adjuntos.length > 0 && (
                  <Seccion titulo="Adjuntos">
                    <ul className="space-y-1 text-sm">
                      {ficha.adjuntos.map((a) => (
                        <li key={a} className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" /> {a}
                        </li>
                      ))}
                    </ul>
                  </Seccion>
                )}
              </article>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Seccion: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <section className="space-y-1.5">
    <h4 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h4>
    {children}
  </section>
);

const ListaDeRelaciones: React.FC<{
  titulo: string;
  flecha: string;
  items: Array<{ otro: string; descripcion?: string }>;
}> = ({ titulo, flecha, items }) => (
  <div className="rounded-md border p-2.5">
    <p className="mb-1 text-xs font-medium text-muted-foreground">
      {titulo} ({items.length})
    </p>
    {items.length === 0 ? (
      <p className="text-xs italic text-muted-foreground">Nada.</p>
    ) : (
      <ul className="space-y-1 text-sm">
        {items.map((r, i) => (
          <li key={`${r.otro}-${i}`} className="min-w-0">
            <span className="text-muted-foreground">{flecha}</span> <span className="font-medium">{r.otro}</span>
            {r.descripcion && <span className="block pl-4 text-xs text-muted-foreground">{r.descripcion}</span>}
          </li>
        ))}
      </ul>
    )}
  </div>
);
