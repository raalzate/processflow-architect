/**
 * @fileOverview Información del sistema para la vista de Configuración.
 *
 * Todo lo que requiere Node/Electron (os, fs, versiones) se lee AQUÍ en el main;
 * el renderer complementa con lo que sólo él conoce (adaptador WebGPU). El espacio
 * en disco se mide sobre userData porque ahí viven los modelos .litertlm.
 */

import { app } from 'electron';
import os from 'os';
import fs from 'fs';

export interface SystemInfo {
  /** SO legible (p.ej. "macOS 14.5" / "Windows 11") + kernel y arquitectura. */
  osName: string;
  osVersion: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalRamGB: number;
  freeRamGB: number;
  /** Espacio del volumen donde viven los modelos (userData). */
  diskTotalGB: number | null;
  diskFreeGB: number | null;
  /** Versiones del runtime (diagnóstico: WebGPU depende del Chromium embebido). */
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  /** Carpeta de datos de la app (modelos, llaves cifradas). */
  userDataPath: string;
}

const gb = (bytes: number) => Math.round((bytes / 1024 ** 3) * 10) / 10;

/** Nombre comercial del SO (mejor que "Darwin"/"Windows_NT" para el usuario). */
function prettyOsName(): string {
  if (process.platform === 'darwin') return 'macOS';
  if (process.platform === 'win32') return 'Windows';
  if (process.platform === 'linux') return 'Linux';
  return os.type();
}

export function getSystemInfo(): SystemInfo {
  const cpus = os.cpus();

  // statfsSync puede no existir en runtimes viejos → el disco queda como "n/d".
  let diskTotalGB: number | null = null;
  let diskFreeGB: number | null = null;
  try {
    const st = fs.statfsSync(app.getPath('userData'));
    diskTotalGB = gb(st.blocks * st.bsize);
    diskFreeGB = gb(st.bavail * st.bsize);
  } catch {
    /* sin datos de disco */
  }

  return {
    osName: prettyOsName(),
    // getSystemVersion da la versión comercial (p.ej. "14.5"); os.release el kernel.
    osVersion: process.getSystemVersion?.() ?? os.release(),
    arch: process.arch,
    cpuModel: cpus[0]?.model?.trim() ?? 'desconocido',
    cpuCores: cpus.length,
    totalRamGB: gb(os.totalmem()),
    freeRamGB: gb(os.freemem()),
    diskTotalGB,
    diskFreeGB,
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? '',
    chromeVersion: process.versions.chrome ?? '',
    nodeVersion: process.versions.node ?? '',
    userDataPath: app.getPath('userData'),
  };
}
