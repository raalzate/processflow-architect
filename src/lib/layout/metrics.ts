/**
 * @fileOverview Medida de LEGIBILIDAD de un diagrama ya dispuesto (PURO).
 *
 * Convierte "quedó feo" en tres números que el gate puede exigir: cuántas
 * relaciones se cruzan, cuántas pasan por encima de una caja que no es suya y
 * cuántas se quedaron sin recorrido dibujable. Sin esta medida, ordenar y rutear
 * no tienen criterio de aceptación: cualquier cambio "se ve mejor" a ojo.
 *
 * Se mide sobre el RECORRIDO REAL de la relación (recta, escalonada o curva
 * muestreada), no sobre la recta entre centros: una curva que esquiva una caja
 * no está pasando por encima de ella, y contarla como cruce sería mentir sobre
 * lo que el usuario ve.
 */

export interface Punto {
  x: number;
  y: number;
}

/** Caja posicionada del diagrama (nodo o contenedor). */
export interface Caja {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Nombre o id del contenedor al que pertenece; vacío si está suelta. */
  container?: string;
  /**
   * Contenedor (banda, límite de sistema, agregado). NUNCA es obstáculo: por
   * definición envuelve a sus hijos, así que toda relación que entra o sale de
   * ellos lo atraviesa (FR-005).
   */
  esContenedor?: boolean;
}

export interface Relacion {
  id: string;
  fuente: string;
  destino: string;
  /**
   * Recorrido completo, extremos incluidos. Ausente = recta entre los centros
   * de sus cajas, que es como se dibuja por defecto.
   */
  puntos?: Punto[];
}

export interface Legibilidad {
  /** Pares de relaciones que se cortan fuera de un extremo común. */
  cruces: number;
  /**
   * Pares de relaciones que comparten recorrido: van encimadas por el mismo
   * corredor. No son un cruce —no hay X— pero se leen peor: en pantalla son una
   * sola línea y no se sabe cuántas relaciones hay ni de dónde sale cada una.
   * Mientras no se midió, meterse en un corredor ocupado le salía GRATIS al
   * ruteo, así que lo prefería (#392).
   */
  solape: number;
  /** Relaciones que atraviesan una caja que no es ninguno de sus extremos. */
  sobreCaja: number;
  /** Relaciones sin recorrido dibujable (una caja falta o el trazo degenera). */
  sinRuta: number;
  /** Relaciones consideradas (sin auto-relaciones ni extremos ausentes). */
  relaciones: number;
}

/** Margen alrededor de una caja: rozar el borde ya se lee como "la pisa". */
export const MARGEN_CAJA = 2;

/** Dos tramos a menos de esto, y en el mismo eje, se ven como una sola línea. */
export const TOLERANCIA_SOLAPE = 6;

/** Tramo compartido a partir del cual el solape se nota en pantalla. */
export const SOLAPE_MINIMO = 40;

/**
 * A partir de este número de relaciones, contar cruces por fuerza bruta (O(E²))
 * deja de entrar en el presupuesto de tiempo, y la medida pasa por un índice de
 * celdas. El umbral sale de la cota de diseño de la feature (400 relaciones):
 * por debajo, el par a par es más rápido que construir el índice.
 */
export const UMBRAL_INDICE = 200;

type Segmento = [Punto, Punto];

