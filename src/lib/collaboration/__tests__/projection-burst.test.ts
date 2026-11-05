import { describe, expect, it } from "vitest";
import { Projection } from "../projection";
describe("ediciones rápidas de IA", () => {
  it("agrupa una ráfaga mientras guarda y conserva todos los elementos y campos remotos", async () => {
    let ui = { nodes: [] as number[], remote: 0 }, release!: () => void;
    const sent: number[][] = [];
    const projection = new Projection(() => ui, value => { ui = value; }, async (_before, after) => {
      sent.push(after.nodes); if (sent.length === 1) await new Promise<void>(resolve => { release = resolve; });
      return { ...after, remote: 1 };
    });
    projection.initialize(ui); ui = { nodes: [0], remote: 0 }; projection.observe(ui); await Promise.resolve();
    for (let n = 1; n < 100; n++) { ui = { nodes: [...ui.nodes, n], remote: 0 }; projection.observe(ui); }
    release(); await projection.settled();
    expect(ui.nodes).toEqual(Array.from({ length: 100 }, (_, n) => n)); expect(ui.remote).toBe(1);
    expect(sent.length).toBeLessThanOrEqual(3);
  });
});
