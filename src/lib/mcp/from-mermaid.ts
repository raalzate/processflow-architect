/**
 * @fileOverview Mermaid → `DiagramModel` (PURO). Feature 015, T1 (#333).
 *
 * El modo CREATIVO del constructor le muestra al modelo lo que ya existe como
 * Mermaid y le pide un Mermaid nuevo: es el formato de diagramas que el motor
 * local conoce de su entrenamiento, y encadenar quince llamadas MCP no lo es
 * (#332). De la vuelta se encarga este parser, y se encarga de forma
 * DETERMINISTA: el modelo propone qué hay y cómo se conecta; el tipo se valida
 * contra el registro y la geometría la pone `layout()`.
 *
 * La regla que gobierna todo el archivo: **el tipo no se deduce de la silueta**.
 * Doce tipos DDD son elipses y en C4 Persona, Sistema y Contenedor son los tres
 * `rounded`, así que la forma no identifica nada (§P6, riesgo declarado en la
 * spec). El tipo viaja explícito —`<i>Tipo</i>` en la etiqueta o `:::slug`— y lo
 * que no calza contra el registro se REPORTA como hallazgo; nunca se adivina.
 */

import {
  getNotation,
  notationTypes,
  isNotationContainer,
  type NotationId,
} from "../notations";
import { normalizarTipo } from "./tipo-notacion";
import { slugify, layout, type BuilderNode, type BuilderEdge, type DiagramModel } from "./diagram-builder";

export interface MermaidParse {
  model: DiagramModel;
  /**
   * Lo que el parser no pudo resolver con certeza (tipo ausente, tipo corregido,
   * caja citada y nunca declarada). Es lo que el modo creativo le devuelve al
   * modelo en su ÚNICO reintento, y lo que el humano ve si el reintento tampoco
   * lo arregla: un silencio acá es un diagrama que dice otra cosa.
   */
  hallazgos: string[];
}

/** Líneas de Mermaid que no declaran ni nodo ni arista (estilo, dirección, comentario). */
const RUIDO = /^(flowchart|graph|direction|classDef|class\s|linkStyle|style\s|click\s|%%)/i;

/** Delimitadores de apertura de una caja Mermaid (ver `mermaidShapeDelims`). */
const APERTURA = "[({>";

