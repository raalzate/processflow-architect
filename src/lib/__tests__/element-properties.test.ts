import { describe, expect, it } from "vitest";
import {
  PROPIEDADES_CANONICAS,
  VALOR_PENDIENTE,
  claveCanonica,
  problemasDePropiedades,
  propiedadesConTipoErrado,
  propiedadesFaltantes,
} from "@/lib/element-properties";
import type { ElementMetadata } from "@/lib/element-metadata";
import { isDeployableType } from "@/lib/notations";

const meta = (clave: string, valor: string, tipo?: ElementMetadata["tipo"]): ElementMetadata => ({
  clave,
  valor,
  ...(tipo ? { tipo } : {}),
});

describe("registro de claves canónicas", () => {
  it("declara al menos repositorio, puerto, endpoint, dueño y wiki", () => {
    const claves = PROPIEDADES_CANONICAS.map((p) => p.clave);
    for (const c of ["repo", "puerto", "endpoint", "owner", "wiki"]) expect(claves).toContain(c);
  });

  it("las obligatorias son repo y puerto, y sólo se le exigen a lo DESPLEGABLE", () => {
    const obligatorias = PROPIEDADES_CANONICAS.filter((p) => p.obligatoria);
    expect(obligatorias.map((p) => p.clave).sort()).toEqual(["puerto", "repo"]);
    for (const p of obligatorias) expect(p.aplicaA).toBe("desplegables");
  });

  it("cada clave declara su tipo, sus alias y para qué sirve", () => {
    for (const p of PROPIEDADES_CANONICAS) {
      expect(p.tipo).toBeTruthy();
      expect(Array.isArray(p.alias)).toBe(true);
      expect(p.porQue.length).toBeGreaterThan(10);
    }
  });

  it("ninguna clave ni alias se repite entre entradas (o el alias sería ambiguo)", () => {
    const todos = PROPIEDADES_CANONICAS.flatMap((p) => [p.clave, ...p.alias]);
    expect(new Set(todos).size).toBe(todos.length);
  });
});

describe("a quién se le exige (capacidad, no lista de tipos)", () => {
  it("se le exige a lo desplegable de C4 y de UML", () => {
    for (const tipo of ["Contenedor", "Componente", "Base de Datos", "Nodo"]) {
      expect(isDeployableType(tipo), tipo).toBe(true);
    }
  });

  it("NO se le exige a un límite lógico ni a un símbolo de proceso", () => {
    // Un mapa estratégico de DDD no tiene un repositorio por contexto, y un
    // evento de BPMN no tiene repositorio de ninguna clase: exigírselo haría
    // fallar diagramas correctos.
    for (const tipo of ["Contexto Delimitado", "Subdominio", "Agregado", "Evento", "Tarea", "Pool"]) {
      expect(isDeployableType(tipo), tipo).toBe(false);
    }
  });

  it("tampoco a un sistema EXTERNO: no es nuestro código", () => {
    expect(isDeployableType("Sistema Externo")).toBe(false);
  });
});

describe("claveCanonica", () => {
  it("reconoce la clave tal cual", () => {
    expect(claveCanonica("repo")).toBe("repo");
  });

  it("reconoce los alias sin distinguir mayúsculas, guiones ni espacios", () => {
    expect(claveCanonica("Repositorio")).toBe("repo");
    expect(claveCanonica("repo_url")).toBe("repo");
    expect(claveCanonica("  PORT ")).toBe("puerto");
    expect(claveCanonica("dueño")).toBe("owner");
  });

  it("una clave que no es canónica ni alias devuelve null (es del usuario, no se toca)", () => {
    expect(claveCanonica("sla horas")).toBeNull();
    expect(claveCanonica("")).toBeNull();
  });
});

