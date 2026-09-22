/**
 * @fileOverview Reordenar los elementos DENTRO de su capa para que se crucen menos (PURO).
 *
 * Es la fase 2 de Sugiyama y nada más: no mueve nada de sitio, PERMUTA ranuras.
 * Las coordenadas que produce el layout se quedan como están; lo único que
 * cambia es qué elemento ocupa cada una. Por eso ningún nodo sale de su banda y
 * el aire del preset se conserva intacto (FR-001).
 *
 * Toda pasada se acepta sólo si el coste combinado baja (FR-002): el prototipo
 * mostró que el baricentro a secas baja los cruces pero empeora el paso sobre
 * cajas en dos de los seis diagramas reales.
 */

import {
  costeDeDisposicion,
  medirLegibilidad,
  type Caja,
  type Legibilidad,
  type Relacion,
} from "./metrics";

export interface OrdenOpts {
  /** Pasadas de baricentro (ida y vuelta cuentan una). */
  pasadas?: number;
  /** Techo de tiempo; agotado, se devuelve la mejor disposición hallada. */
  presupuestoMs?: number;
  /** Reloj inyectable: las pruebas no dependen del reloj real. */
  ahora?: () => number;
}

/** Tolerancia para considerar que dos cajas están en la misma capa. */
const TOLERANCIA = 12;

const PASADAS_POR_DEFECTO = 6;
const PRESUPUESTO_POR_DEFECTO = 2000;

type Eje = "x" | "y";

const cruzado = (eje: Eje): Eje => (eje === "x" ? "y" : "x");

/** Agrupa en capas: misma banda y misma posición en el eje de avance. */
function capasDe(cajas: Caja[], eje: Eje): Caja[][] {
  const grupos = new Map<string, Caja[]>();
  for (const c of cajas) {
    const banda = c.container ?? "";
    const balde = Math.round(c[eje] / TOLERANCIA);
    const k = `${banda}|${balde}`;
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(c);
  }
  // El orden de las capas es el de la primera caja de cada una: determinista y
  // sin depender del recorrido del Map (FR-011).
  return [...grupos.values()]
    .map((g) => [...g].sort((a, b) => a[cruzado(eje)] - b[cruzado(eje)]))
    .sort((a, b) => a[0][eje] - b[0][eje]);
}

/** Vecinos de cada caja (cualquier relación, en cualquier sentido). */
function vecindario(relaciones: Relacion[]): Map<string, string[]> {
  const v = new Map<string, string[]>();
  const anota = (a: string, b: string) => (v.get(a) ?? v.set(a, []).get(a)!).push(b);
  for (const r of relaciones) {
    if (r.fuente === r.destino) continue;
    anota(r.fuente, r.destino);
    anota(r.destino, r.fuente);
  }
  return v;
}

/**
 * Reparte las ranuras de la capa entre sus cajas en el orden dado. Las ranuras
 * son las posiciones que YA existen: así el resultado es una permutación y el
 * diagrama conserva su tamaño y su aire.
 */
function asignarRanuras(capa: Caja[], orden: Caja[], eje: Eje): Map<string, Caja> {
  const cruz = cruzado(eje);
  const ranuras = capa.map((c) => c[cruz]).sort((a, b) => a - b);
  const out = new Map<string, Caja>();
  orden.forEach((c, i) => out.set(c.id, { ...c, [cruz]: ranuras[i] } as Caja));
  return out;
}

/** Una pasada de baricentro sobre todas las capas, en el sentido pedido. */
function pasadaBaricentro(
  capas: Caja[][],
  posicion: Map<string, number>,
  vecinos: Map<string, string[]>,
  eje: Eje,
  haciaAdelante: boolean
): Map<string, Caja> {
  const cruz = cruzado(eje);
  const movidas = new Map<string, Caja>();
  const indices = capas.map((_, i) => i);
  const recorrido = haciaAdelante ? indices : [...indices].reverse();

  for (const i of recorrido) {
    const capa = capas[i];
    if (capa.length < 2) continue;
    const baricentro = new Map<string, number>();
    for (const c of capa) {
      const vs = (vecinos.get(c.id) ?? [])
        .map((id) => posicion.get(id))
        .filter((p): p is number => p !== undefined);
      // Sin vecinos, el baricentro es su propia posición: quedarse quieto es
      // mejor que caer al principio de la capa arrastrando a los demás.
      baricentro.set(c.id, vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : c[cruz]);
    }
    const orden = [...capa].sort((a, b) => {
      const d = baricentro.get(a.id)! - baricentro.get(b.id)!;
      // Empate → orden actual: es lo que hace la disposición estable y, por lo
      // tanto, determinista (FR-011).
      return d !== 0 ? d : a[cruz] - b[cruz];
    });
    for (const [id, caja] of asignarRanuras(capa, orden, eje)) {
      movidas.set(id, caja);
      posicion.set(id, caja[cruz]);
    }
  }
  return movidas;
}

