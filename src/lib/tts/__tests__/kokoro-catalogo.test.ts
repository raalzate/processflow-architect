import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ARCHIVOS_KOKORO,
  VOCES_ES,
  VOZ_POR_DEFECTO,
  estiloDeVoz,
  cargarAjustesVoz,
  guardarAjustesVoz,
  rutaLocalSegura,
  ESTILO_DIM,
} from "../kokoro-catalogo";

describe("catálogo de Kokoro", () => {
  it("la voz por defecto es Dora, la voz de mujer", () => {
    expect(VOZ_POR_DEFECTO).toBe("ef_dora");
    expect(VOCES_ES.find((v) => v.id === VOZ_POR_DEFECTO)?.genero).toBe("mujer");
  });

  it("baja el modelo q8, el tokenizador y todas las voces en español", () => {
    const rutas = ARCHIVOS_KOKORO.map((a) => a.ruta);
    expect(rutas).toContain("onnx/model_quantized.onnx");
    expect(rutas).toContain("tokenizer.json");
    for (const v of VOCES_ES) expect(rutas).toContain(`voices/${v.id}.bin`);
  });
});

describe("estiloDeVoz · el vector de estilo depende del largo de la frase", () => {
  const voz = new Float32Array(ESTILO_DIM * 511).map((_, i) => i);

  it("toma la fila del número de tokens sin los dos de borde", () => {
    const e = estiloDeVoz(voz, 12);
    expect(e.length).toBe(ESTILO_DIM);
    expect(e[0]).toBe(10 * ESTILO_DIM);
  });

  it("acota a la primera y a la última fila", () => {
    expect(estiloDeVoz(voz, 0)[0]).toBe(0);
    expect(estiloDeVoz(voz, 9999)[0]).toBe(509 * ESTILO_DIM);
  });
});

describe("rutaLocalSegura · el scheme sólo sirve archivos del catálogo", () => {
  it("acepta las rutas del catálogo", () => {
    expect(rutaLocalSegura("Kokoro-82M-v1.0-ONNX/onnx/model_quantized.onnx")).toBe("onnx/model_quantized.onnx");
    expect(rutaLocalSegura("voices/ef_dora.bin")).toBe("voices/ef_dora.bin");
  });

  it("rechaza lo que no está en el catálogo, incluido un path traversal", () => {
    expect(rutaLocalSegura("../../ai-keys.json")).toBeNull();
    expect(rutaLocalSegura("onnx/../../../etc/passwd")).toBeNull();
    expect(rutaLocalSegura("onnx/model.onnx")).toBeNull();
  });
});

describe("ajustes de voz", () => {
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    });
  });

  it("sin nada guardado: Dora a velocidad normal", () => {
    expect(cargarAjustesVoz()).toEqual({ voz: "ef_dora", velocidad: 1 });
  });

  it("guarda y relee la voz elegida", () => {
    guardarAjustesVoz({ voz: "em_alex", velocidad: 1.2 });
    expect(cargarAjustesVoz()).toEqual({ voz: "em_alex", velocidad: 1.2 });
  });

  it("una voz desconocida o una velocidad fuera de rango vuelven al defecto", () => {
    mem.set("tts_voz", JSON.stringify({ voz: "toString", velocidad: 9 }));
    expect(cargarAjustesVoz()).toEqual({ voz: "ef_dora", velocidad: 1 });
  });

  it("un JSON roto no rompe", () => {
    mem.set("tts_voz", "{");
    expect(cargarAjustesVoz().voz).toBe("ef_dora");
  });

  it("sin localStorage (SSR) devuelve el defecto y guardar no explota", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(cargarAjustesVoz().voz).toBe("ef_dora");
    expect(() => guardarAjustesVoz({ voz: "em_alex", velocidad: 1 })).not.toThrow();
  });
});
