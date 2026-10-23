/**
 * Catálogo de iconos (spec 025): búsqueda y resolución puras, saneado del SVG,
 * y la SINCRONÍA del generado con el manifiesto. El gate no toca la red: lo
 * que exige es que lo versionado corresponda al manifiesto y no traiga nada
 * ejecutable.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  CATEGORIAS,
  ICONOS,
  MANIFEST_HASH,
  buscarIconos,
  esIconoValido,
  fallasDeIcono,
  iconoDeCatalogo,
  iconoDeTecnologia,
  iconoPorTecnologia,
  normalizarTexto,
  sanearSvg,
} from "../catalog";

const raiz = path.resolve(__dirname, "../../../..");
const manifiesto = fs.readFileSync(path.join(raiz, "scripts/icon-catalog.manifest.json"), "utf8");
const entradas: { id: string; categoria: string; lucide?: string }[] = JSON.parse(manifiesto).iconos;

describe("catálogo generado ↔ manifiesto", () => {
  it("el generado corresponde al manifiesto actual (si no, corré `npm run icons:build`)", () => {
    const hash = crypto.createHash("sha256").update(manifiesto).digest("hex").slice(0, 16);
    expect(MANIFEST_HASH).toBe(hash);
    expect(ICONOS.map((i) => i.id).sort()).toEqual(entradas.map((e) => e.id).sort());
  });

  it("trae al menos 120 iconos en al menos 12 categorías, todas declaradas (SC-002)", () => {
    expect(ICONOS.length).toBeGreaterThanOrEqual(120);
    const usadas = new Set(ICONOS.map((i) => i.categoria));
    expect(usadas.size).toBeGreaterThanOrEqual(12);
    const validas = new Set(CATEGORIAS.map((c) => c.id));
    for (const c of usadas) expect(validas.has(c), `categoría «${c}» no declarada`).toBe(true);
  });

  it("todo icono declara fuente y licencia, y ninguno trae contenido ejecutable ni externo", () => {
    for (const i of ICONOS) {
      expect(["simple-icons", "devicon", "lobe-icons", "lucide"], i.id).toContain(i.fuente);
      expect(i.licencia, i.id).toMatch(/CC0|MIT|ISC/);
      expect(fallasDeIcono(i), i.id).toEqual([]);
      if (i.fuente !== "lucide") {
        expect(i.svg, i.id).toMatch(/<(path|circle|rect|polygon|ellipse|line|polyline)\b/);
        expect(i.viewBox, i.id).toMatch(/^-?[\d.]+( -?[\d.]+){3}$/);
      }
    }
  });

  it("los ids de lucide del manifiesto son los que el catálogo expone (el lienzo los mapea)", () => {
    const esperados = entradas.filter((e) => e.lucide).map((e) => e.lucide!).sort();
    expect(ICONOS.filter((i) => i.fuente === "lucide").map((i) => i.lucide!).sort()).toEqual(esperados);
  });
});

describe("búsqueda y resolución", () => {
  it("encuentra por nombre, alias e id, sin acentos ni mayúsculas, y ordena exacto → prefijo → contiene", () => {
    expect(buscarIconos("postgres")[0].id).toBe("si-postgresql");
    expect(buscarIconos("Base De Datos").map((i) => i.id)).toContain("lu-Database");
    expect(buscarIconos("mensajería").map((i) => i.id)).toContain("si-apachekafka");
    expect(buscarIconos("mensajeria").map((i) => i.id)).toContain("si-apachekafka");
    expect(buscarIconos("si-slack").length + buscarIconos("slack").length).toBeGreaterThan(0);
    // «nube» es prefijo del NOMBRE del genérico y alias de AWS/Azure/GCP: gana el nombre.
    expect(buscarIconos("nube")[0].id).toBe("lu-Cloud");
    expect(buscarIconos("nube").slice(1, 4).map((i) => i.categoria)).toEqual(["nube", "nube", "nube"]);
    expect(buscarIconos("Kubernetes")[0].id).toBe("si-kubernetes");
    expect(buscarIconos("zzz-no-existe")).toEqual([]);
  });

  it("filtra por categoría y sin consulta devuelve la categoría entera ordenada por nombre", () => {
    const pagos = buscarIconos("", "pagos");
    expect(pagos.length).toBeGreaterThanOrEqual(3);
    expect(pagos.every((i) => i.categoria === "pagos")).toBe(true);
    expect(pagos.map((i) => i.nombre)).toEqual([...pagos.map((i) => i.nombre)].sort((a, b) => a.localeCompare(b)));
    expect(buscarIconos("kafka", "pagos")).toEqual([]);
  });

  it("resuelve por id y dice si un id es válido", () => {
    expect(iconoDeCatalogo("si-kubernetes")?.nombre).toBe("Kubernetes");
    expect(iconoDeCatalogo("si-kubernetes")?.color).toMatch(/^[0-9A-F]{6}$/);
    expect(iconoDeCatalogo("nada")).toBeUndefined();
    expect(esIconoValido("lu-Cloud")).toBe(true);
    expect(esIconoValido(undefined)).toBe(false);
    expect(normalizarTexto("  Móvil ")).toBe("movil");
  });
});

describe("sanearSvg", () => {
  const base = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>X</title><path d="M0 0h24v24H0z"/></svg>';

  it("quita título, scripts, estilos, eventos y referencias externas, y conserva el dibujo", () => {
    const sucio = base
      .replace("<path", '<script>alert(1)</script><style>p{}</style><foreignObject><div/></foreignObject><image href="https://x/y.png"/><path onclick="x()"')
      .replace('d="M0', 'href="https://evil" d="M0');
    const s = sanearSvg(sucio, "p")!;
    expect(s.viewBox).toBe("0 0 24 24");
    expect(s.inner).toBe('<path d="M0 0h24v24H0z"/>');
  });

  it("prefija los ids de defs y sus referencias para que dos logos no se pisen", () => {
    const con = '<svg viewBox="0 0 10 10"><defs><linearGradient id="a"><stop offset="0"/></linearGradient></defs><path fill="url(#a)" d="M0 0h1"/><use href="#a"/></svg>';
    const s = sanearSvg(con, "dv-x")!;
    expect(s.inner).toContain('id="dv-x-a"');
    expect(s.inner).toContain("url(#dv-x-a)");
    expect(s.inner).toContain('href="#dv-x-a"');
    expect(s.inner).not.toContain('id="a"');
  });

  it("no deja pasar href sin comillas, style ni eventos sin comillas, y prefija ids con comilla simple", () => {
    const sucio =
      '<svg viewBox="0 0 10 10"><defs><linearGradient id=\'a\'><stop offset="0"/></linearGradient></defs>' +
      '<use href=https://evil onclick=x() /><path style="behavior:expression(1)" fill="url(#a)" d="M0 0h1"/></svg>';
    const s = sanearSvg(sucio, "p")!;
    expect(s.inner).not.toMatch(/evil|onclick|style/);
    expect(s.inner).toContain('id="p-a"');
    expect(s.inner).toContain("url(#p-a)");
    const base = { id: "dv-x", nombre: "x", categoria: "nube", alias: [], fuente: "devicon" as const, licencia: "MIT", viewBox: "0 0 1 1" };
    expect(fallasDeIcono({ ...base, svg: "<use href=https://evil /><path d=\"M0 0\"/>" })).toContainEqual(expect.stringContaining("externa"));
    expect(fallasDeIcono({ ...base, svg: "<path style=\"x\" d=\"M0 0\"/>" })).toContainEqual(expect.stringContaining("style"));
  });

  it("conserva el fill-rule evenodd de la raíz: sin él un logo con huecos se ve macizo", () => {
    const s = sanearSvg('<svg fill-rule="evenodd" viewBox="0 0 24 24"><path d="M0 0h24v24H0zM6 6h12v12H6z"/></svg>', "lb-x")!;
    expect(s.inner.startsWith('<g fill-rule="evenodd"')).toBe(true);
    expect(sanearSvg('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>', "p")!.inner).not.toContain("<g");
  });

  it("rechaza lo que no es un SVG con viewBox o no tiene dibujo", () => {
    expect(sanearSvg("<div>no</div>", "p")).toBeNull();
    expect(sanearSvg('<svg width="10"><path d="M0 0"/></svg>', "p")).toBeNull();
    expect(sanearSvg('<svg viewBox="0 0 1 1"><script>x</script></svg>', "p")).toBeNull();
  });
});

describe("icono por tecnología (#643)", () => {
  it("reconoce la etiqueta aunque traiga versión, signos o mayúsculas", () => {
    expect(iconoPorTecnologia(["Node 20", "TypeScript"])).toBe("si-nodedotjs");
    expect(iconoPorTecnologia(["Python 3.11+", "stdlib"])).toBe("si-python");
    expect(iconoPorTecnologia(["sqlite"])).toBe("si-sqlite");
    expect(iconoPorTecnologia(["PostgreSQL 16"])).toBe("si-postgresql");
  });

  it("toma la PRIMERA etiqueta que el catálogo reconoce", () => {
    expect(iconoPorTecnologia(["stdlib", "Redis"])).toBe("si-redis");
  });

  it("un alias compartido elige por el nombre, y un empate no elige", () => {
    // «postgres» es alias de PostgreSQL y de Supabase.
    expect(iconoDeTecnologia("postgres")?.id).toBe("si-postgresql");
    // «nube» es alias de AWS, Azure y Google Cloud: no hay uno inequívoco.
    expect(iconoDeTecnologia("nube")).toBeUndefined();
  });

  it("sin etiquetas reconocibles no inventa", () => {
    expect(iconoPorTecnologia(["stdlib", "cron"])).toBeUndefined();
    expect(iconoPorTecnologia(undefined)).toBeUndefined();
    expect(iconoPorTecnologia([])).toBeUndefined();
  });

  it("trae las plataformas y la IA que faltaban", () => {
    for (const [tag, id] of [
      ["Railway", "si-railway"],
      ["OpenAI", "lb-openai"],
      ["Bedrock", "lb-bedrock"],
      ["AWS Lambda", "lu-Lambda"],
      ["Ollama", "si-ollama"],
    ]) {
      expect(iconoPorTecnologia([tag]), tag).toBe(id);
    }
  });
});
