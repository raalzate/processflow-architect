/**
 * @fileOverview Preguntas de competencia PC-01…PC-10 (spec 027 · T23, FR-031) — PURO.
 *
 * Son la prueba de aceptación de la ontología (cap. 15, paso 1): si el grafo
 * no las contesta, el reglamento está mal hecho. Cada una es una consulta
 * predefinida sobre `consultar`/`camino`/`explicar` —nada de lógica propia que
 * la consulta no pueda expresar— y responde con filas y, cuando hay cadena,
 * con el camino que la justifica (SC-001).
 *
 * Mundo abierto: una respuesta vacía dice «el modelo no lo sabe», no «no
 * existe». Los parámetros aceptan nombre o IRI; un nombre repetido se contesta
 * para todas sus coincidencias.
 */

import { claveCanonica, perfilDeTipo } from "../element-properties";
import type { ElementRole } from "../notations";
import type { Conocimiento } from "./conocimiento";
import { RDF_TYPE, iriGeneral, iriPredicado, iriRol, literal } from "./iri";
import { camino, consultar, explicar, resolver, type Camino, type Explicacion, type Fila } from "./query";
import type { Termino } from "./types";

export interface ResultadoCompetencia {
  filas: Fila[];
  /** Un camino por fila cuando la respuesta sale de una cadena. */
  caminos: Camino[];
  explicacion?: Explicacion;
  /** Por qué no hay respuesta (falta un parámetro, el nombre no existe…). */
  nota?: string;
}

export interface ContextoCompetencia {
  /** PC-10: el conocimiento de la versión anterior. */
  antes?: Conocimiento;
}

export interface PreguntaCompetencia {
  id: `PC-${string}`;
  titulo: string;
  parametros: string[];
  ejecutar(k: Conocimiento, args?: Record<string, string>, ctx?: ContextoCompetencia): ResultadoCompetencia;
}

const P = iriPredicado;
const vacio = (nota?: string): ResultadoCompetencia => (nota ? { filas: [], caminos: [], nota } : { filas: [], caminos: [] });

const tiene = (k: Conocimiento, x: Termino, clase: Termino) => k.store.has([x, RDF_TYPE, clase]);
const deRol = (k: Conocimiento, rol: ElementRole): Termino[] =>
  k.store.match(undefined, RDF_TYPE, iriRol(rol)).map((h) => h.s).filter((s) => s.startsWith("kb:"));
const objetos = (k: Conocimiento, s: Termino, p: Termino) => k.store.match(s, p).map((h) => h.o);

/** Los elementos que nombra un parámetro; o la nota que explica por qué ninguno. */
function elementosDe(k: Conocimiento, args: Record<string, string> | undefined, param: string): Termino[] | string {
  const texto = args?.[param]?.trim();
  if (!texto) return `Falta el parámetro «${param}».`;
  const r = resolver(k, texto).filter((c) => c.tipo === "elemento" || (c.tipo === "iri" && c.termino.startsWith("kb:")));
  return r.length ? r.map((c) => c.termino) : `«${texto}» no es un elemento del modelo.`;
}

/** Fronteras (contexto, pool, límite) en que vive un elemento, a cualquier nivel. */
const fronterasDe = (k: Conocimiento, x: Termino, rol?: ElementRole) =>
  objetos(k, x, P("pertenece_a")).filter((c) => tiene(k, c, rol ? iriRol(rol) : iriGeneral("Frontera")));

/** Lo que, partiendo de cada origen, se alcanza por `predicado` y es de `clase`; con su camino. */
function alcanzados(k: Conocimiento, origenes: Termino[], predicado: string, clase: Termino | undefined, cols: [string, string]) {
  const out = vacio();
  for (const o of origenes)
    for (const x of objetos(k, o, P(predicado))) {
      if (clase && !tiene(k, x, clase)) continue;
      out.filas.push({ [cols[0]]: o, [cols[1]]: x });
      out.caminos.push(...camino(k, o, { hasta: x, predicado }));
    }
  return out;
}

