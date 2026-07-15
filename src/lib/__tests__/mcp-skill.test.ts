/**
 * El skill descargable desde la guía MCP (constante embebida) debe ser
 * IDÉNTICO a la fuente canónica del repo (.claude/skills/…/SKILL.md).
 * Si editas uno, replica el cambio en el otro.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SKILL_MD,
  SKILL_EXAMPLES_MD,
  SKILL_NAME,
  SKILL_INSTALL_PATH,
  SKILL_EXAMPLES_PATH,
} from "../mcp-skill";

describe("mcp-skill (skill descargable)", () => {
  it("coincide con .claude/skills/documento-a-processflow/SKILL.md", () => {
    const canonical = readFileSync(
      resolve(process.cwd(), ".claude", "skills", SKILL_NAME, "SKILL.md"),
      "utf8"
    );
    expect(SKILL_MD).toBe(canonical);
  });

  it("coincide con .claude/skills/documento-a-processflow/references/ejemplos.md", () => {
    const canonical = readFileSync(
      resolve(process.cwd(), ".claude", "skills", SKILL_NAME, ...SKILL_EXAMPLES_PATH.split("/")),
      "utf8"
    );
    expect(SKILL_EXAMPLES_MD).toBe(canonical);
  });

  it("SKILL.md referencia el archivo de ejemplos por su ruta estándar", () => {
    expect(SKILL_MD).toContain(SKILL_EXAMPLES_PATH);
  });

  it("frontmatter declara el mismo nombre que SKILL_NAME", () => {
    expect(SKILL_MD).toMatch(new RegExp(`^---\\nname: ${SKILL_NAME}\\n`));
  });

  it("la ruta de instalación apunta a la carpeta del skill", () => {
    expect(SKILL_INSTALL_PATH).toBe(`.claude/skills/${SKILL_NAME}/SKILL.md`);
  });
});
