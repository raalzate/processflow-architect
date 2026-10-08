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
  DESIGN_SKILL_IDS,
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

  // La exención del arnés de diseño la decide una constante de producción: sacar
  // un skill de DESIGN_SKILL_IDS lo liberaría del contrato sin tocar este test.
  // Se fija la partición (revisión de #461).
  it("la partición de skills es exacta: los de diseño más pulir-elemento", () => {
    expect([...SKILL_IDS].sort()).toEqual([...DESIGN_SKILL_IDS, "pulir-elemento"].sort());
    expect(DESIGN_SKILL_IDS).toEqual(["documento-a-processflow", "disenar-diagrama"]);
  });

  it("entrega todos los skills, con SKILL.md primero", () => {
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
      tools: [
        "get_app_state",
        "export_as_view",
        "review_diagram",
        "export_to_app",
        "list_artifacts",
        "get_artifact",
        "list_views",
        "get_view",
      ],
      defaultNotation: "ddd",
      maxNodes: 40,
      viewsLimit: 50,
    });
    expect(block).toContain("http://127.0.0.1:7331/mcp");
    expect(block).toContain("DIRECTO");
    expect(block).toContain("/tmp/ws");
    expect(block).not.toContain("No disponibles aquí");
  });

  it("declara ausentes las herramientas de LECTURA de la app cuando el transporte no las expone", () => {
    // Un skill que hable de leer artefactos por stdio manda al agente a intentar
    // algo que no existe: la config lo dice antes de que lo intente.
    const block = skillConfigBlock({
      transport: "stdio",
      tools: ["list_notations", "create_diagram", "export_to_app"],
    });
    expect(block).toContain("No disponibles aquí");
    for (const t of ["list_artifacts", "get_artifact", "list_views", "get_view"]) {
      expect(block).toContain(t);
    }
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
    // Leer antes de escribir: sin estos pasos el agente rehace lo que la app ya
    // tiene (vistas, artefactos) y crea una segunda versión de la verdad.
    "list_views",
    "list_artifacts",
    "get_artifact",
    "source",
    "record_ambiguity",
    "resolve_ambiguity",
    "validate_diagram",
    "review_diagram",
    "suggest_views",
    "export_to_app",
  ];

  // Sólo los skills que DISEÑAN diagramas recorren el arnés entero; el de pulir
  // una caja (019) no crea ni exporta nada y tiene su propio contrato abajo.
  const deDiseno = () => listSkills().filter((s) => (DESIGN_SKILL_IDS as readonly string[]).includes(s.id));

  it("los skills de diseño nombran cada paso del arnés", () => {
    expect(deDiseno().map((s) => s.id)).toEqual([...DESIGN_SKILL_IDS]);
    for (const s of deDiseno()) {
      for (const paso of pasos) {
        expect(s.files[0].content, `${s.id} no menciona ${paso}`).toContain(paso);
      }
    }
  });

  it("el skill de pulir una caja lee la ficha, propone antes de escribir y no exporta (019)", () => {
    const md = getSkill("pulir-elemento")!.files[0].content;
    for (const tool of ["get_app_state", "get_focused_element", "set_view_element_spec", "read_element_doc", "needsClarification", "merge: true"]) {
      expect(md, `pulir-elemento no menciona ${tool}`).toContain(tool);
    }
    // Proponer va antes que escribir: es la regla de todo el arnés.
    expect(md.indexOf("Proponer")).toBeLessThan(md.indexOf("set_view_element_spec"));
    expect(md).not.toContain("export_to_app");
  });

  it("los skills de diseño documentan el material adjunto de la caja (#366)", () => {
    // Una tool que el agente externo no ve, no la usa: el skill es su única
    // forma de enterarse de que la caja puede llevar su contrato.
    for (const s of deDiseno()) {
      for (const tool of [
        "attach_element_doc",
        "list_element_docs",
        "read_element_doc",
        "search_docs",
      ]) {
        expect(s.files[0].content, `${s.id} no menciona ${tool}`).toContain(tool);
      }
    }
  });

  it("el skill principal referencia su archivo de ejemplos", () => {
    expect(SKILL_MD).toContain(SKILL_EXAMPLES_PATH);
  });
});

describe("metadatos en la guía del agente", () => {
  it("los skills de diseño explican `metadata` con ejemplo y lo distinguen de `source`", () => {
    // Sin esto la propiedad existe y nadie la usa: el agente sólo sabe lo que la
    // skill y las descripciones de las tools le dicen (FR-008). El skill de pulir
    // una caja (019) no escribe metadatos: su contrato es la spec.
    for (const skill of listSkills().filter((s) => (DESIGN_SKILL_IDS as readonly string[]).includes(s.id))) {
      const md = skill.files[0].content;
      expect(md, skill.id).toMatch(/metadata/);
      expect(md, skill.id).toContain("repo");
      expect(md, skill.id).toContain("wiki");
      expect(md, skill.id).toContain("metadataRemove");
      expect(md, skill.id).toMatch(/dónde vive/i);
    }
  });
});
