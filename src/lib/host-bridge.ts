/**
 * @fileOverview Puente con el host de la app (PURO): el único lugar que sabe en qué corre.
 *
 * El renderer es el mismo en escritorio y —según ADR 0005— en la edición web. Lo
 * que cambia es quién atiende lo que el navegador no puede hacer solo: el proceso
 * main de Electron (por `preload.ts`) o un backend. Antes, 24 archivos leían
 * `window.electronAPI` a mano; cada uno era un punto donde la versión web tenía que
 * meter un `if`. Ahora todos piden el puente acá y la regla PUENTE del lint impide
 * volver a leerlo en otro sitio.
 *
 * Dos reglas:
 *
 * - **Se lee en cada llamada**, nunca se cachea al importar: el preload puede
 *   exponerse después de que el módulo cargó, y los tests cambian el global.
 * - **Una capacidad ausente es un método ausente.** El adaptador web implementa
 *   sólo lo que tiene (IA remota, portapapeles…) y la UI pregunta por la
 *   capacidad, no por el host. Así, una pantalla que pide `capacidadesHost().mcpServidor`
 *   funciona igual en los dos sin saber cuál es cuál.
 *
 * Única excepción: la barra de título propia pregunta `hostKind() === "desktop"`.
 * No es algo que el host *haga* sino el marco de la ventana, y en el navegador no hay
 * marco nativo que reemplazar.
 */

import type { ElectronAPI } from "@/types/electron";

/**
 * Lo que el host puede hacer por el renderer. Hoy coincide con lo que expone el
 * preload; un adaptador web implementa un subconjunto (ver `setHostBridge`).
 */
export type HostBridge = ElectronAPI;

/** Quién atiende: el escritorio (preload), un adaptador inyectado, o nadie (SSR/tests). */
export type HostKind = "desktop" | "web" | "none";

let inyectado: Partial<HostBridge> | null = null;

/**
 * Inyecta el puente de un host que no es Electron (la edición web lo hace al
 * arrancar). `null` lo quita y vuelve al preload. Manda sobre el preload a
 * propósito: así un test o un modo «web» puede ejercitarse dentro del escritorio.
 */
export function setHostBridge(bridge: Partial<HostBridge> | null): void {
  inyectado = bridge;
}

function delPreload(): HostBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as { electronAPI?: HostBridge }).electronAPI;
}

/**
 * El puente vigente, o `undefined` si no hay host. El tipo es el del escritorio:
 * con un adaptador inyectado los métodos que no implementa llegan `undefined`,
 * por eso quien llame un método opcional lo hace con `?.`.
 */
export function hostBridge(): HostBridge | undefined {
  return (inyectado as HostBridge | null) ?? delPreload();
}

export function hostKind(): HostKind {
  if (inyectado) return "web";
  return delPreload() ? "desktop" : "none";
}

/** Qué puede hacer el host. La UI decide qué mostrar con esto, no con `hostKind`. */
export interface CapacidadesHost {
  /** Descargar y gestionar modelos LiteRT en disco. */
  modelosLocales: boolean;
  /** Servidor MCP embebido: consultar su estado y arrancarlo (entrega al agente). */
  mcpServidor: boolean;
  /** Playground del MCP: listar y llamar herramientas sin cliente externo. */
  mcpPlayground: boolean;
  /** Actualizaciones de la app instalada. */
  updater: boolean;
  /** Chat con Claude Code / Codex: lanzar corridas y consultar qué CLI hay. */
  chatCli: boolean;
  /** El CLI como motor de texto del router (feature 021). */
  motorCli: boolean;
  /** Generación con un proveedor de nube; la llave vive en el host, nunca acá. */
  iaRemota: boolean;
  /** Exportar a PDF desde el host. */
  pdf: boolean;
  /** Rasterizar una región del lienzo. */
  captura: boolean;
  portapapeles: boolean;
  /** Información del equipo (Configuración → Sistema). */
  sistema: boolean;
  /** Menú nativo de la ventana (Windows/Linux). */
  menuNativo: boolean;
}

export const SIN_CAPACIDADES: CapacidadesHost = Object.freeze({
  modelosLocales: false,
  mcpServidor: false,
  mcpPlayground: false,
  updater: false,
  chatCli: false,
  motorCli: false,
  iaRemota: false,
  pdf: false,
  captura: false,
  portapapeles: false,
  sistema: false,
  menuNativo: false,
});

/**
 * Capacidades de un puente dado (puro: se prueba sin `window`). Cada una exige
 * TODOS los métodos que usa la pantalla que la consulta: con uno solo, un
 * adaptador parcial mostraría una pantalla que se rompe al primer clic.
 */
export function capacidadesDe(bridge: Partial<HostBridge> | undefined): CapacidadesHost {
  if (!bridge) return SIN_CAPACIDADES;
  const tiene = (k: keyof HostBridge) => typeof bridge[k] === "function";
  return {
    modelosLocales: tiene("litertModelsList"),
    mcpServidor: tiene("mcpServerStatus") && tiene("mcpServerStart"),
    mcpPlayground: tiene("mcpPlaygroundListTools") && tiene("mcpPlaygroundCall"),
    updater: tiene("checkForUpdates"),
    chatCli: tiene("agentCliSend") && tiene("agentCliStatus"),
    motorCli: tiene("agentCliGenerate"),
    iaRemota: tiene("remoteGenerate"),
    pdf: tiene("generatePdf"),
    captura: tiene("captureCanvas"),
    portapapeles: tiene("copyToClipboard"),
    sistema: tiene("systemInfo"),
    menuNativo: tiene("windowMenuPopup"),
  };
}

/** Capacidades del host vigente. */
export const capacidadesHost = (): CapacidadesHost => capacidadesDe(hostBridge());
