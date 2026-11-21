/**
 * Un solo punto por donde pasa toda salida de contenido a un archivo (#756). Quien
 * descarga llama a `assertExportAllowed()`; quien sabe si el proyecto activo es una
 * copia prestada (el contexto de colaboración) fija la regla. Así un botón nuevo de
 * exportar no puede olvidarse de la política: hereda el freno al usar los helpers.
 */

export const EXPORT_DENIED_MESSAGE = "El anfitrión no permite exportar este proyecto.";

export class ExportDeniedError extends Error {
  constructor() {
    super(EXPORT_DENIED_MESSAGE);
    this.name = "ExportDeniedError";
  }
}

let allowed: () => boolean = () => true;

/** Lo fija el contexto de colaboración; devuelve cómo restaurar la regla anterior. */
export function setExportRule(rule: () => boolean): () => void {
  const previous = allowed;
  allowed = rule;
  return () => {
    if (allowed === rule) allowed = previous;
  };
}

export const exportAllowed = (): boolean => allowed();

let notifyDenied: () => void = () => {};
/** Cómo se le avisa al usuario de un rechazo (un toast): lo fija la UI, no cada botón. */
export function setExportDeniedNotifier(notify: () => void): () => void {
  const previous = notifyDenied;
  notifyDenied = notify;
  return () => {
    if (notifyDenied === notify) notifyDenied = previous;
  };
}

/** Para los helpers de descarga: `false` (y aviso) si no se puede; nunca lanza. */
export function guardExport(): boolean {
  if (allowed()) return true;
  notifyDenied();
  return false;
}

export function assertExportAllowed(): void {
  if (!allowed()) throw new ExportDeniedError();
}
