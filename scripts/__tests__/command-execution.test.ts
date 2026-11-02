import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolverComando, resolverEjecutable } from "../../.claude/hooks/harness.mjs";

describe("native harness command launch", () => {
  it("executes npm without a shell on the current platform", () => {
    const command = resolverComando(["npm", "--version"]);
    const result = spawnSync(command[0], command.slice(1), { shell: false, encoding: "utf8" });
    expect(result.error).toBeUndefined(); expect(result.status).toBe(0); expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
  it("keeps literal arguments literal", () => {
    const literal = "a; $(do-not-execute)";
    const command = resolverComando([process.execPath, "-e", "process.stdout.write(process.argv[1])", literal]);
    const result = spawnSync(command[0], command.slice(1), { shell: false, encoding: "utf8" });
    expect(result.status).toBe(0); expect(result.stdout).toBe(literal);
  });
  it("selects a bash that can run the repository hooks", () => {
    const result = spawnSync(resolverEjecutable("bash"), ["-c", "printf ready"], { shell: false, encoding: "utf8" });
    expect(result.status).toBe(0); expect(result.stdout).toBe("ready");
  });
});
