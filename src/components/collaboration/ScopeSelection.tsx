"use client";

import { Button } from "@/components/ui/button";

export function ScopeSelection({
  options,
  selected,
  onChange,
  legend = "Vistas que se incluirán",
}: {
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  legend?: string;
}) {
  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{legend}</legend>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onChange(selected.length === options.length ? [] : options.map(o => o.id))}
      >
        {selected.length === options.length ? "Desmarcar todas" : "Seleccionar todas"}
      </Button>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map(o => (
          <label key={o.id} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(o.id)}
              onChange={e =>
                onChange(e.target.checked ? [...selected, o.id] : selected.filter(id => id !== o.id))
              }
            />
            {o.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
