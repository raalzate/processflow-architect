import { describe, it, expect } from "vitest";
import { candidatosDe, declaracionesDe, extraerMarca } from "../extract";
import { reciboDe } from "../receipt";
import { normalizarColor, validarPerfil } from "../profile";

// Los tripletes esperados se calculan con el mismo normalizador: lo que se
// prueba es el MAPEO (qué color va a qué rol), no la aritmética HSL.
const hsl = (hex: string) => normalizarColor(hex)!;

const SITIO = {
  url: "https://acme.example",
  html: [
    "<html><head><style>",
    "body { background-color: #fffaf0; color: #1a1a2e; font-family: 'Inter', sans-serif; }",
    "a { color: #0b5fff; }",
    ".btn-primary { background: #ff5a36; color: white; }",
    ".muted, .caption { color: #6b7280; }",
    "/* comentario con #123456 */",
    "@media (min-width: 600px) { .hero { background: #ff5a36; } }",
    "</style></head>",
    '<body><div style="color:#ff5a36">x</div></body></html>',
  ].join("\n"),
  css: [":root { --primary: #ff5a36; } footer { color: #6b7280; }"],
};

describe("extraerMarca", () => {
  it("mapea papel, tinta, atenuado, acento, enlace y fuente con su evidencia", () => {
    const e = extraerMarca(SITIO);
    expect(e.tokens.paper).toBe(hsl("#fffaf0"));
    expect(e.tokens.ink).toBe(hsl("#1a1a2e"));
    expect(e.tokens.muted).toBe(hsl("#6b7280"));
    expect(e.tokens.accent).toBe(hsl("#ff5a36"));
    expect(e.tokens.link).toBe(hsl("#0b5fff"));
    expect(e.fuente).toBe("Inter");
    expect(e.evidencia.join("\n")).toMatch(/paper ← body \{ background-color \}/);
    expect(e.evidencia.join("\n")).toMatch(/accent ← \.btn-primary \{ background \}/);
    expect(e.evidencia.join("\n")).toMatch(/fuente ← body \{ font-family \}: Inter/);
  });

  it("cuenta candidatos por frecuencia y descarta comentarios", () => {
    const c = candidatosDe(declaracionesDe(SITIO));
    const acento = c.find((x) => x.color === hsl("#ff5a36"))!;
    expect(acento.veces).toBe(4); // .btn-primary, .hero (@media), inline, --primary
    expect(c.some((x) => x.color === hsl("#123456"))).toBe(false); // el del comentario
  });

  it("sin selectores canónicos cae a frecuencia: claro → papel, oscuro → tinta, saturado → acento", () => {
    const e = extraerMarca({ url: "u", html: "", css: [".x{background:#fafafa}.y{color:#222}.z{border-color:#e63946}.w{color:#222}"] });
    expect(e.tokens.paper).toBe(hsl("#fafafa"));
    expect(e.tokens.ink).toBe(hsl("#222"));
    expect(e.tokens.accent).toBe(hsl("#e63946"));
    expect(e.evidencia.join("\n")).toMatch(/más frecuente/);
  });

  it("un selector en lista larga sigue reconociendo a body, y un fondo transparente no es papel", () => {
    const e = extraerMarca({ url: "u", html: "", css: [".a,.b,.c,.d,.e,.f,.g,.h,.i,.j,.k,.l,.m,.n,.o,.p,.q,.r,.s,.t,.u,.v,.w,.x,.y,.z, body { background: #fafafa; color: #222 }", "body { background: rgba(0,0,0,0) }"] });
    expect(e.tokens.paper).toBe(hsl("#fafafa"));
    expect(e.tokens.ink).toBe(hsl("#222"));
  });

  it("el recibo dice cuando un color no tiene ajuste posible", () => {
    const e = extraerMarca({ url: "u", html: "", css: [] });
    const r = reciboDe({ url: "u", fecha: "2026-10-12", extraccion: e, tokens: {}, medidas: [{ token: "accent", valor: "0 0% 50%", umbral: 4.5, ratio: 1.2, ok: false, propuesta: null, ratioPropuesta: null }], conIa: false });
    expect(r.join("\n")).toMatch(/accent 0 0% 50% .* sin ajuste posible/);
  });

  it("una página sin CSS útil no inventa nada y lo dice", () => {
    const e = extraerMarca({ url: "u", html: "<p>hola</p>", css: [] });
    expect(e.tokens).toEqual({});
    expect(e.evidencia[0]).toMatch(/nada que proponer/);
  });

  it("el recibo cuenta la lectura, el mapeo, los ajustes, los rellenos y los descartes", () => {
    const e = extraerMarca(SITIO);
    const medidas = validarPerfil({ ...e.tokens });
    const r = reciboDe({ url: SITIO.url, urlFinal: "https://www.acme.example", fecha: "2026-10-12", extraccion: e, tokens: { ...e.tokens, soft: "0 0% 40%" }, medidas, conIa: false, motivoIa: "modo local" });
    const txt = r.join("\n");
    expect(r[0]).toContain("→ https://www.acme.example (una redirección)");
    expect(txt).toMatch(/heurísticas sin IA \(modo local\)/);
    // El acento del sitio no llega a 4,5:1 sobre su papel: el recibo muestra el ajuste.
    expect(txt).toMatch(new RegExp(`accent ${hsl("#ff5a36")} .* → ajustado a \\d+ \\d+% \\d+%`));
    expect(txt).toMatch(/Rellenados con la skin o derivados: soft/);
    expect(txt).toMatch(/Fuente: Inter/);
  });
});
