/**
 * Los skills embebidos (los que descarga la guía MCP y escribe `install_skill`)
 * deben ser IDÉNTICOS a la fuente canónica del repo (`.claude/skills/**`). El
 * embed se genera con `npm run skills:sync`: si editas un skill y no regeneras,
 * estas pruebas se ponen rojas — es la red que evita entregar un skill viejo.
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
  SKILL_IDS,
  listSkills,
  getSkill,
  renderSkillFiles,
  skillConfigBlock,
  skillInstallPath,
} from "../mcp-skill";

const canonical = (id: string, file: string) =>
  readFileSync(resolve(process.cwd(), ".claude", "skills", id, ...file.split("/")), "utf8");

describe("skills embebidos", () => {
  it("cada archivo de cada skill coincide byte a byte con el canónico", () => {
    for (const skill of listSkills()) {
      expect(skill.files.length).toBeGreaterThan(0);
      for (const f of skill.files) {
        expect(f.content, `${skill.id}/${f.path} desincronizado`).toBe(canonical(skill.id, f.path));
      }
    }
  });

  it("entrega los dos skills, con SKILL.md primero", () => {
    expect(listSkills().map((s) => s.id)).toEqual([...SKILL_IDS]);
    for (const s of listSkills()) {
      expect(s.files[0].path).toBe("SKILL.md");
      expect(s.summary.length).toBeGreaterThan(20);
    }
  });

  it("el frontmatter de cada skill declara su propio id", () => {
    for (const s of listSkills()) {
      expect(s.files[0].content).toMatch(new RegExp(`^---\\nname: ${s.id}\\n`));
    }
  });

  it("getSkill devuelve undefined para un id desconocido y renderSkillFiles lanza", () => {
    expect(getSkill("inexistente")).toBeUndefined();
    expect(() => renderSkillFiles("inexistente")).toThrow(/No existe el skill/);
  });

  it("las rutas de instalación son las estándar de Claude Code", () => {
    expect(skillInstallPath(SKILL_NAME)).toBe(`.claude/skills/${SKILL_NAME}/SKILL.md`);
    expect(SKILL_INSTALL_PATH).toBe(`.claude/skills/${SKILL_NAME}/SKILL.md`);
  });
});

describe("configuración inyectada", () => {
  it("en modo HTTP declara la url y que el export llega al lienzo", () => {
    const block = skillConfigBlock({
      transport: "http",
      url: "http://127.0.0.1:7331/mcp",
      workspace: "/tmp/ws",
      tools: ["get_app_state", "export_as_view", "review_diagram", "export_to_app"],
      defaultNotation: "ddd",
      maxNodes: 40,
      viewsLimit: 50,
    });
    expect(block).toContain("http://127.0.0.1:7331/mcp");
    expect(block).toContain("DIRECTO");
    expect(block).toContain("/tmp/ws");
    expect(block).not.toContain("No disponibles aquí");
  });

  it("en modo stdio avisa de que no hay vistas y lista lo que falta", () => {
    const block = skillConfigBlock({
      transport: "stdio",
      tools: ["export_to_app", "validate_diagram"],
    });
    expect(block).toContain("stdio");
    expect(block).toContain("No disponibles aquí");
    expect(block).toContain("export_as_view");
  });

  it("inyecta el bloque DESPUÉS del frontmatter, sin tocar el resto", () => {
    const files = renderSkillFiles(SKILL_NAME, { transport: "stdio" });
    const md = files.find((f) => f.path === "SKILL.md")!.content;
    const lines = md.split("\n");
    expect(lines[0]).toBe("---");
    const finFrontmatter = lines.indexOf("---", 1);
    const bloque = lines.indexOf("## Configuración activa (generada al instalar)");
    expect(bloque).toBeGreaterThan(finFrontmatter);
    expect(bloque).toBeLessThan(lines.indexOf("# Documento → Portafolio de diagramas en Processflow Architect"));
    // El resto del skill viaja intacto.
    expect(md).toContain("## 0 · Ingesta: mira antes de tocar");
    expect(files.find((f) => f.path === SKILL_EXAMPLES_PATH)!.content).toBe(SKILL_EXAMPLES_MD);
  });

  it("sin config entrega el skill tal cual", () => {
    expect(renderSkillFiles(SKILL_NAME)[0].content).toBe(SKILL_MD);
  });
});

describe("contrato del arnés dentro del skill", () => {
  // El skill es el "arnés" del agente externo: si estos pasos desaparecen, el
  // agente vuelve a subir diagramas sin trazabilidad ni revisión.
  const pasos = [
    "get_app_state",
    "source",
    "record_ambiguity",
    "resolve_ambiguity",
    "validate_diagram",
    "review_diagram",
    "suggest_views",
    "export_to_app",
  ];

  it("los dos skills nombran cada paso del arnés", () => {
    for (const s of listSkills()) {
      for (const paso of pasos) {
        expect(s.files[0].content, `${s.id} no menciona ${paso}`).toContain(paso);
      }
    }
  });

  it("el skill principal referencia su archivo de ejemplos", () => {
    expect(SKILL_MD).toContain(SKILL_EXAMPLES_PATH);
  });
});
