import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #529: electron-serve 3.0.1 pasó a registrar su scheme en un `queueMicrotask`.
 * En main.ts los `require` corren síncronos: el microtask de electron-serve queda
 * encolado al importar config.ts y se ejecuta DESPUÉS del body de main.ts. Su
 * llamada (sólo 'app') quedaba última y borraba 'litert-model': la IA local moría
 * con «URL scheme "litert-model" is not supported», y ningún test lo veía.
 *
 * El cargador de Vitest no reproduce ese orden (ejecuta cada import con `await` y
 * drena los microtasks entre medio), así que se modela el contrato directamente:
 * un registro encolado ANTES, y `registerPrivilegedSchemes()` en el mismo tick.
 * Gana la última llamada: tiene que ser la nuestra.
 */
const { registrar } = vi.hoisted(() => ({ registrar: vi.fn() }));
vi.mock("electron", () => ({ protocol: { registerSchemesAsPrivileged: registrar } }));

import { registerPrivilegedSchemes } from "../schemes";

type Scheme = { scheme: string; privileges: Record<string, boolean> };
const flush = () => new Promise((r) => setTimeout(r, 0));
const ultima = () => Object.fromEntries((registrar.mock.calls.at(-1)![0] as Scheme[]).map((s) => [s.scheme, s.privileges]));

beforeEach(() => registrar.mockClear());

describe("registro de schemes privilegiados (main.ts)", () => {
  it("queda último aunque electron-serve registre en un microtask encolado antes", async () => {
    // Lo que hace electron-serve 3.0.1 al importarse config.ts.
    queueMicrotask(() => registrar([{ scheme: "app", privileges: { standard: true, secure: true } }]));
    // El body de main.ts, en el mismo tick.
    registerPrivilegedSchemes();
    await flush();

    expect(registrar).toHaveBeenCalledTimes(2);
    expect(ultima()["litert-model"]).toMatchObject({ supportFetchAPI: true, corsEnabled: true, secure: true });
  });

  it("y también si electron-serve registra síncrono al importarse (la 3.0.0)", async () => {
    registrar([{ scheme: "app", privileges: { standard: true, secure: true } }]);
    registerPrivilegedSchemes();
    await flush();
    expect(ultima()["litert-model"]).toBeDefined();
  });

  it("'app' sigue siendo secure: sin eso WebGPU no se expone en el binario (P7)", async () => {
    registerPrivilegedSchemes();
    await flush();
    expect(ultima().app).toMatchObject({ secure: true, standard: true, supportFetchAPI: true });
  });
});
