"use client";

/**
 * «Comparar conocimiento» (spec 027 · T36, US9).
 *
 * El historial no se guarda (FR-043): se DERIVA comparando el proyecto abierto
 * con otra versión que el humano elige —un archivo de tablero en disco o otro
 * tablero de la app—. Muestra lo agregado, lo reemplazado (con la fecha de la
 * versión vigente) y las deducciones ganadas y perdidas. Sólo lee: no toca el
 * proyecto ni el archivo. La lógica vive en `src/lib/ontology/diff.ts`.
 */

import React, { useMemo, useRef, useState } from "react";
import { GitCompare, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseBoardFile, sanitizeViews } from "@/lib/board-file";
import { STORAGE_SAVED_FILES } from "@/lib/graph-constants";
import { conocimientoDeTablero, diffConocimiento, hayCambios, resumirDiff, type ResumenDiff } from "@/lib/ontology";
import type { GraphData, SavedFile } from "@/lib/types";
import type { PersistedViews } from "@/lib/views-types";

const vistasGuardadas = (id: string): PersistedViews | undefined => {
  try {
    const raw = localStorage.getItem(`views_${id}`);
    return raw ? sanitizeViews(JSON.parse(raw)) : undefined;
  } catch {
    return undefined;
  }
};

const otrosTableros = (actual: string): SavedFile[] => {
  try {
    return (JSON.parse(localStorage.getItem(STORAGE_SAVED_FILES) ?? "[]") as SavedFile[]).filter((f) => f.id !== actual);
  } catch {
    return [];
  }
};

export default function CompareKnowledgeCard({ currentFile }: { currentFile: SavedFile }) {
  const [resumen, setResumen] = useState<{ contra: string; r: ResumenDiff } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const tableros = useMemo(() => otrosTableros(currentFile.id), [currentFile.id]);

  const comparar = (contra: string, proyecto: GraphData, vistas: PersistedViews | undefined) => {
    const antes = conocimientoDeTablero(proyecto, vistas);
    const despues = conocimientoDeTablero(currentFile.content, vistasGuardadas(currentFile.id));
    const fecha = currentFile.content.fecha_analisis || new Date().toISOString().slice(0, 10);
    const d = diffConocimiento(antes, despues, fecha);
    setError(null);
    setResumen({ contra, r: hayCambios(d) ? resumirDiff(antes, despues, d) : { agregados: [], reemplazados: [], deduccionesGanadas: [], deduccionesPerdidas: [] } });
  };

  const desdeArchivo = async (f: File | undefined) => {
    if (!f) return;
    try {
      const b = parseBoardFile(await f.text(), f.name);
      comparar(f.name, b.content, b.vistas);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    }
  };

  const desdeTablero = (id: string) => {
    const t = tableros.find((x) => x.id === id);
    if (t) comparar(t.name, t.content, vistasGuardadas(t.id));
  };

  const r = resumen?.r;
  const total = r ? r.agregados.length + r.reemplazados.length + r.deduccionesGanadas.length + r.deduccionesPerdidas.length : 0;

  return (
    <Card className="shrink-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <GitCompare /> Comparar conocimiento
        </CardTitle>
        <CardDescription>
          Qué cambió en lo que el proyecto afirma —y en lo que se deduce de eso— respecto de otra versión: un archivo
          descargado antes u otro tablero. No se guarda nada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={archivo} type="file" accept=".json,application/json" className="hidden" onChange={(e) => desdeArchivo(e.target.files?.[0])} />
          <Button variant="outline" size="sm" onClick={() => archivo.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Archivo en disco…
          </Button>
          {tableros.length > 0 && (
            <Select onValueChange={desdeTablero}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="…u otro tablero" />
              </SelectTrigger>
              <SelectContent>
                {tableros.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {resumen && r && (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Contra «{resumen.contra}»: {total === 0 ? "el conocimiento es el mismo." : `${total} diferencia(s).`}
            </p>
            <Seccion titulo="Nuevo" items={r.agregados} />
            <Seccion titulo="Reemplazado (ya no vigente)" items={r.reemplazados.map((x) => (x.fecha ? `${x.texto} · desde ${x.fecha}` : x.texto))} />
            <Seccion titulo="Deducciones que aparecieron" items={r.deduccionesGanadas} />
            <Seccion titulo="Deducciones que se perdieron" items={r.deduccionesPerdidas} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Seccion({ titulo, items }: { titulo: string; items: string[] }) {
  const [todos, setTodos] = useState(false);
  if (!items.length) return null;
  const visibles = todos ? items : items.slice(0, 12);
  return (
    <div>
      <h4 className="font-medium">
        {titulo} <span className="text-muted-foreground">({items.length})</span>
      </h4>
      <ul className="ml-4 list-disc text-muted-foreground">
        {visibles.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
      {items.length > visibles.length && (
        <button type="button" className="ml-4 text-xs underline" onClick={() => setTodos(true)}>
          ver {items.length - visibles.length} más
        </button>
      )}
    </div>
  );
}
