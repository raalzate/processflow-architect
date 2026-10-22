/**
 * @fileOverview Qué estrategia de layout conviene a UN diagrama concreto (PURO).
 *
 * La notación sugiere una disposición (`defaultStrategyFor`), pero dos vistas de
 * la misma notación pueden pedir cosas distintas: un C4 de contexto se lee por
 * capas y uno de componentes que es un árbol, de arriba abajo; un Event Storming
 * con tres contextos cuenta una historia que cruza bandas y en el flujo por
 * carril pierde el orden en el tiempo. El asesor mira la FORMA del grafo y los
 * ROLES que declara la notación (nunca sus ids: P6) y elige.
 *
 * Es determinista a propósito: las reglas se evalúan en un orden fijo, sin azar
 * ni reloj, y el mismo diagrama recibe siempre la misma recomendación — con el
 * motivo escrito, para que el humano sepa por qué y pueda no hacerle caso.
 */

import {
  hasRole,
  isLifelineContainer,
  isNotationContainer,
  type ElementRole,
} from "../notations";
import type { EdgeRelationKind } from "../edge-relations";
import type { DiagramModel } from "./diagram-builder";
import { defaultStrategyFor, type LayoutStrategy } from "./layout-presets";

/** Lo que el asesor mide del diagrama. Se expone para probarlo y explicarlo. */
export interface SenalesDeLayout {
  /** Elementos que no son contenedor. */
  elementos: number;
  /** Contenedores con al menos un elemento dentro. */
  grupos: number;
  /** Relaciones entre elementos (sin bucles sobre sí mismo). */
  relaciones: number;
  /** Fracción de relaciones que cruzan de un grupo a otro (0 sin grupos). */
  entreGrupos: number;
  /** Niveles del camino más largo, sin contar las relaciones que cierran ciclo. */
  profundidad: number;
  /** true si ninguna relación cierra un ciclo. */
  aciclico: boolean;
  /** Bosque: acíclico y nadie tiene más de un padre. */
  arbol: boolean;
  /** Fracción de relaciones de herencia, realización, composición o agregación. */
  jerarquicas: number;
  /** Grado del elemento más conectado sobre (elementos − 1). */
  concentracion: number;
  /** Nombre del elemento más conectado (para el motivo). */
  centro?: string;
  /** Hay inicio y fin declarados (un proceso con principio y final). */
  conInicioYFin: boolean;
  /** Elementos con rol de evento (hechos consumados). */
  hechos: number;
  /** Roles de arquitectura presentes: actor, sistema, externo, almacén. */
  rolesDeCapa: number;
  /** Dos o más líneas de vida: es una secuencia y la ordena el tiempo. */
  secuencia: boolean;
}

export interface RecomendacionDeLayout {
  strategy: LayoutStrategy;
  /** Una frase, en el idioma del usuario, que explica la elección. */
  motivo: string;
  senales: SenalesDeLayout;
  /**
   * Otras que también encajan, de la más a la menos plausible. La elección
   * final puede medirlas y quedarse con la que menos cruces deje
   * (`elegirEstrategia` en diagram-builder): una regla dice qué SUELE leerse
   * mejor, la medida dice qué se lee mejor en ESTE diagrama.
   */
  alternativas: LayoutStrategy[];
}

const RELACIONES_JERARQUICAS = new Set<EdgeRelationKind>([
  "herencia",
  "realizacion",
  "composicion",
  "agregacion",
]);
/** Apuntan al padre: para medir el árbol se leen al revés (ver diagram-builder). */
const HACIA_EL_PADRE = new Set<EdgeRelationKind>(["herencia", "realizacion"]);
const ROLES_DE_CAPA: ElementRole[] = ["actor", "system", "external", "datastore"];

// --- Umbrales: con nombre para que el test y el motivo hablen de lo mismo ---
/** A partir de cuántos niveles una cadena es una historia y no un par suelto. */
export const PROFUNDIDAD_DE_HISTORIA = 3;
/** Fracción de relaciones entre grupos que vuelve necesario un eje común. */
export const CRUCE_PARA_EJE_COMUN = 0.25;
/** Fracción de relaciones entre grupos por debajo de la cual son independientes. */
export const CRUCE_DE_INDEPENDIENTES = 0.2;
/** Qué parte de los demás tiene que tocar un elemento para ser el centro. */
export const CONCENTRACION_DE_CENTRO = 0.5;
/** Grupos a partir de los cuales apilarlos deja de entrar en pantalla. */
export const GRUPOS_PARA_MOSAICO = 3;