/** Relaciones (no tipo ni atributos) en cualquier dirección. */
const vecinos = (k: Conocimiento, x: Termino) =>
  [...k.store.match(x).map((h) => [h.p, h.o]), ...k.store.match(undefined, undefined, x).map((h) => [h.p, h.s])]
    .filter(([p, y]) => p !== RDF_TYPE && y.startsWith("kb:"))
    .map(([, y]) => y);

export const PREGUNTAS_COMPETENCIA: PreguntaCompetencia[] = [
  {
    id: "PC-01",
    titulo: "¿Qué eventos termina provocando el comando X, directa o indirectamente (vía políticas)?",
    parametros: ["comando"],
    ejecutar(k, args) {
      const cs = elementosDe(k, args, "comando");
      return typeof cs === "string" ? vacio(cs) : alcanzados(k, cs, "provoca", iriRol("event"), ["comando", "evento"]);
    },
  },
  {
    id: "PC-02",
    titulo: "¿Qué actor inicia cada flujo y en qué contexto delimitado cae?",
    parametros: [],
    ejecutar(k) {
      const out = vacio();
      for (const a of deRol(k, "actor"))
        for (const h of k.store.match(a)) {
          // Lo dibujado: lo deducido repite la misma flecha generalizada (invoca ⊑ provoca)
          // o salta al final de la cadena, y el actor no «inicia» el último evento.
          if (h.origen === "deducido" || h.p === P("pertenece_a") || !tiene(k, h.o, iriGeneral("NodoDeFlujo"))) continue;
          const ctx = fronterasDe(k, h.o);
          if (!ctx.length) out.filas.push({ actor: a, inicia: h.o });
          for (const c of ctx) out.filas.push({ actor: a, inicia: h.o, contexto: c });
        }
      return out;
    },
  },
  {
    id: "PC-03",
    titulo: "¿Qué elementos de diagramas distintos representan la misma cosa?",
    parametros: [],
    ejecutar(k) {
      const filas = consultar(k, { patrones: [["?a", P("es_mismo_que"), "?b"]] }).filter((f) => f.a < f.b);
      return { filas, caminos: [] };
    },
  },
  {
    id: "PC-04",
    titulo: "¿Qué contenedores o sistemas leen o escriben un almacén de datos dado?",
    parametros: ["almacen?"],
    ejecutar(k, args) {
      const dados = args?.almacen?.trim() ? elementosDe(k, args, "almacen") : undefined;
      if (typeof dados === "string") return vacio(dados);
      const out = vacio();
      for (const accion of ["lee_de", "escribe_en"])
        for (const h of k.store.match(undefined, P(accion)))
          if (!dados || dados.includes(h.o)) out.filas.push({ elemento: h.s, accion: P(accion), almacen: h.o });
      return out;
    },
  },
  {
    id: "PC-05",
    titulo: "¿Qué políticas cruzan de un contexto delimitado a otro?",
    parametros: [],
    ejecutar(k) {
      const out = vacio();
      for (const pol of deRol(k, "policy")) {
        const propios = new Set(fronterasDe(k, pol, "context"));
        if (!propios.size) continue;
        for (const via of [...objetos(k, pol, P("emite")), ...objetos(k, pol, P("reacciona_a"))])
          for (const otro of fronterasDe(k, via, "context"))
            if (!propios.has(otro)) out.filas.push({ politica: pol, via, hacia: otro });
      }
      return out;
    },
  },
  {
    id: "PC-06",
    titulo: "¿Qué elementos desplegables no tienen repositorio o responsable declarado?",
    parametros: [],
    ejecutar(k) {
      const out = vacio();
      for (const e of k.elementos) {
        const perfil = perfilDeTipo(e.tipo);
        if (!perfil.desplegable) continue;
        const declaradas = new Set(
          k.store
            .match(e.iri)
            .filter((h) => h.p.startsWith("pf:atributo/"))
            .map((h) => claveCanonica(h.p.slice("pf:atributo/".length)))
        );
        const faltan = [...(perfil.almacen ? [] : ["repo"]), "owner"].filter((c) => !declaradas.has(c));
        if (faltan.length) out.filas.push({ elemento: e.iri, falta: literal(faltan.join(", ")) });
      }
      return out;
    },
  },
  {
    id: "PC-07",
    titulo: "¿Qué depende, aunque sea indirectamente, de un sistema externo dado (análisis de impacto)?",
    parametros: ["sistema"],
    ejecutar(k, args) {
      const xs = elementosDe(k, args, "sistema");
      if (typeof xs === "string") return vacio(xs);
      const out = vacio();
      for (const x of xs) {
        const afectados = new Set<Termino>();
        for (const h of k.store.match(undefined, P("depende_de"), x)) {
          afectados.add(h.s);
          out.filas.push({ elemento: h.s, sistema: x });
          out.caminos.push(...camino(k, h.s, { hasta: x, predicado: "depende_de" }));
        }
        // Lo que un afectado REALIZA también cae (Q8): si el Sistema Pagos depende
        // de la Pasarela, el Contexto Pagos que implementa queda expuesto.
        for (const s of afectados)
          for (const o of objetos(k, s, P("realiza")))
            if (!afectados.has(o) && o !== x) out.filas.push({ elemento: o, sistema: x, via: s });
      }
      return out;
    },
  },
  {
    id: "PC-08",
    titulo: "¿Qué entidades del modelo de datos no están respaldadas por ningún agregado o almacén?",
    parametros: [],
    ejecutar(k) {
      const respaldo = (y: Termino) => tiene(k, y, iriRol("context")) || tiene(k, y, iriGeneral("Almacen"));
      const filas = deRol(k, "entity")
        .filter((e) => !vecinos(k, e).some(respaldo))
        .map((e) => ({ entidad: e }));
      return { filas, caminos: [] };
    },
  },
  {
    id: "PC-09",
    titulo: "¿Por qué el sistema afirma H? (hechos de partida y reglas usadas)",
    parametros: ["sujeto", "predicado", "objeto"],
    ejecutar(k, args) {
      const partes = ["sujeto", "predicado", "objeto"].map((p) => resolver(k, args?.[p] ?? "").map((c) => c.termino));
      const falta = ["sujeto", "predicado", "objeto"].find((_, i) => !partes[i].length);
      if (falta) return vacio(`No reconozco el ${falta} «${args?.[falta] ?? ""}».`);
      for (const s of partes[0])
        for (const p of partes[1])
          for (const o of partes[2]) {
            const e = explicar(k, [s, p, o]);
            if (e) return { filas: [{ sujeto: s, predicado: p, objeto: o }], caminos: [], explicacion: e };
          }
      return vacio("El modelo no afirma ese hecho (mundo abierto: no se sabe, no es falso).");
    },
  },
  {
    id: "PC-10",
    titulo: "¿Qué cambió en el conocimiento del proyecto entre la versión anterior y la actual?",
    parametros: [],
    ejecutar(k, _args, ctx) {
      if (!ctx?.antes) return vacio("Hace falta la versión anterior para comparar.");
      const clave = (h: { s: string; p: string; o: string }) => `${h.s} ${h.p} ${h.o}`;
      const antes = new Map(ctx.antes.store.match().map((h) => [clave(h), h]));
      const ahora = new Map(k.store.match().map((h) => [clave(h), h]));
      const filas: Fila[] = [];
      for (const [c, h] of ahora)
        if (!antes.has(c)) filas.push({ cambio: literal(h.origen === "deducido" ? "deduccion ganada" : "agregado"), s: h.s, p: h.p, o: h.o });
      for (const [c, h] of antes)
        if (!ahora.has(c)) filas.push({ cambio: literal(h.origen === "deducido" ? "deduccion perdida" : "quitado"), s: h.s, p: h.p, o: h.o });
      return { filas, caminos: [] };
    },
  },
];

export function preguntaCompetencia(id: string): PreguntaCompetencia | undefined {
  return PREGUNTAS_COMPETENCIA.find((p) => p.id === id.trim().toUpperCase());
}
