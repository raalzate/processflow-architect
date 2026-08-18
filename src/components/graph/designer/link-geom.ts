/**
 * @fileOverview Geometría de nodos y conexiones del lienzo (PURO).
 *
 * Sale de `DesignerCanvas.tsx` porque no dibuja nada: decide cuánto mide un
 * nodo, por qué punto de su contorno nace una línea y qué recorrido hace. Es la
 * parte del lienzo que SÍ se puede probar sin render —y la que más se rompe en
 * silencio: un extremo mal recortado sólo se ve mirando la pantalla.
 *
 * `DesignerCanvas` lo reexporta para no cambiar los imports de quien ya lo usa.
 */

import {
  ALL_ELEMENTS,
  sizeOfType,
  defaultRoutingFor,
  type NotationId,
  type ShapeKind,
} from "@/lib/notations";
import { isContainerType, type DesignerNode, type DesignerLink } from "./serialize";

/** Tamaño por defecto de un CONTENEDOR recién creado (el usuario lo redimensiona). */
export const AGGREGATE_DEFAULT_WIDTH = 500;
export const AGGREGATE_DEFAULT_HEIGHT = 400;

/** Forma declarada por el registro; sin declaración, rectángulo redondeado. */
export const shapeForType = (type: string): ShapeKind =>
  ALL_ELEMENTS[type]?.shape ?? "rounded";

// Recorta un extremo al CONTORNO de la forma (en la dirección que sale del centro),
// así la línea nace/termina en el borde y nunca cruza el interior (clave con relleno
// transparente). Soporta elipse, rombo y rectángulo (contenedores → rectángulo).
export const clipToShape = (
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  shape: ShapeKind,
  dirX: number,
  dirY: number
) => {
  if (dirX === 0 && dirY === 0) return { x: cx, y: cy };
  let scale: number;
  if (shape === "ellipse") {
    scale = 1 / Math.sqrt((dirX / hw) ** 2 + (dirY / hh) ** 2);
  } else if (shape === "diamond") {
    scale = 1 / (Math.abs(dirX) / hw + Math.abs(dirY) / hh);
  } else {
    scale = 1 / Math.max(Math.abs(dirX) / hw, Math.abs(dirY) / hh);
  }
  return { x: cx + dirX * scale, y: cy + dirY * scale };
};

/**
 * Caja real de un nodo: el contenedor manda su tamaño guardado (es
 * redimensionable); el nodo suelto lo toma de su notación. Es el único lugar
 * donde se resuelve "cuánto mide este nodo": todo lo que dibuja o hace hit-test
 * pregunta acá y así no se desincroniza del lienzo.
 */
export function nodeBox(node: DesignerNode, notation?: NotationId): { w: number; h: number } {
  if (isContainerType(node.tipo_elemento)) {
    return {
      w: node.width || AGGREGATE_DEFAULT_WIDTH,
      h: node.height || AGGREGATE_DEFAULT_HEIGHT,
    };
  }
  return sizeOfType(node.tipo_elemento, notation);
}

/**
 * Calcula los puntos de inicio/fin de un enlace: si hay ancla del usuario la
 * punta va exacta ahí; si no, se recorta al borde de la forma apuntando al otro
 * extremo. Compartido por el trazo y por las manijas de reanclado.
 */
