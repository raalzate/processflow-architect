import { describe, expect, it } from "vitest";
import { mergeProjectedFiles } from "../local-files";
describe("catálogo y ramas por ventana", () => {
  it("conserva Principal en catálogo aunque la ventana edite o consulte otra rama", () => {
    const main = { id: "clinic", name: "Clínica", content: { label: "Principal", x: 10 }, orgId: "local" };
    const before = [{ ...main, content: { label: "Borrador", x: 20 } }],
      after = [{ ...main, content: { label: "Borrador cambiado", x: 20 } }];
    const projected = mergeProjectedFiles([main], before, after, {
      fileId: "clinic",
      canonical: { name: main.name, content: main.content },
    });
    expect(projected).toEqual([main]);
    expect(after[0].content.label).toBe("Borrador cambiado");
  });
  it("conserva las actualizaciones locales de organización y de otros proyectos", () => {
    const before = [
      { id: "a", name: "Rama", content: "borrador", orgId: "old" },
      { id: "b", name: "Otro", content: "base", orgId: "old" },
    ];
    const persisted = [
      { ...before[0], content: "Principal" },
      { ...before[1], name: "Otra ventana" },
    ];
    const after = [{ ...before[0], orgId: "new" }, before[1]];
    expect(
      mergeProjectedFiles(persisted, before, after, {
        fileId: "a",
        canonical: { name: "Principal", content: "Principal" },
      }),
    ).toEqual([{ ...persisted[0], name: "Principal", orgId: "new" }, persisted[1]]);
  });
});
