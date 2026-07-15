// =============================================================================
// Geometría PURA del minimapa (sin React) — así se puede probar la traducción
// entre coordenadas del lienzo, del minimapa y del scroll, que es donde es fácil
// equivocarse (dividir por el zoom, escalar, etc.).
// =============================================================================

/** Escala lienzo→minimapa: el factor que hace caber CANVAS_SIZE en la caja mini. */
export function minimapScale(canvasSize: number, miniW: number, miniH: number): number {
  return Math.min(miniW / canvasSize, miniH / canvasSize);
}

/**
 * Rectángulo visible (viewport) en coordenadas del minimapa. El viewport llega en
 * píxeles de scroll; se divide por el zoom para pasar a coordenadas del lienzo y
 * luego se multiplica por la escala del mini.
 */
export function viewportRect(
  viewport: { left: number; top: number; w: number; h: number },
  zoom: number,
  scale: number
): { x: number; y: number; w: number; h: number } {
  return {
    x: (viewport.left / zoom) * scale,
    y: (viewport.top / zoom) * scale,
    w: (viewport.w / zoom) * scale,
    h: (viewport.h / zoom) * scale,
  };
}

/** Punto del minimapa (px) → coordenadas del lienzo (deshace la escala). */
export function miniPointToCanvas(
  mx: number,
  my: number,
  scale: number
): { x: number; y: number } {
  return { x: mx / scale, y: my / scale };
}