/** Mide el diagrama. Sólo lee: no toca geometría ni contenido. */
export function analizarDiagrama(model: DiagramModel): SenalesDeLayout {
  const { notation } = model.meta;
  const contenedores = model.nodes.filter((n) => isNotationContainer(n.tipo_elemento));
  const elementos = model.nodes.filter((n) => !isNotationContainer(n.tipo_elemento));
  const ids = new Set(elementos.map((n) => n.id));
  const grupoDe = new Map<string, string | undefined>();
  const nombres = new Set(contenedores.map((c) => c.nombre));
  for (const n of elementos) grupoDe.set(n.id, n.container && nombres.has(n.container) ? n.container : undefined);

  const aristas = model.edges
    .filter((e) => e.fuente !== e.destino && ids.has(e.fuente) && ids.has(e.destino))
    .map((e) =>
      e.relation && HACIA_EL_PADRE.has(e.relation) ? { ...e, fuente: e.destino, destino: e.fuente } : e
    );

  const conHijos = new Set([...grupoDe.values()].filter((g): g is string => !!g));
  const cruzan = aristas.filter((e) => {
    const a = grupoDe.get(e.fuente);
    const b = grupoDe.get(e.destino);
    return (a || b) && a !== b;
  }).length;

  // Grado sin dirección: quién concentra las relaciones.
  const grado = new Map<string, number>(elementos.map((n) => [n.id, 0]));
  for (const e of aristas) {
    grado.set(e.fuente, grado.get(e.fuente)! + 1);
    grado.set(e.destino, grado.get(e.destino)! + 1);
  }
  const centro = elementos.reduce<(typeof elementos)[number] | undefined>(
    (m, n) => (!m || grado.get(n.id)! > grado.get(m.id)! ? n : m),
    undefined
  );

  const { profundidad, aciclico } = medirProfundidad(
    elementos.map((n) => n.id),
    aristas
  );
  const padres = new Map<string, number>();
  for (const e of aristas) padres.set(e.destino, (padres.get(e.destino) ?? 0) + 1);

  return {
    elementos: elementos.length,
    grupos: conHijos.size,
    relaciones: aristas.length,
    entreGrupos: aristas.length ? cruzan / aristas.length : 0,
    profundidad,
    aciclico,
    arbol: aciclico && aristas.length > 0 && [...padres.values()].every((p) => p <= 1),
    jerarquicas: aristas.length
      ? aristas.filter((e) => e.relation && RELACIONES_JERARQUICAS.has(e.relation)).length / aristas.length
      : 0,
    concentracion:
      centro && elementos.length > 1 ? grado.get(centro.id)! / (elementos.length - 1) : 0,
    centro: centro && grado.get(centro.id)! > 0 ? centro.nombre : undefined,
    conInicioYFin:
      elementos.some((n) => hasRole(notation, n.tipo_elemento, "start")) &&
      elementos.some((n) => hasRole(notation, n.tipo_elemento, "end")),
    hechos: elementos.filter((n) => hasRole(notation, n.tipo_elemento, "event")).length,
    rolesDeCapa: ROLES_DE_CAPA.filter((r) => elementos.some((n) => hasRole(notation, n.tipo_elemento, r)))
      .length,
    secuencia: model.nodes.filter((n) => isLifelineContainer(n.tipo_elemento)).length >= 2,
  };
}

/**
 * Niveles del camino más largo (DFS con coloreo; las aristas que cierran ciclo
 * se descartan, igual que en el ranking del layout) y si había ciclos.
 */
function medirProfundidad(
  ids: string[],
  aristas: Array<{ fuente: string; destino: string }>
): { profundidad: number; aciclico: boolean } {
  const succ = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of aristas) succ.get(e.fuente)!.push(e.destino);
  const color = new Map<string, 0 | 1 | 2>(ids.map((id) => [id, 0]));
  const nivel = new Map<string, number>();
  let aciclico = true;
  // Iterativo: un diagrama largo no debe agotar la pila.
  for (const inicio of ids) {
    if (color.get(inicio) !== 0) continue;
    const pila: Array<{ u: string; i: number }> = [{ u: inicio, i: 0 }];
    color.set(inicio, 1);
    while (pila.length) {
      const top = pila[pila.length - 1];
      const hijos = succ.get(top.u)!;
      if (top.i < hijos.length) {
        const v = hijos[top.i++];
        const c = color.get(v);
        if (c === 1) aciclico = false;
        else if (c === 0) {
          color.set(v, 1);
          pila.push({ u: v, i: 0 });
        }
      } else {
        // Al cerrar un nodo, su nivel es 1 + el mayor de sus hijos ya cerrados.
        const debajo = hijos.map((v) => (color.get(v) === 2 ? nivel.get(v) ?? 0 : 0));
        nivel.set(top.u, 1 + Math.max(0, ...debajo));
        color.set(top.u, 2);
        pila.pop();
      }
    }
  }
  return { profundidad: Math.max(0, ...nivel.values()), aciclico };
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

