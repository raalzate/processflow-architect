import { describe, expect, it } from "vitest";
import { Projection } from "../projection";

describe("UI projection queue", () => {
  it("captures an unsent UI edit before applying a remote snapshot", async () => {
    let ui = { name: "base", remote: 0 };
    const sent: unknown[] = [];
    const projection = new Projection(
      () => ui,
      value => {
        ui = value;
      },
      async (before, after) => {
        sent.push({ before, after });
        return { ...after, remote: 1 };
      },
    );
    projection.initialize(ui);
    projection.observe(ui);
    ui = { ...ui, name: "unsent" };
    projection.receive({ name: "base", remote: 1 });
    await projection.settled();
    expect(sent).toEqual([{ before: { name: "base", remote: 0 }, after: { name: "unsent", remote: 0 } }]);
    expect(ui).toEqual({ name: "unsent", remote: 1 });
  });
  it("keeps independent queues while switching projects", async () => {
    let release!: (value: { name: string }) => void;
    let uiA = { name: "A" },
      uiB = { name: "stale B" };
    const a = new Projection(
      () => uiA,
      v => {
        uiA = v;
      },
      () =>
        new Promise(resolve => {
          release = resolve;
        }),
    );
    const sentB: unknown[] = [];
    const b = new Projection(
      () => uiB,
      v => {
        uiB = v;
      },
      async (old, value) => {
        sentB.push({ old, value });
        return value;
      },
    );
    a.initialize(uiA);
    a.observe(uiA);
    a.observe({ name: "edit A" });
    await Promise.resolve();
    a.detach();
    b.initialize({ name: "saved B" });
    b.observe(uiB);
    release({ name: "edit A" });
    await a.settled();
    await b.settled();
    expect(uiB.name).toBe("saved B");
    expect(sentB).toEqual([]);
  });
  it("does not publish the old render while an applied snapshot is committing", async () => {
    let ui = { value: "old" };
    const applied: unknown[] = [],
      sent: unknown[] = [];
    const projection = new Projection(
      () => ui,
      v => applied.push(v),
      async (_old, value) => {
        sent.push(value);
        return value;
      },
    );
    projection.initialize({ value: "new" });
    projection.observe(ui);
    ui = { value: "new" };
    projection.observe(ui);
    await projection.settled();
    expect(applied).toEqual([{ value: "new" }]);
    expect(sent).toEqual([]);
  });
  it("captures an edit rendered while the first write response is in flight", async () => {
    let ui = { value: 0 },
      release!: (value: { value: number }) => void;
    const sent: number[] = [];
    const projection = new Projection(
      () => ui,
      value => {
        ui = value;
      },
      async (_before, after) => {
        sent.push(after.value);
        return sent.length === 1
          ? new Promise(resolve => {
              release = resolve;
            })
          : after;
      },
    );
    projection.initialize(ui);
    projection.observe(ui);
    ui = { value: 1 };
    projection.observe(ui);
    await Promise.resolve();
    ui = { value: 2 };
    release({ value: 1 });
    await projection.settled();
    expect(ui.value).toBe(2);
    expect(sent).toEqual([1, 2]);
  });
  it("publishes an edit coalesced with the application render", async () => {
    let ui = { remote: 0, local: 0 };
    const sent: unknown[] = [];
    const projection = new Projection(
      () => ui,
      () => {},
      async (before, after) => {
        sent.push({ before, after });
        return after;
      },
    );
    projection.initialize({ remote: 1, local: 0 });
    ui = { remote: 1, local: 2 };
    projection.observe(ui);
    await projection.settled();
    expect(sent).toEqual([{ before: { remote: 1, local: 0 }, after: { remote: 1, local: 2 } }]);
  });
});
