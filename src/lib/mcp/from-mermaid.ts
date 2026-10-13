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
  isLifelineContainer,
  isFragmentContainer,
  NOTATION_IDS,
  type NotationId,
} from "../notations";
import type { FragmentOp } from "../sequence/fragments";
import type { SequenceMessageKind } from "../sequence/messages";
import { normalizarTipo } from "./tipo-notacion";
import { ledgerVacio, type ImportLedger } from "./import-ledger";
import { cabeceraDe } from "./mermaid-source";
import {
  slugify,
  layout,
  emptyDiagram,
  addContainer,
  addMessage,
  addFragment,
  type BuilderNode,
  type BuilderEdge,
  type DiagramModel,
} from "./diagram-builder";

export interface MermaidParse {
  model: DiagramModel;
  /**
   * Lo que el parser no pudo resolver con certeza (tipo ausente, tipo corregido,
   * caja citada y nunca declarada). Es lo que el modo creativo le devuelve al
   * modelo en su ÚNICO reintento, y lo que el humano ve si el reintento tampoco
   * lo arregla: un silencio acá es un diagrama que dice otra cosa.
   */
  hallazgos: string[];
  /**
   * Qué llegó al dibujo y qué no (#540). Los hallazgos hablan de lo que entró
   * dudoso; el ledger, de lo que NO entró: una nota, una activación, una línea
   * que el parser no entendió. Son dos listas porque las lee gente distinta: el
   * modelo corrige hallazgos; el humano que trajo el archivo mira el ledger.
   */
  ledger: ImportLedger;
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
 * Convierte Mermaid en modelo: un `flowchart`/`graph` o un `sequenceDiagram`,
 * según la cabecera. Tolera lo que un modelo escribe de más (estilos,
 * direcciones, comentarios) y no inventa nada de lo que falte: lo anota en
 * `hallazgos`; lo que no llega al dibujo, en `ledger`.
 */
export function fromMermaid(
  texto: string,
  notation: NotationId,
  opts: { nombre?: string } = {}
): MermaidParse {
  if (/^sequenceDiagram$/i.test(cabeceraDe(texto))) return fromMermaidSequence(texto, notation, opts);
  return fromMermaidFlowchart(texto, notation, opts);
}

/** Líneas de un flowchart que son CONTENIDO que el lienzo no dibuja (van al ledger). */
const CONTENIDO_SIN_DIBUJO = /^(click\s|style\s|classDef|class\s|linkStyle)/i;

function fromMermaidFlowchart(
  texto: string,
  notation: NotationId,
  opts: { nombre?: string } = {}
): MermaidParse {
  const hallazgos: string[] = [];
  const ledger = ledgerVacio();
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
    if (RUIDO.test(linea)) {
      // El estilo de la fuente se descarta a propósito (el dibujo lo pone la
      // notación); un `click` es un enlace que no se sigue ni se reproduce.
      if (/^click\s/i.test(linea)) ledger.omitidos.push(`enlace \`${linea.slice(0, 40)}\`: los click de la fuente no se siguen ni se dibujan.`);
      else if (CONTENIDO_SIN_DIBUJO.test(linea)) ledger.omitidos.push(`estilo \`${linea.split(/\s+/)[0]}\`: el color lo pone la notación, no la fuente.`);
      continue;
    }

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
    if (d && APERTURA.includes(d[2][0])) {
      registrar(d[1], textoDeCaja(d[2]), d[3]);
      continue;
    }
    // Una línea que no es caja, arista, grupo ni estilo: se dice, no se calla.
    ledger.omitidos.push(`línea no reconocida \`${linea.slice(0, 60)}\`.`);
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
  ledger.fuente = { elementos: nodes.length, relaciones: edges.length };
  ledger.dibujados = { elementos: nodes.length, relaciones: edges.length };
  // La geometría la pone el código, siempre: lo que el modelo diga de posiciones
  // no se lee (FR-005).
  return { model: layout(model), hallazgos, ledger };
}

// =============================================================================
// sequenceDiagram (#540)
// =============================================================================

/** Trazo de un mensaje Mermaid → clase de mensaje del lienzo. */
function claseDeMensaje(trazo: string): { kind: SequenceMessageKind; nota?: string } {
  if (trazo.startsWith("<<")) return { kind: "sync", nota: "mensaje bidireccional: se dibujó como llamada en un sentido" };
  if (/^--?x$/.test(trazo)) return { kind: "async", nota: "mensaje perdido (-x): se dibujó como llamada asíncrona" };
  if (/^--?\)$/.test(trazo)) return { kind: "async" };
  if (trazo.startsWith("--")) return { kind: "return" };
  return { kind: "sync" };
}

