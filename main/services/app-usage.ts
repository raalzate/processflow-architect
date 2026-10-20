/**
 * @fileOverview Muestra cruda del consumo de la app para el indicador de IA local (#602).
 *
 * Sólo números de procesos propios (sin rutas ni datos del usuario). El resumen
 * —CPU del equipo, memoria, semáforo— lo hace `src/lib/ai/resource-usage.ts`,
 * que es puro y tiene pruebas.
 */

import { app } from 'electron';
import os from 'os';

export interface AppUsageSample {
  nucleos: number;
  ramTotalMB: number;
  procesos: { tipo: string; cpuPct: number; memKB: number }[];
}

export function getAppUsage(): AppUsageSample {
  return {
    nucleos: os.cpus().length,
    ramTotalMB: Math.round(os.totalmem() / 1024 ** 2),
    procesos: app.getAppMetrics().map((m) => ({
      tipo: m.type,
      cpuPct: m.cpu.percentCPUUsage,
      memKB: m.memory.workingSetSize,
    })),
  };
}
