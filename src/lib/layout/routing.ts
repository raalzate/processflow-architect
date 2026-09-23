/**
 * @fileOverview Ruteo de relaciones que esquiva las cajas (PURO).
 *
 * Devuelve PUNTOS DE QUIEBRE, no un trazo: el dibujo ya sabe hacer una
 * poli-línea desde ellos (`link-geom.ts`, rama ortogonal), así que el trazo
 * sigue estando en un solo sitio y aquí sólo se decide por dónde pasa.
 *
 * El ruteo es SECUENCIAL y con coste (FR-004). Rutar cada relación por su cuenta
 * es peor que no rutar: en el prototipo el paso sobre cajas bajaba a 1 pero los
 * cruces subían de 4 a 14, porque cada línea esquivaba una caja metiéndose en el
 * corredor de otra. Por eso el coste cobra el cruce contra lo ya trazado.
 *
 * Sólo se rutea la relación que en recta pisaría una caja ajena (D2): convertir
 * en escalera un diagrama que se leía bien rompería el enrutado por defecto que
 * declara cada notación (FR-014 · P6).
 */

import {
  costeDeDisposicion,
  largoEncimado,
  medirLegibilidad,
  recortarABorde,
  seCortan,
  segmentoPisaCaja,
  SOLAPE_MINIMO,
  type Caja,
  type Punto,
  type Relacion,
} from "./metrics";

export interface RuteoOpts {
  /** Salto entre corredores candidatos. */
  paso?: number;
  /** Aire alrededor de una caja que el trazo intenta respetar. */
  margen?: number;
  /** Techo de tiempo; agotado, lo que falte se deja en recta. */
  presupuestoMs?: number;
  /** Reloj inyectable: las pruebas no dependen del reloj real. */
  ahora?: () => number;
  /**
   * Relaciones cuyo recorrido NO se recalcula (las que ajustó una persona).
   * Siguen contando como trazo ya dibujado: lo que se rutea alrededor tiene que
   * esquivarlas igual que a cualquier otra línea (FR-010).
   */
  fijas?: Set<string>;
}

const PASO_POR_DEFECTO = 60;
const MARGEN_POR_DEFECTO = 8;
const PRESUPUESTO_POR_DEFECTO = 2000;

/** Cuántos corredores desplazados se prueban a cada lado del centro. */
const DESPLAZAMIENTOS = 5;

/** Cuántos corredores por eje entran en el rodeo de dos tramos. */
const RODEOS = 4;

/** Pesos del coste. El obstáculo domina: es el dolor que reportó el usuario. */
const PESO = { obstaculo: 10, cruce: 4, solape: 5, doblez: 0.8, longitud: 1 / 4000 };

/**
 * Pasadas de rip-up & reroute. Con una sola, la relación que se decidió primero
 * no se entera de que otra terminó pasándole por encima: así quedaban los dos
 * cruces del diagrama de enrollment (#391). Dos pasadas alcanzan; la tercera no
 * cambió nada en ningún diagrama de referencia y se corta sola si no hay cambio.
 */
const PASADAS = 3;

const centro = (c: Caja): Punto => ({ x: c.x + c.width / 2, y: c.y + c.height / 2 });

function segmentos(pts: Punto[]): Array<[Punto, Punto]> {
  const out: Array<[Punto, Punto]> = [];
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i].x === pts[i + 1].x && pts[i].y === pts[i + 1].y) continue;
    out.push([pts[i], pts[i + 1]]);
  }
  return out;
}

const largo = (pts: Punto[]): number =>
  segmentos(pts).reduce((t, [a, b]) => t + Math.hypot(b.x - a.x, b.y - a.y), 0);

/** Recorta las puntas al borde de sus cajas: el trazo real nace en el contorno. */
function recortar(pts: Punto[], fuente: Caja, destino: Caja): Punto[] {
  const out = [...pts];
  out[0] = recortarABorde(fuente, out[1]);
  out[out.length - 1] = recortarABorde(destino, out[out.length - 2]);
  return out;
}

/**
 * CORREDORES libres de un eje: los huecos que dejan las cajas entre sí. Son los
 * pasillos por donde una línea puede cruzar el diagrama sin pisar nada; probar
 * sólo desplazamientos fijos desde el centro deja fuera justo el hueco bueno
 * cuando las cajas no están en rejilla.
 */
function corredores(cajas: Caja[], eje: "x" | "y", margen: number): number[] {
  const lado = eje === "x" ? ((c: Caja) => [c.x, c.x + c.width] as const) : ((c: Caja) => [c.y, c.y + c.height] as const);
  const tramos = cajas.map(lado).sort((u, v) => u[0] - v[0]);
  const libres: number[] = [];
  let borde = -Infinity;
  for (const [ini, fin] of tramos) {
    if (borde !== -Infinity && ini - borde > 2 * margen) libres.push((borde + ini) / 2);
    borde = Math.max(borde, fin);
  }
  return libres;
}

