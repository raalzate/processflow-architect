import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { captureIntegrity, verifyIntegrity, kitProblems } from "../sdd-integrity.mjs";

const roots: string[] = [];
const workspace = () => { const root = mkdtempSync(join(tmpdir(), "pf-sdd-integrity-")); roots.push(root); return root; };
afterEach(() => { for (const root of roots.splice(0)) { if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes("pf-sdd-integrity-")) throw new Error("Unexpected test cleanup target"); rmSync(root, { recursive: true, force: true }); } });
describe("local SDD integrity", () => {
  it("captures actual file contents and detects changed, missing and added assertions", () => {
    const root = workspace(), file = join(root, "scenario.feature"), manifest = join(root, "integrity.json");
    writeFileSync(file, "Scenario: reconnect\nThen both edits survive\n");
    captureIntegrity(manifest, [file], root); expect(verifyIntegrity(manifest, root)).toEqual([]);
    writeFileSync(file, "Scenario: reconnect\nThen only one edit survives\n");
    expect(verifyIntegrity(manifest, root).join(" ")).toContain("scenario.feature");
    rmSync(file); expect(verifyIntegrity(manifest, root).join(" ")).toContain("scenario.feature");
  });
  it("normalizes CRLF across platforms and refuses to overwrite a baseline", () => {
    const root = workspace(), file = join(root, "case.test.ts"), manifest = join(root, "integrity.json");
    writeFileSync(file, "expect(result).toEqual(2);\r\n"); captureIntegrity(manifest, [file], root);
    writeFileSync(file, "expect(result).toEqual(2);\n"); expect(verifyIntegrity(manifest, root)).toEqual([]);
    const before = readFileSync(manifest, "utf8"); expect(() => captureIntegrity(manifest, [file], root)).toThrow(); expect(readFileSync(manifest, "utf8")).toBe(before);
  });
  it("rejects empty/invalid manifests and paths outside the selected workspace", () => {
    const root = workspace(), manifest = join(root, "integrity.json");
    expect(() => captureIntegrity(manifest, [], root)).toThrow();
    writeFileSync(manifest, JSON.stringify({ format: "processflow-sdd-integrity/v1", files: [] })); expect(() => verifyIntegrity(manifest, root)).toThrow();
    const outside = workspace(), file = join(outside, "secret.txt"); writeFileSync(file, "private");
    writeFileSync(manifest, JSON.stringify({ format: "processflow-sdd-integrity/v1", files: [{ path: file, sha256: "0".repeat(64) }] }));
    expect(verifyIntegrity(manifest, root).join(" ")).toContain("workspace");
  });
  it("does not accept an empty skill folder or a different skill's frontmatter", () => {
    const root = workspace(); mkdirSync(join(root, "phase")); expect(kitProblems([root], ["phase"])).toHaveLength(1);
    writeFileSync(join(root, "phase", "SKILL.md"), "---\nname: other\ndescription: Useful skill\n---\nInstructions.\n"); expect(kitProblems([root], ["phase"])).toHaveLength(1);
    writeFileSync(join(root, "phase", "SKILL.md"), "---\nname: phase\ndescription: Useful skill\n---\nInstructions.\n"); expect(kitProblems([root], ["phase"])).toEqual([]);
  });
  it("returns a failing CLI exit code when a frozen test changes", () => {
    const root = workspace(), file = join(root, "case.test.ts"), manifest = join(root, "integrity.json"), script = resolve("scripts/sdd-integrity.mjs");
    writeFileSync(file, "expect(value).toBe(1);\n");
    const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args, "--root", root], { encoding: "utf8", windowsHide: true });
    expect(run("capture", manifest, file).status).toBe(0); expect(run("verify", manifest).status).toBe(0);
    writeFileSync(file, "expect(value).toBe(0);\n"); expect(run("verify", manifest).status).toBe(1);
  });
});
