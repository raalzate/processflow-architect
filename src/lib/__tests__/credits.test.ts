/**
 * Los créditos son datos que la UI muestra tal cual. Lo que puede podrirse es la
 * versión (duplicada de `package.json`) y los enlaces: eso es lo que se prueba.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  APP_VERSION,
  CREDIT_LINE,
  CREDIT_LINKS,
  CREDIT_LOGO,
  CREDIT_ORG,
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

  it("el crédito nombra a la organización", () => {
    expect(CREDIT_LINE).toContain(CREDIT_ORG);
    expect(CREDIT_ORG).toBe("Sofka Technologies");
  });

  it("el logo existe en public/", () => {
    expect(CREDIT_LOGO.startsWith("/")).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, "public", CREDIT_LOGO.slice(1)))).toBe(true);
  });

  it("todos los enlaces son https y llevan a sofka o a su perfil", () => {
    expect(CREDIT_LINKS.length).toBeGreaterThan(1);
    for (const link of CREDIT_LINKS) {
      expect(link.href.startsWith("https://")).toBe(true);
      expect(link.label.trim()).not.toBe("");
      expect(link.title).toContain("Sofka");
    }
  });
});