/** Candidatas de una relación: recta, las dos L, corredores libres y desplazados. */
function candidatas(
  a: Punto,
  b: Punto,
  paso: number,
  libres: { x: number[]; y: number[] }
): Punto[][] {
  const out: Punto[][] = [[a, b]];
  out.push([a, { x: b.x, y: a.y }, b]);
  out.push([a, { x: a.x, y: b.y }, b]);
  const enRango = (v: number, p: number, q: number) => {
    const lo = Math.min(p, q) - paso * DESPLAZAMIENTOS;
    const hi = Math.max(p, q) + paso * DESPLAZAMIENTOS;
    return v >= lo && v <= hi;
  };
  // Medio paso además del paso entero: dos relaciones que necesitan el mismo
  // pasillo pueden repartírselo en vez de encimarse (#392).
  const rejilla = (centro: number) =>
    Array.from({ length: 4 * DESPLAZAMIENTOS + 1 }, (_, i) => centro + ((i - 2 * DESPLAZAMIENTOS) * paso) / 2);
  const desviados = (vs: number[]) => vs.flatMap((v) => [v, v - paso / 2, v + paso / 2]);
  const xs = [...rejilla((a.x + b.x) / 2), ...desviados(libres.x).filter((v) => enRango(v, a.x, b.x))];
  const ys = [...rejilla((a.y + b.y) / 2), ...desviados(libres.y).filter((v) => enRango(v, a.y, b.y))];
  for (const mx of xs) out.push([a, { x: mx, y: a.y }, { x: mx, y: b.y }, b]);
  for (const my of ys) out.push([a, { x: a.x, y: my }, { x: b.x, y: my }, b]);
  // Rodeo por dos corredores: la única forma de salir de un nodo encajonado,
  // donde ningún pasillo recto sirve. Se prueban sólo los más cercanos al
  // centro del tramo, que es donde está el rodeo corto.
  const cerca = (vs: number[], ref: number) =>
    [...vs].sort((u, v) => Math.abs(u - ref) - Math.abs(v - ref)).slice(0, RODEOS);
  for (const mx of cerca(xs, (a.x + b.x) / 2))
    for (const my of cerca(ys, (a.y + b.y) / 2))
      out.push([a, { x: mx, y: a.y }, { x: mx, y: my }, { x: b.x, y: my }, b]);
  return out;
}

/**
 * Rutea las relaciones que lo necesitan. La clave del mapa es el id de la
 * relación y el valor son sus QUIEBRES (sin los extremos, que los pone el
 * dibujo). Una relación ausente del mapa conserva su enrutado por defecto.
 */
