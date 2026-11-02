import { applyRecordDelta } from "./canvas-merge";

/** Apply only this window's changes to the latest persisted project catalog. */
export function mergeLocalFiles<T extends { id: string }>(persisted: T[], before: T[], after: T[]): T[] {
  const keyed = (files: T[]) => new Map(files.map(file => [file.id, file]));
  return [...applyRecordDelta(keyed(persisted), keyed(before), keyed(after)).values()];
}
