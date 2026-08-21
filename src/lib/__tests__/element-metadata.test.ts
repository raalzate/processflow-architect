import { describe, expect, it } from "vitest";
import {
  MAX_CLAVE_CHARS,
  MAX_METADATA_POR_CAJA,
  MAX_URL_CHARS,
  MAX_VALOR_CHARS,
  esEnlaceExterno,
  metadataFaltantes,
  moverMetadata,
  normalizarLista,
  quitarMetadata,
  upsertMetadata,
  validarMetadata,
  type ElementMetadata,
} from "@/lib/element-metadata";

const m = (clave: string, valor: string, url?: string): ElementMetadata =>
  url === undefined ? { clave, valor } : { clave, valor, url };

describe("validar un metadato", () => {
  it("acepta clave y valor con url opcional", () => {
    expect(validarMetadata(m("repo", "acme/pagos-svc", "https://github.com/acme/pagos-svc"))).toBeNull();
    expect(validarMetadata(m("owner", "Equipo Pagos"))).toBeNull();
  });

  it("rechaza la clave vacía diciendo que es obligatoria", () => {
    const error = validarMetadata(m("   ", "acme/pagos-svc"));
    expect(error).toMatch(/clave/i);
  });

  it("rechaza el valor vacío", () => {
    expect(validarMetadata(m("repo", "  "))).toMatch(/valor/i);
  });

  it("rechaza pasados los topes, y el mensaje dice el tope", () => {
    expect(validarMetadata(m("k".repeat(MAX_CLAVE_CHARS + 1), "v"))).toContain(String(MAX_CLAVE_CHARS));
    expect(validarMetadata(m("k", "v".repeat(MAX_VALOR_CHARS + 1)))).toContain(String(MAX_VALOR_CHARS));
    expect(validarMetadata(m("k", "v", `https://x/${"u".repeat(MAX_URL_CHARS)}`))).toContain(String(MAX_URL_CHARS));
  });
});

describe("upsert por clave", () => {
  it("agrega al final conservando el orden de escritura", () => {
    let lista = upsertMetadata([], m("repo", "acme/pagos-svc"));
    lista = upsertMetadata(lista, m("wiki", "Dominio Pagos"));
    lista = upsertMetadata(lista, m("owner", "Equipo Pagos"));
    expect(lista.map((x) => x.clave)).toEqual(["repo", "wiki", "owner"]);
  });

  it("una clave que ya existe REEMPLAZA el valor en su posición, sin distinguir mayúsculas ni espacios", () => {
    const lista = upsertMetadata(
      [m("repo", "viejo/repo"), m("owner", "Equipo Pagos")],
      m("  REPO ", "acme/pagos-svc", "https://github.com/acme/pagos-svc")
    );
    expect(lista).toHaveLength(2);
    expect(lista[0]).toEqual({ clave: "repo", valor: "acme/pagos-svc", url: "https://github.com/acme/pagos-svc" });
    // La clave conserva la grafía ORIGINAL: reemplazar un valor no renombra la clave.
    expect(lista[0].clave).toBe("repo");
    expect(lista[1].clave).toBe("owner");
  });

  it("no muta la lista de entrada", () => {
    const original = [m("repo", "acme/pagos-svc")];
    upsertMetadata(original, m("wiki", "Dominio Pagos"));
    expect(original).toHaveLength(1);
  });

  it("revienta con el mensaje de validación en vez de guardar basura", () => {
    expect(() => upsertMetadata([], m("", "x"))).toThrow(/clave/i);
  });

  it("revienta al pasar el tope de metadatos por caja, y no recorta lo que ya había", () => {
    const llena = Array.from({ length: MAX_METADATA_POR_CAJA }, (_, i) => m(`k${i}`, `v${i}`));
    expect(() => upsertMetadata(llena, m("uno-mas", "v"))).toThrow(new RegExp(String(MAX_METADATA_POR_CAJA)));
    // Reemplazar una clave existente SÍ se puede con la caja llena: no crece.
    expect(upsertMetadata(llena, m("k0", "nuevo"))).toHaveLength(MAX_METADATA_POR_CAJA);
  });

  it("guarda clave y valor recortados (trim), no como llegaron", () => {
    const [uno] = upsertMetadata([], m(" repo ", " acme/pagos-svc "));
    expect(uno).toEqual({ clave: "repo", valor: "acme/pagos-svc" });
  });
});

