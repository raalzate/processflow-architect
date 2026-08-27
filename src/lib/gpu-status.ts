/**
 * @fileOverview Estado de la GPU: por qué falta WebGPU y qué se puede hacer (PURO).
 *
 * Cuando el motor local no arranca, la app decía «no disponible» y nada más. El
 * usuario no sabía si era su driver, su GPU, un escritorio remoto o la lista negra
 * de Chromium; nosotros tampoco, porque no leíamos nada (#203). Un reporte como
 * «me sale esto en Windows» no se podía diagnosticar sin la máquina delante.
 *
 * Este módulo traduce lo que el proceso main puede leer —`app.getGPUFeatureStatus()`,
 * que es la misma información de `chrome://gpu`, más el vendor del adaptador
 * activo— a un veredicto y a recomendaciones accionables. Es puro: la UI pinta.
 */

/** Lo que el proceso main entrega del estado de la GPU. */
export interface DatosGpu {
  /** `app.getGPUFeatureStatus()`: feature → estado (`enabled`, `unavailable_software`…). */
  features: Record<string, string>;
  /** Descripción del adaptador WebGPU, si el renderer consiguió uno. */
  adaptador: string | null;
  /** `vendorId` PCI del adaptador activo, si se conoce. */
  vendorId: number | null;
}

/**
 * `0x1414` es Microsoft: el «Basic Render Driver», el adaptador de SOFTWARE que
 * Windows usa cuando no hay GPU o su driver no está instalado. Es el caso real que
 * disparó esto: una máquina con tres GPUs listadas, todas Basic Render Driver.
 */
const VENDOR_MICROSOFT_BASIC = 0x1414;

/** ¿El adaptador activo es el driver genérico de software de Windows? */
export const esDriverGenerico = (vendorId: number | null | undefined): boolean =>
  vendorId === VENDOR_MICROSOFT_BASIC;

export interface DiagnosticoGpu {
  /** `true`/`false` según haya WebGPU ACELERADO; `null` si no hay datos. */
  webgpuAcelerado: boolean | null;
  /** Qué explica la falta, en una frase. Ausente si no falta (o no se sabe). */
  causaProbable?: string;
  /** Qué puede hacer el usuario, en orden de utilidad. */
  recomendaciones: string[];
}

/** ¿El valor de una feature de Chromium significa «acelerado»? */
const acelerado = (estado: string | undefined): boolean =>
  !!estado && estado.startsWith("enabled");

/**
 * Veredicto y recomendaciones. Sin datos devuelve `null` en vez de suponer: decir
 * «tu GPU está mal» sin haber mirado es peor que no decir nada.
 */
export function diagnosticoGpu(datos: DatosGpu | undefined): DiagnosticoGpu {
  if (!datos) return { webgpuAcelerado: null, recomendaciones: [] };

  const webgpuAcelerado = acelerado(datos.features.webgpu);
  if (webgpuAcelerado) return { webgpuAcelerado: true, recomendaciones: [] };

  const generico = esDriverGenerico(datos.vendorId);
  const causaProbable = generico
    ? "El adaptador activo es el «Basic Render Driver» de Microsoft, que es software: este equipo no tiene una GPU utilizable (máquina virtual, escritorio remoto, o el driver de la GPU no está instalado)."
    : "La GPU está presente pero Chromium no la acelera: casi siempre es el driver (viejo, o en la lista de drivers con fallos conocidos).";

  const recomendaciones = generico
    ? [
        "Si es una máquina virtual o una sesión remota, probá la app en el equipo físico: sin GPU real no hay WebGPU.",
        "Si el equipo tiene GPU, instalá o actualizá su driver (con el Basic Render Driver activo, Windows no la está usando).",
        "Mientras tanto, activá un proveedor de IA en la nube en Ajustes: no necesita GPU y el resto de la app funciona igual.",
      ]
    : [
        "Actualizá el driver de la GPU desde el sitio del fabricante (no desde Windows Update, que suele quedarse atrás).",
        "En Windows, WebGPU necesita soporte de Direct3D 12: comprobalo con `dxdiag`.",
        "Mientras tanto, activá un proveedor de IA en la nube en Ajustes: no necesita GPU.",
      ];

  return { webgpuAcelerado: false, causaProbable, recomendaciones };
}

/** Una línea con lo que importa, para el log del arranque y la UI. */
export function resumenGpu(datos: DatosGpu | undefined): string {
  if (!datos) return "Estado de la GPU: sin datos (el proceso principal no lo reportó).";
  const partes = ["webgl", "webgpu", "gpu_compositing"].map((f) => {
    const estado = datos.features[f] ?? "desconocido";
    return `${f}=${acelerado(estado) ? "acelerado" : `software/no acelerado (${estado})`}`;
  });
  const adaptador = datos.adaptador ? ` · adaptador: ${datos.adaptador}` : " · sin adaptador WebGPU";
  const vendor = datos.vendorId != null ? ` · vendor 0x${datos.vendorId.toString(16)}` : "";
  return `Estado de la GPU: ${partes.join(" · ")}${adaptador}${vendor}`;
}