const desescapar = (s: string) =>
  s.replace(/#quot;/g, '"').replace(/<br\s*\/?>/gi, "\n").trim();

/** Quita comentarios `%%` que estén FUERA de una etiqueta entrecomillada. */
function sinComentario(linea: string): string {
  let dentro = false;
  for (let i = 0; i < linea.length - 1; i++) {
    if (linea[i] === '"') dentro = !dentro;
    if (!dentro && linea[i] === "%" && linea[i + 1] === "%") return linea.slice(0, i);
  }
  return linea;
}

/** Nombre y tipo declarado de una etiqueta (`Nombre<br><i>Tipo</i>`). */
function partirEtiqueta(etiqueta: string): { nombre: string; tipo?: string } {
  const m = /<i>([\s\S]*?)<\/i>/i.exec(etiqueta);
  if (!m) return { nombre: desescapar(etiqueta) };
  const nombre = desescapar(etiqueta.slice(0, m.index));
  return { nombre, tipo: desescapar(m[1]) };
}

/** Contenido de una caja: `["Nombre"]`, `(Nombre)`, `[("X")]`… → el texto de adentro. */
function textoDeCaja(cuerpo: string): string {
  const sinBordes = cuerpo.replace(/^[[({>/\\]+/, "").replace(/[\]})/\\]+$/, "").trim();
  return sinBordes.replace(/^"([\s\S]*)"$/, "$1");
}

/** Declaración de una caja: `id["Etiqueta"]:::clase`. */
const DECL = new RegExp(
  `^([A-Za-z_][A-Za-z0-9_]*)\\s*([${APERTURA.replace(/[[\]]/g, "\\$&")}][\\s\\S]*?)(?::::([A-Za-z0-9_-]+))?$`
);

/** Una arista, con su trazo y su etiqueta opcional. */
const ARISTA = /^([\s\S]+?)\s*(-\.->|-\.-|==>|-->|---)\s*(?:\|([\s\S]*?)\|)?\s*([\s\S]+)$/;

interface Crudo {
  id: string;
  etiqueta?: string;
  clase?: string;
  container: string;
}

/**
 * El tipo que declara la caja, resuelto contra la notación.
 *
 * Tres caminos y ningún cuarto: calza (con mayúsculas y acentos arreglados),
 * se parece CLARAMENTE a uno del registro —«container» → «Contenedor», el error
 * de idioma que mató una corrida entera en #331— o no se resuelve. En el último
 * caso la caja igual entra (un lienzo vacío es peor que uno por revisar, §P8)
 * pero con el tipo por defecto de la notación y un hallazgo que lo dice.
 */
function resolverTipo(
  crudo: string | undefined,
  notation: NotationId,
  contenedor: boolean,
  nombre: string,
  hallazgos: string[]
): string {
  const validos = notationTypes(notation, { includeContainers: true }).filter(
    (t) => isNotationContainer(t) === contenedor
  );
  const porDefecto = validos[0] ?? notationTypes(notation)[0];

  if (!crudo) {
    hallazgos.push(
      `"${nombre}" llegó sin tipo declarado: entró como "${porDefecto}". Declará el tipo con <i>Tipo</i> en la etiqueta.`
    );
    return porDefecto;
  }
  const r = normalizarTipo(crudo, validos);
  if ("tipo" in r) {
    if (r.tipo !== crudo) {
      hallazgos.push(`"${nombre}": el tipo "${crudo}" se resolvió como "${r.tipo}".`);
    }
    return r.tipo;
  }
  if (r.sugerido) {
    hallazgos.push(`"${nombre}": el tipo "${crudo}" no existe en ${notation}; se usó "${r.sugerido}".`);
    return r.sugerido;
  }
  hallazgos.push(
    `"${nombre}": el tipo "${crudo}" no existe en ${notation} y no se parece a ninguno; entró como "${porDefecto}". Tipos válidos: ${validos.join(", ")}.`
  );
  return porDefecto;
}

/** El tipo que nombra una clase `:::slug` (el slug es el del tipo del registro). */
function tipoDeClase(clase: string | undefined, notation: NotationId): string | undefined {
  if (!clase) return undefined;
  return notationTypes(notation, { includeContainers: true }).find((t) => slugify(t) === clase);
}

/**
 * Convierte un `flowchart` de Mermaid en modelo. Tolera lo que un modelo escribe
 * de más (estilos, direcciones, comentarios) y no inventa nada de lo que falte:
 * lo anota en `hallazgos`.
 */
export function fromMermaid(
  texto: string,
  notation: NotationId,
  opts: { nombre?: string } = {}
): MermaidParse {
  const hallazgos: string[] = [];
  const crudos = new Map<string, Crudo>();
  const orden: string[] = [];
  const edges: BuilderEdge[] = [];
  const contenedores = new Set<string>();
  const pila: string[] = [];

  const registrar = (id: string, etiqueta?: string, clase?: string): string => {
    const existente = crudos.get(id);
    if (existente) {
      if (etiqueta !== undefined) existente.etiqueta = etiqueta;
      if (clase !== undefined) existente.clase = clase;
      return id;
    }
    crudos.set(id, { id, etiqueta, clase, container: pila[pila.length - 1] ?? "" });
    orden.push(id);
    return id;
  };

  /** Un extremo de arista: o es un id suelto, o declara la caja ahí mismo. */
  const extremo = (txt: string): string | null => {
    const limpio = txt.trim();
    const suelto = /^([A-Za-z_][A-Za-z0-9_]*)$/.exec(limpio);
    if (suelto) {
      if (!crudos.has(suelto[1])) {
        registrar(suelto[1]);
        hallazgos.push(`"${suelto[1]}" aparece en una relación y nunca se declaró como caja.`);
      }
      return suelto[1];
    }
    const d = DECL.exec(limpio);
    if (!d || !APERTURA.includes(d[2][0])) return null;
    return registrar(d[1], textoDeCaja(d[2]), d[3]);
  };

  for (const bruta of texto.split("\n")) {
    const linea = sinComentario(bruta).trim();
    if (!linea) continue;

    if (/^subgraph\b/i.test(linea)) {
      const m = /^subgraph\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[([\s\S]*)\])?\s*(?::::([A-Za-z0-9_-]+))?$/.exec(linea);
      const id = m?.[1] ?? `grupo-${pila.length + 1}`;
      const etiqueta = m?.[2] !== undefined ? textoDeCaja(`[${m[2]}]`) : id;
      // El contenedor NO hereda el contenedor abierto: un `BuilderNode` de
      // contenedor vive siempre en la raíz (`container: ""`), igual que en
      // `fromGraphData`. El anidamiento visual lo resuelve el layout.
      crudos.set(id, { id, etiqueta, clase: m?.[3], container: "" });
      if (!orden.includes(id)) orden.push(id);
      contenedores.add(id);
      // Los hijos se cuelgan del NOMBRE del contenedor (así lo guarda
      // `BuilderNode.container`), no de su etiqueta con el tipo adentro.
      pila.push(partirEtiqueta(etiqueta).nombre || id);
      continue;
    }
    if (/^end$/i.test(linea)) {
      pila.pop();
      continue;
    }
    if (RUIDO.test(linea)) continue;

    const a = ARISTA.exec(linea);
    if (a) {
      const fuente = extremo(a[1]);
      const destino = extremo(a[4]);
      if (fuente && destino) {
        const trazo = a[2];
        const etiqueta = a[3] ? desescapar(a[3].replace(/^"([\s\S]*)"$/, "$1")) : undefined;
        edges.push({
          fuente,
          destino,
          ...(etiqueta ? { descripcion: etiqueta } : {}),
          ...(trazo.startsWith("-.") ? { dashed: true } : {}),
          ...(trazo === "---" ? { arrow: "none" as const } : {}),
        });
        continue;
      }
    }

    const d = DECL.exec(linea);
    if (d && APERTURA.includes(d[2][0])) registrar(d[1], textoDeCaja(d[2]), d[3]);
  }

  const nodes: BuilderNode[] = orden.map((id) => {
    const c = crudos.get(id)!;
    const esContenedor = contenedores.has(id);
    const { nombre, tipo } = partirEtiqueta(c.etiqueta ?? id);
    const declarado = tipo ?? tipoDeClase(c.clase, notation) ?? c.clase;
    return {
      id,
      nombre: nombre || id,
      tipo_elemento: resolverTipo(declarado, notation, esContenedor, nombre || id, hallazgos),
      container: esContenedor ? "" : c.container,
    };
  });

  const model: DiagramModel = {
    meta: {
      nombre_proyecto: opts.nombre?.trim() || getNotation(notation).label,
      notation,
    },
    nodes,
    edges,
  };
  // La geometría la pone el código, siempre: lo que el modelo diga de posiciones
  // no se lee (FR-005).
  return { model: layout(model), hallazgos };
}