describe("quitar y reordenar", () => {
  it("quita por clave sin distinguir mayúsculas y deja el resto en orden", () => {
    const lista = quitarMetadata([m("repo", "a"), m("wiki", "w"), m("owner", "o")], ["WIKI"]);
    expect(lista.map((x) => x.clave)).toEqual(["repo", "owner"]);
  });

  it("quitar una clave que no está no cambia nada", () => {
    const lista = [m("repo", "a")];
    expect(quitarMetadata(lista, ["nada"])).toEqual(lista);
  });

  it("mover cambia la posición y no pierde elementos", () => {
    const lista = moverMetadata([m("a", "1"), m("b", "2"), m("c", "3")], 2, 0);
    expect(lista.map((x) => x.clave)).toEqual(["c", "a", "b"]);
  });

  it("mover fuera de rango devuelve la lista tal cual", () => {
    const lista = [m("a", "1"), m("b", "2")];
    expect(moverMetadata(lista, 5, 0)).toEqual(lista);
    expect(moverMetadata(lista, 0, -1)).toEqual(lista);
  });
});

describe("normalizar lo que llega de afuera", () => {
  it("un modelo sin la propiedad no gana una lista vacía (queda undefined)", () => {
    expect(normalizarLista(undefined)).toBeUndefined();
    expect(normalizarLista([])).toBeUndefined();
  });

  it("descarta entradas inválidas y deduplica claves conservando la primera posición", () => {
    const lista = normalizarLista([
      m("repo", "a"),
      { clave: "", valor: "x" },
      { clave: "wiki", valor: "" },
      m("REPO", "b"),
      "basura",
      null,
    ]);
    expect(lista).toEqual([{ clave: "repo", valor: "b" }]);
  });

  it("recorta la lista al tope en vez de aceptar 500 metadatos de un import", () => {
    const entrada = Array.from({ length: MAX_METADATA_POR_CAJA + 5 }, (_, i) => m(`k${i}`, "v"));
    expect(normalizarLista(entrada)).toHaveLength(MAX_METADATA_POR_CAJA);
  });

  it("deja la url sólo si es texto no vacío", () => {
    expect(normalizarLista([{ clave: "repo", valor: "a", url: "  " }])).toEqual([{ clave: "repo", valor: "a" }]);
    expect(normalizarLista([{ clave: "repo", valor: "a", url: 42 }])).toEqual([{ clave: "repo", valor: "a" }]);
  });
});

describe("qué url se vuelve enlace", () => {
  it("sólo http y https", () => {
    expect(esEnlaceExterno("https://github.com/acme/x")).toBe(true);
    expect(esEnlaceExterno("http://wiki.interno/pagos")).toBe(true);
    expect(esEnlaceExterno("HTTPS://GitHub.com/acme/x")).toBe(true);
  });

  it("nada más: ni scripts, ni datos, ni archivos locales, ni urls sin scheme", () => {
    // `javascript:` es la razón de ser de este predicado: un metadato lo escribe
    // un agente y termina en un href.
    expect(esEnlaceExterno("javascript:alert(1)")).toBe(false);
    expect(esEnlaceExterno("data:text/html,<script>")).toBe(false);
    expect(esEnlaceExterno("file:///Users/x/repo")).toBe(false);
    expect(esEnlaceExterno("github.com/acme/x")).toBe(false);
    expect(esEnlaceExterno("  https://x  ")).toBe(false);
    expect(esEnlaceExterno(undefined)).toBe(false);
    expect(esEnlaceExterno("")).toBe(false);
  });
});

describe("cajas sin referencias", () => {
  it("lista los nombres de las cajas sin metadatos, para pedir la revisión", () => {
    const faltantes = metadataFaltantes([
      { nombre: "API de Pagos", metadata: [m("repo", "a")] },
      { nombre: "Cobros", metadata: [] },
      { nombre: "Notificador" },
    ]);
    expect(faltantes).toEqual(["Cobros", "Notificador"]);
  });
});
