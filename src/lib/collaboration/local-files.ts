import { applyRecordDelta } from "./canvas-merge";

/** Apply only this window's changes to the latest persisted project catalog. */
export function mergeLocalFiles<T extends { id: string }>(persisted: T[], before: T[], after: T[]): T[] {
  const keyed = (files: T[]) => new Map(files.map(file => [file.id, file]));
  return [...applyRecordDelta(keyed(persisted), keyed(before), keyed(after)).values()];
}

/** El catálogo es la proyección de Principal; editar/consultar ramas no la sustituye. */
export function mergeProjectedFiles<T extends { id: string }>(
  persisted: T[],
  before: T[],
  after: T[],
  projection?: { fileId: string; canonical: Partial<T> },
): T[] {
  const merged = mergeLocalFiles(persisted, before, after);
  return projection
    ? merged.map(file => (file.id === projection.fileId ? { ...file, ...projection.canonical } : file))
    : merged;
}
