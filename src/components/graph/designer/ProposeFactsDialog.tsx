"use client";

/**
 * «Proponer hechos con IA» (spec 027 · T34, US8).
 *
 * La IA lee un trozo de un documento fuente del proyecto y PROPONE hechos.
 * Cada uno llega con su cita y con el veredicto del reglamento: los inválidos
 * se muestran marcados y no se pueden elegir (US8-AC2). Sólo lo que el humano
 * marca entra al lienzo, con su procedencia en la ficha (US8-AC3). La
 * validación y la integración viven en `src/lib/ontology/proposals.ts`.
 */

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAi } from "@/hooks/useAi";
import { MAX_FRAGMENTO_PROPUESTA, proposeFactsTask } from "@/lib/ai/tasks";
import type { DiagramModel } from "@/lib/mcp/diagram-builder";
import { aplicarPropuestas, revisarPropuestas, type PropuestaRevisada } from "@/lib/ontology/proposals";
import type { SourceDoc } from "@/lib/source-docs";

export const ProposeFactsDialog: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  docs: SourceDoc[];
  /** El diagrama tal como está en el lienzo, en el momento de pedir. */
  modelo: () => DiagramModel | null;
  notation: string;
  onIntegrar: (model: DiagramModel, resumen: { aplicadas: number; omitidas: string[] }) => void;
}> = ({ open, onOpenChange, docs, modelo, notation, onIntegrar }) => {
  const { run, busy } = useAi();
  const [doc, setDoc] = useState<string>("");
  const [desdeLinea, setDesdeLinea] = useState(1);
  const [propuestas, setPropuestas] = useState<PropuestaRevisada[] | null>(null);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && !docs.some((d) => d.nombre === doc)) setDoc(docs[0]?.nombre ?? "");
    if (!open) {
      setPropuestas(null);
      setElegidas(new Set());
    }
  }, [open, docs, doc]);

  const actual = docs.find((d) => d.nombre === doc);
  const lineas = useMemo(() => (actual?.texto ?? "").split("\n"), [actual]);
  const fragmento = useMemo(() => lineas.slice(Math.max(0, desdeLinea - 1)).join("\n").slice(0, MAX_FRAGMENTO_PROPUESTA), [lineas, desdeLinea]);
  const hasta = desdeLinea - 1 + fragmento.split("\n").length;

  const proponer = async () => {
    const m = modelo();
    if (!m || !actual) return;
    const hechos = await run(proposeFactsTask, {
      fragmento,
      fuente: `${actual.nombre}:${desdeLinea}-${hasta}`,
      notation,
      existentes: m.nodes.map((n) => n.nombre),
    });
    if (!hechos) return;
    const r = revisarPropuestas(m, hechos);
    setPropuestas(r);
    setElegidas(new Set());
  };

  const integrar = () => {
    const m = modelo();
    if (!m || !propuestas) return;
    const aceptadas = propuestas.filter((p) => elegidas.has(p.id));
    const r = aplicarPropuestas(m, aceptadas, {
      fuente: `${actual?.nombre ?? "fuente"}:${desdeLinea}-${hasta}`,
      aceptadoPor: "humano",
      fecha: new Date().toISOString().slice(0, 10),
    });
    onIntegrar(r.model, { aplicadas: r.aplicadas.length, omitidas: r.omitidas.map((o) => o.motivo) });
    onOpenChange(false);
  };

  const validas = propuestas?.filter((p) => p.valida) ?? [];
  const alternar = (id: string) =>
    setElegidas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> Proponer hechos con IA
          </DialogTitle>
          <DialogDescription>
            La IA lee un trozo del documento y propone elementos y relaciones con su cita. El reglamento marca lo que no
            corresponde; sólo entra al lienzo lo que vos elegís.
          </DialogDescription>
        </DialogHeader>

        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            El proyecto no tiene documentos fuente. Adjuntá uno (desde el MCP con <code>attach_source</code>) para proponer
            hechos a partir de él.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor="propuesta-doc">Documento</Label>
                <Select value={doc} onValueChange={setDoc}>
                  <SelectTrigger id="propuesta-doc">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {docs.map((d) => (
                      <SelectItem key={d.nombre} value={d.nombre}>
                        {d.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-28 space-y-1">
                <Label htmlFor="propuesta-desde">Desde línea</Label>
                <Input
                  id="propuesta-desde"
                  type="number"
                  min={1}
                  max={Math.max(1, lineas.length)}
                  value={desdeLinea}
                  onChange={(e) => setDesdeLinea(Math.max(1, Math.min(lineas.length || 1, Number(e.target.value) || 1)))}
                />
              </div>
              <Button onClick={proponer} disabled={busy || !fragmento.trim()}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Proponer
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Se leen las líneas {desdeLinea}–{hasta} de {lineas.length}.
            </p>

            {propuestas && (
              <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
                {propuestas.length === 0 && <p className="text-sm text-muted-foreground">La IA no propuso hechos en este trozo.</p>}
                {propuestas.map((p) => (
                  <label
                    key={p.id}
                    className={`flex gap-2 rounded-md border px-2 py-1.5 text-sm ${p.valida ? "cursor-pointer" : "opacity-70"}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={!p.valida}
                      checked={elegidas.has(p.id)}
                      onChange={() => alternar(p.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">
                        {p.s} <span className="text-muted-foreground">{p.clase === "tipo" ? "es" : p.resuelto ?? p.p}</span>{" "}
                        {p.clase === "tipo" ? p.resuelto ?? p.o : p.o}
                      </span>
                      {p.nuevos.length > 0 && p.valida && (
                        <span className="ml-1.5 text-xs text-muted-foreground">· nuevo: {p.nuevos.join(", ")}</span>
                      )}
                      {p.cita && <span className="block truncate text-xs text-muted-foreground">«{p.cita}»</span>}
                      {!p.valida && (
                        <span className="mt-0.5 flex items-start gap-1 text-xs text-destructive">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {p.motivo}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {propuestas && validas.length > 0 && (
            <span className="mr-auto self-center text-xs text-muted-foreground">
              {validas.length} válida(s) de {propuestas.length}
            </span>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button onClick={integrar} disabled={!elegidas.size}>
            <Check className="mr-2 h-4 w-4" /> Integrar {elegidas.size || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
