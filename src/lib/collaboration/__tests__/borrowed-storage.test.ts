import { describe, expect, it } from "vitest";
import { borrowedKeys, purgeBorrowedStorage, type KeyValueStore } from "../borrowed-storage";

const id = "Proyecto compartido-1731234567890";

function memory(entries: Record<string, string>): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(entries));
  return {
    data,
    get length() { return data.size; },
    key: i => [...data.keys()][i] ?? null,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: k => void data.delete(k),
  };
}

describe("rastro local de una copia prestada", () => {
  it("encuentra todas las claves del proyecto, incluidas las de rama", () => {
    const keys = [
      `views_${id}`,
      `refdocs_${id}`,
      `agent_state_${id}`,
      `agent_state_${id}::shared`,
      `refdocs_${id}::version:abc`,
      `collaboration-branch:${id}`,
      `agent_profile:${id}`,
    ];
    expect(borrowedKeys(keys, id)).toEqual(keys);
  });
  it("no toca proyectos con un id que lo contiene ni claves globales", () => {
    const otros = [`views_${id}0`, `views_X${id}`, "saved_json_files", "last_opened_file_id", id];
    expect(borrowedKeys(otros, id)).toEqual([]);
  });
  it("quita las claves y la entrada del mapa de rutas base, y conserva lo demás", () => {
    const store = memory({
      [`views_${id}`]: "[]",
      [`agent_state_${id}::shared`]: "{}",
      "views_mio-1": "[]",
      source_base_by_project: JSON.stringify({ [id]: "/a", "mio-1": "/b" }),
    });
    const removed = purgeBorrowedStorage(store, id);
    expect(removed).toContain(`views_${id}`);
    expect([...store.data.keys()].sort()).toEqual(["source_base_by_project", "views_mio-1"]);
    expect(JSON.parse(store.data.get("source_base_by_project")!)).toEqual({ "mio-1": "/b" });
  });
  it("un mapa corrupto no rompe la purga", () => {
    const store = memory({ source_base_by_project: "{", [`views_${id}`]: "[]" });
    expect(purgeBorrowedStorage(store, id)).toEqual([`views_${id}`]);
  });
  it("saca la copia del catálogo y del último abierto en el acto, sin esperar al guardado asíncrono", () => {
    const store = memory({
      saved_json_files: JSON.stringify([{ id, name: "Ajeno" }, { id: "mio-1", name: "Propio" }]),
      last_opened_file_id: id,
    });
    const removed = purgeBorrowedStorage(store, id);
    expect(JSON.parse(store.data.get("saved_json_files")!)).toEqual([{ id: "mio-1", name: "Propio" }]);
    expect(store.data.has("last_opened_file_id")).toBe(false);
    expect(removed).toContain(`saved_json_files[${id}]`);
  });
  it("el último abierto de otro proyecto se respeta", () => {
    const store = memory({ last_opened_file_id: "mio-1", saved_json_files: "[]" });
    purgeBorrowedStorage(store, id);
    expect(store.data.get("last_opened_file_id")).toBe("mio-1");
  });
});
