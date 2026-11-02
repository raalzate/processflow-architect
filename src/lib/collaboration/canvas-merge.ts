const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function applyFields(current: unknown, before: unknown, after: unknown, preserveLocal: boolean): unknown {
  if (equal(before, after)) return current;
  if (object(before) && object(after) && object(current)) {
    const next = { ...current };
    for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (equal(before[field], after[field])) continue;
      const result = applyFields(current[field], before[field], after[field], preserveLocal);
      if (result === undefined) delete next[field]; else next[field] = result;
    }
    return next;
  }
  if (preserveLocal && !equal(current, before)) return current;
  return after;
}

/** Apply remote changes to the live canvas or each local undo snapshot. */
export function applyRecordDelta<T>(current: Map<string, T>, before: Map<string, T>, after: Map<string, T>, preserveLocal = false): Map<string, T> {
  const next = new Map(current);
  for (const id of before.keys()) if (!after.has(id)) next.delete(id);
  for (const [id, value] of after) {
    if (!before.has(id)) next.set(id, value);
    else if (next.has(id)) next.set(id, applyFields(next.get(id), before.get(id), value, preserveLocal) as T);
  }
  return next;
}
