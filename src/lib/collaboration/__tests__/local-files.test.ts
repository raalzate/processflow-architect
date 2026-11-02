import { describe, expect, it } from "vitest";
import { mergeLocalFiles } from "../local-files";
describe("multiple windows saving the project catalog", () => {
  const a = { id: "a", name: "A", content: { value: 0 } },
    b = { id: "b", name: "B", content: { value: 0 } };
  it("does not overwrite another project's newer content", () => {
    expect(mergeLocalFiles([a, { ...b, content: { value: 1 } }], [a, b], [{ ...a, name: "A1" }, b])).toEqual([
      { ...a, name: "A1" },
      { ...b, content: { value: 1 } },
    ]);
  });
  it("preserves remote creations and never resurrects removed projects", () => {
    const c = { ...a, id: "c" };
    expect(mergeLocalFiles([b, c], [a, b], [a, { ...b, name: "B1" }])).toEqual([{ ...b, name: "B1" }, c]);
  });
  it("merges changed fields without undoing another window's organization change", () => {
    expect(mergeLocalFiles([{ ...a, orgId: "org" }], [a], [{ ...a, name: "renamed" }])).toEqual([
      { ...a, name: "renamed", orgId: "org" },
    ]);
  });
  it("preserves newer private chat when a stale window saves shared artifacts", () => {
    const old = { id: "message-1", content: "Hola" },
      newer = { id: "message-2", content: "Trabajo privado" };
    expect(mergeLocalFiles([old, newer], [old], [old])).toEqual([old, newer]);
    expect(mergeLocalFiles([old, newer], [old], [])).toEqual([newer]);
  });
});
