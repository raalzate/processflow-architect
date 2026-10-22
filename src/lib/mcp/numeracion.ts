/**
 * @fileOverview Numeración de los pasos de un diagrama de FLUJO (#618). PURO.
 *
 * Un BPMN o una secuencia sin números obliga a seguir las flechas para saber qué
 * va primero, y en la conversación no hay forma corta de decir «el paso 2». El
 * número va DENTRO del nombre (`"1. Validar cliente"`): es lo que se ve en el
 * lienzo y lo que se cita, sin un campo aparte que la app tenga que aprender.
 *
 * Reglas:
 *
 *  - **Derivado del grafo**, nunca guardado aparte: se recalcula entero cada vez,
 *    así agregar, mover o borrar un paso no deja huecos ni duplicados.
 *  - **Se reemplaza el prefijo, no se apila**: `conNumero` quita el que había.
 *  - **Qué es un paso lo dice el registro** (P6): se numeran los tipos con rol
 *    `task`; inicio, fin, compuertas y eventos no. Un diagrama es de flujo si su
 *    notación le da a alguna caja el rol `start` o `gateway`. DDD, C4 y MER no
 *    declaran esos roles y quedan como están.
 *  - **Ramas con sub-número**: una bifurcación consume un número `n`; la rama
 *    `i` es `n.i` (y si tiene varios pasos, `n.i.1`, `n.i.2`…). Donde las ramas
 *    se reúnen sigue `n+1`.
 *  - **Ciclos**: las aristas de vuelta se ignoran y cada caja se numera una vez.
 *  - **Secuencia UML**: los mensajes llevan el número de su `orden` en la
 *    etiqueta; el orden ya lo mantiene `sequence/order.ts`.
 */

import { hasRole } from "../notations";
import { esSecuencia, type DiagramModel } from "./diagram-builder";

/** Prefijo de numeración al inicio de un nombre: `3.`, `3.1.`, `3.1.2.` + espacio. */
const PREFIJO = /^\s*\d+(?:\.\d+)*\.\s+/;

/** El nombre sin número delante. */
export function sinNumero(nombre: string): string {
  let n = nombre;
  // Un nombre que llegó con el número apilado («1. 1. Validar») se limpia entero.
  while (PREFIJO.test(n)) n = n.replace(PREFIJO, "");
  return n;
}

/** El número que lleva un nombre (`"3.1"`), o `undefined`. */
export function numeroDe(nombre: string): string | undefined {
  return /^\s*(\d+(?:\.\d+)*)\.\s+/.exec(nombre)?.[1];
}

/** El nombre con ESE número: reemplaza el que tuviera, nunca apila. */
export function conNumero(nombre: string, numero: string): string {
  return `${numero}. ${sinNumero(nombre)}`;
}

type Nodo = DiagramModel["nodes"][number];

const esPaso = (model: DiagramModel, n: Nodo) => hasRole(model.meta.notation, n.tipo_elemento, "task");

/** ¿Es un diagrama de flujo? Lo dicen los roles de su notación, no su id. */
export function esDiagramaDeFlujo(model: DiagramModel): boolean {
  return model.nodes.some((n) => hasRole(model.meta.notation, n.tipo_elemento, "start", "gateway"));
}

/**
 * Número que le toca a cada paso, por id. Recorre desde los inicios (o, sin
 * inicio declarado, desde las cajas sin entradas) por las aristas hacia
 * adelante; lo que no se alcanza va al final, en el orden del modelo.
 */
