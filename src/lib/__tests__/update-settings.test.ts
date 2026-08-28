import { describe, expect, it } from "vitest";
import {
  UPDATE_AUTO_KEY,
  UPDATE_LAST_CHECK_KEY,
  describirUltimaComprobacion,
  readUpdatePrefs,
  writeUpdatePrefs,
} from "@/lib/update-settings";

/** localStorage de mentira, con lo justo. */
const storage = (inicial: Record<string, string> = {}) => {
  const datos = { ...inicial };
  return {
    datos,
    getItem: (k: string) => (k in datos ? datos[k] : null),
    setItem: (k: string, v: string) => {
      datos[k] = v;
    },
  };
};

describe("readUpdatePrefs", () => {
  it("por defecto BUSCA automáticamente: enterarse de un arreglo es lo esperable", () => {
    expect(readUpdatePrefs(storage()).auto).toBe(true);
  });

  it("respeta que el usuario lo haya apagado", () => {
    expect(readUpdatePrefs(storage({ [UPDATE_AUTO_KEY]: "0" })).auto).toBe(false);
  });

  it("un valor raro no apaga la búsqueda por accidente", () => {
    expect(readUpdatePrefs(storage({ [UPDATE_AUTO_KEY]: "quizás" })).auto).toBe(true);
  });

  it("devuelve la última comprobación guardada", () => {
    const p = readUpdatePrefs(
      storage({ [UPDATE_LAST_CHECK_KEY]: '{"cuando":"2026-08-27T10:00:00.000Z","resultado":"al-dia"}' })
    );
    expect(p.ultima).toEqual({ cuando: "2026-08-27T10:00:00.000Z", resultado: "al-dia" });
  });

  it("una última comprobación corrupta se ignora en vez de reventar", () => {
    for (const basura of ["{", "null", "[]", '{"cuando":42}']) {
      expect(readUpdatePrefs(storage({ [UPDATE_LAST_CHECK_KEY]: basura })).ultima, basura).toBeUndefined();
    }
  });

  it("sin storage disponible cae a los valores por defecto", () => {
    const roto = {
      getItem: () => {
        throw new Error("no storage");
      },
      setItem: () => {},
    };
    expect(readUpdatePrefs(roto)).toEqual({ auto: true });
  });
});

describe("writeUpdatePrefs", () => {
  it("guarda el interruptor con el mismo formato que lee", () => {
    const s = storage();
    writeUpdatePrefs(s, { auto: false });
    expect(readUpdatePrefs(s).auto).toBe(false);
    writeUpdatePrefs(s, { auto: true });
    expect(readUpdatePrefs(s).auto).toBe(true);
  });

  it("guarda la última comprobación y se puede leer de vuelta", () => {
    const s = storage();
    writeUpdatePrefs(s, { auto: true, ultima: { cuando: "2026-08-27T10:00:00.000Z", resultado: "disponible 0.8.2" } });
    expect(readUpdatePrefs(s).ultima?.resultado).toBe("disponible 0.8.2");
  });

  it("un storage que falla al escribir no rompe la app", () => {
    const roto = {
      getItem: () => null,
      setItem: () => {
        throw new Error("lleno");
      },
    };
    expect(() => writeUpdatePrefs(roto, { auto: false })).not.toThrow();
  });
});

describe("describirUltimaComprobacion", () => {
  it("sin comprobaciones lo dice", () => {
    expect(describirUltimaComprobacion(undefined)).toMatch(/nunca|sin/i);
  });

  it("con una comprobación muestra el resultado", () => {
    const t = describirUltimaComprobacion({ cuando: "2026-08-27T10:00:00.000Z", resultado: "al-dia" });
    expect(t).toContain("al-dia");
  });

  it("una fecha inválida no produce «Invalid Date» en pantalla", () => {
    expect(describirUltimaComprobacion({ cuando: "ayer", resultado: "al-dia" })).not.toMatch(/Invalid/);
  });
});
