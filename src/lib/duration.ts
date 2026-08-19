/**
 * @fileOverview Duración legible para el usuario (PURO).
 *
 * El agente local puede tardar minutos en una corrida (cada turno es una
 * generación completa sobre WebGPU). Un spinner sin número no distingue «va
 * lento» de «se colgó», y esa diferencia es la que decide si el usuario espera o
 * reinicia la app.
 */

/**
 * Formatea milisegundos como `45s`, `2m 07s` o `1h 03m`. Se corta en la unidad
 * que importa: al pasar el minuto, los segundos se muestran con dos dígitos para
 * que el número no salte de ancho cada segundo.
 */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor((ms || 0) / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
