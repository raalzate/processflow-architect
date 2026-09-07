import { describe, expect, it } from "vitest";
// El script del arnés es .mjs, pero con `allowJs` tsc le infiere los tipos.
import { RUTAS_INDEXABLES, sealVerdict } from "../graph-seal.mjs";

const HEAD = "ab3b533ef5faeaa553f6e6146e9a01b2bbfde5b1";
const VIEJO = "e7db11c5fa30825aaa73d0fcbd06d21045afc328";

describe("veredicto del sello del índice (#259)", () => {
  it("sellado para HEAD: verde", () => {
    const v = sealVerdict({ sello: HEAD, head: HEAD, pendientes: [] });
    expect(v.ok).toBe(true);
    expect(v.motivo).toBe("sellado");
  });

  it("sello VIEJO sin diff indexable: verde — es el merge de PR", () => {
    // ESTE es el falso rojo que costó el tiempo: el sello lo escribe el
    // post-commit local, así que tras un merge por PR nunca coincide con HEAD.
    // Exigir igualdad de SHA ponía el gate en rojo con el índice sano.
    const v = sealVerdict({ sello: VIEJO, head: HEAD, pendientes: [] });
    expect(v.ok).toBe(true);
    expect(v.motivo).toBe("sin-diff");
  });

  it("sello viejo CON diff indexable: rojo, y dice cuántos y cuáles", () => {
    // Acá el freno tiene que morder: una consulta contestaría con el repo viejo.
    const v = sealVerdict({
      sello: VIEJO,
      head: HEAD,
      pendientes: ["src/lib/a.ts", "src/lib/b.ts", "docs/c.md", "scripts/d.mjs"],
    });
    expect(v.ok).toBe(false);
    expect(v.motivo).toBe("atrasado");
    expect(v.mensaje).toContain("4 archivo(s)");
    expect(v.mensaje).toContain("src/lib/a.ts");
  });

  it("sin sello pero fresco por reloj: verde — es el índice hecho a mano", () => {
    // ESTA es la divergencia que quedó viva en el primer intento del arreglo:
    // `graph-check.mjs` toleraba el índice sin sello cayendo al reloj y el
    // self-test lo ponía rojo. Mientras las dos señales no llamen a esta
    // función, el caso se puede volver a partir en dos.
    const v = sealVerdict({ sello: "", head: HEAD, pendientes: [], frescoPorReloj: true });
    expect(v.ok).toBe(true);
    expect(v.motivo).toBe("sin-sello-fresco");
  });

  it("sin sello y viejo por reloj: rojo, y el remedio nombra al que sella", () => {
    // `graph:update` reconstruye el grafo pero NO escribe el sello: el único
    // que lo escribe es el post-commit. Un mensaje que manda a correr algo que
    // no arregla nada es lo que hizo perder el tiempo la primera vez.
    const v = sealVerdict({ sello: "", head: HEAD, pendientes: [], frescoPorReloj: false });
    expect(v.ok).toBe(false);
    expect(v.motivo).toBe("sin-sello");
    expect(v.mensaje).toContain("post-commit");
  });

  it("el reloj NO rescata un sello viejo con diff indexable", () => {
    // La tolerancia por reloj es sólo para el índice SIN sello. Si hay sello y
    // hay pendientes, el freno muerde aunque el archivo sea recién escrito.
    const v = sealVerdict({
      sello: VIEJO,
      head: HEAD,
      pendientes: ["src/lib/a.ts"],
      frescoPorReloj: true,
    });
    expect(v.ok).toBe(false);
    expect(v.motivo).toBe("atrasado");
  });

  it("el mensaje de atrasado nombra el comando que se le pasa", () => {
    const v = sealVerdict({
      sello: VIEJO,
      head: HEAD,
      pendientes: ["src/lib/a.ts"],
      updateCommand: "npm run graph:update",
    });
    expect(v.mensaje).toContain("npm run graph:update");
  });

  it("las rutas indexables son las que graphify sabe leer", () => {
    // Si las dos señales miran extensiones distintas, vuelven a discrepar.
    expect([...RUTAS_INDEXABLES].sort()).toEqual(
      ["*.js", "*.md", "*.mjs", "*.ts", "*.tsx"].sort()
    );
  });
});
