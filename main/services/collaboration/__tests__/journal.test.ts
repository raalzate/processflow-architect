import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Journal } from "../journal";

describe("durable collaboration journal", () => {
  it("replays updates after process restart and repairs an interrupted final append", () => {
    const dir = mkdtempSync(join(tmpdir(), "pf-journal-"));
    const file = join(dir, "updates");
    try {
      const first = new Journal(file);
      first.append(Uint8Array.of(1, 2, 3));
      first.append(Uint8Array.of(4, 5));
      first.close();
      appendFileSync(file, Buffer.from([0, 0, 0, 10, 0, 0]));
      const second = new Journal(file);
      expect(second.updates.map(u => [...u])).toEqual([
        [1, 2, 3],
        [4, 5],
      ]);
      second.append(Uint8Array.of(6));
      second.close();
      const third = new Journal(file);
      expect(third.updates.length).toBe(3);
      third.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("refuses checksum corruption without discarding acknowledged history", () => {
    const dir = mkdtempSync(join(tmpdir(), "pf-journal-"));
    const file = join(dir, "updates");
    try {
      const first = new Journal(file);
      first.append(Uint8Array.of(1, 2, 3));
      first.close();
      const bytes = readFileSync(file);
      bytes[37] = 9;
      writeFileSync(file, bytes);
      expect(() => new Journal(file)).toThrow("dañado");
      expect(readFileSync(file)).toEqual(bytes);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
