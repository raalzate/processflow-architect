import { describe, expect, it, beforeEach } from "vitest";
import {
  clipboardOrigin,
  copySelection,
  getSharedClipboard,
  pasteClipboard,
  setSharedClipboard,
  uniqueCopyName,
  PASTE_OFFSET,
} from "../clipboard";
import type { DesignerLink, DesignerNode } from "../serialize";

const node = (over: Partial<DesignerNode> & { id: string; nombre: string }): DesignerNode => ({
  tipo_elemento: "Comando",
  estado_comparativo: "nuevo",
  x: 0,
  y: 0,
  ...over,
});

const link = (over: Partial<DesignerLink> & { id: string; sourceId: string; targetId: string }): DesignerLink => ({
  descripcion: "produce",
  ...over,
});

const mapa = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]));

/** Ids deterministas para poder afirmar sobre el resultado. */
const idGen = () => {
  let i = 0;
  return () => `new-${++i}`;
};

describe("copySelection", () => {
  it("devuelve null si la selección no toca ningún nodo", () => {
    const nodes = mapa([node({ id: "a", nombre: "A" })]);
    expect(copySelection(nodes, new Map(), new Set(["fantasma"]))).toBeNull();
  });

  it("copia sólo los enlaces con AMBAS puntas dentro de la selección", () => {
    const nodes = mapa([
      node({ id: "a", nombre: "A" }),
      node({ id: "b", nombre: "B" }),
      node({ id: "c", nombre: "C" }),
    ]);
    const links = mapa([
      link({ id: "ab", sourceId: "a", targetId: "b" }),
      link({ id: "bc", sourceId: "b", targetId: "c" }),
    ]);
    const clip = copySelection(nodes, links, new Set(["a", "b"]))!;
    expect(clip.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(clip.links.map((l) => l.id)).toEqual(["ab"]);
  });

  it("copiar un contenedor se lleva su contenido, incluso anidado", () => {
    const nodes = mapa([
      node({ id: "pool", nombre: "Pool", tipo_elemento: "Agregado", agregado: "Pool" }),
      node({ id: "hijo", nombre: "Hijo", agregado: "Pool" }),
      node({ id: "sub", nombre: "Sub", tipo_elemento: "Agregado", agregado: "Pool" }),
      node({ id: "nieto", nombre: "Nieto", agregado: "Sub" }),
      node({ id: "fuera", nombre: "Fuera", agregado: "" }),
    ]);
    const clip = copySelection(nodes, new Map(), new Set(["pool"]))!;
    expect(clip.nodes.map((n) => n.id).sort()).toEqual(["hijo", "nieto", "pool", "sub"]);
  });

  it("no muta los nodos originales (copia por valor)", () => {
    const original = node({ id: "a", nombre: "A" });
    const clip = copySelection(mapa([original]), new Map(), new Set(["a"]))!;
    clip.nodes[0].nombre = "otro";
    expect(original.nombre).toBe("A");
  });
});

describe("uniqueCopyName", () => {
  it("conserva el nombre si está libre", () => {
    expect(uniqueCopyName("Pago", new Set())).toBe("Pago");
  });
  it("sufija cuando choca, y no encadena sufijos", () => {
    expect(uniqueCopyName("Pago", new Set(["Pago"]))).toBe("Pago (copia)");
    expect(uniqueCopyName("Pago (copia)", new Set(["Pago", "Pago (copia)"]))).toBe("Pago (copia 2)");
  });
});

describe("clipboardOrigin", () => {
  it("es la esquina superior izquierda del contenido", () => {
    expect(
      clipboardOrigin({
        nodes: [node({ id: "a", nombre: "A", x: 90, y: 40 }), node({ id: "b", nombre: "B", x: 30, y: 120 })],
        links: [],
      })
    ).toEqual({ x: 30, y: 40 });
  });
  it("cae a 0,0 sin nodos", () => {
    expect(clipboardOrigin({ nodes: [], links: [] })).toEqual({ x: 0, y: 0 });
  });
});

describe("pasteClipboard", () => {
  const clip = {
    nodes: [
      node({ id: "a", nombre: "A", x: 100, y: 100 }),
      node({ id: "b", nombre: "B", x: 200, y: 100 }),
    ],
    links: [
      link({
        id: "ab",
        sourceId: "a",
        targetId: "b",
        midpoints: [{ x: 150, y: 150 }],
      }),
    ],
  };

  it("crea ids nuevos y reapunta el enlace a las copias", () => {
    const res = pasteClipboard(new Map(), new Map(), clip, { newId: idGen() });
    expect(res.nodes.has("a")).toBe(false);
    const l = Array.from(res.links.values())[0];
    expect(l.sourceId).toBe("new-1");
    expect(l.targetId).toBe("new-2");
    expect(res.newIds.size).toBe(3); // dos nodos + un enlace
  });

  it("desplaza la geometría (nodos y puntos de quiebre) con el offset por defecto", () => {
    const res = pasteClipboard(new Map(), new Map(), clip, { newId: idGen() });
    expect(res.nodes.get("new-1")).toMatchObject({ x: 100 + PASTE_OFFSET.x, y: 100 + PASTE_OFFSET.y });
    expect(Array.from(res.links.values())[0].midpoints).toEqual([
      { x: 150 + PASTE_OFFSET.x, y: 150 + PASTE_OFFSET.y },
    ]);
  });

  it("con `at` la esquina del contenido cae en el punto pedido", () => {
    const res = pasteClipboard(new Map(), new Map(), clip, { newId: idGen(), at: { x: 0, y: 500 } });
    expect(res.nodes.get("new-1")).toMatchObject({ x: 0, y: 500 });
    expect(res.nodes.get("new-2")).toMatchObject({ x: 100, y: 500 });
  });

  it("conserva el nombre en un lienzo vacío y lo sufija si ya existe", () => {
    const vacío = pasteClipboard(new Map(), new Map(), clip, { newId: idGen() });
    expect(vacío.nodes.get("new-1")!.nombre).toBe("A");

    const existente = mapa([node({ id: "x", nombre: "A" })]);
    const res = pasteClipboard(existente, new Map(), clip, { newId: idGen() });
    expect(res.nodes.get("new-1")!.nombre).toBe("A (copia)");
    expect(res.nodes.size).toBe(3);
  });

  it("reapunta el `agregado` del contenido al contenedor copiado", () => {
    const nodes = mapa([
      node({ id: "pool", nombre: "Pool", tipo_elemento: "Agregado", agregado: "Pool" }),
      node({ id: "hijo", nombre: "Hijo", agregado: "Pool" }),
    ]);
    const c = copySelection(nodes, new Map(), new Set(["pool"]))!;
    const res = pasteClipboard(nodes, new Map(), c, { newId: idGen() });
    const copias = Array.from(res.newIds).map((id) => res.nodes.get(id)!);
    const contenedor = copias.find((n) => n.tipo_elemento === "Agregado")!;
    const hijo = copias.find((n) => n.nombre.startsWith("Hijo"))!;
    expect(contenedor.nombre).toBe("Pool (copia)");
    expect(contenedor.agregado).toBe("Pool (copia)");
    expect(hijo.agregado).toBe("Pool (copia)");
  });

  it("un hijo cuyo padre NO se copió se queda en el contenedor original", () => {
    const nodes = mapa([
      node({ id: "pool", nombre: "Pool", tipo_elemento: "Agregado", agregado: "Pool" }),
      node({ id: "hijo", nombre: "Hijo", agregado: "Pool" }),
    ]);
    const c = copySelection(nodes, new Map(), new Set(["hijo"]))!;
    const res = pasteClipboard(nodes, new Map(), c, { newId: idGen() });
    expect(res.nodes.get("new-1")!.agregado).toBe("Pool");
  });

  it("lo pegado queda marcado como nuevo", () => {
    const c = { nodes: [node({ id: "a", nombre: "A", estado_comparativo: "eliminado" as const })], links: [] };
    const res = pasteClipboard(new Map(), new Map(), c, { newId: idGen() });
    expect(res.nodes.get("new-1")!.estado_comparativo).toBe("nuevo");
  });
});

describe("portapapeles compartido", () => {
  beforeEach(() => setSharedClipboard(null));

  it("empieza vacío y devuelve lo último guardado", () => {
    expect(getSharedClipboard()).toBeNull();
    const clip = { nodes: [node({ id: "a", nombre: "A" })], links: [] };
    setSharedClipboard(clip);
    expect(getSharedClipboard()).toBe(clip);
  });
});

describe("metadatos al copiar y pegar", () => {
  it("la copia se lleva los metadatos, en orden y sin compartir el array", () => {
    const meta = [
      { clave: "repo", valor: "acme/pagos-svc", url: "https://github.com/acme/pagos-svc" },
      { clave: "owner", valor: "Equipo Pagos" },
    ];
    const nodes = new Map<string, DesignerNode>([
      ["cmd", node({ id: "cmd", nombre: "Pagar", metadata: meta })],
    ]);
    const clip = copySelection(nodes, new Map(), ["cmd"])!;
    expect(clip.nodes[0].metadata).toEqual(meta);
    expect(clip.nodes[0].metadata).not.toBe(meta);

    let i = 0;
    const res = pasteClipboard(nodes, new Map(), clip, { newId: () => `n${++i}` });
    const pegado = res.nodes.get("n1")!;
    expect(pegado.metadata).toEqual(meta);
    expect(pegado.metadata).not.toBe(nodes.get("cmd")!.metadata);
  });
});
