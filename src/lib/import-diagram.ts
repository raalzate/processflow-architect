/**
 * @fileOverview Parseo/validación de un diagrama JSON (GraphData) importado.
 *
 * Lógica PURA compartida por el botón «Importar diagrama» del header y la zona
 * de drag & drop de la pantalla de bienvenida. Valida lo mínimo para que
 * `handleCreateProjectFromContent` (que rellena defaults) no reciba basura, y
 * produce mensajes de error en español listos para el toast.
 */

import type { GraphData } from "./types";

export interface ParsedDiagram {
  /** Nombre propuesto para el proyecto (del JSON o del nombre de archivo). */
  name: string;
  content: GraphData;
}

/**
 * Parsea el texto de un archivo .json y valida que tenga forma de diagrama.
 * @param raw      Contenido del archivo.
 * @param fileName Nombre del archivo (fallback para el nombre del proyecto).
 * @throws Error con mensaje en español si no es JSON o no parece GraphData.
 */
export function parseDiagramJson(raw: string, fileName = ""): ParsedDiagram {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("El archivo no es un JSON válido.");
  }
  return validateGraphData(data, fileName);
}

/**
 * Valida un objeto YA parseado como GraphData y propone un nombre. Se separa de
 * `parseDiagramJson` para que el archivo del tablero (`board-file.ts`) valide su
 * `proyecto` sin volver a serializar y re-parsear.
 * @throws Error en español si no parece GraphData.
 */
export function validateGraphData(data: unknown, fileName = ""): ParsedDiagram {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("El JSON no es un objeto de diagrama.");
  }
  const obj = data as Record<string, unknown>;
  // Forma mínima de GraphData: al menos big_picture o agregados presentes.
  if (!("big_picture" in obj) && !("agregados" in obj)) {
    throw new Error(
      "El archivo no tiene forma de diagrama (GraphData): faltan «big_picture» y «agregados»."
    );
  }
  if ("agregados" in obj && obj.agregados != null && !Array.isArray(obj.agregados)) {
    throw new Error("El campo «agregados» debe ser una lista.");
  }
  const name =
    (typeof obj.nombre_proyecto === "string" && obj.nombre_proyecto.trim()) ||
    fileName.replace(/\.json$/i, "").trim() ||
    "Diagrama importado";
  return { name, content: obj as unknown as GraphData };
}

/**
 * Rellena un GraphData importado con los defaults mínimos SIN perder campos.
 *
 * Lo usan tanto la importación de un `.json` exportado (un GraphData completo)
 * como la carga de contenido generado por la IA (`DomainAnalysis`, que llega sin
 * los escalares del proyecto). La clave es partir de `raw` y sólo COMPLETAR lo
 * ausente: si en vez de eso se reconstruye con una lista blanca de campos, el
 * round-trip export→import pierde en silencio `defaultRouting` y `source_docs`
 * —y cualquier campo futuro de GraphData— (issue #423). Los documentos fuente
 * viajan DENTRO del proyecto justo para que las citas «Fuente: …» se resuelvan
 * tras exportar/compartir/importar.
 *
 * @param raw          Contenido parseado (puede ser parcial).
 * @param fallbackName Nombre para el proyecto si el JSON no trae `nombre_proyecto`.
 */
export function normalizeImportedGraphData(
  raw: Partial<GraphData> | null | undefined,
  fallbackName: string
): GraphData {
  const obj = (raw ?? {}) as Partial<GraphData>;
  const bp = (obj.big_picture ?? {}) as Partial<GraphData["big_picture"]>;
  return {
    // Preserva todo lo que traiga el documento (notation, defaultRouting,
    // source_docs y cualquier campo nuevo); los defaults de abajo sólo pisan lo
    // que falte o venga vacío.
    ...obj,
    nombre_proyecto: (obj.nombre_proyecto || "").trim() || fallbackName,
    version: obj.version || "1.0.0",
    fecha_analisis: obj.fecha_analisis || new Date().toISOString().slice(0, 10),
    big_picture: {
      ...bp,
      descripcion: bp.descripcion || "",
      hotspots: bp.hotspots || [],
      nodos: bp.nodos || [],
      aristas: bp.aristas || [],
    },
    agregados: obj.agregados || [],
    read_models: obj.read_models || [],
    politicas_inter_agregados: obj.politicas_inter_agregados || [],
    responsables: obj.responsables || [],
    notas: obj.notas || "",
    transcript: obj.transcript || "",
  };
}

/** ¿El archivo (por nombre/tipo MIME) parece un JSON importable? */
export function isJsonFile(file: { name?: string; type?: string }): boolean {
  if (file.type === "application/json") return true;
  return /\.json$/i.test(file.name || "");
}