const aplicar = (cajas: Caja[], cambios: Map<string, Caja>): Caja[] =>
  cajas.map((c) => cambios.get(c.id) ?? c);

/**
 * Prueba los dos ejes de capa y se queda con el mejor resultado. Si ninguno
 * mejora el coste de partida, devuelve las cajas TAL CUAL: un diagrama que ya
 * estaba bien ordenado no se toca (TS-004).
 */
export function ordenarCapas(cajas: Caja[], relaciones: Relacion[], opts: OrdenOpts = {}): Caja[] {
  const pasadas = opts.pasadas ?? PASADAS_POR_DEFECTO;
  const presupuesto = opts.presupuestoMs ?? PRESUPUESTO_POR_DEFECTO;
  const ahora = opts.ahora ?? (() => Date.now());
  const t0 = ahora();
  const agotado = () => ahora() - t0 > presupuesto;

  // Los contenedores no se permutan: son el marco, no el contenido.
  const movibles = cajas.filter((c) => !c.esContenedor);
  if (movibles.length < 2 || !relaciones.length) return cajas;

  const medir = (disposicion: Caja[]) => medirLegibilidad(disposicion, relaciones);
  const coste = (disposicion: Caja[]) => costeDeDisposicion(medir(disposicion));
  const vecinos = vecindario(relaciones);

  const base = medir(cajas);
  // SC-002: ningún diagrama puede empeorar en NINGUNA de las dos métricas. Una
  // permutación que cambia un cruce por dos pasos sobre caja baja el coste
  // combinado y aun así deja el diagrama peor de leer, así que no se acepta.
  const admisible = (l: Legibilidad) => l.cruces <= base.cruces && l.sobreCaja <= base.sobreCaja;

  let mejor = cajas;
  let mejorCoste = costeDeDisposicion(base);

  for (const eje of ["x", "y"] as Eje[]) {
    let actual = cajas;
    const capas = capasDe(movibles, eje);
    if (capas.every((c) => c.length < 2)) continue;

    for (let p = 0; p < pasadas && !agotado(); p++) {
      const cruz = cruzado(eje);
      const movibleActual = actual.filter((c) => !c.esContenedor);
      const posicion = new Map(movibleActual.map((c) => [c.id, c[cruz]]));
      const capasActuales = capasDe(movibleActual, eje);
      const cambios = pasadaBaricentro(capasActuales, posicion, vecinos, eje, p % 2 === 0);
      const candidata = aplicar(actual, cambios);
      const l = medir(candidata);
      const c = costeDeDisposicion(l);
      // FR-002: la pasada que empeora se descarta, y con ella la rama.
      if (c >= coste(actual)) break;
      actual = candidata;
      if (c < mejorCoste && admisible(l)) {
        mejor = candidata;
        mejorCoste = c;
      }
    }

    // Pulido: intercambios dentro de la capa mientras el coste baje.
    for (const capa of capasDe(actual.filter((c) => !c.esContenedor), eje)) {
      for (let i = 0; i + 1 < capa.length && !agotado(); i++) {
        const cruz = cruzado(eje);
        const a = actual.find((c) => c.id === capa[i].id)!;
        const b = actual.find((c) => c.id === capa[i + 1].id)!;
        const candidata = actual.map((c) =>
          c.id === a.id ? ({ ...c, [cruz]: b[cruz] } as Caja) : c.id === b.id ? ({ ...c, [cruz]: a[cruz] } as Caja) : c
        );
        const l = medir(candidata);
        const c = costeDeDisposicion(l);
        if (c < mejorCoste && admisible(l)) {
          actual = candidata;
          mejor = candidata;
          mejorCoste = c;
        }
      }
    }
  }

  return mejor;
}