export function numerosDePasos(model: DiagramModel): Map<string, string> {
  const ids = new Set(model.nodes.map((n) => n.id));
  const salidas = new Map<string, string[]>();
  const entradas = new Map<string, number>();
  for (const e of model.edges) {
    if (!ids.has(e.fuente) || !ids.has(e.destino) || e.fuente === e.destino) continue;
    (salidas.get(e.fuente) ?? salidas.set(e.fuente, []).get(e.fuente)!).push(e.destino);
    entradas.set(e.destino, (entradas.get(e.destino) ?? 0) + 1);
  }
  const inicios = model.nodes.filter((n) => hasRole(model.meta.notation, n.tipo_elemento, "start"));
  const raices = (inicios.length ? inicios : model.nodes.filter((n) => !entradas.get(n.id))).map((n) => n.id);

  // Aristas de vuelta (DFS): sin quitarlas, un ciclo no tiene dónde reunirse.
  const adelante = new Map<string, string[]>();
  const estado = new Map<string, 1 | 2>();
  const dfs = (v: string) => {
    estado.set(v, 1);
    const ok: string[] = [];
    for (const w of salidas.get(v) ?? []) {
      if (estado.get(w) === 1) continue; // vuelta
      ok.push(w);
      if (!estado.has(w)) dfs(w);
    }
    adelante.set(v, ok);
    estado.set(v, 2);
  };
  for (const r of raices) if (!estado.has(r)) dfs(r);
  for (const n of model.nodes) if (!estado.has(n.id)) dfs(n.id);

  const alcanzables = (desde: string): string[] => {
    const orden: string[] = [];
    const visto = new Set<string>();
    const cola = [desde];
    while (cola.length) {
      const v = cola.shift()!;
      if (visto.has(v)) continue;
      visto.add(v);
      orden.push(v);
      cola.push(...(adelante.get(v) ?? []));
    }
    return orden;
  };
  /** Dónde se reúnen las ramas: lo primero que alcanzan TODAS. */
  const reunion = (ramas: string[]): string | undefined => {
    const [primera, ...resto] = ramas.map(alcanzables);
    const otros = resto.map((r) => new Set(r));
    return primera.find((v) => otros.every((s) => s.has(v)));
  };

  const nodo = new Map(model.nodes.map((n) => [n.id, n]));
  const numerado = new Set<string>();
  const out = new Map<string, string>();

  /**
   * Numera la secuencia que arranca en `desde` hasta `hasta` (exclusivo). Cada
   * paso o bifurcación consume un número del contador.
   */
  const recorrer = (desde: string | undefined, hasta: string | undefined, prefijo: string, contador: { n: number }) => {
    let v = desde;
    while (v && v !== hasta && !numerado.has(v)) {
      numerado.add(v);
      const n = nodo.get(v);
      if (n && esPaso(model, n)) out.set(v, `${prefijo}${++contador.n}`);
      const sig = (adelante.get(v) ?? []).filter((w) => !numerado.has(w));
      if (sig.length <= 1) {
        v = sig[0];
        continue;
      }
      const junta = reunion(sig);
      const base = `${prefijo}${++contador.n}`;
      sig.forEach((rama, i) => {
        const etiqueta = `${base}.${i + 1}`;
        const antes = new Map(out);
        recorrer(rama, junta, `${etiqueta}.`, { n: 0 });
        // Una rama de un solo paso es `n.i`, no `n.i.1`.
        const nuevos = [...out.keys()].filter((k) => !antes.has(k));
        if (nuevos.length === 1 && out.get(nuevos[0]) === `${etiqueta}.1`) out.set(nuevos[0], etiqueta);
      });
      // Una bifurcación sin pasos en ninguna rama no gasta número.
      if (![...out.values()].some((x) => x.startsWith(`${base}.`))) contador.n--;
      v = junta;
    }
  };

  const contador = { n: 0 };
  for (const r of raices) recorrer(r, undefined, "", contador);
  for (const n of model.nodes) if (!numerado.has(n.id)) recorrer(n.id, undefined, "", contador);
  return out;
}

/**
 * El modelo con sus pasos numerados. Un diagrama que no es de flujo vuelve igual
 * (misma referencia): numerar un Event Storming o un C4 no significa nada.
 */
export function numerarPasos(model: DiagramModel): DiagramModel {
  if (esSecuencia(model)) {
    let cambio = false;
    const edges = model.edges.map((e) => {
      if (e.orden === undefined || !e.descripcion?.trim()) return e;
      const descripcion = conNumero(e.descripcion, String(e.orden));
      if (descripcion === e.descripcion) return e;
      cambio = true;
      return { ...e, descripcion };
    });
    return cambio ? { ...model, edges } : model;
  }
  if (!esDiagramaDeFlujo(model)) return model;
  const numeros = numerosDePasos(model);
  let cambio = false;
  const nodes = model.nodes.map((n) => {
    const num = numeros.get(n.id);
    // Lo que no es paso pierde un número que le hayan puesto a mano: un evento
    // de inicio «1. Inicio» haría creer que el flujo empieza en el paso 1.
    const nombre = num ? conNumero(n.nombre, num) : esPaso(model, n) ? n.nombre : sinNumero(n.nombre);
    if (nombre === n.nombre) return n;
    cambio = true;
    return { ...n, nombre };
  });
  return cambio ? { ...model, nodes } : model;
}

/**
 * Avisos de numeración para `validate_diagram`/calidad: pasos sin número,
 * números que no coinciden con el recorrido, duplicados. Sólo en diagramas de
 * flujo; en una secuencia el orden ya lo vigila `sequenceWarnings`.
 */
export function problemasDeNumeracion(model: DiagramModel): string[] {
  if (esSecuencia(model) || !esDiagramaDeFlujo(model)) return [];
  const esperado = numerosDePasos(model);
  const problemas: string[] = [];
  const vistos = new Map<string, string>();
  for (const n of model.nodes) {
    if (!esPaso(model, n)) continue;
    const actual = numeroDe(n.nombre);
    if (!actual) {
      problemas.push(`«${n.nombre}» no está numerado: los pasos de un flujo llevan su número en el nombre («1. …»).`);
      continue;
    }
    const otro = vistos.get(actual);
    if (otro) problemas.push(`El número ${actual} está repetido («${otro}» y «${n.nombre}»).`);
    vistos.set(actual, n.nombre);
    const debe = esperado.get(n.id);
    if (debe && debe !== actual) problemas.push(`«${n.nombre}» lleva el ${actual} pero por el flujo le toca el ${debe}.`);
  }
  return problemas;
}
