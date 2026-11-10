import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { armarAvisos } from "../third-party-notices.mjs";

// #753: los instaladores tienen que llevar el aviso de licencia de cada dependencia.
let raiz: string;
const paquete = (ruta: string, archivos: Record<string, string>) => {
  const dir = path.join(raiz, ruta);
  fs.mkdirSync(dir, { recursive: true });
  for (const [f, t] of Object.entries(archivos)) fs.writeFileSync(path.join(dir, f), t);
};

function proyecto(packages: Record<string, unknown>) {
  raiz = fs.mkdtempSync(path.join(os.tmpdir(), "pf-avisos-"));
  fs.writeFileSync(path.join(raiz, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages }));
}

afterEach(() => fs.rmSync(raiz, { recursive: true, force: true }));

describe("avisos de licencias de terceros", () => {
  it("incluye nombre, versión, licencia y el texto de LICENSE y NOTICE de cada dependencia de producción", () => {
    proyecto({
      "": { name: "app" },
      "node_modules/alfa": { version: "1.2.3", license: "MIT" },
      "node_modules/beta": { version: "2.0.0", license: "Apache-2.0" },
    });
    paquete("node_modules/alfa", { LICENSE: "Copyright (c) Alfa" });
    paquete("node_modules/beta", { "LICENSE.txt": "Apache License 2.0", NOTICE: "Beta NOTICE" });
    const txt = armarAvisos(raiz);
    expect(txt).toContain("alfa@1.2.3\nLicencia: MIT\nCopyright (c) Alfa");
    expect(txt).toContain("beta@2.0.0\nLicencia: Apache-2.0");
    expect(txt).toContain("Beta NOTICE");
    expect(txt).toContain("(2 paquetes)");
  });

  it("deja fuera las dependencias de desarrollo y no repite la misma versión anidada", () => {
    proyecto({
      "node_modules/vitest": { version: "4.0.0", license: "MIT", dev: true },
      "node_modules/gama": { version: "1.0.0", license: "ISC" },
      "node_modules/x/node_modules/gama": { name: "gama", version: "1.0.0", license: "ISC" },
    });
    const txt = armarAvisos(raiz);
    expect(txt).not.toContain("vitest");
    expect(txt.match(/gama@1\.0\.0/g)).toHaveLength(1);
  });

  it("un paquete sin archivo de licencia queda listado y lo dice", () => {
    proyecto({ "node_modules/delta": { version: "0.1.0" } });
    expect(armarAvisos(raiz)).toContain("delta@0.1.0\nLicencia: (ver texto)\n(el paquete no incluye archivo de licencia");
  });
});
