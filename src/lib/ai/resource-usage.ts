/**
 * @fileOverview Consumo de recursos de la app mientras corre la IA local (#602).
 *
 * El main manda la muestra cruda de `app.getAppMetrics()` (un registro por
 * proceso); acá se resume a lo que el humano entiende de un vistazo. Se mide la
 * app ENTERA y no sólo el renderer porque LiteRT-LM trabaja sobre WebGPU: el peso
 * real del modelo cae en el proceso GPU, no en la pestaña.
 */

import type { AiMode } from "./remote-settings";

/** Un proceso de la app tal como lo informa Electron (espejo del IPC `app-usage`). */
export interface ProcesoUso {
  /** Tipo de proceso de Chromium: Browser, Tab, GPU, Utility… */
  tipo: string;
  /** % de UN núcleo desde la muestra anterior: en multinúcleo pasa de 100. */
  cpuPct: number;
  /** Memoria residente (working set) en KB. */
  memKB: number;
}

export interface MuestraUso {
  nucleos: number;
  ramTotalMB: number;
  procesos: ProcesoUso[];
}

export type NivelUso = "bajo" | "medio" | "alto";

export interface ResumenUso {
  /** % del equipo (todos los núcleos), 0–100. */
  cpuPct: number;
  /** Memoria de toda la app, en MB. */
  ramMB: number;
  /** Memoria del proceso GPU, donde vive el modelo local. */
  gpuMB: number;
  /** Fracción de la RAM del equipo que usa la app; null si no se conoce el total. */
  ramPct: number | null;
  nivel: NivelUso;
}

/** Umbrales del semáforo: medio desde 60 %, alto desde 85 %. */
const UMBRAL_MEDIO = 60;
const UMBRAL_ALTO = 85;

const acotar = (n: number) => Math.min(100, Math.max(0, n));

export function resumirUso(m: MuestraUso): ResumenUso {
  const cpuCruda = m.procesos.reduce((s, p) => s + (Number(p.cpuPct) || 0), 0);
  const cpuPct = Math.round(acotar(cpuCruda / Math.max(1, m.nucleos)));
  const ramMB = Math.round(m.procesos.reduce((s, p) => s + (Number(p.memKB) || 0), 0) / 1024);
  const gpuMB = Math.round(
    m.procesos.filter((p) => p.tipo === "GPU").reduce((s, p) => s + (Number(p.memKB) || 0), 0) / 1024
  );
  const ramPct = m.ramTotalMB > 0 ? Math.round(acotar((ramMB / m.ramTotalMB) * 100)) : null;
  const peor = Math.max(cpuPct, ramPct ?? 0);
  const nivel: NivelUso = peor >= UMBRAL_ALTO ? "alto" : peor >= UMBRAL_MEDIO ? "medio" : "bajo";
  return { cpuPct, ramMB, gpuMB, ramPct, nivel };
}

export function formatearMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

/**
 * El indicador es del motor LOCAL: en modo nube o CLI el trabajo pesado corre
 * fuera del equipo y mostrar el consumo confundiría. `hybrid` cuenta porque las
 * tareas ligeras siguen en LiteRT.
 */
export function debeMostrarUso(modo: AiMode, puedeMedir: boolean): boolean {
  return puedeMedir && (modo === "local" || modo === "hybrid");
}
