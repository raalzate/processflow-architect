import { ALL_ELEMENTS, swatchClass } from "./notations";

/**
 * Color del punto/swatch de un tipo en los paneles del visor, para CUALQUIER
 * notación: se deriva del registro de notaciones en vez de una tabla DDD de 8
 * entradas (antes un nodo BPMN/C4/UML salía gris "sin tipo").
 *
 * El relleno del lienzo es un tinte suave (-50/-100) que como punto de 8px sería
 * invisible: se sube al tono -500 de la MISMA familia para que el punto tenga
 * contraste y siga casando con el color del nodo.
 */
export const nodeTypeColors: { [key: string]: string } = Object.fromEntries(
  Object.entries(ALL_ELEMENTS).map(([type, el]) => [
    type,
    swatchClass(el).replace(/-\d+$/, "-500"),
  ])
);

/** Color del swatch con fallback gris para tipos libres (fuera del registro). */
export const nodeTypeColor = (type: string): string => nodeTypeColors[type] ?? "bg-gray-400";

// Constantes para LocalStorage
export const STORAGE_API_KEY = "gemini_api_key";
export const STORAGE_MODEL = "gemini_model";
export const STORAGE_SAVED_FILES = "saved_json_files";
export const STORAGE_LAST_FILE_ID = "last_opened_file_id";
export const STORAGE_TOKEN_USAGE = "token_usage";
export const STORAGE_TOKEN_LIMIT = "token_limit";