export function linkEndpoints(
  link: DesignerLink,
  nodes: Map<string, DesignerNode>,
  notation?: NotationId,
  /**
   * Punto al que MIRA cada extremo al recortarse. Por defecto es el centro del
   * otro nodo, que es lo correcto en línea recta; el enrutado ortogonal pasa
   * aquí la dirección de su corredor, porque si no la línea nace en un lado del
   * nodo y arranca en el eje perpendicular (se ve desprendida de la caja).
   */
  aim?: { start?: { x: number; y: number }; end?: { x: number; y: number } }
): { start: { x: number; y: number }; end: { x: number; y: number } } | null {
  const sourceNode = nodes.get(link.sourceId);
  const targetNode = nodes.get(link.targetId);
  if (!sourceNode || !targetNode) return null;
  const isContainer = (t: string) => isContainerType(t);

  const { w: sourceW, h: sourceH } = nodeBox(sourceNode, notation);
  const { w: targetW, h: targetH } = nodeBox(targetNode, notation);
  const sw = sourceW / 2;
  const sh = sourceH / 2;
  const tw = targetW / 2;
  const th = targetH / 2;
  const scx = sourceNode.x + sw;
  const scy = sourceNode.y + sh;
  const tcx = targetNode.x + tw;
  const tcy = targetNode.y + th;
  if (scx === tcx && scy === tcy && !link.sourceAnchor && !link.targetAnchor) return null;

  const sAnchorPt = link.sourceAnchor
    ? { x: sourceNode.x + link.sourceAnchor.x * (2 * sw), y: sourceNode.y + link.sourceAnchor.y * (2 * sh) }
    : null;
  const tAnchorPt = link.targetAnchor
    ? { x: targetNode.x + link.targetAnchor.x * (2 * tw), y: targetNode.y + link.targetAnchor.y * (2 * th) }
    : null;
  // Hacia dónde mira cada extremo: el corredor si lo pide, si no el otro nodo.
  const sRef = aim?.end ?? sAnchorPt ?? { x: scx, y: scy };
  const tRef = aim?.start ?? tAnchorPt ?? { x: tcx, y: tcy };

  const sShape: ShapeKind = isContainer(sourceNode.tipo_elemento) ? "rect" : shapeForType(sourceNode.tipo_elemento);
  const tShape: ShapeKind = isContainer(targetNode.tipo_elemento) ? "rect" : shapeForType(targetNode.tipo_elemento);
  // Símbolos compactos (círculo/rombo pequeño): el contorno REAL es r = altura/2,
  // no el ancho de la caja — sin esto la línea quedaría flotando antes del borde.
  const sHw = ALL_ELEMENTS[sourceNode.tipo_elemento]?.compact ? Math.min(sw, sh) : sw;
  const tHw = ALL_ELEMENTS[targetNode.tipo_elemento]?.compact ? Math.min(tw, th) : tw;
  const start = sAnchorPt ?? clipToShape(scx, scy, sHw, sh, sShape, tRef.x - scx, tRef.y - scy);
  const end = tAnchorPt ?? clipToShape(tcx, tcy, tHw, th, tShape, sRef.x - tcx, sRef.y - tcy);
  return { start, end };
}

// Quita vértices casi coincidentes y colineales: así el ÚLTIMO segmento es el
// real (la flecha orient=auto apunta bien) y el trazo queda sin dobleces redundantes.
export function simplifyPath(pts: Array<[number, number]>): Array<[number, number]> {
  const clean: Array<[number, number]> = [];
  for (const p of pts) {
    const prev = clean[clean.length - 1];
    if (prev && Math.abs(prev[0] - p[0]) < 1 && Math.abs(prev[1] - p[1]) < 1) continue;
    clean.push(p);
  }
  for (let i = clean.length - 2; i >= 1; i--) {
    const [ax, ay] = clean[i - 1];
    const [bx, by] = clean[i];
    const [cx, cy] = clean[i + 1];
    if ((ax === bx && bx === cx) || (ay === by && by === cy)) clean.splice(i, 1);
  }
  return clean;
}

/**
 * Geometría completa del enlace: extremos + trazo SVG + posición de la etiqueta.
 * En enrutado escalonado expone el doblez automático (`bend`, cuando no hay
 * puntos de quiebre) y los puntos de quiebre del usuario (`waypoints`), todos
 * arrastrables. Compartida por el componente del enlace y la capa de manijas.
 */