interface Trazo {
  rel: Relacion;
  segmentos: Segmento[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const centro = (c: Caja): Punto => ({ x: c.x + c.width / 2, y: c.y + c.height / 2 });

/**
 * Recorta un extremo al borde de su caja, en la dirección del otro extremo. El
 * trazo REAL nace en el contorno, no en el centro: medir desde el centro cuenta
 * como "pasa por encima" el tramo que la línea nunca dibuja (D6).
 */
export function recortarABorde(desde: Caja, hacia: Punto): Punto {
  const c = centro(desde);
  const dx = hacia.x - c.x;
  const dy = hacia.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const hw = desde.width / 2;
  const hh = desde.height / 2;
  const escala = 1 / Math.max(Math.abs(dx) / (hw || 1), Math.abs(dy) / (hh || 1));
  return { x: c.x + dx * escala, y: c.y + dy * escala };
}

/** Recorrido efectivo de una relación: el suyo, o la recta entre bordes. */
export function recorrido(rel: Relacion, cajas: Map<string, Caja>): Punto[] | null {
  if (rel.puntos && rel.puntos.length >= 2) return rel.puntos;
  const a = cajas.get(rel.fuente);
  const b = cajas.get(rel.destino);
  if (!a || !b) return null;
  return [recortarABorde(a, centro(b)), recortarABorde(b, centro(a))];
}

function segmentosDe(puntos: Punto[]): Segmento[] {
  const segs: Segmento[] = [];
  for (let i = 0; i < puntos.length - 1; i++) {
    const a = puntos[i];
    const b = puntos[i + 1];
    if (a.x === b.x && a.y === b.y) continue;
    segs.push([a, b]);
  }
  return segs;
}

const lado = (p: Punto, q: Punto, r: Punto): number =>
  (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);

/**
 * ¿Se cortan dos segmentos en una X? Cruce PROPIO: cada segmento deja al otro
 * con una punta de cada lado. El toque y el solape colineal quedan fuera a
 * propósito — dos relaciones que comparten trazo son el caso "paralelas", que
 * esta feature declara fuera de alcance; contarlas como cruce multiplicaba por
 * ocho la medida del mapa de dominio sin que hubiera una sola X en pantalla.
 */
export function seCortan(s1: Segmento, s2: Segmento): boolean {
  const [p1, q1] = s1;
  const [p2, q2] = s2;
  const d1 = lado(p1, q1, p2);
  const d2 = lado(p1, q1, q2);
  const d3 = lado(p2, q2, p1);
  const d4 = lado(p2, q2, q1);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** ¿El segmento entra en el rectángulo (con margen)? */
export function segmentoPisaCaja(seg: Segmento, caja: Caja, margen = MARGEN_CAJA): boolean {
  const x0 = caja.x + margen;
  const y0 = caja.y + margen;
  const x1 = caja.x + caja.width - margen;
  const y1 = caja.y + caja.height - margen;
  if (x1 <= x0 || y1 <= y0) return false;
  const [a, b] = seg;
  const dentro = (p: Punto) => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1;
  if (dentro(a) || dentro(b)) return true;
  const esquinas: Punto[] = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  for (let i = 0; i < 4; i++) {
    if (seCortan(seg, [esquinas[i], esquinas[(i + 1) % 4]])) return true;
  }
  return false;
}

function trazoDe(rel: Relacion, cajas: Map<string, Caja>): Trazo | null {
  const puntos = recorrido(rel, cajas);
  if (!puntos) return null;
  const segmentos = segmentosDe(puntos);
  if (!segmentos.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of puntos) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { rel, segmentos, minX, minY, maxX, maxY };
}

/** ¿Las dos relaciones se tocan en un nodo común? Ahí no hay ni cruce ni solape. */
export const comparteExtremo = (a: Relacion, b: Relacion): boolean =>
  a.fuente === b.fuente || a.fuente === b.destino || a.destino === b.fuente || a.destino === b.destino;

const solapan = (a: Trazo, b: Trazo): boolean =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

/** ¿Los dos trazos se cortan en algún punto? Un par cuenta UNA vez. */
function trazosSeCortan(a: Trazo, b: Trazo): boolean {
  if (!solapan(a, b)) return false;
  for (const s1 of a.segmentos) for (const s2 of b.segmentos) if (seCortan(s1, s2)) return true;
  return false;
}

/**
 * Cruces entre trazos. Dos relaciones que comparten un extremo se tocan en el
 * nodo por definición: eso no es un cruce, es el diagrama.
 */
function contarCruces(trazos: Trazo[]): number {
  const comparte = comparteExtremo;

  if (trazos.length <= UMBRAL_INDICE) {
    let cruces = 0;
    for (let i = 0; i < trazos.length; i++)
      for (let j = i + 1; j < trazos.length; j++) {
        if (comparte(trazos[i].rel, trazos[j].rel)) continue;
        if (trazosSeCortan(trazos[i], trazos[j])) cruces++;
      }
    return cruces;
  }

  // Índice por celdas: sólo se comparan trazos que comparten alguna celda, que
  // es lo que evita los 80 000 pares de un diagrama de 400 relaciones (FR-012).
  const ancho = Math.max(1, ...trazos.map((t) => t.maxX - t.minX));
  const alto = Math.max(1, ...trazos.map((t) => t.maxY - t.minY));
  const paso = Math.max(80, (ancho + alto) / 2);
  const celdas = new Map<string, number[]>();
  const clave = (cx: number, cy: number) => `${cx}:${cy}`;
  trazos.forEach((t, i) => {
    for (let cx = Math.floor(t.minX / paso); cx <= Math.floor(t.maxX / paso); cx++)
      for (let cy = Math.floor(t.minY / paso); cy <= Math.floor(t.maxY / paso); cy++) {
        const k = clave(cx, cy);
        (celdas.get(k) ?? celdas.set(k, []).get(k)!).push(i);
      }
  });
  const vistos = new Set<number>();
  let cruces = 0;
  for (const ids of celdas.values()) {
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = Math.min(ids[i], ids[j]);
        const b = Math.max(ids[i], ids[j]);
        const par = a * trazos.length + b;
        if (vistos.has(par)) continue;
        vistos.add(par);
        if (comparte(trazos[a].rel, trazos[b].rel)) continue;
        if (trazosSeCortan(trazos[a], trazos[b])) cruces++;
      }
  }
  return cruces;
}

/**
 * Largo que dos tramos comparten yendo por el mismo carril (`Segmento` es el
 * par de puntos de un tramo). Sólo cuenta el
 * solape AXIAL (los dos horizontales o los dos verticales, casi a la misma
 * altura): es el que el ojo lee como una línea sola.
 */
export function largoEncimado(a: Segmento, b: Segmento): number {
  const [a1, a2] = a;
  const [b1, b2] = b;
  const horiz = Math.abs(a1.y - a2.y) < 1 && Math.abs(b1.y - b2.y) < 1;
  const vert = Math.abs(a1.x - a2.x) < 1 && Math.abs(b1.x - b2.x) < 1;
  if (horiz && Math.abs(a1.y - b1.y) < TOLERANCIA_SOLAPE) {
    return Math.max(
      0,
      Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x)) - Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x))
    );
  }
  if (vert && Math.abs(a1.x - b1.x) < TOLERANCIA_SOLAPE) {
    return Math.max(
      0,
      Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y)) - Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y))
    );
  }
  return 0;
}

