import {
  TerminalSquare, Zap, User, RectangleHorizontal, Gavel,
  HardDrive, Package, Milestone
} from "lucide-react";

export const nodeTypeColors: { [key: string]: string } = {
  Comando: "bg-blue-500",
  Evento: "bg-orange-500",
  Actor: "bg-emerald-500",
  Vista: "bg-cyan-500",
  "Regla de Negocio": "bg-yellow-500",
  "Sistema Externo": "bg-indigo-500",
  Agregado: "bg-pink-500",
  "Política": "bg-purple-500",
};

export const nodeTypeIcons: Record<string, React.ElementType> = {
  Comando: TerminalSquare,
  Evento: Zap,
  Actor: User,
  Vista: RectangleHorizontal,
  "Regla de Negocio": Gavel,
  "Sistema Externo": HardDrive,
  Agregado: Package,
  "Política": Milestone,
};

// Constantes para LocalStorage
export const STORAGE_API_KEY = "gemini_api_key";
export const STORAGE_MODEL = "gemini_model";
export const STORAGE_SAVED_FILES = "saved_json_files";
export const STORAGE_LAST_FILE_ID = "last_opened_file_id";
export const STORAGE_TOKEN_USAGE = "token_usage";
export const STORAGE_TOKEN_LIMIT = "token_limit";