export function rutarRelaciones(
  cajas: Caja[],
  relaciones: Relacion[],
  opts: RuteoOpts = {}
): Map<string, Punto[]> {
  const paso = opts.paso ?? PASO_POR_DEFECTO;
  const margen = opts.margen ?? MARGEN_POR_DEFECTO;
  const presupuesto = opts.presupuestoMs ?? PRESUPUESTO_POR_DEFECTO;
  const ahora = opts.ahora ?? (() => Date.now());
  const t0 = ahora();

  const porId = new Map(cajas.map((c) => [c.id, c]));
  // Los contenedores no son obstáculo: envuelven a sus hijos (FR-005).
  const obstaculos = cajas.filter((c) => !c.esContenedor);

  interface Pendiente {
    rel: Relacion;
    fuente: Caja;
    destino: Caja;
    recta: Punto[];
  }
  const pendientes: Pendiente[] = [];
  for (const rel of relaciones) {
    if (rel.fuente === rel.destino) continue;
    const fuente = porId.get(rel.fuente);
    const destino = porId.get(rel.destino);
    if (!fuente || !destino) continue;
    const recta = recortar([centro(fuente), centro(destino)], fuente, destino);
    pendientes.push({ rel, fuente, destino, recta });
  }

  // Las cortas primero: fijan los corredores obvios y las largas se acomodan
  // alrededor. Al revés, una relación larga ocupa el centro y parte el diagrama.
  pendientes.sort((a, b) => {
    const d = largo(a.recta) - largo(b.recta);
    return d !== 0 ? d : a.rel.id.localeCompare(b.rel.id);
  });

  const libres = {
    x: corredores(obstaculos, "x", margen),
    y: corredores(obstaculos, "y", margen),
  };

  const pisa = (pts: Punto[], p: Pendiente): number => {
    let n = 0;
    for (const caja of obstaculos) {
      if (caja.id === p.rel.fuente || caja.id === p.rel.destino) continue;
      if (segmentos(pts).some((s) => segmentoPisaCaja(s, caja, -margen))) n++;
    }
    return n;
  };

  // Recorrido ACTUAL de cada relación, empezando por la recta. El ruteo trabaja
  // sobre este dibujo completo en vez de sobre "lo ya trazado": una relación que
  // se decidió temprano tiene que poder revisarse cuando otra le pasa por encima.
  const actual = new Map<string, Punto[]>(
    pendientes.map((p) => [p.rel.id, opts.fijas?.has(p.rel.id) ? p.rel.puntos ?? p.recta : p.recta])
  );

  for (let pasada = 0; pasada < PASADAS && ahora() - t0 <= presupuesto; pasada++) {
    let cambio = false;

    for (const p of pendientes) {
      if (opts.fijas?.has(p.rel.id) || ahora() - t0 > presupuesto) continue;

      // Dos relaciones que comparten un extremo se tocan en el nodo: eso no es
      // un cruce y cobrarlo empujaba al ruteo a dar rodeos que nadie pedía.
      const ajena = (otra: Relacion) =>
        otra.fuente !== p.rel.fuente &&
        otra.fuente !== p.rel.destino &&
        otra.destino !== p.rel.fuente &&
        otra.destino !== p.rel.destino;

      const otras = pendientes
        .filter((q) => q.rel.id !== p.rel.id && ajena(q.rel))
        .flatMap((q) => segmentos(actual.get(q.rel.id)!));

      const cruzaCon = (pts: Punto[]): number => {
        let n = 0;
        for (const s of segmentos(pts)) for (const t of otras) if (seCortan(s, t)) n++;
        return n;
      };

      // Meterse en un corredor ya ocupado tiene que DOLER, o el ruteo lo
      // prefiere: ahí no hay obstáculo ni cruce que pagar, y dos líneas
      // encimadas esconden una relación entera (#392). Pesa más que el cruce.
      const encimaCon = (pts: Punto[]): number => {
        let n = 0;
        for (const s of segmentos(pts))
          for (const t of otras) if (largoEncimado(s, t) > SOLAPE_MINIMO) n++;
        return n;
      };

      const costeDe = (pts: Punto[]) =>
        PESO.obstaculo * pisa(pts, p) +
        PESO.cruce * cruzaCon(pts) +
        PESO.solape * encimaCon(pts) +
        PESO.doblez * Math.max(0, pts.length - 2) +
        PESO.longitud * largo(pts);

      // Se rutea la que pisa una caja, la que sólo se CRUZA con otra (#391) y la
      // que va ENCIMADA de otra (#392): el corredor que esquiva una caja suele
      // meterse justo por donde ya pasa otra línea o dos diagonales limpias.
      const suyo = actual.get(p.rel.id)!;
      if (pisa(suyo, p) === 0 && cruzaCon(suyo) === 0 && encimaCon(suyo) === 0) continue;

      // La RECTA es la candidata a batir, no una más: si ninguna mejora, la
      // relación se queda con el enrutado de su notación (FR-014 · D2).
      let mejor = p.recta;
      let mejorCoste = costeDe(p.recta);
      for (const bruta of candidatas(centro(p.fuente), centro(p.destino), paso, libres)) {
        const pts = recortar(bruta, p.fuente, p.destino);
        const coste = costeDe(pts);
        if (coste < mejorCoste) {
          mejorCoste = coste;
          mejor = pts;
        }
      }

      if (JSON.stringify(mejor) !== JSON.stringify(suyo)) {
        actual.set(p.rel.id, mejor);
        cambio = true;
      }
    }

    // Sin cambios, otra pasada daría exactamente lo mismo.
    if (!cambio) break;
  }

  let rutas = new Map<string, Punto[]>();
  for (const p of pendientes) {
    if (opts.fijas?.has(p.rel.id)) continue;
    // Sin ruta limpia se guarda la menos mala: el diagrama se dibuja igual
    // (P8 — el lienzo nunca queda en blanco).
    const quiebres = actual.get(p.rel.id)!.slice(1, -1);
    if (quiebres.length) rutas.set(p.rel.id, quiebres);
  }

  // Barrido de aceptación (R1): una ruta que esquiva una caja metiéndose en el
  // corredor de otra sube los cruces del diagrama entero. Se mide con y sin cada
  // ruta y se descarta la que no baja el coste combinado — el ruteo nunca puede
  // dejar el diagrama peor de lo que lo encontró.
  const conRutas = (m: Map<string, Punto[]>): Relacion[] =>
    pendientes.map((p) => {
      const q = m.get(p.rel.id);
      return {
        ...p.rel,
        puntos: q?.length
          ? [recortarABorde(p.fuente, q[0]), ...q, recortarABorde(p.destino, q[q.length - 1])]
          : p.recta,
      };
    });
  const base = medirLegibilidad(cajas, conRutas(new Map()));
  /**
   * Criterio del barrido, en este orden: no superar NUNCA los cruces que tenía
   * el diagrama en recta (SC-002), después el menor paso sobre caja —que es el
   * dolor que se reportó— y sólo al final el coste combinado como desempate.
   */
  const puntaje = (m: Map<string, Punto[]>): number => {
    const l = medirLegibilidad(cajas, conRutas(m));
    return Math.max(0, l.cruces - base.cruces) * 1000 + l.sobreCaja * 10 + costeDeDisposicion(l);
  };

  for (const id of [...rutas.keys()].sort()) {
    const sin = new Map(rutas);
    sin.delete(id);
    if (puntaje(sin) <= puntaje(rutas)) rutas = sin;
  }

  return rutas;
}
