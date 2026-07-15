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

/** ¿El archivo (por nombre/tipo MIME) parece un JSON importable? */
export function isJsonFile(file: { name?: string; type?: string }): boolean {
  if (file.type === "application/json") return true;
  return /\.json$/i.test(file.name || "");
}