export function linkGeometry(
  link: DesignerLink,
  nodes: Map<string, DesignerNode>,
  notation?: NotationId
) {
  const ep = linkEndpoints(link, nodes, notation);
  if (!ep) return null;
  let { start, end } = ep;
  // Sin trazo propio manda el de la notación (C4 curva; el resto, recta).
  const routing = link.routing ?? defaultRoutingFor(notation);
  let path: string;
  let labelX = (start.x + end.x) / 2;
  let labelY = (start.y + end.y) / 2;
  let bend: { x: number; y: number } | null = null;
  let waypoints: { x: number; y: number }[] = [];

  if (routing === "curved") {
    const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const px = -(end.y - start.y) / len;
    const py = (end.x - start.x) / len;
    const bow = Math.min(80, len * 0.25);
    const cx = labelX + px * bow;
    const cy = labelY + py * bow;
    path = `M${start.x},${start.y} Q${cx},${cy} ${end.x},${end.y}`;
    // Vértice de la Bézier cuadrática en t=0.5 (para la etiqueta).
    labelX = 0.25 * start.x + 0.5 * cx + 0.25 * end.x;
    labelY = 0.25 * start.y + 0.5 * cy + 0.25 * end.y;
  } else if (routing === "orthogonal") {
    // Compat: grafos viejos usaban un único `midpoint`.
    const ways =
      link.midpoints && link.midpoints.length
        ? link.midpoints
        : link.midpoint
        ? [link.midpoint]
        : [];

    // Los tramos de un corredor ortogonal son axiales, así que los extremos
    // tienen que salir por el lado que corresponde a ESE eje. Recortar hacia el
    // centro del otro nodo —lo correcto en línea recta— hacía que la línea
    // naciera en el borde derecho y bajara en vertical, despegada de la caja.
    const s = nodes.get(link.sourceId)!;
    const t = nodes.get(link.targetId)!;
    const sb = nodeBox(s, notation);
    const tb = nodeBox(t, notation);
    const scx = s.x + sb.w / 2;
    const scy = s.y + sb.h / 2;
    const tcx = t.x + tb.w / 2;
    const tcy = t.y + tb.h / 2;
    const horizontal = Math.abs(tcx - scx) >= Math.abs(tcy - scy);
    const aim = ways.length
      ? // Con quiebres del usuario, cada extremo mira a su quiebre vecino.
        { start: ways[0], end: ways[ways.length - 1] }
      : horizontal
        ? { start: { x: tcx, y: scy }, end: { x: scx, y: tcy } }
        : { start: { x: scx, y: tcy }, end: { x: tcx, y: scy } };
    const axial = linkEndpoints(link, nodes, notation, aim);
    if (axial) {
      start = axial.start;
      end = axial.end;
      labelX = (start.x + end.x) / 2;
      labelY = (start.y + end.y) / 2;
    }
    let pts: Array<[number, number]>;
    if (ways.length === 0) {
      // Auto: un corredor según el eje dominante (esquina única sugerida).
      if (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)) {
        const cx = (start.x + end.x) / 2;
        pts = [[start.x, start.y], [cx, start.y], [cx, end.y], [end.x, end.y]];
        bend = { x: cx, y: (start.y + end.y) / 2 };
      } else {
        const cy = (start.y + end.y) / 2;
        pts = [[start.x, start.y], [start.x, cy], [end.x, cy], [end.x, end.y]];
        bend = { x: (start.x + end.x) / 2, y: cy };
      }
    } else {
      // Poli-línea que pasa por cada punto de quiebre del usuario, en orden.
      pts = [
        [start.x, start.y],
        ...ways.map((w) => [w.x, w.y] as [number, number]),
        [end.x, end.y],
      ];
      waypoints = ways;
    }
    path = "M" + simplifyPath(pts).map((p) => `${p[0]},${p[1]}`).join(" L");
  } else {
    path = `M${start.x},${start.y} L${end.x},${end.y}`;
  }

  return { start, end, path, labelX, labelY, bend, waypoints };
}