/** ¿Estos dos trazos van encimados en algún tramo largo? */
export function seEnciman(a: { segmentos: Segmento[] }, b: { segmentos: Segmento[] }): boolean {
  for (const s1 of a.segmentos)
    for (const s2 of b.segmentos) if (largoEncimado(s1, s2) > SOLAPE_MINIMO) return true;
  return false;
}

/**
 * Mide la legibilidad de un diagrama ya posicionado.
 *
 * Las auto-relaciones no entran: tienen forma propia (un lazo) y contarlas como
 * cruce o como paso sobre caja diría algo falso del diagrama.
 */
export function medirLegibilidad(cajas: Caja[], relaciones: Relacion[]): Legibilidad {
  const porId = new Map(cajas.map((c) => [c.id, c]));
  // Los contenedores no son obstáculo: envuelven a sus hijos por definición y
  // toda relación que entra o sale de ellos los atravesaría (FR-005).
  const obstaculos = cajas.filter((c) => !c.esContenedor);

  const trazos: Trazo[] = [];
  let sinRuta = 0;
  let consideradas = 0;

  for (const rel of relaciones) {
    if (rel.fuente === rel.destino) continue;
    if (!porId.has(rel.fuente) || !porId.has(rel.destino)) continue;
    consideradas++;
    const t = trazoDe(rel, porId);
    if (!t) {
      sinRuta++;
      continue;
    }
    trazos.push(t);
  }

  let sobreCaja = 0;
  for (const t of trazos) {
    const pisa = obstaculos.some((caja) => {
      if (caja.id === t.rel.fuente || caja.id === t.rel.destino) return false;
      return t.segmentos.some((s) => segmentoPisaCaja(s, caja));
    });
    if (pisa) sobreCaja++;
  }

  let solape = 0;
  for (let i = 0; i < trazos.length; i++)
    for (let j = i + 1; j < trazos.length; j++) {
      // Mismo criterio que el cruce: dos relaciones que comparten un extremo se
      // juntan al llegar a él por definición. Separarlas es repartir las puntas
      // por el borde del nodo (puertos), que el spec declaró fuera de alcance;
      // cobrarlo aquí sería exigirle al ruteo algo que no puede hacer.
      if (comparteExtremo(trazos[i].rel, trazos[j].rel)) continue;
      if (seEnciman(trazos[i], trazos[j])) solape++;
    }

  return { cruces: contarCruces(trazos), solape, sobreCaja, sinRuta, relaciones: consideradas };
}

