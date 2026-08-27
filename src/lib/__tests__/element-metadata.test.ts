import { describe, expect, it } from "vitest";
import {
  MAX_CLAVE_CHARS,
  MAX_METADATA_POR_CAJA,
  MAX_URL_CHARS,
  MAX_VALOR_CHARS,
  METADATA_TIPOS,
  enlaceDe,
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
    // Todo metadato guardado lleva su tipo; el heredado con url queda de tipo url (#186).
    expect(lista[0]).toEqual({
      clave: "repo",
      valor: "acme/pagos-svc",
      url: "https://github.com/acme/pagos-svc",
      tipo: "url",
    });
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
    expect(uno).toEqual({ clave: "repo", valor: "acme/pagos-svc", tipo: "texto" });
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
    expect(lista).toEqual([{ clave: "repo", valor: "b", tipo: "texto" }]);
  });

  it("recorta la lista al tope en vez de aceptar 500 metadatos de un import", () => {
    const entrada = Array.from({ length: MAX_METADATA_POR_CAJA + 5 }, (_, i) => m(`k${i}`, "v"));
    expect(normalizarLista(entrada)).toHaveLength(MAX_METADATA_POR_CAJA);
  });

  it("deja la url sólo si es texto no vacío", () => {
    expect(normalizarLista([{ clave: "repo", valor: "a", url: "  " }])).toEqual([
      { clave: "repo", valor: "a", tipo: "texto" },
    ]);
    expect(normalizarLista([{ clave: "repo", valor: "a", url: 42 }])).toEqual([
      { clave: "repo", valor: "a", tipo: "texto" },
    ]);
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

// -----------------------------------------------------------------------------
// Tipo del valor (tabla propiedad · tipo · valor) — #186
// -----------------------------------------------------------------------------

describe("tipo del metadato", () => {
  it("el catálogo son los cinco tipos, y `texto` es el de partida", () => {
    expect(METADATA_TIPOS.map((t) => t.value)).toEqual(["texto", "numero", "booleano", "url", "fecha"]);
  });

  it("un metadato sin tipo declarado vale como texto", () => {
    expect(validarMetadata({ clave: "owner", valor: "Equipo Pagos" })).toBeNull();
  });

  it("un número que no es número se rechaza nombrando el tipo", () => {
    const problema = validarMetadata({ clave: "sla", valor: "veinticuatro", tipo: "numero" });
    expect(problema).toMatch(/número/i);
    expect(validarMetadata({ clave: "sla", valor: "24", tipo: "numero" })).toBeNull();
    expect(validarMetadata({ clave: "sla", valor: "-1.5", tipo: "numero" })).toBeNull();
  });

  it("un booleano sólo acepta sí/no en sus formas escritas", () => {
    for (const v of ["true", "false", "sí", "no"]) {
      expect(validarMetadata({ clave: "critico", valor: v, tipo: "booleano" })).toBeNull();
    }
    expect(validarMetadata({ clave: "critico", valor: "quizás", tipo: "booleano" })).toMatch(/booleano/i);
  });

  it("una fecha exige ISO corto: es lo único que se ordena y se compara", () => {
    expect(validarMetadata({ clave: "baja", valor: "2026-08-27", tipo: "fecha" })).toBeNull();
    expect(validarMetadata({ clave: "baja", valor: "27/08/2026", tipo: "fecha" })).toMatch(/fecha/i);
  });

  it("una url con tipo url tiene que ser http(s): la frontera no se relaja", () => {
    expect(validarMetadata({ clave: "repo", valor: "https://github.com/acme/x", tipo: "url" })).toBeNull();
    expect(validarMetadata({ clave: "repo", valor: "javascript:alert(1)", tipo: "url" })).toMatch(/http/i);
    expect(validarMetadata({ clave: "repo", valor: "acme/x", tipo: "url" })).toMatch(/http/i);
  });

  it("el tipo sobrevive el upsert y reemplazar la clave cambia el tipo", () => {
    let lista = upsertMetadata(undefined, { clave: "sla", valor: "24", tipo: "numero" });
    expect(lista[0].tipo).toBe("numero");
    lista = upsertMetadata(lista, { clave: "sla", valor: "24h", tipo: "texto" });
    expect(lista).toHaveLength(1);
    expect(lista[0].tipo).toBe("texto");
  });
});

describe("enlaceDe: qué se puede clickear", () => {
  it("un metadato de tipo url enlaza su valor", () => {
    expect(enlaceDe({ clave: "repo", valor: "https://github.com/acme/x", tipo: "url" })).toBe(
      "https://github.com/acme/x"
    );
  });

  it("el campo `url` de lo ya guardado sigue mandando (no se pierde el dato viejo)", () => {
    expect(
      enlaceDe({ clave: "repo", valor: "acme/pagos-svc", url: "https://github.com/acme/pagos-svc" })
    ).toBe("https://github.com/acme/pagos-svc");
  });

  it("nada enlazable devuelve null (texto, número, esquema peligroso)", () => {
    expect(enlaceDe({ clave: "owner", valor: "Equipo Pagos" })).toBeNull();
    expect(enlaceDe({ clave: "sla", valor: "24", tipo: "numero" })).toBeNull();
    expect(enlaceDe({ clave: "x", valor: "javascript:alert(1)", tipo: "url" })).toBeNull();
    expect(enlaceDe({ clave: "x", valor: "y", url: "file:///etc/passwd" })).toBeNull();
  });
});

describe("migración de lo ya guardado", () => {
  it("un metadato viejo con url queda de tipo url sin perder ni valor ni url", () => {
    const lista = normalizarLista([
      { clave: "repo", valor: "acme/pagos-svc", url: "https://github.com/acme/pagos-svc" },
    ])!;
    expect(lista[0]).toEqual({
      clave: "repo",
      valor: "acme/pagos-svc",
      url: "https://github.com/acme/pagos-svc",
      tipo: "url",
    });
  });

  it("un metadato viejo sin url queda de tipo texto", () => {
    expect(normalizarLista([{ clave: "owner", valor: "Equipo Pagos" }])![0].tipo).toBe("texto");
  });

  it("un valor que ES una url sin campo url también queda de tipo url", () => {
    expect(normalizarLista([{ clave: "wiki", valor: "https://wiki/pagos" }])![0].tipo).toBe("url");
  });

  it("un tipo inventado no viaja: cae a texto en vez de tirar el metadato", () => {
    const lista = normalizarLista([{ clave: "x", valor: "1", tipo: "entero" }])!;
    expect(lista[0].tipo).toBe("texto");
  });

  it("el metadato heredado (valor legible + url aparte) sobrevive como url", () => {
    // El fallo que esto frena: inferir `url` y después exigir que el VALOR fuera
    // la url descartaba al abrir justo la referencia al código de la caja.
    const lista = normalizarLista([
      { clave: "repo", valor: "acme/pagos-svc", url: "https://github.com/acme/pagos-svc" },
      { clave: "owner", valor: "Equipo Pagos" },
    ])!;
    expect(lista.map((x) => x.clave)).toEqual(["repo", "owner"]);
    expect(validarMetadata(lista[0])).toBeNull();
  });

  it("un valor que no cumple su tipo se DEGRADA a texto, no se pierde", () => {
    // La alternativa era descartarlo, y eso borraba en silencio lo que el
    // usuario había escrito (o lo que dejó un agente) por una etiqueta mal
    // puesta. La tabla lo muestra en rojo mientras el tipo y el valor no casan.
    const lista = normalizarLista([{ clave: "sla", valor: "veinticuatro", tipo: "numero" }])!;
    expect(lista[0]).toEqual({ clave: "sla", valor: "veinticuatro", tipo: "texto" });
  });

  it("un valor sin tipo válido igual se guarda: el dato importa más que la etiqueta", () => {
    const lista = normalizarLista([{ clave: "baja", valor: "27/08/2026", tipo: "fecha" }])!;
    expect(lista[0].tipo).toBe("texto");
    expect(lista[0].valor).toBe("27/08/2026");
  });
});
