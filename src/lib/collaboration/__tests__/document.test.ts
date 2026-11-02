import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { SharedDocument } from "../document";
import type { GraphData } from "../../types";
import type { SharedProject } from "../types";

const graph = (): GraphData => ({ nombre_proyecto: "Equipo", version: "1", fecha_analisis: "", responsables: [], notas: "", transcript: "", read_models: [], agregados: [
  { id: "group", nombre_agregado: "Grupo", entidad_raiz: "", descripcion: "", nodos: [
    { id: "a", nombre: "A", tipo_elemento: "Comando", estado_comparativo: "nuevo", descripcion: "", x: 10, y: 10 },
    { id: "b", nombre: "B", tipo_elemento: "Evento", estado_comparativo: "nuevo", descripcion: "", x: 100, y: 10 },
  ], aristas: [] },
], big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] }, politicas_inter_agregados: [] });
const seed = (): SharedProject => ({ name: "Equipo", content: graph(), customViews: [], references: [], agent: { versions: [], lineages: [], artifacts: [] }, analysis: {} });
function pair() {
  const a = new SharedDocument(); a.patch({}, seed());
  const b = new SharedDocument(); b.receive(a.update());
  return { a, b };
}
function exchange(a: SharedDocument, b: SharedDocument) {
  const au = a.update(b.vector()), bu = b.update(a.vector()); a.receive(bu); b.receive(au);
}

