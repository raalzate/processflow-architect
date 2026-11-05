"use client";

import { Button } from "@/components/ui/button";
import type { DiscardedFieldEdit } from "@/lib/collaboration/field-conflicts";

const formatFieldValue = (value: unknown): string => {
  if (value === undefined || value === null || value === "") return "Vacío";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
};

export function FieldConflictsNotice({
  edits,
  disabled,
  onResolve,
  automatic = false,
}: {
  edits?: DiscardedFieldEdit[];
  disabled?: boolean;
  onResolve: (editId: string, keep: "current" | "discarded") => void;
  automatic?: boolean;
}) {
  if (!edits?.length) return null;
  const content = (
    <section
      className="space-y-3 rounded-md border border-primary/40 bg-muted/30 p-3"
      role="status"
      aria-live="polite"
      aria-label="Ediciones simultáneas en el mismo campo"
    >
      <div className="space-y-1">
        <p className="text-sm font-semibold">
          {automatic ? `${edits.length} ${edits.length === 1 ? "edición simultánea resuelta" : "ediciones simultáneas resueltas"} automáticamente` : edits.length === 1
            ? "Dos personas editaron el mismo campo a la vez"
            : `Ediciones simultáneas detectadas en ${edits.length} campos`}
        </p>
        <p className="text-xs text-muted-foreground">
          {automatic ? "La rama ya usa el resultado sincronizado. Puedes seguir trabajando; la otra edición queda disponible para revisarla o pedir ayuda al chat." : "La sincronización eligió un valor automáticamente, pero conservó la otra edición para que elijas cuál dejar."}
        </p>
      </div>
      <div className="space-y-2">
        {edits.map(edit => (
          <div key={edit.id} className="space-y-2 rounded-md border bg-background p-3 text-sm">
            <p className="font-medium">{edit.label}</p>
            {edit.previousValue !== undefined ? (
              <p className="break-words text-xs text-muted-foreground">
                Valor anterior: {formatFieldValue(edit.previousValue).slice(0, 160)}
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1 rounded border p-2">
                <p className="text-xs font-medium text-muted-foreground">Valor actual en pantalla</p>
                <p className="break-words text-xs">{formatFieldValue(edit.currentValue).slice(0, 220)}</p>
              </div>
              <div className="space-y-1 rounded border p-2">
                <p className="text-xs font-medium text-muted-foreground">Otra edición simultánea</p>
                <p className="break-words text-xs">{formatFieldValue(edit.discardedValue).slice(0, 220)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => onResolve(edit.id, "current")}
              >
                Mantener actual
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={disabled}
                onClick={() => onResolve(edit.id, "discarded")}
              >
                Restaurar este valor
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
  return automatic ? <details className="rounded-md border p-2"><summary className="cursor-pointer text-xs text-muted-foreground">{edits.length} cambios resueltos automáticamente · Revisar alternativas</summary><div className="pt-2">{content}</div></details> : content;
}
