"use client";

/**
 * @fileOverview Campo «Columnas» de la ficha: el contenido de una caja de tabla.
 *
 * Sólo aparece en los tipos que se dibujan como CAJA DE TABLA (MER físico). Es
 * la red para editar a mano lo que casi siempre escribe un agente por MCP: el
 * nombre de la columna, su tipo y las restricciones (PK, FK, nulo, único,
 * índice).
 *
 * Todo lo que DECIDE —validar, mover, deducir los compartimentos «FK»/«index»/
 * «PK»— vive en `src/lib/mer/table-box.ts`; acá sólo se orquesta. Los
 * compartimentos no se editan: se derivan de estas filas, y por eso no pueden
 * contradecirlas.
 */

import React from "react";
import { ChevronDown, ChevronUp, Plus, Table2, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  MAX_COLUMNAS_POR_TABLA,
  moverColumna,
  validarColumna,
  type TableColumn,
} from "@/lib/mer/table-box";

/** Casilla de una restricción, con su rótulo corto arriba. */
const Marca: React.FC<{
  titulo: string;
  checked?: boolean;
  onChange: (v: boolean) => void;
}> = ({ titulo, checked, onChange }) => (
  <label className="flex cursor-pointer flex-col items-center gap-0.5" title={titulo}>
    <Checkbox checked={!!checked} onCheckedChange={(v) => onChange(v === true)} />
  </label>
);

export const ColumnsField: React.FC<{
  value?: TableColumn[];
  onChange: (lista: TableColumn[] | undefined) => void;
}> = ({ value, onChange }) => {
  const lista = value ?? [];

  /** Guarda la lista, o `undefined` si quedó vacía (no persistir un array vacío). */
  const guardar = (nueva: TableColumn[]) => onChange(nueva.length ? nueva : undefined);

  const editar = (i: number, cambio: Partial<TableColumn>) =>
    guardar(lista.map((c, j) => (i === j ? { ...c, ...cambio } : c)));

  const agregar = () =>
    guardar([...lista, { nombre: `columna_${lista.length + 1}`, tipo: "varchar(50)" }]);

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Table2 className="h-4 w-4 text-primary" />
          <Label>Columnas de la tabla</Label>
        </div>
        <button
          type="button"
          onClick={agregar}
          disabled={lista.length >= MAX_COLUMNAS_POR_TABLA}
          title={
            lista.length >= MAX_COLUMNAS_POR_TABLA
              ? `Máximo ${MAX_COLUMNAS_POR_TABLA} columnas`
              : "Añadir columna"
          }
          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
        >
          <Plus className="h-3 w-3" /> Añadir
        </button>
      </div>
      <p className="mt-1 mb-2 text-xs text-muted-foreground">
        Lo que dibuja la caja: el compartimento «column» son estas filas, y «FK», «index» y
        «PK» se deducen de sus marcas. El orden es el que se ve y el del <code>CREATE TABLE</code>.
      </p>

      {lista.length === 0 ? (
        <p className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
          Sin columnas. La caja se dibuja vacía hasta que declares la primera.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-2xs uppercase text-muted-foreground">
                <th className="border-b p-1 text-left font-medium">Nombre</th>
                <th className="border-b p-1 text-left font-medium">Tipo</th>
                <th className="border-b p-1 text-center font-medium" title="Clave primaria">
                  PK
                </th>
                <th className="border-b p-1 text-center font-medium" title="Clave foránea">
                  FK
                </th>
                <th
                  className="border-b p-1 text-center font-medium"
                  title="Admite nulos (sin marcar es obligatoria)"
                >
                  Nulo
                </th>
                <th className="border-b p-1 text-center font-medium" title="Restricción de unicidad">
                  Únic
                </th>
                <th className="border-b p-1 text-center font-medium" title="Se le crea un índice">
                  Índ
                </th>
                <th className="border-b p-1 text-left font-medium" title="Tabla a la que apunta la FK">
                  Referencia
                </th>
                <th className="border-b p-1" />
              </tr>
            </thead>
            <tbody>
              {lista.map((c, i) => {
                const problema = validarColumna(c);
                // La `key` es la POSICIÓN, no el nombre: con el nombre en la
                // clave, cada tecla remontaba la fila y el input perdía el foco
                // —se podía escribir una letra por clic—. La identidad de una
                // columna acá es su lugar en la lista.
                return (
                  <React.Fragment key={i}>
                    <tr className={cn(problema && "bg-destructive/5")}>
                      <td className="border-b p-0.5">
                        <Input
                          value={c.nombre}
                          onChange={(e) => editar(i, { nombre: e.target.value })}
                          className="h-7 px-1 text-xs"
                          placeholder="id"
                        />
                      </td>
                      <td className="border-b p-0.5">
                        <Input
                          value={c.tipo ?? ""}
                          onChange={(e) => editar(i, { tipo: e.target.value })}
                          className="h-7 px-1 text-xs"
                          placeholder="integer"
                        />
                      </td>
                      <td className="border-b p-0.5 text-center">
                        <Marca
                          titulo="Clave primaria"
                          checked={c.pk}
                          onChange={(v) => editar(i, { pk: v || undefined })}
                        />
                      </td>
                      <td className="border-b p-0.5 text-center">
                        <Marca
                          titulo="Clave foránea"
                          checked={c.fk}
                          onChange={(v) => editar(i, { fk: v || undefined })}
                        />
                      </td>
                      <td className="border-b p-0.5 text-center">
                        <Marca
                          titulo="Admite nulos"
                          checked={c.nulo}
                          onChange={(v) => editar(i, { nulo: v || undefined })}
                        />
                      </td>
                      <td className="border-b p-0.5 text-center">
                        <Marca
                          titulo="Único"
                          checked={c.unico}
                          onChange={(v) => editar(i, { unico: v || undefined })}
                        />
                      </td>
                      <td className="border-b p-0.5 text-center">
                        <Marca
                          titulo="Índice de búsqueda"
                          checked={c.indice}
                          onChange={(v) => editar(i, { indice: v || undefined })}
                        />
                      </td>
                      <td className="border-b p-0.5">
                        <Input
                          value={c.referencia ?? ""}
                          onChange={(e) => editar(i, { referencia: e.target.value })}
                          className="h-7 px-1 text-xs"
                          placeholder={c.fk ? "servicio.id" : "—"}
                        />
                      </td>
                      <td className="border-b p-0.5">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            title="Subir"
                            disabled={i === 0}
                            onClick={() => guardar(moverColumna(lista, i, i - 1))}
                            className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          >
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            title="Bajar"
                            disabled={i === lista.length - 1}
                            onClick={() => guardar(moverColumna(lista, i, i + 1))}
                            className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            title={`Quitar "${c.nombre}"`}
                            onClick={() => guardar(lista.filter((_, j) => j !== i))}
                            className="rounded p-1 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {problema && (
                      <tr>
                        <td colSpan={9} className="border-b px-2 py-1 text-2xs text-destructive">
                          {problema}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
