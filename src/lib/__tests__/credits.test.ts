/**
 * Los créditos son datos que la UI muestra tal cual. Lo que puede podrirse es la
 * versión (duplicada de `package.json`) y los enlaces: eso es lo que se prueba.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  APP_VERSION,
  CREDIT_AUTHOR,
  CREDIT_LINE,
  CREDIT_LINKS,
  CREDIT_REPO,
  CREDIT_REPO_URL,
  RELEASE_CHANNEL,
  versionLabel,
} from "../credits";

const repoRoot = path.resolve(__dirname, "..", "..", "..");

describe("credits", () => {
  it("APP_VERSION no se desincroniza de package.json", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")
    );
    expect(APP_VERSION).toBe(pkg.version);
  });

  it("el badge dice versión y canal", () => {
    expect(versionLabel()).toBe(`v${APP_VERSION} · ${RELEASE_CHANNEL}`);
    expect(RELEASE_CHANNEL).toBe("beta");
  });

  it("el crédito nombra al autor Y la versión (#207)", () => {
    expect(CREDIT_LINE).toContain(CREDIT_AUTHOR);
    // La versión al final: en un reporte de usuario es el primer dato que hace
    // falta y el que nunca viene. Sale de `versionLabel()`, no de un literal.
    expect(CREDIT_LINE).toContain(versionLabel());
    expect(CREDIT_LINE.trim().endsWith(versionLabel())).toBe(true);
    expect(CREDIT_AUTHOR).toBe("Raúl Andrés Alzate Gómez");
  });

  it("no queda rastro del crédito anterior", () => {
    const source = fs.readFileSync(path.join(repoRoot, "src", "lib", "credits.ts"), "utf8");
    expect(source.toLowerCase()).not.toContain("sofka");
    expect(fs.existsSync(path.join(repoRoot, "public", "sofka.png"))).toBe(false);
  });

  it("el contacto es el repo de GitHub, no un correo personal", () => {
    // El correo exponía un dato privado y no llevaba a nada mirable; el repo
    // tiene issues, releases y código. Es el mismo repo del que bajan las
    // actualizaciones (`main/services/updater.ts`).
    expect(CREDIT_REPO).toBe("raalzate/processflow-architect");
    expect(CREDIT_REPO_URL).toBe(`https://github.com/${CREDIT_REPO}`);
    const source = fs.readFileSync(path.join(repoRoot, "src", "lib", "credits.ts"), "utf8");
    expect(source).not.toMatch(/mailto:\$\{|@gmail\.com/);
  });

  it("los enlaces usan schemes que el main sabe abrir", () => {
    expect(CREDIT_LINKS.length).toBeGreaterThan(0);
    for (const link of CREDIT_LINKS) {
      expect(/^(https:\/\/|mailto:)/.test(link.href)).toBe(true);
      expect(link.label.trim()).not.toBe("");
      expect(link.title).toContain(CREDIT_AUTHOR);
    }
    expect(CREDIT_LINKS.some((l) => l.href === CREDIT_REPO_URL)).toBe(true);
    expect(CREDIT_LINKS.some((l) => l.href.startsWith("mailto:"))).toBe(false);
  });
});
