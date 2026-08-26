/**
 * @fileOverview Catálogo ÚNICO de acciones del diseñador. PURO.
 *
 * Las mismas acciones se ofrecen en tres sitios —la barra del lienzo, el menú nativo
 * de Electron y la paleta de comandos (⌘K)— y hasta ahora cada uno tenía su propia
 * lista. La consecuencia era la de siempre: lo que se agregaba a la barra no aparecía
 * en el menú, y quien buscaba «Exportar» donde el sistema operativo lo pone no lo
 * encontraba.
 *
 * Acá vive la lista y su rotulado. El proceso principal arma el menú desde esto, y el
 * diseñador implementa `Record<DesignerActionId, () => void>`: si se agrega un id y
 * nadie lo implementa, **el typecheck falla**. Ese es el mecanismo — no hace falta
 * acordarse.
 */

/** Toda acción que el diseñador sabe ejecutar. */
export type DesignerActionId =
  | "undo"
  | "redo"
  | "delete"
  | "cancel"
  | "copy"
  | "cut"
  | "paste"
  | "duplicate"
  | "select-all"
  | "fit"
  | "arrange"
  | "arrange-ai"
  | "routing-selection-straight"
  | "routing-selection-curved"
  | "routing-selection-orthogonal"
  | "routing-view-straight"
  | "routing-view-curved"
  | "routing-view-orthogonal"
  | "dash-selection-on"
  | "dash-selection-off"
  | "context"
  | "metadata"
  | "help"
  | "export"
  | "export-png"
  | "clear";

/** Un item del menú: acción, separador o submenú. */
export interface DesignerMenuItem {
  id?: DesignerActionId;
  label?: string;
  /** Acelerador en el formato de Electron (`CmdOrCtrl+B`). */
  accelerator?: string;
  separator?: true;
  submenu?: DesignerMenuItem[];
}

/**
 * El menú «Diseño» tal como lo ve el humano. El orden es el de uso: primero lo que se
 * repite todo el tiempo, después lo que se hace de vez en cuando, y al final lo
 * destructivo.
 */
export const DESIGNER_MENU: DesignerMenuItem[] = [
  { id: "undo", label: "Deshacer", accelerator: "CmdOrCtrl+Z" },
  { id: "redo", label: "Rehacer", accelerator: "CmdOrCtrl+Shift+Z" },
  { id: "delete", label: "Eliminar selección", accelerator: "Delete" },
  { separator: true },
  { id: "copy", label: "Copiar", accelerator: "CmdOrCtrl+C" },
  { id: "cut", label: "Cortar", accelerator: "CmdOrCtrl+X" },
  { id: "paste", label: "Pegar", accelerator: "CmdOrCtrl+V" },
  { id: "duplicate", label: "Duplicar", accelerator: "CmdOrCtrl+D" },
  { id: "select-all", label: "Seleccionar todo", accelerator: "CmdOrCtrl+A" },
  { id: "cancel", label: "Cancelar / deseleccionar", accelerator: "Escape" },
  { separator: true },
  { id: "arrange", label: "Organizar el lienzo", accelerator: "CmdOrCtrl+Shift+O" },
  { id: "arrange-ai", label: "Organizar: sugerir con IA" },
  { id: "fit", label: "Ajustar a contenido", accelerator: "CmdOrCtrl+0" },
  {
    label: "Relaciones",
    submenu: [
      { id: "routing-selection-straight", label: "Selección: recta" },
      { id: "routing-selection-curved", label: "Selección: curva" },
      { id: "routing-selection-orthogonal", label: "Selección: escalonada" },
      { separator: true },
      { id: "routing-view-straight", label: "Toda la vista: recta" },
      { id: "routing-view-curved", label: "Toda la vista: curva" },
      { id: "routing-view-orthogonal", label: "Toda la vista: escalonada" },
      { separator: true },
      { id: "dash-selection-off", label: "Selección: trazo continuo" },
      { id: "dash-selection-on", label: "Selección: trazo discontinuo" },
    ],
  },
  {
    label: "Exportar",
    submenu: [
      { id: "export", label: "SVG · vectorial" },
      { id: "export-png", label: "PNG · imagen" },
    ],
  },
  { separator: true },
  { id: "context", label: "Contexto de referencia", accelerator: "CmdOrCtrl+B" },
  { id: "metadata", label: "Metadatos del proyecto", accelerator: "CmdOrCtrl+M" },
  { id: "help", label: "Ayuda y atajos", accelerator: "CmdOrCtrl+/" },
  { separator: true },
  { id: "clear", label: "Reiniciar el lienzo…" },
];

/** Los ids que ofrece un menú, en orden y sin separadores. */
export function idsDelMenu(items: DesignerMenuItem[] = DESIGNER_MENU): DesignerActionId[] {
  const salida: DesignerActionId[] = [];
  for (const item of items) {
    if (item.id) salida.push(item.id);
    if (item.submenu) salida.push(...idsDelMenu(item.submenu));
  }
  return salida;
}