/**
 * Coste combinado de una disposición. El paso sobre caja pesa menos que el cruce
 * en el número, pero el prototipo mostró que es el que más molesta al leer: por
 * eso 0,6 y no 0,2 — baja lo suficiente como para que una pasada que cambia un
 * cruce por dos pasos sobre caja se descarte (FR-002).
 *
 * El solape pesa como un cruce: dos líneas encimadas esconden una relación
 * entera, que es peor que verlas cruzarse (#392).
 */
export function costeDeDisposicion(l: Legibilidad): number {
  return l.cruces + 0.6 * l.sobreCaja + l.solape;
}

/**
 * Coste de la parte del diagrama que TOCA a unas relaciones concretas: los
 * cruces en los que participan y su paso sobre cajas. Sirve para decidir un
 * intercambio local sin volver a medir el diagrama entero — medir todo en cada
 * prueba de intercambio es lo que hacía que un diagrama de 100 nodos se fuera
 * del presupuesto (FR-012).
 */
export function costeLocal(cajas: Caja[], relaciones: Relacion[], afectadas: Set<string>): number {
  const sub = relaciones.filter((r) => afectadas.has(r.id));
  if (!sub.length) return 0;
  const porId = new Map(cajas.map((c) => [c.id, c]));
  const obstaculos = cajas.filter((c) => !c.esContenedor);
  const trazos = relaciones
    .map((r) => (r.fuente === r.destino ? null : trazoDe(r, porId)))
    .filter((t): t is Trazo => t !== null);

  let cruces = 0;
  let solape = 0;
  let sobreCaja = 0;
  for (const t of trazos) {
    if (!afectadas.has(t.rel.id)) continue;
    for (const otro of trazos) {
      if (otro.rel.id === t.rel.id) continue;
      // Un par de afectadas se contaría dos veces: sólo cuenta el de menor id.
      if (afectadas.has(otro.rel.id) && otro.rel.id < t.rel.id) continue;
      if (comparteExtremo(t.rel, otro.rel)) continue;
      if (seEnciman(t, otro)) solape++;
      if (trazosSeCortan(t, otro)) cruces++;
    }
    const pisa = obstaculos.some((caja) => {
      if (caja.id === t.rel.fuente || caja.id === t.rel.destino) return false;
      return t.segmentos.some((sg) => segmentoPisaCaja(sg, caja));
    });
    if (pisa) sobreCaja++;
  }
  return cruces + 0.6 * sobreCaja + solape;
}

/** ¿La disposición está por debajo del umbral de legibilidad declarado (C2)? */
export function hayProblemaDeLegibilidad(l: Legibilidad): boolean {
  return (
    l.sobreCaja > 0 ||
    l.solape > 0 ||
    (l.relaciones > 0 && l.cruces > l.relaciones * 0.1)
  );
}