/**
 * Recomienda la estrategia. Las reglas van de la más específica a la más
 * general y la PRIMERA que se cumple decide; si ninguna, manda la notación.
 */
export function recomendarEstrategia(model: DiagramModel): RecomendacionDeLayout {
  const s = analizarDiagrama(model);
  const natural = defaultStrategyFor(model.meta.notation);
  const es = (
    strategy: LayoutStrategy,
    motivo: string,
    otras: LayoutStrategy[] = []
  ): RecomendacionDeLayout => ({
    strategy,
    motivo,
    senales: s,
    // La natural de la notación siempre compite: es la que el usuario ya conoce.
    alternativas: [...new Set([...otras, natural])].filter((o) => o !== strategy),
  });

  if (s.secuencia) return es(natural, "Es una secuencia: la ordena el tiempo de sus mensajes.");
  if (!s.elementos) return es(natural, "Diagrama vacío: la disposición natural de la notación.");

  if (!s.relaciones) {
    return s.grupos >= 2
      ? es("grupos", `Sin relaciones que seguir: los ${s.grupos} grupos se reparten en mosaico.`, ["capas"])
      : es("capas", "Sin relaciones que seguir: filas por rol, en rejilla.");
  }

  // Un proceso con principio y fin.
  if (s.conInicioYFin) {
    return s.grupos >= 2 && s.entreGrupos >= CRUCE_PARA_EJE_COMUN
      ? es(
          "linea_tiempo",
          `El proceso pasa entre participantes (${pct(s.entreGrupos)} de las relaciones): eje de tiempo común.`,
          ["flujo"]
        )
      : es("flujo", "Proceso con inicio y fin: avanza de izquierda a derecha por participante.", [
          "linea_tiempo",
        ]);
  }

  // Una cadena de hechos es una historia (Event Storming).
  if (s.hechos >= PROFUNDIDAD_DE_HISTORIA && s.profundidad >= PROFUNDIDAD_DE_HISTORIA) {
    return s.grupos >= 2 && s.entreGrupos >= CRUCE_PARA_EJE_COMUN
      ? es(
          "linea_tiempo",
          `${s.hechos} eventos encadenados que cruzan grupos: se cuentan sobre un eje de tiempo común.`,
          ["flujo"]
        )
      : es("flujo", `${s.hechos} eventos encadenados: la historia avanza de izquierda a derecha.`, [
          "linea_tiempo",
        ]);
  }

  // Herencia, composición o un árbol puro: de arriba abajo.
  if (s.jerarquicas >= 0.5 || (s.arbol && s.profundidad >= 3 && s.elementos >= 4)) {
    return es(
      "jerarquia",
      s.jerarquicas >= 0.5
        ? `${pct(s.jerarquicas)} de las relaciones son de herencia o composición: árbol de arriba abajo.`
        : "Cada elemento cuelga de uno solo: árbol de arriba abajo.",
      ["flujo", "capas"]
    );
  }

  // Un concepto que toca a la mitad del resto es el centro del mapa.
  if (s.elementos >= 5 && s.concentracion >= CONCENTRACION_DE_CENTRO && s.centro) {
    return es(
      "radial",
      `«${s.centro}» se relaciona con ${pct(s.concentracion)} del resto: va al centro.`,
      ["capas", "grupos"]
    );
  }

  // Quién usa, qué hay y de qué depende: arquitectura.
  if (s.rolesDeCapa >= 2) {
    return es("capas", "Hay actores y sistemas: quién usa arriba, de qué depende abajo.", [
      "grupos",
      "jerarquia",
    ]);
  }

  // Muchos grupos que casi no se hablan: un mapa, no una torre.
  if (s.grupos >= GRUPOS_PARA_MOSAICO && s.entreGrupos <= CRUCE_DE_INDEPENDIENTES) {
    return es("grupos", `${s.grupos} grupos casi independientes: se leen mejor en mosaico.`, ["capas"]);
  }

  if (s.aciclico && s.profundidad >= PROFUNDIDAD_DE_HISTORIA) {
    return es("flujo", "Cadena de dependencias sin ciclos: avance de izquierda a derecha.", [
      "jerarquia",
    ]);
  }

  return es(natural, "La disposición natural de la notación.");
}