describe("propiedadesFaltantes", () => {
  it("un contenedor sin repo ni puerto los debe los dos", () => {
    expect(propiedadesFaltantes([], true).map((p) => p.clave).sort()).toEqual(["puerto", "repo"]);
  });

  it("un contenedor con las dos no debe nada", () => {
    const lista = [meta("repo", "https://github.com/acme/x", "url"), meta("puerto", "8080", "numero")];
    expect(propiedadesFaltantes(lista, true)).toEqual([]);
  });

  it("el alias cuenta como declarada: no se pide reescribir el diagrama a mano", () => {
    const lista = [meta("repositorio", "https://github.com/acme/x", "url"), meta("port", "8080", "numero")];
    expect(propiedadesFaltantes(lista, true)).toEqual([]);
  });

  it("a lo que NO se despliega no se le exige nada (un Evento no tiene repositorio)", () => {
    expect(propiedadesFaltantes([], false)).toEqual([]);
  });

  it("«pendiente» cuenta como declarada: es una decisión consciente, no un olvido", () => {
    const lista = [meta("repo", VALOR_PENDIENTE), meta("puerto", VALOR_PENDIENTE)];
    expect(propiedadesFaltantes(lista, true)).toEqual([]);
  });

  it("una clave obligatoria con valor vacío sigue faltando", () => {
    expect(propiedadesFaltantes([meta("repo", "   "), meta("puerto", "")], true).map((p) => p.clave).sort()).toEqual([
      "puerto",
      "repo",
    ]);
  });
});

describe("propiedadesConTipoErrado", () => {
  it("un puerto que no es número es un problema de TIPO, no de ausencia", () => {
    const problemas = propiedadesConTipoErrado([meta("puerto", "ocho mil", "texto")]);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatchObject({ clave: "puerto", tipoEsperado: "numero" });
  });

  it("el valor «pendiente» no se juzga por tipo", () => {
    expect(propiedadesConTipoErrado([meta("puerto", VALOR_PENDIENTE, "texto")])).toEqual([]);
  });

  it("un repo con una url válida y tipo url no es problema", () => {
    expect(propiedadesConTipoErrado([meta("repo", "https://github.com/acme/x", "url")])).toEqual([]);
  });

  it("una clave del usuario (no canónica) no se juzga", () => {
    expect(propiedadesConTipoErrado([meta("sla horas", "veinticuatro", "texto")])).toEqual([]);
  });

  it("el alias también se juzga con el tipo de su clave canónica", () => {
    expect(propiedadesConTipoErrado([meta("port", "ocho mil", "texto")])).toHaveLength(1);
  });
});

describe("problemasDePropiedades (todo el modelo)", () => {
  const modelo = {
    nodes: [
      { id: "api", nombre: "Enrollment API", tipo_elemento: "Contenedor", metadata: [] },
      { id: "db", nombre: "Policies DB", tipo_elemento: "Contenedor", metadata: [meta("repo", "https://github.com/acme/db", "url")] },
      { id: "ev", nombre: "Póliza creada", tipo_elemento: "Evento", metadata: [] },
      {
        id: "ok",
        nombre: "Gateway",
        tipo_elemento: "Contenedor",
        metadata: [meta("repo", "https://github.com/acme/gw", "url"), meta("puerto", "443", "numero")],
      },
    ],
  };

  it("nombra el elemento, la clave y el tipo esperado de cada hueco", () => {
    const problemas = problemasDePropiedades(modelo as never);
    expect(problemas.map((p) => `${p.elemento}:${p.clave}`).sort()).toEqual([
      "Enrollment API:puerto",
      "Enrollment API:repo",
      "Policies DB:puerto",
    ]);
    expect(problemas.every((p) => !!p.tipoEsperado)).toBe(true);
  });

  it("los elementos que no se despliegan no aportan problemas", () => {
    expect(problemasDePropiedades(modelo as never).some((p) => p.elemento === "Póliza creada")).toBe(false);
  });

  it("un modelo completo no tiene problemas", () => {
    const completo = { nodes: [modelo.nodes[3]] };
    expect(problemasDePropiedades(completo as never)).toEqual([]);
  });

  it("un modelo sin nodos no revienta", () => {
    expect(problemasDePropiedades({ nodes: [] } as never)).toEqual([]);
    expect(problemasDePropiedades({} as never)).toEqual([]);
  });

  it("distingue el hueco (falta) del tipo equivocado en el motivo", () => {
    const conTipo = {
      nodes: [
        {
          id: "api",
          nombre: "API",
          tipo_elemento: "Contenedor",
          metadata: [meta("repo", "https://github.com/acme/x", "url"), meta("puerto", "ocho mil", "texto")],
        },
      ],
    };
    const problemas = problemasDePropiedades(conTipo as never);
    expect(problemas).toHaveLength(1);
    expect(problemas[0].motivo).toBe("tipo");
  });
});