/** Operadores Mermaid que el lienzo no tiene y a cuál caen. */
const OPERADOR_EQUIVALENTE: Record<string, FragmentOp> = { critical: "alt", break: "opt" };

const MENSAJE = /^(.+?)\s*(<<-->>|<<->>|-->>|->>|--\)|-\)|--x|-x|-->|->)\s*([+-]?)\s*(.+?)\s*:\s*(.*)$/;
/** `participant A as Alias`, `actor A`, y la forma `create participant A as Alias` (Mermaid ≥ 10.3). */
const PARTICIPANTE = /^(?:create\s+)?(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/i;
/** Directivas sin dibujo. `(\s|$)` y no `\b`: `title->>B: x` es un mensaje de un participante llamado title. */
const DIRECTIVA = /^(autonumber|title|accTitle|accDescr|config|links?|properties|details)(\s|$)/i;
const FRAGMENTO = /^(alt|opt|loop|par|critical|break)\b\s*(.*)$/i;
const OPERANDO = /^(else|and|option)\b\s*(.*)$/i;

/**
 * `sequenceDiagram` → líneas de vida (contenedores), mensajes ordenados y
 * fragmentos. Lo que el lienzo no dibuja —notas, activaciones, cajas de
 * participantes— va al ledger, no se calla; lo que cambia de forma
 * (bidireccional, perdido, `critical`) va a hallazgos.
 */
function fromMermaidSequence(
  texto: string,
  notation: NotationId,
  opts: { nombre?: string } = {}
): MermaidParse {
  const hallazgos: string[] = [];
  const ledger = ledgerVacio();

  // La línea de vida es un contenedor con `containerStyle: "lifeline"`; una
  // notación sin ella (BPMN, DDD) no puede dibujar una secuencia, así que cae a
  // la que sí la tiene y lo dice (P6: se pregunta al registro, no se cablea).
  const conLifeline = (id: NotationId) =>
    notationTypes(id, { includeContainers: true }).find((t) => isLifelineContainer(t));
  let notacion = notation;
  if (!conLifeline(notacion)) {
    const alternativa = NOTATION_IDS.find((id) => conLifeline(id));
    if (!alternativa) throw new Error("Ninguna notación declara una línea de vida: no se puede importar una secuencia.");
    hallazgos.push(`La notación ${notation} no tiene línea de vida: la secuencia entró como ${alternativa}.`);
    notacion = alternativa;
  }
  const tipoLifeline = conLifeline(notacion)!;
  const tipoFragmento = notationTypes(notacion, { includeContainers: true }).find((t) => isFragmentContainer(t));

  let model = emptyDiagram({
    nombre_proyecto: opts.nombre?.trim() || getNotation(notacion).label,
    notation: notacion,
  });

  const participantes = new Map<string, string>(); // id Mermaid → id del contenedor
  const participante = (idMermaid: string, etiqueta?: string): string => {
    const limpio = idMermaid.trim().replace(/^"([\s\S]*)"$/, "$1");
    const existente = participantes.get(limpio);
    if (existente) return existente;
    const nombre = (etiqueta ?? limpio).trim().replace(/^"([\s\S]*)"$/, "$1");
    const r = addContainer(model, { nombre, tipo_elemento: tipoLifeline });
    model = r.model;
    participantes.set(limpio, r.id);
    return r.id;
  };

  // Todo lo que abre un `end` va a la MISMA pila: un `box` o un `rect` sin
  // apilar harían que su `end` cerrara el fragmento de afuera antes de tiempo.
  interface Abierto {
    clase: "fragmento" | "box" | "rect";
    op?: FragmentOp;
    guardas: string[];
    desde: number;
    nombre: string;
  }
  const abiertos: Abierto[] = [];
  const fragmentos: Array<Abierto & { hasta: number }> = [];
  let mensajes = 0;
  let activaciones = 0;

  for (const bruta of texto.split("\n")) {
    const linea = sinComentario(bruta).trim();
    if (!linea || /^sequenceDiagram\b/i.test(linea) || linea === "---") continue;

    const p = PARTICIPANTE.exec(linea);
    if (p) {
      participante(p[2], p[3]);
      continue;
    }
    if (/^(activate|deactivate)\b/i.test(linea)) {
      activaciones++;
      continue;
    }
    if (/^destroy\b/i.test(linea)) {
      ledger.omitidos.push(`destrucción «${linea.replace(/^destroy\s*/i, "").slice(0, 40)}»: el lienzo no marca dónde muere un participante.`);
      continue;
    }
    if (DIRECTIVA.test(linea)) continue;
    if (/^note\b/i.test(linea)) {
      ledger.omitidos.push(`nota «${linea.replace(/^note\s+(left of|right of|over)\s+[^:]+:\s*/i, "").slice(0, 50)}»: las notas no tienen caja en el lienzo; va a la descripción si la necesitás.`);
      continue;
    }
    if (/^box\b/i.test(linea)) {
      const nombre = linea.replace(/^box\s*/i, "").slice(0, 40);
      abiertos.push({ clase: "box", guardas: [], desde: mensajes + 1, nombre });
      ledger.omitidos.push(`agrupación «${nombre}»: el lienzo no agrupa líneas de vida.`);
      continue;
    }
    if (/^rect\b/i.test(linea)) {
      abiertos.push({ clase: "rect", guardas: [], desde: mensajes + 1, nombre: "rect" });
      ledger.omitidos.push(`sombreado \`${linea.slice(0, 30)}\`: el color lo pone la notación, no la fuente.`);
      continue;
    }
    const f = FRAGMENTO.exec(linea);
    if (f) {
      const pedido = f[1].toLowerCase();
      const op = (OPERADOR_EQUIVALENTE[pedido] ?? pedido) as FragmentOp;
      if (op !== pedido) hallazgos.push(`El fragmento «${pedido}» no existe en el lienzo: se dibujó como «${op}».`);
      abiertos.push({ clase: "fragmento", op, guardas: [f[2].trim()].filter(Boolean), desde: mensajes + 1, nombre: pedido });
      continue;
    }
    const o = OPERANDO.exec(linea);
    if (o) {
      const arriba = abiertos[abiertos.length - 1];
      if (arriba?.clase === "fragmento" && o[2].trim()) arriba.guardas.push(o[2].trim());
      continue;
    }
    if (/^end$/i.test(linea)) {
      const cerrado = abiertos.pop();
      if (cerrado?.clase === "fragmento") fragmentos.push({ ...cerrado, hasta: mensajes });
      continue;
    }
    const m = MENSAJE.exec(linea);
    if (m) {
      const [, de, trazo, , a, etiqueta] = m;
      const { kind, nota } = claseDeMensaje(trazo);
      if (nota) hallazgos.push(`«${etiqueta.trim() || `${de}→${a}`}»: ${nota}.`);
      // Los participantes implícitos se registran ANTES de leer `model`: si
      // se resolvieran dentro del literal, `addMessage` recibiría el modelo
      // de antes de crearlos y diría que el destino no existe.
      const fuente = participante(de);
      const destino = participante(a);
      model = addMessage(model, {
        fuente,
        destino,
        messageKind: kind,
        ...(etiqueta.trim() ? { descripcion: desescapar(etiqueta) } : {}),
      });
      mensajes++;
      continue;
    }
    ledger.omitidos.push(`línea no reconocida \`${linea.slice(0, 60)}\`.`);
  }

  if (activaciones) ledger.omitidos.push(`${activaciones} activación(es): el lienzo no dibuja activate/deactivate; añadí Activaciones a mano si hacen falta.`);
  for (const abierto of abiertos)
    if (abierto.clase === "fragmento") hallazgos.push(`El fragmento «${abierto.nombre}» quedó sin \`end\`: no se dibujó.`);

  // Los fragmentos se agregan al final: su rango se valida contra el total de
  // mensajes, que recién ahora se conoce.
  for (const fr of fragmentos) {
    if (fr.hasta < fr.desde) {
      ledger.omitidos.push(`fragmento «${fr.nombre}» vacío (sin mensajes adentro).`);
      continue;
    }
    if (!tipoFragmento) {
      ledger.omitidos.push(`fragmento «${fr.nombre}»: la notación no tiene contenedor de fragmento.`);
      continue;
    }
    const guarda = fr.guardas.join(" / ");
    model = addFragment(model, {
      nombre: guarda ? `${fr.op}: ${guarda}` : fr.op!,
      tipo_elemento: tipoFragmento,
      op: fr.op!,
      desde: fr.desde,
      hasta: fr.hasta,
      ...(guarda ? { guarda } : {}),
    }).model;
  }

  ledger.fuente = { elementos: participantes.size, relaciones: mensajes };
  ledger.dibujados = { elementos: participantes.size, relaciones: model.edges.length };
  return { model: layout(model), hallazgos, ledger };
}
