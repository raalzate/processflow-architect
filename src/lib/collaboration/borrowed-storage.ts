/**
 * Rastro local de una copia prestada (#756). El renderer guarda cada proyecto en varias
 * claves —`views_<id>`, `refdocs_<id>`, `agent_state_<id>`, `collaboration-branch:<id>`,
 * `agent_profile:<id>`— y algunas con el alcance de la rama (`<id>::<rama>`). Purgar es
 * quitarlas todas; quedarse con una sola ya es una segunda copia del proyecto.
 */

import { STORAGE_LAST_FILE_ID, STORAGE_SAVED_FILES } from "../graph-constants";

export interface KeyValueStore {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Las claves estructuradas que contienen datos del proyecto: nunca por substring suelto. */
export function borrowedKeys(keys: readonly string[], fileId: string): string[] {
  return keys.filter(key => {
    for (const sep of ["_", ":"]) {
      const at = key.indexOf(`${sep}${fileId}`);
      if (at <= 0) continue;
      const rest = key.slice(at + sep.length + fileId.length);
      if (rest === "" || rest.startsWith("::")) return true;
    }
    return false;
  });
}

/** Mapas globales indexados por proyecto: se les quita la entrada, no la clave entera. */
const PROJECT_MAPS = ["source_base_by_project"];

export function purgeBorrowedStorage(store: KeyValueStore, fileId: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key !== null) keys.push(key);
  }
  const removed = borrowedKeys(keys, fileId);
  for (const key of removed) store.removeItem(key);
  // El catálogo se guarda en diferido (con bloqueo entre ventanas): si la app se cierra antes,
  // la copia volvería como proyecto propio. Se quita acá, en el acto.
  const catalog = store.getItem(STORAGE_SAVED_FILES);
  if (catalog) {
    try {
      const files = JSON.parse(catalog) as { id?: string }[];
      if (Array.isArray(files) && files.some(f => f?.id === fileId)) {
        store.setItem(STORAGE_SAVED_FILES, JSON.stringify(files.filter(f => f?.id !== fileId)));
        removed.push(`${STORAGE_SAVED_FILES}[${fileId}]`);
      }
    } catch {
      /* catálogo ilegible: lo resuelve quien lo carga */
    }
  }
  if (store.getItem(STORAGE_LAST_FILE_ID) === fileId) {
    store.removeItem(STORAGE_LAST_FILE_ID);
    removed.push(STORAGE_LAST_FILE_ID);
  }
  for (const key of PROJECT_MAPS) {
    const raw = store.getItem(key);
    if (!raw) continue;
    try {
      const map = JSON.parse(raw) as Record<string, unknown>;
      if (map && typeof map === "object" && fileId in map) {
        delete map[fileId];
        store.setItem(key, JSON.stringify(map));
        removed.push(`${key}[${fileId}]`);
      }
    } catch {
      /* un mapa corrupto no contiene la copia legible: no se toca */
    }
  }
  return removed;
}