describe("durable project document", () => {
  it("merges an offline edge with another person's component edits", () => {
    const { a, b } = pair(); const beforeA = a.snapshot(), beforeB = b.snapshot();
    const nextA = structuredClone(beforeA); nextA.content.agregados[0].aristas.push({ id: "ab", fuente: "a", destino: "b", descripcion: "conecta" });
    const nextB = structuredClone(beforeB); nextB.content.agregados[0].nodos[1].nombre = "B editado"; nextB.content.agregados[0].nodos[1].x = 500;
    a.patch(beforeA, nextA); b.patch(beforeB, nextB); exchange(a, b);
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.snapshot().content.agregados[0].aristas[0]).toMatchObject({ id: "ab", fuente: "a", destino: "b" });
    expect(a.snapshot().content.agregados[0].nodos[1]).toMatchObject({ nombre: "B editado", x: 500 });
  });
  it("reopens after days and exchanges both users' saved changes", () => {
    const { a, b } = pair(); const oldA = a.snapshot(), oldB = b.snapshot();
    const nextA = structuredClone(oldA); nextA.name = "Día uno"; a.patch(oldA, nextA);
    const nextB = structuredClone(oldB); nextB.content.agregados[0].nodos[1].descripcion = "Día tres"; b.patch(oldB, nextB);
    const reopenedA = new SharedDocument(), reopenedB = new SharedDocument();
    reopenedA.receive(a.update()); reopenedB.receive(b.update()); exchange(reopenedA, reopenedB);
    expect(reopenedA.snapshot()).toEqual(reopenedB.snapshot());
    expect(reopenedA.snapshot().name).toBe("Día uno");
    expect(reopenedA.snapshot().content.agregados[0].nodos[1].descripcion).toBe("Día tres");
  });
  it("keeps edges pending until the referenced component arrives", () => {
    const { a } = pair(); let old = a.snapshot(), next = structuredClone(old);
    next.content.agregados[0].aristas.push({ id: "ac", fuente: "a", destino: "c", descripcion: "" }); a.patch(old, next);
    expect(a.pendingEdges()).toBe(1); expect(a.snapshot().content.agregados[0].aristas).toEqual([]);
    old = a.snapshot(); next = structuredClone(old); next.content.agregados[0].nodos.push({ id: "c", nombre: "C", tipo_elemento: "Evento", estado_comparativo: "nuevo", descripcion: "" }); a.patch(old, next);
    expect(a.pendingEdges()).toBe(0); expect(a.snapshot().content.agregados[0].aristas[0].id).toBe("ac");
  });
  it("does not erase remote additions using a stale local projection", () => {
    const { a, b } = pair(); const stale = a.snapshot(), beforeB = b.snapshot();
    const nextB = structuredClone(beforeB); nextB.content.agregados[0].nodos.push({ id: "c", nombre: "C", tipo_elemento: "Evento", estado_comparativo: "nuevo", descripcion: "" }); b.patch(beforeB, nextB); a.receive(b.update(a.vector()));
    const local = structuredClone(stale); local.content.agregados[0].nodos[0].nombre = "A nuevo"; a.patch(stale, local);
    expect(a.snapshot().content.agregados[0].nodos.map(n => n.id)).toContain("c");
  });
  it("uses tombstones for delete versus offline edit, retaining recoverable contents", () => {
    const { a, b } = pair(); const oldA = a.snapshot(), oldB = b.snapshot();
    const nextA = structuredClone(oldA); nextA.content.agregados[0].nodos.splice(1, 1); a.patch(oldA, nextA);
    const nextB = structuredClone(oldB); nextB.content.agregados[0].nodos[1].nombre = "Trabajo offline"; b.patch(oldB, nextB); exchange(a, b);
    expect(a.snapshot().content.agregados[0].nodos.map(n => n.id)).toEqual(["a"]);
    expect(a.deleted().length).toBe(1); expect(a.recoveryJson()).toContain("Trabajo offline");
  });
  it("own undo preserves edits from the other user", () => {
    const { a, b } = pair(); a.clearUndo();
    let old = a.snapshot(), next = structuredClone(old); next.name = "Mío"; a.patch(old, next);
    old = b.snapshot(); next = structuredClone(old); next.content.agregados[0].nodos[0].descripcion = "De B"; b.patch(old, next); a.receive(b.update(a.vector()));
    a.undo(); expect(a.snapshot().name).toBe("Equipo"); expect(a.snapshot().content.agregados[0].nodos[0].descripcion).toBe("De B");
  });
  it("restores an explicitly re-added entity after local canvas undo", () => {
    const { a } = pair(); const original = a.snapshot(), removed = structuredClone(original);
    removed.content.agregados[0].nodos.splice(1, 1); a.patch(original, removed);
    const observed = a.snapshot(), restored = structuredClone(observed);
    restored.content.agregados[0].nodos.push(original.content.agregados[0].nodos[1]); a.patch(observed, restored);
    expect(a.snapshot().content.agregados[0].nodos.map(n => n.id)).toEqual(["a", "b"]);
  });
  it("keeps identities when a container is renamed and a node is moved", () => {
    const { a, b } = pair(); const oa = a.snapshot(), ob = b.snapshot(), na = structuredClone(oa), nb = structuredClone(ob);
    na.content.agregados[0].nombre_agregado = "Renombrado"; nb.content.agregados[0].nodos[1].x = 42;
    a.patch(oa, na); b.patch(ob, nb); exchange(a, b);
    expect(a.snapshot().content.agregados[0]).toMatchObject({ id: "group", nombre_agregado: "Renombrado" });
    expect(a.snapshot().content.agregados[0].nodos[1].x).toBe(42);
  });
  it("is idempotent and converges with duplicate, reordered updates", () => {
    const { a, b } = pair(); const updates: Uint8Array[] = []; a.doc.on("update", u => updates.push(u));
    for (const name of ["Uno", "Dos", "Tres"]) { const old = a.snapshot(); a.patch(old, { ...old, name }); }
    for (const u of [...updates].reverse()) { b.receive(u); b.receive(u); }
    expect(b.snapshot()).toEqual(a.snapshot());
    expect(Y.encodeStateVector(b.doc)).toEqual(Y.encodeStateVector(a.doc));
  });
  it("retains both concurrent edits of the same field for recovery", () => {
    const { a, b } = pair(); const oa = a.snapshot(), ob = b.snapshot(), na = structuredClone(oa), nb = structuredClone(ob);
    na.content.agregados[0].nodos[0].nombre = "Trabajo de Ana"; nb.content.agregados[0].nodos[0].nombre = "Trabajo de Luis";
    a.patch(oa, na); b.patch(ob, nb); exchange(a, b);
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.recoveryJson()).toContain("Trabajo de Ana"); expect(a.recoveryJson()).toContain("Trabajo de Luis");
  });
  it("rejects a malformed remote document before changing the live state", () => {
    const { a } = pair(), expected = a.snapshot(), attacker = new Y.Doc();
    Y.applyUpdate(attacker, a.update()); attacker.getMap("fields-v1").set("[]", { kind: "value", value: null });
    expect(() => a.receiveRemote(Y.encodeStateAsUpdate(attacker, a.vector()))).toThrow(/inválid/);
    expect(a.snapshot()).toEqual(expected); expect(a.isInitialized()).toBe(true);
  });
  it("rejects malformed references and invalid paths instead of persisting a crashing projection", () => {
    const { a } = pair(), expected = a.snapshot(), attacker = new Y.Doc();
    Y.applyUpdate(attacker, a.update());
    attacker.getMap("fields-v1").set('["references"]', { kind: "value", value: [{ id: "bad", name: "bad", text: 42 }] });
    expect(() => a.receiveRemote(Y.encodeStateAsUpdate(attacker, a.vector()))).toThrow(/inválid/);
    const other = new Y.Doc(); Y.applyUpdate(other, a.update()); other.getMap("fields-v1").set("not a JSON path", { kind: "object" });
    expect(() => a.receiveRemote(Y.encodeStateAsUpdate(other, a.vector()))).toThrow(/inválid/);
    expect(a.snapshot()).toEqual(expected);
  });
  it.each([
    ["non-finite geometry", (doc: Y.Doc): void => { doc.getMap("fields-v1").set('["content","nodes","@a","value","x"]', { kind: "value", value: NaN }); }],
    ["invalid analysis", (doc: Y.Doc): void => { doc.getMap("fields-v1").set('["analysis","driversResult"]', { kind: "value", value: 42 }); }],
    ["unknown namespace", (doc: Y.Doc): void => { doc.getMap("unexpected").set("x", "hidden"); }],
    ["invalid tombstone", (doc: Y.Doc): void => { doc.getMap("deleted-v1").set('["content","nodes","@a"]', "yes"); }],
    ["invalid cell", (doc: Y.Doc): void => { doc.getMap("fields-v1").set('["name"]', { kind: "unknown" }); }],
    ["deep path", (doc: Y.Doc): void => { doc.getMap("fields-v1").set(JSON.stringify(["content", ...Array(70).fill("nested")]), { kind: "object" }); }],
    ["non-string source", (doc: Y.Doc): void => { doc.getMap("fields-v1").set('["content","nodes","@a","value","fuente"]', { kind: "value", value: 42 }); }],
    ["non-string description", (doc: Y.Doc): void => { doc.getMap("fields-v1").set('["content","nodes","@a","value","descripcion"]', { kind: "value", value: {} }); }],
    ["numeric technology tag", (doc: Y.Doc): void => { doc.getMap("fields-v1").set('["content","nodes","@a","value","tags_tecnologia"]', { kind: "value", value: [42] }); }],
    ["string geometry", (doc: Y.Doc): void => { doc.getMap("fields-v1").set('["content","nodes","@a","value","width"]', { kind: "value", value: "wide" }); }],
    ["invalid metadata", (doc: Y.Doc): void => { doc.getMap("fields-v1").set('["content","nodes","@a","value","metadata"]', { kind: "value", value: [42] }); }],
    ["invalid spec", (doc: Y.Doc): void => { doc.getMap("fields-v1").set('["content","nodes","@a","value","spec"]', { kind: "value", value: "bad" }); }],
    ["invalid attached document", (doc: Y.Doc): void => { doc.getMap("fields-v1").set('["content","nodes","@a","value","adjuntos"]', { kind: "value", value: [42] }); }],
    ["invalid fragment parts", (doc: Y.Doc): void => { doc.getMap("fields-v1").set('["content","nodes","@a","value","fragmentParts"]', { kind: "value", value: [42] }); }],
  ] as const)("rejects %s and retains the valid replica", (_label, corrupt) => {
    const { a } = pair(), expected = a.snapshot(), attacker = new Y.Doc(); Y.applyUpdate(attacker, a.update()); corrupt(attacker);
    expect(() => a.receiveRemote(Y.encodeStateAsUpdate(attacker, a.vector()))).toThrow(/inválid/); expect(a.snapshot()).toEqual(expected);
  });
  it("rejects an oversized remote update before decoding it", () => {
    const { a } = pair(); expect(() => a.receiveRemote(new Uint8Array(32 * 1024 ** 2 + 1))).toThrow("32 MiB"); expect(a.snapshot().name).toBe("Equipo");
  });
  it("accepts full projects with views, references, artifact revisions and analyses", () => {
    const project = seed(); const now = "2026-11-01T00:00:00Z";
    project.content.agregados[0].aristas.push({ id: "ab", fuente: "a", destino: "b", descripcion: "enlace anterior" });
    project.customViews.push({ id: "view", name: "Otra vista", kind: "graph", createdAt: now, graph: graph() });
    project.references.push({ id: "ref", name: "Contrato", kind: "text", text: "Referencia compartida", chars: 20, addedAt: now });
    project.agent.versions.push({ id: "v1", label: "v1", createdAt: now });
    project.agent.lineages.push({ id: "lineage", key: "adr:decision", kind: "adr", versionId: "v1", createdAt: now });
    project.agent.artifacts.push({ id: "artifact", title: "Decisión", kind: "adr", render: "markdown", versionId: "v1", lineageId: "lineage", revision: 1, createdAt: now, payload: { markdown: "# Decisión compartida" } });
    project.analysis.roadmapResult = { phases: [] };
    const a = new SharedDocument(), b = new SharedDocument(); a.patch({}, project); b.receiveRemote(a.update());
    expect(b.snapshot()).toEqual(a.snapshot()); expect(b.snapshot().agent.artifacts[0].payload.markdown).toContain("Decisión compartida");
  });
});
